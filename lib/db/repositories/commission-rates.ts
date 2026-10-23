import { SELLER_AGREEMENT_VERSION } from '../../content/legal-policies';
import { COMMISSION_RULE_VERSION } from '../../marketplace/policy';
import { getCommissionSetting, type CommissionSetting } from './marketplace-settings';
import {
  COMMISSION_NOTICE_MS,
  commissionFeeScheduleText,
  type CommissionRateChange,
  type CommissionRateState,
  type SellerCommissionTerms,
} from '../../commission/rates';
import { staffMutationGuard } from './staff-mutation-guard';

export class CommissionConflictError extends Error {}

async function existingCommissionTerms(db: D1Database, now: number): Promise<SellerCommissionTerms> {
  const setting = await getCommissionSetting(db, now);
  return { basisPoints: setting.basisPoints, version: setting.versionId ?? COMMISSION_RULE_VERSION, acceptedAt: null };
}
const activeRates = `FROM commission_rate_changes r LEFT JOIN commission_rate_cancellations c ON c.rate_id = r.id WHERE c.rate_id IS NULL`;

export async function getCommissionRateState(
  db: D1Database,
  now = Date.now(),
): Promise<CommissionRateState> {
  const [control, current, sellers, history, baseline] = await Promise.all([
    db
      .prepare("SELECT revision FROM commission_control WHERE id = 'default'")
      .first<{ revision: number }>(),
    db
      .prepare(
        `SELECT r.id AS version, r.basis_points AS basisPoints ${activeRates} AND r.effective_at <= ? ORDER BY r.effective_at DESC, r.created_at DESC, r.id DESC LIMIT 1`,
      )
      .bind(now)
      .first<SellerCommissionTerms>(),
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM seller_profiles WHERE status = 'approved'",
      )
      .first<{ n: number }>(),
    db
      .prepare(`SELECT r.id, r.basis_points AS basisPoints, r.effective_at AS effectiveAt,
      r.agreement_version AS agreementVersion, r.terms_text AS termsText, r.reason,
      r.created_at AS createdAt, u.display_name AS createdByName,
      c.cancelled_at AS cancelledAt, cu.display_name AS cancelledByName, c.reason AS cancellationReason,
      (SELECT COUNT(*) FROM commission_rate_acceptances a JOIN seller_profiles s ON s.id = a.seller_id WHERE a.rate_id = r.id AND s.status = 'approved') AS acceptedSellers
      FROM commission_rate_changes r JOIN users u ON u.id = r.created_by
      LEFT JOIN commission_rate_cancellations c ON c.rate_id = r.id
      LEFT JOIN users cu ON cu.id = c.cancelled_by ORDER BY r.created_at DESC, r.id DESC`)
      .all<CommissionRateChange>(),
    existingCommissionTerms(db, now),
  ]);
  if (!control)
    throw new CommissionConflictError(
      'Commission storage is unavailable. Apply the commission workspace migration.',
    );
  return {
    asOf: now,
    revision: Number(control.revision),
    current: current
      ? {
          ...current,
          basisPoints: Number(current.basisPoints),
          acceptedAt: null,
        }
      : baseline,
    approvedSellers: Number(sellers?.n ?? 0),
    history: history.results.map((r) => ({
      ...r,
      basisPoints: Number(r.basisPoints),
      effectiveAt: Number(r.effectiveAt),
      createdAt: Number(r.createdAt),
      acceptedSellers: Number(r.acceptedSellers),
      status:
        r.cancelledAt !== null
          ? 'cancelled'
          : r.effectiveAt > now
            ? 'scheduled'
            : r.id === current?.version
              ? 'active'
              : 'previous',
    })),
  };
}

export async function getSellerCommissionTerms(
  db: D1Database,
  sellerId: string,
  now = Date.now(),
): Promise<SellerCommissionTerms> {
  const row = await db
    .prepare(`SELECT r.id AS version, r.basis_points AS basisPoints, a.accepted_at AS acceptedAt
    FROM commission_rate_changes r JOIN commission_rate_acceptances a ON a.rate_id = r.id
    LEFT JOIN commission_rate_cancellations c ON c.rate_id = r.id
    WHERE a.seller_id = ? AND c.rate_id IS NULL AND r.effective_at <= ? AND a.accepted_at <= ?
    ORDER BY r.effective_at DESC, r.created_at DESC, r.id DESC LIMIT 1`)
    .bind(sellerId, now, now)
    .first<SellerCommissionTerms>();
  return row
    ? {
        ...row,
        basisPoints: Number(row.basisPoints),
        acceptedAt: Number(row.acceptedAt),
      }
    : existingCommissionTerms(db, now);
}

