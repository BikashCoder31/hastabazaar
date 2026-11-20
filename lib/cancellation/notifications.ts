import {responseScopeContains} from '../orders/response-sql';
import { hasStaffPermissionBySubject } from '../db/repositories/staff-permissions';
export async function cancellationNotifications(
  db: D1Database,
  orderId: string,
  eventId: string,
  review: boolean,
  now: number,
  decision?:{reviewId:string;status:'approved'|'rejected'},
) {
  const order = await db
    .prepare(
      'SELECT customer_id AS customerId,customer_email AS email,order_number AS number FROM orders WHERE id=?',
    )
    .bind(orderId)
    .first<{ customerId: string | null; email: string; number: string }>();
  if (!order) return [];
  const sourceId=review?eventId:decision?.reviewId??eventId,sourceState=review?'pending':decision?.status??'cancelled',sourceTable=sourceState==='cancelled'?'order_cancellation_events':'order_cancellation_reviews';
  const recipients: {
    id: string | null;
    audience: string;
    permission: string | null;
    predicate: string;
    values: unknown[];
  }[] = [];
  if (order.customerId)
    recipients.push({
      id: order.customerId,
      audience: 'customer',
      permission: null,
      predicate: 'EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=?)',
      values: [orderId, order.customerId],
    });
  else
    recipients.push({
      id: null,
      audience: 'customer',
      permission: null,
      predicate:
        'EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id IS NULL AND customer_email=?)',
      values: [orderId, order.email],
    });
  const sellers = (
    await db
      .prepare(
        'SELECT DISTINCT s.user_id AS id FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=?',
      )
      .bind(orderId)
      .all<{ id: string }>()
  ).results;
  for (const s of sellers)
    recipients.push({
      id: s.id,
      audience: 'seller',
      permission: null,
      predicate:
        `EXISTS(SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id JOIN ${sourceTable} c ON c.order_id=i.order_id WHERE i.order_id=? AND s.user_id=? AND c.id=? AND ${responseScopeContains(db,'c.seller_ids_json','i.seller_id')})`,
      values: [orderId, s.id,sourceId],
    });
  if (review) {
    const staff = (
      await db
        .prepare(
          "SELECT u.id,u.auth_subject AS subject,p.permissions_json AS profile FROM users u LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.status='active' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('admin','super_admin'))",
        )
        .all<{ id: string; subject: string; profile: string | null }>()
    ).results;
    for (const s of staff)
      if (await hasStaffPermissionBySubject(db, s.subject, 'order.manage'))
        recipients.push({
          id: s.id,
          audience: 'staff',
          permission: 'order.manage',
          predicate:
            "EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role IN ('admin','super_admin')) AND " +
            (s.profile === null
              ? 'NOT EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=?)'
              : 'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=? AND permissions_json=?)'),
          values: s.profile === null ? [s.id, s.id] : [s.id, s.id, s.profile],
        });
  }
  const statements: D1PreparedStatement[] = [];
  const body = review
    ? 'Cancellation or delivery help was requested. Open the order for actual item holds, custody, the responsible team and the next action. No refund has been executed.'
    : 'Cancellation was reviewed or recorded. Open the order for current parcel status, revised COD and wallet adjustments; previous records remain preserved.';
  const emailed = new Set<string>();
  for (const r of recipients)
    for (const channel of r.id ? ['in_app', 'email'] : ['email']) {
      if (channel === 'email') {
        const recipient = r.id ?? order.email;
        if (emailed.has(recipient)) continue;
        emailed.add(recipient);
      }
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,required_permission,guest_email,guest_order_id,source_event_id,source_revision) SELECT ?,?,?,?,'business.cancellation.updated',?,?,?,?,'order',?,'queued',?,?,'business.cancellation.updated',?,?,?,?,? WHERE " +
              r.predicate +
              (r.id
                ? " AND EXISTS(SELECT 1 FROM users WHERE id=? AND status='active')"
                : ''),
          )
          .bind(
            crypto.randomUUID(),
            r.id,
            r.audience,
            channel,
            'Cancellation update — ' + order.number,
            'Cancellation update — ' + order.number,
            body,
            body,
            orderId,
            eventId +
              ':' +
              r.audience +
              ':' +
              (r.id ?? 'guest') +
              ':' +
              channel,
            now,
            r.permission,
            r.id ? null : order.email,
            r.id ? null : orderId,
            sourceId,sourceState,
            ...r.values,
            ...(r.id ? [r.id] : []),
          ),
      );
    }
  return statements;
}

/** The bell, inbox and email use the same case-state and exact seller-scope check. */
export async function currentCancellationNotice(db:D1Database,notice:{requestId:string;userId:string|null;audience:string}){
 const saved=await db.prepare("SELECT source_event_id AS sourceId,source_revision AS sourceState,guest_email AS guestEmail FROM notification_messages WHERE request_id=? AND template_key='business.cancellation.updated'").bind(notice.requestId).first<{sourceId:string|null;sourceState:string|null;guestEmail:string|null}>();
 if(!saved?.sourceId||!saved.sourceState)return false;
 const table=saved.sourceState==='cancelled'?'order_cancellation_events':'order_cancellation_reviews';
 const row=await db.prepare(`SELECT c.order_id AS orderId,c.seller_ids_json AS sellers,${table==='order_cancellation_reviews'?'c.status':"'cancelled'"} AS state,o.customer_id AS customerId,o.customer_email AS email FROM ${table} c JOIN orders o ON o.id=c.order_id WHERE c.id=?`).bind(saved.sourceId).first<{orderId:string;sellers:string;state:string;customerId:string|null;email:string}>();
 if(!row||row.state!==saved.sourceState)return false;
 if(notice.audience==='customer')return notice.userId?row.customerId===notice.userId:!row.customerId&&row.email===saved.guestEmail;
 if(notice.audience==='seller')return !!await db.prepare(`SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=? AND s.user_id=? AND ${responseScopeContains(db,'?','i.seller_id')}`).bind(row.orderId,notice.userId,row.sellers).first();
 return notice.audience==='staff'&&row.state==='pending';
}
