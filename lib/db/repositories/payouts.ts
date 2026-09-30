import {staffMutationGuard} from './staff-mutation-guard';
import { operationalBusinessNotificationStatements } from '../../operations/business-notifications';
import type { StaffRole } from '@/lib/auth/staff';
import { phaseOneMarketplacePolicy } from '@/lib/marketplace/policy';
import { buildFormAnswerInsert } from './form-answers';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { digestFormRequest, formRequestReplay, FormRequestConflictError } from '@/lib/forms/submission';

const payoutPolicy = phaseOneMarketplacePolicy.value.payouts;
const dayMs = 86_400_000;
function standardLedgerEligibility(alias: string): string {
  return `NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=${alias}.order_item_id)
    AND NOT EXISTS(SELECT 1 FROM order_items mi WHERE mi.id=${alias}.order_item_id
      AND mi.commission_rule_version LIKE 'managed-%')`;
}

export type PayoutStatus =
  | 'prepared'
  | 'approved'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'rejected'
  | 'reversed'
  | 'scheduled';
export type PayoutOperation =
  | 'approve'
  | 'reject'
  | 'start_processing'
  | 'mark_paid'
  | 'mark_failed';

export class PayoutConflictError extends Error {}

export function buildEarningsAccrualStatements(
  database: D1Database,
  options: { orderId?: string; now: number },
): D1PreparedStatement[] {
  const orderFilter = options.orderId ? 'AND orders.id = ?' : '';
  const orderBindings = options.orderId ? [options.orderId] : [];
  const availableOffset = payoutPolicy.deliveryHoldDays * dayMs;
  const reserveReleaseOffset = payoutPolicy.reserveReleaseAfterDays * dayMs;
  const reserveWindow = payoutPolicy.reserveAppliesForDays * dayMs;
  const base = `
    FROM order_items
    INNER JOIN orders ON orders.id = order_items.order_id
    INNER JOIN seller_profiles ON seller_profiles.id = order_items.seller_id
    WHERE orders.status = 'delivered' AND orders.payment_status = 'paid'
      AND order_items.fulfillment_status = 'delivered'
      AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=order_items.id)
      AND COALESCE(order_items.commission_rule_version,'') NOT LIKE 'managed-%'
      AND NOT EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=orders.id AND ((j.status NOT IN ('delivered','cancelled')) OR p.remitted_paisa<>p.cod_due_paisa))
      ${orderFilter}`;

  return [
    database
      .prepare(
        `INSERT OR IGNORE INTO seller_ledger_entries (
        id, seller_id, order_item_id, refund_id, payout_id, type, amount_paisa,
        available_at, description, created_at
      ) SELECT lower(hex(randomblob(16))), order_items.seller_id, order_items.id,
        NULL, NULL, 'sale', order_items.line_total_paisa,
        COALESCE(orders.delivered_at, ?) + ?,
        'Delivered item sale', COALESCE(orders.delivered_at, ?)
        ${base}`,
      )
      .bind(options.now, availableOffset, options.now, ...orderBindings),
    database
      .prepare(
        `INSERT OR IGNORE INTO seller_ledger_entries (
        id, seller_id, order_item_id, refund_id, payout_id, type, amount_paisa,
        available_at, description, created_at
      ) SELECT lower(hex(randomblob(16))), order_items.seller_id, order_items.id,
        NULL, NULL, 'commission', -order_items.commission_paisa,
        COALESCE(orders.delivered_at, ?) + ?,
        'HastaBazaar commission', COALESCE(orders.delivered_at, ?)
        ${base}`,
      )
      .bind(options.now, availableOffset, options.now, ...orderBindings),
    database
      .prepare(
        `INSERT OR IGNORE INTO seller_ledger_entries (
        id, seller_id, order_item_id, refund_id, payout_id, type, amount_paisa,
        available_at, description, created_at
      ) SELECT lower(hex(randomblob(16))), order_items.seller_id, order_items.id,
        NULL, NULL, 'reserve_hold',
        -CAST(ROUND((order_items.line_total_paisa - order_items.commission_paisa) * ? / 10000.0) AS INTEGER),
        COALESCE(orders.delivered_at, ?) + ?,
        'New seller reserve hold', COALESCE(orders.delivered_at, ?)
        ${base} AND (seller_profiles.approved_at IS NULL OR seller_profiles.approved_at + ? > COALESCE(orders.delivered_at, ?))`,
      )
      .bind(
        payoutPolicy.newSellerReserveBps,
        options.now,
        availableOffset,
        options.now,
        ...orderBindings,
        reserveWindow,
        options.now,
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO seller_ledger_entries (
        id, seller_id, order_item_id, refund_id, payout_id, type, amount_paisa,
        available_at, description, created_at
      ) SELECT lower(hex(randomblob(16))), order_items.seller_id, order_items.id,
        NULL, NULL, 'reserve_release',
        CAST(ROUND((order_items.line_total_paisa - order_items.commission_paisa) * ? / 10000.0) AS INTEGER),
        COALESCE(orders.delivered_at, ?) + ?,
        'New seller reserve release', COALESCE(orders.delivered_at, ?)
        ${base} AND (seller_profiles.approved_at IS NULL OR seller_profiles.approved_at + ? > COALESCE(orders.delivered_at, ?))`,
      )
      .bind(
        payoutPolicy.newSellerReserveBps,
        options.now,
        reserveReleaseOffset,
        options.now,
        ...orderBindings,
        reserveWindow,
        options.now,
      ),
  ];
}

export async function accrueExistingDeliveredEarnings(
  database: D1Database,
  options: { actorId: string; requestId: string; now: number },
): Promise<void> {
  const authority=await staffMutationGuard(database,options.actorId,'payout.prepare',PayoutConflictError);
  if (
    await database
      .prepare(`SELECT id FROM audit_logs WHERE request_id = ? LIMIT 1`)
      .bind(options.requestId)
      .first()
  )
    return;
  await database.batch([
    ...buildEarningsAccrualStatements(database, { now: options.now }),
    database
      .prepare(
        `INSERT INTO audit_logs (
        id, actor_id, action, subject_type, subject_id, reason,
        previous_json, next_json, request_id, ip_hash, created_at
      ) VALUES (?, ?, 'seller.earnings.accrued', 'seller_ledger', NULL,
        'Created missing immutable earnings entries for delivered order items',
        NULL, ?, ?, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        JSON.stringify({ idempotent: true }),
        options.requestId,
        options.now,
      ),
    ...authority.statements,
  ]);
}

