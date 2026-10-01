import { env } from 'cloudflare:workers';
import {
  requireCustomerApi,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { parseRiderCodeRequest } from '@/lib/riders/customer-code';
import {
  approvedRider,
  verifyRiderOtp,
  RiderError,
} from '@/lib/riders/repository';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const user = await requireCustomerApi(),
      db = requireDatabase(env as unknown as { DB?: D1Database });
    if (!(await approvedRider(db, user.userId)))
      return json({ error: 'Current approved rider access is required.' }, 403);
    const limit = await consumeRequestRateLimit(db, request, {
      scope: 'rider-code-verify:' + user.userId,
      limit: 20,
      windowMs: 15 * 60000,
    });
    if (!limit.allowed) return rateLimitJson(limit);
    const value = parseRiderCodeRequest(
      JSON.parse(
        new TextDecoder().decode(await readBoundedBody(request, 1024)),
      ),
      true,
    );
    const verified = await verifyRiderOtp(db, {
      ...value,
      riderId: user.userId,
      now: Date.now(),
    });
    return json(
      verified
        ? {
            verified: true,
            message:
              'Code verified. Complete the proof report; staff still confirms delivery.',
          }
        : {
            error:
              'The code is invalid, expired or unavailable for this assignment.',
          },
      verified ? 200 : 409,
    );
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Request is too large.' }, 413);
    if (error instanceof CustomerAuthorizationError)
      return json({ error: error.message }, error.status);
    return json(
      {
        error:
          error instanceof RiderError
            ? error.message
            : 'Code could not be verified.',
      },
      400,
    );
  }
}
