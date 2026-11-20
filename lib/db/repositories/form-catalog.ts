import type { ConfiguredField, FormConfigDraft, FormId } from '../../forms/types';
import { validateFormDraft } from '../../forms/validation';
import {assertQuestionPublicationPolicy} from '../../forms/editor-policy';

export class FormCatalogConflictError extends Error {
  constructor(message = 'Form configuration changed or this action is not permitted.') {
    super(message);
    this.name = 'FormCatalogConflictError';
  }
}

export class FormCatalogStoredConfigError extends Error {
  constructor(message = 'Stored form configuration is invalid.') {
    super(message);
    this.name = 'FormCatalogStoredConfigError';
  }
}

type Status = 'draft' | 'published';
type Row = {
  id: string; formId: FormId; version: number; revision: number; status: Status;
  configJson: string; reason: string; createdBy: string; createdAt: number;
  updatedBy: string; updatedAt: number; publishedBy: string | null;
  publishedAt: number | null; lastRequestId: string;
};

export type FormConfigVersion = Omit<Row, 'configJson'> & { config: FormConfigDraft };

const columns = `id, form_id AS formId, version, revision, status,
  config_json AS configJson, reason, created_by AS createdBy, created_at AS createdAt,
  updated_by AS updatedBy, updated_at AS updatedAt, published_by AS publishedBy,
  published_at AS publishedAt, last_request_id AS lastRequestId`;

function storedConfig(formId: FormId, value: unknown): FormConfigDraft {
  try { return validateFormDraft(formId, value); }
  catch { throw new FormCatalogStoredConfigError(); }
}

function parse(row: Row): FormConfigVersion {
  const { configJson, ...metadata } = row;
  let candidate: unknown;
  try { candidate = JSON.parse(configJson); }
  catch { throw new FormCatalogStoredConfigError(); }
  return { ...metadata, config: storedConfig(row.formId, candidate) };
}

function required(value: string, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new RangeError(`${label} is invalid.`);
  return value.trim();
}

function version(value: number, label: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new RangeError(`${label} is invalid.`);
  return value;
}

function basic(input: { actorId: string; actorRole: 'super_admin'; reason: string; requestId: string; now: number; expectedPublishedVersion: number }) {
  if (input.actorRole !== 'super_admin') throw new FormCatalogConflictError();
  return {
    actorId: required(input.actorId, 'Actor', 191),
    reason: required(input.reason, 'Reason', 2000),
    requestId: required(input.requestId, 'Request ID', 191),
    now: version(input.now, 'Timestamp', true),
    expectedPublishedVersion: version(input.expectedPublishedVersion, 'Published version', true),
  };
}

async function byId(db: D1Database, id: string): Promise<FormConfigVersion | null> {
  const row = await db.prepare(`SELECT ${columns} FROM form_config_versions WHERE id = ?`).bind(id).first<Row>();
  return row ? parse(row) : null;
}

async function byRequest(db: D1Database, requestId: string): Promise<FormConfigVersion | null> {
  const row = await db.prepare(`SELECT ${columns} FROM form_config_versions WHERE last_request_id = ?`).bind(requestId).first<Row>();
  return row ? parse(row) : null;
}

async function usedRequest(db: D1Database, requestId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS used FROM audit_logs WHERE request_id = ? AND action LIKE 'form_catalog.%' LIMIT 1`)
    .bind(requestId).first<{ used: number }>();
  return Boolean(row);
}

async function assertActiveAdmin(db: D1Database, actorId: string): Promise<void> {
  const row = await db.prepare(`SELECT 1 AS allowed FROM users u JOIN user_roles r ON r.user_id = u.id
    WHERE u.id = ? AND u.status = 'active' AND r.role = 'super_admin' LIMIT 1`)
    .bind(actorId).first<{ allowed: number }>();
  if (!row) throw new FormCatalogConflictError();
}

async function currentPublished(db: D1Database, formId: FormId): Promise<number> {
  const row = await db.prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM form_config_versions WHERE form_id = ? AND status = 'published'`)
    .bind(formId).first<{ version: number }>();
  return Number(row?.version ?? 0);
}

