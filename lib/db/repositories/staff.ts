import type { StaffRole } from '@/lib/auth/staff';
import { buildFormAnswerInsert } from './form-answers';
import type { FormAnswerSnapshot } from '../../forms/types';
import {validateAdminPermissions} from '../../marketplace/permissions';
import {staffMutationGuard} from './staff-mutation-guard';
import {digestFormRequest} from '../../forms/client-submission';
import {formAnswerSnapshotMatches} from '../../forms/answer-proof';

export interface StaffMemberRow {
  id: string;
  email: string;
  displayName: string;
  role: StaffRole;
  assignedAt: number;
}

export interface StaffInvitationRow {
  id: string;
  email: string;
  role: StaffRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invitedByName: string | null;
  expiresAt: number;
  createdAt: number;
}

export async function listStaffMembers(
  database: D1Database,
): Promise<readonly StaffMemberRow[]> {
  const result = await database
    .prepare(
      `SELECT users.id, users.email, users.display_name AS displayName,
        user_roles.role, user_roles.assigned_at AS assignedAt
       FROM user_roles
       INNER JOIN users ON users.id = user_roles.user_id
       WHERE user_roles.role IN ('admin', 'super_admin')
         AND users.status = 'active'
       ORDER BY CASE user_roles.role WHEN 'super_admin' THEN 0 ELSE 1 END,
         users.display_name ASC`,
    )
    .all<StaffMemberRow>();
  return result.results;
}

export async function listStaffInvitations(
  database: D1Database,
): Promise<readonly StaffInvitationRow[]> {
  const now = Date.now();
  await database
    .prepare(
      `UPDATE staff_invitations SET status = 'expired'
       WHERE status = 'pending' AND expires_at <= ?`,
    )
    .bind(now)
    .run();

  const result = await database
    .prepare(
      `SELECT staff_invitations.id, staff_invitations.email,
        staff_invitations.role, staff_invitations.status,
        inviter.display_name AS invitedByName,
        staff_invitations.expires_at AS expiresAt,
        staff_invitations.created_at AS createdAt
       FROM staff_invitations
       LEFT JOIN users AS inviter ON inviter.id = staff_invitations.invited_by
       ORDER BY staff_invitations.created_at DESC
       LIMIT 100`,
    )
    .all<StaffInvitationRow>();
  return result.results;
}

export class StaffInvitationConflictError extends Error {}
export class StaffInvitationAccessError extends StaffInvitationConflictError {}

type InvitationActor={actorId:string;actorAuthSubject?:string|null};
async function invitationAuthority(database:D1Database,actor:InvitationActor){
 const authority=await staffMutationGuard(database,actor.actorId,'admin.invite',StaffInvitationAccessError,'super_admin');
 const row=await database.prepare('SELECT id,auth_subject AS authSubject FROM users WHERE id=?').bind(actor.actorId).first<{id:string;authSubject:string|null}>();
 if(!row||row.id!==actor.actorId||(actor.actorAuthSubject!==undefined&&row.authSubject!==actor.actorAuthSubject))
  throw new StaffInvitationAccessError('The authenticated staff identity changed. Reopen the current workspace.');
 const id=crypto.randomUUID();
 authority.statements.push(database.prepare(`INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
  SELECT 1 FROM users WHERE HEX(id)=HEX(?) AND ${row.authSubject===null?'auth_subject IS NULL':'HEX(auth_subject)=HEX(?)'}) THEN 1 ELSE 0 END`)
  .bind(id,actor.actorId,...(row.authSubject===null?[]:[row.authSubject])),database.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(id));
 return {...authority,authSubject:row.authSubject};
}

export async function assertStaffInvitationAccess(database:D1Database,actor:InvitationActor){
 await invitationAuthority(database,actor);
}

