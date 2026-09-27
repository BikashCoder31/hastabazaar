import { env } from 'cloudflare:workers';
import {
  CustomerAuthorizationError,
  requireCustomerApi,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import {
  createDataRightsRequest,
  OperationsConflictError,
  privacyRequestStatus,
  validatePrivacyRequestForm,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const customer = await requireCustomerApi();
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const rateLimit = await consumeRequestRateLimit(database, request, {
      scope: 'privacy-request',
      limit: 5,
      windowMs: 24 * 60 * 60_000,
    });
    if (!rateLimit.allowed) return rateLimitJson(rateLimit);
    const body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 131_072))) as {
      requestType?: string;
      detail?: string;
      requestId?: string;
      formVersion?: number;
      customAnswers?: unknown;
    };
    if (typeof body?.requestId !== 'string' || !body.requestId || body.requestId.length > 100 ||
      typeof body.requestType !== 'string' || typeof body.detail !== 'string' ||
      !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers))
      return Response.json(
        { error: 'Request type, detail, form version, answers and identifier are required.' },
        { status: 400 },
      );
    const replay = await privacyRequestStatus(database, { customerId: customer.userId, requestType: body.requestType,
      detail: body.detail, requestId: body.requestId, formVersion: body.formVersion!, customAnswers: body.customAnswers });
    if (replay.status === 'same') return Response.json({ id: replay.id }, { status: 201 });
    if (replay.status === 'conflict') throw new OperationsConflictError('This request ID was already used for different privacy request values.');
    const form = await validatePrivacyRequestForm(database, body.formVersion!, body.customAnswers);
    const id = await createDataRightsRequest(database, {
      customerId: customer.userId,
      requestType: body.requestType ?? '',
      detail: body.detail ?? '',
      requestId: body.requestId,
      now: Date.now(),
      form,
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof BodyTooLargeError) return Response.json({ error: 'Privacy request is too large.' }, { status: 413 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid privacy request.' }, { status: 400 });
    if (error instanceof FormRuntimeError) return Response.json({ error: error.code === 'stale_version' ? error.message : 'Form configuration is unavailable.', code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError) return Response.json({ error: error.message, ...(error.fieldId ? { fieldId: error.fieldId } : {}) }, { status: 400 });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'Privacy request could not be submitted.' },
      { status: 500 },
    );
  }
}
