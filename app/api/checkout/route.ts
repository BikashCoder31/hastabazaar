import { env } from 'cloudflare:workers';
import { sendPendingOrderUpdates } from '@/lib/email/send-order-updates';

import {
  CART_COOKIE,
  hashOpaqueToken,
  readCookie,
  receiptCookie,
} from '@/lib/cart/session';
import { parseCheckoutInput } from '@/lib/checkout/validation';
import { requireDatabase } from '@/lib/db/d1';
import {
  CheckoutConflictError,
  createCodOrder,
} from '@/lib/db/repositories/orders';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { getCustomerUser } from '@/lib/auth/customer';
import { WalletConflictError } from '@/lib/db/repositories/wallet';

export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200, cookie?: string): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  if (cookie) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const rateLimit = await consumeRequestRateLimit(database, request, {
    scope: 'checkout',
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) return rateLimitJson(rateLimit);
  const cartToken = readCookie(request, CART_COOKIE);
  if (!cartToken) return json({ error: 'Your cart is empty.' }, 409);
  try {
    const parsed = parseCheckoutInput(await request.json());
    if (!parsed.value)
      return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
    if(!parsed.value.deliveryRateVersion)return json({error:'Reload checkout to review current delivery rates.'},409);
    const customer = await getCustomerUser();
    if (customer) parsed.value.customerEmail = customer.email;
    const [cartHash, receiptHash] = await Promise.all([
      hashOpaqueToken(cartToken),
      hashOpaqueToken(parsed.value.idempotencyKey),
    ]);
    const result = await createCodOrder(
      database,
      cartHash,
      receiptHash,
      parsed.value,
      Date.now(),
      customer?.userId ?? null,
    );
    await sendPendingOrderUpdates({ orderNumber: result.orderNumber });
    const response = json(
      result,
      201,
      receiptCookie(request, parsed.value.idempotencyKey),
    );
    response.headers.append(
      'Set-Cookie',
      'hastabazaar_referral=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
    );
    return response;
  } catch (error) {
    if (
      error instanceof CheckoutConflictError ||
      error instanceof WalletConflictError
    )
      return json({ error: error.message }, 409);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid checkout request.' }, 400);
    console.error('Checkout failed', error);
    return json(
      { error: 'The order could not be placed. No payment was collected.' },
      500,
    );
  }
}
