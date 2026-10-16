import { assertFirstCodFulfillmentAllowed } from '../orders/first-cod-review';
import {
  parseLocation,
  safeCourierUrl,
  type DeliveryLocation,
} from './validation';
import { buildFormAnswerInsert } from '../db/repositories/form-answers';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import type { FormAnswerSnapshot } from '../forms/types';
export class DeliveryError extends Error {}
function deliveryGuard(db: D1Database, predicate: string, values: unknown[]) {
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
export interface DeliveryInfo {
  method: string;
  courierName: string | null;
  trackingUrl: string | null;
  trackingReference: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  positionAt: number | null;
  orderStatus: string;
}
/** Safe order tracking for customer, seller and non-Super Admin responses. */
export function publicDelivery(delivery: DeliveryInfo | null): DeliveryInfo | null {
  if (!delivery) return null;
  const courier = delivery.method === 'courier';
  return {
    method: delivery.method === 'own_rider' ? 'delivery' : delivery.method,
    courierName: courier ? delivery.courierName : null,
    trackingUrl: courier ? delivery.trackingUrl : null,
    trackingReference: courier ? delivery.trackingReference : null,
    latitude: null, longitude: null, accuracy: null, positionAt: null,
    orderStatus: delivery.orderStatus,
  };
}
export async function getDelivery(
  db: D1Database,
  orderId: string,
  now = Date.now(),
): Promise<DeliveryInfo | null> {
  const d = await db
    .prepare(
      `SELECT d.method,d.courier_name AS courierName,d.tracking_url AS trackingUrl,COALESCE(s.tracking_code,d.tracking_reference) AS trackingReference,d.latitude,d.longitude,d.accuracy,d.position_at AS positionAt,o.status AS orderStatus FROM delivery_assignments d JOIN orders o ON o.id=d.order_id LEFT JOIN shipments s ON s.order_id=o.id WHERE d.order_id=?`,
    )
    .bind(orderId)
    .first<DeliveryInfo>();
  if (
    d &&
    (d.orderStatus !== 'dispatched' ||
      d.method !== 'own_rider' ||
      !d.positionAt ||
      now - d.positionAt > 120000)
  ) {
    d.latitude = null;
    d.longitude = null;
    d.accuracy = null;
  }
  return d;
}
export async function assignDelivery(
  db: D1Database,
  o: {
    orderId: string;
    actorId: string;
    method: string;
    riderEmail?: string;
    courierName?: string;
    trackingUrl?: string;
    trackingReference?: string;
    now: number;
    requestId?: string;
    form?: {
      requestId: string;
      versionId: string;
      answers: FormAnswerSnapshot;
      digest: string;
    };
  },
) {
  const authority = o.form
    ? await staffMutationGuard(db, o.actorId, 'order.manage', DeliveryError)
    : null;
  const privateAuthoritySql = "EXISTS(SELECT 1 FROM users privacy_user JOIN user_roles privacy_role ON privacy_role.user_id=privacy_user.id WHERE privacy_user.id=? AND privacy_user.status='active' AND privacy_role.role='super_admin') OR NOT EXISTS(SELECT 1 FROM delivery_assignments private_delivery WHERE private_delivery.order_id=? AND (private_delivery.method='own_rider' OR private_delivery.rider_user_id IS NOT NULL))";
  const privateAuthorityValues = [o.actorId, o.orderId];
  if (!await db.prepare('SELECT 1 WHERE ' + privateAuthoritySql).bind(...privateAuthorityValues).first())
    throw new DeliveryError('Super Admin access is required.');
  await assertFirstCodFulfillmentAllowed(db, o.orderId, DeliveryError);
  if (o.form) {
    if (!o.requestId || o.requestId !== o.form.requestId)
      throw new DeliveryError('Assignment request reference is invalid.');
    const rows = await db
      .prepare(`SELECT actor_id AS actorId,subject_id AS subjectId,next_json AS nextJson
    FROM audit_logs WHERE request_id=? AND action='delivery.assigned.configured' LIMIT 2`)
      .bind(`delivery.assignment:${o.requestId}`)
      .all<{ actorId: string; subjectId: string; nextJson: string | null }>();
    if (rows.results.length) {
      const answer = await db
        .prepare(`SELECT subject_id AS subjectId,actor_id AS actorId,
     config_version_id AS versionId FROM form_answer_sets
     WHERE form_id='staff.delivery-assignment' AND request_id=? LIMIT 1`)
        .bind(o.requestId)
        .first<{ subjectId: string; actorId: string; versionId: string }>();
      let digest: unknown;
      try {
        digest =
          rows.results.length === 1 &&
          JSON.parse(rows.results[0].nextJson ?? '').catalogDigest;
      } catch {
        /* Invalid history cannot authorize replay. */
      }
      if (
        rows.results.length !== 1 ||
        rows.results[0].actorId !== o.actorId ||
        rows.results[0].subjectId !== o.orderId ||
        answer?.subjectId !== o.orderId ||
        answer.actorId !== o.actorId ||
        answer.versionId !== o.form.versionId ||
        digest !== o.form.digest
      )
        throw new DeliveryError(
          'Assignment request reference was already used for different details.',
        );
      return;
    }
  }
  if (
    await db
      .prepare(
        'SELECT p.shipping_job_id FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=? LIMIT 1',
      )
      .bind(o.orderId)
      .first()
  )
    throw new DeliveryError('Assign riders or couriers to each seller parcel.');
  if (!['own_rider', 'courier'].includes(o.method))
    throw new DeliveryError('Select own rider or courier.');
  const order = await db
    .prepare(
      "SELECT id FROM orders WHERE id=? AND status IN ('confirmed','packing','ready_for_pickup','dispatched')",
    )
    .bind(o.orderId)
    .first();
  if (!order) throw new DeliveryError('This order cannot be assigned now.');
  let riderId: string | null = null;
  if (o.method === 'own_rider')
    throw new DeliveryError(
      'Prepare seller parcels and assign a Super Admin-approved rider there. Historical records remain available to staff.',
    );
  if (o.method === 'own_rider') {
    const rider = await db
      .prepare("SELECT id FROM users WHERE lower(email)=? AND status='active'")
      .bind((o.riderEmail ?? '').trim().toLowerCase())
      .first<{ id: string }>();
    if (!rider)
      throw new DeliveryError(
        'The rider must first register an active account with this email.',
      );
    riderId = rider.id;
  }
  const courier = (o.courierName ?? '').trim();
  const reference = (o.trackingReference ?? '').trim();
  let url = '';
  try {
    url = safeCourierUrl(o.trackingUrl ?? '');
  } catch {
    throw new DeliveryError('Enter a public HTTPS courier tracking link.');
  }
  if (
    o.method === 'courier' &&
    (courier.length < 2 ||
      courier.length > 120 ||
      reference.length < 2 ||
      reference.length > 80)
  )
    throw new DeliveryError('Enter the courier name and tracking reference.');
  const checks = o.form
    ? deliveryGuard(
        db,
        `NOT EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j
     ON j.id=p.shipping_job_id WHERE j.order_id=?) AND EXISTS(SELECT 1 FROM orders
     WHERE id=? AND status IN ('confirmed','packing','ready_for_pickup','dispatched'))
     AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)`,
        [o.orderId, o.orderId, `delivery.assignment:${o.requestId}`],
      )
    : [];
  const results = await db.batch([
    ...(authority?.statements ?? []),
    ...checks,
    ...deliveryGuard(db, '(' + privateAuthoritySql + ')', privateAuthorityValues),
    db
      .prepare(
        "DELETE FROM delivery_assignments WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status IN ('confirmed','packing','ready_for_pickup','dispatched'))",
      )
      .bind(o.orderId, o.orderId),
    db
      .prepare(
        `INSERT INTO delivery_assignments(order_id,method,rider_user_id,courier_name,tracking_url,tracking_reference,assigned_by,updated_at) SELECT id,?,?,?,?,?,?,? FROM orders WHERE id=? AND status IN ('confirmed','packing','ready_for_pickup','dispatched')`,
      )
      .bind(
        o.method,
        riderId,
        o.method === 'courier' ? courier : null,
        o.method === 'courier' ? url || null : null,
        o.method === 'courier' ? reference : null,
        o.actorId,
        o.now,
        o.orderId,
      ),
    db
      .prepare(
        "UPDATE shipments SET tracking_code=? WHERE order_id=? AND ?='courier' AND EXISTS(SELECT 1 FROM delivery_assignments WHERE order_id=? AND updated_at=?)",
      )
      .bind(reference, o.orderId, o.method, o.orderId, o.now),
    db
      .prepare(
        `INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at) SELECT ?,?,'delivery.assigned','order',?,'Delivery assignment changed',?,? WHERE EXISTS(SELECT 1 FROM delivery_assignments WHERE order_id=? AND updated_at=?)`,
      )
      .bind(
        crypto.randomUUID(),
        o.actorId,
        o.orderId,
        JSON.stringify({ method: o.method, riderId }),
        o.now,
        o.orderId,
        o.now,
      ),
    ...(o.form
      ? [
          buildFormAnswerInsert(db, {
            formId: 'staff.delivery-assignment',
            requestId: o.requestId!,
            versionId: o.form.versionId,
            subjectType: 'order',
            subjectId: o.orderId,
            actorId: o.actorId,
            answers: o.form.answers,
            now: o.now,
          }),
          db
            .prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
     VALUES (?,?,'delivery.assigned.configured','order',?,'Configured delivery assignment',?,?,?)`)
            .bind(
              crypto.randomUUID(),
              o.actorId,
              o.orderId,
              JSON.stringify({ catalogDigest: o.form.digest }),
              `delivery.assignment:${o.requestId}`,
              o.now,
            ),
          ...deliveryGuard(
            db,
            `EXISTS(SELECT 1 FROM delivery_assignments
     WHERE order_id=? AND assigned_by=? AND updated_at=?)`,
            [o.orderId, o.actorId, o.now],
          ),
        ]
      : []),
  ]);
  if (
    results[(authority?.statements.length ?? 0) + checks.length + 3].meta
      .changes !== 1
  )
    throw new DeliveryError('Order changed. Refresh and try again.');
}
export async function updateRiderLocation(
  db: D1Database,
  orderId: string,
  userId: string,
  value: unknown,
  now: number,
) {
  let p: DeliveryLocation | undefined;
  try {
    p = value === null ? undefined : parseLocation(value);
  } catch {
    throw new DeliveryError('Invalid location.');
  }
  if (value !== null && !p) throw new DeliveryError('Location required.');
  const r = await db
    .prepare(
      `UPDATE delivery_assignments SET latitude=?,longitude=?,accuracy=?,position_at=? WHERE order_id=? AND rider_user_id=? AND method='own_rider' AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='dispatched') AND EXISTS(SELECT 1 FROM rider_profiles rp JOIN users ru ON ru.id=rp.user_id WHERE rp.user_id=rider_user_id AND rp.status='approved' AND ru.status='active')`,
    )
    .bind(
      p?.latitude ?? null,
      p?.longitude ?? null,
      p?.accuracy ?? null,
      p ? now : null,
      orderId,
      userId,
      orderId,
    )
    .run();
  if (r.meta.changes !== 1)
    throw new DeliveryError(
      'Sharing is unavailable. The order must be dispatched and assigned to you.',
    );
}
export async function riderJobs(db: D1Database, userId: string) {
  return (
    await db
      .prepare(
        `SELECT o.id,o.order_number AS orderNumber,o.status,o.shipping_address_json AS addressJson FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.rider_user_id=? AND EXISTS(SELECT 1 FROM rider_profiles rp JOIN users ru ON ru.id=rp.user_id WHERE rp.user_id=d.rider_user_id AND rp.status='approved' AND ru.status='active') AND d.method='own_rider' AND o.status IN ('confirmed','packing','ready_for_pickup','dispatched') ORDER BY o.created_at DESC`,
      )
      .bind(userId)
      .all<{
        id: string;
        orderNumber: string;
        status: string;
        addressJson: string;
      }>()
  ).results;
}