/** Current status only: deliberately does not attribute a later change to a request. */
export async function readStaffInvitationState(database:D1Database,options:InvitationActor&{invitationId:string;now:number}){
 const authority=await invitationAuthority(database,options);
 const read=()=>database.prepare(`SELECT i.id,i.status,i.expires_at AS expiresAt,i.revoked_at AS revokedAt
  FROM staff_invitations i WHERE HEX(i.id)=HEX(?) AND EXISTS(
   SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE HEX(u.id)=HEX(?)
   AND HEX(u.status)=HEX('active') AND HEX(r.role)=HEX('super_admin')
   AND ${authority.authSubject===null?'u.auth_subject IS NULL':'HEX(u.auth_subject)=HEX(?)'})`)
  .bind(options.invitationId,options.actorId,...(authority.authSubject===null?[]:[authority.authSubject]))
  .first<{id:string;status:StaffInvitationRow['status'];expiresAt:number;revokedAt:number|null}>();
 await read();
 await invitationAuthority(database,{...options,actorAuthSubject:authority.authSubject});
 const row=await read();
 if(!row||row.id!==options.invitationId)return null;
 return {id:row.id,status:row.status==='pending'&&row.expiresAt<=options.now?'expired':row.status,
  ...(row.revokedAt===null?{}:{revokedAt:row.revokedAt})};
}

/** Original committed receipt only. Reading never accepts an invitation or sends mail. */
export async function readStaffInvitationOutcome(database:D1Database,options:InvitationActor&{requestId:string;now:number}){
 const authority=await invitationAuthority(database,options);
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(options.requestId))throw new StaffInvitationConflictError('Invalid invitation request reference.');
 const row=await database.prepare(`SELECT i.id,i.email,i.role,i.invited_by AS invitedBy,i.expires_at AS expiresAt,
  a.actor_id AS actorId,a.subject_type AS subjectType,a.subject_id AS subjectId,a.config_version_id AS versionId,a.answers_json AS answersJson,
  original.actor_id AS originalActor,original.request_id AS originalRequest,original.next_json AS originalJson
  FROM form_answer_sets a JOIN staff_invitations i ON i.id=a.subject_id
  JOIN audit_logs original ON original.action='staff.invitation.created' AND original.subject_type='staff_invitation' AND original.subject_id=i.id AND original.request_id=a.request_id
  WHERE a.form_id='staff.staff-invitation' AND a.request_id=? LIMIT 1`).bind(options.requestId).first<{
   id:string;email:string;role:string;invitedBy:string;expiresAt:number;actorId:string;subjectType:string;subjectId:string;
   versionId:string;answersJson:string;originalActor:string;originalRequest:string;originalJson:string;
  }>();
 await invitationAuthority(database,options);
 if(!row)return null;
 let saved:Record<string,unknown>,proof:Record<string,unknown>,legacy=false;
 try{saved=JSON.parse(row.originalJson) as Record<string,unknown>;legacy=!Object.hasOwn(saved,'commandProof');proof=saved.commandProof as Record<string,unknown>;
  if(!legacy&&(!proof||proof.version!==1||proof.actorAuthSubject!==authority.authSubject||proof.formVersionId!==row.versionId||
   proof.answersDigest!==await digestFormRequest(JSON.parse(row.answersJson) as unknown)))return null;
 }catch{return null;}
 if(row.actorId!==options.actorId||row.originalActor!==options.actorId||row.originalRequest!==options.requestId||
  row.subjectType!=='staff_invitation'||row.subjectId!==row.id||row.invitedBy!==options.actorId||
  saved.email!==row.email||saved.role!==row.role||saved.expiresAt!==row.expiresAt)return null;
 // Authority and current source facts share this final SQL read; no private DTO
 // is returned from a projection authorized only before an asynchronous query.
 const current=await database.prepare(`SELECT i.status FROM staff_invitations i WHERE HEX(i.id)=HEX(?)
  AND HEX(i.invited_by)=HEX(?) AND HEX(i.email)=HEX(?) AND HEX(i.role)=HEX(?) AND i.expires_at=?
  AND EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE HEX(u.id)=HEX(?)
   AND HEX(u.status)=HEX('active') AND HEX(r.role)=HEX('super_admin')
   AND ${authority.authSubject===null?'u.auth_subject IS NULL':'HEX(u.auth_subject)=HEX(?)'})`).bind(row.id,options.actorId,row.email,row.role,row.expiresAt,options.actorId,...(authority.authSubject===null?[]:[authority.authSubject])).first<{status:string}>();
 if(!current){await invitationAuthority(database,options);return null;}
 const status=current.status==='pending'&&row.expiresAt<=options.now?'expired':current.status;
 return {recorded:true as const,requestId:options.requestId,id:row.id,expiresAt:row.expiresAt,status,
  ...(legacy?{replayable:false as const,originalInputProof:'legacy_unclassified' as const}:{})};
}

