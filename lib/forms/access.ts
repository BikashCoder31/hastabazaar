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
  if (answer.subjectType === 'rider') {
    const row = await db.prepare('SELECT user_id AS userId FROM rider_profiles WHERE user_id=? LIMIT 1')
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
