import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { nepalDayIso } from '../dates/nepal-calendar';
import { accountedDeliveryAttemptsSql, eligibleDeliverySql } from '../email/delivery-attempts';
import { marketplaceSubject } from '../email/message-layout';
import { orderEmailSubject } from '../email/order-updates';
import { sellerNotificationEmail } from '../sellers/registration-email';
import { supportedTemplates } from './business-notifications';
import { EmailDeliveryOverviewError, type EmailDeliveryOverview } from './email-delivery-overview';
import { orderEmailHistorySource } from './email-queue';
import { orderStatusMessages } from './message-event-catalog';
import { notificationDestination } from './notification-links';

export type MessageScope = { kind: 'seller' | 'customer' | 'order'; id: string };
export const messageViews = ['needs-you', 'waiting', 'delivered', 'all'] as const;
export type MessageView = (typeof messageViews)[number];

type MessageState = 'delivered' | 'captured' | 'sent_record' | 'waiting' | 'failed' | 'expired';
type QueueKind = 'order' | 'business';

interface QueueRow {
  id: string;
  kind: QueueKind;
  state: MessageState;
  subject: string;
  name: string | null;
  recipientId: string | null;
  audience: 'customer' | 'seller' | 'staff';
  address: string | null;
  sellerEmailAnswers: string | null;
  sellerId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
  currentStatus: string | null;
  paymentMode: string | null;
  firstCodPending: number | null;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: number;
  sentAt: number | null;
  inAppId: string | null;
  readAt: number | null;
  nextAt: number;
  leaseUntil: number;
  failureCategory: string | null;
  failureCode: string | null;
  resendAllowed: number;
}

export async function requireAdminMessageAccess(db: D1Database, actorId: string) {
  await staffMutationGuard(db, actorId, 'email.delivery.manage', EmailDeliveryOverviewError, 'super_admin');
}

