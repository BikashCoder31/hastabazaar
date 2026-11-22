import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { operateParcel } from '../operations/parcels';
import { ncmOrderId, ncmRupeesToPaisa, type NcmApiClient } from '../shipping/nepal-can-move';
import { ensureReviewTask } from '../workflows/review-tasks';
import { ncmMariaDb, ncmTransactionGuard } from './ncm-settings';
import { reserveNcmUsage } from './ncm-usage';

const stages = {
  picked_up: 'NCM picked up the parcel',
  in_transit: 'NCM parcel is on its way',
  out_for_delivery: 'NCM parcel is out for delivery',
  delivery_failed: 'NCM delivery attempt failed',
  returning: 'NCM is returning the parcel',
  returned: 'NCM returned the parcel',
  delivered: 'NCM delivered the parcel',
  refund_initiated: 'Review an NCM refund request',
  exchange_initiated: 'Review an NCM exchange request',
};
type Stage = keyof typeof stages;
const statuses: Record<string, Stage> = {
  pickup_completed:'picked_up', dropoff_collected:'picked_up', 'pickup complete':'picked_up', 'drop off order collected':'picked_up',
  order_dispatched:'in_transit', order_arrived:'in_transit', dispatched:'in_transit', arrived:'in_transit', 'in transit':'in_transit',
  sent_for_delivery:'out_for_delivery', 'sent for delivery':'out_for_delivery', 'out for delivery':'out_for_delivery',
  delivery_completed:'delivered', delivered:'delivered', returned_to_warehouse:'delivery_failed', 'returned to warehouse':'delivery_failed',
  order_marked_rtv:'returning', 'order marked return':'returning', send_to_vendor:'returning', 'send to vendor':'returning', 'sent to vendor':'returning',
  rtv_delivery:'returned', 'rtv delivered':'returned', refund_initiated:'refund_initiated', 'refund initiated':'refund_initiated',
  exchange_initiated:'exchange_initiated', 'exchange initiated':'exchange_initiated',
};
export function ncmConfirmedStage(status: string): Stage | null {
  const label = status.trim().toLowerCase();
  if (/^(?:dispatched to|arrived at) \S[^\r\n]*$/.test(label)) return 'in_transit';
  return Object.hasOwn(statuses,label) ? statuses[label] : null;
}

type Booking = {jobId:string; partnerId:string; actorId:string; ncmOrderId:string};
type Owned = {
  orderId:string; orderNumber:string; status:string; version:number; lastStatus:Stage|null; fingerprint:string;
  deliveryCharge:number|null; returnCharge:number|null; codReported:number|null;
  paymentMode:string; codDue:number; collected:number;
};
type ProviderEvent = {id:string; event:string; payload:Record<string,unknown>};
const clean = (value: unknown, length = 420) => typeof value === 'string' ? value.replace(/\p{Cc}/gu,' ').trim().slice(0,length) : '';
const object = (value: unknown): Record<string,unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const openStatus = "p.method='courier' AND p.rider_user_id IS NULL AND j.direction='outbound' AND HEX(j.tracking_code)=HEX(b.ncm_order_id)";
const ownedWhere = `b.job_id=? AND b.partner_id=? AND b.actor_id=? AND b.ncm_order_id=? AND b.state='booked'
  AND p.delivery_partner_id=b.partner_id AND ${openStatus}
  AND d.status='in_use' AND d.booking_mode='api' AND s.connected_at IS NOT NULL AND s.connection_fingerprint IS NOT NULL`;
const ownedJoin = `ncm_bookings b JOIN shipping_jobs j ON j.id=b.job_id
  JOIN shipping_parcels p ON p.shipping_job_id=j.id
  JOIN delivery_partners d ON d.id=b.partner_id JOIN ncm_partner_settings s ON s.partner_id=b.partner_id`;
const ownedBindings = (booking:Booking) => [booking.jobId,booking.partnerId,booking.actorId,booking.ncmOrderId];

