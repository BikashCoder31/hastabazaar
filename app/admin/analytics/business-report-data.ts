import type { StaffUser } from '@/lib/auth/staff';
import { getStorefrontFunnel } from '@/lib/db/repositories/analytics';
import { getCommissionReport } from '@/lib/db/repositories/commission-reporting';
import { can } from '@/lib/marketplace/permissions';
import { responseScopeContains } from '@/lib/orders/response-sql';
import { cancellationCauseSchemaAvailable } from '@/lib/cancellation/attribution';
import { cancellationCauses, type CancellationCause } from '@/lib/cancellation/causes';
import { dayMs, type BusinessReportRange } from './business-report-range';

type ReportViewer = Pick<StaffUser, 'id' | 'role' | 'permissions'>;
type Commerce = {
  orders: number; grossPaisa: number; delivered: number; deliveredPaisa: number;
  everDelivered: number; withReturns: number; previousOrders: number; previousGrossPaisa: number;
};
type Daily = { dayIndex: number; orders: number };
type PaymentTotal = { count: number; amountPaisa: number };
type Seller = { id: string; name: string };
type SellerValue = Seller & { amountPaisa: number };
type SellerDelay = Seller & { lateOrders: number };

// Use order placement for commerce, with creation as the existing fallback for
// earlier orders. Completed refunds and payouts use their own recorded dates.
const placedAt = 'COALESCE(o.placed_at,o.created_at)';

export async function readReportCancellations(db: D1Database, start: number, end: number) {
  if (!await cancellationCauseSchemaAvailable(db)) return null;
  const rows = await db.prepare(`
    SELECT cause,COUNT(*) AS count FROM (
      SELECT cause FROM order_cancellation_events WHERE created_at BETWEEN ? AND ?
      UNION ALL
      SELECT NULL AS cause FROM orders o WHERE o.cancelled_at BETWEEN ? AND ?
        AND NOT EXISTS(SELECT 1 FROM order_cancellation_events e WHERE e.order_id=o.id)
    ) recorded GROUP BY cause
  `).bind(start, end, start, end).all<{ cause: CancellationCause | null; count: number }>();
  const counts = new Map(rows.results.map(row => [row.cause, Number(row.count)]));
  return [...cancellationCauses.map(([cause]) => cause), null].map(cause => ({ cause, count: counts.get(cause) ?? 0 }));
}

