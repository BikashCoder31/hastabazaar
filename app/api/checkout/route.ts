import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { sendPendingOrderUpdates } from '@/lib/email/send-order-updates';
import { recordRequestTrafficEvent } from '@/lib/analytics/request';

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
import {
  consumePublicRequestRateLimit as consumeRequestRateLimit,
  rateLimitJson,
} from '@/lib/http/rate-limit';
import { getCustomerUser, requireExistingCustomerApi, CustomerAuthorizationError } from '@/lib/auth/customer';
import { WalletConflictError } from '@/lib/db/repositories/wallet';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { IncentiveError } from '@/lib/incentives/types';
import { FormValidationError } from '@/lib/forms/validation';
import { ContactVerificationError, resolveCheckoutContactPolicy } from '@/lib/auth/contact-verification';
import { ReviewedCheckoutChangedError } from '@/lib/checkout/reviewed-quote';

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
    const parsed = parseCheckoutInput(await readBoundedJsonObject(request));
    if (!parsed.value)
      return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
    if (!Number.isSafeInteger(parsed.value.formVersion) ||
      !Array.isArray(parsed.value.customAnswers))
      return json({ error: 'Form version and answers are required.' }, 400);
    if (!parsed.value.deliveryRateVersion)
      return json(
        { error: 'Reload checkout to review current delivery rates.' },
        409,
      );
    const customer = parsed.value.promoCode
      ? await requireExistingCustomerApi() : await getCustomerUser();
    if (customer) parsed.value.customerEmail = customer.email;
    if (customer) parsed.value.customerAuthSubject = customer.authSubject;
    const configured = await validateSellerFormSubmission(database, 'commerce.checkout',
      parsed.value.formVersion, parsed.value.customAnswers, parsed.value.idempotencyKey);
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
      { versionId: configured.versionId, answers: configured.answers },
      resolveCheckoutContactPolicy((env as unknown as { CHECKOUT_CONTACT_POLICY?: string }).CHECKOUT_CONTACT_POLICY),
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
    try {
      const analytics = await recordRequestTrafficEvent(database, request, {
        eventType: 'order_completed',
        path: '/checkout',
      });
      if (analytics.cookie)
        response.headers.append('set-cookie', analytics.cookie);
    } catch (error) {
      console.error('Order-completion analytics failed', error);
    }
    return response;
  } catch (error) {
    if (error instanceof ReviewedCheckoutChangedError)
      return json({ error: error.message, code: 'quote_changed' }, 409);
    if (error instanceof ContactVerificationError)
      return json({error:error.message,code:'contact_verification_required'},error.status);
    if (
      error instanceof CheckoutConflictError ||
      error instanceof WalletConflictError
    )
      return json({ error: error.message }, 409);
    if (error instanceof IncentiveError)
      return json({error:error.message,code:error.code},error.code === 'invalid' ? 400 : error.code === 'unauthorized' ? 403 : 409);
    if (error instanceof CustomerAuthorizationError)
      return json({error:error.message},error.status);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid checkout request.' }, 400);
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Checkout request is too large.' }, 413);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    console.error('Checkout failed', error);
    return json(
      { error: 'The order could not be placed. No payment was collected.' },
      500,
    );
  }
}
