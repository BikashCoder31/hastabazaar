import {
  getBusinessSettingDefinition,
  validateBusinessSettingValue,
} from '../../configuration/definitions';
import { assertBusinessSettingPublicationReady } from '../../configuration/capabilities';
import type {
  BusinessSettingChangeControl,
  BusinessSettingKey,
  BusinessSettingValue,
} from '../../configuration/types';

export class BusinessSettingConflictError extends Error {}

export type BusinessSettingVersionStatus =
  | 'draft'
  | 'pending_approval'
  | 'published'
  | 'rejected'
  | 'cancelled';

type BusinessSettingRow = {
  id: string;
  settingKey: BusinessSettingKey;
  version: number;
  valueJson: string;
  status: BusinessSettingVersionStatus;
  revision: number;
  changeControl: BusinessSettingChangeControl;
  effectiveFrom: number | null;
  effectiveUntil: number | null;
  reason: string;
  createdBy: string;
  createdAt: number;
  submittedBy: string | null;
  submittedAt: number | null;
  approvedBy: string | null;
  approvedAt: number | null;
  publishedBy: string | null;
  publishedAt: number | null;
  decisionNote: string | null;
  supersedesId: string | null;
  lastRequestId: string;
};

export type BusinessSettingVersion<K extends BusinessSettingKey = BusinessSettingKey> =
  Omit<BusinessSettingRow, 'settingKey' | 'valueJson'> & {
    key: K;
    value: BusinessSettingValue<K>;
  };

export type EffectiveBusinessSetting<K extends BusinessSettingKey> = Readonly<{
  key: K;
  value: BusinessSettingValue<K>;
  source: 'default' | 'persisted';
  version: number | null;
  versionId: string | null;
  effectiveFrom: number | null;
  approvedBy: string | null;
}>;

const selectColumns = `
  id, setting_key AS settingKey, version, value_json AS valueJson,
  status, revision, change_control AS changeControl,
  effective_from AS effectiveFrom, effective_until AS effectiveUntil,
  reason, created_by AS createdBy, created_at AS createdAt,
  submitted_by AS submittedBy, submitted_at AS submittedAt,
  approved_by AS approvedBy, approved_at AS approvedAt,
  published_by AS publishedBy, published_at AS publishedAt,
  decision_note AS decisionNote, supersedes_id AS supersedesId,
  last_request_id AS lastRequestId`;

function normalizeReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 8 || reason.length > 1_000) {
    throw new RangeError('Add a reason of 8–1,000 characters.');
  }
  return reason;
}

function validateRequestId(value: string): string {
  const requestId = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/.test(requestId)) {
    throw new RangeError('Request ID must be 4–120 safe characters.');
  }
  return requestId;
}