async function nextVersion(db: D1Database, formId: FormId): Promise<number> {
  const row = await db.prepare(`SELECT COALESCE(MAX(version), 0) + 1 AS version FROM form_config_versions WHERE form_id = ?`)
    .bind(formId).first<{ version: number }>();
  return Number(row?.version ?? 1);
}

// A SELECT that raises on failure is deliberately part of D1's atomic batch.
// This guards races between the earlier user-facing read and the actual write.
function guard(db: D1Database, predicate: string, values: readonly (string | number)[]): D1PreparedStatement {
  const maria = (db as D1Database & { dialect?: string }).dialect === 'mariadb';
  const sql = maria ? `/* form-catalog-guard */ SELECT (${predicate.replace(historyCompatible, () => mariaHistoryCompatible)}) AS valid`
    : `SELECT CASE WHEN (${predicate}) THEN 1 ELSE json_extract('not-json', '$') END AS valid`;
  return db.prepare(sql).bind(...values);
}

const activeAdmin = `EXISTS (SELECT 1 FROM users u JOIN user_roles r ON r.user_id = u.id
  WHERE u.id = ? AND u.status = 'active' AND r.role = 'super_admin')`;
const publishedIs = `COALESCE((SELECT MAX(version) FROM form_config_versions
  WHERE form_id = ? AND status = 'published'), 0) = ?`;
const requestUnused = `NOT EXISTS (SELECT 1 FROM audit_logs WHERE request_id = ? AND action LIKE 'form_catalog.%')`;
const historyCompatible = `NOT EXISTS (
  SELECT 1 FROM form_config_versions h, json_each(h.config_json, '$.fields') old_field
  WHERE h.form_id = ? AND NOT EXISTS (
    SELECT 1 FROM json_each(?, '$.fields') candidate
    WHERE json_extract(candidate.value, '$.id') = json_extract(old_field.value, '$.id')
      AND json_extract(candidate.value, '$.key') = json_extract(old_field.value, '$.key')
      AND json_extract(candidate.value, '$.type') = json_extract(old_field.value, '$.type')
  )
)`;

// JSON_TABLE retains one row per historical field; binary scalar equality matches
// D1 identifiers, including case, accents, and trailing spaces.
const mariaHistoryCompatible = `NOT EXISTS (
  SELECT 1 FROM form_config_versions h,
    JSON_TABLE(h.config_json, '$.fields[*]' COLUMNS (value JSON PATH '$')) old_field
  WHERE h.form_id = ? AND NOT EXISTS (
    SELECT 1 FROM JSON_TABLE(?, '$.fields[*]' COLUMNS (value JSON PATH '$')) candidate
    WHERE BINARY JSON_VALUE(candidate.value, '$.id') = BINARY JSON_VALUE(old_field.value, '$.id')
      AND BINARY JSON_VALUE(candidate.value, '$.key') = BINARY JSON_VALUE(old_field.value, '$.key')
      AND BINARY JSON_VALUE(candidate.value, '$.type') = BINARY JSON_VALUE(old_field.value, '$.type')
  )
)`;

function audit(db: D1Database, input: { actorId: string; action: string; formId: string; versionId: string;
  reason: string; previous: unknown; next: unknown; requestId: string; now: number }): D1PreparedStatement {
  return db.prepare(`INSERT INTO audit_logs
    (id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL,?)`).bind(crypto.randomUUID(), input.actorId, input.action,
    'form_config', input.formId, input.reason, JSON.stringify(input.previous),
    JSON.stringify({ versionId: input.versionId, ...input.next as object }), input.requestId, input.now);
}

