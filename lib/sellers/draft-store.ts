import { validWard, wardNumberError } from '@/lib/checkout/nepal-address';
import { draftLifetimeMs, draftFileNames, SellerDraftError, type SellerDraft, type DraftSave, type DraftFile } from './draft-contract';

type DraftRow = { revision: string; attemptId: string; formVersion: number; answersJson: string; filesJson: string; updatedAt: number; expiresAt: number };
const select = `SELECT revision,attempt_id AS attemptId,form_version AS formVersion,answers_json AS answersJson,
  files_json AS filesJson,updated_at AS updatedAt,expires_at AS expiresAt FROM seller_application_drafts`;
const conflict = () => new SellerDraftError('This draft changed in another tab or device. Reload to review the saved draft before making more changes.', 409);
const draftOwner = `EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.status='active'
  AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller'))
  AND (EXISTS(SELECT 1 FROM seller_profiles WHERE user_id=u.id) OR EXISTS(SELECT 1 FROM audit_logs
    WHERE actor_id=u.id AND subject_type='user' AND subject_id=u.id AND action='seller.registration.started')))`;
function decode(row: DraftRow): SellerDraft {
  return { revision: row.revision, attemptId: row.attemptId, formVersion: row.formVersion,
    answers: JSON.parse(row.answersJson), files: JSON.parse(row.filesJson), updatedAt: row.updatedAt, expiresAt: row.expiresAt };
}
export async function readSellerDraft(db: D1Database, userId: string, now = Date.now()): Promise<SellerDraft | null> {
  const row = await db.prepare(`${select} WHERE user_id=? AND expires_at>?`).bind(userId, now).first<DraftRow>();
  return row ? decode(row) : null;
}
function guard(db: D1Database, predicate: string, values: (string | number)[]) {
  const id = crypto.randomUUID();
  return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id, ...values),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}

