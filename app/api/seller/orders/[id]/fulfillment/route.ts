import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  FulfillmentConflictError,
  transitionSellerFulfillment,
  type SellerFulfillmentAction,
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
    const seller = await requireSellerApi();
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as SellerFulfillmentAction;
    if (!['start_packing', 'ready_for_pickup'].includes(action)) return json({ error: 'Invalid fulfilment action.' }, 400);
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 300) return json({ error: 'Note must be 300 characters or fewer.' }, 400);
    await transitionSellerFulfillment(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        orderId: id,
        sellerId: seller.sellerId,
        actorId: seller.userId,
        action,
        note,
        requestId: crypto.randomUUID(),
        now: Date.now(),
      },
    );
    return json({ ok: true });
  } catch (error) {
    if (error instanceof SellerAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof FulfillmentConflictError) return json({ error: error.message }, 409);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400);
    console.error('Seller fulfilment update failed', error);
    return json({ error: 'The fulfilment status could not be updated.' }, 500);
  }
}
