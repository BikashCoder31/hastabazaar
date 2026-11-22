import {readOrderCustomerIntent} from '@/lib/orders/customer-intent';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import {
  RECEIPT_COOKIE,
  hashOpaqueToken,
  readCookie,
} from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {CustomerAuthorizationError} from '@/lib/auth/customer';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import {
  cancellationChoices,
  cancellationOutcome,
  cancellationPreview,
  cancelSelectedParcels,
  CancellationConflictError,
} from '@/lib/cancellation/repository';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function access(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  const token=readCookie(request,RECEIPT_COOKIE),intent=await readOrderCustomerIntent(request);
  if(!intent.ok)throw new CustomerAuthorizationError(intent.error,intent.status);
  const customer=intent.customer;
  if (!token && !customer)
    throw new CancellationConflictError('Order access could not be verified.');
  return {
    orderNumber: (await context.params).orderNumber,
    receiptTokenHash: token ? await hashOpaqueToken(token) : null,
    customerId: customer?.userId ?? null,
  };
}
export async function GET(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  try {
    const attempt=new URL(request.url).searchParams.get('attempt');
    if(attempt)return json({outcome:await cancellationOutcome(requireDatabase(env as unknown as {DB?:D1Database}),await access(request,context),attempt)});
    return json({
      choices: await cancellationChoices(
        requireDatabase(env as unknown as { DB?: D1Database }),
        await access(request, context),
      ),
    });
  } catch(error) {
    if(error instanceof CustomerAuthorizationError)return json({error:error.message},error.status);
    return json({ error: 'Order access could not be verified.' }, 404);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  let db: D1Database | null = null;
  let validatedVersionId: string | undefined;
  try {
    const a = await access(request, context),
      database = requireDatabase(env as unknown as { DB?: D1Database }),
      body = await readBoundedJsonObject(request) as unknown;
    db = database;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['action','sellerIds','fingerprint','requestId',
        'reason','formVersion','customAnswers'].includes(key)))
      return json({ error: 'Invalid cancellation request.' }, 400);
    const input = body as Record<string, unknown>;
    if (
      !Array.isArray(input.sellerIds) ||
      input.sellerIds.length > 50 ||
      input.sellerIds.some((v) => typeof v !== 'string')
    )
      return json({ error: 'Choose seller parcels.' }, 400);
    const sellerIds = input.sellerIds as string[];
    if (!['preview', 'confirm'].includes(String(input.action)) ||
      !Number.isSafeInteger(input.formVersion) || !Array.isArray(input.customAnswers))
      return json({ error: 'Review the current cancellation form.' }, 400);
    const form = await validateSellerFormSubmission(database, 'commerce.order-cancellation',
      input.formVersion, input.customAnswers,
      input.action === 'confirm' && typeof input.requestId === 'string' ? input.requestId : undefined);
    validatedVersionId = form.versionId;
    if (input.action === 'preview') {
      if (input.requestId !== undefined || input.fingerprint !== undefined ||
        input.reason !== undefined && typeof input.reason !== 'string')
        return json({ error: 'Preview only the current selection.' }, 400);
      const p = await cancellationPreview(database, a, sellerIds);
      return json({
        fingerprint: p.fingerprint,
        reviewRequired: p.reviewRequired,
        walletRestored: p.walletRestored,
        discountRemoved: p.discountRemoved,
        delivery: p.next.delivery,
        deliveryPricingPolicy:p.deliveryPricingPolicy,
        total: p.next.total,
        collected: p.parcels.reduce((n, r) => n + r.collected, 0),
      });
    }
    if (
      input.action !== 'confirm' ||
      typeof input.fingerprint !== 'string' ||
      typeof input.requestId !== 'string' ||
      typeof input.reason !== 'string'
    )
      return json(
        { error: 'Review the current amounts before confirming.' },
        400,
      );
    return json(
      await cancelSelectedParcels(database, a, {
        sellerIds,
        fingerprint: input.fingerprint,
        requestId: input.requestId,
        note: input.reason,
        now: Date.now(),
        form: { formId: 'commerce.order-cancellation', requestId: input.requestId,
          versionId: form.versionId, answers: form.answers },
      }),
    );
  } catch (error) {
    if(error instanceof CustomerAuthorizationError)return json({error:error.message},error.status);
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Request too large.' }, 413);
    if (error instanceof SyntaxError) return json({ error: 'Invalid cancellation request.' }, 400);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (db && validatedVersionId && await isValidatedFormVersionStale(db,
      'commerce.order-cancellation', validatedVersionId))
      return json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, 409);
    return json(
      {
        error:
          error instanceof CancellationConflictError
            ? error.message
            : 'Cancellation could not be completed. Refresh and review the current order.',
      },
      409,
    );
  }
}
