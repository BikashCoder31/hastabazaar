import { hasStaffPermissionBySubject } from '../db/repositories/staff-permissions';
export async function cancellationNotifications(
  db: D1Database,
  orderId: string,
  eventId: string,
  review: boolean,
  now: number,
) {
  const order = await db
    .prepare(
      'SELECT customer_id AS customerId,customer_email AS email,order_number AS number FROM orders WHERE id=?',
    )
    .bind(orderId)
    .first<{ customerId: string | null; email: string; number: string }>();
  if (!order) return [];
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
        'EXISTS(SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=? AND s.user_id=?)',
      values: [orderId, s.id],
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
    ? 'Cancellation needs operations review of production. Open the order for the responsible team and next action.'
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
            "INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,required_permission,guest_email,guest_order_id) SELECT ?,?,?,?,'business.cancellation.updated',?,?,?,?,'order',?,'queued',?,?,'business.cancellation.updated',?,?,? WHERE " +
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
            ...r.values,
            ...(r.id ? [r.id] : []),
          ),
      );
    }
  return statements;
}
