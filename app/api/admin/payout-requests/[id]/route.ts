import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  PayoutConflictError,
  processPayoutRequest,
} from '@/lib/db/repositories/payouts';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('payout.prepare');
    const body = (await request.json()) as {
      action?: 'prepare' | 'reject';
      note?: string;
      requestId?: string;
    };
    if (!body.requestId || !['prepare', 'reject'].includes(body.action ?? ''))
      return Response.json(
        { error: 'Valid action and request identifier are required.' },
        { status: 400 },
      );
    const { id } = await context.params;
    await processPayoutRequest(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        id,
        actorId: staff.id,
        actorRole: staff.role,
        action: body.action!,
        note: body.note ?? '',
        requestId: body.requestId,
        now: Date.now(),
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof PayoutConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'Payout request could not be processed.' },
      { status: 500 },
    );
  }
}
