import { SELLER_AGREEMENT_VERSION } from '../../content/legal-policies';
import { staffMutationGuard } from './staff-mutation-guard';
import {
  auditColumns,
  CONTINUITY_CAPTURE,
  CONTINUITY_END,
  CONTINUITY_SOURCE,
  CONTINUITY_SOURCE_RELEASE,
  consentPredicate,
  continuityEvidenceLock,
  continuitySettingLock,
  continuityCutoff,
  exactRow,
  resolveCommissionConsent,
  settingColumns,
  type EvidenceRow,
} from './commission-continuity-proof';

export class CommissionContinuityConflict extends Error {}
const keys = [
  'independent_seller_commission_bps',
  'managed_sale_linked_platform_retention_bps',
] as const;
export type ContinuitySelection = {
  sellerId: string;
  ownerId: string;
  acceptedAt: number;
  audit: EvidenceRow;
};
export type ContinuityRequest = {
  mode: 'fictional_memory' | 'reviewed_native';
  requestId: string;
  actorId: string;
  expectedRevision: number;
  now: number;
  sourceRelease: string;
  sourceCommit: string;
  captureSha256: string;
  selectionSha256: string;
  futureRows: EvidenceRow[];
  sellers: ContinuitySelection[];
};
function guard(db: D1Database, sql: string, values: unknown[] = []) {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        `INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${sql} THEN 1 ELSE 0 END`,
      )
      .bind(id, ...values),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id),
  ];
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}
export async function continuitySelectionSha256(
  sellers: ContinuitySelection[],
) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical(sellers)),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}

