/** Shared customer/seller tracking must not disclose rider handover references. */
export function publicTrackingReferenceSql(
  orderId: 'orders.id' | 'o.id',
  reference: 'shipments.tracking_code' | 's.tracking_code',
): string {
  return (
    'CASE WHEN EXISTS(SELECT 1 FROM delivery_assignments private_delivery WHERE private_delivery.order_id=' +
    orderId +
    " AND (private_delivery.method='own_rider' OR private_delivery.rider_user_id IS NOT NULL)) OR EXISTS(SELECT 1 FROM shipping_parcels private_parcel JOIN shipping_jobs private_job ON private_job.id=private_parcel.shipping_job_id WHERE private_job.order_id=" +
    orderId +
    " AND (private_parcel.method='own_rider' OR private_parcel.rider_user_id IS NOT NULL)) THEN NULL ELSE " +
    reference +
    ' END'
  );
}
