import { mailboxClaimStatements } from './mailbox-verification';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { ADMIN_ABSOLUTE_MS } from '../security/model';
import { SecurityStore } from '../security/store';
import { passwordChallengeStatements } from '../security/password-challenge';
import {
  staffSessionIsVerified,
  sellerSessionIsVerified,
  passwordOnlyProofStatements,
} from '../security/session';

export const hostedSessionCookieName = 'hastabazaar_session';
const sessionLifetimeSeconds = 30 * 24 * 60 * 60;

export type HostedIdentity = {
  mailboxVerified?: boolean;
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

type CredentialRow = HostedIdentity & {
  accountId: string;
  passwordHash: string;
  passwordSalt: string;
};

function parseCookie(headers: Headers, name: string): string | null {
  const prefix = `${name}=`;
  const part = (headers.get('cookie') ?? '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  if (!part) return null;
  try {
    return decodeURIComponent(part.slice(prefix.length));
  } catch {
    return null;
  }
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hostedSessionHash(requestHeaders: Headers): string | null {
  const token = parseCookie(requestHeaders, hostedSessionCookieName);
  return token ? tokenHash(token) : null;
}

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1 }, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

export async function passwordRecord(password: string): Promise<{
  hash: string;
  salt: string;
}> {
  const salt = Buffer.from(randomBytes(16)).toString('base64url');
  const hash = Buffer.from(await derivePassword(password, salt)).toString(
    'base64',
  );
  return { hash, salt };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const expected = Buffer.from(hash, 'base64');
  const actual = await derivePassword(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function findCredentialByEmail(
  database: D1Database,
  email: string,
): Promise<CredentialRow | null> {
  return database
    .prepare(
      `SELECT users.id AS accountId, users.auth_subject AS userId, users.display_name AS displayName,
        users.email, users.display_name AS fullName,
        user_credentials.password_hash AS passwordHash,
        user_credentials.password_salt AS passwordSalt
       FROM users
       INNER JOIN user_credentials ON user_credentials.user_id = users.id
       WHERE lower(users.email) = ? AND users.status = 'active'
       LIMIT 1`,
    )
    .bind(email.trim().toLowerCase())
    .first<CredentialRow>();
}

export async function createHostedSession(
  database: D1Database,
  authSubject: string,
  now = Date.now(),
): Promise<string> {
  const user = await database
    .prepare(
      "SELECT id FROM users WHERE auth_subject = ? AND status = 'active' LIMIT 1",
    )
    .bind(authSubject)
    .first<{ id: string }>();
  if (!user) throw new Error('The account is not available.');
  return createHostedSessionForUser(database, user.id, now);
}

export async function createHostedSessionForUser(
  database: D1Database,
  userId: string,
  now = Date.now(),
  proof: {
    mailbox?: boolean;
    passwordHash?: string;
    securityKey?: string;
    initialized?: boolean;
  } = {},
  linkedStatement?: D1PreparedStatement,
  claimStatement?: D1PreparedStatement,
  versionGuard?: D1PreparedStatement | D1PreparedStatement[],
): Promise<string> {
  const user = await database
    .prepare(
      "SELECT id, EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=users.id AND r.role IN ('admin','super_admin')) AS isStaff, EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=users.id AND r.role='seller') AS isSeller FROM users WHERE id = ? AND status = 'active' LIMIT 1",
    )
    .bind(userId)
    .first<{ id: string; isStaff: number; isSeller: number }>();
  if (!user) throw new Error('The account is not available.');

  const token = Buffer.from(randomBytes(32)).toString('base64url');
  const statements = proof.mailbox
    ? mailboxClaimStatements(database, user.id, now)
    : [
        database
          .prepare('UPDATE users SET updated_at=updated_at WHERE id=?')
          .bind(user.id),
      ];
  // Check proofs after acquiring the account lock, before mailbox rotation
  // deletes the originating session.
  if (versionGuard)
    statements.splice(
      1,
      0,
      ...(Array.isArray(versionGuard) ? versionGuard : [versionGuard]),
    );
  if (claimStatement) {
    statements.push(claimStatement);
    statements.push(
      database.prepare(`SELECT CASE WHEN changes()=1
      THEN 1 ELSE json_extract('invalid', '$') END`),
    );
  }
  statements.push(
    database
      .prepare(`INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at, last_seen_at)
    SELECT ?,id,?,?,? FROM users WHERE id=? AND status='active'
    AND (? IS NULL OR EXISTS(SELECT 1 FROM user_credentials c WHERE c.user_id=users.id AND c.password_hash=?))`)
      .bind(
        tokenHash(token),
        now +
          (user.isStaff ? ADMIN_ABSOLUTE_MS : sessionLifetimeSeconds * 1_000),
        now,
        now,
        user.id,
        proof.passwordHash ?? null,
        proof.passwordHash ?? null,
      ),
  );
  const sessionIndex = statements.length - 1;
  if (
    (user.isStaff || user.isSeller) &&
    proof.passwordHash &&
    proof.securityKey
  ) {
    if (user.isStaff)
      statements.push(
        ...(await passwordOnlyProofStatements(
          database,
          user.id,
          tokenHash(token),
          proof.passwordHash,
          proof.securityKey,
          proof.initialized ?? false,
          now,
        )),
      );
    statements.push(
      ...(await passwordChallengeStatements(
        new SecurityStore(
          database,
          proof.securityKey,
          proof.initialized ?? false,
        ),
        user.id,
        tokenHash(token),
        proof.passwordHash,
        now,
      )),
    );
  }
  if (linkedStatement) {
    // Fail the whole batch if the credential or active-account proof changed
    // after the initial read. A request ID never grants a session.
    statements.push(
      database
        .prepare(`SELECT CASE WHEN EXISTS(
      SELECT 1 FROM user_sessions WHERE token_hash=? AND user_id=?
    ) THEN 1 ELSE json_extract('invalid', '$') END`)
        .bind(tokenHash(token), user.id),
    );
    statements.push(linkedStatement);
  }
  const results = await database.batch(statements);
  if (Number(results[sessionIndex].meta.changes) !== 1)
    throw new Error('Sign-in changed. Please try again.');
  return token;
}

export type HostedSessionIdentity = HostedIdentity & {
  accountId: string;
  lastSeenAt: number;
  createdAt: number;
  expiresAt: number;
  isStaff: number;
  isSeller?: number;
};

/** Raw first-factor session for the restricted security ceremony only. No activity touch. */
export async function readHostedSession(
  database: D1Database,
  requestHeaders: Headers,
  now = Date.now(),
): Promise<HostedSessionIdentity | null> {
  const token = parseCookie(requestHeaders, hostedSessionCookieName);
  if (!token) return null;
  const row = await database
    .prepare(
      `SELECT users.id AS accountId, users.auth_subject AS userId, users.display_name AS displayName,
        users.email, users.display_name AS fullName,
        user_sessions.last_seen_at AS lastSeenAt, user_sessions.created_at AS createdAt, user_sessions.expires_at AS expiresAt,
        EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=users.id AND r.role IN ('admin','super_admin')) AS isStaff,
        EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=users.id AND r.role='seller') AS isSeller,
        EXISTS(SELECT 1 FROM account_email_verifications v WHERE v.user_id=users.id AND v.email=lower(users.email)) AS mailboxVerified
       FROM user_sessions
       INNER JOIN users ON users.id = user_sessions.user_id
       WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?
         AND users.status = 'active'
       LIMIT 1`,
    )
    .bind(tokenHash(token), now)
    .first<HostedSessionIdentity>();
  return row;
}

export async function getHostedIdentity(
  database: D1Database,
  requestHeaders: Headers,
  now = Date.now(),
  options: {
    securityKey?: string;
    activity?: boolean;
    initialized?: boolean;
  } = {},
): Promise<HostedIdentity | null> {
  const row = await readHostedSession(database, requestHeaders, now);
  if (!row) return null;
  if (
    row.isStaff &&
    !(await staffSessionIsVerified(
      database,
      row,
      hostedSessionHash(requestHeaders)!,
      options.securityKey,
      now,
      options.activity ?? true,
      options.initialized,
    ))
  )
    return null;
  if (
    !row.isStaff &&
    row.isSeller &&
    !(await sellerSessionIsVerified(
      database,
      row,
      hostedSessionHash(requestHeaders)!,
      options.securityKey,
      now,
      options.activity ?? true,
      options.initialized,
    ))
  )
    return null;
  // Seller applications predate sign-in and initially have no auth subject.
  // Only link the account proven by this valid server-side session. Preserve
  // existing provider identities and re-read after the conditional update.
  if (!row.userId) {
    await database
      .prepare(
        'UPDATE users SET auth_subject = ?, updated_at = ? WHERE id = ? AND auth_subject IS NULL',
      )
      .bind(`local:${row.accountId}`, now, row.accountId)
      .run();
    const linked = await database
      .prepare(
        "SELECT auth_subject AS userId FROM users WHERE id = ? AND status = 'active' LIMIT 1",
      )
      .bind(row.accountId)
      .first<{ userId: string | null }>();
    if (!linked?.userId) return null;
    row.userId = linked.userId;
  }
  if (
    (!row.isStaff || (options.activity ?? true)) &&
    now - row.lastSeenAt > (row.isStaff ? 60_000 : 60 * 60_000)
  ) {
    await database
      .prepare(
        'UPDATE user_sessions SET last_seen_at = ? WHERE token_hash = ? AND last_seen_at < ? AND expires_at > ?',
      )
      .bind(now, hostedSessionHash(requestHeaders), now, now)
      .run();
  }
  return {
    userId: row.userId,
    displayName: row.displayName,
    email: row.email,
    fullName: row.fullName,
    mailboxVerified: Boolean(row.mailboxVerified),
  };
}

export async function revokeHostedSession(
  database: D1Database,
  requestHeaders: Headers,
): Promise<void> {
  const token = parseCookie(requestHeaders, hostedSessionCookieName);
  if (!token) return;
  await database
    .prepare('DELETE FROM user_sessions WHERE token_hash = ?')
    .bind(tokenHash(token))
    .run();
}

export function hostedSessionCookie(
  token: string,
  lifetimeSeconds = sessionLifetimeSeconds,
): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${hostedSessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetimeSeconds}${secure}`;
}

export function clearHostedSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${hostedSessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