function queueSource(now: number, scope?: MessageScope, target?: { kind: QueueKind; id: string }) {
  const order = orderEmailHistorySource(now);
  const businessTests = [];
  const orderTests = [];
  const businessValues: string[] = [];
  const orderValues: string[] = [];
  if (scope?.kind === 'seller') {
    businessTests.push("n.audience_role='seller' AND s.id=?");
    businessValues.push(scope.id);
    orderTests.push('1=0');
  }
  if (scope?.kind === 'customer') {
    businessTests.push("n.audience_role='customer' AND n.recipient_user_id=?");
    orderTests.push('o.customer_id=?');
    businessValues.push(scope.id);
    orderValues.push(scope.id);
  }
  if (scope?.kind === 'order') {
    businessTests.push('o.id=?');
    orderTests.push('o.id=?');
    businessValues.push(scope.id);
    orderValues.push(scope.id);
  }
  if (target) {
    businessTests.push(target.kind === 'business' ? 'n.id=?' : '1=0');
    orderTests.push(target.kind === 'order' ? 'q.id=?' : '1=0');
    (target.kind === 'business' ? businessValues : orderValues).push(target.id);
  }
  // The request identity differs only in channel for notices saved as a pair.
  const business = `SELECT n.id,'business' AS kind,CASE
    WHEN a.phase='accepted' THEN 'delivered'
    WHEN a.phase='captured' THEN 'captured'
    WHEN n.status='sent' THEN 'sent_record'
    WHEN n.status='cancelled' OR a.phase='cancelled' THEN 'expired'
    WHEN n.delivery_lease_until>? AND a.phase NOT IN ('accepted','captured') THEN 'waiting'
    WHEN n.status='failed' OR a.phase IN ('handoff_started','uncertain','not_accepted')
      OR NOT ${accountedDeliveryAttemptsSql('business','n.id','n.delivery_attempts')} THEN 'failed'
    ELSE 'waiting' END AS state,
    n.subject_en AS subject,COALESCE(s.trading_name,u.display_name) AS name,n.recipient_user_id AS recipientId,
    n.audience_role AS audience,COALESCE(u.email,n.guest_email) AS address,i.answers_json AS sellerEmailAnswers,
    s.id AS sellerId,o.id AS orderId,o.order_number AS orderNumber,NULL AS orderStatus,NULL AS currentStatus,
    NULL AS paymentMode,NULL AS firstCodPending,n.related_type AS relatedType,n.related_id AS relatedId,
    n.created_at AS createdAt,COALESCE(n.sent_at,a.completed_at) AS sentAt,p.id AS inAppId,p.read_at AS readAt,
    n.delivery_next_attempt_at AS nextAt,n.delivery_lease_until AS leaseUntil,
    a.failure_category AS failureCategory,COALESCE(a.failure_code,n.failure_reason) AS failureCode,
    CASE WHEN n.status IN ('queued','failed') AND a.phase='not_accepted' AND a.failure_category='temporary'
      AND ${eligibleDeliverySql('business','n.id')} AND ${accountedDeliveryAttemptsSql('business','n.id','n.delivery_attempts')}
      THEN 1 ELSE 0 END AS resendAllowed
    FROM notification_messages n LEFT JOIN users u ON u.id=n.recipient_user_id
    LEFT JOIN seller_profiles s ON n.audience_role='seller' AND s.user_id=u.id
    LEFT JOIN seller_registration_intakes i ON i.user_id=u.id AND
      (n.audience_role='seller' OR (n.audience_role='customer' AND n.related_type='seller_application'))
    LEFT JOIN return_requests r ON n.related_type='return_request' AND r.id=n.related_id
    LEFT JOIN order_items item ON item.id=r.order_item_id
    LEFT JOIN complaints c ON n.related_type='complaint' AND c.id=n.related_id
    LEFT JOIN orders o ON o.id=COALESCE(n.guest_order_id,item.order_id,c.order_id,
      CASE WHEN n.related_type IN ('order','order_payment') THEN n.related_id END)
    LEFT JOIN email_delivery_attempts a ON a.id=(SELECT latest.id FROM email_delivery_attempts latest
      WHERE latest.queue_kind='business' AND latest.queue_id=n.id ORDER BY latest.attempt_number DESC LIMIT 1)
    LEFT JOIN notification_messages p ON n.request_id LIKE '%:email'
      AND p.request_id=REPLACE(n.request_id,':email',':in_app') AND p.channel='in_app'
      AND p.recipient_user_id=n.recipient_user_id AND p.audience_role=n.audience_role AND p.template_key=n.template_key
    WHERE n.channel='email' AND n.business_event_key=n.template_key
      AND n.template_key IN (${supportedTemplates.map(() => '?').join(',')})
      ${businessTests.length ? 'AND '+businessTests.join(' AND ') : ''}`;
  // Native order updates use an independent queue. Match only the known status notices for the same event.
  const native = `SELECT q.id,'order' AS kind,CASE q.displayStatus
    WHEN 'sent' THEN 'delivered' WHEN 'captured' THEN 'captured' WHEN 'sent_record' THEN 'sent_record'
    WHEN 'skipped' THEN 'expired' WHEN 'retry' THEN 'failed' WHEN 'intervention' THEN 'failed'
    WHEN 'uncertain' THEN CASE WHEN q.leaseUntil>? THEN 'waiting' ELSE 'failed' END
    ELSE 'waiting' END AS state,'' AS subject,u.display_name AS name,o.customer_id AS recipientId,
    'customer' AS audience,o.customer_email AS address,NULL AS sellerEmailAnswers,NULL AS sellerId,
    o.id AS orderId,o.order_number AS orderNumber,q.orderStatus,q.currentStatus,o.payment_mode AS paymentMode,
    EXISTS(SELECT 1 FROM first_cod_reviews review WHERE review.order_id=o.id AND review.status='pending') AS firstCodPending,
    'order' AS relatedType,o.id AS relatedId,q.createdAt,q.sentAt,p.id AS inAppId,p.read_at AS readAt,
    q.nextAttemptAt AS nextAt,q.leaseUntil,q.failureCategory,q.failureCode,
    CASE WHEN q.displayStatus='retry' AND q.deliveryPhase='not_accepted' AND q.failureCategory='temporary'
      AND q.safeToAttempt=1 THEN 1 ELSE 0 END AS resendAllowed
    FROM (${order.sql}) AS q JOIN orders o ON o.id=q.orderId
    LEFT JOIN users u ON u.id=o.customer_id
    LEFT JOIN notification_messages p ON p.id=(SELECT notice.id FROM notification_messages notice
      WHERE notice.recipient_user_id=o.customer_id AND notice.audience_role='customer' AND notice.channel='in_app'
       AND notice.related_type='order' AND notice.related_id=o.id AND notice.created_at=q.createdAt
       AND notice.template_key=CASE
         WHEN q.orderStatus IN ('placed','pending_payment') THEN '${orderStatusMessages.placed.key}'
         WHEN q.orderStatus='confirmed' AND o.payment_mode='cod' THEN '${orderStatusMessages.checkoutCod.key}'
         WHEN q.orderStatus='dispatched' THEN '${orderStatusMessages.dispatched.key}'
         WHEN q.orderStatus='delivered' THEN '${orderStatusMessages.delivered.key}' END
      LIMIT 1)
    ${orderTests.length ? 'WHERE '+orderTests.join(' AND ') : ''}`;
  return {
    sql: `(${business} UNION ALL ${native}) AS messages`,
    values: [now, ...supportedTemplates, ...businessValues, now, ...order.values, ...orderValues],
  };
}

