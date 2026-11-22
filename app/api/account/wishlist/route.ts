import { env } from 'cloudflare:workers';

import { CustomerAuthorizationError } from '@/lib/auth/customer';
import { requireCustomerIntentApi } from '@/lib/auth/customer-intent';
import { requireDatabase } from '@/lib/db/d1';
import { CustomerDataConflictError, setWishlistItem } from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const customer = await requireCustomerIntentApi(request);
    const body = await request.json().catch(() => null) as { productId?: string; saved?: boolean } | null;
    if (!body?.productId || body.productId.length > 100 || typeof body.saved !== 'boolean') return Response.json({ error: 'Product and saved state are required.' }, { status: 400 });
    await setWishlistItem(requireDatabase(env as unknown as { DB?: D1Database }), { userId: customer.userId, productId: body.productId, saved: body.saved, now: Date.now() });
    return Response.json({ saved: body.saved });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CustomerDataConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'The wishlist could not be updated.' }, { status: 500 });
  }
}
