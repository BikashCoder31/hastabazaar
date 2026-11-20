import { recordStaffAuthorizationOutcome } from '../../operations/authorization-audit';
import {staffAccessGovernanceStatements} from '../../operations/team-access-impact';
import { operationalBusinessNotificationStatements } from '../../operations/business-notifications';
import { buildFormAnswerInsert } from './form-answers';
import type { FormAnswerSnapshot } from '../../forms/types';
import {staffMutationGuard} from './staff-mutation-guard';
import {digestFormRequest} from '../../forms/client-submission';
import {formAnswerSnapshotMatches} from '../../forms/answer-proof';
import {
  can,
  defaultAdminPermissions,
  validateAdminPermissions,
  type Permission,
} from '../../marketplace/permissions';

export class StaffPermissionConflictError extends Error {}
export class StaffPermissionAccessError extends StaffPermissionConflictError {}
type PermissionActor={actorId:string;actorAuthSubject?:string|null};
async function permissionAuthority(db:D1Database,actor:PermissionActor){
 const authority=await staffMutationGuard(db,actor.actorId,'admin.permissions.manage',StaffPermissionAccessError,'super_admin');
 const row=await db.prepare('SELECT id,auth_subject AS authSubject FROM users WHERE id=?').bind(actor.actorId).first<{id:string;authSubject:string|null}>();
 if(!row||row.id!==actor.actorId||(actor.actorAuthSubject!==undefined&&row.authSubject!==actor.actorAuthSubject))
  throw new StaffPermissionAccessError('The authenticated staff identity changed. Reopen the current workspace.');
 return {...authority,authSubject:row.authSubject,statements:[...authority.statements,...guard(db,
  `EXISTS(SELECT 1 FROM users WHERE HEX(id)=HEX(?) AND ${row.authSubject===null?'auth_subject IS NULL':'HEX(auth_subject)=HEX(?)'})`,
  [actor.actorId,...(row.authSubject===null?[]:[row.authSubject])])]};
}
function originalCommandProof(raw:string|null){
 try{return(JSON.parse(raw??'null') as {commandProof?:Record<string,unknown>}|null)?.commandProof;}
 catch{throw new StaffPermissionConflictError('Original permission command proof is unavailable.');}
}
export interface StaffPermissionProfile {
  userId: string;
  permissions: readonly Permission[];
  version: number;
  updatedBy: string | null;
  updatedAt: number | null;
}
export interface StaffPermissionRequest {
  id: string;
  userId: string;
  permissionsJson: string;
  expectedVersion: number;
  presetName: string | null;
  reason: string;
  proposedBy: string;
  proposedAt: number;
  status: string;
  decidedBy: string | null;
  decisionNote: string | null;
  appliedDirectly?: number;
}
export interface StaffPermissionPreset {
  id: string;
  name: string;
  permissionsJson: string;
}
type PermissionForm = { requestId: string; versionId: string; answers: FormAnswerSnapshot };
const activeSuper =
  "EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin')";
const activeAdmin =
  "EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='admin') AND NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role='super_admin')";
