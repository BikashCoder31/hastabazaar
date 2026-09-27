import { getFormAnswerById, type StoredFormAnswer } from '../db/repositories/form-answers';

export type IdentityHistoryCursor = { createdAt: number; id: string };
export type IdentityHistoryPage = { answers: StoredFormAnswer[]; nextCursor: IdentityHistoryCursor | null };

export function readIdentityHistoryCursor(at?: string, id?: string): IdentityHistoryCursor | undefined {
  if (at === undefined && id === undefined) return undefined;
  if (!at || !id || !/^\d+$/.test(at)) throw new Error('Invalid identity history cursor.');
  const cursor = { createdAt: Number(at), id };
  validateCursor(cursor);
  return cursor;
}

function validId(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 191;
}

function validateCursor(cursor: IdentityHistoryCursor | undefined): void {
  if (cursor !== undefined && (!Number.isSafeInteger(cursor.createdAt) || cursor.createdAt < 0 ||
      !validId(cursor.id))) throw new Error('Invalid identity history cursor.');
}

async function page(db: D1Database, sql: string, bindings: readonly unknown[],
  cursor?: IdentityHistoryCursor): Promise<IdentityHistoryPage> {
  validateCursor(cursor);
  const rows = await db.prepare(sql).bind(...bindings,
    cursor?.createdAt ?? null, cursor?.createdAt ?? null,
    cursor?.createdAt ?? null, cursor?.id ?? null).all<{ id: string; createdAt: number }>();
  const selected = rows.results.slice(0, 50);
  const answers = await Promise.all(selected.map(async ({ id }) => {
    const answer = await getFormAnswerById(db, id);
    if (!answer) throw new Error('Identity history answer disappeared.');
    return answer;
  }));
  const last = selected.at(-1);
  return { answers, nextCursor: rows.results.length > 50 && last ?
    { createdAt: last.createdAt, id: last.id } : null };
}

const cursorPredicate = `(? IS NULL OR a.created_at > ? OR
  (a.created_at = ? AND a.id > ?)) ORDER BY a.created_at, a.id LIMIT 51`;

export async function listOwnedIdentityAnswersPage(db: D1Database, userId: string,
  cursor?: IdentityHistoryCursor): Promise<IdentityHistoryPage> {
  if (!validId(userId)) throw new Error('Invalid identity history user.');
  return page(db, `SELECT a.id, a.created_at AS createdAt FROM form_answer_sets a
    WHERE a.form_id IN ('identity.register','identity.login-password',
      'identity.email-code-verify','identity.password-reset-complete')
    AND a.subject_type='user' AND a.subject_id=? AND a.actor_id=?
    AND ${cursorPredicate}`, [userId, userId], cursor);
}

export async function listRestrictedIdentityRequestAnswersPage(db: D1Database,
  cursor?: IdentityHistoryCursor): Promise<IdentityHistoryPage> {
  return page(db, `SELECT a.id, a.created_at AS createdAt FROM form_answer_sets a
    WHERE a.form_id IN ('identity.email-code-request','identity.password-reset-request')
    AND a.subject_type='identity_request' AND a.subject_id=a.request_id
    AND a.actor_id IS NULL AND ${cursorPredicate}`, [], cursor);
}
