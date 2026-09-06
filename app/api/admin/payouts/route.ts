import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { PayoutConflictError, prepareSellerPayout } from '@/lib/db/repositories/payouts';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const staff = await requireStaffApi('payout.prepare');
    const body = await request.json().catch(() => null) as { sellerId?: string; note?: string; idempotencyKey?: string } | null;
    if (!body?.sellerId || body.sellerId.length > 100 || !body.idempotencyKey || body.idempotencyKey.length > 100) {
      return Response.json({ error: 'Seller and idempotency key are required.' }, { status: 400 });
    }
    const result = await prepareSellerPayout(requireDatabase(env as unknown as { DB?: D1Database }), {
      sellerId: body.sellerId,
      actorId: staff.id,
      actorRole: staff.role,
      note: body.note ?? '',
      requestId: body.idempotencyKey,
      now: Date.now(),
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof PayoutConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'The payout could not be prepared.' }, { status: 500 });
  }
}
