import { publicTrackingReferenceSql } from '../riders/public-tracking';
import {emailApplicationOrigin} from './origin';
import { payableOrderTotalSql } from '../db/repositories/platform-service-fee';
import { orderProgress } from '../orders/progress';
import { orderStatusMessages } from '../operations/message-event-catalog';
import { emailDate, emailMoney, marketplaceSubject, renderMarketplaceEmail, type EmailActor, type EmailFact } from './message-layout';
import { emailRetryDelayMs, maximumEmailAttempts } from './retry-policy';
import { accountedDeliveryAttemptsSql, deliverDurably, eligibleDeliverySql, fenceLegacyDeliveryGap, fenceLegacyDeliveryQueue, recordUnstartedDeliveryAttempt, recoverDeliveryReceipts, validMailRecipient, type DeliveryMailService } from './delivery-attempts';
import {
  manualOrderEmailBatchSize,
  orderEmailMaxAgeMs,
  orderEmailSkipReason,
} from './order-update-policy';
export interface OrderEmailData {
  firstCodPending?: boolean | number;
  orderId?: string;
  customerId?: string | null;
  paymentMode?: string;
  maskedPhone?: string | null;
  returnDays?: number;
  parcelFacts?: readonly EmailFact[];
  walletRestoredPaisa?: number;
  orderNumber: string;
  eventStatus: string;
  currentStatus: string;
  email: string;
  cashPaisa: number;
  collectedPaisa?: number;
  walletPaisa: number;
  discountPaisa: number;
  promoPaisa?: number;
  promoLabel?: string | null;
  promoRevision?: number | null;
  trackingCode: string | null;
  occurredAt: number;
  attempts?: number;
}
export type OrderMailService = DeliveryMailService;
const orderCopy: Record<string, { actor: EmailActor; headline?: string; paragraph?: string; subject?: string }> = {
  awaiting_cod_confirmation: {
    actor: 'Hastabazaar', headline: 'We’ll call you to confirm this order', subject: 'We will call to confirm',
    paragraph: 'Hastabazaar will call before the seller starts preparing your order.',
  },
  confirmed: { actor: 'Seller' },
  packing: { actor: 'Seller' },
  ready_for_pickup: { actor: 'Hastabazaar' },
  placed: { actor: 'Hastabazaar', subject: orderStatusMessages.placed.subject, headline: 'Thank you. Your order is placed.', paragraph: orderStatusMessages.placed.body },
  dispatched: { actor: 'Courier', subject: orderStatusMessages.dispatched.subject, headline: 'Your order is on the way', paragraph: 'The parcel has been handed to the courier.' },
  delivered: { actor: 'Done', subject: orderStatusMessages.delivered.subject, headline: 'Delivered. We hope you love it.' },
  cancelled: { actor: 'Done', headline: 'Your order was cancelled' },
};
const placedCopy = {
  actor: 'Seller' as const,
  headline: 'Thank you. Your order is placed.',
  paragraph: 'Sellers are preparing your items. Each seller sends their own parcel.',
  subject: orderStatusMessages.checkoutCod.subject,
};

function orderEmailCopy(data: Pick<OrderEmailData, 'firstCodPending' | 'eventStatus' | 'currentStatus' | 'paymentMode'>) {
  const status = data.firstCodPending && data.currentStatus !== 'cancelled' ? 'awaiting_cod_confirmation' : data.eventStatus;
  const cash = !data.paymentMode || data.paymentMode === 'cod';
  const copy = status === 'confirmed' && cash ? placedCopy : orderCopy[status] ?? { actor: 'Hastabazaar' as const };
  return { status, cash, copy };
}

export function orderEmailSubject(data: Pick<OrderEmailData, 'firstCodPending' | 'eventStatus' | 'currentStatus' | 'paymentMode' | 'orderNumber'>) {
  const { status, copy } = orderEmailCopy(data);
  return marketplaceSubject(copy.subject ?? orderProgress(status).label, data.orderNumber);
}

