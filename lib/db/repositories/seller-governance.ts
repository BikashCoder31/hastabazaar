import { formAnswerSourceSql } from '../../forms/answer-proof';
import { staffMutationGuard } from './staff-mutation-guard';
import { buildFormAnswerInsert } from './form-answers';
import { digestFormRequest } from '@/lib/forms/submission';
import type { FormAnswerSnapshot } from '@/lib/forms/types';

export type SellerRestrictionMode = 'active' | 'suspended' | 'disabled';
export type ExistingObligationMode =
  | 'allow_existing'
  | 'admin_review'
  | 'stop_fulfillment';

export class SellerGovernanceConflictError extends Error {}

export interface SellerRestrictionRow {
  mode: SellerRestrictionMode;
  suspendedUntil: number | null;
  obligationMode: ExistingObligationMode;
  reasonCode: string;
  privateReason: string;
  version: number;
  appliedAt: number;
  actorName?: string;
}

export const sellerRestrictionReasonCodes = [
  'performance_review',
  'policy_breach',
  'unsafe_goods',
  'suspected_fraud',
  'owner_request',
  'other',
] as const;

const retentionCategories = [
  { category: 'profile_data', startsAt: 'seller relationship closure', period: null, status: 'pending approved retention schedule' },
  { category: 'verification_documents', startsAt: 'verification expiry or seller relationship closure, as approved', period: null, status: 'pending legal/accounting confirmation' },
  { category: 'agreements', startsAt: 'agreement termination or supersession', period: null, status: 'pending approved retention schedule' },
  { category: 'financial_records', startsAt: 'transaction or fiscal-period close, as approved', period: null, status: 'pending accountant confirmation' },
  { category: 'disputes', startsAt: 'final dispute resolution', period: null, status: 'pending legal confirmation; legal hold overrides deletion' },
  { category: 'delivery_evidence', startsAt: 'delivery or final case resolution', period: null, status: 'pending approved retention schedule' },
] as const;

function operationGuard(database: D1Database, predicate: string, bindings: readonly unknown[]) {
  const id = crypto.randomUUID();
  return [
    database
      .prepare(
        `INSERT INTO operation_transaction_guards(id,valid)
         SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`,
      )
      .bind(id, ...bindings),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id),
  ];
}