async function historicalFields(db: D1Database, formId: FormId): Promise<ConfiguredField[]> {
  const rows = await db.prepare('SELECT config_json AS configJson FROM form_config_versions WHERE form_id = ? ORDER BY version, revision')
    .bind(formId).all<{ configJson: string }>();
  const configs = rows.results.map((row) => {
    try { return storedConfig(formId, JSON.parse(row.configJson) as unknown); }
    catch { throw new FormCatalogStoredConfigError(); }
  });
  const fields = new Map<string, ConfiguredField>();
  for (const config of configs) {
    for (const field of config.fields) {
      const old = fields.get(field.id);
      if (old && (old.key !== field.key || old.type !== field.type)) throw new FormCatalogStoredConfigError('Stored field identity changed.');
      for (const prior of fields.values()) {
        if (prior.key === field.key && prior.id !== field.id) throw new FormCatalogStoredConfigError('Stored field key was reused.');
      }
      fields.set(field.id, field);
    }
  }
  return [...fields.values()];
}

async function assertIdentity(db: D1Database, formId: FormId, config: FormConfigDraft): Promise<void> {
  const previous = await historicalFields(db, formId);
  for (const old of previous) {
    const byId = config.fields.find((field) => field.id === old.id);
    const byKey = config.fields.find((field) => field.key === old.key);
    if (!byId || !byKey || byId !== byKey || byId.key !== old.key || byId.type !== old.type) {
      throw new FormCatalogConflictError('Historical fields must retain their identity and type; archive them to stop collection.');
    }
  }
}

function sameRequest(record: FormConfigVersion, input: { formId: FormId; actorId: string; reason: string }, status: Status, config?: FormConfigDraft) {
  return record.formId === input.formId && record.status === status &&
    (status === 'draft' ? record.updatedBy : record.publishedBy) === input.actorId &&
    record.reason === input.reason && (!config || JSON.stringify(record.config) === JSON.stringify(config));
}

export const PUBLIC_IDENTITY_FORM_IDS: readonly FormId[] = Object.freeze([
  'identity.register', 'identity.login-password', 'identity.email-code-request',
  'identity.email-code-verify', 'identity.password-reset-request', 'identity.password-reset-complete',
]);

export const FEATURE_MANAGED_BASELINE_FORM_IDS: readonly FormId[] = Object.freeze([
  ...PUBLIC_IDENTITY_FORM_IDS,
  'account.profile', 'account.address', 'account.daily-reward', 'account.points-redemption',
  'commerce.promo-quote', 'commerce.gift-card-redeem', 'staff.staff-invitation',
  'staff.staff-permission-1', 'staff.staff-permission-2', 'rider.code-verify',
  'staff.homepage-hero-manager', 'staff.homepage-occasion-manager', 'staff.homepage-visibility',
  'staff.business-settings-manager', 'staff.delivery-rate', 'staff.promo-code',
  'staff.loyalty-settings', 'staff.referral-settings',
]);

type FormBaselineInput = { actorId: string; actorRole: 'super_admin'; reason: string; requestId: string; now: number };

export function initializePublicIdentityForms(db: D1Database, input: FormBaselineInput) {
  return initializeFormBaselines(db, { ...input, formIds: PUBLIC_IDENTITY_FORM_IDS });
}

export function initializeFeatureManagedForms(db: D1Database, input: FormBaselineInput) {
  return initializeFormBaselines(db, { ...input, formIds: FEATURE_MANAGED_BASELINE_FORM_IDS });
}

