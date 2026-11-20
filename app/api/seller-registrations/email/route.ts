import { env } from 'cloudflare:workers';
import { CustomerAuthorizationError, requireExistingCustomerApi } from '@/lib/auth/customer';
import { assertCustomerIntent } from '@/lib/auth/customer-intent';
import { getLocalTestIdentity } from '@/lib/auth/local-test-access';
import { hostedSessionCookie, hostedSessionHash } from '@/lib/auth/hosted-session';
import { requireSellerCenterApi, SellerCenterAuthorizationError } from '@/lib/auth/seller-center';
import {
  ContactVerificationError, requestContactVerification, verifyContactVerification,
} from '@/lib/auth/contact-verification';
import {
  deliverContactCode, localCaptureAvailable, readLocalContactCaptures, type ContactDeliveryEnvironment,
} from '@/lib/auth/contact-delivery';
import { requireDatabase } from '@/lib/db/d1';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumeAuthenticationRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {
  hasVerifiedRegistrationEmail, normalizeSellerRegistrationEmail, savedSellerRegistrationEmail,
} from '@/lib/sellers/registration-email';
import { readRegistration } from '@/lib/sellers/registration-store';

export const dynamic = 'force-dynamic';

const environment = env as unknown as ContactDeliveryEnvironment & { DB?: D1Database };
function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request, environment.APP_ORIGIN)) {
    return reply({ error: 'Request origin was not accepted.' }, 403);
  }
  try {
    const [customer, owner] = await Promise.all([requireExistingCustomerApi(), requireSellerCenterApi()]);
    if (owner.userId !== customer.userId || owner.authSubject !== customer.authSubject) {
      throw new SellerCenterAuthorizationError('Your sign-in changed. Reopen seller registration.', 403);
    }
    assertCustomerIntent(request, customer.userId);
    const raw: unknown = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 4096)));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return reply({ error: 'Invalid verification request.' }, 400);
    }
    const body = raw as Record<string, unknown>;
    const email = normalizeSellerRegistrationEmail(body.email);
    if (!email) return reply({ error: 'Enter a valid seller registration email.' }, 400);
    const action = body.action;
    const allowed = action === 'verify' ? ['action', 'email', 'token', 'code'] : ['action', 'email'];
    if ((action !== 'request' && action !== 'verify') || Object.keys(body).some(key => !allowed.includes(key))) {
      return reply({ error: 'Invalid verification request.' }, 400);
    }
    if (action === 'verify' && (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token) ||
        typeof body.code !== 'string' || !/^\d{6}$/.test(body.code))) {
      return reply({ error: 'Enter the six-digit code from your email.' }, 400);
    }
    const db = requireDatabase(environment);
    const actor = {
      ...customer,
      sessionHash: hostedSessionHash(request.headers),
      localFixture: getLocalTestIdentity(request.headers)?.userId === customer.authSubject,
    };
    const now = Date.now();
    if (action === 'request') {
      const saved = savedSellerRegistrationEmail((await readRegistration(db, customer.userId))?.answers);
      if (await hasVerifiedRegistrationEmail(db, customer, email, saved)) return reply({ verified: true });
      if (environment.HASTABAZAAR_RUNTIME_ENV === 'local_staging' &&
          !(localCaptureAvailable(environment, request, customer.email) && localCaptureAvailable(environment, request, email))) {
        return reply({ error: 'In this local preview, use a sign-in account and recipient ending in @local.hastabazaar.test to request a test code.' }, 409);
      }
    }
    const rate = await consumeAuthenticationRateLimit(db, request, {
      scope: `contact-${action}:${customer.userId}`,
      limit: action === 'request' ? 3 : 10,
      windowMs: 15 * 60_000,
    });
    if (!rate.allowed) return rateLimitJson(rate);

    if (action === 'request') {
      const result = await requestContactVerification(db, actor, 'email',
        message => deliverContactCode(db, environment, message), now, email);
      if (result.verified || !localCaptureAvailable(environment, request, email)) return reply(result);
      const [captured] = await readLocalContactCaptures(db, environment, actor, now, email);
      return reply({ ...result, capturedCode: captured?.code });
    }
    const result = await verifyContactVerification(db, actor, 'email', body.token as string, body.code as string, now, email);
    const response = reply({ verified: true });
    if (result.sessionToken) response.headers.append('Set-Cookie', hostedSessionCookie(result.sessionToken));
    return response;
  } catch (error) {
    if (error instanceof ContactVerificationError || error instanceof CustomerAuthorizationError ||
        error instanceof SellerCenterAuthorizationError) return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return reply({ error: 'Verification request is too large.' }, 413);
    if (error instanceof SyntaxError) return reply({ error: 'Invalid verification request.' }, 400);
    return reply({ error: 'Seller email verification is temporarily unavailable. Try again.' }, 503);
  }
}