async function readOwned(d: D1Database, booking: Booking) {
  return d.prepare(`SELECT j.order_id AS orderId,o.order_number AS orderNumber,j.status,p.version,b.last_status AS lastStatus,
    s.connection_fingerprint AS fingerprint,b.delivery_charge_paisa AS deliveryCharge,b.return_charge_paisa AS returnCharge,
    b.cod_reported_paisa AS codReported,o.payment_mode AS paymentMode,p.cod_due_paisa AS codDue,
    p.collected_paisa AS collected FROM ${ownedJoin} JOIN orders o ON o.id=j.order_id WHERE ${ownedWhere}`)
    .bind(...ownedBindings(booking)).first<Owned>();
}
function lockOwned(db:D1Database, booking:Booking, fingerprint:string) {
  return [
    db.prepare('UPDATE delivery_partners SET revision=revision WHERE id=?').bind(booking.partnerId),
    ...ncmTransactionGuard(db,`EXISTS(SELECT 1 FROM ${ownedJoin} WHERE ${ownedWhere} AND s.connection_fingerprint=?)`,
      ...ownedBindings(booking),fingerprint),
  ];
}

async function evidenceId(parts: unknown[]) {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(parts)));
  return 'ncm-' + Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
const handoffStates = new Set(['pickup_requested','label_pending','label_ready','pickup_scheduled']);
const routeOrder = ['picked_up','in_transit','out_for_delivery'];

function failureReason(reason: string) {
  if (/refus|reject parcel/i.test(reason)) return 'refused';
  if (/unreach|not (?:be )?reach|no answer|not available|absent/i.test(reason)) return 'not_reached';
  if (/wrong address|incomplete address|invalid address/i.test(reason)) return 'wrong_address';
  if (/courier problem/i.test(reason)) return 'courier_problem';
  return 'other';
}

async function addTask(db:D1Database, booking:Booking, owned:Owned, key:string, title:string, detail:Record<string,unknown>, now:number) {
  const eventId = await evidenceId([booking.jobId,booking.ncmOrderId,'attention',key]);
  const insert = ncmMariaDb(db) ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
  await db.batch([
    ...lockOwned(db, booking, owned.fingerprint),
    db.prepare(`${insert} INTO parcel_operation_events(id,order_id,shipping_job_id,actor_id,action,payload_json,note,created_at)
      VALUES(?,?,?,?,'ncm_attention',?,?,?)`).bind(eventId,owned.orderId,booking.jobId,booking.actorId,
      JSON.stringify({reason:key,providerOrderId:booking.ncmOrderId,...detail}),title,now),
  ]);
  await ensureReviewTask(db,{sourceType:'ncm_action',sourceId:eventId,now});
}