/** Explicit installation step; public reads and catalog policy never initialize forms. */
export async function initializeFormBaselines(db: D1Database, input: FormBaselineInput & {
  formIds: readonly FormId[];
}): Promise<{ created: readonly FormConfigVersion[]; preserved: readonly FormConfigVersion[] }> {
  const data = basic({ ...input, expectedPublishedVersion: 0 });
  if (!Array.isArray(input.formIds) || !input.formIds.length ||
    new Set(input.formIds).size !== input.formIds.length ||
    input.formIds.some((id) => !FEATURE_MANAGED_BASELINE_FORM_IDS.includes(id))) {
    throw new FormCatalogConflictError('Only the required feature-managed form baselines can be initialized.');
  }
  await assertActiveAdmin(db, data.actorId);
  const preserved: FormConfigVersion[] = [];
  const preservedHistory: { formId: FormId; rows: readonly Row[] }[] = [];
  const missing: { formId: FormId; config: FormConfigDraft; requestId: string; id: string }[] = [];
  for (const formId of input.formIds) {
    const requestId = required(`${data.requestId}:${formId}`, 'Request ID', 191);
    const config = validateFormDraft(formId, { formId, fields: [] });
    const repeat = await byRequest(db, requestId);
    if (repeat) {
      const prior = await db.prepare(`SELECT 1 AS initialized FROM audit_logs
        WHERE request_id = ? AND action = 'form_catalog.initialized' AND subject_type = 'form_config'
          AND subject_id = ? AND actor_id = ? LIMIT 1`)
        .bind(requestId, formId, data.actorId).first<{ initialized: number }>();
      if (!prior || repeat.version !== 1 || !sameRequest(repeat, { formId, ...data }, 'published', config))
        throw new FormCatalogConflictError('Request ID was already used.');
    } else if (await usedRequest(db, requestId)) {
      throw new FormCatalogConflictError('Request ID was already used.');
    }
    const history = await db.prepare(`SELECT ${columns} FROM form_config_versions
      WHERE form_id = ? ORDER BY version DESC`).bind(formId).all<Row>();
    const row = history.results.find((version) => version.status === 'published');
    if (row) {
      preserved.push(parse(row));
      preservedHistory.push({ formId, rows: history.results });
      continue;
    }
    if (history.results.length) throw new FormCatalogConflictError(`Resolve existing ${formId} draft history before initialization.`);
    missing.push({ formId, config, requestId, id: crypto.randomUUID() });
  }
  if (!missing.length) return { created: [], preserved };
  const statements: D1PreparedStatement[] = [];
  const maria = (db as D1Database & { dialect?: string }).dialect === 'mariadb';
  // Every preserved version participates in the installation snapshot. Checking
  // only missing forms would admit a concurrent draft/publication on another form.
  // The MariaDB adapter locks bindings[0] as actor and bindings[1] as form.
  // Keep that prefix in each guard through real authorization/form predicates.
  for (const history of preservedHistory) {
    statements.push(guard(db, `${activeAdmin} AND (SELECT COUNT(*) FROM form_config_versions WHERE form_id = ?) = ?`,
      [data.actorId, history.formId, history.rows.length]));
    for (const row of history.rows) {
      const fields: readonly (readonly [string, string | number | null])[] = [
        ['form_id', row.formId], ['id', row.id], ['version', row.version], ['revision', row.revision],
        ['status', row.status], ['config_json', row.configJson], ['reason', row.reason],
        ['created_by', row.createdBy], ['created_at', row.createdAt], ['updated_by', row.updatedBy],
        ['updated_at', row.updatedAt], ['published_by', row.publishedBy], ['published_at', row.publishedAt],
        ['last_request_id', row.lastRequestId],
      ];
      const values: (string | number)[] = [data.actorId];
      const predicate = fields.map(([column, value]) => {
        if (value === null) return `${column} IS NULL`;
        values.push(value);
        return maria && typeof value === 'string' ? `BINARY ${column} = BINARY ?` : `${column} = ?`;
      }).join(' AND ');
      statements.push(guard(db, `${activeAdmin} AND EXISTS (SELECT 1 FROM form_config_versions WHERE ${predicate})`, values));
    }
  }
  for (const item of missing) {
    statements.push(
      guard(db, `${activeAdmin} AND ${publishedIs} AND ${requestUnused} AND
        NOT EXISTS (SELECT 1 FROM form_config_versions WHERE form_id = ?)`,
      [data.actorId, item.formId, 0, item.requestId, item.formId]),
      db.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
         updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES (?,?,1,1,'published',?,?,?,?,?,?,?,?,?)`)
        .bind(item.id, item.formId, JSON.stringify(item.config), data.reason, data.actorId, data.now,
          data.actorId, data.now, data.actorId, data.now, item.requestId),
      audit(db, { actorId: data.actorId, action: 'form_catalog.initialized', formId: item.formId,
        versionId: item.id, reason: data.reason, previous: null,
        next: { status: 'published', version: 1, config: item.config }, requestId: item.requestId, now: data.now }),
    );
  }
  try { await db.batch(statements); }
  catch { throw new FormCatalogConflictError(); }
  const created = [];
  for (const item of missing) created.push((await byId(db, item.id))!);
  return { created, preserved };
}

export async function saveFormDraft(db: D1Database, input: { formId: FormId; draftId?: string; actorId: string;
  actorRole: 'super_admin'; expectedDraftRevision?: number; expectedPublishedVersion: number;
  config: FormConfigDraft; reason: string; requestId: string; now: number }): Promise<FormConfigVersion> {
  const data = basic(input);
  const config = validateFormDraft(input.formId, input.config);
  await assertActiveAdmin(db, data.actorId);
  const repeat = await byRequest(db, data.requestId);
  if (repeat) {
    if (sameRequest(repeat, { ...input, ...data }, 'draft', config) && (!input.draftId || repeat.id === input.draftId)) return repeat;
    throw new FormCatalogConflictError('Request ID was already used.');
  }
  if (await usedRequest(db, data.requestId)) throw new FormCatalogConflictError('Request ID was already used.');
  assertQuestionPublicationPolicy(config);
  if (await currentPublished(db, input.formId) !== data.expectedPublishedVersion) throw new FormCatalogConflictError();
  await assertIdentity(db, input.formId, config);
  const configJson = JSON.stringify(config);
  if (input.draftId) {
    const draftId = required(input.draftId, 'Draft ID', 191);
    const revision = version(input.expectedDraftRevision as number, 'Draft revision');
    const old = await byId(db, draftId);
    if (!old || old.formId !== input.formId || old.status !== 'draft' || old.revision !== revision ||
        old.version <= data.expectedPublishedVersion) throw new FormCatalogConflictError();
    try {
      await db.batch([
        guard(db, `${activeAdmin} AND ${publishedIs} AND ${requestUnused} AND EXISTS
          (SELECT 1 FROM form_config_versions WHERE id = ? AND form_id = ? AND status = 'draft' AND revision = ? AND version > ?)
          AND ${historyCompatible}`,
        [data.actorId, input.formId, data.expectedPublishedVersion, data.requestId,
          draftId, input.formId, revision, data.expectedPublishedVersion, input.formId, configJson]),
        db.prepare(`UPDATE form_config_versions SET revision = revision + 1, config_json = ?, reason = ?,
          updated_by = ?, updated_at = ?, last_request_id = ? WHERE id = ? AND revision = ? AND status = 'draft'`)
          .bind(configJson, data.reason, data.actorId, data.now, data.requestId, draftId, revision),
        audit(db, { actorId: data.actorId, action: 'form_catalog.draft_saved', formId: input.formId,
          versionId: draftId, reason: data.reason, previous: old.config, next: config,
          requestId: data.requestId, now: data.now }),
      ]);
    } catch { throw new FormCatalogConflictError(); }
    return (await byId(db, draftId))!;
  }
  const newVersion = await nextVersion(db, input.formId);
  const id = crypto.randomUUID();
  try {
    await db.batch([
      guard(db, `${activeAdmin} AND ${publishedIs} AND ${requestUnused} AND
        COALESCE((SELECT MAX(version) FROM form_config_versions WHERE form_id = ?), 0) = ?
        AND ${historyCompatible}`,
      [data.actorId, input.formId, data.expectedPublishedVersion, data.requestId,
        input.formId, newVersion - 1, input.formId, configJson]),
      db.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
         updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES (?,?,?,1,'draft',?,?,?,?,?,?,NULL,NULL,?)`)
        .bind(id, input.formId, newVersion, configJson, data.reason, data.actorId, data.now,
          data.actorId, data.now, data.requestId),
      audit(db, { actorId: data.actorId, action: 'form_catalog.draft_created', formId: input.formId,
        versionId: id, reason: data.reason, previous: null, next: config,
        requestId: data.requestId, now: data.now }),
    ]);
  } catch { throw new FormCatalogConflictError(); }
  return (await byId(db, id))!;
}

