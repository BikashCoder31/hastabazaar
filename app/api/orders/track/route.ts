import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { findOrderTracking } from '@/lib/db/repositories/order-tracking';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const limit = await consumeRequestRateLimit(db, request, {
      scope: 'order-tracking',
      limit: 10,
      windowMs: 15 * 60_000,
    });
    if (!limit.allowed) return rateLimitJson(limit);
    const body = (await request.json()) as Record<string, unknown>;
    const order =
      typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (
      !order ||
      order.length > 80 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      return json(
        { error: 'Enter your order number and the email used at checkout.' },
        400,
      );
    const tracking = await findOrderTracking(db, order, email);
    if (!tracking)
      return json(
        {
          error:
            'We couldn’t match those details. Check your order number and checkout email.',
        },
        404,
      );
    return json({ tracking });
  } catch {
    return json(
      {
        error: 'Tracking is temporarily unavailable. Please try again shortly.',
      },
      503,
    );
  }
}
