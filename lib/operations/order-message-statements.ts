import { orderStatusMessages } from './message-event-catalog';

type OrderMessage = keyof typeof orderStatusMessages;
const accountStatuses = ['placed', 'dispatched', 'delivered'] as const;

export function orderMessageStatus(key: string) {
  return accountStatuses.find(status => orderStatusMessages[status].key === key);
}

export async function isCurrentOrderAccountMessage(db: D1Database, notice: {
  relatedId: string | null; relatedType?: string | null; userId: string | null; audience: string; channel: string; requestId: string;
}, status: (typeof accountStatuses)[number]) {
  if (notice.channel !== 'in_app' || notice.audience !== 'customer' || notice.relatedType !== 'order' ||
      !notice.userId || !notice.relatedId || notice.requestId !== `order-update:${notice.relatedId}:${status}:in_app`) return false;
  return Boolean(await db.prepare(`SELECT 1 FROM orders o JOIN order_email_jobs j ON j.order_id=o.id
    WHERE o.id=? AND o.customer_id=? AND j.order_status=?`).bind(notice.relatedId, notice.userId, status).first());
}

/** Appends the account copy to the same transaction as the native order update.
 * The existing order job remains the email copy and holds all delivery state.
 */
export function orderMessageStatements(db: D1Database, input: {
  orderId: string;
  event: OrderMessage;
  now: number;
  checkoutRequestId?: string;
  orderNumber?: string;
}) {
  const { orderId, event, now, checkoutRequestId, orderNumber } = input;
  const { key, subject, body } = orderStatusMessages[event];
  const status = event === 'checkoutCod' ? 'confirmed' : event;
  const cod = event === 'checkoutCod';
  const bodyEn = cod && orderNumber
    ? `Your cash-on-delivery order ${orderNumber} has been received. Check order details for confirmation and delivery progress.` : body;
  const bodyNe = cod
    ? `तपाईंको क्यास अन डेलिभरी अर्डर ${orderNumber ?? ''} प्राप्त भयो। पुष्टि र डेलिभरीको प्रगतिको लागि अर्डर विवरण हेर्नुहोस्।` : body;
  const statements: D1PreparedStatement[] = [];
  if (event === 'placed') {
    // The existing status trigger covers confirmed and later. Manual-bank checkout
    // begins in placed, and this job follows the same age and current-status guards.
    statements.push(db.prepare(`INSERT OR IGNORE INTO order_email_jobs(id,order_id,order_status,created_at)
      SELECT ?,id,'placed',? FROM orders WHERE id=? AND status='placed' AND payment_mode='prepaid'`)
      .bind(orderId + ':placed', now, orderId));
  }
  statements.push(db.prepare(`INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,
    template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at)
    SELECT ?,u.id,'customer','in_app',?,?,?,?,?,'order',o.id,'queued',?,?
    FROM orders o JOIN users u ON u.id=o.customer_id
    JOIN order_email_jobs j ON j.order_id=o.id AND j.order_status=? AND j.created_at=?
    WHERE o.id=? AND o.status=? AND u.status='active'`)
    .bind(crypto.randomUUID(), key, subject, cod ? 'अर्डर प्राप्त भयो' : subject, bodyEn, bodyNe,
      cod && checkoutRequestId ? checkoutRequestId + ':customer:in_app' : `order-update:${orderId}:${status}:in_app`,
      now, status, now, orderId, status));
  return statements;
}