function messageReason(row: QueueRow) {
  if (row.failureCategory === 'permanent_recipient') return 'Address rejected';
  if (row.failureCategory === 'configuration') return 'Email setup needs attention';
  if (row.failureCategory === 'temporary') return 'Temporary mail error';
  if (row.state === 'failed') return 'Delivery could not be confirmed';
  if (row.state === 'expired' && ['expired_order_update','obsolete_order_state'].includes(row.failureCode ?? ''))
    return 'Order moved on';
  return null;
}

function present(row: QueueRow) {
  const address = sellerNotificationEmail(row.address, row.sellerEmailAnswers);
  const name = row.name ?? (row.audience === 'staff' ? 'Super Admin' : row.audience === 'customer' ? 'Guest customer' : 'Seller');
  const href = row.orderId
    ? '/admin/orders/' + encodeURIComponent(row.orderId)
    : row.sellerId
      ? '/admin/sellers/' + encodeURIComponent(row.sellerId)
      : row.audience === 'customer' && row.recipientId
        ? '/admin/customers?customer=' + encodeURIComponent(row.recipientId) + '#customer-record'
        : notificationDestination('staff', 'staff', row.relatedType, row.relatedId);
  const subject = row.kind === 'order' && row.orderStatus && row.currentStatus && row.orderNumber
    ? orderEmailSubject({ eventStatus: row.orderStatus, currentStatus: row.currentStatus,
      orderNumber: row.orderNumber, firstCodPending: !!row.firstCodPending, paymentMode: row.paymentMode ?? undefined })
    : marketplaceSubject(row.subject.replace(/[\r\n]+/g, ' '), row.orderNumber);
  return {
    id: row.id, kind: row.kind, state: row.state, name, address, subject, href,
    audience: row.audience === 'staff' ? 'Super Admin' : row.audience === 'seller' ? 'Seller' : 'Customer',
    createdAt: row.createdAt, sentAt: row.sentAt, nextAt: Math.max(row.nextAt, row.leaseUntil),
    inApp: !!row.inAppId, readAt: row.readAt, reason: messageReason(row),
    resendAllowed: row.state === 'failed' && !!row.resendAllowed, permanentAddressFailure: row.state === 'failed' && row.failureCategory === 'permanent_recipient',
  };
}

export type AdminMessage = ReturnType<typeof present>;

const viewWhere: Record<MessageView, string> = {
  'needs-you': "WHERE state='failed'",
  waiting: "WHERE state='waiting'",
  delivered: "WHERE state IN ('delivered','captured','sent_record')",
  all: '',
};

