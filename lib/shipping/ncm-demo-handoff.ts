import type { NcmDemoDeliveryQuote } from '../checkout/reviewed-quote';
import { SELLER_SHIPMENT_DELIVERY_POLICY } from '../returns/seller-shipment-delivery';
import { NCM_DEMO_SERVICE } from './ncm-demo-checkout';

type SavedShipment = NcmDemoDeliveryQuote & { vref_id: string };

export async function readNcmDemoHandoff(db: D1Database, orderId: string, jobId: string) {
  // Read the prepared COD and its complete set of delivery units in one database snapshot.
  const row = await db.prepare(`SELECT j.seller_id AS sellerId, s.id AS reference,
      s.amount_paisa AS deliveryPaisa, p.cod_due_paisa AS codPaisa, o.delivery_rate_snapshot_json AS snapshot
    FROM shipping_jobs j
    JOIN orders o ON o.id=j.order_id
    JOIN shipping_parcels p ON p.shipping_job_id=j.id
    JOIN order_delivery_shipment_allocations s ON s.order_id=j.order_id AND s.seller_id=j.seller_id
    WHERE j.order_id=? AND j.id=? AND j.direction='outbound'
      AND j.status IN ('pickup_requested','label_pending') AND j.carrier IN ('manual','nepal_can_move_manual')
      AND j.tracking_code IS NULL AND j.label_reference IS NULL
      AND p.method IS NULL AND p.rider_user_id IS NULL AND p.delivered_at IS NULL
      AND p.collected_paisa=0 AND p.remitted_paisa=0
      AND o.payment_mode='cod' AND o.currency='NPR' AND o.payment_status='pending'
      AND o.status IN ('confirmed','packing','ready_for_pickup','dispatched')
      AND s.allocation_source='ncm-demo' AND s.policy_version=?
      AND NOT EXISTS (SELECT 1 FROM first_cod_reviews r WHERE r.order_id=o.id AND r.status='pending')
      AND s.unit_count=(SELECT COUNT(*) FROM order_delivery_unit_parcels WHERE shipping_job_id=j.id)
      AND EXISTS (
        SELECT 1 FROM order_delivery_unit_parcels m
        JOIN order_delivery_unit_allocations u ON u.order_item_id=m.order_item_id AND u.unit_ordinal=m.unit_ordinal
        JOIN order_items i ON i.id=u.order_item_id AND i.order_id=s.order_id AND i.seller_id=s.seller_id
        WHERE m.shipping_job_id=j.id AND u.shipment_id=s.id AND u.order_id=s.order_id
          AND i.fulfillment_status IN ('confirmed','packing','ready_for_pickup')
          AND NOT EXISTS (SELECT 1 FROM order_fulfillment_holds h WHERE h.order_item_id=i.id
            AND h.ended_at IS NULL AND h.prevents_handoff=1)
        GROUP BY m.shipping_job_id HAVING COUNT(*)=s.unit_count AND SUM(u.amount_paisa)=s.amount_paisa
      )`)
    .bind(orderId, jobId, SELLER_SHIPMENT_DELIVERY_POLICY)
    .first<{ sellerId: string; reference: string; deliveryPaisa: number; codPaisa: number; snapshot: string }>();
  if (!row || !/^HB[A-F0-9]{18}$/.test(row.reference) || !Number.isSafeInteger(row.codPaisa) || row.codPaisa < 0)
    return null;

  let snapshot: { unitAllocationPolicy?: string; ncmDemo?: { service?: string; shipments?: SavedShipment[] } } | null;
  try { snapshot = JSON.parse(row.snapshot); } catch { return null; }
  if (snapshot?.unitAllocationPolicy !== SELLER_SHIPMENT_DELIVERY_POLICY || snapshot.ncmDemo?.service !== NCM_DEMO_SERVICE ||
      !Array.isArray(snapshot.ncmDemo.shipments)) return null;
  const matches = snapshot.ncmDemo.shipments.filter(shipment =>
    shipment?.sellerId === row.sellerId || shipment?.vref_id === row.reference);
  const shipment = matches[0];
  const branch = (value: unknown) => typeof value === 'string' && /^[A-Z0-9][A-Z0-9 ]{0,39}$/.test(value);
  if (matches.length !== 1 || shipment.sellerId !== row.sellerId || shipment.vref_id !== row.reference ||
      shipment.amountPaisa !== row.deliveryPaisa || !branch(shipment.originBranch) || !branch(shipment.destinationBranch)) return null;
  return {
    vref_id: row.reference,
    originBranch: shipment.originBranch,
    destinationBranch: shipment.destinationBranch,
    deliveryPaisa: row.deliveryPaisa,
    codPaisa: row.codPaisa,
  };
}
