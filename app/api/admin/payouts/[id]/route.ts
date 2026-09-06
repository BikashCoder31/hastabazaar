import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { operatePayout, PayoutConflictError, type PayoutOperation } from '@/lib/db/repositories/payouts';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';
const actions = new Set<PayoutOperation>(['approve', 'reject', 'start_processing', 'mark_paid', 'mark_failed']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const body = await request.json().catch(() => null) as { action?: string; note?: string; providerReference?: string; idempotencyKey?: string } | null;
    if (!body?.action || !actions.has(body.action as PayoutOperation) || !body.idempotencyKey || body.idempotencyKey.length > 100) {
      return Response.json({ error: 'A valid payout action and idempotency key are required.' }, { status: 400 });
    }
    const action = body.action as PayoutOperation;
    const permission = action === 'approve' || action === 'reject' ? 'payout.approve' : 'payout.mark_paid';
    const staff = await requireStaffApi(permission);
    const { id } = await context.params;
    await operatePayout(requireDatabase(env as unknown as { DB?: D1Database }), {
      payoutId: id,
      actorId: staff.id,
      actorRole: staff.role,
      action,
      note: body.note ?? '',
      providerReference: body.providerReference,
      requestId: body.idempotencyKey,
      now: Date.now(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof PayoutConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'The payout could not be updated.' }, { status: 500 });
  }
}