export function buildOrderEmail(data: OrderEmailData, origin: string, options: { transport?: 'provider' | 'capture' } = {}) {
  const base = emailApplicationOrigin(origin, options.transport);
  const trackingUrl = new URL('/track', base);
  trackingUrl.searchParams.set('order', data.orderNumber);
  const orderUrl = data.customerId ? new URL('/orders/' + encodeURIComponent(data.orderNumber), base) : trackingUrl;
  const { status, cash, copy } = orderEmailCopy(data);
  const progress = orderProgress(status);
  const facts: EmailFact[] = [
    ['Order', data.orderNumber],
    ['Recorded', emailDate(data.occurredAt, true)],
  ];
  if (data.currentStatus !== data.eventStatus) facts.push(['Latest order status', orderProgress(data.currentStatus).label]);
  if (data.currentStatus === 'cancelled') {
    facts.push([cash ? 'Cash due' : 'Payment due', emailMoney(0)]);
    if (data.walletRestoredPaisa != null && data.walletRestoredPaisa > 0) {
      facts.push(['Shopping credit restored', emailMoney(data.walletRestoredPaisa)]);
    }
  } else if (!cash) {
    facts.push(...(data.parcelFacts ?? []), ['Order total', emailMoney(data.cashPaisa)]);
  } else {
    facts.push(...(data.parcelFacts ?? []));
    if (data.collectedPaisa != null) {
      facts.push(
        ['Cash collection recorded', emailMoney(data.collectedPaisa)],
        ['Remaining cash awaiting confirmation', emailMoney(Math.max(0, data.cashPaisa - data.collectedPaisa))],
      );
    } else {
      facts.push([status === 'delivered' ? 'Cash amount on order' : data.parcelFacts?.length ? 'Total cash on delivery' : 'Cash to pay on delivery', emailMoney(data.cashPaisa)]);
    }
  }
  if (data.walletPaisa) facts.push(['Shopping credit applied', emailMoney(data.walletPaisa)]);
  if (data.discountPaisa) facts.push(['Referral discount', emailMoney(data.discountPaisa)]);
  if (data.promoPaisa) facts.push([
    'Promo savings' + (data.promoLabel ? ' (' + data.promoLabel + ', revision ' + data.promoRevision + ')' : ''),
    emailMoney(data.promoPaisa),
  ]);
  if (data.trackingCode) facts.push(['Delivery reference', data.trackingCode]);
  const rating = status === 'delivered' && data.customerId;
  const phone = status === 'awaiting_cod_confirmation' && data.maskedPhone;
  const help = status === 'delivered' && data.returnDays
    ? 'For eligible items, request a change-of-mind return within ' + data.returnDays + ' days of delivery. For other concerns, use Get help on the order.'
    : status === 'dispatched'
      ? 'Tracking updates when the courier records progress.'
      : data.customerId ? undefined : 'Use your checkout email to track your order.';
  const action = rating
    ? { label: 'Rate your items', url: new URL('/account/reviews/' + encodeURIComponent(data.orderNumber), base) }
    : ['delivered', 'cancelled', 'awaiting_cod_confirmation'].includes(status)
      ? { label: 'View your order', url: orderUrl, tone: 'navy' as const }
      : { label: status === 'dispatched' ? 'Track this parcel' : 'Track your order', url: orderUrl };
  return {
    to: data.email,
    subject: orderEmailSubject(data),
    ...renderMarketplaceEmail({
      actor: copy.actor,
      headline: copy.headline ?? progress.label,
      paragraph: phone ? 'Hastabazaar will call ' + phone + ' before the seller starts preparing your order.' : copy.paragraph ?? progress.detail,
      facts, action, help, why: 'You got this because you ordered on Hastabazaar.',
    }),
  };
}

type OrderEmailRow = OrderEmailData & { customerPhone?: string; returnSnapshot?: string };

