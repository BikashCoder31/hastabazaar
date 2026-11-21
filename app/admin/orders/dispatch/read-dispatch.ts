import type { NepalAddress } from '@/lib/shipping/provider';
import { packedWeightSchemaAvailable } from '@/lib/shipping/packed-weight-storage';

export const dispatchLanes = [
  { id: 'ready', label: 'Ready for pickup' },
  { id: 'booked', label: 'Booked, waiting for courier' },
  { id: 'courier', label: 'With courier' },
  { id: 'problems', label: 'Problems' },
] as const;

export type DispatchLane = (typeof dispatchLanes)[number]['id'];

type DispatchRow = {
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  itemName: string;
  additionalItems: number;
  mediaId: string | null;
  addressJson: string;
  pickupAddressId: string | null;
  pickupLocality: string | null;
  pickupMunicipality: string | null;
  pickupDistrict: string | null;
  jobId: string | null;
  version: number | null;
  codDuePaisa: number | null;
  packedWeightGrams?: number | null;
  paymentMode: string;
  courierName: string | null;
  trackingNumber: string | null;
  pickupStart: number | null;
  pickupEnd: number | null;
  state: string | null;
  lane: DispatchLane;
  canMarkPickedUp: number;
};

export type DispatchParcel = Pick<
  DispatchRow,
  | 'orderId'
  | 'orderNumber'
  | 'sellerId'
  | 'sellerName'
  | 'itemName'
  | 'additionalItems'
  | 'mediaId'
  | 'jobId'
  | 'version'
  | 'codDuePaisa'
  | 'packedWeightGrams'
  | 'courierName'
  | 'trackingNumber'
  | 'pickupStart'
  | 'pickupEnd'
  | 'state'
  | 'lane'
> & {
  key: string;
  pickupGroup: string;
  pickupAddress: string;
  destination: string;
  canMarkPickedUp: boolean;
};

const waiting =
  "('pickup_requested','label_pending','label_ready','pickup_scheduled')";
const active = "('confirmed','packing','ready_for_pickup','dispatched')";
const problems =
  "('delivery_failed','returning','returned','return_to_origin','claim_open')";

function destination(json: string) {
  try {
    const address = JSON.parse(json) as Partial<NepalAddress> | null;
    return locationLabel(
      address?.locality,
      address?.municipality,
      address?.district,
    );
  } catch {
    return '';
  }
}

function locationLabel(...parts: (string | null | undefined)[]) {
  return [...new Set(parts.map((part) => part?.trim()).filter(Boolean))].join(
    ', ',
  );
}