export async function createStaffInvitation(
  database: D1Database,
  options: {
    email: string;
    role: StaffRole;
    permissions?:unknown;
    invitedBy: string;
    actorAuthSubject?: string|null;
    now: number;
    requestId?: string;
    form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot };
  },
): Promise<{ id: string; expiresAt: number; duplicate: boolean }> {
  const email = options.email.trim().toLowerCase();
  const authority=await invitationAuthority(database,{actorId:options.invitedBy,actorAuthSubject:options.actorAuthSubject});
  let permissions;try{permissions=options.role==='admin'?validateAdminPermissions(options.permissions):[];}catch{throw new StaffInvitationConflictError('Select the exact work access for this new invitation.');}
  const inputDigest=await digestFormRequest({email,role:options.role,permissions,form:options.form??null});
  if (options.form) {
    const currentAuthority = await database.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin' LIMIT 1").bind(options.invitedBy).first();
    if (!currentAuthority) throw new StaffInvitationConflictError('Current Super Admin authority is required.');
    if (!options.requestId || options.form.requestId !== options.requestId)
      throw new StaffInvitationConflictError('Invitation request reference does not match the form.');
    const replay = await database.prepare(`SELECT a.actor_id AS actorId,a.subject_type AS subjectType,
      a.subject_id AS subjectId,a.config_version_id AS versionId,a.answers_json AS answersJson,
      i.email,i.role,i.invited_by AS invitedBy,i.expires_at AS expiresAt,
      (SELECT next_json FROM audit_logs original WHERE original.action='staff.invitation.created' AND original.subject_type='staff_invitation' AND original.subject_id=i.id AND original.request_id=a.request_id LIMIT 1) AS originalJson
      FROM form_answer_sets a JOIN staff_invitations i ON i.id=a.subject_id
      WHERE a.form_id='staff.staff-invitation' AND a.request_id=? LIMIT 1`)
      .bind(options.requestId).first<{ actorId: string; subjectType: string; subjectId: string;
        versionId: string; answersJson: string; email: string; role: StaffRole;
        invitedBy: string; expiresAt: number;originalJson:string|null }>();
    if (replay) {
      if (replay.actorId !== options.invitedBy || replay.subjectType !== 'staff_invitation' ||
        replay.email !== email || replay.role !== options.role || replay.invitedBy !== options.invitedBy ||
        replay.versionId !== options.form.versionId ||
        !formAnswerSnapshotMatches(replay.answersJson,options.form.answers))
        throw new StaffInvitationConflictError('Invitation request reference was already used for different work.');
      let proof:Record<string,unknown>|undefined;
      try{proof=(JSON.parse(replay.originalJson??'null') as {commandProof?:Record<string,unknown>}|null)?.commandProof;}catch{/* Unknown legacy proof remains unconfirmed. */}
      if(proof?.version!==1||proof.inputDigest!==inputDigest||proof.actorAuthSubject!==authority.authSubject)
        throw new StaffInvitationConflictError('The original invitation command could not be confirmed for these inputs and identity.');
      await invitationAuthority(database,{actorId:options.invitedBy,actorAuthSubject:authority.authSubject});
      return { id: replay.subjectId, expiresAt: replay.expiresAt, duplicate: true };
    }
  }
  const activeStaff = await database
    .prepare(
      `SELECT users.id
       FROM users
       INNER JOIN user_roles ON user_roles.user_id = users.id
       WHERE lower(users.email) = ?
         AND users.status = 'active'
         AND user_roles.role IN ('admin', 'super_admin')
       LIMIT 1`,
    )
    .bind(email)
    .first<{ id: string }>();
  if (activeStaff) {
    throw new StaffInvitationConflictError(
      'This email already has active staff access.',
    );
  }

  const current = await database
    .prepare(
      `SELECT id FROM staff_invitations
       WHERE email = ? AND status = 'pending' AND expires_at > ?
       LIMIT 1`,
    )
    .bind(email, options.now)
    .first<{ id: string }>();
  if (current) {
    throw new StaffInvitationConflictError(
      'A pending invitation already exists for this email.',
    );
  }

  const id = crypto.randomUUID();
  const expiresAt = options.now + 7 * 24 * 60 * 60 * 1000;
  const statements: D1PreparedStatement[] = [
    ...authority.statements,
    database
      .prepare(
        `INSERT INTO staff_invitations (
          id, email, role, status, invited_by, accepted_by, expires_at,
          created_at, accepted_at, revoked_at
        ) VALUES (?, ?, ?, 'pending', ?, NULL, ?, ?, NULL, NULL)`,
      )
      .bind(id, email, options.role, options.invitedBy, expiresAt, options.now),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) VALUES (?, ?, 'staff.invitation.created', 'staff_invitation', ?,
          'Staff access invitation created', NULL, ?, ?, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.invitedBy,
        id,
        JSON.stringify({ email, role: options.role, expiresAt,commandProof:{version:1,actorAuthSubject:authority.authSubject,inputDigest,
          formVersionId:options.form?.versionId??null,answersDigest:options.form?await digestFormRequest(options.form.answers):null} }),
        options.form ? options.requestId! : null,
        options.now,
      ),
  ];
  statements.push(database.prepare('INSERT INTO staff_invitation_grants(invitation_id,permissions_json,created_by,created_at) VALUES(?,?,?,?)').bind(id,JSON.stringify(permissions),options.invitedBy,options.now));
  if (options.form) {
    const guardId = crypto.randomUUID();
    statements.unshift(database.prepare(`INSERT INTO staff_permission_guards(id,valid)
      SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id
      WHERE u.id=? AND u.status='active' AND r.role='super_admin')
      AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id
        WHERE lower(u.email)=? AND u.status='active' AND r.role IN ('admin','super_admin'))
      AND NOT EXISTS(SELECT 1 FROM staff_invitations WHERE email=? AND status='pending' AND expires_at>?)
      THEN 1 ELSE 0 END`)
      .bind(guardId, options.invitedBy, email, email, options.now),
    database.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(guardId));
    statements.push(buildFormAnswerInsert(database, {
      formId: 'staff.staff-invitation', requestId: options.requestId!,
      versionId: options.form.versionId, subjectType: 'staff_invitation',
      subjectId: id, actorId: options.invitedBy, answers: options.form.answers, now: options.now,
    }));
  }
  try { await database.batch(statements); }
  catch (error) {
    await invitationAuthority(database,{actorId:options.invitedBy,actorAuthSubject:authority.authSubject});
    if (!options.form) throw error;
    const winner = await database.prepare("SELECT 1 FROM form_answer_sets WHERE form_id='staff.staff-invitation' AND request_id=? LIMIT 1")
      .bind(options.requestId!).first();
    if (winner) return createStaffInvitation(database, options);
    throw new StaffInvitationConflictError('Access or invitation state changed. Refresh pending staff access before trying again.');
  }
  return { id, expiresAt, duplicate: false };
}

