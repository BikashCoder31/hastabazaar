import { randomUUID } from 'node:crypto';
import { checkEmailOtpChallenge, emailOtpTokenHash } from './email-otp';
import { PasswordResetStore } from './password-reset-store';
import { passwordRecord } from './hosted-session';

export const resetCookieName = 'hastabazaar_password_reset';
export function resetCookie(token: string, clear = false) {
  return `${resetCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export function readResetCookie(headers: Headers) {
  return (
    (headers.get('cookie') ?? '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(resetCookieName + '='))
      ?.slice(resetCookieName.length + 1) ?? ''
  );
}

export async function resetPassword(
  db: D1Database,
  token: string,
  code: string,
  password: string,
  now = Date.now(),
  linkedAnswer?: (userId: string) => D1PreparedStatement,
  versionGuard?: D1PreparedStatement,
): Promise<boolean> {
  if (
    password.length < 10 ||
    password.length > 256 ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  )
    return false;
  const store = new PasswordResetStore(db);
  const record = await store.findChallenge(emailOtpTokenHash(token));
  if (!record) return false;
  const status = checkEmailOtpChallenge(record, token, code, now);
  if (status !== 'valid') {
    if (status === 'invalid') await store.recordFailedAttempt(record.tokenHash);
    return false;
  }
  const passwordData = await passwordRecord(password);
  const completion = randomUUID();
  // The claim and every credential/session change commit together. A replay or
  // racing request cannot act using another request's completion marker.
  const owner =
    'SELECT user_id FROM password_reset_challenges WHERE token_hash=? AND completion_id=?';
  const statements = [
    db
      .prepare(`UPDATE password_reset_challenges SET consumed_at=?, completion_id=?
      WHERE token_hash=? AND code_hash=? AND consumed_at IS NULL AND expires_at>? AND attempts<5
      AND EXISTS (SELECT 1 FROM users WHERE users.id=password_reset_challenges.user_id AND users.status='active')`)
      .bind(now, completion, record.tokenHash, record.codeHash, now),
    db
      .prepare(`INSERT OR IGNORE INTO user_credentials(user_id,password_hash,password_salt,password_version,created_at,updated_at)
      SELECT user_id,?,?,1,?,? FROM password_reset_challenges WHERE token_hash=? AND completion_id=?`)
      .bind(
        passwordData.hash,
        passwordData.salt,
        now,
        now,
        record.tokenHash,
        completion,
      ),
    db
      .prepare(
        `UPDATE user_credentials SET password_hash=?,password_salt=?,password_version=password_version+1,updated_at=? WHERE user_id IN (${owner})`,
      )
      .bind(
        passwordData.hash,
        passwordData.salt,
        now,
        record.tokenHash,
        completion,
      ),
    db.prepare(`INSERT OR IGNORE INTO account_email_verifications(user_id,email,verified_at)
      SELECT u.id,lower(u.email),? FROM users u WHERE u.id IN (${owner})`).bind(now,record.tokenHash,completion),
    db
      .prepare(`DELETE FROM user_sessions WHERE user_id IN (${owner})`)
      .bind(record.tokenHash, completion),
    db
      .prepare(`DELETE FROM email_login_challenges WHERE user_id IN (${owner})`)
      .bind(record.tokenHash, completion),
    db
      .prepare(`UPDATE password_reset_challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL
      AND EXISTS (SELECT 1 FROM user_credentials WHERE user_id=? AND password_hash=?)`)
      .bind(now, record.userId, record.userId, passwordData.hash),
  ];
  if (linkedAnswer) {
    // The challenge claim carries a random completion marker. This guard
    // aborts the batch if another request consumed it before this one.
    statements.push(db.prepare(`SELECT CASE WHEN EXISTS(
      SELECT 1 FROM password_reset_challenges WHERE token_hash=? AND completion_id=?
    ) THEN 1 ELSE json_extract('invalid', '$') END`).bind(record.tokenHash, completion));
    statements.push(linkedAnswer(record.userId));
  }
  if (versionGuard) statements.unshift(versionGuard);
  const results = await db.batch(statements);
  return Number(results[versionGuard ? 1 : 0].meta.changes ?? 0) === 1;
}
