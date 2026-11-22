/** Internal aliases only: an unrelated seller's last delivery or a reverse shipment is not this item's delivery. */
export function itemDeliverySql(item='order_items',order='orders'){
 if(!/^[a-z_]+$/.test(item)||!/^[a-z_]+$/.test(order))throw new Error('Use internal delivery source aliases.');
 const parcels=`FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=${order}.id AND j.seller_id=${item}.seller_id AND j.direction='outbound' AND p.delivered_at IS NOT NULL`;
 return `(CASE WHEN (SELECT COUNT(DISTINCT p.delivered_at) ${parcels})=1 THEN (SELECT MIN(p.delivered_at) ${parcels}) WHEN (SELECT COUNT(DISTINCT p.delivered_at) ${parcels})>1 THEN NULL ELSE (SELECT MIN(e.created_at) FROM order_item_status_events e WHERE e.order_item_id=${item}.id AND e.to_status='delivered') END)`;
}