export async function readDispatchParcels(
  db: D1Database,
  target?: { orderId: string; sellerId: string },
) {
  const weightsAvailable = await packedWeightSchemaAvailable(db);
  const rows = await db
    .prepare(`WITH portions AS (
    SELECT i.order_id,i.seller_id,MIN(i.id) AS firstItem,COUNT(*) AS itemCount,
      SUM(CASE WHEN i.fulfillment_status='ready_for_pickup' THEN 1 ELSE 0 END) AS readyCount,
      SUM(CASE WHEN i.fulfillment_status='dispatched' THEN 1 ELSE 0 END) AS dispatchedCount
    FROM order_items i JOIN orders o ON o.id=i.order_id
    WHERE i.fulfillment_status<>'cancelled'
      AND (o.status IN ${active} OR EXISTS(SELECT 1 FROM shipping_jobs problem
        WHERE problem.order_id=o.id AND problem.seller_id=i.seller_id AND problem.direction='outbound' AND problem.status IN ${problems}))
      ${target ? 'AND i.order_id=? AND i.seller_id=?' : ''}
    GROUP BY i.order_id,i.seller_id
  ), records AS (
    SELECT o.id AS orderId,o.order_number AS orderNumber,portion.seller_id AS sellerId,
      item.seller_name_snapshot AS sellerName,item.product_name_snapshot AS itemName,portion.itemCount-1 AS additionalItems,
      (SELECT m.id FROM product_media m WHERE m.product_id=item.product_id
        AND m.mime_type IN ('image/jpeg','image/png','image/webp') ORDER BY m.sort_order,m.id LIMIT 1) AS mediaId,
      o.shipping_address_json AS addressJson,a.id AS pickupAddressId,a.locality AS pickupLocality,
      a.municipality AS pickupMunicipality,a.district AS pickupDistrict,
      j.id AS jobId,p.version,p.cod_due_paisa AS codDuePaisa,o.payment_mode AS paymentMode,o.placed_at AS placedAt,
      ${weightsAvailable ? 'w.weight_grams AS packedWeightGrams,' : ''}
      COALESCE(p.courier_name,d.courier_name) AS courierName,
      COALESCE(j.tracking_code,d.tracking_reference,s.tracking_code) AS trackingNumber,
      j.pickup_window_start AS pickupStart,j.pickup_window_end AS pickupEnd,
      COALESCE(j.status,s.status) AS state,
      CASE
        WHEN j.status IN ${problems} OR (j.id IS NULL AND s.status IN ${problems}) THEN 'problems'
        WHEN j.status IN ('dispatched','picked_up','in_transit') OR (j.id IS NULL
          AND (portion.dispatchedCount>0 OR s.status IN ('picked_up','in_transit','out_for_delivery'))) THEN 'courier'
        WHEN o.status IN ${active} AND portion.readyCount>0 AND (j.id IS NULL OR j.status IN ${waiting})
          AND (p.method='courier' OR d.method='courier' OR j.status='pickup_scheduled'
            OR s.status='pickup_scheduled' OR j.pickup_window_start IS NOT NULL) THEN 'booked'
        WHEN o.status IN ${active} AND portion.readyCount=portion.itemCount AND (j.id IS NULL OR j.status IN ${waiting})
          AND NOT EXISTS(SELECT 1 FROM first_cod_reviews review WHERE review.order_id=o.id AND review.status<>'confirmed')
          AND NOT EXISTS(SELECT 1 FROM order_items held JOIN order_fulfillment_holds h ON h.order_item_id=held.id
            WHERE held.order_id=o.id AND held.seller_id=portion.seller_id AND h.ended_at IS NULL AND h.prevents_handoff=1)
          AND (p.shipping_job_id IS NOT NULL OR o.status IN ('confirmed','packing','ready_for_pickup')) THEN 'ready'
      END AS lane,
      CASE WHEN j.status IN ${waiting} AND p.method='courier' AND portion.readyCount=portion.itemCount
        AND NOT EXISTS(SELECT 1 FROM order_items cancelled WHERE cancelled.order_id=o.id
          AND cancelled.seller_id=portion.seller_id AND cancelled.fulfillment_status='cancelled')
        AND NOT EXISTS(SELECT 1 FROM first_cod_reviews review WHERE review.order_id=o.id AND review.status='pending')
        AND NOT EXISTS(SELECT 1 FROM order_items held JOIN order_fulfillment_holds h ON h.order_item_id=held.id
          WHERE held.order_id=o.id AND held.seller_id=portion.seller_id AND h.ended_at IS NULL AND h.prevents_handoff=1)
        THEN 1 ELSE 0 END AS canMarkPickedUp
    FROM portions portion JOIN orders o ON o.id=portion.order_id JOIN order_items item ON item.id=portion.firstItem
    LEFT JOIN seller_operational_addresses a ON a.seller_id=portion.seller_id AND a.purpose='pickup'
    LEFT JOIN shipping_jobs j ON j.order_id=o.id AND j.seller_id=portion.seller_id AND j.direction='outbound'
    LEFT JOIN shipping_parcels p ON p.shipping_job_id=j.id
    ${weightsAvailable ? 'LEFT JOIN seller_parcel_weights w ON w.order_id=o.id AND w.seller_id=portion.seller_id AND w.item_count=portion.itemCount' : ''}
    LEFT JOIN delivery_assignments d ON d.order_id=o.id AND p.shipping_job_id IS NULL
    LEFT JOIN shipments s ON j.id IS NULL AND s.id=(SELECT legacy.id FROM shipments legacy
      WHERE legacy.order_id=o.id ORDER BY legacy.updated_at DESC,legacy.id DESC LIMIT 1)
    WHERE p.rider_user_id IS NULL AND d.rider_user_id IS NULL
      AND (p.method IS NULL OR p.method='courier') AND (d.method IS NULL OR d.method='courier')
  ) SELECT * FROM records WHERE lane IS NOT NULL ORDER BY sellerName,pickupAddressId,placedAt,orderId`)
    .bind(...(target ? [target.orderId, target.sellerId] : []))
    .all<DispatchRow>();

  return rows.results.map((row): DispatchParcel => {
    const {
      addressJson,
      pickupAddressId,
      pickupLocality,
      pickupMunicipality,
      pickupDistrict,
      paymentMode,
      canMarkPickedUp,
      ...parcel
    } = row;
    return {
      ...parcel,
      key: `${row.orderId}:${row.sellerId}`,
      pickupGroup: pickupAddressId ?? row.sellerId,
      pickupAddress: locationLabel(
        pickupLocality,
        pickupMunicipality,
        pickupDistrict,
      ),
      destination: destination(addressJson),
      codDuePaisa: paymentMode === 'cod' ? row.codDuePaisa : 0,
      canMarkPickedUp: Boolean(canMarkPickedUp),
    };
  });
}
