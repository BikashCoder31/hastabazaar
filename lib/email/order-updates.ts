import { orderProgress } from '../orders/progress';
import { emailRetryDelayMs, maximumEmailAttempts } from './retry-policy';
export interface OrderEmailData {
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
export interface OrderMailService {
  send(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void>;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function buildOrderEmail(data: OrderEmailData, origin: string) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('HTTPS application origin required');
  const trackingUrl = new URL('/track', url);
  trackingUrl.searchParams.set('order', data.orderNumber);
  const progress = orderProgress(data.eventStatus);
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
        ? `Cash collection recorded: ${money(data.collectedPaisa)}. Remaining cash awaiting confirmation: ${money(Math.max(0,data.cashPaisa-data.collectedPaisa))}.`
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
    ...(data.promoPaisa ? [`Promo savings${data.promoLabel ? ` (${data.promoLabel}, revision ${data.promoRevision})` : ''}: ${money(data.promoPaisa)}.`] : []),
    ...(data.trackingCode ? [`Delivery reference: ${data.trackingCode}`] : []),
    'Track your order using your order number and the email address used at checkout.',
    trackingUrl.toString(),
    'Updates appear when HastaBazaar or the delivery team records progress. Tracking is not a live location service.',
    `Need help? ${new URL('/help', url)}`,
  ];
  return {
    to: data.email,
    subject: `HastaBazaar · ${data.orderNumber} · ${progress.label}`,
    text: lines.join('\n\n'),
    html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;color:#17345f;font-family:Arial,sans-serif"><div style="max-width:580px;margin:auto;padding:32px 16px"><div style="background:white;border:1px solid #dfe5ef;border-radius:18px;padding:28px"><p style="font-weight:bold;letter-spacing:2px">HASTABAZAAR</p><h1 style="font-size:28px">${escape(progress.label)}</h1>${lines
      .filter((l) => l !== trackingUrl.toString())
      .map((l) => `<p style="line-height:1.6">${escape(l)}</p>`)
      .join(
        '',
      )}<p style="margin-top:28px"><a href="${escape(trackingUrl.toString())}" style="display:inline-block;background:#17345f;color:white;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Track your order</a></p><p style="font-size:12px;color:#68758a">This is an order update from HastaBazaar. Please use our Help page for support.</p></div></div></body></html>`,
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
  } = {},
) {
  const now = options.now ?? Date.now();
  const limit = Math.max(1, Math.min(options.limit ?? 6, 20));
  const jobs = await db
    .prepare(`SELECT j.id,j.attempts FROM order_email_jobs j INNER JOIN orders o ON o.id=j.order_id
 WHERE j.status IN ('queued','retry','sending') AND j.next_attempt_at<=? AND j.lease_until<=?
 AND j.attempts<?
 AND (? IS NULL OR o.id=?) AND (? IS NULL OR o.order_number=?) ORDER BY j.created_at,j.id LIMIT ?`)
    .bind(
      now,
      now,
      maximumEmailAttempts,
      options.orderId ?? null,
      options.orderId ?? null,
      options.orderNumber ?? null,
      options.orderNumber ?? null,
      limit,
    )
    .all<{ id: string; attempts: number }>();
  let sent = 0,
    failed = 0,
    cancelled = 0;
  for (const job of jobs.results) {
    const claim = crypto.randomUUID();
    const claimedAt = options.now ?? Date.now();
    const claimed = await db
      .prepare(`UPDATE order_email_jobs SET status='sending',claim_token=?,lease_until=?,attempts=attempts+1
   WHERE id=? AND status IN ('queued','retry','sending') AND attempts<? AND next_attempt_at<=? AND lease_until<=?`)
      .bind(
        claim,
        claimedAt + 15 * 60000,
        job.id,
        maximumEmailAttempts,
        claimedAt,
        claimedAt,
      )
      .run();
    if (!claimed.meta.changes) continue;
    try {
      const data = await db
        .prepare(`SELECT o.order_number AS orderNumber,o.customer_email AS email,o.status AS currentStatus,
    j.order_status AS eventStatus,j.attempts,j.created_at AS occurredAt,COALESCE(o.current_total_paisa,o.grand_total_paisa) AS cashPaisa,
    CASE WHEN EXISTS(SELECT 1 FROM shipping_jobs pj JOIN shipping_parcels pp ON pp.shipping_job_id=pj.id WHERE pj.order_id=o.id) THEN (SELECT SUM(pp.collected_paisa) FROM shipping_jobs pj JOIN shipping_parcels pp ON pp.shipping_job_id=pj.id WHERE pj.order_id=o.id) ELSE NULL END AS collectedPaisa,
    COALESCE(o.current_wallet_paisa,o.wallet_credit_paisa) AS walletPaisa,o.current_referral_discount_paisa AS discountPaisa,CASE WHEN o.current_discount_paisa IS NULL THEN o.promo_discount_paisa ELSE o.current_promo_discount_paisa END AS promoPaisa,o.promo_label AS promoLabel,o.promo_revision AS promoRevision,s.tracking_code AS trackingCode
    FROM order_email_jobs j INNER JOIN orders o ON o.id=j.order_id
    LEFT JOIN shipments s ON s.order_id=o.id WHERE j.id=? AND j.claim_token=?`)
        .bind(job.id, claim)
        .first<OrderEmailData>();
      if (!data) throw new Error('Order email unavailable');
      if (data.currentStatus !== data.eventStatus) {
        await db
          .prepare(
            "UPDATE order_email_jobs SET status='cancelled',failure_code='obsolete_order_state',lease_until=0,claim_token=NULL WHERE id=? AND claim_token=?",
          )
          .bind(job.id, claim)
          .run();
        cancelled++;
        continue;
      }
      await mail.send(buildOrderEmail(data, origin));
      await db
        .prepare(
          "UPDATE order_email_jobs SET status='sent',sent_at=?,lease_until=0,claim_token=NULL,failure_code=NULL WHERE id=? AND claim_token=?",
        )
        .bind(options.now ?? Date.now(), job.id, claim)
        .run();
      sent++;
    } catch {
      // Store only a safe code, never SMTP responses or credentials.
      await db
        .prepare(
          "UPDATE order_email_jobs SET status='retry',next_attempt_at=?,lease_until=0,claim_token=NULL,failure_code='delivery_failed' WHERE id=? AND claim_token=?",
        )
        .bind(
          (options.now ?? Date.now()) +
            emailRetryDelayMs(job.attempts + 1),
          job.id,
          claim,
        )
        .run();
      failed++;
    }
  }
  return { sent, failed, cancelled };
}