function sellerRestrictionNotificationStatements(
  database: D1Database,
  options: {
    sellerId: string;
    mode: SellerRestrictionMode;
    version: number;
    requestId: string;
    now: number;
  },
) {
  const subject =
    options.mode === 'active'
      ? 'Your seller access is active'
      : options.mode === 'suspended'
        ? 'Your seller access is temporarily suspended'
        : 'Your seller access is disabled';
  const body =
    options.mode === 'active'
      ? 'Your seller role and eligible product availability have been restored. Sign in to review the current record.'
      : 'New sales are unavailable. Sign in to review the current status and contact support about existing orders, returns, or required next steps.';
  return ['in_app', 'email'].map((channel) =>
    database
      .prepare(
        `INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,
          template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,
          request_id,created_at,business_event_key,required_permission)
         SELECT ?,s.user_id,'customer',?,'business.seller.restriction',?,?,?,?,
          'seller_restriction',s.id,'queued',?,?,'business.seller.restriction',NULL
         FROM seller_profiles s
         WHERE s.id=? AND EXISTS(
           SELECT 1 FROM seller_restrictions r
           WHERE r.seller_id=s.id AND r.version=? AND r.mode=?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        channel,
        subject,
        subject,
        body,
        body,
        `seller-restriction:${options.requestId}:${channel}`,
        options.now,
        options.sellerId,
        options.version,
        options.mode,
      ),
  );
}

export function restrictionIsActive(
  restriction: Pick<SellerRestrictionRow, 'mode' | 'suspendedUntil'> | null,
  now: number,
): boolean {
  return Boolean(
    restriction &&
      (restriction.mode === 'disabled' ||
        (restriction.mode === 'suspended' &&
          restriction.suspendedUntil !== null &&
          restriction.suspendedUntil > now)),
  );
}

export async function applySellerRestriction(
  database: D1Database,
  options: {
    sellerId: string;
    actorId: string;
    mode: SellerRestrictionMode;
    suspendedUntil?: number | null;
    obligationMode: ExistingObligationMode;
    reasonCode: string;
    reason: string;
    expectedVersion: number;
    requestId: string;
    now: number;
    form?: { versionId: string; answers: FormAnswerSnapshot };
  },
): Promise<SellerRestrictionRow> {
  const authority = await staffMutationGuard(
    database,
    options.actorId,
    'seller.suspend',
    SellerGovernanceConflictError,
    'super_admin',
  );
  if (!['active', 'suspended', 'disabled'].includes(options.mode))
    throw new SellerGovernanceConflictError('Choose a supported seller restriction.');
  if (!['allow_existing', 'admin_review', 'stop_fulfillment'].includes(options.obligationMode))
    throw new SellerGovernanceConflictError('Choose how existing obligations will be handled.');
  if (!sellerRestrictionReasonCodes.includes(options.reasonCode as (typeof sellerRestrictionReasonCodes)[number]))
    throw new SellerGovernanceConflictError('Choose an approved restriction reason.');
  const reason = options.reason.trim();
  if (reason.length < 8 || reason.length > 1000)
    throw new SellerGovernanceConflictError('Record a private reason of 8–1000 characters.');
  const suspendedUntil = options.mode === 'suspended' ? options.suspendedUntil ?? null : null;
  if (
    options.mode === 'suspended' &&
    (!suspendedUntil || suspendedUntil <= options.now || suspendedUntil > options.now + 366 * 86_400_000)
  )
    throw new SellerGovernanceConflictError('Choose a future suspension end within one year.');
  if (
    ['unsafe_goods', 'suspected_fraud'].includes(options.reasonCode) &&
    options.obligationMode === 'allow_existing'
  )
    throw new SellerGovernanceConflictError('Unsafe-goods and fraud restrictions require an administrative fulfillment decision.');
  const catalogDigest = options.form ? await digestFormRequest({ sellerId: options.sellerId,
    actorId: options.actorId, mode: options.mode, suspendedUntil,
    obligationMode: options.obligationMode, reasonCode: options.reasonCode,
    reason, expectedVersion: options.expectedVersion, versionId: options.form.versionId,
    answers: options.form.answers }) : null;
  const duplicate = await database
    .prepare('SELECT seller_id AS sellerId,actor_id AS actorId FROM seller_restriction_events WHERE request_id=?')
    .bind(options.requestId)
    .first<{ sellerId: string; actorId: string }>();
  if (duplicate) {
    if (duplicate.sellerId !== options.sellerId || duplicate.actorId !== options.actorId)
      throw new SellerGovernanceConflictError('This request identifier belongs to another governance action.');
    if (options.form) {
      const audit = await database.prepare(`SELECT next_json AS nextJson FROM audit_logs
        WHERE request_id=? AND action='seller.restriction.changed' AND subject_type='seller'
          AND subject_id=? AND actor_id=? LIMIT 1`)
        .bind(`${options.requestId}:audit`, options.sellerId, options.actorId)
        .first<{ nextJson: string | null }>();
      const answer = await database.prepare(`SELECT 1 AS valid FROM ${formAnswerSourceSql(database)} original_answers
        WHERE form_id='staff.seller-governance' AND request_id=? AND config_version_id=?
          AND subject_type='seller' AND subject_id=? AND actor_id=? LIMIT 1`)
        .bind(options.requestId, options.form.versionId, options.sellerId, options.actorId).first();
      let saved: unknown;
      try { saved = audit?.nextJson ? JSON.parse(audit.nextJson).catalogDigest : null; }
      catch { /* Corrupt audit metadata must not authorize replay. */ }
      if (!answer || saved !== catalogDigest)
        throw new SellerGovernanceConflictError('This request identifier belongs to another governance action.');
    }
    const existing = await getCurrentSellerRestriction(database, duplicate.sellerId);
    if (!existing) throw new SellerGovernanceConflictError('Restriction history is inconsistent.');
    if (options.form && existing.version !== options.expectedVersion + 1)
      throw new SellerGovernanceConflictError('The seller restriction changed after this action. Refresh and review the current record.');
    return existing;
  }
  const seller = await database
    .prepare('SELECT user_id AS userId FROM seller_profiles WHERE id=?')
    .bind(options.sellerId)
    .first<{ userId: string }>();
  if (!seller) throw new SellerGovernanceConflictError('Seller not found.');
  if (seller.userId === options.actorId)
    throw new SellerGovernanceConflictError('A Super Admin cannot restrict their own seller role.');
  const current = await getCurrentSellerRestriction(database, options.sellerId);
  const fromMode = restrictionIsActive(current, options.now) ? current!.mode : 'active';
  const nextVersion = (current?.version ?? 0) + 1;
  const currentGuard = current
    ? operationGuard(database, 'EXISTS(SELECT 1 FROM seller_restrictions WHERE seller_id=? AND version=?)', [options.sellerId, options.expectedVersion])
    : operationGuard(database, 'NOT EXISTS(SELECT 1 FROM seller_restrictions WHERE seller_id=?) AND ?=0', [options.sellerId, options.expectedVersion]);
  const mutation = current
    ? database.prepare(
        `UPDATE seller_restrictions SET mode=?,suspended_until=?,obligation_mode=?,
          reason_code=?,private_reason=?,version=?,applied_by=?,applied_at=?,updated_at=?
         WHERE seller_id=? AND version=?`,
      ).bind(options.mode, suspendedUntil, options.obligationMode, options.reasonCode, reason, nextVersion, options.actorId, options.now, options.now, options.sellerId, options.expectedVersion)
    : database.prepare(
        `INSERT INTO seller_restrictions(seller_id,mode,suspended_until,obligation_mode,
          reason_code,private_reason,version,applied_by,applied_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(options.sellerId, options.mode, suspendedUntil, options.obligationMode, options.reasonCode, reason, nextVersion, options.actorId, options.now, options.now);
  try {
    await database.batch([
      ...authority.statements,
      ...currentGuard,
      database
        .prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?')
        .bind(options.sellerId),
      mutation,
      ...operationGuard(database, 'EXISTS(SELECT 1 FROM seller_restrictions WHERE seller_id=? AND version=?)',
        [options.sellerId, nextVersion]),
      database.prepare(
        `INSERT INTO seller_restriction_events(id,seller_id,from_mode,to_mode,suspended_until,
          obligation_mode,reason_code,private_reason,actor_id,request_id,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(crypto.randomUUID(), options.sellerId, fromMode, options.mode, suspendedUntil, options.obligationMode, options.reasonCode, reason, options.actorId, options.requestId, options.now),
      database.prepare(
        `INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,
          previous_json,next_json,request_id,created_at)
         VALUES (?,?,'seller.restriction.changed','seller',?,?,?,?,?,?)`,
      ).bind(
        crypto.randomUUID(), options.actorId, options.sellerId, reason,
        JSON.stringify({ mode: fromMode, version: current?.version ?? 0 }),
        JSON.stringify({ mode: options.mode, suspendedUntil, obligationMode: options.obligationMode,
          version: nextVersion, ...(catalogDigest ? { catalogDigest } : {}) }),
        `${options.requestId}:audit`, options.now,
      ),
      ...(options.form ? [buildFormAnswerInsert(database, { formId: 'staff.seller-governance',
        requestId: options.requestId, versionId: options.form.versionId,
        subjectType: 'seller', subjectId: options.sellerId, actorId: options.actorId,
        answers: options.form.answers, now: options.now })] : []),
      ...sellerRestrictionNotificationStatements(database, {
        sellerId: options.sellerId,
        mode: options.mode,
        version: nextVersion,
        requestId: options.requestId,
        now: options.now,
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('operation_transaction_guards') ||
      message.includes('staff_permission_guards') ||
      message.includes('valid') ||
      message.includes('UNIQUE')
    ) {
      throw new SellerGovernanceConflictError(
        'The seller record changed or authority was revoked. Refresh and try again.',
      );
    }
    throw error;
  }
  const saved = await getCurrentSellerRestriction(database, options.sellerId);
  if (!saved) throw new SellerGovernanceConflictError('Restriction was not saved.');
  return saved;
}

export async function getCurrentSellerRestriction(
  database: D1Database,
  sellerId: string,
): Promise<SellerRestrictionRow | null> {
  return (
    (await database.prepare(
      `SELECT mode,suspended_until AS suspendedUntil,obligation_mode AS obligationMode,
        reason_code AS reasonCode,private_reason AS privateReason,version,
        applied_at AS appliedAt FROM seller_restrictions WHERE seller_id=?`,
    ).bind(sellerId).first<SellerRestrictionRow>()) ?? null
  );
}

export async function runSellerDeletionPreflight(
  database: D1Database,
  options: { sellerId: string; actorId: string; requestId: string; now: number },
) {
  const authority = await staffMutationGuard(database, options.actorId, 'seller.suspend', SellerGovernanceConflictError, 'super_admin');
  const seller = await database.prepare('SELECT user_id AS userId FROM seller_profiles WHERE id=?').bind(options.sellerId).first<{ userId: string }>();
  if (!seller) throw new SellerGovernanceConflictError('Seller not found.');
  if (seller.userId === options.actorId) throw new SellerGovernanceConflictError('A Super Admin cannot run deletion against their own seller role.');
  const existing = await database.prepare('SELECT status,outstanding_json AS outstandingJson,retention_categories_json AS retentionJson FROM seller_deletion_preflights WHERE request_id=?').bind(options.requestId).first<{status:string;outstandingJson:string;retentionJson:string}>();
  if (existing) return { status: existing.status, outstanding: JSON.parse(existing.outstandingJson), retentionCategories: JSON.parse(existing.retentionJson) };
  const outstanding = await database.prepare(
    `SELECT
      (SELECT COUNT(*) FROM order_items WHERE seller_id=? AND fulfillment_status NOT IN ('delivered','cancelled')) AS openOrderItems,
      (SELECT COUNT(*) FROM return_requests r JOIN order_items i ON i.id=r.order_item_id WHERE i.seller_id=? AND r.status NOT IN ('resolved','rejected')) AS openReturns,
      (SELECT COUNT(*) FROM complaints WHERE seller_id=? AND status NOT IN ('resolved','closed','rejected')) AS openComplaints,
      (SELECT COUNT(*) FROM payouts WHERE seller_id=? AND status NOT IN ('paid','rejected','reversed')) AS openPayouts,
      COALESCE((SELECT SUM(amount_paisa) FROM seller_ledger_entries WHERE seller_id=?),0) AS ledgerBalancePaisa`,
  ).bind(options.sellerId, options.sellerId, options.sellerId, options.sellerId, options.sellerId).first<{openOrderItems:number;openReturns:number;openComplaints:number;openPayouts:number;ledgerBalancePaisa:number}>();
  const snapshot = outstanding ?? { openOrderItems: 0, openReturns: 0, openComplaints: 0, openPayouts: 0, ledgerBalancePaisa: 0 };
  const blocked = snapshot.openOrderItems > 0 || snapshot.openReturns > 0 || snapshot.openComplaints > 0 || snapshot.openPayouts > 0 || snapshot.ledgerBalancePaisa !== 0;
  const status = blocked ? 'blocked' : 'awaiting_retention_policy';
  await database.batch([
    ...authority.statements,
    ...operationGuard(database, 'EXISTS(SELECT 1 FROM seller_profiles WHERE id=?)', [options.sellerId]),
    database.prepare(
      `INSERT INTO seller_deletion_preflights(id,seller_id,status,outstanding_json,
        retention_categories_json,requested_by,request_id,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), options.sellerId, status, JSON.stringify(snapshot), JSON.stringify(retentionCategories), options.actorId, options.requestId, options.now),
    database.prepare(
      `INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
       VALUES (?,?,'seller.deletion.preflight','seller',?,'Non-destructive seller deletion preflight',?,?,?)`,
    ).bind(crypto.randomUUID(), options.actorId, options.sellerId, JSON.stringify({ status, outstanding: snapshot }), `${options.requestId}:audit`, options.now),
  ]);
  return { status, outstanding: snapshot, retentionCategories };
}

export async function getSellerGovernance(database: D1Database, sellerId: string) {
  const [restriction, events, preflights] = await Promise.all([
    getCurrentSellerRestriction(database, sellerId),
    database.prepare(
      `SELECT e.id,e.from_mode AS fromMode,e.to_mode AS toMode,e.suspended_until AS suspendedUntil,
        e.obligation_mode AS obligationMode,e.reason_code AS reasonCode,e.private_reason AS privateReason,
        e.created_at AS createdAt,u.display_name AS actorName
       FROM seller_restriction_events e JOIN users u ON u.id=e.actor_id
       WHERE e.seller_id=? ORDER BY e.created_at DESC LIMIT 20`,
    ).bind(sellerId).all<Record<string, unknown>>(),
    database.prepare(
      `SELECT id,status,outstanding_json AS outstandingJson,retention_categories_json AS retentionJson,created_at AS createdAt
       FROM seller_deletion_preflights WHERE seller_id=? ORDER BY created_at DESC LIMIT 5`,
    ).bind(sellerId).all<{id:string;status:string;outstandingJson:string;retentionJson:string;createdAt:number}>(),
  ]);
  return {
    restriction,
    events: events.results,
    preflights: preflights.results.map((row) => ({ ...row, outstanding: JSON.parse(row.outstandingJson), retentionCategories: JSON.parse(row.retentionJson) })),
  };
}