export async function revokeStaffInvitation(
  database: D1Database,
  options: { invitationId: string; actorId: string; actorAuthSubject?:string|null; now: number },
): Promise<boolean> {
  const authority=await invitationAuthority(database,options);
  if(!await database.prepare("SELECT 1 FROM staff_invitations WHERE id=? AND status='pending'").bind(options.invitationId).first())return false;
  const guardId=crypto.randomUUID(),statements:D1PreparedStatement[]=[...authority.statements,database.prepare("INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM staff_invitations WHERE id=? AND status='pending') THEN 1 ELSE 0 END").bind(guardId,options.invitationId),database.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(guardId),database
    .prepare(
      `UPDATE staff_invitations
       SET status = 'revoked', revoked_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(options.now, options.invitationId)
    ,database
    .prepare(
      `INSERT INTO audit_logs (
        id, actor_id, action, subject_type, subject_id, reason,
        previous_json, next_json, request_id, ip_hash, created_at
      ) VALUES (?, ?, 'staff.invitation.revoked', 'staff_invitation', ?,
        'Pending staff invitation revoked', NULL, NULL, NULL, NULL, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      options.actorId,
      options.invitationId,
      options.now,
    )
    ];
  try{await database.batch(statements);}catch{await invitationAuthority(database,{actorId:options.actorId,actorAuthSubject:authority.authSubject});const current=await database.prepare('SELECT status FROM staff_invitations WHERE id=?').bind(options.invitationId).first<{status:string}>();if(current?.status!=='pending')return false;throw new StaffInvitationConflictError('The invitation or authority changed before revocation was confirmed. Refresh its current state.');}
  return true;
}
