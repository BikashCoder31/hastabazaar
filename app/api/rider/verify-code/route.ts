import { env } from 'cloudflare:workers';
import {
  requireCustomerApi,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { parseRiderCodeRequest } from '@/lib/riders/customer-code';
import {
  approvedRider,
  verifyRiderOtp,
  RiderError,
  RiderReplayConflictError,
  RiderStorageError,
} from '@/lib/riders/repository';
import { validateSellerFormSubmission } from '@/lib/forms/submission';
import { assertNoIdentitySecrets } from '@/lib/auth/identity-form-answers';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const user = await requireCustomerApi(),
      db = requireDatabase(env as unknown as { DB?: D1Database });
    if (!(await approvedRider(db, user.userId)))
      return json({ error: 'Current approved rider access is required.' }, 403);
    const limit = await consumeRequestRateLimit(db, request, {
      scope: 'rider-code-verify:' + user.userId,
      limit: 20,
      windowMs: 15 * 60000,
    });
    if (!limit.allowed) return rateLimitJson(limit);
    const raw = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 131072))) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some((key) => !['jobId', 'version', 'code', 'requestId',
        'formVersion', 'customAnswers'].includes(key)))
      throw new FormValidationError('invalid_answer', 'Invalid code verification request.');
    const data = raw as Record<string, unknown>;
    const value = parseRiderCodeRequest(data, true);
    if (!Number.isSafeInteger(data.formVersion))
      throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    if (typeof data.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(data.requestId))
      throw new FormValidationError('invalid_answer', 'A verification request reference is required.');
    const form = await validateSellerFormSubmission(db, 'rider.code-verify',
      data.formVersion, data.customAnswers, data.requestId);
    assertNoIdentitySecrets(form.answers, [value.code], request.headers, { rejectNumericSecrets: true });
    const verified = await verifyRiderOtp(db, {
      ...value,
      riderId: user.userId,
      now: Date.now(),
      form: { requestId: data.requestId, versionId: form.versionId, answers: form.answers },
    });
    return json(
      verified
        ? {
            verified: true,
            message:
              'Code verified. Complete the proof report; staff still confirms delivery.',
          }
        : {
            code: 'invalid_code',
            error:
              'The code is invalid, expired or unavailable for this assignment.',
          },
      verified ? 200 : 409,
    );
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Request is too large.' }, 413);
    if (error instanceof CustomerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof RiderStorageError)
      return json({ error: error.message, code: 'storage_unavailable' }, 503);
    if (error instanceof RiderReplayConflictError)
      return json({ error: error.message, code: 'request_conflict' }, 409);
    return json(
      {
        error:
          error instanceof RiderError
            ? error.message
            : 'Code could not be verified.',
      },
      400,
    );
  }
}
