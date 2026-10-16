import { publicTrackingReferenceSql } from '../../riders/public-tracking';
import { getFirstCodReview } from '../../orders/first-cod-review';
export interface OrderTracking {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  trackingCode: string | null;
  placedAt: number;
  deliveredAt: number | null;
  updatedAt: number;
  estimatedMinDays: number;
  estimatedMaxDays: number;
  events: { status: string; occurredAt: number }[];
}
// Deliberately excludes names, email, phone, address, item details and internal staff notes.
export async function findOrderTracking(
  db: D1Database,
  orderNumber: string,
  email: string,
): Promise<OrderTracking | null> {
  const order = await db
    .prepare(`SELECT o.id,o.order_number AS orderNumber,o.status,o.payment_status AS paymentStatus,
 o.placed_at AS placedAt,o.delivered_at AS deliveredAt,o.updated_at AS updatedAt,
 ${publicTrackingReferenceSql('o.id', 's.tracking_code')} AS trackingCode,s.estimated_min_days AS estimatedMinDays,s.estimated_max_days AS estimatedMaxDays
 FROM orders o INNER JOIN shipments s ON s.order_id=o.id
 WHERE o.order_number=? AND lower(o.customer_email)=? LIMIT 1`)
    .bind(orderNumber.trim().toUpperCase(), email.trim().toLowerCase())
    .first<Omit<OrderTracking, 'events'> & { id: string }>();
  if (!order) return null;
  const events = await db
    .prepare(`SELECT to_status AS status,MIN(created_at) AS occurredAt FROM order_status_events
 WHERE order_id=? GROUP BY to_status ORDER BY MIN(created_at) ASC`)
    .bind(order.id)
    .all<{ status: string; occurredAt: number }>();
  const codReview = await getFirstCodReview(db, order.id);
  const codPending =
    codReview?.status === 'pending' && order.status !== 'cancelled';
  const { id: _id, ...safe } = order;
  return {
    ...safe,
    status: codPending ? 'awaiting_cod_confirmation' : safe.status,
    events: events.results.map((event) => ({
      ...event,
      status:
        codPending && event.status === 'confirmed'
          ? 'awaiting_cod_confirmation'
          : event.status,
    })),
  };
}
