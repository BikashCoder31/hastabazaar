import { readIdentityFormBody } from '@/lib/auth/identity-form-body';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { env } from 'cloudflare:workers';


import { checkEmailOtpChallenge, clearEmailOtpCookie, emailOtpTokenHash, readEmailOtpCookie } from '@/lib/auth/email-otp';
import { D1EmailOtpStore } from '@/lib/auth/email-otp-d1-store';
import { createHostedSessionForUser, hostedSessionCookie } from '@/lib/auth/hosted-session';
import { requireDatabase } from '@/lib/db/d1';
import { consumeAuthenticationRateLimit as consumeRequestRateLimit } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import { configuredMultipartAnswers, validateSellerFormSubmission } from '@/lib/forms/submission';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { assertNoIdentitySecrets, buildIdentityVersionGuard, identityVersionChanged } from '@/lib/auth/identity-form-answers';

function failed(request: Request, returnTo: string, error: string): Response {
  const location = new URL('/login/code', request.url);
  location.searchParams.set('return_to', returnTo);
  location.searchParams.set('error', error);
  return new Response(null, {
    status: 303,
    headers: { Location: location.pathname + location.search, 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return new Response('Cross-site requests are not allowed.', { status: 403 });
  let data: FormData; try {data=await readIdentityFormBody(request);} catch {return new Response('Invalid or oversized form.',{status:413});}
  const codeValue = data.get('code');
  const returnValue = data.get('return_to');
  const code = (typeof codeValue === 'string' ? codeValue : '').trim().slice(0, 6);
  const returnTo = safeSignInReturnPath(typeof returnValue === 'string' ? returnValue : '/account');
  const token = readEmailOtpCookie(request.headers);
  if (!token || !/^\d{6}$/.test(code)) return failed(request, returnTo, 'invalid');

  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const rateLimit = await consumeRequestRateLimit(database, request, {
    scope: `email-otp-verify:${token.slice(0, 16)}`,
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!rateLimit.allowed) return failed(request, returnTo, 'rate');

  const store = new D1EmailOtpStore(database);
  const tokenHash = emailOtpTokenHash(token);
  const challenge = await store.findChallenge(tokenHash);
  if (!challenge) return failed(request, returnTo, 'invalid');
  const now = Date.now();
  const status = checkEmailOtpChallenge(challenge, token, code, now);
  if (status === 'invalid') await store.recordFailedAttempt(tokenHash);
  if (status !== 'valid') return failed(request, returnTo, 'invalid');

  let submission: Awaited<ReturnType<typeof validateSellerFormSubmission>>;
  let requestId: string;
  try {
    const config = await resolvePublishedForm(database, 'identity.email-code-verify');
    const parsed = configuredMultipartAnswers(data, config);
    requestId = parsed.requestId;
    submission = await validateSellerFormSubmission(database, 'identity.email-code-verify', parsed.version, parsed.customAnswers);
    assertNoIdentitySecrets(submission.answers, [code], request.headers,
      { rejectNumericSecrets: true });
  } catch (error) {
    if (error instanceof FormRuntimeError) return new Response('Form configuration changed. Refresh and retry.', { status: error.retryable ? 503 : 409 });
    if (error instanceof FormValidationError) return new Response(error.fieldId ? `Invalid answer for ${error.fieldId}.` : 'Invalid form answers.', { status: 422 });
    throw error;
  }
  const linkedAnswer = buildFormAnswerInsert(database, { formId: 'identity.email-code-verify', requestId,
    versionId: submission.versionId, subjectType: 'user', subjectId: challenge.userId,
    actorId: challenge.userId, answers: submission.answers, now });
  const claim = database.prepare(`UPDATE email_login_challenges SET consumed_at=?
    WHERE token_hash=? AND code_hash=? AND consumed_at IS NULL AND expires_at>? AND attempts<5
      AND EXISTS(SELECT 1 FROM users WHERE users.id=email_login_challenges.user_id AND users.status='active')`)
    .bind(now, challenge.tokenHash, challenge.codeHash, now);
  let session: string;
  try {
    session = await createHostedSessionForUser(database, challenge.userId, now,
      { mailbox: true }, linkedAnswer, claim,
      buildIdentityVersionGuard(database, 'identity.email-code-verify', submission.versionId));
  } catch (error) {
    const used = await database.prepare('SELECT id FROM form_answer_sets WHERE form_id=? AND request_id=? LIMIT 1')
      .bind('identity.email-code-verify', requestId).first();
    if (used) return new Response('Request reference already used.', { status: 409 });
    if (await identityVersionChanged(database, 'identity.email-code-verify', submission.versionId))
      return new Response('Form configuration changed. Refresh and retry.', { status: 409 });
    throw error;
  }
  const headers = new Headers({ Location: returnTo, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', hostedSessionCookie(session));
  headers.append('Set-Cookie', clearEmailOtpCookie());
  return new Response(null, { status: 303, headers });
}
