import {
  checkEmailOtpChallenge,
  createEmailOtpChallenge,
  emailOtpTokenHash,
  type EmailOtpChallengeRecord,
} from '@/lib/auth/email-otp';

export interface EmailOtpStore {
  findActiveUserByEmail(email: string): Promise<{ id: string; email: string } | null>;
  replaceChallenge(record: EmailOtpChallengeRecord): Promise<void>;
  findChallenge(tokenHash: string): Promise<EmailOtpChallengeRecord | null>;
  recordFailedAttempt(tokenHash: string): Promise<void>;
  consumeChallenge(tokenHash: string, consumedAt: number): Promise<boolean>;
  deleteChallenge(tokenHash: string): Promise<void>;
}

export async function requestEmailOtp(
  store: EmailOtpStore,
  email: string,
  deliver: (email: string, code: string) => Promise<void>,
  now = Date.now(),
  fixed?: { token: string; code?: string },
): Promise<{ token: string; delivered: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await store.findActiveUserByEmail(normalizedEmail);
  const challenge = createEmailOtpChallenge({
    userId: user?.id ?? 'unknown-account',
    now,
    token: fixed?.token,
    code: fixed?.code,
  });
  if (!user) return { token: challenge.token, delivered: false };

  await store.replaceChallenge(challenge.record);
  try {
    await deliver(user.email, challenge.code);
  } catch (error) {
    await store.deleteChallenge(challenge.record.tokenHash);
    throw error;
  }
  return { token: challenge.token, delivered: true };
}

export async function verifyEmailOtp(
  store: EmailOtpStore,
  token: string,
  code: string,
  now = Date.now(),
): Promise<{ status: 'valid' | 'invalid' | 'expired' | 'consumed' | 'attempts'; userId?: string }> {
  const tokenHash = emailOtpTokenHash(token);
  const record = await store.findChallenge(tokenHash);
  if (!record) return { status: 'invalid' };
  const status = checkEmailOtpChallenge(record, token, code, now);
  if (status === 'invalid') {
    await store.recordFailedAttempt(tokenHash);
    return { status };
  }
  if (status !== 'valid') return { status };
  if (!(await store.consumeChallenge(tokenHash, now))) return { status: 'consumed' };
  return { status: 'valid', userId: record.userId };
}
