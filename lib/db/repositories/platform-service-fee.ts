import { quoteCustomerServiceFee } from './customer-service-fees';

/** Read the recorded cancellation waiver, never infer a fee from tax or totals. */
export function currentPlatformServiceFeeSql(alias='orders') {
  if(!/^[a-z_]+$/.test(alias))throw new TypeError('Invalid order alias.');
  return `COALESCE((SELECT json_extract(e.next_json,'$.platformServiceFeePaisa') FROM order_cancellation_events e WHERE e.order_id=${alias}.id ORDER BY e.version DESC LIMIT 1),${alias}.buyer_platform_fee_paisa)`;
}

/** Storage CHECK keeps current_total fee-exclusive. All cash displays use this. */
export function payableOrderTotalSql(alias='orders') {
  if(!/^[a-z_]+$/.test(alias))throw new TypeError('Invalid order alias.');
  return `CASE WHEN ${alias}.current_total_paisa IS NULL THEN ${alias}.grand_total_paisa ELSE ${alias}.current_total_paisa+${currentPlatformServiceFeeSql(alias)} END`;
}

/** Original merchandise/delivery basis, removing cancellations once.
 * Promo aftercare reduces current_* fields, so they cannot be used for this cap.
 */
export function postCancellationGrossSql(alias='orders') {
  if(!/^[a-z_]+$/.test(alias))throw new TypeError('Invalid order alias.');
  return `(${alias}.item_subtotal_paisa-COALESCE((SELECT SUM(e.item_removed_paisa) FROM order_cancellation_events e WHERE e.order_id=${alias}.id),0)
    +${alias}.delivery_charge_paisa-COALESCE((SELECT SUM(json_extract(e.previous_json,'$.delivery')-json_extract(e.next_json,'$.delivery')) FROM order_cancellation_events e WHERE e.order_id=${alias}.id),0)
    +${currentPlatformServiceFeeSql(alias)})`;
}

export async function getPlatformServiceFee(database: D1Database, now = Date.now()) {
  return (await quoteCustomerServiceFee(database, now)).snapshot;
}
