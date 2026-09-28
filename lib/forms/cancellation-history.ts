import { getFormAnswerById, type StoredFormAnswer } from '../db/repositories/form-answers';
import { authorizeFormAnswerRead } from './access';

function reference(value: string): string {
  if (!value || value.length > 191 || value.trim() !== value) throw new Error('Record reference is invalid.');
  return value;
}

function decodeCursor(raw?: string | null): { createdAt: number; id: string } | null {
  if (!raw) return null;
  if (raw.length > 256 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('History cursor is invalid.');
  try {
    const parsed: unknown = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    const value = parsed as Record<string, unknown>;
    if (!Number.isSafeInteger(value.createdAt) || Number(value.createdAt) < 0 ||
        typeof value.id !== 'string' || !value.id || value.id.length > 191) throw new Error();
    return { createdAt: Number(value.createdAt), id: value.id };
  } catch { throw new Error('History cursor is invalid.'); }
}

function encodeCursor(value: { createdAt: number; id: string }): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Signed-in current owners only; receipt tokens never authorize private answers. */
export async function listCustomerCancellationAnswers(db: D1Database, input: {
  customerId: string; orderId: string; after?: string | null;
}): Promise<{ items: StoredFormAnswer[]; nextCursor: string | null }> {
  const customerId = reference(input.customerId);
  const orderId = reference(input.orderId);
  const owner = await db.prepare(`SELECT 1 AS valid FROM orders o JOIN users u ON u.id=o.customer_id
    JOIN user_roles r ON r.user_id=u.id AND r.role='customer'
    WHERE o.id=? AND o.customer_id=? AND u.status='active' LIMIT 1`)
    .bind(orderId, customerId).first();
  if (!owner) return { items: [], nextCursor: null };
  const cursor = decodeCursor(input.after);
  const rows = await db.prepare(`SELECT a.id,a.created_at AS createdAt FROM form_answer_sets a
    WHERE a.form_id='commerce.order-cancellation' AND a.actor_id=? AND (
      (a.subject_type='order_cancellation_event' AND EXISTS(SELECT 1 FROM order_cancellation_events e
        WHERE e.id=a.subject_id AND e.order_id=?)) OR
      (a.subject_type='order_cancellation_review' AND EXISTS(SELECT 1 FROM order_cancellation_reviews review
        WHERE review.id=a.subject_id AND review.order_id=?)))
      AND (? IS NULL OR a.created_at<? OR (a.created_at=? AND a.id<?))
    ORDER BY a.created_at DESC,a.id DESC LIMIT 51`)
    .bind(customerId, orderId, orderId, cursor?.createdAt ?? null, cursor?.createdAt ?? 0,
      cursor?.createdAt ?? 0, cursor?.id ?? '').all<{ id: string; createdAt: number }>();
  const candidates = rows.results.slice(0, 50);
  const items: StoredFormAnswer[] = [];
  for (const candidate of candidates) {
    const answer = await getFormAnswerById(db, candidate.id);
    if (answer && await authorizeFormAnswerRead(db, { id: customerId, role: 'customer' }, answer)) items.push(answer);
  }
  return { items, nextCursor: rows.results.length > 50 && candidates.length
    ? encodeCursor(candidates[candidates.length - 1]) : null };
}
