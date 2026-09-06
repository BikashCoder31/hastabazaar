import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';

import {
  getChatGPTUser,
  requireChatGPTUser,
  type ChatGPTUser,
} from '@/app/chatgpt-auth';
import { ensureConfiguredStaffBootstrap } from '@/lib/auth/staff-bootstrap';
import { requireDatabase } from '@/lib/db/d1';
import { can, type Permission } from '@/lib/marketplace/permissions';
import type { MarketplaceRole } from '@/lib/marketplace/types';

export type StaffRole = Extract<MarketplaceRole, 'admin' | 'super_admin'>;

export interface StaffUser {
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

  return row ?? null;
}

async function acceptMatchingInvitation(
  database: D1Database,
  identity: ChatGPTUser,
): Promise<StaffUser | null> {
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
      superAdminEmail: bindings.HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL,
      adminEmail: bindings.HASTABAZAAR_STAGING_ADMIN_EMAIL,
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

  statements.push(
    database
      .prepare(
        `INSERT OR IGNORE INTO user_roles (user_id, role, assigned_by, assigned_at)
         SELECT ?, role, invited_by, ?
         FROM staff_invitations
         WHERE id = ? AND status = 'pending' AND expires_at > ?`,
      )
      .bind(userId, now, invitation.id, now),
    database
      .prepare(
        `UPDATE staff_invitations
         SET status = 'accepted', accepted_by = ?, accepted_at = ?
         WHERE id = ? AND status = 'pending' AND expires_at > ?`,
      )
      .bind(userId, now, invitation.id, now),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) VALUES (?, ?, 'staff.invitation.accepted', 'staff_invitation', ?,
          'Invited staff member authenticated and accepted access', NULL, ?,
          NULL, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        invitation.id,
        JSON.stringify({ email, role: invitation.role }),
        now,
      ),
  );

  await database.batch(statements);
  return findStaffBySubject(database, identity.userId);
}

export async function getStaffUser(): Promise<StaffUser | null> {
  const identity = await getChatGPTUser();
  if (!identity) return null;

  const database = databaseFromEnvironment();
  return (
    (await findStaffBySubject(database, identity.userId)) ??
    acceptMatchingInvitation(database, identity)
  );
}

export async function requireStaffPage(
  returnTo: string,
  permission?: Permission,
): Promise<StaffUser> {
  const identity = await requireChatGPTUser(returnTo);
  const database = databaseFromEnvironment();
  const staff =
    (await findStaffBySubject(database, identity.userId)) ??
    (await acceptMatchingInvitation(database, identity));

  if (!staff || (permission && !can(staff.role, permission))) {
    redirect('/staff-access-denied');
  }
  return staff;
}

export async function requireStaffApi(
  permission: Permission,
): Promise<StaffUser> {
  const identity = await getChatGPTUser();
  if (!identity) {
    throw new StaffAuthorizationError('Authentication is required.', 401);
  }

  const database = databaseFromEnvironment();
  const staff =
    (await findStaffBySubject(database, identity.userId)) ??
    (await acceptMatchingInvitation(database, identity));

  if (!staff || !can(staff.role, permission)) {
    throw new StaffAuthorizationError('Staff access is not permitted.', 403);
  }
  return staff;
}
