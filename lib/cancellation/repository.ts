import {readActionProof,type ActionReference,type AtomicActionProof} from '../orders/action-recovery';
import { formAnswerSourceSql } from '../forms/answer-proof';
import {prepareCancelledDeliveryAllocations} from '../returns/delivery-allocation';
import { prepareCancellationDeliveryUnitClaims, readSavedSellerShipmentCharges, SELLER_SHIPMENT_DELIVERY_POLICY, usesSellerShipmentDelivery } from '../returns/seller-shipment-delivery';
import { readOriginalBuyerLinePricing } from '../db/repositories/order-item-pricing-snapshots';
import {prepareCancellationTender} from '../payments/cancellation-tender';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {responseScopeContains} from '../orders/response-sql';
import {prepareOrderResponseRelease} from '../orders/response-workflow';
import {prepareInitialResponseNotices} from '../orders/response-notifications';
import {prepareOrderStockSettlement} from '../products/order-stock-settlement';

import {prepareCancelledManualPayment} from '../payments/manual-payment-lifecycle';
import { cancellationCauseSchemaAvailable, inferCancellationCause, savedReviewCancellationCause, uncoveredSellerCancellationItemsSql } from './attribution';
import { readCancellationCause } from './causes';
import { cancellationNotifications } from './notifications';
import { currentPlatformServiceFeeSql, payableOrderTotalSql } from '../db/repositories/platform-service-fee';
import { riderNotifications } from '../riders/repository';
import { createHash } from 'node:crypto';
import { allocateCancellationItems, calculateCancellation } from './accounting';
import {DELIVERY_PRICING_POLICY,readDeliveryPricingSnapshot} from '../checkout/delivery-rates';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { buildFormAnswerInsert } from '../db/repositories/form-answers';
import { digestFormRequest } from '../forms/submission';
import type { FormAnswerSnapshot } from '../forms/types';
import { APPROVED_BILLING_VERSION, mergeRecordedReceiptItems, withReceiptGroups } from '../documents/billing';
import type { OrderDocumentSnapshot } from '../db/repositories/orders';
import { receiptNumberStatements } from '../db/repositories/billing-documents';
import { buildEarningsAccrualStatements } from '../db/repositories/payouts';
import { accrueManagedEntitlements } from '../db/repositories/managed-settlements';
import { issueManagedInvoiceGroups } from '../db/repositories/managed-documents';
import { customerCodSchemaAvailable } from '../orders/first-cod-review';
export class CancellationConflictError extends Error {}
export interface CancellationAccess {
  orderNumber: string;
  customerId?: string | null;
  receiptTokenHash?: string | null;
  actorId?: string;
}
type CancellationForm = { formId: 'commerce.order-cancellation' | 'staff.cancellation-review' |
  'staff.order-fulfillment'; requestId: string; versionId: string; answers: FormAnswerSnapshot };
