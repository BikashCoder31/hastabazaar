import { SELLER_AGREEMENT_VERSION } from '../../content/legal-policies';
import type { CommissionSetting } from './marketplace-settings';

export const CONTINUITY_END = 1794334500000;
export const CONTINUITY_SOURCE = '6204ae4d1f6a97b41cdd322ef9a83f8f7bee1e2f';
export const CONTINUITY_SOURCE_RELEASE = 'hastabazaar-release-ci-38358135513-1';
export const CONTINUITY_CAPTURE =
  'c79e47c32c081f605898c6d3b6a0b5bb91f4e5fcf687724d9fb3afc303aa0ea6';
export type EvidenceRow = Record<string, string | number | null>;
export const settingColumns =
  'id setting_key version value_json status revision change_control effective_from effective_until reason created_by created_at submitted_by submitted_at approved_by approved_at published_by published_at decision_note supersedes_id last_request_id'.split(
    ' ',
  );
export const auditColumns =
  'id actor_id action subject_type subject_id reason previous_json next_json request_id ip_hash created_at'.split(
    ' ',
  );
const operationColumns =
  'id request_json source_release source_commit capture_sha256 selection_sha256 basis_points started_at ends_at actor_id recorded_at'.split(
    ' ',
  );
const linkColumns =
  'operation_id setting_key setting_id successor_id current_json successor_json'.split(
    ' ',
  );
const bindingColumns =
  'id operation_id setting_id seller_id owner_id agreement_version accepted_at audit_id audit_json'.split(
    ' ',
  );

/** HEX is byte-exact on SQLite and MariaDB, including databases with a CI collation. */
export function exactRow(
  table: string,
  alias: string,
  row: EvidenceRow,
  columns: string[],
) {
  if (
    Object.keys(row).length !== columns.length ||
    columns.some((c) => !(c in row))
  )
    throw new Error('Incomplete continuity preimage');
  return {
    sql: `EXISTS(SELECT 1 FROM ${table} ${alias} WHERE ${columns.map((c) => (row[c] === null ? `${alias}.${c} IS NULL` : typeof row[c] === 'number' ? `${alias}.${c}=?` : `HEX(${alias}.${c})=HEX(?)`)).join(' AND ')})`,
    values: columns.filter((c) => row[c] !== null).map((c) => row[c]),
  };
}
type LegacyEvidence = {
  binding: EvidenceRow;
  operation: EvidenceRow;
  link: EvidenceRow;
  audit: EvidenceRow;
  current: EvidenceRow;
  successor: EvidenceRow;
};
export type CommissionConsentProof =
  | { kind: 'current_acceptance'; id: string }
  | { kind: 'preserved_legacy'; id: string; evidence: LegacyEvidence };

/** Portable declarations consumed by the native batch adapter before any guards.
 * The exact predicates remain necessary after these locks settle. */
export function continuityEvidenceLock(
  db: D1Database,
  userId: string,
  sellerId: string | null = null,
  auditId: string | null = null,
) {
  return db
    .prepare(
      '/* commission-continuity-evidence-lock */ SELECT ? AS owner_id,? AS seller_id,? AS audit_id',
    )
    .bind(userId, sellerId, auditId);
}
export function continuitySettingLock(db: D1Database, key: string) {
  return db
    .prepare('/* commission-continuity-setting-lock */ SELECT ? AS setting_key')
    .bind(key);
}
export function continuityCutoff(db: D1Database) {
  return db
    .prepare('/* commission-continuity-cutoff */ SELECT ? AS cutoff')
    .bind(CONTINUITY_END);
}

