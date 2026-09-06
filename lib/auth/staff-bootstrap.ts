export interface StaffBootstrapConfiguration {
  superAdminEmail?: string;
  adminEmail?: string;
}

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

async function createBootstrapInvitation(
  database: D1Database,
  email: string,
  role: 'admin' | 'super_admin',
  now: number,
): Promise<boolean> {
  const invitationId = crypto.randomUUID();
  const expiresAt = now + invitationLifetimeMs;
  const result = await database
    .prepare(
      `INSERT OR IGNORE INTO staff_invitations (
        id, email, role, status, invited_by, accepted_by, expires_at,
        created_at, accepted_at, revoked_at
      )
      SELECT ?, ?, ?, 'pending', NULL, NULL, ?, ?, NULL, NULL
      WHERE NOT EXISTS (
        SELECT 1
        FROM users
        INNER JOIN user_roles ON user_roles.user_id = users.id
        WHERE lower(users.email) = ?
          AND users.status = 'active'
          AND user_roles.role IN ('admin', 'super_admin')
      )`,
    )
    .bind(invitationId, email, role, expiresAt, now, email)
    .run();

  if ((result.meta.changes ?? 0) !== 1) return false;

  await database
    .prepare(
      `INSERT INTO audit_logs (
        id, actor_id, action, subject_type, subject_id, reason,
        previous_json, next_json, request_id, ip_hash, created_at
      ) VALUES (?, NULL, 'staff.bootstrap.invitation.created',
        'staff_invitation', ?, 'Configured staging staff bootstrap',
        NULL, ?, NULL, NULL, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      invitationId,
      JSON.stringify({ email, role, expiresAt }),
      now,
    )
    .run();
  return true;
}

export async function ensureConfiguredStaffBootstrap(
  database: D1Database,
  identityEmail: string,
  configuration: StaffBootstrapConfiguration,
  now: number,
): Promise<readonly ('admin' | 'super_admin')[]> {
  const superAdminEmail = normalizeEmail(configuration.superAdminEmail);
  if (!superAdminEmail || normalizeEmail(identityEmail) !== superAdminEmail) {
    return [];
  }

  const existingSuperAdmin = await database
    .prepare(
      `SELECT 1 AS present
       FROM users
       INNER JOIN user_roles ON user_roles.user_id = users.id
       WHERE users.status = 'active' AND user_roles.role = 'super_admin'
       LIMIT 1`,
    )
    .first<{ present: number }>();
  if (existingSuperAdmin) return [];

  const created: ('admin' | 'super_admin')[] = [];
  if (
    await createBootstrapInvitation(
      database,
      superAdminEmail,
      'super_admin',
      now,
    )
  ) {
    created.push('super_admin');
  }

  const adminEmail = normalizeEmail(configuration.adminEmail);
  if (
    adminEmail &&
    adminEmail !== superAdminEmail &&
    (await createBootstrapInvitation(database, adminEmail, 'admin', now))
  ) {
    created.push('admin');
  }
  return created;
}
