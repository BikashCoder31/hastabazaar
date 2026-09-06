import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';

import { getChatGPTUser, requireChatGPTUser, type ChatGPTUser } from '@/app/chatgpt-auth';
import { requireDatabase } from '@/lib/db/d1';

export interface SellerUser {
  userId: string;
  sellerId: string;
  authSubject: string;
  email: string;
  displayName: string;
  tradingName: string;
  status: 'approved';
}

type SellerRow = SellerUser;

export class SellerAuthorizationError extends Error {
  constructor(message: string, readonly status: 401 | 403) {
    super(message);
    this.name = 'SellerAuthorizationError';
  }
}

function databaseFromEnvironment(): D1Database {
  return requireDatabase(env as unknown as { DB?: D1Database });
}

async function findSellerBySubject(
  database: D1Database,
  authSubject: string,
): Promise<SellerUser | null> {
  return (
    (await database
      .prepare(
        `SELECT users.id AS userId, seller_profiles.id AS sellerId,
          users.auth_subject AS authSubject, users.email,
          users.display_name AS displayName,
          seller_profiles.trading_name AS tradingName,
          seller_profiles.status
         FROM users
         INNER JOIN user_roles ON user_roles.user_id = users.id AND user_roles.role = 'seller'
         INNER JOIN seller_profiles ON seller_profiles.user_id = users.id
         WHERE users.auth_subject = ? AND users.status = 'active'
           AND seller_profiles.status = 'approved'
         LIMIT 1`,
      )
      .bind(authSubject)
      .first<SellerRow>()) ?? null
  );
}

async function resolveSeller(
  database: D1Database,
  identity: ChatGPTUser,
): Promise<SellerUser | null> {
  const bySubject = await findSellerBySubject(database, identity.userId);
  if (bySubject) return bySubject;

  const matching = await database
    .prepare(
      `SELECT users.id AS userId, users.auth_subject AS authSubject
       FROM users
       INNER JOIN user_roles ON user_roles.user_id = users.id AND user_roles.role = 'seller'
       INNER JOIN seller_profiles ON seller_profiles.user_id = users.id
       WHERE lower(users.email) = ? AND users.status = 'active'
         AND seller_profiles.status = 'approved'
       LIMIT 1`,
    )
    .bind(identity.email.trim().toLowerCase())
    .first<{ userId: string; authSubject: string | null }>();

  if (!matching || (matching.authSubject && matching.authSubject !== identity.userId)) {
    return null;
  }
  if (!matching.authSubject) {
    await database
      .prepare(
        `UPDATE users SET auth_subject = ?, updated_at = ?
         WHERE id = ? AND auth_subject IS NULL`,
      )
      .bind(identity.userId, Date.now(), matching.userId)
      .run();
  }
  return findSellerBySubject(database, identity.userId);
}

export async function requireSellerPage(returnTo: string): Promise<SellerUser> {
  const identity = await requireChatGPTUser(returnTo);
  const seller = await resolveSeller(databaseFromEnvironment(), identity);
  if (!seller) redirect('/seller-access-denied');
  return seller;
}

export async function requireSellerApi(): Promise<SellerUser> {
  const identity = await getChatGPTUser();
  if (!identity) throw new SellerAuthorizationError('Authentication is required.', 401);
  const seller = await resolveSeller(databaseFromEnvironment(), identity);
  if (!seller) throw new SellerAuthorizationError('Approved seller access is required.', 403);
  return seller;
}
