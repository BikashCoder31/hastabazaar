import { env } from 'cloudflare:workers';
import {
  requireExistingCustomerApi,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {
  consumeAuthenticationRateLimit,
  rateLimitJson,
} from '@/lib/http/rate-limit';
import {
  ContactVerificationError,
  getContactVerificationStatus,
  requestContactVerification,
  verifyContactVerification,
} from '@/lib/auth/contact-verification';
import {
  deliverContactCode,
  type ContactDeliveryEnvironment,
  localCaptureAvailable,
} from '@/lib/auth/contact-delivery';
import { hostedSessionCookie } from '@/lib/auth/hosted-session';

export const dynamic = 'force-dynamic';
const environment = env as unknown as ContactDeliveryEnvironment & {
  DB?: D1Database;
};
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
function failure(error: unknown) {
  if (
    error instanceof ContactVerificationError ||
    error instanceof CustomerAuthorizationError
  )
    return json({ error: error.message }, error.status);
  if (error instanceof BodyTooLargeError)
    return json({ error: 'Verification request is too large.' }, 413);
  if (error instanceof SyntaxError)
    return json({ error: 'Invalid verification request.' }, 400);
  return json(
    { error: 'Contact verification is temporarily unavailable.' },
    503,
  );
}
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireExistingCustomerApi();
    const db = requireDatabase(environment);
    const status = await getContactVerificationStatus(db, actor);
    return json({
      ...status,
      captureAvailable: localCaptureAvailable(
        environment,
        request,
        status.email,
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request, environment.APP_ORIGIN))
    return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const actor = await requireExistingCustomerApi();
    const db = requireDatabase(environment);
    const decoded: unknown = JSON.parse(
      new TextDecoder().decode(await readBoundedBody(request, 4096)),
    );
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
      return json({ error: 'Invalid verification request.' }, 400);
    const body = decoded as Record<string, unknown>;
    if (
      (body.channel !== 'email' && body.channel !== 'phone') ||
      (body.action !== 'request' && body.action !== 'verify')
    )
      return json({ error: 'Choose a valid verification action.' }, 400);
    const allowed =
      body.action === 'request'
        ? ['action', 'channel']
        : ['action', 'channel', 'token', 'code'];
    if (Object.keys(body).some((key) => !allowed.includes(key)))
      return json({ error: 'Invalid verification request.' }, 400);
    if (
      body.action === 'verify' &&
      (typeof body.token !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(body.token) ||
        typeof body.code !== 'string' ||
        !/^\d{6}$/.test(body.code))
    )
      return json(
        { error: 'Enter the six-digit code from your message.' },
        400,
      );
    const rate = await consumeAuthenticationRateLimit(db, request, {
      scope: `contact-${body.action}:${actor.userId}`,
      limit: body.action === 'request' ? 3 : 10,
      windowMs: 15 * 60_000,
    });
    if (!rate.allowed) return rateLimitJson(rate);
    if (body.action === 'request')
      return json(
        await requestContactVerification(db, actor, body.channel, (message) =>
          deliverContactCode(db, environment, message),
        ),
      );
    const result = await verifyContactVerification(
      db,
      actor,
      body.channel,
      body.token as string,
      body.code as string,
    );
    const response = json({
      verified: true,
      status: await getContactVerificationStatus(db, actor),
    });
    if (result.sessionToken)
      response.headers.append(
        'Set-Cookie',
        hostedSessionCookie(result.sessionToken),
      );
    return response;
  } catch (error) {
    return failure(error);
  }
}