interface Order {
  id: string;
  status: string;
  customerId: string | null;
  subtotal: number;
  delivery: number;
  serviceFee: number;
  wallet: number;
  discount: number;
  referral: number;
  promo: number;
  total: number;
  version: number;
  currentTotal: number;
  paymentMode: string;
  paymentStatus:string;
  deliverySnapshot: string | null;
}
interface Item {
  id: string;
  sellerId: string;
  sellerName: string;
  productId: string | null;
  name: string;
  quantity: number;
  amount: number;
  promo: number;
  currentPromo: number;
  status: string;
  custom: number | null;
}
interface Parcel {
  id: string;
  sellerId: string;
  version: number;
  due: number;
  collected: number;
  status: string;
}
function guard(db: D1Database, predicate: string, values: unknown[] = []) {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        'INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ' +
          predicate +
          ' THEN 1 ELSE 0 END',
      )
      .bind(id, ...values),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id),
  ];
}
async function independentCancellationReviewer(db:D1Database,actorId:string,orderId:string){
 const predicate="NOT EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=?) AND NOT EXISTS(SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=? AND s.user_id=?)",values=[orderId,actorId,orderId,actorId];
 if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first())throw new CancellationConflictError('An eligible reviewer without a personal customer or supplier interest must decide this case.');
 return guard(db,predicate,values);
}
async function source(db: D1Database, a: CancellationAccess) {
  if (a.actorId)
    await staffMutationGuard(
      db,
      a.actorId,
      'order.manage',
      CancellationConflictError,
    );
  const order = await db
    .prepare(
      `SELECT id,status,customer_id AS customerId,item_subtotal_paisa AS subtotal,delivery_charge_paisa AS delivery,buyer_platform_fee_paisa AS serviceFee,wallet_credit_paisa AS wallet,referral_discount_paisa+promo_discount_paisa AS discount,referral_discount_paisa AS referral,promo_discount_paisa AS promo,grand_total_paisa AS total,cancellation_version AS version,${payableOrderTotalSql()} AS currentTotal,payment_mode AS paymentMode,payment_status AS paymentStatus,delivery_rate_snapshot_json AS deliverySnapshot FROM orders WHERE order_number=? AND (? IS NOT NULL OR (? IS NOT NULL AND customer_id=?) OR (? IS NOT NULL AND receipt_token_hash=?))`,
    )
    .bind(
      a.orderNumber,
      a.actorId ?? null,
      a.customerId ?? null,
      a.customerId ?? null,
      a.receiptTokenHash ?? null,
      a.receiptTokenHash ?? null,
    )
    .first<Order>();
  if (!order)
    throw new CancellationConflictError('Order access could not be verified.');
  const items = (
    await db
      .prepare(
        'SELECT id,seller_id AS sellerId,seller_name_snapshot AS sellerName,product_id AS productId,product_name_snapshot AS name,quantity,line_total_paisa AS amount,promo_discount_paisa AS promo,current_promo_discount_paisa AS currentPromo,fulfillment_status AS status,made_to_order_snapshot AS custom FROM order_items WHERE order_id=? ORDER BY id',
      )
      .bind(order.id)
      .all<Item>()
  ).results;
  const buyerPricing = await readOriginalBuyerLinePricing(db, order.id);
  if (buyerPricing) {
    for (const item of items) {
      const saved = buyerPricing.get(item.id);
      if (saved) item.amount = saved.customerSubtotalPaisa;
    }
    if (items.reduce((sum, item) => sum + BigInt(item.amount), BigInt(0)) !== BigInt(order.subtotal)) {
      throw new CancellationConflictError('Reconcile original buyer prices before cancellation.');
    }
  }
  const parcels = (
    await db
      .prepare(
        "SELECT j.id,j.seller_id AS sellerId,p.version,p.cod_due_paisa AS due,p.collected_paisa AS collected,j.status FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=? AND j.direction='outbound' ORDER BY j.id",
      )
      .bind(order.id)
      .all<Parcel>()
  ).results;
  return { order, items, parcels };
}
async function deliveryRule(db: D1Database, order: Order, items: readonly Item[]) {
 if (usesSellerShipmentDelivery(order.deliverySnapshot)) {
  const sellerCharges = await readSavedSellerShipmentCharges(db, order.id, order.delivery, items.map(item => item.sellerId));
  return { pricingPolicy: SELLER_SHIPMENT_DELIVERY_POLICY, sellerCharges } as const;
 }
 const result=readDeliveryPricingSnapshot(order.deliverySnapshot,order.delivery);
 if(result.kind==='legacy')return order.delivery;
 if(result.kind==='invalid')throw new CancellationConflictError('The recorded delivery policy needs staff reconciliation.');
 const snapshot=result.snapshot;
 const originalStoreCount=new Set(items.map((item)=>item.sellerId)).size;
 if(snapshot.storeCount!==originalStoreCount)throw new CancellationConflictError('The recorded delivery policy needs staff reconciliation.');
 return {pricingPolicy:DELIVERY_PRICING_POLICY,baseChargePaisa:snapshot.baseChargePaisa};
}
export async function cancellationPreview(
  db: D1Database,
  a: CancellationAccess,
  sellerIds: readonly string[],
) {
  const s = await source(db, a),
    { order, items, parcels } = s;
  const selected = [...new Set(sellerIds)].sort();
  if (
    !selected.length ||
    selected.some(
      (id) => !items.some((i) => i.sellerId === id && i.status !== 'cancelled'),
    )
  )
    throw new CancellationConflictError('Choose a current seller parcel.');
  if (
    ![
      'placed',
      'confirmed',
      'packing',
      'ready_for_pickup',
      'dispatched',
      'delivered',
    ].includes(order.status)
  )
    throw new CancellationConflictError('This order is closed.');
  const target = items.filter((i) => selected.includes(i.sellerId));
  const advancedCustody=target.some(i=>!['confirmed','packing','ready_for_pickup'].includes(i.status))||parcels.some(p=>selected.includes(p.sellerId)&&!['pickup_requested','label_pending','label_ready','pickup_scheduled','cancelled'].includes(p.status));
  const paymentFacts=await db.prepare(`SELECT
    (SELECT revision FROM manual_payment_windows WHERE order_id=?) AS windowRevision,
    (SELECT revision FROM manual_payment_claims WHERE order_id=? AND current_state NOT IN('rejected','withdrawn')) AS claimRevision,
    COALESCE((SELECT SUM(amount_paisa) FROM manual_payment_allocations WHERE order_id=?),0) AS allocatedPaisa`).bind(order.id,order.id,order.id).first<{windowRevision:number|null;claimRevision:number|null;allocatedPaisa:number}>();
  if (
    BigInt(order.total) !==
    BigInt(order.subtotal) +
      BigInt(order.delivery) + BigInt(order.serviceFee) -
      BigInt(order.wallet) -
      BigInt(order.discount)
  )
    throw new CancellationConflictError(
      'Historical charges need staff reconciliation before cancellation.',
    );
  if (order.version === 0 && items.some((i) => i.status === 'cancelled'))
    throw new CancellationConflictError(
      'A historical cancellation needs staff reconciliation.',
    );
  const financial = await db
    .prepare(
      "SELECT 1 FROM refunds WHERE order_id=? AND status<>'rejected' UNION ALL SELECT 1 FROM rider_reports r JOIN shipping_jobs j ON j.id=r.shipping_job_id WHERE j.order_id=? AND r.status='pending' LIMIT 1",
    )
    .bind(order.id, order.id)
    .first();
  const allocations = allocateCancellationItems(
    items.map((i) => ({ id: i.id, sellerId: i.sellerId, amount: i.amount, ...(order.promo ? {promo:i.promo} : {}) })),
    order.wallet,
    order.discount,
  );
  const pricing=await deliveryRule(db,order,items);
  const previousCancelled = new Set(
    items.filter((i) => i.status === 'cancelled').map((i) => i.sellerId),
  );
  const previous = calculateCancellation(
    allocations,
    previousCancelled,
    pricing,
    order.serviceFee,
  );
  selected.forEach((id) => previousCancelled.add(id));
  const next = calculateCancellation(
    allocations,
    previousCancelled,
    pricing,
    order.serviceFee,
  );
  // A collected original service fee requires its separate lawful refund authorization.
  if(!next.parcels.length && order.serviceFee>0 && ['paid','captured','part_refunded','refunded'].includes(order.paymentStatus)){next.platformServiceFeePaisa=order.serviceFee;next.uncollectedServiceFeeWaivedPaisa=0;next.total+=order.serviceFee;}
  // Delivery may precede collection. An unpaid parcel can still receive its
  // recalculated COD balance, but collected cash must never acquire a new due.
  const collectedIncrease=parcels.some(p=>!selected.includes(p.sellerId)&&p.collected>0&&(next.parcels.find(r=>r.sellerId===p.sellerId)?.amount??0)>p.due);
  const reviewRequired=['paid','captured'].includes(order.paymentStatus)||advancedCustody||Boolean(financial)||collectedIncrease||order.paymentMode!=='cod'||Boolean(paymentFacts?.claimRevision!==null&&paymentFacts?.claimRevision!==undefined)||Number(paymentFacts?.allocatedPaisa??0)>0||parcels.some(p=>selected.includes(p.sellerId)&&p.collected>0)||target.some(i=>i.status==='ready_for_pickup'||i.status==='packing'&&i.custom!==0);
  const executionBlocked=advancedCustody||Boolean(financial)||collectedIncrease;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ order, items, parcels, selected, next,paymentFacts }))
    .digest('hex');
  return {
    ...s,
    selected,
    allocations,
    previous,
    next,
    reviewRequired,
    executionBlocked,
    advancedCustody,
    paymentFacts,
    fingerprint,
    walletRestored: next.walletRestored - previous.walletRestored,
    discountRemoved: next.discountRemoved - previous.discountRemoved,
    deliveryPricingPolicy:typeof pricing==='number'?null:pricing.pricingPolicy,
  };
}
export async function cancellationChoices(
  db: D1Database,
  a: CancellationAccess,
) {
  const { items,order,parcels } = await source(db, a);
  const groups = [
    ...new Set(
      items.filter((i) => i.status !== 'cancelled').map((i) => i.sellerId),
    ),
  ];
  return groups.map((id) => ({
    id,
    name: items.find((i) => i.sellerId === id)!.sellerName,
    eligible:true,
    items:items.filter(i=>i.sellerId===id&&i.status!=='cancelled').map(i=>({id:i.id,name:i.name,quantity:i.quantity,status:i.status})),
    reviewRequired:order.paymentMode!=='cod'||['paid','captured'].includes(order.paymentStatus)||parcels.some(p=>p.sellerId===id&&p.collected>0)||items.some(i=>i.sellerId===id&&(!['confirmed','packing'].includes(i.status)||i.status==='packing'&&i.custom!==0)),
  }));
}
/** Authenticated recovery does not need an editable form or a new command. */
export async function cancellationOutcome(db:D1Database,a:CancellationAccess,requestId:string){
 if(!/^[a-zA-Z0-9:_-]{1,150}$/.test(requestId))throw new CancellationConflictError('Invalid cancellation reference.');
 const {order}=await source(db,a);
 const result=await db.prepare("SELECT id,'cancelled' AS status,'approved' AS decision FROM order_cancellation_events WHERE id=? AND order_id=? UNION ALL SELECT id,'review_requested' AS status,status AS decision FROM order_cancellation_reviews WHERE id=? AND order_id=?").bind(requestId,order.id,requestId,order.id).first<{id:string;status:'cancelled'|'review_requested';decision:string}>();
 return result;
}
async function finishCancellationSettlement(db: D1Database, orderId: string, actorId: string | null, requestId: string, now: number, staffAuthSubject?:string) {
  let settlementDb=db;
  if(staffAuthSubject!==undefined){
    if(!actorId)throw new CancellationConflictError('Current staff identity is required for settlement continuation.');
    // Each native hook owns its own idempotent transaction. Fence those writes
    // with the same current staff identity as the approved POST, without adding
    // another receipt or changing their existing request identities.
    settlementDb=Object.create(db) as D1Database;
    settlementDb.prepare=db.prepare.bind(db);
    settlementDb.batch=(async(statements:D1PreparedStatement[])=>{
      const authority=await staffMutationGuard(db,actorId,'order.manage',CancellationConflictError);
      const identity=guard(db,"EXISTS(SELECT 1 FROM users WHERE HEX(id)=HEX(?) AND HEX(auth_subject)=HEX(?) AND status='active')",[actorId,staffAuthSubject]);
      const independence=await independentCancellationReviewer(db,actorId,orderId);
      const boundary=[...authority.statements,...identity,...independence];
      const results=await db.batch([...boundary,...statements,...boundary]);
      return results.slice(boundary.length,boundary.length+statements.length);
    }) as D1Database['batch'];
  }
  await accrueManagedEntitlements(settlementDb, { orderId, actorId, requestId: requestId + ':managed-accrue', now });
  await issueManagedInvoiceGroups(settlementDb, { orderId, requestId: requestId + ':managed-invoice', now });
}