function guard(
  db: D1Database,
  predicate: string,
  bindings: unknown[],
): D1PreparedStatement[] {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        `INSERT INTO operation_transaction_guards(id, valid) SELECT ?, CASE WHEN ${predicate} THEN 1 ELSE 0 END`,
      )
      .bind(id, ...bindings),
    db
      .prepare('DELETE FROM operation_transaction_guards WHERE id = ?')
      .bind(id),
  ];
}

function revisionGuard(db: D1Database, revision: number) {
  return [
    db.prepare(
      "UPDATE commission_control SET revision = revision WHERE id = 'default'",
    ),
    ...guard(
      db,
      "EXISTS(SELECT 1 FROM commission_control WHERE id = 'default' AND revision = ?)",
      [revision],
    ),
  ];
}

function reasonText(reason: string) {
  if (
    typeof reason !== 'string' ||
    reason.trim().length < 10 ||
    reason.trim().length > 1000
  )
    throw new RangeError('Add a reason of 10–1,000 characters.');
  return reason.trim();
}

export async function scheduleCommissionRate(
  db: D1Database,
  o: {
    actorId: string;
    requestId: string;
    expectedRevision: number;
    basisPoints: number;
    effectiveAt: number;
    reason: string;
    now: number;
  },
): Promise<{ id: string }> {
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'commercial_policy.manage',
    CommissionConflictError,
  );
  const reason = reasonText(o.reason);
  if (
    !o.requestId ||
    o.requestId.length > 100 ||
    !Number.isInteger(o.expectedRevision) ||
    o.expectedRevision < 0
  )
    throw new RangeError('Reload Commission and try again.');
  if (
    !Number.isInteger(o.basisPoints) ||
    o.basisPoints < 0 ||
    o.basisPoints > 10000
  )
    throw new RangeError(
      'Enter a rate from 0 to 100%, with up to two decimal places.',
    );
  const retry = await db
    .prepare(
      'SELECT id, basis_points AS bps, effective_at AS date, reason, created_by AS actor FROM commission_rate_changes WHERE id = ?',
    )
    .bind(o.requestId)
    .first<{
      id: string;
      bps: number;
      date: number;
      reason: string;
      actor: string;
    }>();
  if (retry) {
    if (
      retry.bps !== o.basisPoints ||
      retry.date !== o.effectiveAt ||
      retry.reason !== reason ||
      retry.actor !== o.actorId
    )
      throw new CommissionConflictError(
        'This request was already used for another change.',
      );
    return { id: retry.id };
  }
  if (
    !Number.isSafeInteger(o.effectiveAt) ||
    o.effectiveAt < o.now + COMMISSION_NOTICE_MS
  )
    throw new RangeError(
      'Allow at least 15 days of advance notice in Nepal time.',
    );
  try {
    await db.batch([
      ...revisionGuard(db, o.expectedRevision),
      ...authority.statements,
      ...guard(
        db,
        `NOT EXISTS(SELECT 1 ${activeRates} AND r.effective_at > ?)`,
        [o.now],
      ),
      db
        .prepare(
          'INSERT INTO commission_rate_changes(id, basis_points, effective_at, agreement_version, terms_text, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          o.requestId,
          o.basisPoints,
          o.effectiveAt,
          SELLER_AGREEMENT_VERSION,
          commissionFeeScheduleText(o.basisPoints, o.effectiveAt),
          reason,
          o.actorId,
          o.now,
        ),
      db.prepare(
        "UPDATE commission_control SET revision = revision + 1 WHERE id = 'default'",
      ),
      db
        .prepare(
          "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at) VALUES (?,?,'commission.rate.scheduled','commission_rate',?,?,NULL,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          o.actorId,
          o.requestId,
          reason,
          JSON.stringify({
            basisPoints: o.basisPoints,
            effectiveAt: o.effectiveAt,
            agreementVersion: SELLER_AGREEMENT_VERSION,
          }),
          `commission:schedule:${o.requestId}`,
          o.now,
        ),
    ]);
  } catch {
    throw new CommissionConflictError(
      'Commission changed or a future rate is already scheduled. Refresh Commission before trying again.',
    );
  }
  return { id: o.requestId };
}

