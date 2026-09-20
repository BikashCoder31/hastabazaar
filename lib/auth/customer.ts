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
}

export class CustomerAuthorizationError extends Error {
  constructor(message: string, readonly status: 401 | 403) {
    super(message);
    this.name = 'CustomerAuthorizationError';
  }
}

function databaseFromEnvironment(): D1Database {
  return requireDatabase(env as unknown as { DB?: D1Database });
}

async function findCustomerBySubject(database: D1Database, authSubject: string): Promise<CustomerUser | null> {
  return (await database.prepare(
    `SELECT users.id AS userId, users.auth_subject AS authSubject, users.email,
      users.phone, users.display_name AS displayName, users.locale
     FROM users
     INNER JOIN user_roles ON user_roles.user_id = users.id AND user_roles.role = 'customer'
     WHERE users.auth_subject = ? AND users.status = 'active' LIMIT 1`,
  ).bind(authSubject).first<CustomerUser>()) ?? null;
}

async function resolveCustomer(database: D1Database, identity: AuthenticatedUser): Promise<CustomerUser> {
  const bySubject = await findCustomerBySubject(database, identity.userId);
  if (bySubject) return bySubject;

  const email = identity.email.trim().toLowerCase();
  const existing = await database.prepare(
    `SELECT id, auth_subject AS authSubject FROM users WHERE lower(email) = ? LIMIT 1`,
  ).bind(email).first<{ id: string; authSubject: string | null }>();
  if (existing?.authSubject && existing.authSubject !== identity.userId) {
    throw new CustomerAuthorizationError('This email is already linked to another sign-in identity.', 403);
  }

  const now = Date.now();
  const userId = existing?.id ?? crypto.randomUUID();
  const displayName = identity.fullName?.trim() || identity.email;
  const statements: D1PreparedStatement[] = existing
    ? [database.prepare(
      `UPDATE users SET auth_subject = ?, display_name = CASE WHEN trim(display_name) = '' THEN ? ELSE display_name END,
        updated_at = ? WHERE id = ? AND (auth_subject IS NULL OR auth_subject = ?)`,
    ).bind(identity.userId, displayName, now, userId, identity.userId)]
    : [database.prepare(
      `INSERT INTO users (id, auth_subject, email, phone, display_name, locale, status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, 'en-NP', 'active', ?, ?)`,
    ).bind(userId, identity.userId, email, displayName, now, now)];
  statements.push(database.prepare(
    `INSERT OR IGNORE INTO user_roles (user_id, role, assigned_by, assigned_at)
     VALUES (?, 'customer', NULL, ?)`,
  ).bind(userId, now));
  await database.batch(statements);
  const customer = await findCustomerBySubject(database, identity.userId);
  if (!customer) throw new CustomerAuthorizationError('The customer account could not be created.', 403);
  return customer;
}

export async function getCustomerUser(): Promise<CustomerUser | null> {
  const identity = await getAuthenticatedUser();
  if (!identity) return null;
  return resolveCustomer(databaseFromEnvironment(), identity);
}

export async function requireCustomerPage(returnTo: string): Promise<CustomerUser> {
  const identity = await requireAuthenticatedUser(returnTo);
  try {
    return await resolveCustomer(databaseFromEnvironment(), identity);
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) redirect('/account-access-denied');
    throw error;
  }
}

export async function requireCustomerApi(): Promise<CustomerUser> {
  const identity = await getAuthenticatedUser();
  if (!identity) throw new CustomerAuthorizationError('Authentication is required.', 401);
  return resolveCustomer(databaseFromEnvironment(), identity);
}
