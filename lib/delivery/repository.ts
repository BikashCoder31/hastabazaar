import {parseLocation,safeCourierUrl,type DeliveryLocation} from './validation';
export class DeliveryError extends Error {}
export interface DeliveryInfo {method:string;courierName:string|null;trackingUrl:string|null;trackingReference:string|null;latitude:number|null;longitude:number|null;accuracy:number|null;positionAt:number|null;orderStatus:string}
export async function getDelivery(db:D1Database,orderId:string,now=Date.now()):Promise<DeliveryInfo|null>{
 const d=await db.prepare(`SELECT d.method,d.courier_name AS courierName,d.tracking_url AS trackingUrl,COALESCE(s.tracking_code,d.tracking_reference) AS trackingReference,d.latitude,d.longitude,d.accuracy,d.position_at AS positionAt,o.status AS orderStatus FROM delivery_assignments d JOIN orders o ON o.id=d.order_id LEFT JOIN shipments s ON s.order_id=o.id WHERE d.order_id=?`).bind(orderId).first<DeliveryInfo>();
 if(d&&(d.orderStatus!=='dispatched'||d.method!=='own_rider'||!d.positionAt||now-d.positionAt>120000)){d.latitude=null;d.longitude=null;d.accuracy=null;}
 return d;
}
export async function assignDelivery(db:D1Database,o:{orderId:string;actorId:string;method:string;riderEmail?:string;courierName?:string;trackingUrl?:string;trackingReference?:string;now:number}){
 if(await db.prepare('SELECT p.shipping_job_id FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=? LIMIT 1').bind(o.orderId).first())throw new DeliveryError('Assign riders or couriers to each seller parcel.');
 if(!['own_rider','courier'].includes(o.method))throw new DeliveryError('Select own rider or courier.');
 const order=await db.prepare("SELECT id FROM orders WHERE id=? AND status IN ('confirmed','packing','ready_for_pickup','dispatched')").bind(o.orderId).first();if(!order)throw new DeliveryError('This order cannot be assigned now.');
 let riderId:string|null=null;
 if(o.method==='own_rider')throw new DeliveryError('Prepare seller parcels and assign a Super Admin-approved rider there. Historical records remain available to staff.');
 if(o.method==='own_rider'){const rider=await db.prepare("SELECT id FROM users WHERE lower(email)=? AND status='active'").bind((o.riderEmail??'').trim().toLowerCase()).first<{id:string}>();if(!rider)throw new DeliveryError('The rider must first register an active account with this email.');riderId=rider.id;}
 const courier=(o.courierName??'').trim();const reference=(o.trackingReference??'').trim();let url='';try{url=safeCourierUrl(o.trackingUrl??'');}catch{throw new DeliveryError('Enter a public HTTPS courier tracking link.');}
 if(o.method==='courier'&&(courier.length<2||courier.length>120||reference.length<2||reference.length>80))throw new DeliveryError('Enter the courier name and tracking reference.');
 const results=await db.batch([
 db.prepare("DELETE FROM delivery_assignments WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status IN ('confirmed','packing','ready_for_pickup','dispatched'))").bind(o.orderId,o.orderId),
 db.prepare(`INSERT INTO delivery_assignments(order_id,method,rider_user_id,courier_name,tracking_url,tracking_reference,assigned_by,updated_at) SELECT id,?,?,?,?,?,?,? FROM orders WHERE id=? AND status IN ('confirmed','packing','ready_for_pickup','dispatched')`).bind(o.method,riderId,o.method==='courier'?courier:null,o.method==='courier'?url||null:null,o.method==='courier'?reference:null,o.actorId,o.now,o.orderId),
 db.prepare("UPDATE shipments SET tracking_code=? WHERE order_id=? AND ?='courier' AND EXISTS(SELECT 1 FROM delivery_assignments WHERE order_id=? AND updated_at=?)").bind(reference,o.orderId,o.method,o.orderId,o.now),
 db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at) SELECT ?,?,'delivery.assigned','order',?,'Delivery assignment changed',?,? WHERE EXISTS(SELECT 1 FROM delivery_assignments WHERE order_id=? AND updated_at=?)`).bind(crypto.randomUUID(),o.actorId,o.orderId,JSON.stringify({method:o.method,riderId}),o.now,o.orderId,o.now)
 ]);if(results[1].meta.changes!==1)throw new DeliveryError('Order changed. Refresh and try again.');
}
export async function updateRiderLocation(db:D1Database,orderId:string,userId:string,value:unknown,now:number){
 let p:DeliveryLocation|undefined;try{p=value===null?undefined:parseLocation(value);}catch{throw new DeliveryError('Invalid location.');}if(value!==null&&!p)throw new DeliveryError('Location required.');
 const r=await db.prepare(`UPDATE delivery_assignments SET latitude=?,longitude=?,accuracy=?,position_at=? WHERE order_id=? AND rider_user_id=? AND method='own_rider' AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='dispatched') AND EXISTS(SELECT 1 FROM rider_profiles rp JOIN users ru ON ru.id=rp.user_id WHERE rp.user_id=rider_user_id AND rp.status='approved' AND ru.status='active')`).bind(p?.latitude??null,p?.longitude??null,p?.accuracy??null,p?now:null,orderId,userId,orderId).run();
 if(r.meta.changes!==1)throw new DeliveryError('Sharing is unavailable. The order must be dispatched and assigned to you.');
}
export async function riderJobs(db:D1Database,userId:string){return (await db.prepare(`SELECT o.id,o.order_number AS orderNumber,o.status,o.shipping_address_json AS addressJson FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.rider_user_id=? AND EXISTS(SELECT 1 FROM rider_profiles rp JOIN users ru ON ru.id=rp.user_id WHERE rp.user_id=d.rider_user_id AND rp.status='approved' AND ru.status='active') AND d.method='own_rider' AND o.status IN ('confirmed','packing','ready_for_pickup','dispatched') ORDER BY o.created_at DESC`).bind(userId).all<{id:string;orderNumber:string;status:string;addressJson:string}>()).results;}
