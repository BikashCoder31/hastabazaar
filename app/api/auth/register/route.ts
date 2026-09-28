import { passwordConfirmationError } from '@/lib/auth/password-confirmation';
import { formText } from '@/lib/http/bounded-body';
import { readIdentityFormBody } from '@/lib/auth/identity-form-body';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { env } from 'cloudflare:workers';


import { requireDatabase } from '@/lib/db/d1';
import {
  createHostedSessionForUser,
  hostedSessionCookie,
  passwordRecord,
} from '@/lib/auth/hosted-session';
import { consumeAuthenticationRateLimit as consumeRequestRateLimit } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import { configuredMultipartAnswers, validateSellerFormSubmission } from '@/lib/forms/submission';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { assertNoIdentitySecrets, buildIdentityVersionGuard, identityVersionChanged } from '@/lib/auth/identity-form-answers';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function redirectToRegister(request: Request, returnTo: string, error: string) {
  const location = new URL('/register', request.url);
  location.searchParams.set('return_to', returnTo);
  location.searchParams.set('error', error);
  return new Response(null, { status: 303, headers: { Location: location.pathname + location.search } });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return new Response('Cross-site requests are not allowed.', { status: 403 });
  let data: FormData; try {data=await readIdentityFormBody(request);} catch {return new Response('Invalid or oversized form.',{status:413});}
  const displayName = formText(data, 'display_name', '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const email = formText(data, 'email', '').trim().toLowerCase().slice(0, 254);
  const password = formText(data, 'password', '');
  const confirmation = formText(data, 'confirm_password', '');
  const returnTo = safeSignInReturnPath(formText(data, 'return_to', '/account'));
  if (displayName.length < 2 || !emailPattern.test(email) || password.length < 10) {
    return redirectToRegister(request, returnTo, 'invalid');
  }

  const passwordError = passwordConfirmationError(password, confirmation);
  if (passwordError) return redirectToRegister(request, returnTo, passwordError);

  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const rateLimit = await consumeRequestRateLimit(database, request, {
    scope: `register:${email}`,
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rateLimit.allowed) return redirectToRegister(request, returnTo, 'rate');

  let submission: Awaited<ReturnType<typeof validateSellerFormSubmission>>;
  let requestId: string;
  try {
    const config = await resolvePublishedForm(database, 'identity.register');
    const parsed = configuredMultipartAnswers(data, config);
    requestId = parsed.requestId;
    submission = await validateSellerFormSubmission(database, 'identity.register', parsed.version, parsed.customAnswers);
    assertNoIdentitySecrets(submission.answers, [password, confirmation], request.headers,
      { rejectNumericSecrets: true });
  } catch (error) {
    if (error instanceof FormRuntimeError) return new Response('Form configuration changed. Refresh and retry.', { status: error.retryable ? 503 : 409 });
    if (error instanceof FormValidationError) return new Response(error.fieldId ? `Invalid answer for ${error.fieldId}.` : 'Invalid form answers.', { status: 422 });
    throw error;
  }

  const existing = await database
    .prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1')
    .bind(email)
    .first();
  if (existing) return redirectToRegister(request, returnTo, 'exists');

  const now = Date.now();
  const userId = crypto.randomUUID();
  const authSubject = `password:${userId}`;
  const passwordData = await passwordRecord(password);
  try {
    await database.batch([
      buildIdentityVersionGuard(database, 'identity.register', submission.versionId),
      database
        .prepare(
          `INSERT INTO users (id, auth_subject, email, phone, display_name, locale, status, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, 'en-NP', 'active', ?, ?)`,
        )
        .bind(userId, authSubject, email, displayName, now, now),
      database
        .prepare(
          `INSERT INTO user_credentials (user_id, password_hash, password_salt, password_version, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)`,
        )
        .bind(userId, passwordData.hash, passwordData.salt, now, now),
      database
        .prepare(
          `INSERT INTO user_roles (user_id, role, assigned_by, assigned_at)
           VALUES (?, 'customer', NULL, ?)`,
        )
        .bind(userId, now),
      buildFormAnswerInsert(database, { formId: 'identity.register', requestId,
        versionId: submission.versionId, subjectType: 'user', subjectId: userId,
        actorId: userId, answers: submission.answers, now }),
    ]);
  } catch (error) {
    const used = await database.prepare('SELECT id FROM form_answer_sets WHERE form_id=? AND request_id=? LIMIT 1')
      .bind('identity.register', requestId).first();
    if (used) return new Response('Request reference already used.', { status: 409 });
    if (await identityVersionChanged(database, 'identity.register', submission.versionId))
      return new Response('Form configuration changed. Refresh and retry.', { status: 409 });
    const message = error instanceof Error ? error.message : '';
    if (message.includes('UNIQUE constraint failed')) {
      return redirectToRegister(request, returnTo, 'exists');
    }
    throw error;
  }

  const token = await createHostedSessionForUser(database, userId, now, { passwordHash: passwordData.hash });
  return new Response(null, {
    status: 303,
    headers: {
      Location: returnTo,
      'Set-Cookie': hostedSessionCookie(token),
      'Cache-Control': 'no-store',
    },
  });
}