export async function applyConfirmedNcmProgress(db:D1Database, input:{
  booking:Booking; status:string; webhookEvent?:ProviderEvent; client:NcmApiClient; now:number;
}) {
  const {booking,now,client} = input;
  const stage = ncmConfirmedStage(input.status);
  if (!stage) return;
  let owned = await readOwned(db, booking);
  if (!owned || owned.status === 'cancelled') return;
  const webhook = input.webhookEvent;
  const matching = webhook && ncmConfirmedStage(webhook.event) === stage ? webhook.payload : null;
  if (stage === 'refund_initiated' || stage === 'exchange_initiated') {
    const details = matching && object(matching[stage === 'refund_initiated' ? 'refund_order' : 'exchange_order']);
    const relatedOrderId = details && ncmOrderId(details.order_id ?? details.orderid ?? details.id);
    await addTask(db,booking,owned,stage,stages[stage] + ' for order ' + owned.orderNumber,
      relatedOrderId ? {relatedOrderId} : {},now);
    return;
  }
  if ((owned.status === 'delivered' && stage !== 'delivered') ||
    (owned.status === 'returned' && stage !== 'returned') ||
    (owned.status === 'returning' && stage !== 'returning' && stage !== 'returned')) return;
  const position = routeOrder.indexOf(stage);
  if (position >= 0 && owned.lastStatus && routeOrder.indexOf(owned.lastStatus) > position) return;
  const previousStatus = owned.lastStatus;
  const current = async () => {
    const updated = await readOwned(db,booking);
    if (!updated) throw new Error('The NCM parcel is no longer available for API updates.');
    return updated;
  };
  const transition = async (action:string, note:string, extras:{failureReason?:string;amountPaisa?:number;reference?:string} = {}) => {
    if (!owned) return;
    const requestId = await evidenceId([booking.jobId,booking.ncmOrderId,action,Number(owned.version)]);
    await operateParcel(db,{jobId:booking.jobId,actorId:booking.actorId,version:Number(owned.version),requestId,
      action,note,now,...extras}, {partnerId:booking.partnerId,ncmOrderId:booking.ncmOrderId,fingerprint:owned.fingerprint});
    owned = await current();
  };
  if (handoffStates.has(owned.status)) await transition('dispatch','Pickup confirmed through Nepal Can Move.');
  if (owned.status === 'delivery_failed' && (stage === 'in_transit' || stage === 'out_for_delivery' || stage === 'delivered'))
    await transition('retry','Nepal Can Move confirmed the parcel is moving again.');
  const reason = stage === 'delivery_failed' ? clean(matching?.returnReason) : '';
  if (owned.status === 'dispatched' && stage === 'delivery_failed')
    await transition('fail', reason ? 'Nepal Can Move: ' + reason : 'Nepal Can Move reported a failed delivery.', {failureReason:failureReason(reason)});
  if (['dispatched','delivery_failed'].includes(owned.status) && (stage === 'returning' || stage === 'returned'))
    await transition('return_to_origin','Return to the seller confirmed through Nepal Can Move.');
  if (owned.status === 'returning' && stage === 'returned') await transition('receive_return','Returned parcel verified through Nepal Can Move.');
  const expected = stage === 'delivered' || stage === 'returned' || stage === 'returning' || stage === 'delivery_failed' ? stage : 'dispatched';
  if (owned.status !== expected && !(stage === 'delivered' && owned.status === 'dispatched')) return;

  let deliveryCharge: number | null = null, codReported: number | null = null, returnCharge: number | null = null;
  if (stage === 'delivered' && (owned.codReported == null || owned.deliveryCharge == null)) {
    if (!await reserveNcmUsage(db,'view',1,now)) throw new Error('Today’s NCM view budget is unavailable.');
    if (!await readOwned(db,booking)) return;
    const details = await client.orderDetails(booking.ncmOrderId);
    codReported = ncmRupeesToPaisa(details.cod_charge);
    deliveryCharge = ncmRupeesToPaisa(details.delivery_charge);
    if (codReported === null || deliveryCharge === null) throw new Error('NCM did not confirm the delivery amounts.');
    if (deliveryCharge > 0) {
      const expense = await db.prepare('SELECT 1 AS present FROM parcel_courier_costs WHERE shipping_job_id=? LIMIT 1')
        .bind(booking.jobId).first();
      if (!expense) await transition('record_cost','Recorded the confirmed NCM delivery charge.',{
        amountPaisa:deliveryCharge, reference:'NCM order ' + booking.ncmOrderId,
      });
    }
    await db.batch([
      ...lockOwned(db,booking,owned.fingerprint),
      db.prepare('UPDATE ncm_bookings SET cod_reported_paisa=?,delivery_charge_paisa=? WHERE job_id=?')
        .bind(codReported,deliveryCharge,booking.jobId),
    ]);
  }
  const confirmedCod = codReported ?? Number(owned.codReported);
  if (stage === 'delivered' && owned.paymentMode === 'cod' && confirmedCod > 0 &&
    confirmedCod === Number(owned.codDue) && Number(owned.collected) === 0) {
    // Provider-confirmed collection is held by the courier. Company receipt
    // matching remains a separate staff action.
    await transition('collect','NCM confirmed delivery and collection of the exact order cash.',{
      amountPaisa:confirmedCod,reference:'NCM order ' + booking.ncmOrderId,
    });
  }
  if (owned.status === 'dispatched' && stage === 'delivered') await transition('deliver','Delivery verified through Nepal Can Move.');
  // The return amount is vendor-reported evidence. Reconciliation is manual, and
  // the order details endpoint currently documents only the outbound charge.
  if (stage === 'returned' && Array.isArray(matching?.orders)) {
    const returned = matching.orders.map(object).find(row => ncmOrderId(row.order_id) === booking.ncmOrderId);
    returnCharge = ncmRupeesToPaisa(returned?.delivery_charge);
  }
  if (previousStatus === stage && deliveryCharge === null && codReported === null && returnCharge === null) return;
  const eventId = await evidenceId([booking.jobId,booking.ncmOrderId,stage,Number(owned.version)]);
  const insert = ncmMariaDb(db) ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
  await db.batch([
    ...lockOwned(db,booking,owned.fingerprint),
    db.prepare('UPDATE shipping_parcels SET version=version WHERE shipping_job_id=?').bind(booking.jobId),
    ...ncmTransactionGuard(db,`EXISTS(SELECT 1 FROM ncm_bookings b JOIN shipping_jobs j ON j.id=b.job_id
      JOIN shipping_parcels p ON p.shipping_job_id=b.job_id
      WHERE b.job_id=? AND j.status=? AND p.version=? AND COALESCE(b.last_status,'')=?)`,
      booking.jobId,expected,Number(owned.version),previousStatus ?? ''),
    db.prepare(`UPDATE ncm_bookings SET last_status=?,updated_at=?,cod_reported_paisa=COALESCE(?,cod_reported_paisa),
      delivery_charge_paisa=COALESCE(?,delivery_charge_paisa),return_charge_paisa=COALESCE(?,return_charge_paisa)
      WHERE job_id=?`).bind(stage,now,codReported,deliveryCharge,returnCharge,booking.jobId),
    ...(previousStatus !== stage ? [
      db.prepare(`${insert} INTO parcel_operation_events(id,order_id,shipping_job_id,actor_id,action,payload_json,note,created_at)
        VALUES(?,?,?,?,'ncm_status',?,?,?)`).bind(eventId,owned.orderId,booking.jobId,booking.actorId,
        JSON.stringify({status:stage,providerOrderId:booking.ncmOrderId}),stages[stage],now),
    ] : []),
  ]);
}