export interface SellerFinanceSummary {
  availablePaisa: number;
  pendingPaisa: number;
  grossSalesPaisa: number;
  commissionPaisa: number;
  commissionReversalPaisa: number;
  refundPaisa: number;
  paidPaisa: number;
}

export interface SellerLedgerRow {
  id: string;
  type: string;
  amountPaisa: number;
  availableAt: number | null;
  description: string;
  createdAt: number;
  orderNumber: string | null;
  productName: string | null;
  payoutNumber: string | null;
  payoutStatus: string | null;
  isAvailable: number;
}

export interface PayoutRow {
  id: string;
  payoutNumber: string;
  sellerId: string;
  tradingName: string;
  status: PayoutStatus;
  amountPaisa: number;
  destinationReference: string;
  preparedBy: string;
  preparedByName: string;
  approvedBy: string | null;
  approvedByName: string | null;
  providerReference: string | null;
  note: string | null;
  scheduledFor: number;
  approvedAt: number | null;
  processedAt: number | null;
  paidAt: number | null;
  failedAt: number | null;
  failureReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PayoutEventRow {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  actorName: string;
  actorType: string;
  note: string;
  createdAt: number;
}

export interface PayoutDetail extends PayoutRow {
  entries: readonly SellerLedgerRow[];
  events: readonly PayoutEventRow[];
}

const payoutSelect = `SELECT payouts.id, payouts.payout_number AS payoutNumber,
  payouts.seller_id AS sellerId, seller_profiles.trading_name AS tradingName,
  payouts.status, payouts.amount_paisa AS amountPaisa,
  payouts.destination_reference AS destinationReference,
  payouts.prepared_by AS preparedBy, preparer.display_name AS preparedByName,
  payouts.approved_by AS approvedBy, approver.display_name AS approvedByName,
  payouts.provider_reference AS providerReference, payouts.note,
  payouts.scheduled_for AS scheduledFor, payouts.approved_at AS approvedAt,
  payouts.processed_at AS processedAt, payouts.paid_at AS paidAt,
  payouts.failed_at AS failedAt, payouts.failure_reason AS failureReason,
  payouts.created_at AS createdAt, payouts.updated_at AS updatedAt
  FROM payouts
  INNER JOIN seller_profiles ON seller_profiles.id = payouts.seller_id
  INNER JOIN users AS preparer ON preparer.id = payouts.prepared_by
  LEFT JOIN users AS approver ON approver.id = payouts.approved_by`;

export async function getSellerFinanceSummary(
  database: D1Database,
  sellerId: string,
  now = Date.now(),
): Promise<SellerFinanceSummary> {
  const ledger = await database
    .prepare(
      `SELECT
      COALESCE(SUM(CASE WHEN payout_entries.ledger_entry_id IS NULL AND seller_ledger_entries.available_at <= ? THEN seller_ledger_entries.amount_paisa ELSE 0 END), 0) AS availablePaisa,
      COALESCE(SUM(CASE WHEN payout_entries.ledger_entry_id IS NULL AND seller_ledger_entries.available_at > ? THEN seller_ledger_entries.amount_paisa ELSE 0 END), 0) AS pendingPaisa,
      COALESCE(SUM(CASE WHEN seller_ledger_entries.type = 'sale' THEN seller_ledger_entries.amount_paisa ELSE 0 END), 0) AS grossSalesPaisa,
      COALESCE(SUM(CASE WHEN seller_ledger_entries.type = 'commission' THEN seller_ledger_entries.amount_paisa ELSE 0 END), 0) AS commissionPaisa,
      COALESCE(SUM(CASE WHEN seller_ledger_entries.type = 'commission_reversal' THEN seller_ledger_entries.amount_paisa ELSE 0 END), 0) AS commissionReversalPaisa,
      COALESCE(SUM(CASE WHEN seller_ledger_entries.type = 'refund' THEN seller_ledger_entries.amount_paisa ELSE 0 END), 0) AS refundPaisa
     FROM seller_ledger_entries
     LEFT JOIN payout_entries ON payout_entries.ledger_entry_id = seller_ledger_entries.id AND payout_entries.released_at IS NULL
     WHERE seller_ledger_entries.seller_id = ? AND ${standardLedgerEligibility('seller_ledger_entries')}`,
    )
    .bind(now, now, sellerId)
    .first<Omit<SellerFinanceSummary, 'paidPaisa'>>();
  const paid = await database
    .prepare(
      `SELECT COALESCE(SUM(amount_paisa), 0) AS paidPaisa FROM payouts WHERE seller_id = ? AND status = 'paid'`,
    )
    .bind(sellerId)
    .first<{ paidPaisa: number }>();
  return {
    availablePaisa: Number(ledger?.availablePaisa ?? 0),
    pendingPaisa: Number(ledger?.pendingPaisa ?? 0),
    grossSalesPaisa: Number(ledger?.grossSalesPaisa ?? 0),
    commissionPaisa: Number(ledger?.commissionPaisa ?? 0),
    commissionReversalPaisa: Number(ledger?.commissionReversalPaisa ?? 0),
    refundPaisa: Number(ledger?.refundPaisa ?? 0),
    paidPaisa: Number(paid?.paidPaisa ?? 0),
  };
}

export async function listSellerLedger(
  database: D1Database,
  sellerId: string,
  limit = 150,
  now = Date.now(),
): Promise<readonly SellerLedgerRow[]> {
  const result = await database
    .prepare(
      `SELECT seller_ledger_entries.id, seller_ledger_entries.type,
      seller_ledger_entries.amount_paisa AS amountPaisa,
      seller_ledger_entries.available_at AS availableAt,
      seller_ledger_entries.description, seller_ledger_entries.created_at AS createdAt,
      CASE WHEN seller_ledger_entries.available_at <= ? THEN 1 ELSE 0 END AS isAvailable,
      orders.order_number AS orderNumber,
      order_items.product_name_snapshot AS productName,
      payouts.payout_number AS payoutNumber, payouts.status AS payoutStatus
     FROM seller_ledger_entries
     LEFT JOIN order_items ON order_items.id = seller_ledger_entries.order_item_id
     LEFT JOIN orders ON orders.id = order_items.order_id
     LEFT JOIN payout_entries ON payout_entries.ledger_entry_id = seller_ledger_entries.id AND payout_entries.released_at IS NULL
     LEFT JOIN payouts ON payouts.id = payout_entries.payout_id
     WHERE seller_ledger_entries.seller_id = ?
     ORDER BY seller_ledger_entries.created_at DESC, seller_ledger_entries.id DESC LIMIT ?`,
    )
    .bind(now, sellerId, limit)
    .all<SellerLedgerRow>();
  return result.results;
}

export async function listSellerPayouts(
  database: D1Database,
  sellerId: string,
): Promise<readonly PayoutRow[]> {
  const result = await database
    .prepare(
      `${payoutSelect} WHERE payouts.seller_id = ? ORDER BY payouts.created_at DESC LIMIT 100`,
    )
    .bind(sellerId)
    .all<PayoutRow>();
  return result.results;
}

export interface PayoutCandidate {
  sellerId: string;
  tradingName: string;
  destinationReference: string;
  amountPaisa: number;
  entryCount: number;
}

export async function listPayoutCandidates(
  database: D1Database,
  now = Date.now(),
): Promise<readonly PayoutCandidate[]> {
  const result = await database
    .prepare(
      `SELECT seller_profiles.id AS sellerId, seller_profiles.trading_name AS tradingName,
      seller_profiles.payout_account_reference AS destinationReference,
      SUM(seller_ledger_entries.amount_paisa) AS amountPaisa,
      COUNT(*) AS entryCount
     FROM seller_ledger_entries
     INNER JOIN seller_profiles ON seller_profiles.id = seller_ledger_entries.seller_id
     LEFT JOIN payout_entries ON payout_entries.ledger_entry_id = seller_ledger_entries.id AND payout_entries.released_at IS NULL
     WHERE seller_profiles.status = 'approved'
       AND seller_profiles.payout_account_reference IS NOT NULL
       AND trim(seller_profiles.payout_account_reference) != ''
       AND seller_ledger_entries.available_at <= ?
       AND ${standardLedgerEligibility('seller_ledger_entries')}
       AND payout_entries.ledger_entry_id IS NULL
     GROUP BY seller_profiles.id
     HAVING SUM(seller_ledger_entries.amount_paisa) > 0
     ORDER BY amountPaisa DESC`,
    )
    .bind(now)
    .all<PayoutCandidate>();
  return result.results;
}

export async function listPayoutsForOperations(
  database: D1Database,
): Promise<readonly PayoutRow[]> {
  const result = await database
    .prepare(
      `${payoutSelect} ORDER BY CASE payouts.status WHEN 'prepared' THEN 0 WHEN 'approved' THEN 1 WHEN 'processing' THEN 2 WHEN 'failed' THEN 3 ELSE 4 END, payouts.created_at DESC LIMIT 150`,
    )
    .all<PayoutRow>();
  return result.results;
}

export interface PayoutRequestRow {
  id: string;
  sellerId: string;
  tradingName: string;
  status: 'submitted' | 'prepared' | 'rejected';
  sellerNote: string;
  availableAmountSnapshotPaisa: number;
  payoutId: string | null;
  processingNote: string | null;
  createdAt: number;
}

const payoutRequestSelect = `SELECT payout_requests.id, payout_requests.seller_id AS sellerId,
  seller_profiles.trading_name AS tradingName, payout_requests.status,
  payout_requests.seller_note AS sellerNote,
  payout_requests.available_amount_snapshot_paisa AS availableAmountSnapshotPaisa,
  payout_requests.payout_id AS payoutId, payout_requests.processing_note AS processingNote,
  payout_requests.created_at AS createdAt FROM payout_requests
  INNER JOIN seller_profiles ON seller_profiles.id = payout_requests.seller_id`;

export async function listPayoutRequests(
  database: D1Database,
  sellerId?: string,
): Promise<readonly PayoutRequestRow[]> {
  const filter = sellerId ? 'WHERE payout_requests.seller_id = ?' : '';
  const result = await database
    .prepare(
      `${payoutRequestSelect} ${filter} ORDER BY payout_requests.created_at DESC LIMIT 150`,
    )
    .bind(...(sellerId ? [sellerId] : []))
    .all<PayoutRequestRow>();
  return result.results;
}

export async function requestSellerPayout(
  database: D1Database,
  options: {
    sellerId: string;
    actorId: string;
    note: string;
    requestId: string;
    now: number;
    form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot };
  },
): Promise<string> {
  const catalogDigest = options.form ? await digestFormRequest({ sellerId: options.sellerId,
    note: options.note.trim(), versionId: options.form.versionId, answers: options.form.answers }) : null;
  if (options.form) {
    const replay = await formRequestReplay(database, { formId: 'seller.payout-request',
      requestId: options.requestId, actorId: options.actorId, action: 'payout.seller.requested',
      digest: catalogDigest! });
    if (replay) {
      const owned = await database.prepare('SELECT id FROM payout_requests WHERE id=? AND seller_id=? AND created_request_id=? LIMIT 1')
        .bind(replay, options.sellerId, options.requestId).first();
      if (!owned) throw new FormRequestConflictError('Request reference is already used for another payout.');
      return replay;
    }
  }
  const duplicate = await database
    .prepare(`SELECT id FROM payout_requests WHERE created_request_id = ?`)
    .bind(options.requestId)
    .first<{ id: string }>();
  if (duplicate) {
    if (options.form) throw new FormRequestConflictError('Request reference is already used.');
    return duplicate.id;
  }
  const open = await database
    .prepare(
      `SELECT id FROM payout_requests WHERE seller_id = ? AND status = 'submitted' LIMIT 1`,
    )
    .bind(options.sellerId)
    .first();
  if (open)
    throw new PayoutConflictError(
      'A payout request is already awaiting review.',
    );
  const summary = await getSellerFinanceSummary(
    database,
    options.sellerId,
    options.now,
  );
  if (summary.availablePaisa <= 0)
    throw new PayoutConflictError(
      'A positive available balance is required to request a payout.',
    );
  const note = options.note.trim();
  if (note.length < 8 || note.length > 500)
    throw new PayoutConflictError('Add a payout note of 8–500 characters.');
  const id = crypto.randomUUID();
  try { await database.batch([
    database
      .prepare(
        `INSERT INTO payout_requests (id, seller_id, status, seller_note, available_amount_snapshot_paisa, payout_id, processed_by, processing_note, created_request_id, operation_request_id, created_at, updated_at) VALUES (?, ?, 'submitted', ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?)`,
      )
      .bind(
        id,
        options.sellerId,
        note,
        summary.availablePaisa,
        options.requestId,
        options.now,
        options.now,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at) VALUES (?, ?, 'payout.seller.requested', 'payout_request', ?, ?, NULL, ?, ?, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        id,
        note,
        JSON.stringify({
          status: 'submitted',
          availableAmountSnapshotPaisa: summary.availablePaisa,
          ...(catalogDigest ? { catalogDigest } : {}),
        }),
        options.requestId,
        options.now,
      ),
    ...await operationalBusinessNotificationStatements(database,{kind:'payout.requested',sourceId:id,eventId:options.requestId,actorId:options.actorId,now:options.now}),
    ...(options.form ? [buildFormAnswerInsert(database, { formId: 'seller.payout-request',
      requestId: options.requestId, versionId: options.form.versionId, subjectType: 'payout_request',
      subjectId: id, actorId: options.actorId, answers: options.form.answers, now: options.now })] : []),
  ]); } catch (error) {
    if (options.form) {
      const replay = await formRequestReplay(database, { formId: 'seller.payout-request',
        requestId: options.requestId, actorId: options.actorId, action: 'payout.seller.requested',
        digest: catalogDigest! });
      if (replay) {
        const owned = await database.prepare('SELECT id FROM payout_requests WHERE id=? AND seller_id=? AND created_request_id=? LIMIT 1')
          .bind(replay, options.sellerId, options.requestId).first();
        if (!owned) throw new FormRequestConflictError('Request reference is already used for another payout.');
        return replay;
      }
    }
    throw error;
  }
  return id;
}