export async function publishFormDraft(db: D1Database, input: { formId: FormId; draftId: string;
  actorId: string; actorRole: 'super_admin'; expectedDraftRevision: number;
  expectedPublishedVersion: number; reason: string; requestId: string; now: number }): Promise<FormConfigVersion> {
  const data = basic(input);
  const draftId = required(input.draftId, 'Draft ID', 191);
  const revision = version(input.expectedDraftRevision, 'Draft revision');
  await assertActiveAdmin(db, data.actorId);
  const repeat = await byRequest(db, data.requestId);
  if (repeat) {
    const prior = await db.prepare(`SELECT 1 AS published FROM audit_logs
      WHERE request_id = ? AND action = 'form_catalog.published' AND subject_type = 'form_config'
        AND subject_id = ? AND actor_id = ? LIMIT 1`)
      .bind(data.requestId, input.formId, data.actorId).first<{ published: number }>();
    if (prior && repeat.id === draftId && sameRequest(repeat, { ...input, ...data }, 'published')) return repeat;
    throw new FormCatalogConflictError('Request ID was already used.');
  }
  if (await usedRequest(db, data.requestId)) throw new FormCatalogConflictError('Request ID was already used.');
  const draft = await byId(db, draftId);
  if (!draft || draft.formId !== input.formId || draft.status !== 'draft' || draft.revision !== revision ||
      draft.version <= data.expectedPublishedVersion ||
      await currentPublished(db, input.formId) !== data.expectedPublishedVersion) throw new FormCatalogConflictError();
  const config = validateFormDraft(input.formId, draft.config);
  assertQuestionPublicationPolicy(config);
  await assertIdentity(db, input.formId, config);
  try {
    await db.batch([
      guard(db, `${activeAdmin} AND ${publishedIs} AND ${requestUnused} AND EXISTS
        (SELECT 1 FROM form_config_versions WHERE id = ? AND form_id = ? AND status = 'draft' AND revision = ? AND version > ?)
        AND ${historyCompatible}`,
      [data.actorId, input.formId, data.expectedPublishedVersion, data.requestId,
        draftId, input.formId, revision, data.expectedPublishedVersion, input.formId, JSON.stringify(config)]),
      db.prepare(`UPDATE form_config_versions SET status = 'published', revision = revision + 1,
        reason = ?, updated_by = ?, updated_at = ?, published_by = ?, published_at = ?, last_request_id = ?
        WHERE id = ? AND status = 'draft' AND revision = ?`)
        .bind(data.reason, data.actorId, data.now, data.actorId, data.now, data.requestId, draftId, revision),
      audit(db, { actorId: data.actorId, action: 'form_catalog.published', formId: input.formId,
        versionId: draftId, reason: data.reason, previous: { status: 'draft', config: draft.config },
        next: { status: 'published', version: draft.version, config }, requestId: data.requestId, now: data.now }),
    ]);
  } catch { throw new FormCatalogConflictError(); }
  return (await byId(db, draftId))!;
}

