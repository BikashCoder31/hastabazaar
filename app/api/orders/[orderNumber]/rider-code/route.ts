import { isRiderPortalEnabled } from '@/lib/riders/availability';
import { riderPortalHoldResponse } from '@/lib/riders/portal-hold';
import { env } from 'cloudflare:workers';
import {
  getCustomerUser,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import {
  RECEIPT_COOKIE,
  readCookieHeader,
  hashOpaqueToken,
} from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import {
  requestCustomerRiderCode,
  parseRiderCodeRequest,
  customerRiderCodeJobs,
} from '@/lib/riders/customer-code';
import { RiderError } from '@/lib/riders/repository';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!isRiderPortalEnabled()) return riderPortalHoldResponse();
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const customer = await getCustomerUser(),
      token = readCookieHeader(request.headers.get('cookie'), RECEIPT_COOKIE);
    if (!customer && !token)
      return json({ error: 'Open your protected order receipt.' }, 401);
    const receiptTokenHash = token ? await hashOpaqueToken(token) : null,
      { orderNumber } = await params;
    const db = requireDatabase(env as unknown as { DB?: D1Database }),
      owner = {
        orderNumber,
        customerId: customer?.userId ?? null,
        receiptTokenHash,
      };
    const value = parseRiderCodeRequest(
      JSON.parse(
        new TextDecoder().decode(await readBoundedBody(request, 1024)),
      ),
    );
    if (
      !(await customerRiderCodeJobs(db, owner)).some(
        (job) => job.id === value.jobId,
      )
    )
      return json({ error: 'Eligible parcel not found.' }, 404);
    const limit = await consumeRequestRateLimit(db, request, {
      scope: 'rider-code:' + value.jobId,
      limit: 6,
      windowMs: 3600000,
    });
    if (!limit.allowed) return rateLimitJson(limit);
    const issued = await requestCustomerRiderCode(db, {
        ...owner,
        jobId: value.jobId,
        now: Date.now(),
      });
    return json(
      issued.deliveryMode === 'managed_cod'
        ? { expiresAt: issued.expiresAt, deliveryMode: issued.deliveryMode, sentByEmail: true }
        : issued,
      201,
    );
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Request is too large.' }, 413);
    if (error instanceof CustomerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof RiderError) return json({ error: error.message }, 409);
    return json(
      {
        error:
          'Code is unavailable. A current code may already exist; wait for its ten-minute expiry before trying again.',
      },
      409,
    );
  }
}