export async function cancelCommissionRate(
  db: D1Database,
  o: {
    actorId: string;
    rateId: string;
    expectedRevision: number;
    requestId: string;
    reason: string;
    now: number;
  },
): Promise<void> {
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'commercial_policy.manage',
    CommissionConflictError,
  );
  const reason = reasonText(o.reason);
  if (
    !Number.isInteger(o.expectedRevision) ||
    o.expectedRevision < 0 ||
    !o.requestId ||
    o.requestId.length > 100
  )
    throw new RangeError('Reload Commission and try again.');
  const previous = await db
    .prepare(
      'SELECT request_id AS requestId, reason, cancelled_by AS actor FROM commission_rate_cancellations WHERE rate_id = ?',
    )
    .bind(o.rateId)
    .first<{ requestId: string; reason: string; actor: string }>();
  if (
    previous?.requestId === o.requestId &&
    previous.reason === reason &&
    previous.actor === o.actorId
  )
    return;
  try {
    await db.batch([
      ...revisionGuard(db, o.expectedRevision),
      ...authority.statements,
      ...guard(
        db,
        `EXISTS(SELECT 1 ${activeRates} AND r.id = ? AND r.effective_at > ?)`,
        [o.rateId, o.now],
      ),
      db
        .prepare(
          'INSERT INTO commission_rate_cancellations(rate_id, request_id, reason, cancelled_by, cancelled_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(o.rateId, o.requestId, reason, o.actorId, o.now),
      db.prepare(
        "UPDATE commission_control SET revision = revision + 1 WHERE id = 'default'",
      ),
      db
        .prepare(
          "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at) VALUES (?,?,'commission.rate.cancelled','commission_rate',?,?,NULL,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          o.actorId,
          o.rateId,
          reason,
          JSON.stringify({ cancelledAt: o.now }),
          `commission:cancel:${o.requestId}`,
          o.now,
        ),
    ]);
  } catch {
    throw new CommissionConflictError(
      'Only a future scheduled rate can be cancelled. Refresh Commission and try again.',
    );
  }
}

export async function getSellerCommissionNotices(
  db: D1Database,
  sellerId: string,
) {
  const result = await db
    .prepare(`SELECT r.id, r.basis_points AS basisPoints, r.effective_at AS effectiveAt, r.terms_text AS termsText, r.agreement_version AS agreementVersion
    ${activeRates} AND NOT EXISTS(SELECT 1 FROM commission_rate_acceptances a WHERE a.rate_id = r.id AND a.seller_id = ?)
    AND r.effective_at >= COALESCE((SELECT MAX(ar.effective_at) FROM commission_rate_acceptances a JOIN commission_rate_changes ar ON ar.id = a.rate_id LEFT JOIN commission_rate_cancellations ac ON ac.rate_id = ar.id WHERE a.seller_id = ? AND ac.rate_id IS NULL), 0)
    ORDER BY r.effective_at DESC LIMIT 1`)
    .bind(sellerId, sellerId)
    .all<
      Pick<
        CommissionRateChange,
        'id' | 'basisPoints' | 'effectiveAt' | 'termsText' | 'agreementVersion'
      >
    >();
  // Database drivers may return row objects with custom or null prototypes.
  // The notice crosses a React server-to-client boundary and must be plain.
  return result.results.map((notice) => ({ ...notice }));
}

