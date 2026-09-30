import { formText } from '@/lib/http/bounded-body';
import { readIdentityFormBody } from '@/lib/auth/identity-form-body';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { acceptIdentityCodeRequest } from '@/lib/auth/identity-code-request';
import { resetCookie } from '@/lib/auth/password-reset';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { sendPasswordResetCode } from '@/lib/email/password-reset';
import type { EmailLoginEnvironment } from '@/lib/email/login-code';
import { consumeAuthenticationRateLimit } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { configuredMultipartAnswers, validateSellerFormSubmission } from '@/lib/forms/submission';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { assertNoIdentitySecrets } from '@/lib/auth/identity-form-answers';

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return new Response('Cross-site requests are not allowed.', {
      status: 403,
    });
  let form: FormData; try {form=await readIdentityFormBody(request);} catch {return new Response('Invalid or oversized form.',{status:413});}
  const email = formText(form, 'email', '')
    .trim()
    .toLowerCase()
    .slice(0, 254);
  const back = safeSignInReturnPath(
    formText(form, 'return_to', '/account'),
  );
  const redirect = (path: string, error?: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `${path}?return_to=${encodeURIComponent(back)}${error ? '&error=' + error : ''}`,
        'Cache-Control': 'no-store',
      },
    });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return redirect('/forgot-password', 'invalid');
  const emailEnv = env as unknown as EmailLoginEnvironment;
  if (
    !emailEnv.EMAIL ||
    (emailEnv.EMAIL_DELIVERY_CONFIGURED !== 'true' &&
      emailEnv.EMAIL.configured !== true)
  )
    return redirect('/forgot-password', 'unavailable');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const accountLimit = await consumeAuthenticationRateLimit(
    db, request,
    { scope: `password-reset-email:${email}`, limit: 3, windowMs: 15 * 60_000 },
  );
  if (!accountLimit.allowed)
    return redirect('/forgot-password', 'rate');
  let submission: Awaited<ReturnType<typeof validateSellerFormSubmission>>;
  let requestId: string;
  try {
    const config = await resolvePublishedForm(db, 'identity.password-reset-request');
    const parsed = configuredMultipartAnswers(form, config);
    requestId = parsed.requestId;
    submission = await validateSellerFormSubmission(db, 'identity.password-reset-request', parsed.version, parsed.customAnswers);
    assertNoIdentitySecrets(submission.answers, [], request.headers);
  } catch (error) {
    if (error instanceof FormRuntimeError) return new Response('Form configuration changed. Refresh and retry.', { status: error.retryable ? 503 : 409 });
    if (error instanceof FormValidationError) return new Response(error.fieldId ? `Invalid answer for ${error.fieldId}.` : 'Invalid form answers.', { status: 422 });
    throw error;
  }
  const accepted = await acceptIdentityCodeRequest(db, { formId: 'identity.password-reset-request',
    challengeTable: 'password_reset_challenges', email, requestId,
    versionId: submission.versionId, answers: submission.answers, now: Date.now(),
    deliver: (recipient, code) => sendPasswordResetCode(emailEnv, recipient, code),
  });
  if (accepted.status === 'duplicate') return new Response('Request reference already used.', { status: 409 });
  if (accepted.status === 'stale') return new Response('Form configuration changed. Refresh and retry.', { status: 409 });
  const response = redirect('/forgot-password/reset');
  response.headers.append('Set-Cookie', resetCookie(accepted.token));
  return response;
}
