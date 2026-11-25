import type { ItemFulfillmentStatus } from '@/lib/db/repositories/fulfillment';
import { listOrdersForSeller } from '@/lib/db/repositories/orders';
import { companyDetails } from '@/lib/content/company-details';
import { withFirstCodPresentation } from '@/lib/orders/first-cod-review';
import { currentProductMediaOrder, currentProductMediaSql } from '@/lib/products/publication-media';

export const orderSteps = [
  { id: 'confirmed', label: 'To prepare', hint: 'Start preparing when you begin making or packing the order.' },
  { id: 'packing', label: 'Preparing', hint: 'Mark your items ready once they are packed for pickup.' },
  { id: 'ready_for_pickup', label: 'Ready for pickup', hint: 'Hastabazaar coordinates pickup with the courier.' },
  { id: 'dispatched', label: 'With courier', hint: 'The courier delivers the parcel and collects cash on delivery where applicable.' },
  { id: 'delivered', label: 'Delivered', hint: 'These items have reached the customer.' },
  { id: 'cancelled', label: 'Cancelled', hint: 'These items are no longer going ahead.' },
] as const;

type QueueItem = {
  id: string;
  orderId: string;
  status: ItemFulfillmentStatus;
  name: string;
  amountPaisa: number;
  commissionPaisa: number;
  mediaId: string | null;
  companyHandled: number;
  held: number;
};

const orderQueueObservedAt = () => Date.now();

type Destination = { recipientName?: string; locality?: string; municipality?: string; district?: string };

export async function readSellerOrderQueue(db: D1Database, sellerId: string) {
  const [orders, rows, delivery, restriction] = await Promise.all([
    listOrdersForSeller(db, sellerId).then(orders => withFirstCodPresentation(db, orders)),
    db.prepare(`
      SELECT i.id, i.order_id AS orderId, i.fulfillment_status AS status,
        i.product_name_snapshot AS name, i.line_total_paisa AS amountPaisa, i.commission_paisa AS commissionPaisa,
        (SELECT m.id FROM product_media m JOIN products p ON p.id=m.product_id
          WHERE p.id=i.product_id AND p.seller_id=i.seller_id AND m.mime_type LIKE 'image/%'
            AND ${currentProductMediaSql('m')} ORDER BY ${currentProductMediaOrder('m')},m.id LIMIT 1) AS mediaId,
        EXISTS(SELECT 1 FROM managed_commercial_snapshots m
          WHERE m.order_item_id=i.id AND m.seller_id=i.seller_id AND m.legal_seller_reference=?) AS companyHandled,
        EXISTS(SELECT 1 FROM order_fulfillment_holds h
          WHERE h.order_item_id=i.id AND h.prevents_preparation=1 AND h.ended_at IS NULL) AS held
      FROM order_items i
      INNER JOIN (
        SELECT o.id FROM orders o WHERE EXISTS(SELECT 1 FROM order_items recent WHERE recent.order_id=o.id AND recent.seller_id=?)
        ORDER BY o.created_at DESC LIMIT 100
      ) recent_orders ON recent_orders.id=i.order_id
      WHERE i.seller_id=?
      ORDER BY i.id
    `).bind(companyDetails.entityReference, sellerId, sellerId).all<QueueItem>(),
    db.prepare(`
      SELECT o.id, o.payment_mode AS paymentMode, o.shipping_address_json AS addressJson,
        EXISTS(SELECT 1 FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=o.id) AS hasParcels,
        EXISTS(SELECT 1 FROM manual_payment_windows w
        WHERE w.order_id=o.id AND w.paid_at IS NOT NULL AND w.released_at IS NOT NULL AND w.closed_at IS NULL) AS released
      FROM orders o WHERE EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.seller_id=?)
      ORDER BY o.created_at DESC LIMIT 100
    `).bind(sellerId).all<{id: string; paymentMode: string; addressJson: string; released: number; hasParcels: number}>(),
    db.prepare(`SELECT 1 FROM seller_restrictions WHERE seller_id=? AND obligation_mode<>'allow_existing'
      AND (mode='disabled' OR (mode='suspended' AND suspended_until>?))`).bind(sellerId, orderQueueObservedAt()).first(),
  ]);
  const items = Map.groupBy(rows.results, item => item.orderId);
  const addresses = new Map(delivery.results.map(row => [row.id, row]));
  return orders.map(order => {
    const row = addresses.get(order.id);
    let address: Destination = {};
    try { address = row ? JSON.parse(row.addressJson) ?? {} : {}; }
    catch { /* Historical orders can have an unavailable destination. */ }
    return {
      ...order, items: items.get(order.id) ?? [],
      address, hasParcels: Boolean(row?.hasParcels), paymentPending: (row?.paymentMode === 'manual_bank' || order.status === 'pending_payment') && !row?.released, restricted: Boolean(restriction),
    };
  });
}

export type SellerQueueOrder = Awaited<ReturnType<typeof readSellerOrderQueue>>[number];

export function isSellerOrderTurn(order: SellerQueueOrder, stage: ItemFulfillmentStatus) {
  return !order.firstCodPending && !order.paymentPending && !order.restricted && order.items.some(item => item.status === stage &&
    (stage === 'confirmed' || stage === 'packing') && !item.held && !item.companyHandled) &&
    (order.status === 'confirmed' || order.status === 'packing' || order.status === 'dispatched' && order.hasParcels);
}