export async function acceptCommissionRate(
  db: D1Database,
  o: { sellerId: string; userId: string; rateId: string; now: number },
): Promise<void> {
  try {
    await db.batch([
      // Lock the schedule revision while accepting, so cancellation cannot race acceptance.
      db.prepare(
        "UPDATE commission_control SET revision = revision WHERE id = 'default'",
      ),
      ...guard(
        db,
        `EXISTS(SELECT 1 FROM commission_rate_changes r JOIN seller_profiles s ON s.id = ? JOIN users u ON u.id = s.user_id
        LEFT JOIN commission_rate_cancellations c ON c.rate_id = r.id WHERE r.id = ? AND c.rate_id IS NULL AND s.user_id = ? AND s.status = 'approved' AND u.status = 'active'
        AND s.seller_agreement_version = r.agreement_version AND r.created_at <= ?)`,
        [o.sellerId, o.rateId, o.userId, o.now],
      ),
      db
        .prepare(
          'INSERT OR IGNORE INTO commission_rate_acceptances(rate_id, seller_id, actor_id, accepted_at) VALUES (?, ?, ?, ?)',
        )
        .bind(o.rateId, o.sellerId, o.userId, o.now),
    ]);
  } catch {
    throw new CommissionConflictError(
      'Accept the referenced seller agreement first, then refresh and review the available fee schedule.',
    );
  }
}

/** Capture the actual owner acceptance used for this checkout, without inventing a renewal. */
export async function getCommissionCheckoutAcceptance(
  db: D1Database, sellerId: string, setting: CommissionSetting, at: number,
): Promise<string | null> {
  const row = await db.prepare(`SELECT a.id FROM seller_agreement_acceptance_history a
    JOIN seller_profiles s ON s.id=a.seller_id
    WHERE a.seller_id=? AND a.commission_setting_version_id=? AND a.commission_bps=?
      AND a.agreement_version=? AND a.accepted_by=s.user_id AND a.accepted_at<=?
    ORDER BY a.accepted_at DESC,a.id DESC LIMIT 1`)
    .bind(sellerId, setting.versionId, setting.basisPoints, SELLER_AGREEMENT_VERSION, at).first<{ id: string }>();
  return row?.id ?? null;
}

/** Revalidate the selected base, actual acceptance and accepted supplement at the
 * recorded placement instant, after customer-control acquisition. A changed
 * identity requires fresh review; it never silently reprices an accepted order. */
export function commissionCheckoutGuards(
  db: D1Database,
  terms: Record<string, SellerCommissionTerms>,
  setting: CommissionSetting,
  acceptanceIds: Record<string, string>,
  placedAt: number,
) {
  if (!Object.keys(terms).length) return [];
  const selectedSupplement = `FROM commission_rate_changes r
    JOIN commission_rate_acceptances a ON a.rate_id=r.id
    LEFT JOIN commission_rate_cancellations c ON c.rate_id=r.id
    WHERE a.seller_id=? AND c.rate_id IS NULL AND r.effective_at<=? AND a.accepted_at<=?
    ORDER BY r.effective_at DESC,r.created_at DESC,r.id DESC LIMIT 1`;
  return [
    ...guard(db, `EXISTS(SELECT 1 FROM business_setting_versions WHERE id=? AND id=(
      SELECT id FROM business_setting_versions WHERE setting_key='independent_seller_commission_bps'
      AND status='published' AND effective_from<=? AND (effective_until IS NULL OR effective_until>?)
      ORDER BY effective_from DESC,version DESC LIMIT 1))`, [setting.versionId, placedAt, placedAt]),
    ...Object.entries(terms).flatMap(([sellerId, term]) => [
      ...guard(db, `EXISTS(SELECT 1 FROM seller_agreement_acceptance_history a JOIN seller_profiles s ON s.id=a.seller_id
        JOIN users u ON u.id=s.user_id WHERE a.id=? AND a.seller_id=? AND a.commission_setting_version_id=?
        AND a.commission_bps=? AND a.agreement_version=? AND a.accepted_by=s.user_id AND a.accepted_at<=?
        AND s.seller_agreement_version=a.agreement_version AND s.status='approved' AND u.status='active')`,
        [acceptanceIds[sellerId], sellerId, setting.versionId, setting.basisPoints, SELLER_AGREEMENT_VERSION, placedAt]),
      ...guard(db, `COALESCE((SELECT r.id ${selectedSupplement}),?)=?
        AND COALESCE((SELECT r.basis_points ${selectedSupplement}),?)=?
        AND COALESCE((SELECT a.accepted_at ${selectedSupplement}),-1)=?`,
        [sellerId, placedAt, placedAt, setting.versionId ?? COMMISSION_RULE_VERSION, term.version,
          sellerId, placedAt, placedAt, setting.basisPoints, term.basisPoints,
          sellerId, placedAt, placedAt, term.acceptedAt ?? -1]),
    ]),
  ];
}