/** Internal only. The operator must separately bind runtime/database identity. No forms import this module. */
export async function preserveOriginalCommissionContinuity(
  db: D1Database,
  o: ContinuityRequest,
) {
  const fail = () => {
    throw new CommissionContinuityConflict(
      'Continuity source, evidence, revision or interval changed.',
    );
  };
  const native =
    (db as D1Database & { dialect?: string }).dialect === 'mariadb';
  if (o.mode === 'fictional_memory') {
    if (native) fail();
    const databases = await db
      .prepare('PRAGMA database_list')
      .all<{ file: string }>();
    if (
      !databases.results.length ||
      databases.results.some((row) => row.file !== '')
    )
      fail();
  } else if (o.mode !== 'reviewed_native' || !native) fail();
  if (
    !/^[a-zA-Z0-9._:-]{1,80}$/.test(o.requestId) ||
    o.sourceRelease !== CONTINUITY_SOURCE_RELEASE ||
    o.sourceCommit !== CONTINUITY_SOURCE ||
    o.captureSha256 !== CONTINUITY_CAPTURE ||
    !Number.isSafeInteger(o.now) ||
    !Number.isInteger(o.expectedRevision) ||
    o.expectedRevision < 0 ||
    o.sellers.length !== 4 ||
    new Set(o.sellers.map((s) => s.sellerId)).size !== 4 ||
    new Set(o.sellers.map((s) => s.ownerId)).size !== 4 ||
    o.selectionSha256 !== (await continuitySelectionSha256(o.sellers))
  )
    fail();
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'commercial_policy.manage',
    CommissionContinuityConflict,
    'super_admin',
  );
  const requestJson = canonical(o);
  const prior = await db
    .prepare('SELECT * FROM commission_continuity_operations WHERE id=?')
    .bind(o.requestId)
    .first<EvidenceRow>();
  const audit: EvidenceRow = {
    id: `${o.requestId}:audit`,
    actor_id: o.actorId,
    action: 'commission.continuity.preserved',
    subject_type: 'commission_continuity',
    subject_id: o.requestId,
    reason:
      'Preserved original 900bps rate and four original registered consents until unchanged scheduled successor; no renewed consent.',
    previous_json: null,
    next_json: JSON.stringify({
      sourceCommit: o.sourceCommit,
      captureSha256: o.captureSha256,
      selectionSha256: o.selectionSha256,
      startedAt: o.now,
      endsAt: CONTINUITY_END,
    }),
    request_id: `continuity:${o.requestId}`,
    ip_hash: null,
    created_at: o.now,
  };
  const evidenceLocks = [
    continuityEvidenceLock(db, o.actorId, null, String(audit.id)),
    ...o.sellers.map((s) =>
      continuityEvidenceLock(db, s.ownerId, s.sellerId, String(s.audit.id)),
    ),
    ...keys.map((key) => continuitySettingLock(db, key)),
  ];
  if (prior) {
    if (prior.request_json !== requestJson) fail();
    const links = (
      await db
        .prepare(
          'SELECT * FROM commission_continuity_settings WHERE operation_id=? ORDER BY setting_key',
        )
        .bind(o.requestId)
        .all<EvidenceRow>()
    ).results;
    const bindings = (
      await db
        .prepare(
          'SELECT * FROM commission_continuity_sellers WHERE operation_id=?',
        )
        .bind(o.requestId)
        .all<EvidenceRow>()
    ).results;
    if (links.length !== 2 || bindings.length !== 4) fail();
    const statements = [
      ...evidenceLocks,
      db.prepare(
        "UPDATE commission_control SET revision=revision WHERE id='default'",
      ),
      ...authority.statements,
    ];
    const auditCheck = exactRow('audit_logs', 'a', audit, auditColumns);
    statements.push(...guard(db, auditCheck.sql, auditCheck.values));
    for (const l of links) {
      for (const raw of [l.current_json, l.successor_json]) {
        const c = exactRow(
          'business_setting_versions',
          'v',
          JSON.parse(String(raw)),
          settingColumns,
        );
        statements.push(...guard(db, c.sql, c.values));
      }
    }
    for (const s of o.sellers) {
      const independent = links.find((l) => l.setting_key === keys[0])!;
      const setting = {
        basisPoints: 900,
        percent: 9,
        updatedAt: o.now,
        updatedByName: null,
        versionId: String(independent.setting_id),
        effectiveFrom: o.now,
      };
      const proof = await resolveCommissionConsent(
        db,
        s.sellerId,
        setting,
        o.now,
        true,
      );
      if (
        !proof ||
        proof.kind !== 'preserved_legacy' ||
        proof.evidence.operation.id !== o.requestId
      )
        fail();
      const p = consentPredicate(s.sellerId, setting, o.now, proof!);
      statements.push(...guard(db, p.sql, p.values));
    }
    await db.batch(statements);
    return {
      operationId: o.requestId,
      effectiveFrom: o.now,
      endsAt: CONTINUITY_END,
    };
  }
  if (o.now >= CONTINUITY_END || o.now <= 0 || o.futureRows.length !== 2)
    fail();
  if (native && Math.abs(Date.now() - o.now) > 5000) fail();
  const statements = [
    ...evidenceLocks,
    continuityCutoff(db),
    db.prepare(
      "UPDATE commission_control SET revision=revision WHERE id='default'",
    ),
    ...guard(
      db,
      "EXISTS(SELECT 1 FROM commission_control WHERE id='default' AND revision=?)",
      [o.expectedRevision],
    ),
    ...authority.statements,
    ...guard(db, 'NOT EXISTS(SELECT 1 FROM commission_continuity_operations)'),
    ...guard(
      db,
      'NOT EXISTS(SELECT 1 FROM commission_rate_changes r LEFT JOIN commission_rate_cancellations c ON c.rate_id=r.id WHERE c.rate_id IS NULL)',
    ),
  ];
  if (native)
    statements.push(
      ...guard(
        db,
        "unixepoch('now') * 1000 < ? AND ? BETWEEN unixepoch('now') * 1000 - 5000 AND unixepoch('now') * 1000 + 5000",
        [CONTINUITY_END, o.now],
      ),
    );
  const operation = {
    id: o.requestId,
    request_json: requestJson,
    source_release: o.sourceRelease,
    source_commit: o.sourceCommit,
    capture_sha256: o.captureSha256,
    selection_sha256: o.selectionSha256,
    basis_points: 900,
    started_at: o.now,
    ends_at: CONTINUITY_END,
    actor_id: o.actorId,
    recorded_at: o.now,
  };
  statements.push(
    db
      .prepare(
        `INSERT INTO commission_continuity_operations(${Object.keys(operation).join(',')}) VALUES(${Object.keys(
          operation,
        )
          .map(() => '?')
          .join(',')})`,
      )
      .bind(...Object.values(operation)),
  );
  for (const key of keys) {
    const future = o.futureRows.find((r) => r.setting_key === key);
    if (
      !future ||
      future.status !== 'published' ||
      future.value_json !== '1200' ||
      future.effective_from !== CONTINUITY_END ||
      future.effective_until !== null
    )
      fail();
    const preimage = exactRow(
      'business_setting_versions',
      'v',
      future!,
      settingColumns,
    );
    statements.push(
      ...guard(db, preimage.sql, preimage.values),
      ...guard(
        db,
        `NOT EXISTS(SELECT 1 FROM business_setting_versions WHERE setting_key=? AND status='published' AND id<>?)`,
        [key, future!.id],
      ),
    );
    const max = await db
      .prepare(
        'SELECT MAX(version) AS n FROM business_setting_versions WHERE setting_key=?',
      )
      .bind(key)
      .first<{ n: number }>();
    const id = `${o.requestId}:${key === keys[0] ? 'independent' : 'managed'}`;
    const current: EvidenceRow = {
      id,
      setting_key: key,
      version: Number(max?.n ?? 0) + 1,
      value_json: '900',
      status: 'published',
      revision: 1,
      change_control: 'controlled',
      effective_from: o.now,
      effective_until: CONTINUITY_END,
      reason:
        'Bounded original code-default 900bps continuity; preserves original consent only, without acceptance of added disclosures.',
      created_by: o.actorId,
      created_at: o.now,
      submitted_by: o.actorId,
      submitted_at: o.now,
      approved_by: o.actorId,
      approved_at: o.now,
      published_by: o.actorId,
      published_at: o.now,
      decision_note: `Original source ${o.sourceRelease} / ${CONTINUITY_SOURCE}; actual continuity approval time.`,
      supersedes_id: null,
      last_request_id: id,
    };
    statements.push(
      db
        .prepare(
          `INSERT INTO business_setting_versions(${settingColumns.join(',')}) VALUES(${settingColumns.map(() => '?').join(',')})`,
        )
        .bind(...settingColumns.map((c) => current[c])),
      db
        .prepare(
          'INSERT INTO commission_continuity_settings(operation_id,setting_key,setting_id,successor_id,current_json,successor_json) VALUES(?,?,?,?,?,?)',
        )
        .bind(
          o.requestId,
          key,
          id,
          future!.id,
          JSON.stringify(current),
          JSON.stringify(future),
        ),
    );
  }
  for (const [index, s] of o.sellers.entries()) {
    let next;
    try {
      next = JSON.parse(String(s.audit.next_json));
    } catch {
      fail();
    }
    if (
      s.audit.actor_id !== s.ownerId ||
      s.audit.subject_id !== s.sellerId ||
      s.audit.subject_type !== 'seller' ||
      s.audit.action !== 'seller.agreement.accepted' ||
      next.version !== SELLER_AGREEMENT_VERSION ||
      next.acceptedAt !== s.acceptedAt ||
      !Number.isSafeInteger(s.acceptedAt) ||
      s.acceptedAt <= 0 ||
      s.acceptedAt > o.now
    )
      fail();
    const audit = exactRow('audit_logs', 'a', s.audit, auditColumns);
    statements.push(
      ...guard(db, audit.sql, audit.values),
      ...guard(
        db,
        `EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
      JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.id=? AND HEX(s.user_id)=HEX(?) AND s.status='approved' AND u.status='active'
      AND HEX(s.seller_agreement_version)=HEX(?) AND s.seller_agreement_accepted_at=? AND p.participation_route='registered_seller'
      AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller'))`,
        [s.sellerId, s.ownerId, SELLER_AGREEMENT_VERSION, s.acceptedAt],
      ),
      db
        .prepare(
          'INSERT INTO commission_continuity_sellers(id,operation_id,setting_id,seller_id,owner_id,agreement_version,accepted_at,audit_id,audit_json) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          `${o.requestId}:seller:${index}`,
          o.requestId,
          `${o.requestId}:independent`,
          s.sellerId,
          s.ownerId,
          SELLER_AGREEMENT_VERSION,
          s.acceptedAt,
          s.audit.id,
          JSON.stringify(s.audit),
        ),
    );
  }
  statements.push(
    db.prepare(
      "UPDATE commission_control SET revision=revision+1 WHERE id='default'",
    ),
    db
      .prepare(
        `INSERT INTO audit_logs(${auditColumns.join(',')}) VALUES(${auditColumns.map(() => '?').join(',')})`,
      )
      .bind(...auditColumns.map((c) => audit[c])),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    throw new CommissionContinuityConflict('Continuity transaction refused.', {
      cause: error,
    });
  }
  return {
    operationId: o.requestId,
    effectiveFrom: o.now,
    endsAt: CONTINUITY_END,
  };
}