export async function processPayoutRequest(
  database: D1Database,
  options: {
    id: string;
    actorId: string;
    actorRole: StaffRole;
    action: 'prepare' | 'reject';
    note: string;
    requestId: string;
    now: number;
    form?: {requestId:string;versionId:string;answers:FormAnswerSnapshot};
  },
): Promise<void> {
  const authority=await staffMutationGuard(database,options.actorId,'payout.prepare',PayoutConflictError,options.actorRole);
  if(options.form && options.form.requestId!==options.requestId)
    throw new PayoutConflictError('Form request does not match the payout decision.');
  const note=options.note.trim();
  if (note.length < 8 || note.length > 1000)
    throw new PayoutConflictError('Add an operational note of 8–1,000 characters.');
  const formDigest=options.form?await digestFormRequest({id:options.id,actorId:options.actorId,
    actorRole:options.actorRole,action:options.action,note,versionId:options.form.versionId,
    answers:options.form.answers}):null;
  const replay=await database.prepare('SELECT actor_id AS actorId,action,subject_type AS subjectType,subject_id AS subjectId,next_json AS nextJson FROM audit_logs WHERE request_id=?')
    .bind(options.requestId).first<{actorId:string;action:string;subjectType:string;subjectId:string;nextJson:string}>();
  if(replay){
    if(options.form){
      let digest:unknown=null;try{digest=JSON.parse(replay.nextJson)?.catalogDigest;}catch{}
      const status=options.action==='prepare'?'prepared':'rejected';
      const record=await database.prepare('SELECT id FROM payout_requests WHERE id=? AND status=? AND operation_request_id=? AND processed_by=?')
        .bind(options.id,status,options.requestId,options.actorId).first();
      if(!record||replay.actorId!==options.actorId||replay.action!==`payout.request.${status}`||
        replay.subjectType!=='payout_request'||replay.subjectId!==options.id||digest!==formDigest)
        throw new PayoutConflictError('Request reference was already used for another payout decision.');
    }
    return;
  }
  const request = await database
    .prepare(
      `SELECT seller_id AS sellerId, status, payout_id AS payoutId FROM payout_requests WHERE id = ?`,
    )
    .bind(options.id)
    .first<{ sellerId: string; status: string; payoutId: string | null }>();
  if (!request || request.status !== 'submitted')
    throw new PayoutConflictError(
      'Only a submitted payout request can be processed.',
    );
  if (options.action === 'prepare') {
    const payout = await prepareSellerPayout(database, {
      sellerId: request.sellerId,
      actorId: options.actorId,
      actorRole: options.actorRole,
      note,
      requestId: `${options.requestId}:payout`,
      now: options.now,
      ...(options.form?{requestTail:{id:options.id,requestId:options.requestId,note,
        form:options.form,formDigest:formDigest!}}:{}),
    });
    if(options.form)return;
    await database.batch([
      database
        .prepare(
          `UPDATE payout_requests SET status = 'prepared', payout_id = ?, processed_by = ?, processing_note = ?, operation_request_id = ?, updated_at = ? WHERE id = ? AND status = 'submitted'`,
        )
        .bind(
          payout.id,
          options.actorId,
          note,
          options.requestId,
          options.now,
          options.id,
        ),
      database
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at) VALUES (?, ?, 'payout.request.prepared', 'payout_request', ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          options.actorId,
          options.id,
          note,
          JSON.stringify({ status: 'submitted' }),
          JSON.stringify({ status: 'prepared', payoutId: payout.id }),
          options.requestId,
          options.now,
        ),
      ...authority.statements,
    ]);
  } else {
    const guardId=crypto.randomUUID();
    await database.batch([
      database
        .prepare(
          `UPDATE payout_requests SET status = 'rejected', processed_by = ?, processing_note = ?, operation_request_id = ?, updated_at = ? WHERE id = ? AND status = 'submitted'`,
        )
        .bind(
          options.actorId,
          note,
          options.requestId,
          options.now,
          options.id,
        ),
      ...(options.form?[database.prepare("INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM payout_requests WHERE id=? AND status='rejected' AND operation_request_id=? AND processed_by=?) THEN 1 ELSE 0 END")
        .bind(guardId,options.id,options.requestId,options.actorId),
        database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId)]:[]),
      database
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at) VALUES (?, ?, 'payout.request.rejected', 'payout_request', ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          options.actorId,
          options.id,
          note,
          JSON.stringify({ status: 'submitted' }),
          JSON.stringify({ status: 'rejected', ...(formDigest?{catalogDigest:formDigest}:{}) }),
          options.requestId,
          options.now,
        ),
        ...await operationalBusinessNotificationStatements(database,{kind:'payout.request.result',sourceId:options.id,eventId:options.requestId,actorId:options.actorId,now:options.now}),
    ...(options.form?[buildFormAnswerInsert(database,{formId:'staff.payout-request-action',requestId:options.requestId,
      versionId:options.form.versionId,subjectType:'payout_request',subjectId:options.id,
      actorId:options.actorId,answers:options.form.answers,now:options.now})]:[]),
    ...authority.statements,
  ]);
  }
}

