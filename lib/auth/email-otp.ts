import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const emailOtpLifetimeMs = 10 * 60_000;
export const emailOtpMaximumAttempts = 5;
export const emailOtpCookieName = 'hastabazaar_email_otp';

export type EmailOtpChallengeRecord = {
  tokenHash: string;
  codeHash: string;
  userId: string;
  attempts: number;
  expiresAt: number;
  createdAt: number;
  consumedAt: number | null;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function emailOtpTokenHash(token: string): string {
  return sha256(token);
}

function codeHash(token: string, code: string): string {
  return sha256(`${token}\n${code}`);
}

export function createEmailOtpChallenge(options: {
  userId: string;
  now?: number;
  token?: string;
  code?: string;
}): { token: string; code: string; record: EmailOtpChallengeRecord } {
  const now = options.now ?? Date.now();
  const token = options.token ?? Buffer.from(randomBytes(32)).toString('base64url');
  const code = options.code ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
  if (!/^\d{6}$/.test(code)) throw new Error('Email sign-in codes must contain exactly six digits.');
  return {
    token,
    code,
    record: {
      tokenHash: emailOtpTokenHash(token),
      codeHash: codeHash(token, code),
      userId: options.userId,
      attempts: 0,
      expiresAt: now + emailOtpLifetimeMs,
      createdAt: now,
      consumedAt: null,
    },
  };
}

export function checkEmailOtpChallenge(
  record: EmailOtpChallengeRecord,
  token: string,
  code: string,
  now = Date.now(),
): 'valid' | 'invalid' | 'expired' | 'consumed' | 'attempts' {
  if (record.consumedAt !== null) return 'consumed';
  if (now >= record.expiresAt) return 'expired';
  if (record.attempts >= emailOtpMaximumAttempts) return 'attempts';
  if (!/^\d{6}$/.test(code)) return 'invalid';
  const actualTokenHash = Buffer.from(sha256(token), 'hex');
  const expectedTokenHash = Buffer.from(record.tokenHash, 'hex');
  const actualCodeHash = Buffer.from(codeHash(token, code), 'hex');
  const expectedCodeHash = Buffer.from(record.codeHash, 'hex');
  const tokenMatches = actualTokenHash.length === expectedTokenHash.length
    && timingSafeEqual(actualTokenHash, expectedTokenHash);
  const codeMatches = actualCodeHash.length === expectedCodeHash.length
    && timingSafeEqual(actualCodeHash, expectedCodeHash);
  return tokenMatches && codeMatches ? 'valid' : 'invalid';
}

export function emailOtpCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${emailOtpCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

export function clearEmailOtpCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${emailOtpCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readEmailOtpCookie(headers: Headers): string | null {
  const prefix = `${emailOtpCookieName}=`;
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