export async function readBusinessReport(db: D1Database, range: BusinessReportRange, staff: ReportViewer) {
  const { from, to, start, now, previousStart } = range;
  const canViewSellerWork = can(staff, 'order.manage');
  const [cancellations, commerce, daily, commission, refunds, payouts, courierCash, funnel, topSellers, sellerDelays] = await Promise.all([
    readReportCancellations(db, start, now),
    db.prepare(`
      WITH placed AS (
        SELECT o.id,o.status,o.delivered_at,o.grand_total_paisa,${placedAt} AS placedAt
        FROM orders o WHERE ${placedAt} BETWEEN ? AND ?
      ), cohort AS (
        SELECT placed.*,
          CASE WHEN status='delivered' OR delivered_at IS NOT NULL THEN 1 ELSE 0 END AS everDelivered
        FROM placed
      )
      SELECT COUNT(CASE WHEN placedAt>=? THEN 1 END) AS orders,
        COALESCE(SUM(CASE WHEN placedAt>=? THEN grand_total_paisa ELSE 0 END),0) AS grossPaisa,
        COUNT(CASE WHEN placedAt>=? AND status='delivered' THEN 1 END) AS delivered,
        COALESCE(SUM(CASE WHEN placedAt>=? AND status='delivered' THEN grand_total_paisa ELSE 0 END),0) AS deliveredPaisa,
        COUNT(CASE WHEN placedAt>=? AND everDelivered=1 THEN 1 END) AS everDelivered,
        COUNT(CASE WHEN placedAt>=? AND everDelivered=1 AND EXISTS(
          SELECT 1 FROM order_items i JOIN return_requests r ON r.order_item_id=i.id
          WHERE i.order_id=cohort.id AND r.requested_at<=?
        ) THEN 1 END) AS withReturns,
        COUNT(CASE WHEN placedAt<? THEN 1 END) AS previousOrders,
        COALESCE(SUM(CASE WHEN placedAt<? THEN grand_total_paisa ELSE 0 END),0) AS previousGrossPaisa
      FROM cohort
    `).bind(previousStart, now, start, start, start, start, start, start, now, start, start).first<Commerce>(),
    db.prepare(`SELECT FLOOR((${placedAt}-?)/86400000.0) AS dayIndex, COUNT(*) AS orders
      FROM orders o WHERE ${placedAt} BETWEEN ? AND ? GROUP BY dayIndex`).bind(start, start, now).all<Daily>(),
    getCommissionReport(db, { from, to, pageSize: 1 }),
    db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(amount_paisa),0) AS amountPaisa
      FROM refunds WHERE status='paid' AND processed_at BETWEEN ? AND ?`).bind(start, now).first<PaymentTotal>(),
    db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(amount_paisa),0) AS amountPaisa
      FROM payouts WHERE status='paid' AND paid_at BETWEEN ? AND ?`).bind(start, now).first<PaymentTotal>(),
    // Keep this balance aligned with Money › Courier cash. It is a current
    // balance across outstanding parcels, regardless of the selected period.
    db.prepare(`
      SELECT COALESCE(SUM(b.remaining_paisa),0) AS amountPaisa,
        COUNT(*) AS count,COUNT(DISTINCT NULLIF(TRIM(p.courier_name),'')) AS couriers
      FROM cod_reconciliation_balances b
      JOIN shipping_parcels p ON p.shipping_job_id=b.shipping_job_id
      JOIN shipping_jobs j ON j.id=p.shipping_job_id
      JOIN orders o ON o.id=j.order_id
      WHERE o.payment_mode='cod' AND p.method='courier' AND p.rider_user_id IS NULL
        AND j.direction='outbound' AND p.collected_paisa>0 AND b.remaining_paisa>0
        AND (p.delivered_at IS NOT NULL OR j.status='delivered')
    `).first<PaymentTotal & { couriers: number }>(),
    getStorefrontFunnel(db, now, start),
    db.prepare(`SELECT s.id,s.trading_name AS name,SUM(i.line_total_paisa) AS amountPaisa
      FROM order_items i JOIN orders o ON o.id=i.order_id JOIN seller_profiles s ON s.id=i.seller_id
      WHERE i.fulfillment_status='delivered' AND ${placedAt} BETWEEN ? AND ?
      GROUP BY s.id,s.trading_name ORDER BY amountPaisa DESC,s.trading_name,s.id LIMIT 5
    `).bind(start, now).all<SellerValue>(),
    canViewSellerWork ? db.prepare(`
      SELECT s.id,s.trading_name AS name,COUNT(DISTINCT o.id) AS lateOrders
      FROM order_response_cases c JOIN order_response_portions p ON p.id=c.portion_id
      JOIN orders o ON o.id=p.order_id JOIN seller_profiles s ON s.id=p.seller_id
      WHERE p.operator_mode='seller' AND c.kind='delay' AND c.state IN ('open','waiting')
        AND c.proposed_ready_at>c.created_at AND c.proposed_ready_at<?
        AND ${placedAt} BETWEEN ? AND ? AND (o.customer_id IS NULL OR o.customer_id<>?)
        AND EXISTS (
          SELECT 1 FROM order_items i
          WHERE i.order_id=p.order_id AND i.seller_id=p.seller_id
            AND i.fulfillment_status IN ('pending','confirmed','packing')
            AND ${responseScopeContains(db, 'c.scope_json', 'i.id')}
            AND NOT EXISTS(SELECT 1 FROM order_item_status_events e
              WHERE e.order_item_id=i.id AND e.to_status='ready_for_pickup' AND e.created_at>=c.created_at)
        )
      GROUP BY s.id,s.trading_name ORDER BY lateOrders DESC,s.trading_name,s.id LIMIT 5
    `).bind(now, start, now, staff.id).all<SellerDelay>() : null,
  ]);

  const counts = new Map(daily.results.map(row => [Number(row.dayIndex), Number(row.orders)]));
  return {
    commerce,
    cancellations,
    daily: Array.from({ length: range.days }, (_, index) => ({
      at: start + index * dayMs,
      orders: counts.get(index) ?? 0,
    })),
    commission: commission.totals.earnedPaisa,
    refunds,
    payouts,
    courierCash,
    funnel,
    topSellers: topSellers.results,
    sellerDelays: sellerDelays?.results ?? null,
  };
}

export type BusinessReport = Awaited<ReturnType<typeof readBusinessReport>>;
