import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { saveSellerReply } from '@/lib/db/repositories/review-extras';
import { CustomerDataConflictError } from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const seller = await requireSellerApi();
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const limit = await consumeRequestRateLimit(db, request, {
      scope: `seller-reply:${seller.sellerId}`,
      limit: 30,
      windowMs: 3600000,
    });
    if (!limit.allowed) return rateLimitJson(limit);
    const { id } = await params;
    const body = (await request.json()) as {
      body: string;
      idempotencyKey: string;
      version: number;
    } | null;
    if (
      typeof body?.body !== 'string' ||
      typeof body.idempotencyKey !== 'string' ||
      !body.idempotencyKey ||
      body.idempotencyKey.length > 100 ||
      !Number.isInteger(body.version)
    )
      return Response.json({ error: 'Invalid reply.' }, { status: 400 });
    await saveSellerReply(db, {
      reviewId: id,
      sellerId: seller.sellerId,
      actorId: seller.userId,
      body: body.body,
      version: body.version,
      requestId: body.idempotencyKey,
      now: Date.now(),
    });
    return Response.json(
      { ok: true },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof CustomerDataConflictError ||
          e instanceof SellerAuthorizationError
            ? e.message
            : 'Reply could not be saved.',
      },
      {
        status:
          e instanceof SellerAuthorizationError
            ? e.status
            : e instanceof CustomerDataConflictError
              ? 409
              : 500,
      },
    );
  }
}