function payoutNumber(now: number): string {
  const date = new Date(now).toISOString().slice(0, 10).replaceAll('-', '');
  return `HKP-${date}-${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;
}

export async function prepareSellerPayout(
  database: D1Database,
  options: {
    sellerId: string;
    actorId: string;
    actorRole: StaffRole;
    note: string;
    requestId: string;
    now: number;
    requestTail?:{id:string;requestId:string;note:string;form:{requestId:string;versionId:string;answers:FormAnswerSnapshot};formDigest:string};
    form?:{formId:'staff.payout-1';requestId:string;versionId:string;answers:FormAnswerSnapshot};
  },
): Promise<{ id: string; duplicate: boolean }> {
  if(options.form && options.requestTail)throw new PayoutConflictError('A direct payout and a payout request cannot share form context.');
  if(options.form && options.form.requestId!==options.requestId)
    throw new PayoutConflictError('Form request does not match payout preparation.');
  const authority=await staffMutationGuard(database,options.actorId,'payout.prepare',PayoutConflictError,options.actorRole);
  const directApproval=authority.role==='super_admin';
  const initialStatus=directApproval?'approved':'prepared';
  const note=options.note.trim();
  const formDigest=options.form?await digestFormRequest({sellerId:options.sellerId,actorId:options.actorId,
    actorRole:options.actorRole,note,versionId:options.form.versionId,answers:options.form.answers}):null;
  const duplicate = await database
    .prepare(`SELECT id FROM payouts WHERE created_request_id = ? LIMIT 1`)
    .bind(options.requestId)
    .first<{ id: string }>();
  if (duplicate) {
    if(options.requestTail)throw new PayoutConflictError('Payout request preparation was not committed atomically.');
    if(options.form){
      const previous=await database.prepare(`SELECT p.seller_id AS sellerId,p.prepared_by AS preparedBy,p.note,
        e.actor_id AS eventActor,e.action AS eventAction,e.note AS eventNote,
        a.actor_id AS auditActor,a.action AS auditAction,a.subject_id AS auditSubject,
        a.next_json AS nextJson,f.form_id AS formId,f.subject_type AS subjectType,
        f.subject_id AS answerSubject,f.actor_id AS answerActor,
        f.config_version_id AS versionId,f.answers_json AS answersJson
        FROM payouts p JOIN payout_events e ON e.payout_id=p.id AND e.request_id=p.created_request_id
        JOIN audit_logs a ON a.request_id=p.created_request_id
        JOIN form_answer_sets f ON f.request_id=p.created_request_id
        WHERE p.id=?`).bind(duplicate.id).first<{sellerId:string;preparedBy:string;note:string;
          eventActor:string;eventAction:string;eventNote:string;auditActor:string;auditAction:string;
          auditSubject:string;nextJson:string;formId:string;subjectType:string;answerSubject:string;
          answerActor:string;versionId:string;answersJson:string}>();
      let recordedDigest:unknown;try{recordedDigest=JSON.parse(previous?.nextJson??'').catalogDigest;}catch{}
      if(!previous||previous.sellerId!==options.sellerId||previous.preparedBy!==options.actorId||
        previous.note!==note||previous.eventActor!==options.actorId||previous.eventAction!=='prepare'||
        previous.eventNote!==note||previous.auditActor!==options.actorId||
        previous.auditAction!=='payout.prepared'||previous.auditSubject!==duplicate.id||
        previous.formId!=='staff.payout-1'||previous.subjectType!=='payout'||
        previous.answerSubject!==duplicate.id||previous.answerActor!==options.actorId||
        previous.versionId!==options.form.versionId||
        previous.answersJson!==JSON.stringify(options.form.answers)||recordedDigest!==formDigest)
        throw new PayoutConflictError('Request reference was already used for another payout preparation.');
    }
    return { id: duplicate.id, duplicate: true };
  }
  const seller = await database
    .prepare(
      `SELECT payout_account_reference AS destinationReference FROM seller_profiles
     WHERE id = ? AND status = 'approved' AND payout_account_reference IS NOT NULL
       AND trim(payout_account_reference) != '' LIMIT 1`,
    )
    .bind(options.sellerId)
    .first<{ destinationReference: string }>();
  if (!seller)
    throw new PayoutConflictError(
      'The seller needs a verified payout destination before preparation.',
    );
  const entries = await database
    .prepare(
      `SELECT seller_ledger_entries.id, seller_ledger_entries.amount_paisa AS amountPaisa,
      seller_ledger_entries.created_at AS createdAt
     FROM seller_ledger_entries
     LEFT JOIN payout_entries ON payout_entries.ledger_entry_id = seller_ledger_entries.id AND payout_entries.released_at IS NULL
     WHERE seller_ledger_entries.seller_id = ? AND seller_ledger_entries.available_at <= ?
       AND ${standardLedgerEligibility('seller_ledger_entries')}
       AND payout_entries.ledger_entry_id IS NULL
     ORDER BY seller_ledger_entries.created_at ASC, seller_ledger_entries.id ASC`,
    )
    .bind(options.sellerId, options.now)
    .all<{ id: string; amountPaisa: number; createdAt: number }>();
  const amountPaisa = entries.results.reduce(
    (sum, entry) => sum + entry.amountPaisa,
    0,
  );
  if (amountPaisa <= 0) {
    throw new PayoutConflictError(
      'The seller needs a positive available balance for payout preparation.',
    );
  }
  if (note.length < 8 || note.length > 1000)
    throw new PayoutConflictError(
      'Add an operational note of 8–1,000 characters.',
    );
  const payoutId = crypto.randomUUID();
  const number = payoutNumber(options.now);
  const requestGuardId=crypto.randomUUID();
  const directGuardId=crypto.randomUUID();
  const modelGuardId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN
      (SELECT COUNT(*) FROM seller_ledger_entries e WHERE e.id IN (${entries.results.map(()=>'?').join(',')})
        AND ${standardLedgerEligibility('e')})=? THEN 1 ELSE 0 END`)
      .bind(modelGuardId,...entries.results.map(entry=>entry.id),entries.results.length),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(modelGuardId),
    ...(options.requestTail?[database.prepare("INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM payout_requests WHERE id=? AND seller_id=? AND status='submitted') THEN 1 ELSE 0 END")
      .bind(requestGuardId,options.requestTail.id,options.sellerId),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(requestGuardId)]:[]),
    ...(options.form?[database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND status='approved'
        AND payout_account_reference=?) AND
        (SELECT COUNT(*) FROM seller_ledger_entries e WHERE e.id IN (${entries.results.map(()=>'?').join(',')})
          AND e.seller_id=? AND e.available_at<=? AND NOT EXISTS
          (SELECT 1 FROM payout_entries pe WHERE pe.ledger_entry_id=e.id AND pe.released_at IS NULL))=?
        AND (SELECT SUM(e.amount_paisa) FROM seller_ledger_entries e WHERE e.id IN (${entries.results.map(()=>'?').join(',')}))=?
        THEN 1 ELSE 0 END`).bind(directGuardId,options.sellerId,seller.destinationReference,
          ...entries.results.map((entry)=>entry.id),options.sellerId,options.now,entries.results.length,
          ...entries.results.map((entry)=>entry.id),amountPaisa),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(directGuardId)]:[]),
    database
      .prepare(
        `INSERT INTO payouts (
        id, seller_id, payout_number, status, amount_paisa, destination_reference,
        prepared_by, approved_by, processed_by, provider_reference, note,
        period_start, period_end, scheduled_for, approved_at, processed_at,
        paid_at, failed_at, failure_reason, created_request_id,
        operation_request_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?,
        ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?)`,
      )
      .bind(
        payoutId,
        options.sellerId,
        number,
        initialStatus,
        amountPaisa,
        seller.destinationReference,
        options.actorId,
        directApproval?options.actorId:null,
        note,
        entries.results[0]?.createdAt ?? options.now,
        options.now,
        options.now,
        directApproval?options.now:null,
        options.requestId,
        options.now,
        options.now,
      ),
  ];
  for (const entry of entries.results) {
    statements.push(
      database
        .prepare(
          `INSERT INTO payout_entries (payout_id, ledger_entry_id, released_at, release_reason)
       SELECT ?, ?, NULL, NULL WHERE EXISTS (SELECT 1 FROM payouts WHERE id = ? AND created_request_id = ?)`,
        )
        .bind(payoutId, entry.id, payoutId, options.requestId),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO payout_events (id, payout_id, from_status, to_status, action, actor_id, actor_type, note, request_id, created_at)
       SELECT ?, id, NULL, ?, 'prepare', ?, ?, ?, ?, ? FROM payouts WHERE id = ? AND created_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        initialStatus,
        options.actorId,
        options.actorRole,
        note,
        options.requestId,
        options.now,
        payoutId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       SELECT ?, ?, 'payout.prepared', 'payout', id, ?, NULL, ?, ?, NULL, ? FROM payouts WHERE id = ? AND created_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        note,
        JSON.stringify({ status: initialStatus, approvedBy:directApproval?options.actorId:null, amountPaisa, ...(formDigest?{catalogDigest:formDigest}:{}) }),
        options.requestId,
        options.now,
        payoutId,
        options.requestId,
      ),
  );
  statements.push(...await operationalBusinessNotificationStatements(database,{kind:'payout.prepared',sourceId:payoutId,eventId:options.requestId,actorId:options.actorId,status:initialStatus,now:options.now}));
  if(options.requestTail){
    const tail=options.requestTail,decisionGuardId=crypto.randomUUID();
    statements.push(database.prepare("UPDATE payout_requests SET status='prepared',payout_id=?,processed_by=?,processing_note=?,operation_request_id=?,updated_at=? WHERE id=? AND seller_id=? AND status='submitted'")
      .bind(payoutId,options.actorId,tail.note,tail.requestId,options.now,tail.id,options.sellerId));
    statements.push(database.prepare("INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM payout_requests WHERE id=? AND status='prepared' AND payout_id=? AND operation_request_id=? AND processed_by=?) THEN 1 ELSE 0 END")
      .bind(decisionGuardId,tail.id,payoutId,tail.requestId,options.actorId),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(decisionGuardId));
    statements.push(database.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,'payout.request.prepared','payout_request',?,?,?, ?, ?,NULL,?)")
      .bind(crypto.randomUUID(),options.actorId,tail.id,tail.note,JSON.stringify({status:'submitted'}),
        JSON.stringify({status:'prepared',payoutId,catalogDigest:tail.formDigest}),tail.requestId,options.now));
    statements.push(...await operationalBusinessNotificationStatements(database,{kind:'payout.request.result',sourceId:tail.id,
      eventId:tail.requestId,actorId:options.actorId,now:options.now}));
    statements.push(buildFormAnswerInsert(database,{formId:'staff.payout-request-action',requestId:tail.requestId,
      versionId:tail.form.versionId,subjectType:'payout_request',subjectId:tail.id,actorId:options.actorId,
      answers:tail.form.answers,now:options.now}));
  }
  if(options.form)statements.push(buildFormAnswerInsert(database,{formId:'staff.payout-1',
    requestId:options.requestId,versionId:options.form.versionId,subjectType:'payout',
    subjectId:payoutId,actorId:options.actorId,answers:options.form.answers,now:options.now}));
  statements.push(...authority.statements);
  await database.batch(statements);
  return { id: payoutId, duplicate: false };
}

export async function getPayoutDetail(
  database: D1Database,
  payoutId: string,
): Promise<PayoutDetail | null> {
  const payout = await database
    .prepare(`${payoutSelect} WHERE payouts.id = ? LIMIT 1`)
    .bind(payoutId)
    .first<PayoutRow>();
  if (!payout) return null;
  const [entries, events] = await Promise.all([
    database
      .prepare(
        `SELECT seller_ledger_entries.id, seller_ledger_entries.type,
        seller_ledger_entries.amount_paisa AS amountPaisa,
        seller_ledger_entries.available_at AS availableAt,
        seller_ledger_entries.description, seller_ledger_entries.created_at AS createdAt,
        CASE WHEN seller_ledger_entries.available_at <= ? THEN 1 ELSE 0 END AS isAvailable,
        orders.order_number AS orderNumber, order_items.product_name_snapshot AS productName,
        payouts.payout_number AS payoutNumber, payouts.status AS payoutStatus
       FROM payout_entries
       INNER JOIN seller_ledger_entries ON seller_ledger_entries.id = payout_entries.ledger_entry_id
       LEFT JOIN order_items ON order_items.id = seller_ledger_entries.order_item_id
       LEFT JOIN orders ON orders.id = order_items.order_id
       INNER JOIN payouts ON payouts.id = payout_entries.payout_id
       WHERE payout_entries.payout_id = ? ORDER BY seller_ledger_entries.created_at ASC`,
      )
      .bind(Date.now(), payoutId)
      .all<SellerLedgerRow>(),
    database
      .prepare(
        `SELECT payout_events.id, payout_events.from_status AS fromStatus,
        payout_events.to_status AS toStatus, payout_events.action,
        users.display_name AS actorName, payout_events.actor_type AS actorType,
        payout_events.note, payout_events.created_at AS createdAt
       FROM payout_events INNER JOIN users ON users.id = payout_events.actor_id
       WHERE payout_events.payout_id = ? ORDER BY payout_events.created_at DESC`,
      )
      .bind(payoutId)
      .all<PayoutEventRow>(),
  ]);
  return { ...payout, entries: entries.results, events: events.results };
}

export async function operatePayout(
  database: D1Database,
  options: {
    payoutId: string;
    actorId: string;
    actorRole: StaffRole;
    action: PayoutOperation;
    note: string;
    providerReference?: string;
    requestId: string;
    now: number;
    form?:{formId:'staff.payout-2';requestId:string;versionId:string;answers:FormAnswerSnapshot};
  },
): Promise<void> {
  if(options.form && options.form.requestId!==options.requestId)
    throw new PayoutConflictError('Form request does not match the payout action.');
  const authority=await staffMutationGuard(database,options.actorId,options.action==='approve'||options.action==='reject'?'payout.approve':'payout.mark_paid',PayoutConflictError,options.actorRole);
  const note=options.note.trim();
  const replayReference=options.providerReference?.trim()??null;
  const formDigest=options.form?await digestFormRequest({payoutId:options.payoutId,
    actorId:options.actorId,actorRole:options.actorRole,action:options.action,note,
    providerReference:replayReference,versionId:options.form.versionId,answers:options.form.answers}):null;
  const duplicate=await database.prepare('SELECT id FROM payout_events WHERE request_id=? LIMIT 1')
    .bind(options.requestId).first();
  if (duplicate){
    if(options.form){
      const previous=await database.prepare(`SELECT e.payout_id AS payoutId,e.actor_id AS eventActor,
        e.action AS eventAction,e.note AS eventNote,a.actor_id AS auditActor,
        a.action AS auditAction,a.subject_type AS auditSubjectType,a.subject_id AS auditSubject,
        a.next_json AS nextJson,f.form_id AS formId,f.subject_type AS answerSubjectType,
        f.subject_id AS answerSubject,f.actor_id AS answerActor,
        f.config_version_id AS versionId,f.answers_json AS answersJson
        FROM payout_events e JOIN audit_logs a ON a.request_id=e.request_id
        JOIN form_answer_sets f ON f.request_id=e.request_id WHERE e.request_id=?`)
        .bind(options.requestId).first<{payoutId:string;eventActor:string;eventAction:string;
          eventNote:string;auditActor:string;auditAction:string;auditSubjectType:string;
          auditSubject:string;nextJson:string;formId:string;answerSubjectType:string;
          answerSubject:string;answerActor:string;versionId:string;answersJson:string}>();
      let recordedDigest:unknown;try{recordedDigest=JSON.parse(previous?.nextJson??'').catalogDigest;}catch{}
      if(!previous||previous.payoutId!==options.payoutId||previous.eventActor!==options.actorId||
        previous.eventAction!==options.action||previous.eventNote!==note||
        previous.auditActor!==options.actorId||previous.auditAction!==`payout.${options.action}`||
        previous.auditSubjectType!=='payout'||previous.auditSubject!==options.payoutId||
        previous.formId!=='staff.payout-2'||previous.answerSubjectType!=='payout'||
        previous.answerSubject!==options.payoutId||previous.answerActor!==options.actorId||
        previous.versionId!==options.form.versionId||
        previous.answersJson!==JSON.stringify(options.form.answers)||recordedDigest!==formDigest)
        throw new PayoutConflictError('Request reference was already used for another payout action.');
    }
    return;
  }
  const current = await database
    .prepare(
      `SELECT status, prepared_by AS preparedBy, amount_paisa AS amountPaisa, seller_id AS sellerId FROM payouts WHERE id = ? LIMIT 1`,
    )
    .bind(options.payoutId)
    .first<{
      status: PayoutStatus;
      preparedBy: string;
      amountPaisa: number;
      sellerId: string;
    }>();
  if (!current) throw new PayoutConflictError('Payout not found.');
  if (note.length < 8 || note.length > 1000)
    throw new PayoutConflictError(
      'Add an operational note of 8–1,000 characters.',
    );
  let toStatus: PayoutStatus;
  if (options.action === 'approve' || options.action === 'reject') {
    if (current.status !== 'prepared' && current.status !== 'scheduled')
      throw new PayoutConflictError(
        'Only a prepared payout can be approved or rejected.',
      );
    if (options.actorRole !== 'super_admin')
      throw new PayoutConflictError(
        'A Super Admin must make the payout decision.',
      );
    toStatus = options.action === 'approve' ? 'approved' : 'rejected';
  } else if (options.action === 'start_processing') {
    if (!['approved', 'failed'].includes(current.status))
      throw new PayoutConflictError(
        'Only an approved or failed payout can enter processing.',
      );
    toStatus = 'processing';
  } else if (options.action === 'mark_paid') {
    if (current.status !== 'processing')
      throw new PayoutConflictError(
        'Only a processing payout can be marked paid.',
      );
    const reference = options.providerReference?.trim() ?? '';
    if (reference.length < 4 || reference.length > 160)
      throw new PayoutConflictError(
        'Add the verified provider or bank reference.',
      );
    toStatus = 'paid';
  } else {
    if (current.status !== 'processing')
      throw new PayoutConflictError(
        'Only a processing payout can be marked failed.',
      );
    toStatus = 'failed';
  }
  const providerReference =
    options.action === 'mark_paid' ? options.providerReference!.trim() : null;
  const stateGuardId=crypto.randomUUID();
  const payoutModelGuardId=crypto.randomUUID();
  const advancesSettlement=['approved','processing','paid'].includes(toStatus);
  const results = await database.batch([
    database
      .prepare(
        `UPDATE payouts SET status = ?,
        approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
        approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END,
        processed_by = CASE WHEN ? IN ('processing', 'paid', 'failed') THEN ? ELSE processed_by END,
        processed_at = CASE WHEN ? = 'processing' THEN ? ELSE processed_at END,
        paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END,
        failed_at = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
        failure_reason = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
        provider_reference = COALESCE(?, provider_reference), operation_request_id = ?, updated_at = ?
       WHERE id = ? AND status = ? AND prepared_by = ?`,
      )
      .bind(
        toStatus,
        toStatus,
        options.actorId,
        toStatus,
        options.now,
        toStatus,
        options.actorId,
        toStatus,
        options.now,
        toStatus,
        options.now,
        toStatus,
        options.now,
        toStatus,
        note,
        providerReference,
        options.requestId,
        options.now,
        options.payoutId,
        current.status,
        current.preparedBy,
      ),
    ...(options.form?[database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM payouts WHERE id=? AND status=?
        AND operation_request_id=? AND prepared_by=?)
        THEN 1 ELSE 0 END`).bind(stateGuardId,options.payoutId,toStatus,
        options.requestId,current.preparedBy),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(stateGuardId)]:[]),
    database
      .prepare(
        `UPDATE payout_entries SET released_at = ?, release_reason = ?
       WHERE payout_id = ? AND ? = 'rejected' AND released_at IS NULL
         AND EXISTS (SELECT 1 FROM payouts WHERE id = ? AND operation_request_id = ?)`,
      )
      .bind(
        options.now,
        note,
        options.payoutId,
        toStatus,
        options.payoutId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO seller_ledger_entries (
        id, seller_id, order_item_id, refund_id, payout_id, type, amount_paisa,
        available_at, description, created_at
      ) SELECT lower(hex(randomblob(16))), seller_id, NULL, NULL, id, 'payout',
        -amount_paisa, ?, 'Seller payout paid', ? FROM payouts
       WHERE id = ? AND status = 'paid' AND operation_request_id = ?`,
      )
      .bind(options.now, options.now, options.payoutId, options.requestId),
    database
      .prepare(
        `INSERT OR IGNORE INTO payout_entries (payout_id, ledger_entry_id, released_at, release_reason)
       SELECT ?, seller_ledger_entries.id, NULL, NULL FROM seller_ledger_entries
       WHERE seller_ledger_entries.payout_id = ?
         AND EXISTS (SELECT 1 FROM payouts WHERE id = ? AND status = 'paid' AND operation_request_id = ?)`,
      )
      .bind(
        options.payoutId,
        options.payoutId,
        options.payoutId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO payout_events (id, payout_id, from_status, to_status, action, actor_id, actor_type, note, request_id, created_at)
       SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ? FROM payouts WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        current.status,
        toStatus,
        options.action,
        options.actorId,
        options.actorRole,
        note,
        options.requestId,
        options.now,
        options.payoutId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       SELECT ?, ?, ?, 'payout', id, ?, ?, ?, ?, NULL, ? FROM payouts WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        `payout.${options.action}`,
        note,
        JSON.stringify({ status: current.status }),
        JSON.stringify({ status: toStatus, providerReference, ...(formDigest?{catalogDigest:formDigest}:{}) }),
        options.requestId,
        options.now,
        options.payoutId,
        options.requestId,
      ),
    ...await operationalBusinessNotificationStatements(database,{kind:'payout.result',sourceId:options.payoutId,eventId:options.requestId,actorId:options.actorId,now:options.now,status:toStatus}),
    ...(options.form?[buildFormAnswerInsert(database,{formId:'staff.payout-2',requestId:options.requestId,
      versionId:options.form.versionId,subjectType:'payout',subjectId:options.payoutId,
      actorId:options.actorId,answers:options.form.answers,now:options.now})]:[]),
    ...(advancesSettlement?[database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id
        WHERE pe.payout_id=? AND pe.released_at IS NULL AND NOT (${standardLedgerEligibility('e')}))
      THEN 1 ELSE 0 END`).bind(payoutModelGuardId,options.payoutId),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(payoutModelGuardId)]:[]),
    ...authority.statements,
  ]);
  if (!options.form &&
    (results[0].meta.changes ?? 0) !== 1 ||
    !options.form && (results[4].meta.changes ?? 0) !== 1
  ) {
    throw new PayoutConflictError('The payout changed. Refresh and try again.');
  }
}