export async function readAdminMessages(
  db: D1Database, actorId: string,
  input: { now: number; scope?: MessageScope; view: MessageView; page?: number; limit?: number },
) {
  await requireAdminMessageAccess(db, actorId);
  const source = queueSource(input.now, input.scope);
  const start = Date.parse(nepalDayIso(input.now) + 'T00:00:00+05:45');
  const summary = await db.prepare(`SELECT
    COUNT(*) AS total,
    COUNT(CASE WHEN state='waiting' THEN 1 END) AS waiting,
    COUNT(CASE WHEN state='failed' THEN 1 END) AS failures,
    COUNT(CASE WHEN state IN ('delivered','captured','sent_record') THEN 1 END) AS sent,
    COUNT(CASE WHEN state='delivered' AND sentAt>=? THEN 1 END) AS deliveredToday,
    COUNT(CASE WHEN state='captured' AND sentAt>=? THEN 1 END) AS capturedToday,
    MIN(CASE WHEN state='waiting' THEN createdAt END) AS oldestWaitingAt
    FROM ${source.sql}`).bind(start, start, ...source.values).first<{
      total: number; waiting: number; failures: number; sent: number;
      deliveredToday: number; capturedToday: number; oldestWaitingAt: number | null;
    }>();
  if (!summary) throw new Error('Message counts are unavailable.');
  const size = Math.max(1, Math.min(input.limit ?? 30, 100));
  const count = input.view === 'all' ? summary.total : input.view === 'needs-you'
    ? summary.failures : input.view === 'waiting' ? summary.waiting : summary.sent;
  const pages = Math.max(1, Math.ceil(count / size));
  const page = Math.min(input.page ?? 1, pages);
  const result = await db.prepare(`SELECT * FROM ${source.sql} ${viewWhere[input.view]}
    ORDER BY createdAt DESC,id DESC LIMIT ? OFFSET ?`)
    .bind(...source.values, size, (page - 1) * size).all<QueueRow>();
  await requireAdminMessageAccess(db, actorId);
  return { summary, messages: result.results.map(present), page, pages };
}

export async function readMessageResendTarget(db: D1Database, actorId: string, kind: QueueKind, id: string, now: number) {
  await requireAdminMessageAccess(db, actorId);
  const source = queueSource(now, undefined, { kind, id });
  const row = await db.prepare(`SELECT * FROM ${source.sql}`).bind(...source.values).first<QueueRow>();
  await requireAdminMessageAccess(db, actorId);
  if (row && row.state === 'failed') return present(row);
  return null;
}

export function emailSenderStatus(overview: EmailDeliveryOverview | null, now: number) {
  const sender = overview?.services.find(service => service.serviceKey === 'email.sender');
  const lastRan = sender?.lastObservedAt ?? null;
  const expectedSince = overview?.expectedSince ?? null;
  const anchor = lastRan == null ? expectedSince : Math.max(lastRan, expectedSince ?? 0);
  const stopped = anchor !== null && now - anchor >= 5 * 60_000;
  const healthy = !stopped && sender?.state === 'healthy';
  return { lastRan, stopped, healthy };
}

export function emailDeliveryWarning(
  status: ReturnType<typeof emailSenderStatus>,
  summary: Awaited<ReturnType<typeof readAdminMessages>>['summary'],
  failures: readonly AdminMessage[],
  now: number,
) {
  if (status.stopped || (summary.oldestWaitingAt != null && now - summary.oldestWaitingAt > 10 * 60_000)) {
    return { tone: 'red', title: 'Emails are not going out',
      message: status.stopped ? 'The sender has missed its last five minutes.' : 'An email has been waiting for more than ten minutes.' } as const;
  }
  if (summary.failures === 0) return null;
  const names = [...new Set(failures.map(row => row.name))].slice(0, 3);
  return { tone: 'amber', title: summary.failures + (summary.failures === 1
    ? ' email couldn’t be delivered' : ' emails couldn’t be delivered'),
    message: names.length ? 'Check the messages for ' + names.join(', ') + '.' : 'Open Emails to see who needs help.' } as const;
}
