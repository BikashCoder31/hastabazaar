import { env } from 'cloudflare:workers';
import { sendPendingOrderUpdates } from '@/lib/email/send-order-updates';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  FulfillmentConflictError,
  transitionAdminFulfillment,
  type AdminFulfillmentAction,
} from '@/lib/db/repositories/fulfillment';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const staff = await requireStaffApi('order.manage');
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as AdminFulfillmentAction;
    if (!['dispatch', 'deliver', 'cancel'].includes(action)) return json({ error: 'Invalid fulfilment action.' }, 400);
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length < 8 || note.length > 500) return json({ error: 'Add a clear note of 8–500 characters.' }, 400);
    const trackingCode = typeof body.trackingCode === 'string' ? body.trackingCode.trim() : undefined;
    await transitionAdminFulfillment(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        orderId: id,
        actorId: staff.id,
        action,
        note,
        trackingCode,
        requestId: crypto.randomUUID(),
        now: Date.now(),
      },
    );
    await sendPendingOrderUpdates({ orderId: id });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof FulfillmentConflictError) return json({ error: error.message }, 409);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400);
    console.error('Admin fulfilment update failed', error);
    return json({ error: 'The fulfilment status could not be updated.' }, 500);
  }
}
