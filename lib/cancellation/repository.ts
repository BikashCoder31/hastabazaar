import { cancellationNotifications } from './notifications';
import { riderNotifications } from '../riders/repository';
import { createHash } from 'node:crypto';
import { allocateCancellationItems, calculateCancellation } from './accounting';
import {DELIVERY_PRICING_POLICY,readDeliveryPricingSnapshot} from '../checkout/delivery-rates';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { buildFormAnswerInsert } from '../db/repositories/form-answers';
import { digestFormRequest } from '../forms/submission';
import type { FormAnswerSnapshot } from '../forms/types';
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
  wallet: number;
  discount: number;
  total: number;
  version: number;
  currentTotal: number;
  paymentMode: string;
  deliverySnapshot: string | null;
}
interface Item {
  id: string;
  sellerId: string;
  sellerName: string;
  productId: string | null;
  quantity: number;
  amount: number;
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
      'SELECT id,status,customer_id AS customerId,item_subtotal_paisa AS subtotal,delivery_charge_paisa AS delivery,wallet_credit_paisa AS wallet,referral_discount_paisa AS discount,grand_total_paisa AS total,cancellation_version AS version,COALESCE(current_total_paisa,grand_total_paisa) AS currentTotal,payment_mode AS paymentMode,delivery_rate_snapshot_json AS deliverySnapshot FROM orders WHERE order_number=? AND (? IS NOT NULL OR (? IS NOT NULL AND customer_id=?) OR (? IS NOT NULL AND receipt_token_hash=?))',
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
        'SELECT id,seller_id AS sellerId,seller_name_snapshot AS sellerName,product_id AS productId,quantity,line_total_paisa AS amount,fulfillment_status AS status,made_to_order_snapshot AS custom FROM order_items WHERE order_id=? ORDER BY id',
      )
      .bind(order.id)
      .all<Item>()
  ).results;
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
function deliveryRule(order:Order,items:readonly Item[]){
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
      'confirmed',
      'packing',
      'ready_for_pickup',
      'dispatched',
      'delivered',
    ].includes(order.status)
  )
    throw new CancellationConflictError('This order is closed.');
  const target = items.filter((i) => selected.includes(i.sellerId));
  if (target.some((i) => !['confirmed', 'packing'].includes(i.status)))
    throw new CancellationConflictError(
      'Cancellation closes when the selected seller parcel is ready for pickup.',
    );
  if (
    parcels.some(
      (p) =>
        selected.includes(p.sellerId) &&
        (p.collected > 0 ||
          ![
            'pickup_requested',
            'label_pending',
            'label_ready',
            'pickup_scheduled',
          ].includes(p.status)),
    )
  )
    throw new CancellationConflictError(
      'This parcel needs staff review of its delivery or collected cash.',
    );
  if (order.paymentMode !== 'cod')
    throw new CancellationConflictError(
      'Staff must review prepaid cancellation and any refund.',
    );
  if (
    BigInt(order.total) !==
    BigInt(order.subtotal) +
      BigInt(order.delivery) -
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
  if (financial)
    throw new CancellationConflictError(
      'Staff must finish the existing refund or rider-report review before changing COD.',
    );
  const allocations = allocateCancellationItems(
    items.map((i) => ({ id: i.id, sellerId: i.sellerId, amount: i.amount })),
    order.wallet,
    order.discount,
  );
  const pricing=deliveryRule(order,items);
  const previousCancelled = new Set(
    items.filter((i) => i.status === 'cancelled').map((i) => i.sellerId),
  );
  const previous = calculateCancellation(
    allocations,
    previousCancelled,
    pricing,
  );
  selected.forEach((id) => previousCancelled.add(id));
  const next = calculateCancellation(
    allocations,
    previousCancelled,
    pricing,
  );
  if (
    parcels.some(
      (p) =>
        p.collected >
        (next.parcels.find((r) => r.sellerId === p.sellerId)?.amount ?? 0),
    )
  )
    throw new CancellationConflictError(
      'Collected cash requires staff reconciliation before cancellation.',
    );
  const reviewRequired = target.some(
    (i) => i.status === 'packing' && i.custom !== 0,
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ order, items, parcels, selected, next }))
    .digest('hex');
  return {
    ...s,
    selected,
    allocations,
    previous,
    next,
    reviewRequired,
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
  const { items } = await source(db, a);
  const groups = [
    ...new Set(
      items.filter((i) => i.status !== 'cancelled').map((i) => i.sellerId),
    ),
  ];
  return groups.map((id) => ({
    id,
    name: items.find((i) => i.sellerId === id)!.sellerName,
    eligible: items
      .filter((i) => i.sellerId === id)
      .every((i) => ['confirmed', 'packing'].includes(i.status)),
    reviewRequired: items.some(
      (i) => i.sellerId === id && i.status === 'packing' && i.custom !== 0,
    ),
  }));
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
    form?: CancellationForm;
    parcelContext?: { jobId: string; payload: string;
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
  if(parcelForm && (!a.actorId || parcelForm.requestId!==o.requestId))
    throw new CancellationConflictError('Configured parcel cancellation requires its staff request.');
  const form = o.form;
  if (form && (parcelForm || form.requestId !== o.requestId ||
    form.answers.formId !== form.formId ||
    (form.formId === 'commerce.order-cancellation' && (a.actorId || o.reviewId)) ||
    (form.formId === 'staff.cancellation-review' && (!a.actorId || !o.reviewId ||
      o.requestId !== `review:${o.reviewId}`)) ||
    (form.formId === 'staff.order-fulfillment' && (!a.actorId || o.reviewId || o.parcelContext))))
    throw new CancellationConflictError('Configured cancellation request does not match its action.');
  const authorizedSource = await source(db, a);
  const actorId = a.actorId ?? (authorizedSource.order.customerId === a.customerId ? a.customerId : null) ?? null;
  const selectedIds = [...new Set(o.sellerIds)].sort();
  const formAction = o.reviewId ? 'approve' : 'confirm';
  const formDigest = form ? await digestFormRequest({ formId: form.formId,
    action: formAction, orderId: authorizedSource.order.id, actorId, selectedIds,
    note: o.note.trim(), fingerprint: o.fingerprint, reviewId: o.reviewId ?? null,
    versionId: form.versionId, answers: form.answers }) : null;
  const catalogAuditId = `${o.requestId}:catalog`;
  const catalogAudit = () => db.prepare(`INSERT INTO audit_logs
    (id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
    VALUES (?,?,'cancellation.form_submitted','order',?,?,?,?,?)`)
    .bind(crypto.randomUUID(), actorId, authorizedSource.order.id, o.note,
      JSON.stringify({ catalogDigest: formDigest, formId: form?.formId,
        action: formAction, fingerprint: o.fingerprint }),
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
      FROM form_answer_sets WHERE request_id=? AND form_id=? LIMIT 1`)
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
    await assertFormReplay('order_cancellation_event');
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
      if(audit?.nextJson!==JSON.stringify({jobId:o.parcelContext?.jobId,payload:o.parcelContext?.payload}))
        throw new CancellationConflictError('Request reference already used.');
    }
    await assertFormReplay('order_cancellation_review');
    return { status: 'review_requested', id: o.requestId };
  }
  const p = await cancellationPreview(db, a, o.sellerIds);
  if (p.fingerprint !== o.fingerprint)
    throw new CancellationConflictError(
      'Order amounts or readiness changed. Review the updated cancellation before confirming.',
    );
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
      ...(!a.actorId ? guard(db,
        'EXISTS(SELECT 1 FROM orders WHERE id=? AND ((? IS NOT NULL AND customer_id=?) OR (? IS NOT NULL AND receipt_token_hash=?)))',
        [p.order.id, a.customerId ?? null, a.customerId ?? null,
          a.receiptTokenHash ?? null, a.receiptTokenHash ?? null]) : []),
      ...p.items
        .filter((i) => p.selected.includes(i.sellerId))
        .flatMap((i) =>
          guard(
            db,
            'EXISTS(SELECT 1 FROM order_items WHERE id=? AND fulfillment_status=?)',
            [i.id, i.status],
          ),
        ),
      db
        .prepare('UPDATE orders SET updated_at=updated_at WHERE id=?')
        .bind(p.order.id),
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM orders WHERE id=? AND cancellation_version=?)',
        [p.order.id, p.order.version],
      ),
      ...guard(
        db,
        "NOT EXISTS(SELECT 1 FROM order_cancellation_reviews WHERE order_id=? AND status='pending')",
        [p.order.id],
      ),
      db
        .prepare(
          'INSERT INTO order_cancellation_reviews(id,order_id,seller_ids_json,note,requested_by,created_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          id,
          p.order.id,
          JSON.stringify(p.selected),
          o.note.trim(),
          actorId,
          o.now,
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
          parcelForm?JSON.stringify({jobId:o.parcelContext?.jobId,payload:o.parcelContext?.payload}):null,
          parcelForm?o.requestId+':parcel-form':null,
          o.now,
        ),
      ...(parcelForm?[buildFormAnswerInsert(db,{formId:'staff.parcel-control',requestId:o.requestId,
        versionId:parcelForm.versionId,subjectType:'shipping_job',subjectId:o.parcelContext!.jobId,
        actorId:a.actorId!,answers:parcelForm.answers,now:o.now})]:[]),
      ...(form ? [catalogAudit(), buildFormAnswerInsert(db, { formId: form.formId,
        requestId: o.requestId, versionId: form.versionId,
        subjectType: 'order_cancellation_review', subjectId: o.requestId,
        actorId, answers: form.answers, now: o.now })] : []),
      ...(await cancellationNotifications(db, p.order.id, id, true, o.now)),
    ]);
    return { status: 'review_requested', id };
  }
  const authority = a.actorId
    ? await staffMutationGuard(
        db,
        a.actorId,
        'order.manage',
        CancellationConflictError,
      )
    : null;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        'UPDATE orders SET cancellation_version=cancellation_version+1,operation_request_id=? WHERE id=? AND cancellation_version=?',
      )
      .bind(o.requestId, p.order.id, p.order.version),
    ...guard(
      db,
      'EXISTS(SELECT 1 FROM orders WHERE id=? AND cancellation_version=? AND operation_request_id=?)',
      [p.order.id, p.order.version + 1, o.requestId],
    ),
  ];
  statements.push(
    ...guard(
      db,
      'EXISTS(SELECT 1 FROM orders WHERE id=? AND status=? AND grand_total_paisa=? AND wallet_credit_paisa=? AND referral_discount_paisa=?)',
      [
        p.order.id,
        p.order.status,
        p.order.total,
        p.order.wallet,
        p.order.discount,
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
          "UPDATE order_cancellation_reviews SET status='approved',reviewed_by=?,review_note=?,reviewed_at=? WHERE id=?",
        )
        .bind(a.actorId, o.note, o.now, o.reviewId),
      ...guard(db, "EXISTS(SELECT 1 FROM order_cancellation_reviews WHERE id=? AND status='approved' AND reviewed_by=? AND reviewed_at=?)",
        [o.reviewId, a.actorId, o.now]),
    );
  }
  for (const i of p.items)
    statements.push(
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM order_items WHERE id=? AND fulfillment_status=? AND line_total_paisa=? AND COALESCE(made_to_order_snapshot,-1)=?)',
        [i.id, i.status, i.amount, i.custom ?? -1],
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
        .bind(amount, o.requestId, parcel.id),
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
  for (const i of p.items.filter((i) => p.selected.includes(i.sellerId))) {
    if (i.productId)
      statements.push(
        db
          .prepare(
            'UPDATE products SET inventory_quantity=inventory_quantity+?,updated_at=? WHERE id=?',
          )
          .bind(i.quantity, o.now, i.productId),
      );
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
          "UPDATE order_items SET fulfillment_status='cancelled',fulfillment_request_id=? WHERE id=?",
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
  statements.push(
    db
      .prepare(
        'INSERT INTO order_cancellation_events(id,order_id,actor_id,version,seller_ids_json,original_allocations_json,previous_json,next_json,note,wallet_restored_paisa,discount_removed_paisa,item_removed_paisa,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
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
      ),
    db
      .prepare(
        "UPDATE orders SET status=?,current_total_paisa=?,current_subtotal_paisa=?,current_delivery_paisa=?,current_wallet_paisa=?,current_discount_paisa=?,payment_status=CASE WHEN ?='cancelled' THEN 'cancelled' ELSE 'pending' END,cancelled_at=CASE WHEN ?='cancelled' THEN ? ELSE cancelled_at END,updated_at=? WHERE id=?",
      )
      .bind(
        status,
        p.next.total,
        p.next.subtotal,
        p.next.delivery,
        p.next.wallet,
        p.next.discount,
        status,
        status,
        o.now,
        o.now,
        p.order.id,
      ),
    db
      .prepare(
        "UPDATE payments SET status=CASE WHEN ?='cancelled' THEN 'cancelled' ELSE 'pending' END,amount_paisa=?,updated_at=? WHERE order_id=?",
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
        JSON.stringify(p.next),
        o.requestId,
        o.now,
      ),
  );
  statements.push(
    ...(await cancellationNotifications(
      db,
      p.order.id,
      o.requestId,
      false,
      o.now,
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
  if (authority) statements.push(...authority.statements);
  try {
    await db.batch(statements);
  } catch {
    throw new CancellationConflictError(
      'The order changed. Refresh the cancellation review before trying again.',
    );
  }
  return { status: 'cancelled', id: o.requestId };
}
export async function rejectCancellationReview(
  db: D1Database,
  o: { id: string; actorId: string; note: string; fingerprint?: string; now: number;
    form?: CancellationForm },
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
  const formDigest = o.form ? await digestFormRequest({ formId: o.form.formId,
    action: 'reject', reviewId: o.id, orderId: row.orderId, actorId: o.actorId,
    note: o.note.trim(), fingerprint: o.fingerprint ?? null,
    versionId: o.form.versionId, answers: o.form.answers }) : null;
  if (row.status === 'rejected' && o.form) {
    const audit = await db.prepare(`SELECT actor_id AS actorId,subject_id AS subjectId,
      next_json AS nextJson FROM audit_logs WHERE request_id=?
      AND action='cancellation.review_rejected' AND subject_type='order' LIMIT 1`)
      .bind(requestId).first<{ actorId: string; subjectId: string; nextJson: string | null }>();
    const answer = await db.prepare(`SELECT config_version_id AS versionId,subject_type AS subjectType,
      subject_id AS subjectId,actor_id AS actorId FROM form_answer_sets
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
        "UPDATE order_cancellation_reviews SET status='rejected',reviewed_by=?,review_note=?,reviewed_at=? WHERE id=? AND status='pending'",
      )
      .bind(o.actorId, o.note, o.now, o.id),
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
    )),
    ...authority.statements,
  ]);
}
export async function currentReceiptSnapshot(
  db: D1Database,
  orderId: string,
  original: Record<string, unknown>,
) {
  const order = await db
    .prepare(
      'SELECT cancellation_version AS version,current_total_paisa AS total,current_subtotal_paisa AS subtotal,current_delivery_paisa AS delivery,current_wallet_paisa AS wallet,current_discount_paisa AS discount FROM orders WHERE id=?',
    )
    .bind(orderId)
    .first<{
      version: number;
      total: number;
      subtotal: number;
      delivery: number;
      wallet: number;
      discount: number;
    }>();
  if (!order?.version) return original;
  const items = (
    await db
      .prepare(
        "SELECT product_name_snapshot AS productName,seller_name_snapshot AS sellerName,sku_snapshot AS sku,unit_price_paisa AS unitPricePaisa,quantity,line_total_paisa AS lineTotalPaisa FROM order_items WHERE order_id=? AND fulfillment_status<>'cancelled' ORDER BY id",
      )
      .bind(orderId)
      .all()
  ).results;
  return {
    ...original,
    items,
    itemSubtotalPaisa: order.subtotal,
    deliveryChargePaisa: order.delivery,
    grandTotalPaisa: order.total,
    walletCreditPaisa: order.wallet,
    referralDiscountPaisa: order.discount,
    cancellationVersion: order.version,
  };
}
