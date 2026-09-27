import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  operateShippingJob,
  OperationsConflictError,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const seller = await requireSellerApi();
    const body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 131_072))) as Record<string, unknown>;
    const { id } = await context.params;
    if (!body || Array.isArray(body) || Object.keys(body).some((key) =>
      !['action', 'note', 'requestId', 'formVersion', 'customAnswers'].includes(key)) ||
      body.action !== 'picked_up' || typeof body.note !== 'string' ||
      typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId) ||
      !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers))
      return Response.json(
        { error: 'Request identifier is required.' },
        { status: 400 },
      );
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(database, 'seller.shipping-action', body.formVersion,
      body.customAnswers, body.requestId);
    await operateShippingJob(
      database,
      {
        jobId: id,
        actorId: seller.userId,
        actorRole: 'seller',
        sellerId: seller.sellerId,
        action: body.action,
        note: body.note,
        requestId: body.requestId,
        now: Date.now(),
        form: { requestId: body.requestId, versionId: form.versionId, answers: form.answers },
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SellerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRequestConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError) return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError) return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (error instanceof BodyTooLargeError) return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid shipping action.' }, { status: 400 });
    return Response.json(
      { error: 'Shipping job could not be updated.' },
      { status: 500 },
    );
  }
}
