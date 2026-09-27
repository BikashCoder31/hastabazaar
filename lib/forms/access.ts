import type { StoredFormAnswer } from '../db/repositories/form-answers';
import { can, type Permission } from '../marketplace/permissions';

export type FormAnswerViewer = {
  id: string;
  role: 'customer' | 'seller' | 'rider' | 'admin' | 'super_admin';
  permissions?: readonly Permission[];
};

/** Ownership is derived from the parent record, never from the submitter ID. */
export async function formAnswerOwnerId(db: D1Database, answer: Pick<StoredFormAnswer, 'subjectType' | 'subjectId'>): Promise<string | null> {
  if (answer.subjectType === 'user') {
    const row = await db.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(answer.subjectId).first<{ id: string }>();
    return row?.id ?? null;
  }
  if (answer.subjectType === 'seller') {
    const row = await db.prepare('SELECT user_id AS userId FROM seller_profiles WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
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
  const ownerId = await formAnswerOwnerId(db, answerSet);
  if (!ownerId) return false;
  if (ownerId === viewer.id) return true;
  if (viewer.role !== 'admin' && viewer.role !== 'super_admin') return false;
  if (!can({ role: viewer.role, permissions: viewer.permissions }, 'support.manage')) return false;
  // Staff support authority is limited to a currently assigned case for
  // this exact owner. Other seller/rider records need their own adapter.
  if (answerSet.subjectType !== 'user' && answerSet.subjectType !== 'data_rights_request') return false;
  if (answerSet.subjectType === 'data_rights_request') {
    return Boolean(await db.prepare(`SELECT 1 AS valid FROM data_rights_requests
      WHERE id=? AND customer_id=? AND assigned_to=?
        AND status IN ('assigned','needs_information','approved') LIMIT 1`)
      .bind(answerSet.subjectId, ownerId, viewer.id).first<{ valid: number }>());
  }
  return Boolean(await db.prepare(`SELECT 1 AS valid FROM data_rights_requests
    WHERE customer_id=? AND assigned_to=? AND status IN ('assigned','needs_information','approved') LIMIT 1`)
    .bind(ownerId, viewer.id).first<{ valid: number }>());
}
