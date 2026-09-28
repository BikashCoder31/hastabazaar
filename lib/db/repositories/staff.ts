import type { StaffRole } from '@/lib/auth/staff';
import { buildFormAnswerInsert } from './form-answers';
import type { FormAnswerSnapshot } from '../../forms/types';

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

export async function createStaffInvitation(
  database: D1Database,
  options: {
    email: string;
    role: StaffRole;
    invitedBy: string;
    now: number;
    requestId?: string;
    form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot };
  },
): Promise<{ id: string; expiresAt: number; duplicate: boolean }> {
  const email = options.email.trim().toLowerCase();
  if (options.form) {
    const authority = await database.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin' LIMIT 1").bind(options.invitedBy).first();
    if (!authority) throw new StaffInvitationConflictError('Current Super Admin authority is required.');
    if (!options.requestId || options.form.requestId !== options.requestId)
      throw new StaffInvitationConflictError('Invitation request reference does not match the form.');
    const replay = await database.prepare(`SELECT a.actor_id AS actorId,a.subject_type AS subjectType,
      a.subject_id AS subjectId,a.config_version_id AS versionId,a.answers_json AS answersJson,
      i.email,i.role,i.invited_by AS invitedBy,i.expires_at AS expiresAt
      FROM form_answer_sets a JOIN staff_invitations i ON i.id=a.subject_id
      WHERE a.form_id='staff.staff-invitation' AND a.request_id=? LIMIT 1`)
      .bind(options.requestId).first<{ actorId: string; subjectType: string; subjectId: string;
        versionId: string; answersJson: string; email: string; role: StaffRole;
        invitedBy: string; expiresAt: number }>();
    if (replay) {
      if (replay.actorId !== options.invitedBy || replay.subjectType !== 'staff_invitation' ||
        replay.email !== email || replay.role !== options.role || replay.invitedBy !== options.invitedBy ||
        replay.versionId !== options.form.versionId ||
        replay.answersJson !== JSON.stringify(options.form.answers))
        throw new StaffInvitationConflictError('Invitation request reference was already used for different work.');
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
        JSON.stringify({ email, role: options.role, expiresAt }),
        options.form ? options.requestId! : null,
        options.now,
      ),
  ];
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
  options: { invitationId: string; actorId: string; now: number },
): Promise<boolean> {
  const result = await database
    .prepare(
      `UPDATE staff_invitations
       SET status = 'revoked', revoked_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(options.now, options.invitationId)
    .run();
  if ((result.meta.changes ?? 0) !== 1) return false;

  await database
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
    .run();
  return true;
}
