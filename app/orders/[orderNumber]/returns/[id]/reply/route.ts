import { env } from 'cloudflare:workers';
import {
  RECEIPT_COOKIE,
  hashOpaqueToken,
  readCookie,
} from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import {
  addCustomerReturnClarification,
  ReturnConflictError,
} from '@/lib/db/repositories/returns';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { getCustomerUser } from '@/lib/auth/customer';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string; id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  const token = readCookie(request, RECEIPT_COOKIE);
  const customer = await getCustomerUser();
  if (!token && !customer)
    return json({ error: 'Order access could not be verified.' }, 404);
  try {
    const { orderNumber, id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const locale = body.locale === 'ne-NP' ? 'ne-NP' : 'en-NP';
    const requestId =
      typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    if (message.length < 8 || message.length > 2_000)
      return json({ error: 'Add a reply of 8–2,000 characters.' }, 400);
    if (requestId.length < 8 || requestId.length > 100)
      return json({ error: 'The request identifier is invalid.' }, 400);
    await addCustomerReturnClarification(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        returnRequestId: id,
        orderNumber,
        receiptTokenHash: token ? await hashOpaqueToken(token) : null,
        customerId: customer?.userId ?? null,
        message,
        locale,
        requestId,
        now: Date.now(),
      },
    );
    return json({ ok: true });
  } catch (error) {
    if (error instanceof ReturnConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    console.error('Return clarification failed', error);
    return json({ error: 'The reply could not be saved.' }, 500);
  }
}
