import { env } from 'cloudflare:workers';

import {
  RECEIPT_COOKIE,
  hashOpaqueToken,
  readCookie,
} from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import {
  cancelCustomerOrder,
  FulfillmentConflictError,
} from '@/lib/db/repositories/fulfillment';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { getCustomerUser } from '@/lib/auth/customer';

export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  const token = readCookie(request, RECEIPT_COOKIE);
  const customer = await getCustomerUser();
  if (!token && !customer)
    return json({ error: 'Order access could not be verified.' }, 404);
  try {
    const { orderNumber } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 8 || reason.length > 300)
      return json(
        { error: 'Add a cancellation reason of 8–300 characters.' },
        400,
      );
    await cancelCustomerOrder(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        orderNumber,
        receiptTokenHash: token ? await hashOpaqueToken(token) : null,
        customerId: customer?.userId ?? null,
        note: reason,
        requestId: crypto.randomUUID(),
        now: Date.now(),
      },
    );
    return json({ ok: true });
  } catch (error) {
    if (error instanceof FulfillmentConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    console.error('Customer cancellation failed', error);
    return json({ error: 'The cancellation could not be completed.' }, 500);
  }
}
