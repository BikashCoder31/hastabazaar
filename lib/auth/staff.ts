import { recordStaffAuthorizationOutcome } from '@/lib/operations/authorization-audit';
import {staffInvitationAcceptanceStatements} from '@/lib/operations/staff-invitation-grants';
import { hasMailboxProof } from './mailbox-verification';
import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';

import {
  getAuthenticatedUser,
  requireAuthenticatedUser,
  type AuthenticatedUser,
} from '@/app/auth';
import { ensureConfiguredStaffBootstrap } from '@/lib/auth/staff-bootstrap';
import { requireDatabase } from '@/lib/db/d1';
import { getStaffPermissionProfile } from '@/lib/db/repositories/staff-permissions';
import { can, type Permission } from '@/lib/marketplace/permissions';
import type { MarketplaceRole } from '@/lib/marketplace/types';

export type StaffRole = Extract<MarketplaceRole, 'admin' | 'super_admin'>;

export interface StaffUser {
  permissions?: readonly Permission[];
  id: string;
  authSubject: string;
  email: string;
  displayName: string;
  role: StaffRole;
}

interface StaffRow {
  id: string;
  authSubject: string;
  email: string;
  displayName: string;
  role: StaffRole;
}

interface InvitationRow {
  id: string;
  role: StaffRole;
}

interface ExistingUserRow {
  id: string;
  authSubject: string | null;
  displayName: string;
}

export class StaffAuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'StaffAuthorizationError';
  }
}

interface StaffRuntimeEnvironment {
  DB?: D1Database;
  HASTABAZAAR_SUPER_ADMIN_EMAIL?: string;
  HASTABAZAAR_ADMIN_EMAIL?: string;
  HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL?: string;
  HASTABAZAAR_STAGING_ADMIN_EMAIL?: string;
}

function runtimeEnvironment(): StaffRuntimeEnvironment {
  return env as unknown as StaffRuntimeEnvironment;
}