async function orderEmailDetails(db: D1Database, data: OrderEmailRow) {
  if (!data.orderId) return;
  if (data.firstCodPending) {
    const digits = data.customerPhone?.replace(/\D/g, '');
    if (digits && digits.length > 4) data.maskedPhone = 'the phone number ending in ' + digits.slice(-4);
  }
  if (data.currentStatus === 'delivered' && data.returnSnapshot) {
    let policy: unknown;
    try { policy = JSON.parse(data.returnSnapshot); } catch { return; }
    if (policy && typeof policy === 'object' && 'generalRequestWindowDays' in policy &&
      'changeOfMindEnabled' in policy && policy.changeOfMindEnabled === true &&
      typeof policy.generalRequestWindowDays === 'number' && Number.isSafeInteger(policy.generalRequestWindowDays) &&
      policy.generalRequestWindowDays > 0) {
      data.returnDays = policy.generalRequestWindowDays;
    }
  }
  if (data.currentStatus === 'cancelled') {
    const amounts = await db.prepare('SELECT SUM(wallet_restored_paisa) AS wallet FROM order_cancellation_events WHERE order_id=?')
      .bind(data.orderId).first<{ wallet: number | null }>();
    if (amounts?.wallet != null) data.walletRestoredPaisa = Number(amounts.wallet);
  }
  if ((!data.firstCodPending && data.currentStatus === 'confirmed' && data.paymentMode === 'cod') ||
    data.currentStatus === 'dispatched') {
    const { readCustomerOrderParcels } = await import('../orders/customer-parcels');
    const parcels = (await readCustomerOrderParcels(db, [data.orderId], { withItems: false })).get(data.orderId) ?? [];
    const facts: EmailFact[] = [];
    for (const parcel of parcels) {
      if (data.currentStatus === 'confirmed' && parcel.codPaisa != null) {
        facts.push(['Parcel · ' + parcel.sellerName, emailMoney(parcel.codPaisa)]);
      } else if (parcel.status === 'dispatched' && parcel.courierName) {
        facts.push(['Courier · ' + parcel.sellerName, parcel.courierName]);
        if (parcel.trackingReference && parcel.trackingReference !== data.trackingCode) {
          facts.push(['Tracking · ' + parcel.sellerName, parcel.trackingReference]);
        }
      }
    }
    data.parcelFacts = facts;
  }
}