function timestamp(label: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer timestamp.`);
  }
  return value;
}

function parseRow<K extends BusinessSettingKey>(
  row: BusinessSettingRow,
): BusinessSettingVersion<K> {
  const key = row.settingKey as K;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.valueJson);
  } catch {
    throw new BusinessSettingConflictError(
      `Stored business setting ${row.id} contains invalid JSON.`,
    );
  }
  const value = validateBusinessSettingValue(key, parsed);
  const { settingKey: _settingKey, valueJson: _valueJson, ...metadata } = row;
  return { ...metadata, key, value };
}

async function getVersionById(
  database: D1Database,
  id: string,
): Promise<BusinessSettingVersion | null> {
  const row = await database
    .prepare(`SELECT ${selectColumns} FROM business_setting_versions WHERE id = ?`)
    .bind(id)
    .first<BusinessSettingRow>();
  return row ? parseRow(row) : null;
}

function guard(
  database: D1Database,
  predicate: string,
  values: readonly unknown[],
): D1PreparedStatement[] {
  const id = crypto.randomUUID();
  return [
    database
      .prepare(
        `INSERT INTO business_setting_guards (id, valid)
         SELECT ?, CASE WHEN ${predicate} THEN 1 ELSE 0 END`,
      )
      .bind(id, ...values),
    database.prepare('DELETE FROM business_setting_guards WHERE id = ?').bind(id),
  ];
}

async function atomic(
  database: D1Database,
  statements: D1PreparedStatement[],
): Promise<void> {
  try {
    await database.batch(statements);
  } catch {
    throw new BusinessSettingConflictError(
      'The business setting changed concurrently or no longer permits this action.',
    );
  }
}

function audit(
  database: D1Database,
  input: {
    actorId: string;
    action: string;
    subjectId: string;
    reason: string;
    previous: unknown;
    next: unknown;
    requestId: string;
    now: number;
  },
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO audit_logs (
        id, actor_id, action, subject_type, subject_id, reason,
        previous_json, next_json, request_id, ip_hash, created_at
      ) VALUES (?, ?, ?, 'business_setting', ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.actorId,
      input.action,
      input.subjectId,
      input.reason,
      JSON.stringify(input.previous),
      JSON.stringify(input.next),
      input.requestId,
      input.now,
    );
}

async function latestPublished(
  database: D1Database,
  key: BusinessSettingKey,
): Promise<{ id: string; effectiveFrom: number } | null> {
  return database
    .prepare(
      `SELECT id, effective_from AS effectiveFrom
       FROM business_setting_versions
       WHERE setting_key = ? AND status = 'published'
       ORDER BY effective_from DESC LIMIT 1`,
    )
    .bind(key)
    .first<{ id: string; effectiveFrom: number }>();
}

function publicationStatements(
  database: D1Database,
  input: {
    record: BusinessSettingVersion;
    actorId: string;
    expectedRevision: number;
    effectiveFrom: number;
    reason: string;
    requestId: string;
    now: number;
    fromStatus: 'draft' | 'pending_approval';
    approved: boolean;
  },
): D1PreparedStatement[] {
  const nextRevision = input.expectedRevision + 1;
  return [
    ...guard(
      database,
      `EXISTS (
         SELECT 1 FROM business_setting_versions
         WHERE id = ? AND status = ? AND revision = ?
       ) AND NOT EXISTS (
         SELECT 1 FROM business_setting_versions
         WHERE setting_key = ? AND status = 'published' AND effective_from >= ?
       )`,
      [
        input.record.id,
        input.fromStatus,
        input.expectedRevision,
        input.record.key,
        input.effectiveFrom,
      ],
    ),
    database
      .prepare(
        `UPDATE business_setting_versions
         SET effective_until = ?
         WHERE setting_key = ? AND status = 'published'
           AND effective_until IS NULL AND effective_from < ?`,
      )
      .bind(input.effectiveFrom, input.record.key, input.effectiveFrom),
    database
      .prepare(
        `UPDATE business_setting_versions
         SET status = 'published', revision = revision + 1,
           effective_from = ?, effective_until = NULL,
           approved_by = CASE WHEN ? = 1 THEN ? ELSE approved_by END,
           approved_at = CASE WHEN ? = 1 THEN ? ELSE approved_at END,
           published_by = ?, published_at = ?, decision_note = ?,
           last_request_id = ?
         WHERE id = ? AND status = ? AND revision = ?`,
      )
      .bind(
        input.effectiveFrom,
        input.approved ? 1 : 0,
        input.actorId,
        input.approved ? 1 : 0,
        input.now,
        input.actorId,
        input.now,
        input.reason,
        input.requestId,
        input.record.id,
        input.fromStatus,
        input.expectedRevision,
      ),
    ...guard(
      database,
      `EXISTS (
        SELECT 1 FROM business_setting_versions
        WHERE id = ? AND status = 'published' AND revision = ?
          AND last_request_id = ?
      )`,
      [input.record.id, nextRevision, input.requestId],
    ),
    audit(database, {
      actorId: input.actorId,
      action: input.approved
        ? 'business_setting.approved'
        : 'business_setting.published',
      subjectId: input.record.id,
      reason: input.reason,
      previous: input.record,
      next: {
        status: 'published',
        revision: nextRevision,
        effectiveFrom: input.effectiveFrom,
      },
      requestId: input.requestId,
      now: input.now,
    }),
  ];
}

async function assertChronologicalPublication(
  database: D1Database,
  key: BusinessSettingKey,
  effectiveFrom: number,
): Promise<void> {
  const latest = await latestPublished(database, key);
  if (latest && latest.effectiveFrom >= effectiveFrom) {
    throw new BusinessSettingConflictError(
      'A published or scheduled version already starts at or after this effective date.',
    );
  }
}

export async function createBusinessSettingDraft<K extends BusinessSettingKey>(
  database: D1Database,
  options: {
    key: K;
    value: unknown;
    actorId: string;
    reason: string;
    requestId: string;
    now: number;
    supersedesId?: string | null;
  },
): Promise<BusinessSettingVersion<K>> {
  const definition = getBusinessSettingDefinition(options.key);
  const value = validateBusinessSettingValue(options.key, options.value);
  const reason = normalizeReason(options.reason);
  const requestId = validateRequestId(options.requestId);
  const now = timestamp('Current time', options.now);
  const existing = await database
    .prepare(`SELECT ${selectColumns} FROM business_setting_versions WHERE last_request_id = ?`)
    .bind(requestId)
    .first<BusinessSettingRow>();
  if (existing) {
    const parsed = parseRow<K>(existing);
    if (parsed.key === options.key && JSON.stringify(parsed.value) === JSON.stringify(value)) {
      return parsed;
    }
    throw new BusinessSettingConflictError('Request ID was already used for another change.');
  }
  const latest = await database
    .prepare(
      `SELECT COALESCE(MAX(version), 0) AS version
       FROM business_setting_versions WHERE setting_key = ?`,
    )
    .bind(options.key)
    .first<{ version: number }>();
  const version = Number(latest?.version ?? 0) + 1;
  const id = crypto.randomUUID();
  try {
    await database
      .prepare(
        `INSERT INTO business_setting_versions (
          id, setting_key, version, value_json, status, revision,
          change_control, reason, created_by, created_at,
          supersedes_id, last_request_id
        ) VALUES (?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        options.key,
        version,
        JSON.stringify(value),
        definition.changeControl,
        reason,
        options.actorId,
        now,
        options.supersedesId ?? null,
        requestId,
      )
      .run();
  } catch {
    throw new BusinessSettingConflictError(
      'The business setting draft conflicts with a concurrent change.',
    );
  }
  const created = await getVersionById(database, id);
  if (!created) throw new BusinessSettingConflictError('Draft creation could not be verified.');
  return created as BusinessSettingVersion<K>;
}