function guard(db: D1Database, predicate: string, values: unknown[]) {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        'INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN ' +
          predicate +
          ' THEN 1 ELSE 0 END',
      )
      .bind(id, ...values),
    db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(id),
  ];
}
async function atomic(
  db: D1Database,
  statements: D1PreparedStatement[],
  context?: { actorId: string; subjectId: string;actorAuthSubject?:string|null },
) {
  try {
    await db.batch(statements);
  } catch {
    if(context)await permissionAuthority(db,context);
    if (context)
      await recordStaffAuthorizationOutcome(db, {
        ...context,
        permission: 'admin.permissions.manage',
        outcome: 'failed',
      });
    throw new StaffPermissionConflictError(
      'Access or request changed. Refresh and review the current permissions before trying again.',
    );
  }
}
function note(value: string) {
  const result = value.trim();
  if (result.length < 8 || result.length > 1000)
    throw new StaffPermissionConflictError(
      'Add a reason of 8–1000 characters.',
    );
  return result;
}
function audit(
  db: D1Database,
  actor: string,
  action: string,
  user: string,
  reason: string,
  before: unknown,
  after: unknown,
  now: number,
  operationRequestId?: string,
) {
  return db
    .prepare(
      "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,?,'staff_permissions',?,?,?,?,?,NULL,?)",
    )
    .bind(
      crypto.randomUUID(),
      actor,
      action,
      user,
      reason,
      JSON.stringify(before),
      JSON.stringify(after),
      operationRequestId ?? crypto.randomUUID(),
      now,
    );
}
export async function getStaffPermissionProfile(
  db: D1Database,
  userId: string,
): Promise<StaffPermissionProfile> {
  const row = await db
    .prepare(
      'SELECT permissions_json AS permissionsJson,version,updated_by AS updatedBy,updated_at AS updatedAt FROM staff_permission_profiles WHERE user_id=?',
    )
    .bind(userId)
    .first<{
      permissionsJson: string;
      version: number;
      updatedBy: string;
      updatedAt: number;
    }>();
  // Invalid persisted data fails closed, never restores broad legacy access.
  let permissions: readonly Permission[] = defaultAdminPermissions;
  if (row) {
    try {
      permissions = validateAdminPermissions(JSON.parse(row.permissionsJson));
    } catch {
      permissions = [];
    }
  }
  return {
    userId,
    permissions,
    version: row?.version ?? 0,
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}
export async function listStaffPermissionChanges(db: D1Database) {
  const [requests, presets] = await Promise.all([
    db
      .prepare(
        "SELECT id,user_id AS userId,permissions_json AS permissionsJson,expected_version AS expectedVersion,preset_name AS presetName,reason,proposed_by AS proposedBy,proposed_at AS proposedAt,status,decided_by AS decidedBy,decision_note AS decisionNote,EXISTS(SELECT 1 FROM audit_logs a WHERE a.request_id=r.id AND a.action='staff.permissions.applied' AND a.actor_id=r.proposed_by AND a.subject_id=r.user_id) AS appliedDirectly FROM staff_permission_requests r ORDER BY proposed_at DESC LIMIT 100",
      )
      .all<StaffPermissionRequest>(),
    db
      .prepare(
        'SELECT id,name,permissions_json AS permissionsJson FROM staff_permission_presets ORDER BY created_at DESC LIMIT 100',
      )
      .all<StaffPermissionPreset>(),
  ]);
  return { requests: requests.results, presets: presets.results };
}
export async function proposeStaffPermissions(
  db: D1Database,
  options: {
    actorId: string;
    actorAuthSubject?:string|null;
    userId: string;
    permissions: unknown;
    version: number;
    reason: string;
    presetName?: string;
    now: number;
    requestId?: string;
    form?: PermissionForm;
  },
) {
  const authority=await permissionAuthority(db,options);
  const reason = note(options.reason);
  const permissions = validateAdminPermissions(options.permissions);
  if (options.actorId === options.userId)
    throw new StaffPermissionConflictError(
      'You cannot change your own permissions.',
    );
  if (!Number.isSafeInteger(options.version) || options.version < 0)
    throw new StaffPermissionConflictError(
      'Refresh the current access version.',
    );
  const presetName = options.presetName?.trim() || null;
  if (presetName && presetName.length > 80)
    throw new StaffPermissionConflictError(
      'Preset names must be at most 80 characters.',
    );
  if (options.form && (!options.requestId ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(options.requestId) ||
    options.form.requestId !== options.requestId))
    throw new StaffPermissionConflictError('Permission request reference does not match the form.');
  const id = options.form ? options.requestId! : crypto.randomUUID();
  const inputDigest=await digestFormRequest({action:'propose',sourceId:options.userId,permissions,version:options.version,reason,presetName,form:options.form??null});
  const commandProof={version:1,actorAuthSubject:authority.authSubject,action:'propose',sourceId:options.userId,requestId:id,inputDigest,
    formVersionId:options.form?.versionId??null,answersDigest:options.form?await digestFormRequest(options.form.answers):null};
  if (options.form) {
    if (!await db.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin' LIMIT 1").bind(options.actorId).first())
      throw new StaffPermissionConflictError('Current Super Admin authority is required.');
    const previous = await db.prepare(`SELECT r.user_id AS userId,r.permissions_json AS permissionsJson,
      r.expected_version AS expectedVersion,r.preset_name AS presetName,r.reason,
      r.proposed_by AS proposedBy,a.actor_id AS answerActor,a.subject_type AS subjectType,
      a.subject_id AS subjectId,a.config_version_id AS versionId,a.answers_json AS answersJson,
      (SELECT next_json FROM audit_logs e WHERE e.action='staff.permissions.applied' AND e.request_id=r.id AND e.actor_id=r.proposed_by AND e.subject_id=r.user_id LIMIT 1) AS originalJson
      FROM staff_permission_requests r LEFT JOIN form_answer_sets a
      ON a.form_id='staff.staff-permission-1' AND a.request_id=r.id
      WHERE r.id=? LIMIT 1`).bind(id).first<{ userId: string; permissionsJson: string;
        expectedVersion: number; presetName: string | null; reason: string;
        proposedBy: string; answerActor: string | null; subjectType: string | null;
        subjectId: string | null; versionId: string | null; answersJson: string | null;originalJson:string|null }>();
    if (previous) {
      if (previous.userId !== options.userId || previous.permissionsJson !== JSON.stringify(permissions) ||
        previous.expectedVersion !== options.version || previous.presetName !== presetName ||
        previous.reason !== reason || previous.proposedBy !== options.actorId ||
        previous.answerActor !== options.actorId || previous.subjectType !== 'staff_permission_request' ||
        previous.subjectId !== id || previous.versionId !== options.form.versionId ||
        !previous.answersJson||!formAnswerSnapshotMatches(previous.answersJson,options.form.answers))
        throw new StaffPermissionConflictError('Permission request reference was already used for different work.');
      const proof=originalCommandProof(previous.originalJson);
      if(proof&&(proof.version!==1||proof.inputDigest!==inputDigest||proof.actorAuthSubject!==authority.authSubject))
        throw new StaffPermissionConflictError('Original permission command identity or inputs could not be confirmed.');
      await permissionAuthority(db,{actorId:options.actorId,actorAuthSubject:authority.authSubject});
      return id;
    }
  }
  const previous = await getStaffPermissionProfile(db, options.userId);
  await atomic(
    db,
    [
      ...authority.statements,
      ...guard(db, activeSuper + ' AND ' + activeAdmin, [
        options.actorId,
        options.userId,
        options.userId,
      ]),
      db
        .prepare(
          'INSERT OR IGNORE INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES (?,?,0,?,?)',
        )
        .bind(
          options.userId,
          JSON.stringify(defaultAdminPermissions),
          options.actorId,
          options.now,
        ),
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=? AND version=?)',
        [options.userId, options.version],
      ),
      db
        .prepare(
          "INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,preset_name,reason,proposed_by,proposed_at,status,decided_by,decided_at,decision_note,decision_token) VALUES (?,?,?,?,?,?,?,?,'approved',?,?,?,?)",
        )
        .bind(
          id,
          options.userId,
          JSON.stringify(permissions),
          options.version,
          presetName,
          reason,
          options.actorId,
          options.now,
          options.actorId,
          options.now,
          reason,
          id,
        ),
      ...await staffAccessGovernanceStatements(db,{userId:options.userId,actorId:options.actorId,requestId:id,now:options.now,grantVersion:options.version+1}),
      db.prepare('UPDATE staff_permission_profiles SET permissions_json=?,version=version+1,last_request_id=?,updated_by=?,updated_at=? WHERE user_id=? AND version=?')
        .bind(JSON.stringify(permissions), id, options.actorId, options.now, options.userId, options.version),
      ...guard(db, 'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=? AND version=? AND last_request_id=?)',
        [options.userId, options.version + 1, id]),
      ...(presetName ? [db.prepare('INSERT INTO staff_permission_presets(id,name,permissions_json,created_by,created_at) VALUES (?,?,?,?,?)')
        .bind(id, presetName, JSON.stringify(permissions), options.actorId, options.now)] : []),
      audit(
        db,
        options.actorId,
        'staff.permissions.applied',
        options.userId,
        reason,
        previous,
        { id, permissions, presetName, version: options.version + 1, status: 'approved', approvalMode: 'direct',commandProof },
        options.now,
        id,
      ),
      ...(options.form ? [buildFormAnswerInsert(db, {
        formId: 'staff.staff-permission-1', requestId: id,
        versionId: options.form.versionId, subjectType: 'staff_permission_request',
        subjectId: id, actorId: options.actorId, answers: options.form.answers, now: options.now,
      })] : []),
    ],
    { actorId: options.actorId, subjectId: options.userId,actorAuthSubject:authority.authSubject },
  );
  await (await import('../../operations/team-access-reconciliation')).attemptStaffAccessReconciliation(db,options.now);
  return id;
}
export async function decideStaffPermissions(
  db: D1Database,
  options: {
    actorId: string;
    actorAuthSubject?:string|null;
    requestId: string;
    decision: 'approve' | 'reject';
    reason: string;
    now: number;
    formRequestId?: string;
    form?: PermissionForm;
  },
) {
  const authority=await permissionAuthority(db,options);
  const reason = note(options.reason);
  const inputDigest=await digestFormRequest({action:options.decision,sourceId:options.requestId,reason,form:options.form??null});
  const commandProof={version:1,actorAuthSubject:authority.authSubject,action:options.decision,sourceId:options.requestId,requestId:options.formRequestId??null,inputDigest,
    formVersionId:options.form?.versionId??null,answersDigest:options.form?await digestFormRequest(options.form.answers):null};
  const request = await db
    .prepare(
      'SELECT id,user_id AS userId,permissions_json AS permissionsJson,expected_version AS expectedVersion,preset_name AS presetName,reason,proposed_by AS proposedBy,proposed_at AS proposedAt,status,decided_by AS decidedBy,decision_note AS decisionNote FROM staff_permission_requests WHERE id=?',
    )
    .bind(options.requestId)
    .first<StaffPermissionRequest>();
  if(request&&request.id!==options.requestId)throw new StaffPermissionConflictError('Select the exact original permission request.');
  if (options.form) {
    if (!options.formRequestId || !/^[a-zA-Z0-9_-]{1,100}$/.test(options.formRequestId) ||
      options.form.requestId !== options.formRequestId)
      throw new StaffPermissionConflictError('Decision request reference does not match the form.');
    if (!await db.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin' LIMIT 1").bind(options.actorId).first())
      throw new StaffPermissionConflictError('Current Super Admin authority is required.');
    const answer = await db.prepare(`SELECT actor_id AS actorId,subject_type AS subjectType,
      subject_id AS subjectId,config_version_id AS versionId,answers_json AS answersJson,
      (SELECT next_json FROM audit_logs e WHERE e.request_id=form_answer_sets.request_id AND e.actor_id=form_answer_sets.actor_id AND e.action=? LIMIT 1) AS originalJson
      FROM form_answer_sets WHERE form_id='staff.staff-permission-2' AND request_id=? LIMIT 1`)
      .bind('staff.permissions.'+(options.decision==='approve'?'approved':'rejected'),options.formRequestId).first<{ actorId: string; subjectType: string;
        subjectId: string; versionId: string; answersJson: string;originalJson:string|null }>();
    if (answer) {
      if (!request || request.id !== answer.subjectId || request.decidedBy !== options.actorId ||
        request.decisionNote !== reason || request.status !== (options.decision === 'approve' ? 'approved' : 'rejected') ||
        answer.actorId !== options.actorId || answer.subjectType !== 'staff_permission_request' ||
        answer.versionId !== options.form.versionId ||
        !formAnswerSnapshotMatches(answer.answersJson,options.form.answers))
        throw new StaffPermissionConflictError('Decision request reference was already used for different work.');
      const proof=originalCommandProof(answer.originalJson);
      if(proof&&(proof.version!==1||proof.inputDigest!==inputDigest||proof.actorAuthSubject!==authority.authSubject))
        throw new StaffPermissionConflictError('Original decision identity or inputs could not be confirmed.');
      await permissionAuthority(db,{actorId:options.actorId,actorAuthSubject:authority.authSubject});
      return;
    }
  }
  if (
    !request ||
    request.status !== 'pending' ||
    request.userId === options.actorId
  ) {
    await recordStaffAuthorizationOutcome(db, {
      actorId: options.actorId,
      subjectId: request?.userId,
      permission: 'admin.permissions.manage',
      outcome: 'denied',
    });
    throw new StaffPermissionConflictError(
      'An active Super Admin must decide a pending request for another staff member.',
    );
  }
  const permissions = validateAdminPermissions(
    JSON.parse(request.permissionsJson),
  );
  const previous = await getStaffPermissionProfile(db, request.userId);
  const decisionToken = crypto.randomUUID();
  const statements = [
    ...authority.statements,
    ...guard(db, activeSuper + ' AND ' + activeSuper + ' AND ' + activeAdmin, [
      options.actorId,
      request.proposedBy,
      request.userId,
      request.userId,
    ]),
    db
      .prepare(
        "UPDATE staff_permission_requests SET status=?,decided_by=?,decided_at=?,decision_note=?,decision_token=? WHERE id=? AND status='pending'",
      )
      .bind(
        options.decision === 'approve' ? 'approved' : 'rejected',
        options.actorId,
        options.now,
        reason,
        decisionToken,
        request.id,
      ),
    ...guard(
      db,
      'EXISTS(SELECT 1 FROM staff_permission_requests WHERE id=? AND decision_token=?)',
      [request.id, decisionToken],
    ),
  ];
  if (options.decision === 'approve') {
    statements.push(
      ...await staffAccessGovernanceStatements(db,{userId:request.userId,actorId:options.actorId,requestId:request.id,now:options.now,grantVersion:request.expectedVersion+1,action:'staff.permissions.approved'}),
      db
        .prepare(
          'UPDATE staff_permission_profiles SET permissions_json=?,version=version+1,last_request_id=?,updated_by=?,updated_at=? WHERE user_id=? AND version=?',
        )
        .bind(
          JSON.stringify(permissions),
          request.id,
          options.actorId,
          options.now,
          request.userId,
          request.expectedVersion,
        ),
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=? AND version=? AND last_request_id=?)',
        [request.userId, request.expectedVersion + 1, request.id],
      ),
    );
    if (request.presetName)
      statements.push(
        db
          .prepare(
            'INSERT INTO staff_permission_presets(id,name,permissions_json,created_by,created_at) VALUES (?,?,?,?,?)',
          )
          .bind(
            request.id,
            request.presetName,
            JSON.stringify(permissions),
            options.actorId,
            options.now,
          ),
      );
  }
  statements.push(
    audit(
      db,
      options.actorId,
      'staff.permissions.' +
        (options.decision === 'approve' ? 'approved' : 'rejected'),
      request.userId,
      reason,
      previous,
      { requestId: request.id, permissions, proposedBy: request.proposedBy,commandProof },
      options.now,
      options.form ? options.formRequestId : undefined,
    ),
  );
  if (options.form) statements.push(buildFormAnswerInsert(db, {
    formId: 'staff.staff-permission-2', requestId: options.formRequestId!,
    versionId: options.form.versionId, subjectType: 'staff_permission_request',
    subjectId: request.id, actorId: options.actorId, answers: options.form.answers, now: options.now,
  }));
  if (options.decision === 'reject')
    statements.push(
      ...(await operationalBusinessNotificationStatements(db, {
        kind: 'permissions.rejected',
        sourceId: request.id,
        eventId: request.id,
        actorId: options.actorId,
        now: options.now,
      })),
    );
  await atomic(db, statements, {
    actorId: options.actorId,
    subjectId: request.userId,
    actorAuthSubject:authority.authSubject,
  });
  if(options.decision==='approve')await (await import('../../operations/team-access-reconciliation')).attemptStaffAccessReconciliation(db,options.now);
}

