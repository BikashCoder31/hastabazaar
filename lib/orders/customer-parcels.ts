import { safeCourierUrl } from '../delivery/validation';
import { readDeliveryFailureReason, deliveryFailureSchemaAvailable } from '../shipping/delivery-failure';
import { readUnbookedSellerParcelCash } from '../operations/parcels';
import { withOrderOfferSnapshots } from '../products/offer-order-contract';
import { currentProductMediaOrder, currentProductMediaSql } from '../products/publication-media';
import { publicTrackingReferenceSql } from '../riders/public-tracking';
import type { CustomerParcelStage } from '@/components/storefront/customer-parcel-progress';

export type CustomerParcelItem = {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  status: string;
  mediaId: string | null;
  reviewable: boolean;
};

export type CustomerOrderParcel = {
  sellerId: string;
  sellerName: string;
  status: string;
  items: CustomerParcelItem[];
  courierName: string | null;
  trackingReference: string | null;
  trackingUrl: string | null;
  failureReason: string | null;
  codPaisa: number | null;
  estimatedMinDays: number | null;
  estimatedMaxDays: number | null;
  stageTimes: Partial<Record<CustomerParcelStage, number>>;
};

type OrderSource = {
  orderId: string; status: string; paymentMode: string; placedAt: number; estimatedMinDays: number | null; estimatedMaxDays: number | null;
  courierName: string | null; trackingReference: string | null; trackingUrl: string | null;
};
type ItemSource = Omit<CustomerParcelItem, 'reviewable'> & { orderId: string; sellerId: string; sellerName: string; reviewable: number; preparingAt: number | null; packedAt: number | null; dispatchedAt: number | null; deliveredAt: number | null };
type ParcelSource = {
  orderId: string; sellerId: string; status: string; codPaisa: number; deliveredAt: number | null;
  courierName: string | null; trackingReference: string | null; trackingUrl: string | null; failureReason: string | null;
};

const handed = new Set(['dispatched', 'delivery_failed', 'return_to_origin', 'returning', 'returned', 'delivered']);

function displayStatus(items: readonly ItemSource[], booked: ParcelSource | undefined, order: OrderSource) {
  if (order.status === 'cancelled' || items.every(item => item.status === 'cancelled')) return 'cancelled';
  if (booked && handed.has(booked.status)) return booked.status;
  const active = items.filter(item => item.status !== 'cancelled');
  if (active.every(item => item.status === 'delivered')) return 'delivered';
  if (active.some(item => item.status === 'dispatched')) return 'dispatched';
  if (active.every(item => ['ready_for_pickup', 'delivered'].includes(item.status))) return 'ready_for_pickup';
  return order.status === 'placed' ? 'placed' : active.some(item => item.status === 'packing') ? 'packing' : 'confirmed';
}

function link(value: string | null | undefined) {
  if (!value) return null;
  try { return safeCourierUrl(value) || null; } catch { return null; }
}

function firstTime(items: readonly ItemSource[], key: 'preparingAt' | 'packedAt' | 'dispatchedAt' | 'deliveredAt') {
  const dates = items.flatMap(item => item[key] === null ? [] : [item[key]]);
  return dates.length ? Math.min(...dates) : undefined;
}

