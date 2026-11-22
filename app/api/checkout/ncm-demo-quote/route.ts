import { env } from 'cloudflare:workers';
import { CART_COOKIE, hashOpaqueToken, readCookie } from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { getCart } from '@/lib/db/repositories/cart';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { consumePublicRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { ncmDemoCheckout, NcmDemoQuoteError } from '@/lib/shipping/ncm-demo-checkout';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  const demo = ncmDemoCheckout(env);
  if (!demo) return json({ error: 'NCM demo checkout is unavailable.' }, 404);
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  const cartToken = readCookie(request, CART_COOKIE);
  if (!cartToken) return json({ error: 'Review your cart before requesting delivery quotes.' }, 409);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const rate = await consumePublicRequestRateLimit(db, request, {
    scope: 'checkout-ncm-demo-quote', limit: 15, windowMs: 60_000,
  });
  if (!rate.allowed) return rateLimitJson(rate);
  try {
    const body = await readBoundedJsonObject(request);
    if (typeof body.district !== 'string' || body.district.length > 80)
      return json({ error: 'Select a delivery district.' }, 400);
    const cart = await getCart(db, await hashOpaqueToken(cartToken));
    if (!cart.items.length || cart.hasUnavailableItems)
      return json({ error: 'Review your cart before requesting delivery quotes.' }, 409);
    const { quotes, deliveryPaisa } = await demo.quote(db, cart.items.map(item => item.sellerId), body.district);
    return json({ quotes, deliveryPaisa });
  } catch (error) {
    if (error instanceof NcmDemoQuoteError)
      return json({ error: error.message, code: 'ncm_quote_unavailable' }, 503);
    if (error instanceof BodyTooLargeError) return json({ error: 'Quote request is too large.' }, 413);
    if (error instanceof SyntaxError) return json({ error: 'Invalid quote request.' }, 400);
    throw error;
  }
}