function databaseFromEnvironment(): D1Database {
  return requireDatabase(runtimeEnvironment());
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function findStaffBySubject(
  database: D1Database,
  authSubject: string,
): Promise<StaffUser | null> {
  const row = await database
    .prepare(
      `SELECT
        users.id,
        users.auth_subject AS authSubject,
        users.email,
        users.display_name AS displayName,
        user_roles.role
      FROM users
      INNER JOIN user_roles ON user_roles.user_id = users.id
      WHERE users.auth_subject = ?
        AND users.status = 'active'
        AND user_roles.role IN ('admin', 'super_admin')
      ORDER BY CASE user_roles.role WHEN 'super_admin' THEN 0 ELSE 1 END
      LIMIT 1`,
    )
    .bind(authSubject)
    .first<StaffRow>();

  if (!row) return null;
  return row.role === 'super_admin' ? row : { ...row, permissions: (await getStaffPermissionProfile(database, row.id)).permissions };
}

async function acceptMatchingInvitation(
  database: D1Database,
  identity: AuthenticatedUser,
): Promise<StaffUser | null> {
  if (!hasMailboxProof(identity)) return null;
  const email = normalizeEmail(identity.email);
  const now = Date.now();

  await database
    .prepare(
      `UPDATE staff_invitations
       SET status = 'expired'
       WHERE email = ? AND status = 'pending' AND expires_at <= ?`,
    )
    .bind(email, now)
    .run();

  const bindings = runtimeEnvironment();
  await ensureConfiguredStaffBootstrap(
    database,
    email,
    {
      superAdminEmail:
        bindings.HASTABAZAAR_SUPER_ADMIN_EMAIL ??
        bindings.HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL,
      adminEmail:
        bindings.HASTABAZAAR_ADMIN_EMAIL ??
        bindings.HASTABAZAAR_STAGING_ADMIN_EMAIL,
    },
    now,
  );

  const existingStaff = await database
    .prepare(
      `SELECT
        users.id,
        users.auth_subject AS authSubject,
        users.email,
        users.display_name AS displayName,
        user_roles.role
      FROM users
      INNER JOIN user_roles ON user_roles.user_id = users.id
      WHERE lower(users.email) = ?
        AND users.status = 'active'
        AND user_roles.role IN ('admin', 'super_admin')
      ORDER BY CASE user_roles.role WHEN 'super_admin' THEN 0 ELSE 1 END
      LIMIT 1`,
    )
    .bind(email)
    .first<StaffRow>();

  if (existingStaff) {
    if (
      existingStaff.authSubject &&
      existingStaff.authSubject !== identity.userId
    ) {
      return null;
    }
    if (!existingStaff.authSubject) {
      await database
        .prepare(
          `UPDATE users
           SET auth_subject = ?, updated_at = ?
           WHERE id = ? AND auth_subject IS NULL`,
        )
        .bind(identity.userId, now, existingStaff.id)
        .run();
    }
    return findStaffBySubject(database, identity.userId);
  }

  const invitation = await database
    .prepare(
      `SELECT id, role
       FROM staff_invitations
       WHERE email = ? AND status = 'pending' AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(email, now)
    .first<InvitationRow>();

  if (!invitation) return null;

  const existingUser = await database
    .prepare(
      `SELECT id, auth_subject AS authSubject, display_name AS displayName
       FROM users
       WHERE lower(email) = ?
       LIMIT 1`,
    )
    .bind(email)
    .first<ExistingUserRow>();

  if (
    existingUser?.authSubject &&
    existingUser.authSubject !== identity.userId
  ) {
    return null;
  }

  const userId = existingUser?.id ?? crypto.randomUUID();
  const displayName = identity.fullName?.trim() || identity.email;
  const acceptance=await staffInvitationAcceptanceStatements(database,{invitationId:invitation.id,userId,authSubject:identity.userId,email,now});
  if(!acceptance)return null;
  const statements: D1PreparedStatement[] = [];

  if (!existingUser) {
    statements.push(
      database
        .prepare(
          `INSERT INTO users (
            id, auth_subject, email, phone, display_name, locale, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, NULL, ?, 'en-NP', 'active', ?, ?)`,
        )
        .bind(userId, identity.userId, email, displayName, now, now),
      database
        .prepare(
          `INSERT INTO user_roles (user_id, role, assigned_by, assigned_at)
           VALUES (?, 'customer', NULL, ?)`,
        )
        .bind(userId, now),
    );
  } else {
    statements.push(
      database
        .prepare(
          `UPDATE users
           SET auth_subject = ?, updated_at = ?
           WHERE id = ? AND (auth_subject IS NULL OR auth_subject = ?)`,
        )
        .bind(identity.userId, now, userId, identity.userId),
    );
  }

  statements.push(...acceptance);

  await database.batch(statements);
  return findStaffBySubject(database, identity.userId);
}

export async function getStaffUser(): Promise<StaffUser | null> {
  const identity = await getAuthenticatedUser();
  if (!identity) return null;

  const database = databaseFromEnvironment();
  return (
    (await findStaffBySubject(database, identity.userId)) ??
    acceptMatchingInvitation(database, identity)
  );
}

export async function requireStaffPage(
  returnTo: string,
  permission?: Permission | readonly Permission[],
  options: { readOnly?: boolean } = {},
): Promise<StaffUser> {
  const identity = await requireAuthenticatedUser(returnTo, options);
  const database = databaseFromEnvironment();
  const staff =
    (await findStaffBySubject(database, identity.userId)) ??
    (options.readOnly ? null : await acceptMatchingInvitation(database, identity));

  const allowed = permission === undefined ? [] : typeof permission === 'string' ? [permission] : permission;
  if (!staff || (permission !== undefined && !allowed.some(right => can(staff, right)))) {
    redirect('/staff-access-denied');
  }
  // Invitation acceptance can promote an identity during this request. Run the
  // central assurance check again after that change before returning staff data.
  await requireAuthenticatedUser(returnTo, options);
  return staff;
}

export async function requireStaffApi(
  permission: Permission,
  options?: { intendedActorId?: string },
): Promise<StaffUser> {
  const identity = await getAuthenticatedUser({ readOnly: options !== undefined });
  if (!identity) {
    throw new StaffAuthorizationError('Authentication is required.', 401);
  }

  const database = databaseFromEnvironment();
  const existing = await findStaffBySubject(database, identity.userId);
  // An old rendered workspace may reject a new identity; it may never accept an
  // invitation or bootstrap access for that identity as a side effect of rejection.
  if (options && (!existing || (options.intendedActorId!==undefined&&existing.id !== options.intendedActorId) ||
      existing.authSubject !== identity.userId)) {
    throw new StaffAuthorizationError('Refresh the current staff workspace.', 403);
  }
  const staff = existing ?? (await acceptMatchingInvitation(database, identity));

  if (!staff || !can(staff, permission)) {
    if(staff)await recordStaffAuthorizationOutcome(database,{actorId:staff.id,permission,outcome:'denied'});
    throw new StaffAuthorizationError('Staff access is not permitted.', 403);
  }
  const confirmedIdentity = await getAuthenticatedUser({ readOnly: options !== undefined });
  if(!confirmedIdentity)throw new StaffAuthorizationError('Complete account security verification.',401);
  if(options && confirmedIdentity.userId !== identity.userId)
    throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
  if(options && !await database.prepare(`SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE HEX(u.id)=HEX(?) AND HEX(u.auth_subject)=HEX(?) AND HEX(u.status)=HEX('active')
      AND HEX(r.role)=HEX(?) LIMIT 1`).bind(staff.id,identity.userId,staff.role).first())
    throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
  return staff;
}
