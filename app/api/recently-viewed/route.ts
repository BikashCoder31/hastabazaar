import { env } from 'cloudflare:workers';

import { getCustomerReadContext, CustomerAuthorizationError, requireExistingCustomerApi } from '@/lib/auth/customer';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import {
  clearRecentlyViewed,
  listRecentlyViewedProducts,
  recordRecentlyViewedProduct,
  resolveRecentlyViewedProducts,
} from '@/lib/db/repositories/recently-viewed';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumePublicRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';

export const dynamic = 'force-dynamic';

function responseError(error: unknown): Response {
  if (error instanceof CustomerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: 'Recently Viewed could not be updated.' }, { status: 500 });
}

export async function GET(): Promise<Response> {
  try {
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const now = Date.now();
    const policy = (await getEffectiveBusinessSetting(database, 'recently_viewed_policy', now)).value;
    const { customer } = await getCustomerReadContext();
    const products = customer
      ? await listRecentlyViewedProducts(database, { userId: customer.userId, now, policy })
      : [];
    return Response.json({ products, policy, authenticated: Boolean(customer) });
  } catch (error) { return responseError(error); }
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const limit = await consumePublicRequestRateLimit(database, request, { scope: 'recently-viewed', limit: 120, windowMs: 60_000 });
    if (!limit.allowed) return rateLimitJson(limit);
    const body = await request.json().catch(() => null) as { action?: unknown; productId?: unknown; productIds?: unknown } | null;
    const now = Date.now();
    const policy = (await getEffectiveBusinessSetting(database, 'recently_viewed_policy', now)).value;
    if (body?.action === 'resolve') {
      if (!Array.isArray(body.productIds) || body.productIds.length > 24 || body.productIds.some((id) => typeof id !== 'string' || id.length < 1 || id.length > 100)) {
        return Response.json({ error: 'A bounded product list is required.' }, { status: 400 });
      }
      const products = await resolveRecentlyViewedProducts(database, { productIds: body.productIds as string[], now, policy });
      return Response.json({ products, policy });
    }
    if (body?.action === 'record' && typeof body.productId === 'string' && body.productId.length <= 100) {
      const customer = await requireExistingCustomerApi();
      const recorded = await recordRecentlyViewedProduct(database, { userId: customer.userId, productId: body.productId, now, policy });
      return Response.json({ recorded, policy });
    }
    return Response.json({ error: 'The Recently Viewed action is invalid.' }, { status: 400 });
  } catch (error) { return responseError(error); }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const customer = await requireExistingCustomerApi();
    await clearRecentlyViewed(requireDatabase(env as unknown as { DB?: D1Database }), customer.userId);
    return Response.json({ cleared: true });
  } catch (error) { return responseError(error); }
}
