import { operationalNotificationRequestId } from './event-catalog';
import { deliveryFailureReasonLabel, readDeliveryFailureReason } from '../shipping/delivery-failure';
import { orderEmailMaxAgeMs } from '../email/order-update-policy';
import { pairedMessageChannels, parcelMessages } from './message-event-catalog';

export const missedDeliveryTemplate = parcelMessages.deliveryMissed.key;
export const courierBookedTemplate = parcelMessages.sellerBooked.key;
export const customerCourierBookedTemplate = parcelMessages.customerBooked.key;
export const parcelProblemTemplate = parcelMessages.staffProblem.key;
export const courierNoticeTemplates = [missedDeliveryTemplate, courierBookedTemplate, customerCourierBookedTemplate, parcelProblemTemplate] as const;
type CourierTemplate = (typeof courierNoticeTemplates)[number];

function courierTemplate(value: string) {
  return courierNoticeTemplates.find(template => template === value) ?? null;
}

export function isCourierNoticeTemplate(value: string) {
  return courierTemplate(value) !== null;
}

const copy = {
  [courierBookedTemplate]: { audience: 'seller', subject: parcelMessages.sellerBooked.subject,
    body: 'The courier pickup is booked. Have the packed parcel ready at your pickup address.' },
  [customerCourierBookedTemplate]: { audience: 'customer', subject: parcelMessages.customerBooked.subject,
    body: 'A courier is booked to collect your parcel from the seller. Open your order for the next update.' },
  [missedDeliveryTemplate]: { audience: 'customer', subject: parcelMessages.deliveryMissed.subject,
    body: 'The courier recorded a missed delivery. Open your order for the next update.' },
  [parcelProblemTemplate]: { audience: 'staff', subject: parcelMessages.staffProblem.subject,
    body: 'The courier could not deliver a parcel. Open the order to review the failure and decide the next step.' },
} as const;

function sourceSql(template: CourierTemplate) {
  const missed = template === missedDeliveryTemplate || template === parcelProblemTemplate;
  return `SELECT e.id AS marker,o.id AS orderId,o.order_number AS orderNumber,
    ${copy[template].audience === 'seller' ? 's.user_id' : 'o.customer_id'} AS ownerId,o.customer_email AS customerEmail,
    p.courier_name AS courierName,j.tracking_code AS trackingCode,j.pickup_window_start AS pickupAt,e.payload_json AS payload,
    e.created_at AS occurredAt
    FROM parcel_operation_events e JOIN shipping_jobs j ON j.id=e.shipping_job_id AND j.order_id=e.order_id
    JOIN shipping_parcels p ON p.shipping_job_id=j.id AND p.operation_request_id=e.id
    JOIN orders o ON o.id=j.order_id JOIN seller_profiles s ON s.id=j.seller_id
    WHERE o.id=? AND o.status<>'cancelled' AND j.direction='outbound' AND p.method='courier' AND p.rider_user_id IS NULL
      AND ${missed
        ? "e.action='fail' AND j.status='delivery_failed'"
        : "e.action='assign' AND j.status IN ('pickup_requested','label_pending','label_ready','pickup_scheduled')"}
  `;
}

const superAdminRecipient = "EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='super_admin')";

type Source = {
  marker: string;
  orderId: string;
  orderNumber: string;
  ownerId: string | null;
  customerEmail: string | null;
  courierName: string | null;
  trackingCode: string | null;
  pickupAt: number | null;
  occurredAt: number;
  payload: string;
};

/** Appends only after the existing atomic parcel event; current recipient/marker also fence sending. */
export async function courierEmailNoticeStatements(
  db: D1Database,
  input: { orderId: string; eventId: string; now: number; template: CourierTemplate },
) {
  const { orderId, eventId, template, now } = input;
  const { audience, subject, body } = copy[template];
  const source = sourceSql(template) + ' AND e.id=?';
  const statements: D1PreparedStatement[] = [];
  const staff = audience === 'staff';
  const recipients = staff ? (await db.prepare(`SELECT u.id FROM users u WHERE u.status='active' AND ${superAdminRecipient}`)
    .all<{ id: string }>()).results.map(user => user.id) : ['owner'];
  for (const recipient of recipients) {
    for (const channel of pairedMessageChannels) {
      statements.push(db.prepare(`INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,
        template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,required_permission)
        SELECT ?,u.id,?,?,?,?,?,?,?,'order',source.orderId,'queued',?,?,?,?
        FROM (${source}) source JOIN users u ON ${staff ? `u.id=? AND ${superAdminRecipient}` : 'u.id=source.ownerId'}
        WHERE u.status='active' ${staff ? 'AND (source.ownerId IS NULL OR u.id<>source.ownerId)' : ''}`)
        .bind(crypto.randomUUID(), audience, channel, template, subject, subject, body, body,
          await operationalNotificationRequestId(template, eventId, recipient, channel), now, template,
          staff ? 'admin.invite' : null, orderId, eventId, ...(staff ? [recipient] : [])));
    }
  }
  if (audience === 'customer') {
    statements.push(db.prepare(`INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,
      template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,guest_email,guest_order_id)
      SELECT ?,NULL,'customer','email',?,?,?,?,?,'order',source.orderId,'queued',?,?,?,source.customerEmail,source.orderId
      FROM (${source}) source WHERE source.ownerId IS NULL AND source.customerEmail IS NOT NULL`)
      .bind(crypto.randomUUID(), template, subject, subject, body, body,
        await operationalNotificationRequestId(template, eventId, 'guest', 'email'), now, template, orderId, eventId));
  }
  return statements;
}

export async function readCourierEmailNoticeSource(db: D1Database, notice: {
  template: string;
  relatedId: string | null;
  userId: string | null;
  audience: string;
  channel: string;
  requestId: string;
}, now = Date.now()) {
  const template = courierTemplate(notice.template);
  if (!template || !notice.relatedId || notice.audience !== copy[template].audience) return null;
  if (!notice.userId && (notice.audience !== 'customer' || notice.channel !== 'email')) return null;
  const staff = notice.audience === 'staff';
  if (staff && !await db.prepare(`SELECT 1 FROM users u WHERE u.id=? AND u.status='active' AND ${superAdminRecipient}`).bind(notice.userId).first()) return null;
  const rows = await db.prepare(sourceSql(template)).bind(notice.relatedId).all<Source>();
  for (const row of rows.results) {
    if (staff ? row.ownerId === notice.userId : row.ownerId !== notice.userId) continue;
    if (notice.channel === 'email' && row.occurredAt <= now - orderEmailMaxAgeMs) continue;
    const expected = await operationalNotificationRequestId(template, row.marker, staff ? notice.userId! : notice.userId ? 'owner' : 'guest', notice.channel);
    if (notice.requestId !== expected) continue;
    const payload: unknown = JSON.parse(row.payload);
    const reason = payload && typeof payload === 'object' && 'failureReason' in payload
      ? readDeliveryFailureReason(payload.failureReason) : undefined;
    return {
      orderNumber: row.orderNumber,
      courier: row.courierName ? { name: row.courierName, trackingCode: row.trackingCode, pickupAt: row.pickupAt } : undefined,
      failureReason: template === missedDeliveryTemplate ? deliveryFailureReasonLabel(reason ?? null) : undefined,
    };
  }
  return null;
}
