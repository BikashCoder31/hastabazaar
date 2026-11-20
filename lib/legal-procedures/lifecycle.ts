import { getLegalDraftWorkspace, assertLegalDraftActor } from './repository';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import { legalDigest, LegalDraftConflictError, LegalDraftStoreError, type LegalDraftActor } from './model';
import { emptyLegalControl, legalControlHash, legalControlId, legalControlTime, legalEffectiveTime,
  validateLegalControlEvent, validateLegalControlInput, type LegalControlEvent, type LegalControlInput, type LegalControlWorkspace } from './lifecycle-model';

const scope = "action='legal_procedure.lifecycle' AND subject_type='internal_legal_procedure' AND subject_id='internal-compliance'";
const draftScope = "action='legal_procedure.draft_saved' AND subject_type='internal_legal_procedure' AND subject_id='internal-compliance'";
const columns = 'id,actor_id AS actorId,reason,next_json AS nextJson,previous_json AS previousJson,request_id AS requestId,created_at AS createdAt';
type Row = { id: string; actorId: string; reason: string; nextJson: string; previousJson: string; requestId: string; createdAt: number };
const order = "ORDER BY CAST(json_extract(next_json,'$.sequence') AS INTEGER) DESC";
function scalar(db: D1Database, key: string, column = 'next_json') {
  const expression = `json_extract(${column},'$.${key}')`;
  return (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? `JSON_UNQUOTE(${expression})` : expression;
}
function notSuperseded(db: D1Database) {
  // A new release replaces a release that was still pending when the new one was recorded.
  // An already effective version stays active until its replacement becomes effective.
  return `AND NOT EXISTS(SELECT 1 FROM audit_logs newer WHERE newer.action='legal_procedure.lifecycle'
    AND newer.subject_type='internal_legal_procedure' AND newer.subject_id='internal-compliance'
    AND ${scalar(db, 'operation', 'newer.next_json')}='activate'
    AND CAST(json_extract(newer.next_json,'$.sequence') AS INTEGER)>CAST(json_extract(a.next_json,'$.sequence') AS INTEGER)
    AND CAST(json_extract(a.next_json,'$.effectiveAt') AS INTEGER)>CAST(json_extract(newer.next_json,'$.occurredAt') AS INTEGER))`;
}

async function parse(row: Row): Promise<LegalControlEvent> {
  try {
    const event = await validateLegalControlEvent(JSON.parse(row.nextJson));
    if (row.id !== event.id || row.actorId !== event.actorId || row.createdAt !== event.occurredAt ||
      row.reason !== event.reason || row.requestId !== 'legal-control:' + event.requestId) throw new Error('Attribution');
    const previous = JSON.parse(row.previousJson);
    if (event.sequence === 1) { if (previous !== null) throw new Error('Parent'); }
    else {
      const parent = await validateLegalControlEvent(previous);
      if (parent.sequence !== event.sequence - 1 || parent.sha256 !== event.previousSha256 || parent.occurredAt > event.occurredAt)
        throw new Error('Parent');
    }
    return event;
  } catch { throw new LegalDraftStoreError('Stored procedure approval or activation is unavailable or its fingerprint is invalid.'); }
}
async function one(db: D1Database, filter = '', args: unknown[] = []) {
  const row = await db.prepare(`SELECT ${columns} FROM audit_logs a WHERE ${scope} ${filter} ${order} LIMIT 1`).bind(...args).first<Row>();
  return row ? parse(row) : null;
}
export async function getLegalProcedureEvent(db: D1Database, sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 1_000_000) return null;
  return one(db, 'AND id=?', [legalControlId(sequence)]);
}
export function getCurrentLegalProcedureControl(db: D1Database) {
  return getLegalProcedureControl(db, Date.now());
}
/** Same canonical effective/withdrawn selector, evaluated at database execution time. */
export function currentNativeProcedureIdSql(db:D1Database){
 return `SELECT a.id FROM audit_logs a WHERE ${scope} AND ${scalar(db,'operation')} IN ('activate','withdraw') AND CAST(json_extract(a.next_json,'$.effectiveAt') AS INTEGER)<=${checkoutCommitClock(db)} ${notSuperseded(db)} ${order} LIMIT 1`;
}
export async function getActiveLegalProcedureProof(db:D1Database,now=Date.now()){
 const control=await getLegalProcedureControl(db,now),active=control.active;if(!active)return null;
 const predicate=`COALESCE((${currentNativeProcedureIdSql(db)}),'')=? AND EXISTS(SELECT 1 FROM audit_logs original WHERE original.id=? AND ${scalar(db,'document.sha256','original.next_json')}=?)`,values=[active.id,active.id,active.document.sha256],id=crypto.randomUUID();
 return {active,predicate,values,guards:[db.prepare('INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN '+predicate+' THEN 1 ELSE 0 END').bind(id,...values),db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(id)]};
}
export async function getLegalProcedureControl(db: D1Database, now: number, beforeSequence = 1_000_001): Promise<LegalControlWorkspace> {
  if (!legalControlTime(now)) throw new LegalDraftStoreError('The current procedure time is unavailable.');
  const [latest, approval, effective, scheduled, withdrawal, rows] = await Promise.all([
    one(db), one(db, `AND ${scalar(db, 'operation')}='approve'`),
    one(db, `AND ${scalar(db, 'operation')} IN ('activate','withdraw') AND CAST(json_extract(next_json,'$.effectiveAt') AS INTEGER)<=? ${notSuperseded(db)}`, [now]),
    one(db, `AND ${scalar(db, 'operation')}='activate' AND CAST(json_extract(next_json,'$.effectiveAt') AS INTEGER)>? ${notSuperseded(db)}`, [now]),
    one(db, `AND ${scalar(db, 'operation')}='withdraw'`),
    db.prepare(`SELECT ${columns} FROM audit_logs WHERE ${scope} AND CAST(json_extract(next_json,'$.sequence') AS INTEGER)<? ${order} LIMIT 21`)
      .bind(beforeSequence).all<Row>(),
  ]);
  const snapshots = await Promise.all(rows.results.map(parse));
  for (const event of [effective, scheduled]) if (event?.operation === 'activate') {
    const reference = await getLegalProcedureEvent(db, event.approvalSequence!);
    if (reference?.operation !== 'approve' || reference.document.sha256 !== event.document.sha256 || reference.occurredAt > event.occurredAt)
      throw new LegalDraftStoreError('The stored active procedure approval could not be verified.');
  }
  const history = snapshots.slice(0, 20).map(({ document, ...event }) => ({ ...event, document: { revision: document.revision, sha256: document.sha256 } }));
  return { ...emptyLegalControl(), sequence: latest?.sequence ?? 0, sha256: latest?.sha256 ?? '0'.repeat(64), latest,
    approval: approval && approval.sequence > (withdrawal?.sequence ?? 0) ? approval : null,
    active: effective?.operation === 'activate' ? effective : null,
    scheduled: scheduled && scheduled.sequence > Math.max(effective?.sequence ?? 0, withdrawal?.sequence ?? 0) ? scheduled : null,
    history, nextBeforeSequence: snapshots.length > 20 ? history[19].sequence : null };
}
async function replay(db: D1Database, actor: LegalDraftActor, input: LegalControlInput, fingerprint: string) {
  const rows = await db.prepare(`SELECT ${columns} FROM audit_logs WHERE ${scope} AND request_id=? LIMIT 2`)
    .bind('legal-control:' + input.requestId).all<Row>();
  if (!rows.results.length) return null;
  if (rows.results.length !== 1) throw new LegalDraftStoreError('The saved procedure request is ambiguous.');
  const event = await parse(rows.results[0]);
  if (event.actorId !== actor.id || event.requestFingerprint !== fingerprint)
    throw new LegalDraftConflictError('This request reference belongs to different content or an action. Retry the original request.');
  return event;
}
export async function changeLegalProcedureControl(db: D1Database, claimedActor: LegalDraftActor, raw: unknown, now: number): Promise<LegalControlEvent> {
  const input = validateLegalControlInput(raw), actor = await assertLegalDraftActor(db, claimedActor);
  if (!legalControlTime(now)) throw new LegalDraftStoreError('The current procedure time is unavailable.');
  const fingerprint = await legalDigest(JSON.stringify(input));
  const prior = await replay(db, actor, input, fingerprint); if (prior) return prior;
  const [state, workspace] = await Promise.all([getLegalProcedureControl(db, now), getLegalDraftWorkspace(db)]);
  if (state.sequence !== input.expectedSequence || state.sha256 !== input.expectedSha256) {
    const committed = await replay(db, actor, input, fingerprint); if (committed) return committed;
    throw new LegalDraftConflictError('Approval or activation changed in another tab. Review the latest state before continuing.');
  }
  if (state.sequence >= 1_000_000 || (state.latest && now < state.latest.occurredAt)) throw new LegalDraftStoreError('The procedure sequence or clock cannot advance safely.');
  const document = input.operation === 'withdraw' ? (state.active ?? state.scheduled)?.document : workspace.current;
  if (!document || document.revision !== input.revision || document.sha256 !== input.documentSha256)
    throw new LegalDraftConflictError('The selected saved version changed or is no longer active. Review the latest version.');
  if (now < document.savedAt) throw new LegalDraftStoreError('The approval clock is earlier than the saved version. No action was recorded.');
  if (input.operation === 'activate' && (!state.approval || state.approval.sequence !== input.approvalSequence ||
    state.approval.document.sha256 !== document.sha256)) throw new LegalDraftConflictError('Approve this exact saved version before activation.');
  const event: LegalControlEvent = { schemaVersion: 1, id: legalControlId(state.sequence + 1), sequence: state.sequence + 1,
    operation: input.operation, document, approvalSequence: input.approvalSequence,
    effectiveAt: input.operation === 'approve' ? null : input.operation === 'withdraw' ? now : legalEffectiveTime(input.effectiveFrom, now),
    actorId: actor.id, actorName: actor.displayName, occurredAt: now, reason: input.reason, requestId: input.requestId,
    requestFingerprint: fingerprint, previousSha256: state.latest?.sha256 ?? null, sha256: '' };
  event.sha256 = await legalControlHash(event);
  await validateLegalControlEvent(event);
  try {
    const result = await db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at)
      SELECT ?,?,'legal_procedure.lifecycle','internal_legal_procedure','internal-compliance',?,?,?,?,?
      WHERE EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role='super_admin')
      AND COALESCE((SELECT MAX(CAST(json_extract(next_json,'$.sequence') AS INTEGER)) FROM audit_logs WHERE ${scope}),0)=?
      AND COALESCE((SELECT ${scalar(db, 'sha256')} FROM audit_logs WHERE ${scope} ${order} LIMIT 1),?)=?
      AND (?='withdraw' OR (COALESCE((SELECT MAX(CAST(json_extract(next_json,'$.revision') AS INTEGER)) FROM audit_logs WHERE ${draftScope}),0)=?
        AND EXISTS(SELECT 1 FROM audit_logs WHERE ${draftScope} AND id=? AND ${scalar(db, 'sha256')}=?)))
      AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE ${scope} AND request_id=?)`)
      .bind(event.id, actor.id, input.reason, JSON.stringify(state.latest), JSON.stringify(event), 'legal-control:' + input.requestId, now,
        actor.id, actor.authSubject, state.sequence, '0'.repeat(64), state.sha256, input.operation, document.revision, document.id,
        document.sha256, 'legal-control:' + input.requestId).run();
    if (result.meta.changes !== 1) {
      await assertLegalDraftActor(db, actor);
      throw new LegalDraftConflictError('The version, approval or authority changed while saving this action. Review the latest state.');
    }
  } catch (error) {
    await assertLegalDraftActor(db, actor);
    const committed = await replay(db, actor, input, fingerprint); if (committed) return committed;
    if (error instanceof LegalDraftConflictError) throw error;
    if (await getLegalProcedureEvent(db, event.sequence)) throw new LegalDraftConflictError('Another procedure action was saved first. Review the latest state.');
    throw new LegalDraftStoreError('The procedure action could not be saved. Its previous state has been preserved.');
  }
  return event;
}
