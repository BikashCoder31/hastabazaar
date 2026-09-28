import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import {
  requireExistingCustomerApi,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import { CART_COOKIE, readCookie, hashOpaqueToken } from '@/lib/cart/session';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { normalizePromoCode } from '@/lib/incentives/promo-policy';
import { IncentiveError } from '@/lib/incentives/types';
import { quoteCheckoutPromo } from '@/lib/incentives/quote-intent';
export const dynamic = 'force-dynamic';
function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
export async function GET(_request: Request): Promise<Response> {
  return json({ error: 'Use POST to review a promo quote.' }, 405);
}
export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const body = await readBoundedJsonObject(request);
    if (
      Object.keys(body).some(
        (key) => !['code', 'formVersion', 'customAnswers'].includes(key),
      ) ||
      typeof body.code !== 'string' ||
      !Number.isSafeInteger(body.formVersion) ||
      !Array.isArray(body.customAnswers) ||
      body.customAnswers.length
    )
      return json({ error: 'Invalid promo quote request.' }, 400);
    const code = normalizePromoCode(body.code);
    const customer = await requireExistingCustomerApi();
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const rate = await consumeRequestRateLimit(db, request, {
      scope: `checkout-promo:${customer.userId}`,
      limit: 20,
      windowMs: 15 * 60000,
    });
    if (!rate.allowed) return rateLimitJson(rate);
    const token = readCookie(request, CART_COOKIE);
    if (!token)
      return json({ error: 'Review your cart before applying a promo.' }, 409);
    await validateSellerFormSubmission(
      db,
      'commerce.promo-quote',
      body.formVersion,
      body.customAnswers,
      undefined,
      { code },
    );
    return json(
      await quoteCheckoutPromo(
        db,
        customer.userId,
        await hashOpaqueToken(token),
        code,
        Date.now(),
        customer.authSubject,
      ),
    );
  } catch (error) {
    if (error instanceof CustomerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Promo request is too large.' }, 413);
    if (error instanceof SyntaxError || error instanceof FormValidationError)
      return json({ error: 'Invalid promo quote request.' }, 400);
    if (error instanceof IncentiveError)
      return json(
        { error: error.message, code: error.code },
        error.code === 'invalid'
          ? 400
          : error.code === 'unauthorized'
            ? 403
            : 409,
      );
    if (error instanceof FormRuntimeError)
      return json(
        { error: error.message, code: error.code },
        error.code === 'stale_version' ? 409 : 503,
      );
    console.error('Promo quote failed', error);
    return json({ error: 'The promo could not be quoted.' }, 500);
  }
}