/** Files have already passed the same content validators as final applications. */
export async function saveSellerDraft(db: D1Database, bucket: R2Bucket, userId: string, input: DraftSave,
  uploads: Record<string, File>, now = Date.now()): Promise<SellerDraft> {
  if (!await db.prepare(`SELECT 1 WHERE ${draftOwner}`).bind(userId).first()) throw new SellerDraftError('Current registration access is required to save progress.', 403);
  const previous = await readSellerDraft(db, userId, now);
  if (previous?.revision === input.changeId) return previous; // Recover a lost response without writing again.
  if ((previous?.revision ?? null) !== input.revision) throw conflict();
  const ward = input.answers.ward;
  if (ward && (ward.length !== 1 || !validWard(ward[0].trim()))) throw new SellerDraftError(wardNumberError);
  const files: Record<string, DraftFile> = {};
  for (const [field, id] of Object.entries(input.files)) {
    if (!draftFileNames.has(field) || previous?.files[field]?.id !== id) throw new SellerDraftError('Saved file is unavailable.');
    files[field] = previous.files[field];
  }
  const expiresAt = now + draftLifetimeMs;
  // Every attempted upload has a ledger entry BEFORE bytes are written. Failed
  // writes and lost commit responses remain eligible for bounded expiry cleanup.
  for (const [field, file] of Object.entries(uploads)) {
    if (!draftFileNames.has(field)) throw new SellerDraftError('Invalid draft file.');
    const id = crypto.randomUUID();
    const key = `private/seller-drafts/${userId}/${id}`;
    await db.prepare(`INSERT INTO seller_application_draft_uploads(id,user_id,object_key,status,expires_at) VALUES (?,?,?,'uploading',?)`)
      .bind(id, userId, key, expiresAt).run();
    await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await db.prepare(`UPDATE seller_application_draft_uploads SET status='ready' WHERE id=? AND user_id=? AND status='uploading'`)
      .bind(id, userId).run();
    files[field] = { id, name: file.name.slice(0, 180), type: file.type, size: file.size };
  }
  const row: SellerDraft = { revision: input.changeId, attemptId: input.attemptId, formVersion: input.formVersion,
    answers: input.answers, files, updatedAt: now, expiresAt };
  const statements: D1PreparedStatement[] = [...guard(db, draftOwner, [userId])];
  if (previous) {
    statements.push(db.prepare(`UPDATE seller_application_drafts SET revision=?,attempt_id=?,form_version=?,answers_json=?,files_json=?,updated_at=?,expires_at=?
      WHERE user_id=? AND revision=? AND expires_at>?`).bind(row.revision, row.attemptId, row.formVersion, JSON.stringify(row.answers), JSON.stringify(files), now, expiresAt, userId, input.revision, now));
  } else {
    statements.push(db.prepare('DELETE FROM seller_application_drafts WHERE user_id=? AND expires_at<=?').bind(userId, now),
      db.prepare(`INSERT INTO seller_application_drafts(user_id,revision,attempt_id,form_version,answers_json,files_json,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(userId, row.revision, row.attemptId, row.formVersion, JSON.stringify(row.answers), JSON.stringify(files), now, expiresAt));
  }
  statements.push(...guard(db, 'EXISTS(SELECT 1 FROM seller_application_drafts WHERE user_id=? AND revision=?)', [userId, row.revision]));
  for (const file of Object.values(files)) {
    // The write takes the upload lock before checking it, preventing cleanup
    // from claiming an expired object concurrently with a successful renewal.
    statements.push(db.prepare(`UPDATE seller_application_draft_uploads SET expires_at=? WHERE id=? AND user_id=? AND status='ready' AND expires_at>?`)
      .bind(expiresAt, file.id, userId, now));
    statements.push(...guard(db, `EXISTS(SELECT 1 FROM seller_application_draft_uploads WHERE id=? AND user_id=? AND status='ready' AND expires_at=?)`, [file.id, userId, expiresAt]));
  }
  for (const file of Object.values(previous?.files ?? {})) {
    if (!Object.values(files).some(current => current.id === file.id)) statements.push(db.prepare('UPDATE seller_application_draft_uploads SET expires_at=? WHERE id=? AND user_id=?')
      .bind(now, file.id, userId));
  }
  try { await db.batch(statements); }
  catch (error) {
    const current = await readSellerDraft(db, userId, now);
    if (current?.revision === row.revision) return current;
    if ((current?.revision ?? null) !== input.revision) throw conflict();
    throw error;
  }
  return row;
}

export async function deleteSellerDraft(db: D1Database, userId: string, revision: string) {
  const result = await db.prepare(`DELETE FROM seller_application_drafts WHERE user_id=? AND revision=? AND ${draftOwner}`).bind(userId, revision, userId).run();
  if (Number(result.meta.changes) !== 1) throw conflict();
  // Ledger entries are retained for expiry cleanup even if deletion is interrupted.
}

export async function readSellerDraftFile(db: D1Database, userId: string, id: string, now = Date.now()) {
  const draft = await readSellerDraft(db, userId, now);
  const file = Object.values(draft?.files ?? {}).find(value => value.id === id);
  if (!file) throw new SellerDraftError('Saved file is unavailable.', 404);
  const row = await db.prepare(`SELECT object_key AS objectKey FROM seller_application_draft_uploads WHERE id=? AND user_id=? AND status='ready' AND expires_at>?`)
    .bind(id, userId, now).first<{ objectKey: string }>();
  if (!row) throw new SellerDraftError('Saved file is unavailable.', 404);
  return { ...file, objectKey: row.objectKey };
}

/** Re-runnable: a failed object delete keeps its ledger entry for the next run. */
export async function cleanupSellerDrafts(db: D1Database, bucket: R2Bucket, now = Date.now()) {
  await db.prepare('DELETE FROM seller_application_drafts WHERE expires_at<=?').bind(now).run();
  const rows = await db.prepare(`SELECT id,object_key AS objectKey FROM seller_application_draft_uploads WHERE expires_at<=? ORDER BY expires_at LIMIT 20`)
    .bind(now).all<{ id: string; objectKey: string }>();
  let deleted = 0;
  for (const row of rows.results) {
    const claim = await db.prepare(`UPDATE seller_application_draft_uploads SET status='deleting' WHERE id=? AND expires_at<=?`).bind(row.id, now).run();
    if (!Number(claim.meta.changes)) continue;
    await bucket.delete(row.objectKey);
    await db.prepare(`DELETE FROM seller_application_draft_uploads WHERE id=? AND status='deleting'`).bind(row.id).run();
    deleted++;
  }
  return deleted;
}
