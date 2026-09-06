import type { StaffRole } from '@/lib/auth/staff';
import { phaseOneMarketplacePolicy } from '@/lib/marketplace/policy';

const payoutPolicy = phaseOneMarketplacePolicy.value.payouts;
const dayMs = 86_400_000;

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
    WHERE orders.status = 'delivered' AND order_items.fulfillment_status = 'delivered'
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
        'Hastabazaar commission', COALESCE(orders.delivered_at, ?)
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
  ]);
}

export interface SellerFinanceSummary {
  availablePaisa: number;
  pendingPaisa: number;
  grossSalesPaisa: number;
  commissionPaisa: number;
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
      COALESCE(SUM(CASE WHEN seller_ledger_entries.type = 'refund' THEN seller_ledger_entries.amount_paisa ELSE 0 END), 0) AS refundPaisa
     FROM seller_ledger_entries
     LEFT JOIN payout_entries ON payout_entries.ledger_entry_id = seller_ledger_entries.id AND payout_entries.released_at IS NULL
     WHERE seller_ledger_entries.seller_id = ?`,
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
       AND payout_entries.ledger_entry_id IS NULL
     GROUP BY seller_profiles.id
     HAVING SUM(seller_ledger_entries.amount_paisa) >= ?
     ORDER BY amountPaisa DESC`,
    )
    .bind(now, payoutPolicy.minimumPayoutPaisa)
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
  },
): Promise<string> {
  const duplicate = await database
    .prepare(`SELECT id FROM payout_requests WHERE created_request_id = ?`)
    .bind(options.requestId)
    .first<{ id: string }>();
  if (duplicate) return duplicate.id;
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
  if (summary.availablePaisa < payoutPolicy.minimumPayoutPaisa)
    throw new PayoutConflictError(
      `Your available balance has not reached the NPR ${(payoutPolicy.minimumPayoutPaisa / 100).toLocaleString('en-NP')} minimum.`,
    );
  const note = options.note.trim();
  if (note.length < 8 || note.length > 500)
    throw new PayoutConflictError('Add a payout note of 8–500 characters.');
  const id = crypto.randomUUID();
  await database.batch([
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
        }),
        options.requestId,
        options.now,
      ),
  ]);
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
  },
): Promise<void> {
  if (
    await database
      .prepare(`SELECT id FROM audit_logs WHERE request_id = ?`)
      .bind(options.requestId)
      .first()
  )
    return;
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
  const note = options.note.trim();
  if (note.length < 8 || note.length > 1000)
    throw new PayoutConflictError(
      'Add an operational note of 8–1,000 characters.',
    );
  if (options.action === 'prepare') {
    const payout = await prepareSellerPayout(database, {
      sellerId: request.sellerId,
      actorId: options.actorId,
      actorRole: options.actorRole,
      note,
      requestId: `${options.requestId}:payout`,
      now: options.now,
    });
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
    ]);
  } else {
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
          JSON.stringify({ status: 'rejected' }),
          options.requestId,
          options.now,
        ),
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
  },
): Promise<{ id: string; duplicate: boolean }> {
  const duplicate = await database
    .prepare(`SELECT id FROM payouts WHERE created_request_id = ? LIMIT 1`)
    .bind(options.requestId)
    .first<{ id: string }>();
  if (duplicate) return { id: duplicate.id, duplicate: true };
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
       AND payout_entries.ledger_entry_id IS NULL
     ORDER BY seller_ledger_entries.created_at ASC, seller_ledger_entries.id ASC`,
    )
    .bind(options.sellerId, options.now)
    .all<{ id: string; amountPaisa: number; createdAt: number }>();
  const amountPaisa = entries.results.reduce(
    (sum, entry) => sum + entry.amountPaisa,
    0,
  );
  if (amountPaisa < payoutPolicy.minimumPayoutPaisa) {
    throw new PayoutConflictError(
      `The seller has not reached the NPR ${(payoutPolicy.minimumPayoutPaisa / 100).toLocaleString('en-NP')} minimum payout.`,
    );
  }
  const note = options.note.trim();
  if (note.length < 8 || note.length > 1000)
    throw new PayoutConflictError(
      'Add an operational note of 8–1,000 characters.',
    );
  const payoutId = crypto.randomUUID();
  const number = payoutNumber(options.now);
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO payouts (
        id, seller_id, payout_number, status, amount_paisa, destination_reference,
        prepared_by, approved_by, processed_by, provider_reference, note,
        period_start, period_end, scheduled_for, approved_at, processed_at,
        paid_at, failed_at, failure_reason, created_request_id,
        operation_request_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'prepared', ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?,
        NULL, NULL, NULL, NULL, NULL, ?, NULL, ?, ?)`,
      )
      .bind(
        payoutId,
        options.sellerId,
        number,
        amountPaisa,
        seller.destinationReference,
        options.actorId,
        note,
        entries.results[0]?.createdAt ?? options.now,
        options.now,
        options.now,
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
       SELECT ?, id, NULL, 'prepared', 'prepare', ?, ?, ?, ?, ? FROM payouts WHERE id = ? AND created_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
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
        JSON.stringify({ status: 'prepared', amountPaisa }),
        options.requestId,
        options.now,
        payoutId,
        options.requestId,
      ),
  );
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
  },
): Promise<void> {
  if (
    await database
      .prepare(`SELECT id FROM payout_events WHERE request_id = ? LIMIT 1`)
      .bind(options.requestId)
      .first()
  )
    return;
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
  const note = options.note.trim();
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
    if (current.preparedBy === options.actorId)
      throw new PayoutConflictError(
        'The payout preparer cannot approve or reject their own payout.',
      );
    if (options.actorRole !== 'super_admin')
      throw new PayoutConflictError(
        'A Super Admin must make the independent payout decision.',
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
       WHERE id = ? AND status = ?`,
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
      ),
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
        JSON.stringify({ status: toStatus, providerReference }),
        options.requestId,
        options.now,
        options.payoutId,
        options.requestId,
      ),
  ]);
  if (
    (results[0].meta.changes ?? 0) !== 1 ||
    (results[4].meta.changes ?? 0) !== 1
  ) {
    throw new PayoutConflictError('The payout changed. Refresh and try again.');
  }
}
