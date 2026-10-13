import { isRiderPortalEnabled } from '@/lib/riders/availability';
import { riderPortalHoldResponse } from '@/lib/riders/portal-hold';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import {
  requireCustomerApi,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import {
  approvedRider,
  RiderError,
  submitRiderRemittance,
} from '@/lib/riders/repository';
import { digestFormRequest, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!isRiderPortalEnabled()) return riderPortalHoldResponse();
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const user = await requireCustomerApi(),
      db = requireDatabase(env as unknown as { DB?: D1Database });
    if (!(await approvedRider(db, user.userId)))
      return json({ error: 'Current approved rider access is required.' }, 403);
    const rate = await consumeRequestRateLimit(db, request, {
      scope: 'rider-remittance:' + user.userId,
      limit: 20,
      windowMs: 3_600_000,
    });
    if (!rate.allowed) return rateLimitJson(rate);
    let data: Record<string, unknown>;
    try {
      data = await readBoundedJsonObject(request) as Record<
        string,
        unknown
      >;
    } catch (error) {
      if (error instanceof BodyTooLargeError) throw error;
      return json({ error: 'Use a valid remittance request.' }, 400);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some((key) => !['jobId', 'requestId', 'amountPaisa', 'reference',
        'formVersion', 'customAnswers'].includes(key)))
      return json({ error: 'Use a valid remittance request.' }, 400);
    if (!Number.isSafeInteger(data.formVersion))
      throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    const form = await validateSellerFormSubmission(db, 'rider.remittance',
      data.formVersion, data.customAnswers, typeof data.requestId === 'string' ? data.requestId : undefined);
    const digest = await digestFormRequest({ jobId: data.jobId, amountPaisa: data.amountPaisa,
      reference: data.reference, formVersion: data.formVersion, customAnswers: data.customAnswers });
    const result = await submitRiderRemittance(db, {
      riderId: user.userId,
      jobId: typeof data.jobId === 'string' ? data.jobId : '',
      requestId: typeof data.requestId === 'string' ? data.requestId : '',
      amountPaisa: Number(data.amountPaisa),
      reference: typeof data.reference === 'string' ? data.reference : '',
      now: Date.now(),
      form: { requestId: typeof data.requestId === 'string' ? data.requestId : '',
        versionId: form.versionId, answers: form.answers, digest },
    });
    return json(result, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof CustomerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError)
      return json({ error: error.message }, 413);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof RiderError)
      return json({ error: error.message }, 409);
    return json(
      { error: 'The remittance could not be submitted. Refresh and try again.' },
      409,
    );
  }
}