export async function publishBusinessSettingDraft(
  database: D1Database,
  options: {
    id: string;
    actorId: string;
    expectedRevision: number;
    effectiveFrom: number;
    reason: string;
    requestId: string;
    now: number;
    simulationAllowed?: boolean;
  },
): Promise<void> {
  const record = await getVersionById(database, options.id);
  const reason = normalizeReason(options.reason);
  const requestId = validateRequestId(options.requestId);
  const now = timestamp('Current time', options.now);
  const effectiveFrom = timestamp('Effective date', options.effectiveFrom);
  if (!record || record.status !== 'draft' || record.revision !== options.expectedRevision) {
    throw new BusinessSettingConflictError('Refresh the current draft before publishing.');
  }
  if (record.changeControl !== 'simple') {
    throw new BusinessSettingConflictError(
      'Controlled settings require submission and independent approval.',
    );
  }
  assertBusinessSettingPublicationReady(record.key, record.value, { simulationAllowed: options.simulationAllowed });
  if (effectiveFrom < now) {
    throw new BusinessSettingConflictError('Effective date cannot be in the past.');
  }
  if (
    record.key === 'independent_seller_commission_bps' &&
    effectiveFrom < now + 15 * 86_400_000
  ) {
    throw new BusinessSettingConflictError(
      'Independent seller commission changes require at least 15 calendar days notice and renewed acceptance.',
    );
  }
  await assertChronologicalPublication(database, record.key, effectiveFrom);
  await atomic(
    database,
    publicationStatements(database, {
      record,
      actorId: options.actorId,
      expectedRevision: options.expectedRevision,
      effectiveFrom,
      reason,
      requestId,
      now,
      fromStatus: 'draft',
      approved: false,
    }),
  );
}

