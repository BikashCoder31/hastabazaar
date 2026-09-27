import {readBoundedForm} from '@/lib/http/bounded-body';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { env } from 'cloudflare:workers';


import { emailOtpCookie } from '@/lib/auth/email-otp';
import { acceptIdentityCodeRequest } from '@/lib/auth/identity-code-request';
import { requireDatabase } from '@/lib/db/d1';
import { sendEmailLoginCode, type EmailLoginEnvironment } from '@/lib/email/login-code';
import { consumeAuthenticationRateLimit as consumeRequestRateLimit } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { configuredMultipartAnswers, validateSellerFormSubmission } from '@/lib/forms/submission';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { assertNoIdentitySecrets } from '@/lib/auth/identity-form-answers';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function redirect(request: Request, path: string, returnTo: string, error?: string): Response {
  const location = new URL(path, request.url);
  location.searchParams.set('return_to', returnTo);
  if (error) location.searchParams.set('error', error);
  return new Response(null, {
    status: 303,
    headers: { Location: location.pathname + location.search, 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return new Response('Cross-site requests are not allowed.', { status: 403 });
  let data: FormData; try {data=await readBoundedForm(request,16*1024);} catch {return new Response('Invalid or oversized form.',{status:413});}
  const emailValue = data.get('email');
  const returnValue = data.get('return_to');
  const email = (typeof emailValue === 'string' ? emailValue : '').trim().toLowerCase().slice(0, 254);
  const returnTo = safeSignInReturnPath(typeof returnValue === 'string' ? returnValue : '/account');
  if (!emailPattern.test(email)) return redirect(request, '/login', returnTo, 'missing');

  const emailEnvironment = env as unknown as EmailLoginEnvironment;
  if (
    !emailEnvironment.EMAIL
    || (emailEnvironment.EMAIL_DELIVERY_CONFIGURED !== 'true' && emailEnvironment.EMAIL.configured !== true)
  ) {
    return redirect(request, '/login', returnTo, 'email_code_unavailable');
  }

  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const rateLimit = await consumeRequestRateLimit(database, request, {
    scope: `email-otp-request:${email}`,
    limit: 3,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) return redirect(request, '/login', returnTo, 'rate');

  let submission: Awaited<ReturnType<typeof validateSellerFormSubmission>>;
  let requestId: string;
  try {
    const config = await resolvePublishedForm(database, 'identity.email-code-request');
    const parsed = configuredMultipartAnswers(data, config);
    requestId = parsed.requestId;
    submission = await validateSellerFormSubmission(database, 'identity.email-code-request', parsed.version, parsed.customAnswers);
    assertNoIdentitySecrets(submission.answers, [], request.headers);
  } catch (error) {
    if (error instanceof FormRuntimeError) return new Response('Form configuration changed. Refresh and retry.', { status: error.retryable ? 503 : 409 });
    if (error instanceof FormValidationError) return new Response(error.fieldId ? `Invalid answer for ${error.fieldId}.` : 'Invalid form answers.', { status: 422 });
    throw error;
  }
  const accepted = await acceptIdentityCodeRequest(database, { formId: 'identity.email-code-request',
    challengeTable: 'email_login_challenges', email, requestId,
    versionId: submission.versionId, answers: submission.answers, now: Date.now(),
    deliver: (recipient, code) => sendEmailLoginCode(emailEnvironment, { email: recipient, code }),
  });
  if (accepted.status === 'duplicate') return new Response('Request reference already used.', { status: 409 });
  if (accepted.status === 'stale') return new Response('Form configuration changed. Refresh and retry.', { status: 409 });
  const response = redirect(request, '/login/code', returnTo);
  response.headers.append('Set-Cookie', emailOtpCookie(accepted.token));
  return response;
}