export async function restoreFormVersion(db: D1Database, input: { formId: FormId; sourceVersion: number;
  actorId: string; actorRole: 'super_admin'; expectedPublishedVersion: number;
  reason: string; requestId: string; now: number }): Promise<FormConfigVersion> {
  const data = basic(input);
  const sourceVersion = version(input.sourceVersion, 'Source version');
  await assertActiveAdmin(db, data.actorId);
  const repeat = await byRequest(db, data.requestId);
  if (repeat) {
    const prior = await db.prepare(`SELECT previous_json AS previousJson, next_json AS nextJson FROM audit_logs
      WHERE request_id = ? AND action = 'form_catalog.restored' AND subject_type = 'form_config'
        AND subject_id = ? AND actor_id = ? AND reason = ? LIMIT 1`)
      .bind(data.requestId, input.formId, data.actorId, data.reason).first<{ previousJson: string; nextJson: string }>();
    if (prior && sameRequest(repeat, { ...input, ...data }, 'published')) {
      try {
        const previous = JSON.parse(prior.previousJson) as { version?: number } | null;
        const next = JSON.parse(prior.nextJson) as { versionId?: string; version?: number; sourceVersion?: number; config?: FormConfigDraft } | null;
        // Version allocation includes drafts, so the prior publication is proved by
        // the audit input rather than inferred from the allocated result version.
        if (previous?.version === data.expectedPublishedVersion && next?.sourceVersion === sourceVersion &&
          next.versionId === repeat.id && next.version === repeat.version &&
          JSON.stringify(next.config) === JSON.stringify(repeat.config)) return repeat;
      } catch { /* Unreadable audit evidence cannot establish an identical request. */ }
    }
    throw new FormCatalogConflictError('Request ID was already used.');
  }
  if (await usedRequest(db, data.requestId)) throw new FormCatalogConflictError('Request ID was already used.');
  if (await currentPublished(db, input.formId) !== data.expectedPublishedVersion) throw new FormCatalogConflictError();
  const sourceRow = await db.prepare(`SELECT ${columns} FROM form_config_versions
    WHERE form_id = ? AND version = ? AND status = 'published'`).bind(input.formId, sourceVersion).first<Row>();
  if (!sourceRow) throw new FormCatalogConflictError('Source publication was not found.');
  const source = parse(sourceRow);
  const historical = await historicalFields(db, input.formId);
  const fields = [...source.config.fields];
  for (const old of historical) {
    if (!fields.some((field) => field.id === old.id)) fields.push({ ...old, status: 'archived', order: fields.length });
  }
  const config = validateFormDraft(input.formId, { formId: input.formId, fields });
  assertQuestionPublicationPolicy(config);
  await assertIdentity(db, input.formId, config);
  const newVersion = await nextVersion(db, input.formId);
  const id = crypto.randomUUID();
  try {
    await db.batch([
      guard(db, `${activeAdmin} AND ${publishedIs} AND ${requestUnused} AND
        COALESCE((SELECT MAX(version) FROM form_config_versions WHERE form_id = ?), 0) = ? AND
        EXISTS (SELECT 1 FROM form_config_versions WHERE id = ? AND status = 'published')
        AND ${historyCompatible}`,
      [data.actorId, input.formId, data.expectedPublishedVersion, data.requestId,
        input.formId, newVersion - 1, source.id, input.formId, JSON.stringify(config)]),
      db.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
         updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES (?,?,?,1,'published',?,?,?,?,?,?,?,?,?)`)
        .bind(id, input.formId, newVersion, JSON.stringify(config), data.reason, data.actorId,
          data.now, data.actorId, data.now, data.actorId, data.now, data.requestId),
      audit(db, { actorId: data.actorId, action: 'form_catalog.restored', formId: input.formId,
        versionId: id, reason: data.reason, previous: { version: data.expectedPublishedVersion },
        next: { version: newVersion, sourceVersion, config }, requestId: data.requestId, now: data.now }),
    ]);
  } catch { throw new FormCatalogConflictError(); }
  return (await byId(db, id))!;
}
