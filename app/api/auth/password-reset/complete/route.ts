import { formText } from '@/lib/http/bounded-body';
import { readIdentityFormBody } from '@/lib/auth/identity-form-body';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import {
  readResetCookie,
  resetCookie,
  resetPassword,
} from '@/lib/auth/password-reset';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { consumeAuthenticationRateLimit as consumeRequestRateLimit } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import { configuredMultipartAnswers, validateSellerFormSubmission } from '@/lib/forms/submission';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { assertNoIdentitySecrets, buildIdentityVersionGuard, identityVersionChanged } from '@/lib/auth/identity-form-answers';

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return new Response('Cross-site requests are not allowed.', {
      status: 403,
    });
  let form: FormData; try {form=await readIdentityFormBody(request);} catch {return new Response('Invalid or oversized form.',{status:413});}
  const back = safeSignInReturnPath(
    formText(form, 'return_to', '/account'),
  );
  const password = formText(form, 'password', '');
  const confirm = formText(form, 'confirm_password', '');
  const code = formText(form, 'code', '').trim();
  const fail = (error: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `/forgot-password/reset?return_to=${encodeURIComponent(back)}&error=${error}`,
        'Cache-Control': 'no-store',
      },
    });
  if (password.length < 10 || password.length > 256 || password !== confirm)
    return fail('password');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  if (
    !(
      await consumeRequestRateLimit(db, request, {
        scope: `password-reset-complete:${readResetCookie(request.headers).slice(0,16)}`,
        limit: 10,
        windowMs: 10 * 60_000,
      })
    ).allowed
  )
    return fail('rate');
  let submission: Awaited<ReturnType<typeof validateSellerFormSubmission>>;
  let requestId: string;
  try {
    const config = await resolvePublishedForm(db, 'identity.password-reset-complete');
    const parsed = configuredMultipartAnswers(form, config);
    requestId = parsed.requestId;
    submission = await validateSellerFormSubmission(db, 'identity.password-reset-complete', parsed.version, parsed.customAnswers);
    assertNoIdentitySecrets(submission.answers, [password, confirm, code], request.headers,
      { rejectNumericSecrets: true });
  } catch (error) {
    if (error instanceof FormRuntimeError) return new Response('Form configuration changed. Refresh and retry.', { status: error.retryable ? 503 : 409 });
    if (error instanceof FormValidationError) return new Response(error.fieldId ? `Invalid answer for ${error.fieldId}.` : 'Invalid form answers.', { status: 422 });
    throw error;
  }
  const now = Date.now();
  let completed: boolean;
  try {
    completed = await resetPassword(db, readResetCookie(request.headers), code, password, now,
      (userId) => buildFormAnswerInsert(db, { formId: 'identity.password-reset-complete',
        requestId, versionId: submission.versionId, subjectType: 'user', subjectId: userId,
        actorId: userId, answers: submission.answers, now }),
      buildIdentityVersionGuard(db, 'identity.password-reset-complete', submission.versionId));
  } catch (error) {
    const used = await db.prepare('SELECT id FROM form_answer_sets WHERE form_id=? AND request_id=? LIMIT 1')
      .bind('identity.password-reset-complete', requestId).first();
    if (used) return new Response('Request reference already used.', { status: 409 });
    if (await identityVersionChanged(db, 'identity.password-reset-complete', submission.versionId))
      return new Response('Form configuration changed. Refresh and retry.', { status: 409 });
    throw error;
  }
  if (!completed) return fail('invalid');
  const headers = new Headers({
    Location: `/login?reset=success&return_to=${encodeURIComponent(back)}`,
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', resetCookie('', true));
  headers.append(
    'Set-Cookie',
    'hastabazaar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure',
  );
  return new Response(null, { status: 303, headers });
}
