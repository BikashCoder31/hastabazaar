import { publicTrackingReferenceSql } from '../riders/public-tracking';
import {emailApplicationOrigin} from './origin';
import { payableOrderTotalSql } from '../db/repositories/platform-service-fee';
import { orderProgress } from '../orders/progress';
import { emailRetryDelayMs, maximumEmailAttempts } from './retry-policy';
import { accountedDeliveryAttemptsSql, deliverDurably, eligibleDeliverySql, fenceLegacyDeliveryGap, fenceLegacyDeliveryQueue, recordUnstartedDeliveryAttempt, recoverDeliveryReceipts, validMailRecipient, type DeliveryMailService } from './delivery-attempts';
import {
  manualOrderEmailBatchSize,
  orderEmailMaxAgeMs,
  orderEmailSkipReason,
} from './order-update-policy';
export interface OrderEmailData {
  firstCodPending?: boolean | number;
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
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function buildOrderEmail(data: OrderEmailData, origin: string,options:{transport?:'provider'|'capture'}={}) {
  const url = emailApplicationOrigin(origin,options.transport);
  const trackingUrl = new URL('/track', url);
  trackingUrl.searchParams.set('order', data.orderNumber);
  const pendingCod =
    Boolean(data.firstCodPending) && data.currentStatus !== 'cancelled';
  const progress = orderProgress(
    pendingCod ? 'awaiting_cod_confirmation' : data.eventStatus,
  );
  const money = (n: number) =>
    new Intl.NumberFormat('en-NP', {
      style: 'currency',
      currency: 'NPR',
    }).format(n / 100);
  const date = new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(data.occurredAt);
  const cash =
    data.currentStatus === 'cancelled'
      ? 'No cash payment is due.'
      : data.collectedPaisa != null
        ? `Cash collection recorded: ${money(data.collectedPaisa)}. Remaining cash awaiting confirmation: ${money(Math.max(0, data.cashPaisa - data.collectedPaisa))}.`
        : data.currentStatus === 'delivered'
          ? `Cash recorded on delivery: ${money(data.cashPaisa)}.`
          : `Cash to pay on delivery: ${money(data.cashPaisa)}.`;
  const lines = [
    `Order ${data.orderNumber}`,
    `${progress.label} · ${date}`,
    progress.detail,
    ...(data.currentStatus !== data.eventStatus
      ? [`Latest order status: ${orderProgress(data.currentStatus).label}.`]
      : []),
    cash,
    ...(data.walletPaisa
      ? [
          `Shopping credit applied: ${money(data.walletPaisa)}.${data.currentStatus === 'cancelled' ? ' This credit has been restored to your wallet.' : ''}`,
        ]
      : []),
    ...(data.discountPaisa
      ? [`Referral discount: ${money(data.discountPaisa)}.`]
      : []),
    ...(data.promoPaisa
      ? [
          `Promo savings${data.promoLabel ? ` (${data.promoLabel}, revision ${data.promoRevision})` : ''}: ${money(data.promoPaisa)}.`,
        ]
      : []),
    ...(data.trackingCode ? [`Delivery reference: ${data.trackingCode}`] : []),
    'Track your order using your order number and the email address used at checkout.',
    trackingUrl.toString(),
    'Updates appear when Hastabazaar or the delivery team records progress. Tracking is not a live location service.',
    `Need help? ${new URL('/help', url)}`,
  ];
  return {
    to: data.email,
    subject: `Hastabazaar · ${data.orderNumber} · ${progress.label}`,
    text: lines.join('\n\n'),
    html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;color:#17345f;font-family:Arial,sans-serif"><div style="max-width:580px;margin:auto;padding:32px 16px"><div style="background:white;border:1px solid #dfe5ef;border-radius:18px;padding:28px"><p style="font-weight:bold;letter-spacing:2px">HASTABAZAAR</p><h1 style="font-size:28px">${escape(progress.label)}</h1>${lines
      .filter((l) => l !== trackingUrl.toString())
      .map((l) => `<p style="line-height:1.6">${escape(l)}</p>`)
      .join(
        '',
      )}<p style="margin-top:28px"><a href="${escape(trackingUrl.toString())}" style="display:inline-block;background:#17345f;color:white;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Track your order</a></p><p style="font-size:12px;color:#68758a">This is an order update from Hastabazaar. Please use our Help page for support.</p></div></div></body></html>`,
  };
}

export async function deliverOrderEmails(
  db: D1Database,
  mail: OrderMailService,
  origin: string,
  options: {
    orderId?: string;
    orderNumber?: string;
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
 AND (? IS NULL OR o.id=?) AND (? IS NULL OR o.order_number=?) ORDER BY j.next_attempt_at,j.created_at,j.id LIMIT ?`)
    .bind(
      now,
      now,
      maximumEmailAttempts,
      now - orderEmailMaxAgeMs,
      options.orderId ?? null,
      options.orderId ?? null,
      options.orderNumber ?? null,
      options.orderNumber ?? null,
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
        .prepare(`SELECT o.order_number AS orderNumber,o.customer_email AS email,o.status AS currentStatus,EXISTS(SELECT 1 FROM first_cod_reviews r WHERE r.order_id=o.id AND r.status='pending') AS firstCodPending,
    j.order_status AS eventStatus,j.attempts,j.created_at AS occurredAt,${payableOrderTotalSql('o')} AS cashPaisa,
    CASE WHEN EXISTS(SELECT 1 FROM shipping_jobs pj JOIN shipping_parcels pp ON pp.shipping_job_id=pj.id WHERE pj.order_id=o.id) THEN (SELECT SUM(pp.collected_paisa) FROM shipping_jobs pj JOIN shipping_parcels pp ON pp.shipping_job_id=pj.id WHERE pj.order_id=o.id) ELSE NULL END AS collectedPaisa,
    COALESCE(o.current_wallet_paisa,o.wallet_credit_paisa) AS walletPaisa,o.current_referral_discount_paisa AS discountPaisa,CASE WHEN o.current_discount_paisa IS NULL THEN o.promo_discount_paisa ELSE o.current_promo_discount_paisa END AS promoPaisa,o.promo_label AS promoLabel,o.promo_revision AS promoRevision,${publicTrackingReferenceSql('o.id', 's.tracking_code')} AS trackingCode
    FROM order_email_jobs j INNER JOIN orders o ON o.id=j.order_id
    LEFT JOIN shipments s ON s.order_id=o.id WHERE j.id=? AND j.claim_token=?`)
        .bind(job.id, claim)
        .first<OrderEmailData>();
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
