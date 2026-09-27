import { createEmailOtpChallenge } from './email-otp';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { buildIdentityVersionGuard, identityVersionChanged } from './identity-form-answers';

type ChallengeTable = 'email_login_challenges' | 'password_reset_challenges';
type RequestFormId = 'identity.email-code-request' | 'identity.password-reset-request';

/** An accepted request is durable before best-effort delivery starts. A retry never sends again. */
export async function acceptIdentityCodeRequest(db: D1Database, input: {
  formId: RequestFormId; challengeTable: ChallengeTable; email: string; requestId: string;
  versionId: string; answers: FormAnswerSnapshot; now: number;
  deliver: (email: string, code: string) => Promise<void>;
  minimumDelayMs?: number;
}): Promise<{ status: 'accepted'; token: string } | { status: 'duplicate' } | { status: 'stale' }> {
  const started = Date.now();
  const prior = await db.prepare('SELECT 1 AS used FROM form_answer_sets WHERE form_id=? AND request_id=? LIMIT 1')
    .bind(input.formId, input.requestId).first();
  if (prior) return { status: 'duplicate' };

  const account = await db.prepare("SELECT id,email FROM users WHERE lower(email)=? AND status='active' LIMIT 1")
    .bind(input.email).first<{ id: string; email: string }>();
  const challenge = createEmailOtpChallenge({ userId: account?.id ?? 'unknown-account', now: input.now });
  const reservation = buildFormAnswerInsert(db, { formId: input.formId, requestId: input.requestId,
    versionId: input.versionId, subjectType: 'identity_request', subjectId: input.requestId,
    actorId: null, answers: input.answers, now: input.now });
  const guard = buildIdentityVersionGuard(db, input.formId, input.versionId);
  const statements = account ? [guard,
    db.prepare(`DELETE FROM ${input.challengeTable} WHERE user_id=? AND consumed_at IS NULL`).bind(account.id),
    db.prepare(`INSERT INTO ${input.challengeTable}
      (token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at)
      VALUES (?,?,?,?,?,?,NULL)`)
      .bind(challenge.record.tokenHash, challenge.record.codeHash, account.id, 0,
        challenge.record.expiresAt, challenge.record.createdAt),
    reservation,
  ] : [guard, reservation];
  try {
    await db.batch(statements);
  } catch (error) {
    const winner = await db.prepare('SELECT 1 AS used FROM form_answer_sets WHERE form_id=? AND request_id=? LIMIT 1')
      .bind(input.formId, input.requestId).first();
    if (winner) return { status: 'duplicate' };
    if (await identityVersionChanged(db, input.formId, input.versionId)) return { status: 'stale' };
    throw error;
  }

  if (account) {
    // The challenge and answer already committed. Delivery is deliberately
    // at most once; a failed send removes only this unused challenge.
    void Promise.resolve().then(() => input.deliver(account.email, challenge.code)).catch(async () => {
      try {
        await db.prepare(`DELETE FROM ${input.challengeTable} WHERE token_hash=? AND consumed_at IS NULL`)
          .bind(challenge.record.tokenHash).run();
      } catch { /* A later cleanup can remove the expired challenge. */ }
    });
  }
  const remaining = Math.max(0, (input.minimumDelayMs ?? 5000) - (Date.now() - started));
  if (remaining) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  return { status: 'accepted', token: challenge.token };
}