/** Resume only existing post-commit hooks; opaque references cannot approve a decision. */
export async function continueCancellationSettlement(db:D1Database,reference:ActionReference,authSubject:string,now:number){
 const proof=await readActionProof(db,reference,authSubject);
 if(reference.action!=='approve'||!proof)throw new CancellationConflictError('Original authenticated approval proof is unavailable.');
 const requestId=`review:${reference.sourceId}`;
 const event=await db.prepare(`SELECT e.order_id AS orderId,e.actor_id AS actorId,e.seller_ids_json AS sellers,e.note,
   o.order_number AS orderNumber,o.status,r.status AS reviewStatus,r.seller_ids_json AS reviewSellers
   FROM order_cancellation_events e JOIN orders o ON o.id=e.order_id
   JOIN order_cancellation_reviews r ON r.order_id=e.order_id AND r.id=? WHERE e.id=?`)
   .bind(reference.sourceId,requestId).first<{orderId:string;actorId:string;sellers:string;note:string;orderNumber:string;status:string;reviewStatus:string;reviewSellers:string}>();
 if(!event||event.actorId!==reference.actorId||event.reviewStatus!=='approved'||event.sellers!==event.reviewSellers)
   throw new CancellationConflictError('Original cancellation history could not be verified.');
 await source(db,{actorId:reference.actorId,orderNumber:event.orderNumber});
 await independentCancellationReviewer(db,reference.actorId,event.orderId);
 const audit=await db.prepare(`SELECT actor_id AS actorId,subject_id AS subjectId,next_json AS json FROM audit_logs
   WHERE request_id=? AND action='cancellation.form_submitted' AND subject_type='order'`)
   .bind(requestId+':catalog').first<{actorId:string;subjectId:string;json:string}>();
 const answer=await db.prepare(`SELECT config_version_id AS versionId,answers_json AS json,actor_id AS actorId,
   subject_type AS subjectType,subject_id AS subjectId FROM ${formAnswerSourceSql(db)} original_answers
   WHERE request_id=? AND form_id='staff.cancellation-review'`)
   .bind(requestId).first<{versionId:string;json:string;actorId:string;subjectType:string;subjectId:string}>();
 if(!audit||!answer||audit.actorId!==reference.actorId||audit.subjectId!==event.orderId||answer.actorId!==reference.actorId||
   answer.subjectType!=='order_cancellation_event'||answer.subjectId!==requestId)
   throw new CancellationConflictError('Original cancellation form history could not be verified.');
 const saved=JSON.parse(audit.json) as {formId?:string;action?:string;fingerprint?:string;catalogDigest?:string};
 const answers=JSON.parse(answer.json) as FormAnswerSnapshot;
 const digest=await digestFormRequest({formId:'staff.cancellation-review',action:'approve',orderId:event.orderId,
   actorId:reference.actorId,selectedIds:JSON.parse(event.sellers) as string[],note:event.note.trim(),fingerprint:saved.fingerprint,
   reviewId:reference.sourceId,versionId:answer.versionId,answers});
 if(saved.formId!=='staff.cancellation-review'||saved.action!=='approve'||answers.formId!=='staff.cancellation-review'||saved.catalogDigest!==digest)
   throw new CancellationConflictError('Original cancellation form history could not be verified.');
 if(event.status==='delivered')await finishCancellationSettlement(db,event.orderId,reference.actorId,requestId,now,authSubject);
 // Fence successful no-op hooks and final reads as well as actual mutation batches.
 await source(db,{actorId:reference.actorId,orderNumber:event.orderNumber});
 await independentCancellationReviewer(db,reference.actorId,event.orderId);
 return proof;
}

