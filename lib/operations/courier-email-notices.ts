import { operationalNotificationRequestId } from './event-catalog';
import { deliveryFailureReasonLabel, readDeliveryFailureReason } from '../shipping/delivery-failure';
import { orderEmailMaxAgeMs } from '../email/order-update-policy';

export const missedDeliveryTemplate = 'business.parcel.delivery_missed';
export const courierBookedTemplate = 'business.parcel.courier_booked';
type CourierTemplate = typeof missedDeliveryTemplate | typeof courierBookedTemplate;

function courierTemplate(value: string) {
  return value === missedDeliveryTemplate || value === courierBookedTemplate ? value : null;
}

export function isCourierNoticeTemplate(value: string) {
  return courierTemplate(value) !== null;
}

function sourceSql(template: CourierTemplate) {
  const missed = template === missedDeliveryTemplate;
  return `SELECT e.id AS marker,o.id AS orderId,o.order_number AS orderNumber,
    ${missed ? 'o.customer_id' : 's.user_id'} AS ownerId,o.customer_email AS customerEmail,
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
  const missed = template === missedDeliveryTemplate;
  const audience = missed ? 'customer' : 'seller';
  const subject = missed ? 'Delivery missed' : 'Courier pickup booked';
  const body = missed
    ? 'The courier recorded a missed delivery. Open your order for the next update.'
    : 'The courier pickup is booked. Have the packed parcel ready at your pickup address.';
  const source = sourceSql(template) + ' AND e.id=?';
  const statements: D1PreparedStatement[] = [];
  for (const channel of ['email', 'in_app']) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,
      template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key)
      SELECT ?,u.id,?,?,?,?,?,?,?,'order',source.orderId,'queued',?,?,?
      FROM (${source}) source JOIN users u ON u.id=source.ownerId WHERE u.status='active'`)
      .bind(crypto.randomUUID(), audience, channel, template, subject, subject, body, body,
        await operationalNotificationRequestId(template, eventId, 'owner', channel), now, template, orderId, eventId));
  }
  if (missed) {
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
  if (!template || !notice.relatedId || notice.audience !== (template === missedDeliveryTemplate ? 'customer' : 'seller')) return null;
  if (!notice.userId && (template !== missedDeliveryTemplate || notice.channel !== 'email')) return null;
  const rows = await db.prepare(sourceSql(template)).bind(notice.relatedId).all<Source>();
  for (const row of rows.results) {
    if (row.ownerId !== notice.userId) continue;
    if (notice.channel === 'email' && row.occurredAt <= now - orderEmailMaxAgeMs) continue;
    const expected = await operationalNotificationRequestId(template, row.marker, notice.userId ? 'owner' : 'guest', notice.channel);
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
