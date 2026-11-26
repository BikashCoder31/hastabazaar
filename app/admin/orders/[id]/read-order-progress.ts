import type { FulfillmentOrderDetail } from '@/lib/db/repositories/fulfillment';

export async function readOrderProgress(
  db: D1Database,
  order: Pick<FulfillmentOrderDetail, 'id' | 'status' | 'deliveredAt'>,
  isSuperAdmin: boolean,
  canViewPayouts: boolean,
) {
  const publicParcel = isSuperAdmin
    ? ''
    : " AND NOT EXISTS(SELECT 1 FROM shipping_parcels p WHERE p.shipping_job_id=j.id AND (p.method='own_rider' OR p.rider_user_id IS NOT NULL))";
  const settlement =
    canViewPayouts && (order.status === 'delivered' || order.deliveredAt)
      ? db
          .prepare(`
    SELECT i.id, CASE WHEN snapshot.id IS NOT NULL THEN
      CASE WHEN entitlement.status='paid' THEN entitlement.paid_at END
    ELSE (
      SELECT CASE WHEN COUNT(*)>0 AND
        SUM(CASE WHEN payout.id IS NOT NULL THEN 1 ELSE 0 END)=COUNT(*) THEN MAX(payout.paid_at) END
      FROM seller_ledger_entries ledger
      LEFT JOIN payout_entries included ON included.ledger_entry_id=ledger.id AND included.released_at IS NULL
      LEFT JOIN payouts payout ON payout.id=included.payout_id AND payout.status='paid'
      WHERE ledger.order_item_id=i.id AND ledger.type IN ('sale','commission','reserve_hold','reserve_release')
    ) END AS paidAt
    FROM order_items i
    LEFT JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id
    LEFT JOIN managed_entitlements entitlement ON entitlement.snapshot_id=snapshot.id
    WHERE i.order_id=? AND i.fulfillment_status='delivered'`)
          .bind(order.id)
          .all<{ id: string; paidAt: number | null }>()
      : null;
  const [timing, payouts] = await Promise.all([
    db
      .prepare(`SELECT
      (SELECT MIN(CASE WHEN c.first_action_at IS NULL THEN c.first_due_at ELSE c.next_update_at END)
       FROM order_response_cases c JOIN order_response_portions response_portion ON response_portion.id=c.portion_id
       WHERE response_portion.order_id=? AND c.state<>'resolved') AS dueAt,
      (SELECT MIN(j.pickup_window_start) FROM shipping_jobs j WHERE j.order_id=? AND j.direction='outbound'
       AND j.status IN ('pickup_requested','pickup_scheduled')${publicParcel}) AS pickupAt,
      (SELECT MAX(e.created_at) FROM parcel_operation_events e
       JOIN shipping_jobs j ON j.id=e.shipping_job_id
       WHERE j.order_id=? AND j.direction='outbound' AND e.action='dispatch'${publicParcel}) AS dispatchedAt`)
      .bind(order.id, order.id, order.id)
      .first<{
        dueAt: number | null;
        pickupAt: number | null;
        dispatchedAt: number | null;
      }>(),
    settlement,
  ]);
  const paidDates = payouts?.results.map((row) => row.paidAt) ?? [];
  const paidAt =
    paidDates.length > 0 &&
    paidDates.every((time): time is number => time !== null)
      ? paidDates.reduce((latest, time) => Math.max(latest, time), 0)
      : null;
  return {
    dueAt: timing?.dueAt ?? null,
    pickupAt: timing?.pickupAt ?? null,
    dispatchedAt: timing?.dispatchedAt ?? null,
    paidAt,
  };
}
