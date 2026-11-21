import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { getSellerCommissionTerms } from '@/lib/db/repositories/commission-rates';
import { getSellerFinanceSummary } from '@/lib/db/repositories/payouts';
import { can, type Permission } from '@/lib/marketplace/permissions';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { cancellationCauseSchemaAvailable } from '@/lib/cancellation/attribution';
import { cancellationCauseLabel, readCancellationCause } from '@/lib/cancellation/causes';
import { responseScopeContains } from '@/lib/orders/response-sql';

type Viewer = { id: string; role: 'admin' | 'super_admin'; permissions?: readonly Permission[] };
type ReadyScore = { onTime: number; recorded: number };
type ReturnScores = { orders: number; withReturn: number; replies: number; averageDays: number | null };
type Rating = { average: number | null; reviews: number };
export type RecordListItem = { id: string; title: string; detail: string; status: string; href: string; at: number };

export const sellerRecordTabs = [
  ['work', 'Open work'],
  ['orders', 'Orders'],
  ['products', 'Products'],
  ['history', 'History'],
] as const;
export type SellerRecordTab = (typeof sellerRecordTabs)[number][0];

export const recordPageSize = 25;
const previewSize = 10;
const dayMs = 86_400_000;
const kathmanduOffsetMs = 345 * 60_000;
export const sellerRecordDate = new Intl.DateTimeFormat('en-NP', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kathmandu',
});

export async function readSellerStanding(db: D1Database, sellerId: string, staff: Viewer, independent = true, cancellationSchema?: boolean | Promise<boolean>) {
  const ordersAllowed = independent && can(staff, 'order.manage');
  const returnsAllowed = independent && (ordersAllowed || can(staff, 'support.manage') || can(staff, 'refund.approve.standard'));

  // Match the first actual ready event to the latest proposal recorded before it for that exact item.
  const recordedCauses = ordersAllowed && await (cancellationSchema ?? cancellationCauseSchemaAvailable(db));
  const [ready, returns, rating, cancellations] = await Promise.all([
    ordersAllowed ? db.prepare(`
      WITH proposals AS (
        SELECT i.id AS item_id,c.id,c.created_at,c.proposed_ready_at,
          (SELECT MIN(e.created_at) FROM order_item_status_events e
            WHERE e.order_item_id=i.id AND e.to_status='ready_for_pickup') AS ready_at
        FROM order_response_cases c
        JOIN order_response_portions p ON p.id=c.portion_id AND p.operator_mode='seller'
        JOIN orders o ON o.id=p.order_id
        JOIN order_items i ON i.order_id=p.order_id AND i.seller_id=p.seller_id
        WHERE p.seller_id=? AND (o.customer_id IS NULL OR o.customer_id<>?)
          AND c.kind='delay' AND c.proposed_ready_at>c.created_at
          AND ${responseScopeContains(db, 'c.scope_json', 'i.id')}
      ), measured AS (
        SELECT ready_at,proposed_ready_at,
          ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY created_at DESC,id DESC) AS most_recent
        FROM proposals WHERE ready_at>=created_at
      )
      SELECT COUNT(*) AS recorded, COALESCE(SUM(CASE WHEN ready_at<=proposed_ready_at THEN 1 ELSE 0 END),0) AS onTime
      FROM measured WHERE most_recent=1
    `).bind(sellerId, staff.id).first<ReadyScore>() : null,
    returnsAllowed ? db.prepare(`
      SELECT COUNT(DISTINCT i.order_id) AS orders,
        COUNT(DISTINCT CASE WHEN r.id IS NOT NULL THEN i.order_id END) AS withReturn,
        COUNT(CASE WHEN r.seller_responded_at>=r.requested_at THEN 1 END) AS replies,
        AVG(CASE WHEN r.seller_responded_at>=r.requested_at THEN (r.seller_responded_at-r.requested_at)*1.0/? END) AS averageDays
      FROM order_items i
      JOIN orders o ON o.id=i.order_id
      LEFT JOIN return_requests r ON r.order_item_id=i.id
      WHERE i.seller_id=? AND i.fulfillment_status='delivered' AND (o.customer_id IS NULL OR o.customer_id<>?)
    `).bind(dayMs, sellerId, staff.id).first<ReturnScores>() : null,
    db.prepare(`
      SELECT AVG(r.rating) AS average, COUNT(*) AS reviews
      FROM order_items i JOIN product_reviews r ON r.order_item_id=i.id
      WHERE i.seller_id=? AND r.status='published'
    `).bind(sellerId).first<Rating>(),
    recordedCauses ? db.prepare(`
      SELECT COUNT(DISTINCT e.order_id) AS count
      FROM order_cancellation_events e JOIN orders o ON o.id=e.order_id
      WHERE e.cause='seller' AND ${responseScopeContains(db, 'e.seller_ids_json', '?')}
        AND (o.customer_id IS NULL OR o.customer_id<>?)
    `).bind(sellerId, staff.id).first<{ count: number }>() : null,
  ]);
  return { ready, cancellations: cancellations ? Number(cancellations.count) : null, returns, rating };
}