/** Call with IDs already authorized by a receipt, owned orders, or the tracking proof. */
export async function readCustomerOrderParcels(db: D1Database, orderIds: readonly string[], options: { withItems?: boolean; withCash?: boolean } = {}) {
  const ids = [...new Set(orderIds)];
  const result = new Map<string, CustomerOrderParcel[]>();
  if (!ids.length) return result;
  const hasFailureReason = await deliveryFailureSchemaAvailable(db);
  for (let offset = 0; offset < ids.length; offset += 40) {
    const chunk = ids.slice(offset, offset + 40), parameters = chunk.map(() => '?').join(',');
    const [orders, itemRows, parcels] = await Promise.all([
      db.prepare(`SELECT o.id AS orderId,o.status,o.payment_mode AS paymentMode,COALESCE(o.placed_at,o.created_at) AS placedAt,
        s.estimated_min_days AS estimatedMinDays,s.estimated_max_days AS estimatedMaxDays,
        CASE WHEN d.method='courier' AND d.rider_user_id IS NULL THEN d.courier_name END AS courierName,
        COALESCE(${publicTrackingReferenceSql('o.id', 's.tracking_code')}, CASE WHEN d.method='courier' AND d.rider_user_id IS NULL THEN d.tracking_reference END) AS trackingReference,
        CASE WHEN d.method='courier' AND d.rider_user_id IS NULL THEN d.tracking_url END AS trackingUrl
        FROM orders o LEFT JOIN shipments s ON s.order_id=o.id LEFT JOIN delivery_assignments d ON d.order_id=o.id
        WHERE o.id IN (${parameters})`).bind(...chunk).all<OrderSource>(),
      db.prepare(`SELECT i.id,i.order_id AS orderId,i.seller_id AS sellerId,i.seller_name_snapshot AS sellerName,
        i.product_id AS productId,i.product_name_snapshot AS name,i.quantity,i.fulfillment_status AS status,
        ${options.withItems === false ? 'NULL' : `(SELECT product_media.id FROM product_media WHERE product_media.product_id=i.product_id AND ${currentProductMediaSql('product_media')}
          ORDER BY ${currentProductMediaOrder('product_media')} LIMIT 1)`} AS mediaId,
        ${options.withItems === false ? '0' : `CASE WHEN i.product_id IS NOT NULL AND i.fulfillment_status='delivered' AND NOT EXISTS(SELECT 1 FROM product_reviews r WHERE r.order_item_id=i.id) THEN 1 ELSE 0 END`} AS reviewable,
        (SELECT MIN(e.created_at) FROM order_item_status_events e WHERE e.order_item_id=i.id AND e.to_status='packing') AS preparingAt,
        (SELECT MIN(e.created_at) FROM order_item_status_events e WHERE e.order_item_id=i.id AND e.to_status='ready_for_pickup') AS packedAt,
        (SELECT MIN(e.created_at) FROM order_item_status_events e WHERE e.order_item_id=i.id AND e.to_status='dispatched') AS dispatchedAt,
        (SELECT MIN(e.created_at) FROM order_item_status_events e WHERE e.order_item_id=i.id AND e.to_status='delivered') AS deliveredAt
        FROM order_items i WHERE i.order_id IN (${parameters}) ORDER BY i.order_id,i.seller_id,i.created_at,i.id`).bind(...chunk).all<ItemSource>(),
      db.prepare(`SELECT j.order_id AS orderId,j.seller_id AS sellerId,j.status,p.cod_due_paisa AS codPaisa,p.delivered_at AS deliveredAt,
        CASE WHEN p.method='courier' AND p.rider_user_id IS NULL THEN p.courier_name END AS courierName,
        CASE WHEN p.method='courier' AND p.rider_user_id IS NULL THEN j.tracking_code END AS trackingReference,
        CASE WHEN p.method='courier' AND p.rider_user_id IS NULL THEN p.tracking_url END AS trackingUrl,
        ${hasFailureReason ? "CASE WHEN p.method='courier' AND p.rider_user_id IS NULL THEN j.delivery_failure_reason END" : 'NULL'} AS failureReason
        FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.direction='outbound' AND j.order_id IN (${parameters})`).bind(...chunk).all<ParcelSource>(),
    ]);
    const itemsWithMedia = options.withItems === false ? [] : await withOrderOfferSnapshots(db, itemRows.results, row => row.id);
    const media = new Map(itemsWithMedia.map(row => [row.id, row.offerSnapshot?.mediaId ?? row.mediaId]));
    const sellerItems = new Map<string, Map<string, ItemSource[]>>();
    for (const item of itemRows.results) {
      const sellers = sellerItems.get(item.orderId) ?? new Map<string, ItemSource[]>();
      const items = sellers.get(item.sellerId) ?? [];
      items.push(item);
      sellers.set(item.sellerId, items);
      sellerItems.set(item.orderId, sellers);
    }
    const booked = new Map(parcels.results.map(parcel => [`${parcel.orderId}:${parcel.sellerId}`, parcel]));

    await Promise.all(orders.results.map(async (order) => {
      const sellers = sellerItems.get(order.orderId) ?? new Map<string, ItemSource[]>();
      const showCash = options.withCash !== false && order.paymentMode === 'cod';
      const needsAllocation = showCash && [...sellers].some(([id, items]) => !booked.has(`${order.orderId}:${id}`) && displayStatus(items, undefined, order) !== 'cancelled');
      const allocation = needsAllocation ? await readUnbookedSellerParcelCash(db, order.orderId) : [];
      const due = new Map(allocation.map(row => [row.sellerId, row.amount]));
      result.set(order.orderId, [...sellers].map(([sellerId, items]) => {
        const shipping = booked.get(`${order.orderId}:${sellerId}`);
        const status = displayStatus(items, shipping, order);
        const stageTimes = { placed: order.placedAt, preparing: firstTime(items, 'preparingAt'), packed: firstTime(items, 'packedAt'),
          'with-courier': firstTime(items, 'dispatchedAt'), delivered: shipping?.deliveredAt ?? firstTime(items, 'deliveredAt') };
        const tracking = shipping ?? (sellers.size === 1 ? order : undefined);
        return { sellerId, sellerName: items[0].sellerName, status,
          items: options.withItems === false ? [] : items.map(item => ({ id: item.id, productId: item.productId, name: item.name, quantity: item.quantity,
            status: item.status, mediaId: media.get(item.id) ?? null, reviewable: order.status === 'delivered' && Boolean(item.reviewable) })),
          courierName: tracking?.courierName ?? null, trackingReference: tracking?.trackingReference ?? null, trackingUrl: link(tracking?.trackingUrl),
          failureReason: readDeliveryFailureReason(shipping?.failureReason) ?? null,
          codPaisa: showCash && status !== 'cancelled' && status !== 'returned' ? shipping?.codPaisa ?? due.get(sellerId) ?? null : null,
          estimatedMinDays: order.estimatedMinDays, estimatedMaxDays: order.estimatedMaxDays, stageTimes };
      }));
    }));
  }
  return result;
}