export async function cancelSelectedParcels(
  db: D1Database,
  a: CancellationAccess,
  o: {
    sellerIds: readonly string[];
    fingerprint: string;
    requestId: string;
    note: string;
    now: number;
    reviewId?: string;
    originalProof?: AtomicActionProof;
    staffAuthSubject?:string;
    codNotConfirmed?: boolean;
    cause?: string;
    form?: CancellationForm;
    parcelContext?: { jobId: string; payload: string; riderPrivacyRequired?: boolean; causeSchemaAvailable?: boolean;
      form?: {requestId:string;versionId:string;answers:FormAnswerSnapshot} };
  },
) {
  if (
    !/^[a-zA-Z0-9:_-]{1,150}$/.test(o.requestId) ||
    o.note.trim().length < 8 ||
    o.note.length > 300
  )
    throw new CancellationConflictError(
      'Use a request reference and reason of 8–300 characters.',
    );
  const parcelForm=o.parcelContext?.form;
  if(o.staffAuthSubject!==undefined&&!a.actorId)
    throw new CancellationConflictError('Current staff identity is required for settlement continuation.');
  if(parcelForm && (!a.actorId || parcelForm.requestId!==o.requestId))
    throw new CancellationConflictError('Configured parcel cancellation requires its staff request.');
  const form = o.form;
  const causeAvailable = o.parcelContext?.causeSchemaAvailable ?? await cancellationCauseSchemaAvailable(db);
  const causeInput = causeAvailable ? readCancellationCause(o.cause) : undefined;
  if (causeAvailable && o.cause !== undefined && (!causeInput || !a.actorId))
    throw new CancellationConflictError('Choose a cancellation cause.');
  if (o.codNotConfirmed && (!a.actorId || form?.formId !== 'staff.order-fulfillment' ||
      !await customerCodSchemaAvailable(db)))
    throw new CancellationConflictError('Cash-on-delivery confirmation is unavailable for this order.');
  if (form && (parcelForm || form.requestId !== o.requestId ||
    form.answers.formId !== form.formId ||
    (form.formId === 'commerce.order-cancellation' && (a.actorId || o.reviewId)) ||
    (form.formId === 'staff.cancellation-review' && (!a.actorId || !o.reviewId ||
      o.requestId !== `review:${o.reviewId}`)) ||
    (form.formId === 'staff.order-fulfillment' && (!a.actorId || o.reviewId || o.parcelContext))))
    throw new CancellationConflictError('Configured cancellation request does not match its action.');
  const authorizedSource = await source(db, a);
  const actorId = a.actorId ?? (authorizedSource.order.customerId === a.customerId ? a.customerId : null) ?? null;
  const privateParcelSql = "EXISTS(SELECT 1 FROM users privacy_user JOIN user_roles privacy_role ON privacy_role.user_id=privacy_user.id WHERE privacy_user.id=? AND privacy_user.status='active' AND privacy_role.role='super_admin') OR NOT EXISTS(SELECT 1 FROM shipping_parcels private_parcel WHERE private_parcel.shipping_job_id=? AND (private_parcel.method='own_rider' OR private_parcel.rider_user_id IS NOT NULL))";
  const privateParcelValues = [a.actorId, o.parcelContext?.jobId];
  const enforceRiderPrivacy = Boolean(a.actorId && o.parcelContext?.riderPrivacyRequired);
  if (enforceRiderPrivacy && !await db.prepare('SELECT 1 WHERE ' + privateParcelSql).bind(...privateParcelValues).first())
    throw new CancellationConflictError('Super Admin access is required.');
  const privateParcelGuard = () => enforceRiderPrivacy ? guard(db, '(' + privateParcelSql + ')', privateParcelValues) : [];
  const selectedIds = [...new Set(o.sellerIds)].sort();
  const formAction = o.reviewId ? 'approve' : 'confirm';
  const formDigest = form ? await digestFormRequest({ formId: form.formId,
    action: formAction, orderId: authorizedSource.order.id, actorId, selectedIds,
    note: o.note.trim(), fingerprint: o.fingerprint, reviewId: o.reviewId ?? null,
    ...(o.codNotConfirmed ? { codNotConfirmed: true } : {}),
    ...(causeInput ? { cause: causeInput } : {}),
    versionId: form.versionId, answers: form.answers }) : null;
  const catalogAuditId = `${o.requestId}:catalog`;
  const catalogAudit = () => db.prepare(`INSERT INTO audit_logs
    (id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
    VALUES (?,?,'cancellation.form_submitted','order',?,?,?,?,?)`)
    .bind(crypto.randomUUID(), actorId, authorizedSource.order.id, o.note,
      JSON.stringify({ catalogDigest: formDigest, formId: form?.formId,
        action: formAction, fingerprint: o.fingerprint, ...(o.codNotConfirmed ? { codNotConfirmed: true } : {}) }),
      catalogAuditId, o.now);
  async function assertFormReplay(subjectType: 'order_cancellation_event' | 'order_cancellation_review') {
    const audit = await db.prepare(`SELECT actor_id AS actorId,subject_id AS subjectId,
      next_json AS nextJson FROM audit_logs WHERE request_id=? AND action='cancellation.form_submitted'
      AND subject_type='order' LIMIT 1`).bind(catalogAuditId)
      .first<{ actorId: string | null; subjectId: string; nextJson: string | null }>();
    if (!form) {
      if (audit) throw new CancellationConflictError('Request reference already used.');
      return;
    }
    const answer = await db.prepare(`SELECT form_id AS formId,config_version_id AS versionId,
      subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId
      FROM ${formAnswerSourceSql(db)} original_answers WHERE request_id=? AND form_id=? LIMIT 1`)
      .bind(o.requestId, form.formId).first<{ formId: string; versionId: string;
        subjectType: string; subjectId: string; actorId: string | null }>();
    let saved: { catalogDigest?: string; formId?: string; action?: string } | null = null;
    try { saved = JSON.parse(audit?.nextJson ?? 'null'); } catch { /* malformed audit conflicts */ }
    if (!audit || audit.actorId !== actorId || audit.subjectId !== authorizedSource.order.id ||
      saved?.catalogDigest !== formDigest || saved?.formId !== form.formId ||
      saved?.action !== formAction || answer?.versionId !== form.versionId ||
      answer?.subjectType !== subjectType || answer?.subjectId !== o.requestId ||
      answer?.actorId !== actorId)
      throw new CancellationConflictError('Request reference already used.');
  }
  async function assertCauseReplay(subject: 'event' | 'review') {
    if (!causeAvailable) return;
    const requestId = subject === 'event' ? o.requestId
      : o.requestId + (parcelForm ? ':parcel-form' : ':review-cause');
    const audit = await db.prepare(`SELECT next_json AS data FROM audit_logs WHERE request_id=?
      AND subject_type='order' AND subject_id=? AND action IN
        ('order.parcel_cancelled','order.cancellation_accounting','cancellation.review_requested')`)
      .bind(requestId, authorizedSource.order.id).first<{ data: string | null }>();
    let saved: { causeInput?: string } | null;
    try { saved = JSON.parse(audit?.data ?? 'null'); }
    catch { throw new CancellationConflictError('Request reference already used.'); }
    if (saved?.causeInput !== causeInput)
      throw new CancellationConflictError('Request reference already used.');
  }
  const existing = await db
    .prepare(
      'SELECT order_id AS orderId,actor_id AS actorId,seller_ids_json AS sellers,note FROM order_cancellation_events WHERE id=?',
    )
    .bind(o.requestId)
    .first<{
      orderId: string;
      actorId: string | null;
      sellers: string;
      note: string;
    }>();
  if (existing) {
    if(o.originalProof)throw new CancellationConflictError('Original authenticated action proof is unavailable; keep this attempt unconfirmed.');
    if (
      existing.orderId !== authorizedSource.order.id ||
      existing.actorId !== actorId ||
      existing.sellers !== JSON.stringify([...new Set(o.sellerIds)].sort()) ||
      existing.note !== o.note
    )
      throw new CancellationConflictError('Request reference already used.');
    if(parcelForm){
      const event=await db.prepare('SELECT actor_id AS actorId,shipping_job_id AS jobId,payload_json AS payload FROM parcel_operation_events WHERE id=?')
        .bind(o.requestId).first<{actorId:string;jobId:string;payload:string}>();
      if(event?.actorId!==a.actorId||event?.jobId!==o.parcelContext?.jobId||event?.payload!==o.parcelContext?.payload)
        throw new CancellationConflictError('Request reference already used.');
    }
    await assertCauseReplay('event');
    await assertFormReplay('order_cancellation_event');
    // Cancellation and its receipt commit together. A verified retry resumes
    // only the idempotent managed hooks if a post-commit dependency failed.
    if (authorizedSource.order.status === 'delivered')
      await finishCancellationSettlement(db, authorizedSource.order.id, actorId, o.requestId, o.now,o.staffAuthSubject);
    return { status: 'cancelled', id: o.requestId };
  }
  const priorReview = await db
    .prepare(
      'SELECT order_id AS orderId,requested_by AS actorId,seller_ids_json AS sellers,note FROM order_cancellation_reviews WHERE id=?',
    )
    .bind(o.requestId)
    .first<{
      orderId: string;
      actorId: string | null;
      sellers: string;
      note: string;
    }>();
  if (priorReview) {
    if (
      priorReview.orderId !== authorizedSource.order.id ||
      priorReview.actorId !== actorId ||
      priorReview.sellers !==
        JSON.stringify([...new Set(o.sellerIds)].sort()) ||
      priorReview.note !== o.note.trim()
    )
      throw new CancellationConflictError('Request reference already used.');
    if(parcelForm){
      const audit=await db.prepare("SELECT next_json AS nextJson FROM audit_logs WHERE request_id=? AND action='cancellation.review_requested' AND subject_type='order' AND actor_id=?")
        .bind(o.requestId+':parcel-form',a.actorId).first<{nextJson:string}>();
      const saved = JSON.parse(audit?.nextJson ?? 'null');
      if (saved?.jobId !== o.parcelContext?.jobId || saved?.payload !== o.parcelContext?.payload)
        throw new CancellationConflictError('Request reference already used.');
    }
    await assertCauseReplay('review');
    await assertFormReplay('order_cancellation_review');
    return { status: 'review_requested', id: o.requestId };
  }
  const p = await cancellationPreview(db, a, o.sellerIds);
  if (o.codNotConfirmed && p.reviewRequired)
    throw new CancellationConflictError('The order changed. Open the order to review its cancellation.');
  if (p.fingerprint !== o.fingerprint && (o.reviewId || !p.reviewRequired))
    throw new CancellationConflictError(
      'Order amounts or readiness changed. Review the updated cancellation before confirming.',
    );
  const savedCause = causeAvailable && o.reviewId
    ? await savedReviewCancellationCause(db, p.order.id, o.reviewId) : undefined;
  const inferredCause = causeAvailable && !savedCause
    ? !a.actorId || o.codNotConfirmed ? 'customer' : await inferCancellationCause(db, p.order.id, p.selected)
    : undefined;
  const cause = causeAvailable ? savedCause ?? inferredCause ?? causeInput : undefined;
  const inferredSellerGuard = () => inferredCause === 'seller'
    ? guard(db, `NOT EXISTS(${uncoveredSellerCancellationItemsSql(db, true)})`, [p.order.id, JSON.stringify(p.selected)])
    : [];
  if (causeAvailable && !cause)
    throw new CancellationConflictError('Choose a cancellation cause.');
  if (p.reviewRequired && !o.reviewId) {
    const id = o.requestId;
    const reviewAuthority = a.actorId
      ? await staffMutationGuard(
          db,
          a.actorId,
          'order.manage',
          CancellationConflictError,
        )
      : null;
    await db.batch([
      ...(reviewAuthority?.statements ?? []),
      ...(a.actorId?await independentCancellationReviewer(db,a.actorId,p.order.id):[]),
      ...privateParcelGuard(),
      ...(!a.actorId ? guard(db,
        'EXISTS(SELECT 1 FROM orders WHERE id=? AND ((? IS NOT NULL AND customer_id=?) OR (? IS NOT NULL AND receipt_token_hash=?)))',
        [p.order.id, a.customerId ?? null, a.customerId ?? null,
          a.receiptTokenHash ?? null, a.receiptTokenHash ?? null]) : []),
      db
        .prepare('UPDATE orders SET updated_at=updated_at WHERE id=?')
        .bind(p.order.id),
      ...inferredSellerGuard(),
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM orders WHERE id=? AND cancellation_version=?)',
        [p.order.id, p.order.version],
      ),
      ...guard(
        db,
        `NOT EXISTS(SELECT 1 FROM order_cancellation_reviews existing WHERE order_id=? AND status='pending' AND EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=existing.order_id AND ${responseScopeContains(db,'existing.seller_ids_json','i.seller_id')} AND ${responseScopeContains(db,'?','i.seller_id')}))`,
        [p.order.id,JSON.stringify(p.selected)],
      ),
      db
        .prepare(
          `INSERT INTO order_cancellation_reviews(id,order_id,seller_ids_json,note,requested_by,created_at,original_facts_json${cause ? ',cause' : ''}) VALUES (?,?,?,?,?,${checkoutCommitClock(db)},?${cause ? ',?' : ''})`,
        )
        .bind(
          id,
          p.order.id,
          JSON.stringify(p.selected),
          o.note.trim(),
          actorId,
          JSON.stringify({order:p.order,items:p.items,parcels:p.parcels,paymentFacts:p.paymentFacts,fingerprint:p.fingerprint}),
          ...(cause ? [cause] : []),
        ),
      db
        .prepare(
          "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES (?,?,'cancellation.review_requested','order',?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          actorId,
          p.order.id,
          o.note,
          parcelForm ? JSON.stringify({ jobId: o.parcelContext?.jobId, payload: o.parcelContext?.payload, cause, causeInput })
            : cause ? JSON.stringify({ cause, causeInput }) : null,
          parcelForm ? o.requestId+':parcel-form' : cause ? o.requestId+':review-cause' : null,
          o.now,
        ),
      ...(parcelForm?[buildFormAnswerInsert(db,{formId:'staff.parcel-control',requestId:o.requestId,
        versionId:parcelForm.versionId,subjectType:'shipping_job',subjectId:o.parcelContext!.jobId,
        actorId:a.actorId!,answers:parcelForm.answers,now:o.now})]:[]),
      ...(form ? [catalogAudit(), buildFormAnswerInsert(db, { formId: form.formId,
        requestId: o.requestId, versionId: form.versionId,
        subjectType: 'order_cancellation_review', subjectId: o.requestId,
        actorId, answers: form.answers, now: o.now })] : []),
      db.prepare(`INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,owner_id,has_deadline) SELECT ?,'cancellation_review',id,id,created_at,first_due_at,'continuous-v1',created_at,owner_id,1 FROM order_cancellation_reviews WHERE id=?`).bind(crypto.randomUUID(),id),
      ...(await cancellationNotifications(db, p.order.id, id, true, o.now)),
    ]);
    return { status: 'review_requested', id };
  }
  if(p.executionBlocked)throw new CancellationConflictError('Keep this case open for the actual custody, refund or collected-charge reconciliation. No cancellation or stock return has been executed.');
  const authority = a.actorId
    ? await staffMutationGuard(
        db,
        a.actorId,
        'order.manage',
        CancellationConflictError,
      )
    : null;
  const statements: D1PreparedStatement[] = [
    ...(a.actorId?await independentCancellationReviewer(db,a.actorId,p.order.id):[]),
    ...(o.codNotConfirmed ? [
      db.prepare("UPDATE first_cod_reviews SET status=status WHERE order_id=? AND status='pending' AND hold_source='customer_flag'").bind(p.order.id),
      ...guard(db, `EXISTS(SELECT 1 FROM first_cod_reviews r JOIN orders cod_order ON cod_order.id=r.order_id
        WHERE r.order_id=? AND r.status='pending' AND r.hold_source='customer_flag'
          AND cod_order.status='confirmed' AND cod_order.payment_mode='cod')`, [p.order.id]),
    ] : []),
    db
      .prepare(
        'UPDATE orders SET cancellation_version=cancellation_version+1,operation_request_id=? WHERE id=? AND cancellation_version=?',
      )
      .bind(o.requestId, p.order.id, p.order.version),
    ...inferredSellerGuard(),
    ...guard(
      db,
      'EXISTS(SELECT 1 FROM orders WHERE id=? AND cancellation_version=? AND operation_request_id=?)',
      [p.order.id, p.order.version + 1, o.requestId],
    ),
  ];
  statements.push(
    ...guard(
      db,
      'EXISTS(SELECT 1 FROM orders WHERE id=? AND status=? AND grand_total_paisa=? AND wallet_credit_paisa=? AND referral_discount_paisa=? AND promo_discount_paisa=?)',
      [
        p.order.id,
        p.order.status,
        p.order.total,
        p.order.wallet,
        p.order.referral,
        p.order.promo,
      ],
    ),
  );
  statements.push(
    ...guard(
      db,
      "(SELECT COUNT(*) FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=? AND j.direction='outbound')=?",
      [p.order.id, p.parcels.length],
    ),
  );
  if (!a.actorId)
    statements.push(
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM orders WHERE id=? AND ((? IS NOT NULL AND customer_id=?) OR (? IS NOT NULL AND receipt_token_hash=?)))',
        [
          p.order.id,
          a.customerId ?? null,
          a.customerId ?? null,
          a.receiptTokenHash ?? null,
          a.receiptTokenHash ?? null,
        ],
      ),
    );
  statements.push(...guard(db,`EXISTS(SELECT 1 FROM orders WHERE id=? AND payment_status=?) AND COALESCE((SELECT revision FROM manual_payment_windows WHERE order_id=?),-1)=? AND COALESCE((SELECT revision FROM manual_payment_claims WHERE order_id=? AND current_state NOT IN('rejected','withdrawn')),-1)=?`,[p.order.id,p.order.paymentStatus,p.order.id,p.paymentFacts?.windowRevision??-1,p.order.id,p.paymentFacts?.claimRevision??-1]));
  if (o.reviewId) {
    if (!a.actorId)
      throw new CancellationConflictError('Staff review is required.');
    statements.push(
      ...guard(
        db,
        "EXISTS(SELECT 1 FROM order_cancellation_reviews WHERE id=? AND order_id=? AND status='pending' AND seller_ids_json=?)",
        [o.reviewId, p.order.id, JSON.stringify(p.selected)],
      ),
      db
        .prepare(
          "UPDATE order_cancellation_reviews SET status='approved',reviewed_by=?,review_note=?,reviewed_at=?,revision=revision+1,first_action_at=COALESCE(first_action_at,?) WHERE id=?",
        )
        .bind(a.actorId, o.note, o.now,o.now, o.reviewId),
      ...guard(db, "EXISTS(SELECT 1 FROM order_cancellation_reviews WHERE id=? AND status='approved' AND reviewed_by=? AND reviewed_at=?)",
        [o.reviewId, a.actorId, o.now]),
    );
  }
  for (const i of p.items)
    statements.push(
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM order_items WHERE id=? AND fulfillment_status=? AND line_total_paisa=? AND COALESCE(made_to_order_snapshot,-1)=? AND promo_discount_paisa=? AND current_promo_discount_paisa=?)',
        [i.id, i.status, i.amount, i.custom ?? -1, i.promo, i.currentPromo],
      ),
    );
  for (const parcel of p.parcels) {
    statements.push(
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE shipping_job_id=? AND version=? AND collected_paisa=? AND j.status=?)',
        [parcel.id, parcel.version, parcel.collected, parcel.status],
      ),
    );
    const amount =
      p.next.parcels.find((r) => r.sellerId === parcel.sellerId)?.amount ?? 0;
    statements.push(
      db
        .prepare(
          'UPDATE shipping_parcels SET cod_due_paisa=?,version=version+1,operation_request_id=? WHERE shipping_job_id=?',
        )
        .bind(p.order.paymentMode==='cod'?Math.max(amount,parcel.collected):parcel.collected, o.requestId, parcel.id),
    );
    if (p.selected.includes(parcel.sellerId))
      statements.push(
        db
          .prepare(
            "UPDATE shipping_jobs SET status='cancelled',updated_at=? WHERE id=?",
          )
          .bind(o.now, parcel.id),
      );
  }
  statements.push(
    ...guard(
      db,
      "NOT EXISTS(SELECT 1 FROM refunds WHERE order_id=? AND status<>'rejected') AND NOT EXISTS(SELECT 1 FROM rider_reports r JOIN shipping_jobs j ON j.id=r.shipping_job_id WHERE j.order_id=? AND r.status='pending')",
      [p.order.id, p.order.id],
    ),
  );
  for (const sellerId of p.selected)
    statements.push(
      ...guard(
        db,
        "NOT EXISTS(SELECT 1 FROM shipping_jobs WHERE order_id=? AND seller_id=? AND direction='outbound' AND status NOT IN ('pickup_requested','label_pending','label_ready','pickup_scheduled','cancelled'))",
        [p.order.id, sellerId],
      ),
      db
        .prepare(
          "UPDATE shipping_jobs SET status='cancelled',updated_at=? WHERE order_id=? AND seller_id=? AND direction='outbound'",
        )
        .bind(o.now, p.order.id, sellerId),
    );
  statements.push(...await prepareOrderStockSettlement(db,{orderId:p.order.id,itemIds:p.items.filter(i=>p.selected.includes(i.sellerId)).map(i=>i.id),action:'release',actorId,requestId:o.requestId,reason:o.note}));
  for (const i of p.items.filter((i) => p.selected.includes(i.sellerId))) {
    statements.push(
      db
        .prepare(
          "INSERT INTO order_item_status_events(id,order_item_id,from_status,to_status,note,actor_id,request_id,created_at) VALUES (?,?,?,'cancelled',?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          i.id,
          i.status,
          o.note,
          actorId,
          o.requestId + ':' + i.id,
          o.now,
        ),
      db
        .prepare(
          "UPDATE order_items SET fulfillment_status='cancelled',current_promo_discount_paisa=0,fulfillment_request_id=? WHERE id=?",
        )
        .bind(o.requestId, i.id),
    );
  }
  if (p.walletRestored) {
    if (!p.order.customerId)
      throw new CancellationConflictError(
        'Wallet ownership requires staff review.',
      );
    statements.push(
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM wallet_accounts WHERE user_id=? AND balance_paisa<=?)',
        [p.order.customerId, Number.MAX_SAFE_INTEGER - p.walletRestored],
      ),
      db
        .prepare(
          "INSERT INTO wallet_entries(id,user_id,order_id,kind,amount_paisa,platform_amount_paisa,created_at) VALUES (?,?,?,'cancellation',?,?,?)",
        )
        .bind(
          'partial:' + o.requestId,
          p.order.customerId,
          p.order.id,
          p.walletRestored,
          -p.walletRestored,
          o.now,
        ),
    );
  }
  const remaining = p.items.filter(
    (i) => !p.selected.includes(i.sellerId) && i.status !== 'cancelled',
  );
  const status = !remaining.length
    ? 'cancelled'
    : remaining.every((i) => i.status === 'delivered')
      ? 'delivered'
      : remaining.some((i) => ['delivered', 'dispatched'].includes(i.status))
        ? 'dispatched'
        : remaining.every((i) => i.status === 'ready_for_pickup')
          ? 'ready_for_pickup'
          : remaining.some((i) => i.status !== 'confirmed')
            ? 'packing'
            : 'confirmed';
  // MariaDB rejects a trigger updating a table read by its invoking statement.
  // Cancellation closes shipping jobs through the existing order trigger, so
  // only read those jobs when the resulting order actually becomes delivered.
  const deliveredAtUpdate = status === 'delivered'
    ? "CASE WHEN EXISTS(SELECT 1 FROM order_items WHERE order_id=orders.id AND fulfillment_status='delivered') AND NOT EXISTS(SELECT 1 FROM order_items WHERE order_id=orders.id AND fulfillment_status NOT IN ('delivered','cancelled')) THEN COALESCE(delivered_at,(SELECT MAX(p.delivered_at) FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=orders.id AND j.status='delivered'),?) ELSE delivered_at END"
    : 'delivered_at';
  statements.push(
    db
      .prepare(
        `INSERT INTO order_cancellation_events(id,order_id,actor_id,version,seller_ids_json,original_allocations_json,previous_json,next_json,note,wallet_restored_paisa,discount_removed_paisa,item_removed_paisa,created_at${cause ? ',cause' : ''}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?${cause ? ',?' : ''})`,
      )
      .bind(
        o.requestId,
        p.order.id,
        actorId,
        p.order.version + 1,
        JSON.stringify(p.selected),
        JSON.stringify(p.allocations),
        JSON.stringify(p.previous),
        JSON.stringify(p.next),
        o.note,
        p.walletRestored,
        p.discountRemoved,
        p.previous.subtotal - p.next.subtotal,
        o.now,
        ...(cause ? [cause] : []),
      ),
    db
      .prepare(
        `UPDATE orders SET status=?,current_total_paisa=?,current_subtotal_paisa=?,current_delivery_paisa=?,current_wallet_paisa=?,current_discount_paisa=?,current_promo_discount_paisa=?,delivered_at=${deliveredAtUpdate},payment_status=CASE WHEN EXISTS(SELECT 1 FROM manual_payment_windows w WHERE w.order_id=orders.id) OR payment_status IN('paid','captured','part_refunded','refunded') THEN payment_status WHEN ?='cancelled' THEN 'cancelled' ELSE 'pending' END,cancelled_at=CASE WHEN ?='cancelled' THEN ? ELSE cancelled_at END,updated_at=? WHERE id=?`,
      )
      .bind(
        status,
        p.next.total-(p.next.platformServiceFeePaisa??0),
        p.next.subtotal,
        p.next.delivery,
        p.next.wallet,
        p.next.discount,
        p.next.promoDiscount,
        ...(status === 'delivered' ? [o.now] : []),
        status,
        status,
        o.now,
        o.now,
        p.order.id,
      ),
    db
      .prepare(
        "UPDATE payments SET status=CASE WHEN ?='cancelled' THEN 'cancelled' ELSE 'pending' END,amount_paisa=?,updated_at=? WHERE order_id=? AND provider<>'manual_bank' AND status NOT IN('captured','paid','refunded')",
      )
      .bind(status, p.next.total, o.now, p.order.id),
    db
      .prepare('UPDATE shipments SET status=?,updated_at=? WHERE order_id=?')
      .bind(status, o.now, p.order.id),
    db
      .prepare(
        'INSERT INTO order_status_events(id,order_id,from_status,to_status,note,actor_id,request_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .bind(
        crypto.randomUUID(),
        p.order.id,
        p.order.status,
        status,
        o.note,
        actorId,
        o.requestId,
        o.now,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at) VALUES (?,?,'"+(o.parcelContext?'order.cancellation_accounting':'order.parcel_cancelled')+"','order',?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        p.order.id,
        o.note,
        JSON.stringify(p.previous),
        JSON.stringify(cause ? { ...p.next, cause, causeInput } : p.next),
        o.requestId,
        o.now,
      ),
  );
  if (status === 'delivered') {
    // Removing the last pending seller may complete an already collected order.
    // Capture from remaining parcel cash in the same guarded transaction; do
    // not require another collection/remittance event to discover completion.
    statements.push(
      db.prepare(`UPDATE orders SET payment_status='paid' WHERE id=? AND status='delivered'
        AND EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=orders.id)
        AND NOT EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id
          WHERE j.order_id=orders.id AND p.collected_paisa<>p.cod_due_paisa)`).bind(p.order.id),
      db.prepare(`UPDATE payments SET status='captured',updated_at=? WHERE order_id=?
        AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='delivered' AND payment_status='paid')`)
        .bind(o.now, p.order.id, p.order.id),
    );
    const document = await db.prepare("SELECT snapshot_json AS snapshot FROM order_documents WHERE order_id=? AND kind='order_statement' LIMIT 1")
      .bind(p.order.id).first<{ snapshot: string }>();
    if (document) {
      const original = JSON.parse(document.snapshot) as OrderDocumentSnapshot;
      const remainingIds = new Set(remaining.map(item => item.id));
      const rows = (await db.prepare(`SELECT id AS orderItemId,product_name_snapshot AS productName,
        seller_name_snapshot AS sellerName,sku_snapshot AS sku,unit_price_paisa AS unitPricePaisa,
        quantity,line_total_paisa AS lineTotalPaisa FROM order_items WHERE order_id=? ORDER BY id`)
        .bind(p.order.id).all<OrderDocumentSnapshot['items'][number]>()).results.filter(item => remainingIds.has(item.orderItemId!));
      const snapshot = withReceiptGroups({ ...original, documentTitle: 'Cash on delivery payment receipt',
        paymentStatus: 'paid', issuedAt: o.now,
        items: original.billing?.version === APPROVED_BILLING_VERSION ? mergeRecordedReceiptItems(original.items, rows) : rows,
        itemSubtotalPaisa: p.next.subtotal, deliveryChargePaisa: p.next.delivery,
        buyerPlatformFeePaisa: p.next.platformServiceFeePaisa ?? 0, grandTotalPaisa: p.next.total,
        walletCreditPaisa: p.next.wallet, referralDiscountPaisa: p.next.discount - p.next.promoDiscount,
        promoDiscountPaisa: p.next.promoDiscount, currentPromoDiscountPaisa: p.next.promoDiscount,
        originalPromoDiscountPaisa: p.order.promo,
      });
      const receiptRequestId = o.requestId + ':payment-receipt';
      statements.push(
        db.prepare(`INSERT OR IGNORE INTO order_documents(id,order_id,kind,document_number,snapshot_json,status,request_id,issued_at)
          SELECT ?,id,'payment_receipt',?,?,'issued',?,? FROM orders WHERE id=? AND status='delivered' AND payment_status='paid'
          AND NOT EXISTS(SELECT 1 FROM order_documents d WHERE d.order_id=orders.id AND d.kind='payment_receipt')`)
          .bind(crypto.randomUUID(), 'RCPT-PARCEL-' + p.order.id, JSON.stringify(snapshot), receiptRequestId, o.now, p.order.id),
        ...await receiptNumberStatements(db, { snapshot, requestId: receiptRequestId, now: o.now }),
      );
    }
    statements.push(...buildEarningsAccrualStatements(db, { orderId: p.order.id, now: o.now }));
  }
  statements.push(
    ...(await cancellationNotifications(
      db,
      p.order.id,
      o.requestId,
      false,
      o.now,
      o.reviewId?{reviewId:o.reviewId,status:'approved'}:undefined,
    )),
  );
  for (const parcel of p.parcels.filter(
    (r) => !p.selected.includes(r.sellerId),
  )) {
    const row = await db
      .prepare(
        'SELECT rider_user_id AS id FROM shipping_parcels WHERE shipping_job_id=?',
      )
      .bind(parcel.id)
      .first<{ id: string | null }>();
    if (row?.id)
      statements.push(
        ...(await riderNotifications(
          db,
          o.requestId + ':' + parcel.id,
          'rider_assignment',
          parcel.id,
          row.id,
          null,
          o.now,
          'Parcel COD changed: refresh before collection',
        )),
      );
  }
  if (o.parcelContext && a.actorId)
    statements.push(
      db
        .prepare(
          "INSERT INTO parcel_operation_events(id,order_id,shipping_job_id,actor_id,action,payload_json,note,created_at) VALUES (?,?,?,?,'cancel',?,?,?)",
        )
        .bind(
          o.requestId,
          p.order.id,
          o.parcelContext.jobId,
          a.actorId,
          o.parcelContext.payload,
          o.note,
          o.now,
        ),
      db
        .prepare(
          "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at) VALUES (?,?,'parcel.cancel','order',?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          a.actorId,
          p.order.id,
          o.note,
          o.requestId + ':audit',
          o.now,
        ),
    );
  if(parcelForm) statements.push(buildFormAnswerInsert(db,{formId:'staff.parcel-control',requestId:o.requestId,
    versionId:parcelForm.versionId,subjectType:'shipping_job',subjectId:o.parcelContext!.jobId,
    actorId:a.actorId!,answers:parcelForm.answers,now:o.now}));
  if (form) statements.push(catalogAudit(), buildFormAnswerInsert(db, {
    formId: form.formId, requestId: o.requestId, versionId: form.versionId,
    subjectType: 'order_cancellation_event', subjectId: o.requestId,
    actorId, answers: form.answers, now: o.now }));
  if (usesSellerShipmentDelivery(p.order.deliverySnapshot)) {
    statements.push(...prepareCancellationDeliveryUnitClaims(db, {
      eventId: o.requestId, orderId: p.order.id, sellerIds: p.selected,
      removedDeliveryPaisa: p.previous.delivery - p.next.delivery, now: o.now,
    }));
  } else {
    statements.push(...prepareCancelledDeliveryAllocations(db,{eventId:o.requestId,orderId:p.order.id,total:p.next.delivery,now:o.now},remaining));
  }
  statements.push(...await prepareCancellationTender(db,{eventId:o.requestId,orderId:p.order.id,customerId:p.order.customerId,actorId:a.actorId??null,payablePaisa:p.next.total,walletRestoredPaisa:p.walletRestored,selectedSellerIds:p.selected,retainedParcels:p.next.parcels,now:o.now}));
  statements.push(...await prepareCancelledManualPayment(db,{orderId:p.order.id,requestId:o.requestId,actorId:authority?.role==='super_admin'?actorId:null,now:o.now}),...privateParcelGuard());
  if (authority) statements.push(...authority.statements);
  try {
    await db.batch([...statements,...(o.originalProof?.statements??[])]);
  } catch {
    throw new CancellationConflictError(
      'The order changed. Refresh the cancellation review before trying again.',
    );
  }
  if (status === 'delivered')
    await finishCancellationSettlement(db, p.order.id, actorId, o.requestId, o.now,o.staffAuthSubject);
  return { status: 'cancelled', id: o.requestId };
}
export async function rejectCancellationReview(
  db: D1Database,
  o: { id: string; actorId: string; note: string; fingerprint?: string; now: number;
    form?: CancellationForm; originalProof?:AtomicActionProof },
) {
  if (o.note.trim().length < 8 || o.note.length > 300)
    throw new CancellationConflictError(
      'Record a decision reason of 8–300 characters.',
    );
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'order.manage',
    CancellationConflictError,
  );
  const requestId = `review-reject:${o.id}`;
  if (o.form && (o.form.formId !== 'staff.cancellation-review' ||
    o.form.requestId !== requestId || o.form.answers.formId !== o.form.formId))
    throw new CancellationConflictError('Configured rejection request does not match its review.');
  const row = await db
    .prepare(
      'SELECT order_id AS orderId,status,reviewed_by AS reviewedBy,review_note AS reviewNote FROM order_cancellation_reviews WHERE id=?',
    )
    .bind(o.id)
    .first<{ orderId: string; status: string; reviewedBy: string | null; reviewNote: string | null }>();
  if (!row) throw new CancellationConflictError('Review is no longer pending.');
  authority.statements.push(...await independentCancellationReviewer(db,o.actorId,row.orderId));
  const formDigest = o.form ? await digestFormRequest({ formId: o.form.formId,
    action: 'reject', reviewId: o.id, orderId: row.orderId, actorId: o.actorId,
    note: o.note.trim(), fingerprint: o.fingerprint ?? null,
    versionId: o.form.versionId, answers: o.form.answers }) : null;
  if (row.status === 'rejected' && o.form) {
    if(o.originalProof)throw new CancellationConflictError('Original authenticated action proof is unavailable; keep this attempt unconfirmed.');
    const audit = await db.prepare(`SELECT actor_id AS actorId,subject_id AS subjectId,
      next_json AS nextJson FROM audit_logs WHERE request_id=?
      AND action='cancellation.review_rejected' AND subject_type='order' LIMIT 1`)
      .bind(requestId).first<{ actorId: string; subjectId: string; nextJson: string | null }>();
    const answer = await db.prepare(`SELECT config_version_id AS versionId,subject_type AS subjectType,
      subject_id AS subjectId,actor_id AS actorId FROM ${formAnswerSourceSql(db)} original_answers
      WHERE form_id='staff.cancellation-review' AND request_id=? LIMIT 1`)
      .bind(requestId).first<{ versionId: string; subjectType: string;
        subjectId: string; actorId: string }>();
    let savedDigest: unknown;
    try { savedDigest = JSON.parse(audit?.nextJson ?? '').catalogDigest; } catch { /* conflict below */ }
    if (row.reviewedBy !== o.actorId || row.reviewNote !== o.note ||
      audit?.actorId !== o.actorId || audit?.subjectId !== row.orderId ||
      savedDigest !== formDigest || answer?.versionId !== o.form.versionId ||
      answer?.subjectType !== 'order_cancellation_review' || answer?.subjectId !== o.id ||
      answer?.actorId !== o.actorId)
      throw new CancellationConflictError('Request reference already used.');
    return;
  }
  if (row.status !== 'pending') throw new CancellationConflictError('Review is no longer pending.');
  await db.batch([
    db
      .prepare('UPDATE orders SET updated_at=updated_at WHERE id=?')
      .bind(row.orderId),
    ...guard(
      db,
      "EXISTS(SELECT 1 FROM order_cancellation_reviews WHERE id=? AND status='pending')",
      [o.id],
    ),
    db
      .prepare(
        "UPDATE order_cancellation_reviews SET status='rejected',reviewed_by=?,review_note=?,reviewed_at=?,revision=revision+1,first_action_at=COALESCE(first_action_at,?) WHERE id=? AND status='pending'",
      )
      .bind(o.actorId, o.note, o.now,o.now, o.id),
    ...guard(db, "EXISTS(SELECT 1 FROM order_cancellation_reviews WHERE id=? AND status='rejected' AND reviewed_by=? AND reviewed_at=?)",
      [o.id, o.actorId, o.now]),
    db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES (?,?,'cancellation.review_rejected','order',?,?,?,?,?)",
      )
      .bind(crypto.randomUUID(), o.actorId, row.orderId, o.note,
        o.form ? JSON.stringify({ catalogDigest: formDigest }) : null,
        o.form ? requestId : null, o.now),
    ...(o.form ? [buildFormAnswerInsert(db, { formId: o.form.formId,
      requestId, versionId: o.form.versionId, subjectType: 'order_cancellation_review',
      subjectId: o.id, actorId: o.actorId, answers: o.form.answers, now: o.now })] : []),
    ...(await cancellationNotifications(
      db,
      row.orderId,
      o.id + ':rejected',
      false,
      o.now,
      {reviewId:o.id,status:'rejected'},
    )),
    ...prepareOrderResponseRelease(db,row.orderId),...await prepareInitialResponseNotices(db,row.orderId),
    ...authority.statements,...(o.originalProof?.statements??[]),
  ]);
}
export async function currentReceiptSnapshot(
  db: D1Database,
  orderId: string,
  original: Record<string, unknown>,
) {
  const order = await db
    .prepare(
      `SELECT ${currentPlatformServiceFeeSql()} AS serviceFee,cancellation_version AS version,${payableOrderTotalSql()} AS total,current_subtotal_paisa AS subtotal,current_delivery_paisa AS delivery,current_wallet_paisa AS wallet,current_referral_discount_paisa AS discount,current_promo_discount_paisa AS promo,promo_discount_paisa AS originalPromo,refunded_promo_discount_paisa AS refundedPromo FROM orders WHERE id=?`,
    )
    .bind(orderId)
    .first<{
      version: number;
      serviceFee: number;
      total: number;
      subtotal: number;
      delivery: number;
      wallet: number;
      discount: number;
      promo: number;
      originalPromo: number;
      refundedPromo: number;
    }>();
  if (!order || (!order.version && !order.refundedPromo)) return original;
  const items = (
    await db
      .prepare(
        "SELECT id AS orderItemId,product_name_snapshot AS productName,seller_name_snapshot AS sellerName,sku_snapshot AS sku,unit_price_paisa AS unitPricePaisa,quantity,line_total_paisa AS lineTotalPaisa FROM order_items WHERE order_id=? AND fulfillment_status<>'cancelled' ORDER BY id",
      )
      .bind(orderId)
      .all<OrderDocumentSnapshot['items'][number]>()
  ).results;
  return {
    ...original,
    items:(original.billing as {version?:string}|undefined)?.version===APPROVED_BILLING_VERSION && Array.isArray(original.items)
      ? mergeRecordedReceiptItems(original.items,items) : items,
    itemSubtotalPaisa: order.subtotal,
    deliveryChargePaisa: order.delivery,
    grandTotalPaisa: order.total,
    buyerPlatformFeePaisa: order.serviceFee,
    walletCreditPaisa: order.wallet,
    referralDiscountPaisa: order.discount,
    promoDiscountPaisa: order.promo,
    currentPromoDiscountPaisa: order.promo,
    originalPromoDiscountPaisa: order.originalPromo,
    refundedPromoDiscountPaisa: order.refundedPromo,
    cancellationVersion: order.version,
  };
}