export async function deliverOrderEmails(
  db: D1Database,
  mail: OrderMailService,
  origin: string,
  options: {
    orderId?: string;
    orderNumber?: string;
    jobId?: string;
    limit?: number;
    now?: number;
    deadlineMs?: number;
  } = {},
) {
  const now = options.now ?? Date.now();
  await recoverDeliveryReceipts(db,'order');
  await fenceLegacyDeliveryQueue(db,'order',now);
  const limit = Math.max(
    1,
    Math.min(options.limit ?? manualOrderEmailBatchSize, 20),
  );
  // Retain the outcome without claiming a send attempt. Active senders own their lease.
  // Clean even exhausted/future retries, so stale records cannot block useful work.
  const skipped = await db
    .prepare(
      `UPDATE order_email_jobs SET failure_code=CASE WHEN EXISTS
      (SELECT 1 FROM orders o WHERE o.id=order_email_jobs.order_id AND o.status<>order_email_jobs.order_status)
      THEN 'obsolete_order_state' ELSE 'expired_order_update' END,
      status='cancelled',lease_until=0,claim_token=NULL
      WHERE status IN ('queued','retry','sending') AND lease_until<=? AND ${eligibleDeliverySql('order','order_email_jobs.id')} AND ${accountedDeliveryAttemptsSql('order','order_email_jobs.id','order_email_jobs.attempts')}
      AND (created_at<=? OR EXISTS
        (SELECT 1 FROM orders o WHERE o.id=order_email_jobs.order_id AND o.status<>order_email_jobs.order_status))`,
    )
    .bind(now, now - orderEmailMaxAgeMs)
    .run();
  const jobs = await db
    .prepare(`SELECT j.id,j.attempts FROM order_email_jobs j INNER JOIN orders o ON o.id=j.order_id
 WHERE j.status IN ('queued','retry','sending') AND j.next_attempt_at<=? AND j.lease_until<=?
 AND j.attempts<? AND j.created_at>? AND o.status=j.order_status AND ${eligibleDeliverySql('order','j.id')} AND ${accountedDeliveryAttemptsSql('order','j.id','j.attempts')}
 AND (? IS NULL OR o.id=?) AND (? IS NULL OR o.order_number=?) AND (? IS NULL OR j.id=?) ORDER BY j.next_attempt_at,j.created_at,j.id LIMIT ?`)
    .bind(
      now,
      now,
      maximumEmailAttempts,
      now - orderEmailMaxAgeMs,
      options.orderId ?? null,
      options.orderId ?? null,
      options.orderNumber ?? null,
      options.orderNumber ?? null,
      options.jobId ?? null,
      options.jobId ?? null,
      limit,
    )
    .all<{ id: string; attempts: number }>();
  let sent = 0,
    failed = 0,
    cancelled = Number(skipped.meta.changes ?? 0);
  for (const job of jobs.results) {
    if(options.deadlineMs!==undefined&&Date.now()>=options.deadlineMs)break;
    if(await fenceLegacyDeliveryGap(db,'order',job.id,job.attempts,options.now??Date.now(),true))continue;
    const claim = crypto.randomUUID();
    const claimedAt = options.now ?? Date.now();
    const claimed = await db
      .prepare(`UPDATE order_email_jobs SET status='sending',claim_token=?,lease_until=?,attempts=attempts+1
   WHERE id=? AND status IN ('queued','retry','sending') AND attempts<? AND next_attempt_at<=? AND lease_until<=?
      AND created_at>? AND ${eligibleDeliverySql('order','order_email_jobs.id')} AND ${accountedDeliveryAttemptsSql('order','order_email_jobs.id','order_email_jobs.attempts')} AND EXISTS(SELECT 1 FROM orders o WHERE o.id=order_email_jobs.order_id AND o.status=order_email_jobs.order_status)`)
      .bind(
        claim,
        claimedAt + 15 * 60000,
        job.id,
        maximumEmailAttempts,
        claimedAt,
        claimedAt,
        claimedAt - orderEmailMaxAgeMs,
      )
      .run();
    if (!claimed.meta.changes) continue;
    try {
      const data = await db
        .prepare(`SELECT o.id AS orderId,o.order_number AS orderNumber,o.customer_email AS email,o.status AS currentStatus,EXISTS(SELECT 1 FROM first_cod_reviews r WHERE r.order_id=o.id AND r.status='pending') AS firstCodPending,
    o.customer_id AS customerId,o.payment_mode AS paymentMode,o.customer_phone AS customerPhone,o.return_policy_snapshot_json AS returnSnapshot,
    j.order_status AS eventStatus,j.attempts,j.created_at AS occurredAt,${payableOrderTotalSql('o')} AS cashPaisa,
    CASE WHEN EXISTS(SELECT 1 FROM shipping_jobs pj JOIN shipping_parcels pp ON pp.shipping_job_id=pj.id WHERE pj.order_id=o.id) THEN (SELECT SUM(pp.collected_paisa) FROM shipping_jobs pj JOIN shipping_parcels pp ON pp.shipping_job_id=pj.id WHERE pj.order_id=o.id) ELSE NULL END AS collectedPaisa,
    COALESCE(o.current_wallet_paisa,o.wallet_credit_paisa) AS walletPaisa,o.current_referral_discount_paisa AS discountPaisa,CASE WHEN o.current_discount_paisa IS NULL THEN o.promo_discount_paisa ELSE o.current_promo_discount_paisa END AS promoPaisa,o.promo_label AS promoLabel,o.promo_revision AS promoRevision,${publicTrackingReferenceSql('o.id', 's.tracking_code')} AS trackingCode
    FROM order_email_jobs j INNER JOIN orders o ON o.id=j.order_id
    LEFT JOIN shipments s ON s.order_id=o.id WHERE j.id=? AND j.claim_token=?`)
        .bind(job.id, claim)
        .first<OrderEmailRow>();
      if (!data) throw new Error('Order email unavailable');
      const skipReason = orderEmailSkipReason(
        data.eventStatus,
        data.currentStatus,
        data.occurredAt,
        options.now ?? Date.now(),
      );
      if (skipReason) {
        await db
          .prepare(
            "UPDATE order_email_jobs SET status='cancelled',failure_code=?,lease_until=0,claim_token=NULL,attempts=attempts-1 WHERE id=? AND claim_token=?",
          )
          .bind(skipReason, job.id, claim)
          .run();
        cancelled++;
        continue;
      }
      if (validMailRecipient(data.email)) await orderEmailDetails(db, data);
      const message=validMailRecipient(data.email)?buildOrderEmail(data,origin,{transport:mail.transport}):{to:data.email,subject:'',text:'',html:''};
      const outcome=await deliverDurably(db,mail,message,{
        queueKind:'order',queueId:job.id,claimToken:claim,attemptNumber:data.attempts??job.attempts+1,
        now:()=>options.now??Date.now(),
        validate:async()=>{
          const current=await db.prepare(`SELECT o.customer_email AS email,o.status AS currentStatus,j.order_status AS eventStatus,j.created_at AS occurredAt FROM order_email_jobs j JOIN orders o ON o.id=j.order_id WHERE j.id=? AND j.claim_token=? AND j.lease_until>?`).bind(job.id,claim,options.now??Date.now()).first<{email:string;currentStatus:string;eventStatus:string;occurredAt:number}>();
          return !!current && current.email===data.email && !orderEmailSkipReason(current.eventStatus,current.currentStatus,current.occurredAt,options.now??Date.now());
        },
      });
      if(outcome.outcome!=='accepted'&&outcome.outcome!=='captured'){
        if(outcome.outcome==='cancelled'){
          await db.prepare("UPDATE order_email_jobs SET status='cancelled',failure_code='obsolete_order_state',lease_until=0,claim_token=NULL WHERE id=? AND claim_token=?").bind(job.id,claim).run();cancelled++;
        }else{
          await db.prepare("UPDATE order_email_jobs SET status='retry',next_attempt_at=?,failure_code=?,lease_until=0,claim_token=NULL,attempts=attempts-? WHERE id=? AND claim_token=?").bind(outcome.retryAt??(outcome.outcome==='intervention'?(options.now??Date.now())+60_000:0),outcome.failureCode??'delivery_held',outcome.outcome==='held'?1:0,job.id,claim).run();
          if(outcome.outcome!=='held')failed++;
        }
        continue;
      }
      await db
        .prepare(
          "UPDATE order_email_jobs SET status='sent',sent_at=?,lease_until=0,claim_token=NULL,failure_code=NULL WHERE id=? AND claim_token=?",
        )
        .bind(options.now ?? Date.now(), job.id, claim)
        .run();
      sent++;
    } catch {
      await recordUnstartedDeliveryAttempt(db,{queueKind:'order',queueId:job.id,claimToken:claim,attemptNumber:job.attempts+1,now:options.now??Date.now(),retryAt:(options.now??Date.now())+emailRetryDelayMs(job.attempts+1)});
      // Store only a safe code, never SMTP responses or credentials.
      await db
        .prepare(
          "UPDATE order_email_jobs SET status='retry',next_attempt_at=?,lease_until=0,claim_token=NULL,failure_code='delivery_failed' WHERE id=? AND claim_token=?",
        )
        .bind(
          (options.now ?? Date.now()) + emailRetryDelayMs(job.attempts + 1),
          job.id,
          claim,
        )
        .run();
      failed++;
    }
  }
  return { sent, failed, cancelled };
}
