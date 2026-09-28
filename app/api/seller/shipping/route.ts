import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  createShippingJob,
  OperationsConflictError,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const seller = await requireSellerApi();
    const body = await readBoundedJsonObject(request) as Record<string, unknown>;
    if (
      !body || Array.isArray(body) || Object.keys(body).some((key) =>
        !['orderId', 'direction', 'note', 'requestId', 'formVersion', 'customAnswers', 'sourceFormId'].includes(key)) ||
      body.sourceFormId !== undefined && body.sourceFormId !== 'shipping.console-request' ||
      typeof body.orderId !== 'string' || !body.orderId || body.orderId.length > 191 ||
      typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId) ||
      !['outbound', 'return'].includes(String(body.direction)) ||
      typeof body.note !== 'string' || !Number.isSafeInteger(body.formVersion) ||
      !Array.isArray(body.customAnswers)
    )
      return Response.json(
        { error: 'Order, direction and request identifier are required.' },
        { status: 400 },
      );
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const formId = body.sourceFormId === 'shipping.console-request' ? body.sourceFormId : 'seller.shipping-request';
    const form = await validateSellerFormSubmission(database, formId, body.formVersion,
      body.customAnswers, body.requestId);
    const id = await createShippingJob(
      database,
      {
        orderId: body.orderId,
        sellerId: seller.sellerId,
        actorId: seller.userId,
        direction: body.direction as 'outbound' | 'return',
        note: body.note,
        requestId: body.requestId,
        now: Date.now(),
        form: { formId, requestId: body.requestId, versionId: form.versionId, answers: form.answers },
      },
    );
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof SellerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRequestConflictError) return Response.json({ error: error.message, code: 'request_id_conflict' }, { status: 409 });
    if (error instanceof FormRuntimeError) return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError) return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (error instanceof BodyTooLargeError) return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid shipping request.' }, { status: 400 });
    return Response.json(
      { error: 'Shipping request could not be created.' },
      { status: 500 },
    );
  }
}
