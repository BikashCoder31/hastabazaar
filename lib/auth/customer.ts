import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';

import {
  getAuthenticatedUser,
  requireAuthenticatedUser,
  type AuthenticatedUser,
} from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';

export interface CustomerUser {
  userId: string;
  authSubject: string;
  email: string;
  phone: string | null;
  displayName: string;
  locale: 'en-NP' | 'ne-NP';
  isSuperAdmin: 0 | 1;
}

export class CustomerAuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'CustomerAuthorizationError';
  }
}

function databaseFromEnvironment(): D1Database {
  return requireDatabase(env as unknown as { DB?: D1Database });
}

async function findCustomerBySubject(
  database: D1Database,
  authSubject: string,
): Promise<CustomerUser | null> {
  return (
    (await database
      .prepare(
        `SELECT users.id AS userId, users.auth_subject AS authSubject, users.email,
      users.phone, users.display_name AS displayName, users.locale,
      EXISTS (
        SELECT 1 FROM user_roles AS staff_roles
        WHERE staff_roles.user_id = users.id AND staff_roles.role = 'super_admin'
      ) AS isSuperAdmin
     FROM users
     INNER JOIN user_roles ON user_roles.user_id = users.id AND user_roles.role = 'customer'
     WHERE users.auth_subject = ? AND users.status = 'active' LIMIT 1`,
      )
      .bind(authSubject)
      .first<CustomerUser>()) ?? null
  );
}

async function resolveCustomer(
  database: D1Database,
  identity: AuthenticatedUser,
): Promise<CustomerUser> {
  const bySubject = await findCustomerBySubject(database, identity.userId);
  if (bySubject) return bySubject;

  const email = identity.email.trim().toLowerCase();
  const existing = await database
    .prepare(
      `SELECT id, auth_subject AS authSubject, status,
       EXISTS (SELECT 1 FROM user_roles WHERE user_id = users.id AND role = 'customer') AS isCustomer,
       EXISTS (SELECT 1 FROM user_roles WHERE user_id = users.id AND role IN ('admin', 'super_admin')) AS isStaff
     FROM users WHERE auth_subject = ? OR lower(email) = ?
     ORDER BY CASE WHEN auth_subject = ? THEN 0 ELSE 1 END LIMIT 1`,
    )
    .bind(identity.userId, email, identity.userId)
    .first<{
      id: string;
      authSubject: string | null;
      status: string;
      isCustomer: number;
      isStaff: number;
    }>();
  if (existing?.authSubject && existing.authSubject !== identity.userId) {
    throw new CustomerAuthorizationError(
      'This email is already linked to another sign-in identity.',
      403,
    );
  }
  if (
    existing &&
    (existing.status !== 'active' || (existing.isStaff && !existing.isCustomer))
  ) {
    throw new CustomerAuthorizationError(
      'An active customer account is required.',
      403,
    );
  }

  const now = Date.now();
  const userId = existing?.id ?? crypto.randomUUID();
  const displayName = identity.fullName?.trim() || identity.email;
  const statements: D1PreparedStatement[] = existing
    ? [
        database
          .prepare(
            `UPDATE users SET auth_subject = ?, display_name = CASE WHEN trim(display_name) = '' THEN ? ELSE display_name END,
        updated_at = ? WHERE id = ?
        AND (auth_subject = ? OR (auth_subject IS NULL AND lower(email) = ?))
        AND status = 'active'
        AND (EXISTS (SELECT 1 FROM user_roles WHERE user_id = users.id AND role = 'customer')
          OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = users.id AND role IN ('admin', 'super_admin')))`,
          )
          .bind(
            identity.userId,
            displayName,
            now,
            userId,
            identity.userId,
            email,
          ),
      ]
    : [
        database
          .prepare(
            `INSERT INTO users (id, auth_subject, email, phone, display_name, locale, status, created_at, updated_at)
       SELECT ?, ?, ?, NULL, ?, 'en-NP', 'active', ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE auth_subject = ? OR lower(email) = ?)`,
          )
          .bind(
            userId,
            identity.userId,
            email,
            displayName,
            now,
            now,
            identity.userId,
            email,
          ),
      ];
  statements.push(
    database
      .prepare(
        `INSERT OR IGNORE INTO user_roles (user_id, role, assigned_by, assigned_at)
     SELECT users.id, 'customer', NULL, ? FROM users
     WHERE users.id = ? AND users.auth_subject = ? AND users.status = 'active'
       AND (EXISTS (SELECT 1 FROM user_roles WHERE user_id = users.id AND role = 'customer')
         OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = users.id AND role IN ('admin', 'super_admin')))`,
      )
      .bind(now, userId, identity.userId),
  );
  await database.batch(statements);
  const customer = await findCustomerBySubject(database, identity.userId);
  if (!customer)
    throw new CustomerAuthorizationError(
      'The customer account could not be created.',
      403,
    );
  return customer;
}

export async function getCustomerUser(): Promise<CustomerUser | null> {
  const identity = await getAuthenticatedUser();
  if (!identity) return null;
  return resolveCustomer(databaseFromEnvironment(), identity);
}

export async function requireCustomerPage(
  returnTo: string,
): Promise<CustomerUser> {
  const identity = await requireAuthenticatedUser(returnTo);
  try {
    return await resolveCustomer(databaseFromEnvironment(), identity);
  } catch (error) {
    if (error instanceof CustomerAuthorizationError)
      redirect('/account-access-denied');
    throw error;
  }
}

export async function requireCustomerApi(): Promise<CustomerUser> {
  const identity = await getAuthenticatedUser();
  if (!identity)
    throw new CustomerAuthorizationError('Authentication is required.', 401);
  return resolveCustomer(databaseFromEnvironment(), identity);
}

/** Look up an existing customer for public browsing without writing account state. */
export async function getCustomerReadContext(): Promise<{
  customer: CustomerUser | null;
  authenticated: boolean;
}> {
  const identity = await getAuthenticatedUser({ readOnly: true });
  const customer = identity
    ? await findCustomerBySubject(databaseFromEnvironment(), identity.userId)
    : null;
  return { customer, authenticated: Boolean(identity) };
}

/** Require an existing customer without provisioning an account. */
export async function requireExistingCustomerApi(): Promise<CustomerUser> {
  const { customer, authenticated } = await getCustomerReadContext();
  if (!authenticated)
    throw new CustomerAuthorizationError('Authentication is required.', 401);
  if (!customer)
    throw new CustomerAuthorizationError(
      'An active customer account is required.',
      403,
    );
  return customer;
}
