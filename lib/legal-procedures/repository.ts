import { bundledLegalDraft, legacyLegalProcedure } from './content';
export { getLegalProcedureControl, getLegalProcedureEvent, changeLegalProcedureControl } from './lifecycle';
import { LegalDraftAccessError, LegalDraftConflictError, LegalDraftStoreError, legalSnapshotHash,
  legalRevisionId, validateLegalDraftInput, validateStoredLegalDraft,
  type LegalDraftActor, type LegalDraftInput, type LegalDraftSnapshot, type LegalDraftWorkspace } from './model';

const action = 'legal_procedure.draft_saved';
const scope = "action='legal_procedure.draft_saved' AND subject_type='internal_legal_procedure' AND subject_id='internal-compliance'";
type Row = { id: string; actorId: string | null; reason: string; nextJson: string; previousJson: string;
  requestId: string; createdAt: number };
const columns = 'id,actor_id AS actorId,reason,next_json AS nextJson,previous_json AS previousJson,request_id AS requestId,created_at AS createdAt';

async function parseRow(row: Row) {
  try {
    const snapshot = await validateStoredLegalDraft(JSON.parse(row.nextJson));
    if (snapshot.id !== row.id || snapshot.revision < 1 || snapshot.actorId !== row.actorId ||
      snapshot.savedAt !== row.createdAt || snapshot.reason !== row.reason) throw new Error('Attribution');
    const previous = await validateStoredLegalDraft(JSON.parse(row.previousJson));
    if (previous.revision !== snapshot.previousRevision || previous.sha256 !== snapshot.previousSha256) throw new Error('Parent');
    return snapshot;
  } catch { throw new LegalDraftStoreError('Stored legal draft is unavailable or its fingerprint is invalid.'); }
}
async function latest(db: D1Database): Promise<LegalDraftSnapshot> {
  const row = await db.prepare(`SELECT ${columns} FROM audit_logs WHERE ${scope}
    ORDER BY length(id) DESC,id DESC LIMIT 1`).first<Row>();
  return row ? parseRow(row) : bundledLegalDraft();
}
export async function getLegalDraftRevision(db: D1Database, revision: number): Promise<LegalDraftSnapshot | null> {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > 1_000_000) return null;
  // Capture the source draft in the first save; later source edits cannot rewrite its history.
  if (revision === 0) {
    const first = await db.prepare(`SELECT ${columns} FROM audit_logs WHERE ${scope} AND id=?`)
      .bind(legalRevisionId(1)).first<Row>();
    if (!first) return bundledLegalDraft();
    await parseRow(first);
    return validateStoredLegalDraft(JSON.parse(first.previousJson));
  }
  const row = await db.prepare(`SELECT ${columns} FROM audit_logs WHERE ${scope} AND id=?`)
    .bind(legalRevisionId(revision)).first<Row>();
  return row ? parseRow(row) : null;
}
export async function getLegalDraftWorkspace(db: D1Database, beforeRevision = 1_000_001): Promise<LegalDraftWorkspace> {
  const [current, rows, legacy] = await Promise.all([latest(db),
    db.prepare(`SELECT ${columns} FROM audit_logs WHERE ${scope}
      AND CAST(json_extract(next_json,'$.revision') AS INTEGER) < ?
      ORDER BY length(id) DESC,id DESC LIMIT 21`).bind(beforeRevision).all<Row>(), legacyLegalProcedure()]);
  const snapshots = await Promise.all(rows.results.map(parseRow));
  const history = snapshots.slice(0, 20).map(({ id, revision, actorName, savedAt, reason, sha256 }) =>
    ({ id, revision, actorName, savedAt, reason, sha256 }));
  return { current, legacy, history, nextBeforeRevision: snapshots.length > 20 ? history[19].revision : null };
}
export async function assertLegalDraftActor(db: D1Database, actor: LegalDraftActor) {
  const row = await db.prepare(`SELECT u.display_name AS displayName FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role='super_admin' LIMIT 1`)
    .bind(actor.id, actor.authSubject).first<{ displayName: string }>();
  if (!row) throw new LegalDraftAccessError();
  return { ...actor, displayName: row.displayName };
}
async function findReplay(db: D1Database, actor: LegalDraftActor, input: LegalDraftInput): Promise<LegalDraftSnapshot | null> {
  const priorRequest = await db.prepare(`SELECT ${columns} FROM audit_logs WHERE ${scope} AND request_id=? LIMIT 2`)
    .bind('legal-draft:' + input.requestId).all<Row>();
  if (priorRequest.results.length) {
    if (priorRequest.results.length !== 1) throw new LegalDraftStoreError('Stored retry is ambiguous.');
    const saved = await parseRow(priorRequest.results[0]);
    if (saved.actorId !== actor.id || saved.reason !== input.reason || saved.previousRevision !== input.expectedRevision ||
      saved.previousSha256 !== input.expectedSha256 || JSON.stringify(saved.sections) !== JSON.stringify(input.sections))
      throw new LegalDraftConflictError('This request reference was used for a different draft. Retry with the original content.');
    return saved;
  }
  return null;
}
export async function saveLegalDraft(db: D1Database, claimedActor: LegalDraftActor, rawInput: unknown, now: number): Promise<LegalDraftSnapshot> {
  const input = validateLegalDraftInput(rawInput);
  if (!Number.isSafeInteger(now) || now < 0) throw new LegalDraftStoreError('Draft time is unavailable.');
  const actor = await assertLegalDraftActor(db, claimedActor);
  const replay = await findReplay(db, actor, input);
  if (replay) return replay;
  const current = await latest(db);
  if (current.revision !== input.expectedRevision || current.sha256 !== input.expectedSha256) {
    const committedRetry = await findReplay(db, actor, input);
    if (committedRetry) return committedRetry;
    throw new LegalDraftConflictError('A newer draft or changed source exists. Your edits are kept; compare the latest draft before saving.');
  }
  if (current.revision >= 1_000_000) throw new LegalDraftStoreError('Draft revision limit reached.');
  const base = await bundledLegalDraft();
  const snapshot: LegalDraftSnapshot = { schemaVersion: 1, id: legalRevisionId(current.revision + 1), revision: current.revision + 1,
    status: 'draft', approvedAt: null, effectiveAt: null, company: base.company, sections: input.sections,
    sha256: '', actorId: actor.id, actorName: actor.displayName,
    savedAt: now, reason: input.reason, previousRevision: current.revision, previousSha256: current.sha256 };
  snapshot.sha256 = await legalSnapshotHash(snapshot);
  // A deterministic primary key is the final concurrency fence on every backend.
  // The conditional INSERT also rechecks authority and the expected parent at commit time.
  try {
    const result = await db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,
      previous_json,next_json,request_id,created_at)
      SELECT ?,?,?,'internal_legal_procedure','internal-compliance',?,?,?,?,?
      WHERE EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id
        WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role='super_admin')
      AND COALESCE((SELECT MAX(CAST(json_extract(next_json,'$.revision') AS INTEGER)) FROM audit_logs WHERE ${scope}),0)=?
      AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE ${scope} AND request_id=?)`)
      .bind(snapshot.id, actor.id, action, input.reason, JSON.stringify(current), JSON.stringify(snapshot),
        'legal-draft:' + input.requestId, now, actor.id, actor.authSubject, current.revision, 'legal-draft:' + input.requestId).run();
    if (result.meta.changes !== 1) {
      await assertLegalDraftActor(db, actor);
      throw new LegalDraftConflictError('The draft changed while saving. Your edits are kept; review the latest draft.');
    }
  } catch (error) {
    if (error instanceof LegalDraftAccessError) throw error;
    await assertLegalDraftActor(db, actor);
    const committedRetry = await findReplay(db, actor, input);
    if (committedRetry) return committedRetry;
    if (error instanceof LegalDraftConflictError) throw error;
    // Do not disguise storage failures as successful saves or empty history.
    const existing = await getLegalDraftRevision(db, snapshot.revision);
    if (existing) throw new LegalDraftConflictError('The draft changed while saving. Your edits are kept; review the latest draft.');
    throw new LegalDraftStoreError('The draft could not be saved. Your edits are kept.');
  }
  return snapshot;
}
