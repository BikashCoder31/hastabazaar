import type { StaffRole } from '@/lib/auth/staff';

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
  },
): Promise<{ id: string; expiresAt: number }> {
  const email = options.email.trim().toLowerCase();
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
  await database.batch([
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
          'Staff access invitation created', NULL, ?, NULL, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.invitedBy,
        id,
        JSON.stringify({ email, role: options.role, expiresAt }),
        options.now,
      ),
  ]);
  return { id, expiresAt };
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
