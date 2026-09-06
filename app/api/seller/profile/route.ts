import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { SellerProfileConflictError, updateSellerProfile, type EditableSellerProfile } from '@/lib/db/repositories/seller-profile';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const seller = await requireSellerApi();
    const body = await request.json().catch(() => null) as { profile?: EditableSellerProfile; idempotencyKey?: string } | null;
    if (!body?.profile || !body.idempotencyKey || body.idempotencyKey.length > 100) return Response.json({ error: 'Profile and idempotency key are required.' }, { status: 400 });
    await updateSellerProfile(requireDatabase(env as unknown as { DB?: D1Database }), { sellerId: seller.sellerId, actorId: seller.userId, input: body.profile, requestId: body.idempotencyKey, now: Date.now() });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SellerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SellerProfileConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'The seller profile could not be updated.' }, { status: 500 });
  }
}