export function consentPredicate(
  sellerId: string,
  setting: CommissionSetting,
  at: number,
  proof: CommissionConsentProof,
) {
  if (proof.kind === 'current_acceptance')
    return {
      sql: `EXISTS(SELECT 1 FROM seller_agreement_acceptance_history a JOIN seller_profiles s ON s.id=a.seller_id
      JOIN users u ON u.id=s.user_id WHERE HEX(a.id)=HEX(?) AND a.seller_id=? AND a.commission_setting_version_id=?
      AND a.commission_bps=? AND HEX(a.agreement_version)=HEX(?) AND a.accepted_by=s.user_id AND a.accepted_at<=?
      AND HEX(s.seller_agreement_version)=HEX(a.agreement_version) AND s.status='approved' AND u.status='active')`,
      values: [
        proof.id,
        sellerId,
        setting.versionId,
        setting.basisPoints,
        SELLER_AGREEMENT_VERSION,
        at,
      ],
    };
  const e = proof.evidence;
  const { binding: b, operation: o, link: l } = e;
  const checks = [
    exactRow('commission_continuity_operations', 'o', o, operationColumns),
    exactRow('commission_continuity_settings', 'l', l, linkColumns),
    exactRow('commission_continuity_sellers', 'b', b, bindingColumns),
    exactRow('business_setting_versions', 'v', e.current, settingColumns),
    exactRow('business_setting_versions', 'v', e.successor, settingColumns),
    exactRow('audit_logs', 'a', e.audit, auditColumns),
  ];
  const valid =
    proof.id === b.id &&
    b.seller_id === sellerId &&
    b.operation_id === o.id &&
    l.operation_id === o.id &&
    b.setting_id === l.setting_id &&
    l.setting_id === setting.versionId &&
    e.current.id === setting.versionId &&
    setting.basisPoints === 900 &&
    e.current.setting_key === 'independent_seller_commission_bps' &&
    e.current.value_json === '900' &&
    e.current.status === 'published' &&
    e.current.effective_from === o.started_at &&
    e.current.effective_until === CONTINUITY_END &&
    o.source_commit === CONTINUITY_SOURCE &&
    o.source_release === CONTINUITY_SOURCE_RELEASE &&
    o.capture_sha256 === CONTINUITY_CAPTURE &&
    o.basis_points === 900 &&
    o.ends_at === CONTINUITY_END &&
    Number(o.started_at) <= at &&
    at < CONTINUITY_END &&
    l.successor_id === e.successor.id &&
    e.successor.status === 'published' &&
    e.successor.value_json === '1200' &&
    e.successor.setting_key === e.current.setting_key &&
    e.successor.effective_from === CONTINUITY_END &&
    b.agreement_version === SELLER_AGREEMENT_VERSION &&
    b.audit_id === e.audit.id &&
    e.audit.actor_id === b.owner_id &&
    e.audit.subject_type === 'seller' &&
    e.audit.subject_id === sellerId &&
    e.audit.action === 'seller.agreement.accepted';
  let auditMatches = false;
  try {
    const next = JSON.parse(String(e.audit.next_json));
    auditMatches =
      next.version === b.agreement_version && next.acceptedAt === b.accepted_at;
  } catch {
    /* refuse malformed evidence */
  }
  return {
    sql: `${valid && auditMatches ? '1=1' : '1=0'} AND ${checks.map((c) => c.sql).join(' AND ')} AND EXISTS(
    SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
    JOIN seller_participation_profiles p ON p.seller_id=s.id
    WHERE s.id=? AND HEX(s.user_id)=HEX(?) AND s.status='approved' AND u.status='active'
      AND HEX(s.seller_agreement_version)=HEX(?) AND s.seller_agreement_accepted_at=?
      AND p.participation_route='registered_seller' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller'))
    AND ?=(SELECT id FROM business_setting_versions WHERE setting_key='independent_seller_commission_bps' AND status='published'
      AND effective_from<=? AND (effective_until IS NULL OR effective_until>?) ORDER BY effective_from DESC,version DESC LIMIT 1)`,
    values: [
      ...checks.flatMap((c) => c.values),
      sellerId,
      b.owner_id,
      b.agreement_version,
      b.accepted_at,
      setting.versionId,
      at,
      at,
    ],
  };
}

/** This module accepts the selected setting, avoiding settings/proof import cycles. */
export async function resolveCommissionConsent(
  db: D1Database,
  sellerId: string,
  setting: CommissionSetting,
  at: number,
  legacyOnly = false,
): Promise<CommissionConsentProof | null> {
  if (!setting.versionId) return null;
  const acceptance = await db
    .prepare(`SELECT a.id FROM seller_agreement_acceptance_history a JOIN seller_profiles s ON s.id=a.seller_id
    WHERE a.seller_id=? AND a.commission_setting_version_id=? AND a.commission_bps=? AND HEX(a.agreement_version)=HEX(?)
    AND a.accepted_by=s.user_id AND a.accepted_at<=? ORDER BY a.accepted_at DESC,a.id DESC LIMIT 1`)
    .bind(
      sellerId,
      setting.versionId,
      setting.basisPoints,
      SELLER_AGREEMENT_VERSION,
      at,
    )
    .first<{ id: string }>();
  if (acceptance && !legacyOnly) {
    const proof: CommissionConsentProof = {
      kind: 'current_acceptance',
      id: acceptance.id,
    };
    const p = consentPredicate(sellerId, setting, at, proof);
    if (
      await db
        .prepare(`SELECT 1 WHERE ${p.sql}`)
        .bind(...p.values)
        .first()
    )
      return proof;
  }
  if (setting.basisPoints !== 900 || at >= CONTINUITY_END) return null;
  const binding = await db
    .prepare(
      'SELECT * FROM commission_continuity_sellers WHERE seller_id=? AND setting_id=?',
    )
    .bind(sellerId, setting.versionId)
    .first<EvidenceRow>();
  if (!binding) return null;
  const [operation, link] = await Promise.all([
    db
      .prepare('SELECT * FROM commission_continuity_operations WHERE id=?')
      .bind(binding.operation_id)
      .first<EvidenceRow>(),
    db
      .prepare(
        'SELECT * FROM commission_continuity_settings WHERE setting_id=?',
      )
      .bind(setting.versionId)
      .first<EvidenceRow>(),
  ]);
  if (!operation || !link) return null;
  try {
    const evidence = {
      binding,
      operation,
      link,
      audit: JSON.parse(String(binding.audit_json)),
      current: JSON.parse(String(link.current_json)),
      successor: JSON.parse(String(link.successor_json)),
    };
    const proof: CommissionConsentProof = {
      kind: 'preserved_legacy',
      id: String(binding.id),
      evidence,
    };
    const p = consentPredicate(sellerId, setting, at, proof);
    return (await db
      .prepare(`SELECT 1 WHERE ${p.sql}`)
      .bind(...p.values)
      .first())
      ? proof
      : null;
  } catch {
    return null;
  }
}