export async function submitBusinessSettingDraft(
  database: D1Database,
  options: {
    id: string;
    actorId: string;
    expectedRevision: number;
    reason: string;
    requestId: string;
    now: number;
  },
): Promise<void> {
  const record = await getVersionById(database, options.id);
  const reason = normalizeReason(options.reason);
  const requestId = validateRequestId(options.requestId);
  const now = timestamp('Current time', options.now);
  if (
    !record ||
    record.status !== 'draft' ||
    record.revision !== options.expectedRevision ||
    record.changeControl !== 'controlled'
  ) {
    throw new BusinessSettingConflictError('Only a current controlled draft can be submitted.');
  }
  const nextRevision = options.expectedRevision + 1;
  await atomic(database, [
    ...guard(
      database,
      `EXISTS (
        SELECT 1 FROM business_setting_versions
        WHERE id = ? AND status = 'draft' AND revision = ?
          AND change_control = 'controlled'
      )`,
      [record.id, options.expectedRevision],
    ),
    database
      .prepare(
        `UPDATE business_setting_versions
         SET status = 'pending_approval', revision = revision + 1,
           submitted_by = ?, submitted_at = ?, decision_note = ?,
           last_request_id = ?
         WHERE id = ? AND status = 'draft' AND revision = ?`,
      )
      .bind(
        options.actorId,
        now,
        reason,
        requestId,
        record.id,
        options.expectedRevision,
      ),
    ...guard(
      database,
      `EXISTS (
        SELECT 1 FROM business_setting_versions
        WHERE id = ? AND status = 'pending_approval' AND revision = ?
          AND last_request_id = ?
      )`,
      [record.id, nextRevision, requestId],
    ),
    audit(database, {
      actorId: options.actorId,
      action: 'business_setting.submitted',
      subjectId: record.id,
      reason,
      previous: record,
      next: { status: 'pending_approval', revision: nextRevision },
      requestId,
      now,
    }),
  ]);
}

export async function approveBusinessSettingChange(
  database: D1Database,
  options: {
    id: string;
    actorId: string;
    expectedRevision: number;
    effectiveFrom: number;
    reason: string;
    requestId: string;
    now: number;
    simulationAllowed?: boolean;
  },
): Promise<void> {
  const record = await getVersionById(database, options.id);
  const reason = normalizeReason(options.reason);
  const requestId = validateRequestId(options.requestId);
  const now = timestamp('Current time', options.now);
  const effectiveFrom = timestamp('Effective date', options.effectiveFrom);
  if (
    !record ||
    record.status !== 'pending_approval' ||
    record.revision !== options.expectedRevision ||
    !record.submittedBy ||
    record.submittedBy === options.actorId
  ) {
    throw new BusinessSettingConflictError(
      'A different reviewer must approve the current pending version.',
    );
  }
  assertBusinessSettingPublicationReady(record.key, record.value, { simulationAllowed: options.simulationAllowed });
  if (effectiveFrom < now) {
    throw new BusinessSettingConflictError('Effective date cannot be in the past.');
  }
  if (
    record.key === 'independent_seller_commission_bps' &&
    effectiveFrom < now + 15 * 86_400_000
  ) {
    throw new BusinessSettingConflictError(
      'Independent seller commission changes require at least 15 calendar days notice and renewed acceptance.',
    );
  }
  await assertChronologicalPublication(database, record.key, effectiveFrom);
  await atomic(
    database,
    publicationStatements(database, {
      record,
      actorId: options.actorId,
      expectedRevision: options.expectedRevision,
      effectiveFrom,
      reason,
      requestId,
      now,
      fromStatus: 'pending_approval',
      approved: true,
    }),
  );
}