export type StaffPermissionAction='propose'|'approve'|'reject';
/** A historical command receipt, not a claim about the user's current effective grant. */
export async function readStaffPermissionOutcome(db:D1Database,options:PermissionActor&{action:StaffPermissionAction;requestId:string}){
 const authority=await permissionAuthority(db,options);
 if(!['propose','approve','reject'].includes(options.action)||!/^[a-zA-Z0-9_-]{1,100}$/.test(options.requestId))
  throw new StaffPermissionConflictError('Select an exact permission command reference.');
 const formId=options.action==='propose'?'staff.staff-permission-1':'staff.staff-permission-2';
 const actions=options.action==='propose'?['staff.permissions.applied','staff.permissions.proposed']:['staff.permissions.'+(options.action==='approve'?'approved':'rejected')];
 type Row={id:string;userId:string;permissionsJson:string;expectedVersion:number;presetName:string|null;reason:string;proposedBy:string;status:string;decidedBy:string|null;decisionNote:string|null;
  answerId:string;answerActor:string;subjectType:string;subjectId:string;versionId:string;answersJson:string;
  eventId:string;eventActor:string;eventSubject:string;eventRequest:string;eventAction:string;eventReason:string;originalJson:string};
 const read=()=>db.prepare(`SELECT r.id,r.user_id AS userId,r.permissions_json AS permissionsJson,r.expected_version AS expectedVersion,
  r.preset_name AS presetName,r.reason,r.proposed_by AS proposedBy,r.status,r.decided_by AS decidedBy,r.decision_note AS decisionNote,
  a.id AS answerId,a.actor_id AS answerActor,a.subject_type AS subjectType,a.subject_id AS subjectId,a.config_version_id AS versionId,a.answers_json AS answersJson,
  e.id AS eventId,e.actor_id AS eventActor,e.subject_id AS eventSubject,e.request_id AS eventRequest,e.action AS eventAction,e.reason AS eventReason,e.next_json AS originalJson
  FROM form_answer_sets a JOIN staff_permission_requests r ON r.id=a.subject_id
  JOIN audit_logs e ON e.request_id=a.request_id AND e.actor_id=a.actor_id AND e.subject_type='staff_permissions' AND e.subject_id=r.user_id
  WHERE a.form_id=? AND a.request_id=? AND e.action IN (${actions.map(()=>'?').join(',')})
  AND EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE HEX(u.id)=HEX(?)
   AND HEX(u.status)=HEX('active') AND HEX(ur.role)=HEX('super_admin')
   AND ${authority.authSubject===null?'u.auth_subject IS NULL':'HEX(u.auth_subject)=HEX(?)'}) LIMIT 1`)
  .bind(formId,options.requestId,...actions,options.actorId,...(authority.authSubject===null?[]:[authority.authSubject])).first<Row>();
 const row=await read();
 await permissionAuthority(db,{actorId:options.actorId,actorAuthSubject:authority.authSubject});
 if(!row)return null;
 const sourceId=options.action==='propose'?row.userId:row.id;
 if(row.answerActor!==options.actorId||row.eventActor!==options.actorId||row.eventSubject!==row.userId||row.eventRequest!==options.requestId||
  row.subjectType!=='staff_permission_request'||row.subjectId!==row.id)return null;
 if(options.action==='propose'?(row.proposedBy!==options.actorId||row.id!==options.requestId||row.eventReason!==row.reason):
  (row.decidedBy!==options.actorId||row.status!==(options.action==='approve'?'approved':'rejected')||row.eventReason!==row.decisionNote))return null;
 const proof=originalCommandProof(row.originalJson),legacy=proof===undefined;
 if(proof&&(proof.version!==1||proof.actorAuthSubject!==authority.authSubject||proof.action!==options.action||proof.sourceId!==sourceId||proof.requestId!==options.requestId||
  proof.formVersionId!==row.versionId||typeof proof.inputDigest!=='string'||!/^([a-f0-9]{64})$/.test(proof.inputDigest)||
  proof.answersDigest!==await digestFormRequest(JSON.parse(row.answersJson) as unknown)))return null;
 // Current effective profile is deliberately absent: later lawful grants do not
 // erase the original command. Source/receipt row images must still be exact.
 const current=await read();
 if(!current){await permissionAuthority(db,{actorId:options.actorId,actorAuthSubject:authority.authSubject});return null;}
 const snapshot=(value:Row)=>JSON.stringify({...value,status:options.action==='propose'?undefined:value.status,decidedBy:options.action==='propose'?undefined:value.decidedBy,decisionNote:options.action==='propose'?undefined:value.decisionNote});
 if(snapshot(current)!==snapshot(row))return null;
 return {recorded:true as const,actorId:options.actorId,action:options.action,requestId:options.requestId,sourceId,id:row.id,status:current.status,
  ...(legacy?{originalIdentityProof:'legacy_unclassified' as const}:{})};
}

/** Fresh active role and permission lookup for private media and other identity-based paths. */
export async function hasStaffPermissionBySubject(
  db: D1Database,
  authSubject: string,
  permission: Permission,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT u.id,r.role FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.auth_subject=? AND u.status='active' AND r.role IN ('admin','super_admin') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END LIMIT 1",
    )
    .bind(authSubject)
    .first<{ id: string; role: 'admin' | 'super_admin' }>();
  if (!row) return false;
  return can(
    {
      role: row.role,
      permissions:
        row.role === 'admin'
          ? (await getStaffPermissionProfile(db, row.id)).permissions
          : undefined,
    },
    permission,
  );
}
