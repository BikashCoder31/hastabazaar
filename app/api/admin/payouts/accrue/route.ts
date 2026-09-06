import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { accrueExistingDeliveredEarnings } from '@/lib/db/repositories/payouts';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const staff = await requireStaffApi('payout.prepare');
    const body = await request.json().catch(() => null) as { idempotencyKey?: string } | null;
    if (!body?.idempotencyKey || body.idempotencyKey.length > 100) return Response.json({ error: 'A valid idempotency key is required.' }, { status: 400 });
    await accrueExistingDeliveredEarnings(requireDatabase(env as unknown as { DB?: D1Database }), {
      actorId: staff.id,
      requestId: body.idempotencyKey,
      now: Date.now(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Delivered earnings could not be accrued.' }, { status: 500 });
  }
}