export async function recordNcmComment(db:D1Database, input:{booking:Booking; eventId:string; payload:Record<string,unknown>; now:number}) {
  const {booking,payload,now} = input;
  const owned = await readOwned(db,booking);
  if (!owned) return;
  const kind = payload.comment_type;
  const rawId = payload.comment_id;
  const commentId = typeof rawId === 'string' ? clean(rawId,100) : ncmOrderId(rawId);
  const comment = clean(payload.comment,2_000);
  if ((kind !== 'Info' && kind !== 'Action') || !commentId || !comment) return;
  const insert = ncmMariaDb(db) ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
  await db.batch([
    ...lockOwned(db,booking,owned.fingerprint),
    db.prepare(`${insert} INTO ncm_courier_notes(ncm_order_id,comment_id,job_id,kind,comment,created_at)
      VALUES(?,?,?,?,?,?)`).bind(booking.ncmOrderId,commentId,booking.jobId,kind,comment,now),
  ]);
  if (kind === 'Action')
    await addTask(db,booking,owned,'comment:' + commentId,'NCM needs a reply on order ' + owned.orderNumber,{commentId},now);
}

export async function completeNcmReview(db:D1Database,actorId:string,eventId:string,requestId:string,now = Date.now()) {
  const authority = await staffMutationGuard(db,actorId,'order.manage',Error,'super_admin');
  const previous = await db.prepare(`SELECT 1 AS done FROM audit_logs
    WHERE action='ncm.review_completed' AND subject_type='parcel_operation' AND subject_id=?`).bind(eventId).first();
  if (previous) return;
  await db.batch([
    ...authority.statements,
    ...ncmTransactionGuard(db,`EXISTS(SELECT 1 FROM parcel_operation_events WHERE id=? AND action='ncm_attention')`,eventId),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at)
      VALUES(?,?,'ncm.review_completed','parcel_operation',?,'Super Admin reviewed the NCM request.',?,?)`)
      .bind(await evidenceId([eventId,'reviewed']),actorId,eventId,requestId,now),
  ]);
}
