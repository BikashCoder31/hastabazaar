import { env } from 'cloudflare:workers';
import {
  requireCustomerApi,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import {
  approvedRider,
  RiderError,
  submitRiderRemittance,
} from '@/lib/riders/repository';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const user = await requireCustomerApi(),
      db = requireDatabase(env as unknown as { DB?: D1Database });
    if (!(await approvedRider(db, user.userId)))
      return json({ error: 'Current approved rider access is required.' }, 403);
    const rate = await consumeRequestRateLimit(db, request, {
      scope: 'rider-remittance:' + user.userId,
      limit: 20,
      windowMs: 3_600_000,
    });
    if (!rate.allowed) return rateLimitJson(rate);
    const bytes = await readBoundedBody(request, 4096);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes)) as Record<
        string,
        unknown
      >;
    } catch {
      return json({ error: 'Use a valid remittance request.' }, 400);
    }
    const result = await submitRiderRemittance(db, {
      riderId: user.userId,
      jobId: typeof data.jobId === 'string' ? data.jobId : '',
      requestId: typeof data.requestId === 'string' ? data.requestId : '',
      amountPaisa: Number(data.amountPaisa),
      reference: typeof data.reference === 'string' ? data.reference : '',
      now: Date.now(),
    });
    return json(result, 201);
  } catch (error) {
    if (error instanceof CustomerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError)
      return json({ error: error.message }, 413);
    if (error instanceof RiderError)
      return json({ error: error.message }, 409);
    return json(
      { error: 'The remittance could not be submitted. Refresh and try again.' },
      409,
    );
  }
}
