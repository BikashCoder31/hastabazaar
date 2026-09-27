import type { StoredFormAnswer } from '../db/repositories/form-answers';
import { configurableAdminPermissions, type Permission } from '../marketplace/permissions';

export type FormAnswerViewer = {
  id: string;
  role: 'customer' | 'seller' | 'rider' | 'admin' | 'super_admin';
  /** A caller snapshot is not authority for another person's private answers. */
  permissions?: readonly Permission[];
};

/** Ownership is derived from the parent record, never from the submitter ID. */
export async function formAnswerOwnerId(db: D1Database, answer: Pick<StoredFormAnswer, 'subjectType' | 'subjectId'>): Promise<string | null> {
  if (answer.subjectType === 'user') {
    const row = await db.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(answer.subjectId).first<{ id: string }>();
    return row?.id ?? null;
  }
  if (answer.subjectType === 'address') {
    const row = await db.prepare('SELECT user_id AS userId FROM addresses WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    if (row) return row.userId;
    const deleted = await db.prepare(`SELECT user_id AS userId FROM address_answer_owner_tombstones
      WHERE address_id=? LIMIT 1`).bind(answer.subjectId).first<{ userId: string }>();
    return deleted?.userId ?? null;
  }
  if (answer.subjectType === 'product_review') {
    const row = await db.prepare('SELECT customer_id AS userId FROM product_reviews WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'seller') {
    const row = await db.prepare('SELECT user_id AS userId FROM seller_profiles WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'product') {
    const row = await db.prepare(`SELECT seller_profiles.user_id AS userId FROM products
      INNER JOIN seller_profiles ON seller_profiles.id=products.seller_id
      WHERE products.id=? LIMIT 1`).bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'shipping_job' || answer.subjectType === 'shipping_job_event') {
    const join = answer.subjectType === 'shipping_job_event'
      ? 'JOIN shipping_job_events e ON e.shipping_job_id=j.id AND e.id=?'
      : '';
    const where = answer.subjectType === 'shipping_job' ? 'j.id=?' : '1=1';
    const row = await db.prepare(`SELECT s.user_id AS userId FROM shipping_jobs j ${join}
      JOIN seller_profiles s ON s.id=j.seller_id WHERE ${where} AND s.status='approved' LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'payout_request') {
    const row = await db.prepare(`SELECT s.user_id AS userId FROM payout_requests p
      JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=? AND s.status='approved' LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'review_reply') {
    const row = await db.prepare(`SELECT s.user_id AS userId FROM review_replies reply
      JOIN product_reviews review ON review.id=reply.review_id JOIN products p ON p.id=review.product_id
      JOIN seller_profiles s ON s.id=p.seller_id WHERE reply.id=? AND reply.seller_id=s.id
        AND s.status='approved' LIMIT 1`).bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'managed_supply') {
    const row = await db.prepare(`SELECT s.user_id AS userId FROM managed_supply_records supply
      JOIN seller_profiles s ON s.id=supply.seller_id WHERE supply.id=? AND s.status='approved' LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'seller_route_transition') {
    const row = await db.prepare(`SELECT s.user_id AS userId FROM seller_route_transition_applications transition
      JOIN seller_profiles s ON s.id=transition.seller_id WHERE transition.id=? AND s.status='approved' LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'rider') {
    const row = await db.prepare('SELECT user_id AS userId FROM rider_profiles WHERE user_id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'rider_application') {
    const row = await db.prepare('SELECT user_id AS userId FROM rider_applications WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'rider_report') {
    const row = await db.prepare('SELECT rider_user_id AS userId FROM rider_reports WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'parcel_cash_record') {
    const row = await db.prepare('SELECT rider_user_id AS userId FROM parcel_cash_records WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'rider_event') {
    const row = await db.prepare('SELECT user_id AS userId FROM rider_events WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'data_rights_request') {
    const row = await db.prepare('SELECT customer_id AS userId FROM data_rights_requests WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  return null;
}

const riderShippingSubjects = new Map([
  ['rider.application', 'rider_application'],
  ['rider.report', 'rider_report'],
  ['rider.remittance', 'parcel_cash_record'],
  ['rider.code-verify', 'rider_event'],
  ['staff.delivery-assignment', 'order'],
  ['shipping.console-request', 'shipping_job'],
  ['shipping.console-action-seller', 'shipping_job_event'],
  ['shipping.console-action-staff', 'shipping_job_event'],
]);

async function currentStaffGrant(db: D1Database, viewer: FormAnswerViewer,
  permission: Permission | null): Promise<boolean> {
  if (viewer.role !== 'admin' && viewer.role !== 'super_admin') return false;
  if (viewer.role === 'super_admin') return true;
  if (!permission) return false;
  const safePermissions = `CASE WHEN json_valid(p.permissions_json) THEN p.permissions_json ELSE '[]' END`;
  return Boolean(await db.prepare(`SELECT 1 AS valid FROM users u JOIN user_roles r ON r.user_id=u.id
    LEFT JOIN staff_permission_profiles p ON p.user_id=u.id
    WHERE u.id=? AND u.status='active' AND r.role='admin'
      AND (p.user_id IS NULL OR (json_type(${safePermissions})='array'
        AND EXISTS(SELECT 1 FROM json_each(${safePermissions}) item
          WHERE item.type='text' AND item.value=?)
        AND NOT EXISTS(SELECT 1 FROM json_each(${safePermissions}) item
          WHERE item.type<>'text' OR item.value NOT IN (SELECT value FROM json_each(?)))))
    LIMIT 1`).bind(viewer.id, permission, JSON.stringify(configurableAdminPermissions))
    .first<{ valid: number }>());
}

export async function authorizeFormAnswerRead(
  db: D1Database,
  viewer: FormAnswerViewer,
  answerSet: StoredFormAnswer,
): Promise<boolean> {
  if (!viewer.id || !['customer', 'seller', 'rider', 'admin', 'super_admin'].includes(viewer.role)) return false;
  const identity = await db.prepare(`SELECT 1 AS valid FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE u.id=? AND u.status='active' AND r.role=? LIMIT 1`)
    .bind(viewer.id, viewer.role).first<{ valid: number }>();
  if (!identity) return false;
  const expectedSubject = riderShippingSubjects.get(answerSet.formId);
  if (expectedSubject && answerSet.subjectType !== expectedSubject) return false;
  if (answerSet.formId === 'staff.delivery-assignment') {
    const parent = await db.prepare(`SELECT 1 AS valid FROM orders o JOIN audit_logs audit
      ON audit.subject_type='order' AND audit.subject_id=o.id
        AND audit.actor_id=? AND audit.action='delivery.assigned.configured'
        AND audit.request_id=?
      WHERE o.id=? LIMIT 1`)
      .bind(answerSet.actorId, `delivery.assignment:${answerSet.requestId}`, answerSet.subjectId)
      .first<{ valid: number }>();
    return Boolean(parent) && currentStaffGrant(db, viewer, 'order.manage');
  }
  if (answerSet.formId === 'shipping.console-action-staff') {
    const parent = await db.prepare(`SELECT 1 AS valid FROM shipping_job_events event
      JOIN shipping_jobs job ON job.id=event.shipping_job_id
      WHERE event.id=? AND event.request_id=? AND event.actor_id=?
        AND event.actor_role IN ('admin','super_admin') LIMIT 1`)
      .bind(answerSet.subjectId, answerSet.requestId, answerSet.actorId)
      .first<{ valid: number }>();
    return Boolean(parent) && currentStaffGrant(db, viewer, 'order.manage');
  }
  if (answerSet.subjectType === 'feedback_submission') {
    if (viewer.role !== 'admin' && viewer.role !== 'super_admin') return false;
    const safePermissions = `CASE WHEN json_valid(p.permissions_json) THEN p.permissions_json ELSE '[]' END`;
    return Boolean(await db.prepare(`SELECT 1 AS valid FROM users u
      JOIN user_roles r ON r.user_id=u.id
      LEFT JOIN staff_permission_profiles p ON p.user_id=u.id
      JOIN feedback_delivery_jobs job ON job.id=? AND job.form_id=? AND job.request_id=?
        AND job.status IN ('pending','leased','sending','failed','sent')
      JOIN form_answer_sets answer ON answer.id=? AND answer.subject_type='feedback_submission'
        AND answer.subject_id=job.id AND answer.form_id=job.form_id
        AND answer.request_id=job.request_id
      WHERE u.id=? AND u.status='active' AND r.role=?
        AND (r.role='super_admin' OR p.user_id IS NULL OR (
          json_type(${safePermissions})='array'
          AND EXISTS(SELECT 1 FROM json_each(${safePermissions}) grant_item
            WHERE grant_item.type='text' AND grant_item.value='support.manage')
          AND NOT EXISTS(SELECT 1 FROM json_each(${safePermissions}) grant_item
            WHERE grant_item.type<>'text' OR grant_item.value NOT IN
              (SELECT value FROM json_each(?)))))
      LIMIT 1`)
      .bind(answerSet.subjectId, answerSet.formId, answerSet.requestId, answerSet.id,
        viewer.id, viewer.role, JSON.stringify(configurableAdminPermissions)).first<{ valid: number }>());
  }
  const ownerId = await formAnswerOwnerId(db, answerSet);
  if (!ownerId) return false;
  if (ownerId === viewer.id) return true;
  if (answerSet.formId === 'rider.application')
    return currentStaffGrant(db, viewer, null);
  if (answerSet.formId === 'rider.report' || answerSet.formId === 'rider.code-verify')
    return currentStaffGrant(db, viewer, 'order.manage');
  if (answerSet.formId === 'rider.remittance')
    return currentStaffGrant(db, viewer, 'payout.prepare');
  if (viewer.role !== 'admin' && viewer.role !== 'super_admin') return false;
  if (answerSet.subjectType === 'product_review') {
    const safeReviewPermissions = `CASE WHEN json_valid(p.permissions_json) THEN p.permissions_json ELSE '[]' END`;
    return Boolean(await db.prepare(`SELECT 1 AS valid FROM users u
      JOIN user_roles r ON r.user_id=u.id
      LEFT JOIN staff_permission_profiles p ON p.user_id=u.id
      JOIN product_reviews review ON review.id=? AND review.customer_id=?
      WHERE u.id=? AND u.status='active' AND r.role=?
        AND (r.role='super_admin' OR p.user_id IS NULL OR (
          json_type(${safeReviewPermissions})='array'
          AND EXISTS(SELECT 1 FROM json_each(${safeReviewPermissions}) grant_item
            WHERE grant_item.type='text' AND grant_item.value='product.review')
          AND NOT EXISTS(SELECT 1 FROM json_each(${safeReviewPermissions}) grant_item
            WHERE grant_item.type<>'text' OR grant_item.value NOT IN
              (SELECT value FROM json_each(?)))))
      LIMIT 1`)
      .bind(answerSet.subjectId, ownerId, viewer.id, viewer.role,
        JSON.stringify(configurableAdminPermissions)).first<{ valid: number }>());
  }
  // Staff support authority is limited to a currently assigned case for
  // this exact owner. Other seller/rider records need their own adapter.
  if (answerSet.subjectType !== 'user' && answerSet.subjectType !== 'data_rights_request') return false;
  // One final statement checks active identity, the current persisted grant,
  // and assignment together. Missing Admin profiles retain legacy access;
  // malformed or non-allowlisted profiles fail closed.
  const safePermissions = `CASE WHEN json_valid(p.permissions_json) THEN p.permissions_json ELSE '[]' END`;
  const caseFilter = answerSet.subjectType === 'data_rights_request'
    ? 'd.id=? AND d.customer_id=?'
    : 'd.customer_id=?';
  const caseBindings = answerSet.subjectType === 'data_rights_request'
    ? [answerSet.subjectId, ownerId]
    : [ownerId];
  return Boolean(await db.prepare(`SELECT 1 AS valid FROM users u
    JOIN user_roles r ON r.user_id=u.id
    LEFT JOIN staff_permission_profiles p ON p.user_id=u.id
    WHERE u.id=? AND u.status='active' AND r.role=?
      AND (r.role='super_admin' OR p.user_id IS NULL OR (
        json_type(${safePermissions})='array'
        AND EXISTS(SELECT 1 FROM json_each(${safePermissions}) grant_item
          WHERE grant_item.type='text' AND grant_item.value='support.manage')
        AND NOT EXISTS(SELECT 1 FROM json_each(${safePermissions}) grant_item
          WHERE grant_item.type<>'text' OR grant_item.value NOT IN
            (SELECT value FROM json_each(?)))))
      AND EXISTS(SELECT 1 FROM data_rights_requests d
        WHERE ${caseFilter} AND d.assigned_to=u.id
          AND d.status IN ('assigned','needs_information','approved'))
    LIMIT 1`)
    .bind(viewer.id, viewer.role, JSON.stringify(configurableAdminPermissions), ...caseBindings)
    .first<{ valid: number }>());
}