export async function rejectBusinessSettingChange(
  database: D1Database,
  options: {
    id: string;
    actorId: string;
    expectedRevision: number;
    reason: string;
    requestId: string;
    now: number;
  },
): Promise<void> {
  const record = await getVersionById(database, options.id);
  const reason = normalizeReason(options.reason);
  const requestId = validateRequestId(options.requestId);
  const now = timestamp('Current time', options.now);
  if (
    !record ||
    record.status !== 'pending_approval' ||
    record.revision !== options.expectedRevision ||
    !record.submittedBy ||
    record.submittedBy === options.actorId
  ) {
    throw new BusinessSettingConflictError(
      'A different reviewer must reject the current pending version.',
    );
  }
  const nextRevision = options.expectedRevision + 1;
  await atomic(database, [
    ...guard(
      database,
      `EXISTS (
        SELECT 1 FROM business_setting_versions
        WHERE id = ? AND status = 'pending_approval' AND revision = ?
          AND submitted_by <> ?
      )`,
      [record.id, options.expectedRevision, options.actorId],
    ),
    database
      .prepare(
        `UPDATE business_setting_versions
         SET status = 'rejected', revision = revision + 1,
           approved_by = ?, approved_at = ?, decision_note = ?,
           last_request_id = ?
         WHERE id = ? AND status = 'pending_approval' AND revision = ?`,
      )
      .bind(
        options.actorId,
        now,
        reason,
        requestId,
        record.id,
        options.expectedRevision,
      ),
    ...guard(
      database,
      `EXISTS (
        SELECT 1 FROM business_setting_versions
        WHERE id = ? AND status = 'rejected' AND revision = ?
          AND last_request_id = ?
      )`,
      [record.id, nextRevision, requestId],
    ),
    audit(database, {
      actorId: options.actorId,
      action: 'business_setting.rejected',
      subjectId: record.id,
      reason,
      previous: record,
      next: { status: 'rejected', revision: nextRevision },
      requestId,
      now,
    }),
  ]);
}

export async function getEffectiveBusinessSetting<K extends BusinessSettingKey>(
  database: D1Database,
  key: K,
  at: number,
): Promise<EffectiveBusinessSetting<K>> {
  timestamp('Effective lookup time', at);
  const definition = getBusinessSettingDefinition(key);
  const row = await database
    .prepare(
      `SELECT ${selectColumns}
       FROM business_setting_versions
       WHERE setting_key = ? AND status = 'published'
         AND effective_from <= ?
         AND (effective_until IS NULL OR effective_until > ?)
       ORDER BY effective_from DESC, version DESC LIMIT 1`,
    )
    .bind(key, at, at)
    .first<BusinessSettingRow>();
  if (!row) {
    return Object.freeze({
      key,
      value: definition.defaultValue,
      source: 'default',
      version: null,
      versionId: null,
      effectiveFrom: null,
      approvedBy: null,
    });
  }
  const record = parseRow<K>(row);
  return Object.freeze({
    key,
    value: record.value,
    source: 'persisted',
    version: record.version,
    versionId: record.id,
    effectiveFrom: record.effectiveFrom,
    approvedBy: record.approvedBy,
  });
}

export async function listBusinessSettingHistory<K extends BusinessSettingKey>(
  database: D1Database,
  key: K,
): Promise<readonly BusinessSettingVersion<K>[]> {
  getBusinessSettingDefinition(key);
  const result = await database
    .prepare(
      `SELECT ${selectColumns}
       FROM business_setting_versions
       WHERE setting_key = ? ORDER BY version DESC`,
    )
    .bind(key)
    .all<BusinessSettingRow>();
  return result.results.map((row) => parseRow<K>(row));
}

export async function createBusinessSettingReversalDraft<
  K extends BusinessSettingKey,
>(
  database: D1Database,
  options: {
    sourceVersionId: string;
    actorId: string;
    reason: string;
    requestId: string;
    now: number;
  },
): Promise<BusinessSettingVersion<K>> {
  const source = await getVersionById(database, options.sourceVersionId);
  if (!source || source.status !== 'published') {
    throw new BusinessSettingConflictError(
      'Only a published business setting can be used as a reversal source.',
    );
  }
  return createBusinessSettingDraft(database, {
    key: source.key as K,
    value: source.value,
    actorId: options.actorId,
    reason: options.reason,
    requestId: options.requestId,
    now: options.now,
    supersedesId: source.id,
  });
}