type Payout = { id: string; reference: string; amount: number; at: number };

export async function readSellerMoney(db: D1Database, sellerId: string, now: number) {
  const localDate = new Date(now + kathmanduOffsetMs);
  const monthStart = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), 1) - kathmanduOffsetMs;
  const [totals, approvals, finance, hold, commission] = await Promise.all([
    db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN status='paid' AND paid_at>=? AND paid_at<=? THEN amount_paisa ELSE 0 END),0) AS paid,
        COALESCE(SUM(CASE WHEN status IN ('prepared','scheduled') THEN amount_paisa ELSE 0 END),0) AS waiting,
        COUNT(CASE WHEN status IN ('prepared','scheduled') THEN 1 END) AS waitingCount
      FROM payouts WHERE seller_id=?
    `).bind(monthStart, now, sellerId).first<{ paid: number; waiting: number; waitingCount: number }>(),
    db.prepare(`
      SELECT id, payout_number AS reference, amount_paisa AS amount, created_at AS at
      FROM payouts WHERE seller_id=? AND status IN ('prepared','scheduled')
      ORDER BY created_at, id LIMIT ?
    `).bind(sellerId, previewSize).all<Payout>(),
    getSellerFinanceSummary(db, sellerId, now),
    getEffectiveBusinessSetting(db, 'seller_delivery_hold_days', now),
    getSellerCommissionTerms(db, sellerId, now),
  ]);
  return {
    paid: totals?.paid ?? 0,
    waiting: totals?.waiting ?? 0,
    waitingCount: totals?.waitingCount ?? 0,
    approvals: approvals.results,
    held: finance.pendingPaisa,
    holdDays: hold.value,
    commission: commission.basisPoints / 100,
  };
}

export async function readSellerOrders(db: D1Database, sellerId: string, staffId: string, page: number, cancellationSchema?: boolean | Promise<boolean>) {
  const recordedCauses = await (cancellationSchema ?? cancellationCauseSchemaAvailable(db));
  const causeSql = recordedCauses ? `(SELECT e.cause FROM order_cancellation_events e
    WHERE e.order_id=o.id AND ${responseScopeContains(db, 'e.seller_ids_json', '?')}
    ORDER BY e.version DESC LIMIT 1)` : 'NULL';
  const rows = await db.prepare(`
    SELECT o.id,o.order_number AS title,MIN(i.product_name_snapshot) AS firstProduct,
      ${causeSql} AS cancellationCause,
      COUNT(i.id) AS lineCount, o.created_at AS at,
      SUM(CASE WHEN i.fulfillment_status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN i.fulfillment_status='delivered' THEN 1 ELSE 0 END) AS delivered,
      SUM(CASE WHEN i.fulfillment_status='dispatched' THEN 1 ELSE 0 END) AS dispatched,
      SUM(CASE WHEN i.fulfillment_status='ready_for_pickup' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN i.fulfillment_status='packing' THEN 1 ELSE 0 END) AS packing,
      o.status AS orderStatus
    FROM order_items i JOIN orders o ON o.id=i.order_id
    WHERE i.seller_id=? AND (o.customer_id IS NULL OR o.customer_id<>?)
    GROUP BY o.id,o.order_number,o.status,o.created_at
    ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?
  `).bind(...(recordedCauses ? [sellerId] : []), sellerId, staffId, recordPageSize + 1, (page - 1) * recordPageSize).all<{
    id: string; title: string; firstProduct: string; lineCount: number; at: number; cancellationCause: string | null;
    cancelled: number; delivered: number; dispatched: number; ready: number; packing: number; orderStatus: string;
  }>();

  return rows.results.map(row => {
    const active = row.lineCount - row.cancelled;
    const status = row.cancelled === row.lineCount ? 'cancelled'
      : row.orderStatus === 'pending_payment' ? 'pending_payment'
      : row.delivered === active ? 'delivered'
      : row.delivered + row.dispatched === active ? 'dispatched'
      : row.delivered + row.dispatched + row.ready === active ? 'ready_for_pickup'
      : row.packing + row.ready + row.dispatched + row.delivered > 0 ? 'packing' : 'confirmed';
    return {
      id: row.id, title: row.title, at: row.at, status,
      href: '/admin/orders/' + encodeURIComponent(row.id),
      detail: row.firstProduct + (row.lineCount > 1 ? ` · ${row.lineCount - 1} more ${row.lineCount === 2 ? 'line' : 'lines'}` : '') +
        (recordedCauses && row.cancelled ? ` · ${cancellationCauseLabel(readCancellationCause(row.cancellationCause) ?? null)}` : ''),
    };
  });
}

export async function readSellerProducts(db: D1Database, sellerId: string, page: number) {
  const rows = await db.prepare(`
    SELECT id,name_en AS title,sku,status,updated_at AS at FROM products
    WHERE seller_id=? ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?
  `).bind(sellerId, recordPageSize + 1, (page - 1) * recordPageSize)
    .all<{ id: string; title: string; sku: string; status: string; at: number }>();
  return rows.results.map(row => ({
    ...row, detail: [row.sku, sellerRecordDate.format(row.at)].filter(Boolean).join(' · '),
    href: '/admin/products/' + encodeURIComponent(row.id),
  }));
}

export async function readPaidPayoutHistory(db: D1Database, sellerId: string) {
  const paid = await db.prepare(`
    SELECT id,payout_number AS reference,amount_paisa AS amount,paid_at AS at FROM payouts
    WHERE seller_id=? AND status='paid' AND paid_at IS NOT NULL
    ORDER BY paid_at DESC,id DESC LIMIT ?
  `).bind(sellerId, recordPageSize).all<Payout>();
  return paid.results.map((row): RecordListItem => ({
    id: 'paid-' + row.id, at: row.at, title: 'Payout ' + row.reference + ' paid',
    detail: formatPaisaExact(row.amount) + ' · ' + sellerRecordDate.format(row.at),
    status: 'Record', href: '/admin/payouts/' + encodeURIComponent(row.id),
  }));
}

export async function readSellerOpenWork(db: D1Database, sellerId: string, staff: Viewer, now: number) {
  const ordersAllowed = can(staff, 'order.manage');
  const returnsAllowed = ordersAllowed || can(staff, 'support.manage') || can(staff, 'refund.approve.standard');
  const [preparation, returns] = await Promise.all([
    ordersAllowed ? db.prepare(`
      SELECT c.id,c.kind,c.created_at AS at,c.proposed_ready_at AS proposedAt,o.order_number AS reference,
        MAX(CASE WHEN i.fulfillment_status IN ('confirmed','packing') THEN 1 ELSE 0 END) AS stillPreparing
      FROM order_items i
      JOIN orders o ON o.id=i.order_id
      JOIN order_response_portions p ON p.order_id=i.order_id AND p.seller_id=i.seller_id
      JOIN order_response_cases c ON c.portion_id=p.id
      WHERE i.seller_id=? AND (o.customer_id IS NULL OR o.customer_id<>?)
        AND (p.operator_mode='seller' OR ?=1)
        AND c.state IN ('open','waiting')
        AND ${responseScopeContains(db, 'c.scope_json', 'i.id')}
      GROUP BY c.id,c.kind,c.created_at,c.proposed_ready_at,o.order_number
      ORDER BY c.created_at DESC,c.id DESC LIMIT ?
    `).bind(sellerId, staff.id, staff.role === 'super_admin' ? 1 : 0, previewSize + 1).all<{
      id: string; kind: string; at: number; proposedAt: number | null; reference: string; stillPreparing: number;
    }>() : null,
    returnsAllowed ? db.prepare(`
      SELECT r.id,r.requested_at AS at,o.order_number AS reference,i.product_name_snapshot AS product,
        h.waiting_for AS waitingFor, r.seller_response AS responded, r.status
      FROM order_items i JOIN orders o ON o.id=i.order_id
      JOIN return_requests r ON r.order_item_id=i.id
      LEFT JOIN return_handling h ON h.case_id=r.id
      WHERE i.seller_id=? AND (o.customer_id IS NULL OR o.customer_id<>?)
        AND r.status NOT IN ('resolved','rejected')
      ORDER BY r.requested_at DESC,r.id DESC LIMIT ?
    `).bind(sellerId, staff.id, previewSize + 1).all<{
      id: string; at: number; reference: string; product: string; waitingFor: string | null; responded: string | null; status: string;
    }>() : null,
  ]);

  const issues: RecordListItem[] = (preparation?.results ?? []).slice(0, previewSize).map(row => {
    const label = row.kind === 'delay' ? 'Preparation delay'
      : row.kind === 'cannot_fulfill' ? 'Can’t fulfil'
      : row.kind === 'hold' ? 'Preparation on hold'
      : row.kind === 'promise_missed' ? 'Missed preparation commitment'
      : 'Preparation follow-up';
    return {
      id: 'preparation-' + row.id, at: row.at, title: `${label} · ${row.reference}`,
      detail: row.proposedAt ? 'Proposed ready date ' + sellerRecordDate.format(row.proposedAt) : 'Reported ' + sellerRecordDate.format(row.at),
      status: row.kind === 'promise_missed' || (row.kind === 'delay' && row.stillPreparing > 0 && row.proposedAt !== null && row.proposedAt < now)
        ? 'Late' : 'Open',
      href: '/admin/order-responses/' + encodeURIComponent(row.id),
    };
  });
  const care: RecordListItem[] = (returns?.results ?? []).slice(0, previewSize).map(row => {
    const needsReply = row.waitingFor === 'seller' || (row.status === 'requested' && !row.responded);
    return {
      id: 'return-' + row.id, at: row.at, title: 'Return on ' + row.reference,
      detail: needsReply ? 'Waiting for the seller’s reply · ' + row.product : row.product,
      status: needsReply ? 'Seller’s turn' : row.waitingFor === 'customer' ? 'Customer’s turn' : row.waitingFor === 'carrier' ? 'Courier’s turn' : 'Open',
      href: '/admin/cases/returns/' + encodeURIComponent(row.id),
    };
  });
  return {
    rows: [...issues, ...care],
    limited: (preparation?.results.length ?? 0) > previewSize || (returns?.results.length ?? 0) > previewSize,
  };
}

export function approvalWork(approval: Payout, sellerId: string, mayApprove: boolean): RecordListItem {
  const filters = new URLSearchParams({ sellerId, selected: 'payout:' + approval.id });
  return {
    id: 'payout-' + approval.id, at: approval.at, title: 'Approve payout ' + approval.reference,
    detail: formatPaisaExact(approval.amount) + ' · Prepared ' + sellerRecordDate.format(approval.at),
    status: mayApprove ? 'Your turn' : 'Super Admin review', href: '/admin/payouts?' + filters,
  };
}
