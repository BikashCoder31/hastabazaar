import { env } from 'cloudflare:workers';

import {
  CustomerAuthorizationError,
  requireCustomerApi,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import {
  createProductReview,
  CustomerDataConflictError,
} from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const [customer, { id }] = await Promise.all([
      requireCustomerApi(),
      params,
    ]);
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const rateLimit = await consumeRequestRateLimit(database, request, {
      scope: 'product-review',
      limit: 10,
      windowMs: 60 * 60_000,
    });
    if (!rateLimit.allowed) return rateLimitJson(rateLimit);
    const body = (await request.json().catch(() => null)) as {
      orderItemId?: string;
      rating?: number;
      title?: string;
      body?: string;
      idempotencyKey?: string;
    } | null;
    if (!body?.orderItemId || !body.idempotencyKey || id.length > 100)
      return Response.json(
        { error: 'Verified order item and idempotency key are required.' },
        { status: 400 },
      );
    const reviewId = await createProductReview(database, {
      userId: customer.userId,
      productId: id,
      orderItemId: body.orderItemId,
      rating: Number(body.rating),
      title: body.title ?? '',
      body: body.body ?? '',
      requestId: body.idempotencyKey,
      now: Date.now(),
    });
    return Response.json({ id: reviewId }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CustomerDataConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'The review could not be submitted.' },
      { status: 500 },
    );
  }
}
