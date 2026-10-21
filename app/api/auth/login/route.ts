import { formText } from '@/lib/http/bounded-body';
import { readIdentityFormBody } from '@/lib/auth/identity-form-body';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { env } from 'cloudflare:workers';
import {
  readSecurityInitialization,
  type SecurityPolicyBindings,
} from '@/lib/security/runtime-policy';

import { requireDatabase } from '@/lib/db/d1';
import {
  createHostedSessionForUser,
  findCredentialByEmail,
  hostedSessionCookie,
  verifyPassword,
} from '@/lib/auth/hosted-session';
import { consumeAuthenticationRateLimit as consumeRequestRateLimit } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import {
  configuredMultipartAnswers,
  validateSellerFormSubmission,
} from '@/lib/forms/submission';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import {
  assertNoIdentitySecrets,
  buildIdentityVersionGuard,
  identityVersionChanged,
} from '@/lib/auth/identity-form-answers';

function redirectToLogin(request: Request, returnTo: string, error: string) {
  const location = new URL('/login', request.url);
  location.searchParams.set('return_to', returnTo);
  location.searchParams.set('error', error);
  return new Response(null, {
    status: 303,
    headers: { Location: location.pathname + location.search },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return new Response('Cross-site requests are not allowed.', {
      status: 403,
    });
  let data: FormData;
  try {
    data = await readIdentityFormBody(request);
  } catch {
    return new Response('Invalid or oversized form.', { status: 413 });
  }
  const email = formText(data, 'email', '').trim().toLowerCase().slice(0, 254);
  const password = formText(data, 'password', '').slice(0, 256);
  const returnTo = safeSignInReturnPath(
    formText(data, 'return_to', '/account'),
  );
  if (!email || !password) return redirectToLogin(request, returnTo, 'missing');

  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const rateLimit = await consumeRequestRateLimit(database, request, {
    scope: `login:${email}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) return redirectToLogin(request, returnTo, 'rate');

  const credential = await findCredentialByEmail(database, email);
  const valid = credential
    ? await verifyPassword(
        password,
        credential.passwordHash,
        credential.passwordSalt,
      )
    : false;
  if (!credential || !valid)
    return redirectToLogin(request, returnTo, 'invalid');

  let submission: Awaited<ReturnType<typeof validateSellerFormSubmission>>;
  let requestId: string;
  try {
    const config = await resolvePublishedForm(
      database,
      'identity.login-password',
    );
    const parsed = configuredMultipartAnswers(data, config);
    requestId = parsed.requestId;
    submission = await validateSellerFormSubmission(
      database,
      'identity.login-password',
      parsed.version,
      parsed.customAnswers,
    );
    assertNoIdentitySecrets(submission.answers, [password], request.headers, {
      rejectNumericSecrets: true,
    });
  } catch (error) {
    if (error instanceof FormRuntimeError)
      return new Response('Form configuration changed. Refresh and retry.', {
        status: error.retryable ? 503 : 409,
      });
    if (error instanceof FormValidationError)
      return new Response(
        error.fieldId
          ? `Invalid answer for ${error.fieldId}.`
          : 'Invalid form answers.',
        { status: 422 },
      );
    throw error;
  }
  const now = Date.now();
  const linkedAnswer = buildFormAnswerInsert(database, {
    formId: 'identity.login-password',
    requestId,
    versionId: submission.versionId,
    subjectType: 'user',
    subjectId: credential.accountId,
    actorId: credential.accountId,
    answers: submission.answers,
    now,
  });
  let token: string;
  try {
    const security = env as unknown as SecurityPolicyBindings;
    const staff = await database
      .prepare(
        "SELECT 1 FROM user_roles WHERE user_id=? AND role IN ('admin','super_admin') LIMIT 1",
      )
      .bind(credential.accountId)
      .first();
    token = await createHostedSessionForUser(
      database,
      credential.accountId,
      now,
      {
        passwordHash: credential.passwordHash,
        ...(staff
          ? {
              securityKey: security.HASTABAZAAR_SECURITY_KEY,
              initialized: await readSecurityInitialization(security),
            }
          : {}),
      },
      linkedAnswer,
      undefined,
      buildIdentityVersionGuard(
        database,
        'identity.login-password',
        submission.versionId,
      ),
    );
  } catch (error) {
    const used = await database
      .prepare(
        'SELECT id FROM form_answer_sets WHERE form_id=? AND request_id=? LIMIT 1',
      )
      .bind('identity.login-password', requestId)
      .first();
    if (used)
      return new Response('Request reference already used.', { status: 409 });
    if (
      await identityVersionChanged(
        database,
        'identity.login-password',
        submission.versionId,
      )
    )
      return new Response('Form configuration changed. Refresh and retry.', {
        status: 409,
      });
    throw error;
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: returnTo,
      'Set-Cookie': hostedSessionCookie(token),
      'Cache-Control': 'no-store',
    },
  });
}
