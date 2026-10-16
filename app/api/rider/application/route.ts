import { isRiderPortalEnabled } from '@/lib/riders/availability';
import { riderPortalHoldResponse } from '@/lib/riders/portal-hold';
import { env } from 'cloudflare:workers';
import { requireCustomerApi, CustomerAuthorizationError } from '@/lib/auth/customer';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { riderApplicationInput, riderApplicationReplay, submitRiderApplication, RiderError } from '@/lib/riders/repository';
import { prepareRiderEvidence, singleRiderFile, RiderMediaError } from '@/lib/riders/media-upload';
import { configuredMultipartAnswers, digestMultipartRequest, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError, resolvePublishedForm } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const allowedKeys = new Set(['legalName', 'phone', 'district', 'identityType',
  'identityNumber', 'identityPhoto', 'requestId', 'formVersion']);

function validateStructure(form: FormData): void {
  const seen = new Set<string>();
  for (const [name, value] of form) {
    if (name.startsWith('custom.')) continue;
    if (!allowedKeys.has(name) || seen.has(name) ||
      (name === 'identityPhoto') !== (value instanceof File))
      throw new FormValidationError('invalid_answer', 'Unknown or duplicate rider application control.');
    seen.add(name);
  }
}

export async function POST(request: Request) {
  if (!isRiderPortalEnabled()) return riderPortalHoldResponse();
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  let bucket: R2Bucket | null = null;
  let key: string | null = null;
  try {
    const user = await requireCustomerApi();
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const db = requireDatabase(bindings);
    const rate = await consumeRequestRateLimit(db, request, {
      scope: 'rider-application:' + user.userId, limit: 5, windowMs: 3600000,
    });
    if (!rate.allowed) return rateLimitJson(rate);
    const data = await readBoundedForm(request, 6 * 1024 * 1024);
    validateStructure(data);
    const input = riderApplicationInput(data);
    const file = singleRiderFile(data, ['identityPhoto'], true)!;
    const versions = data.getAll('formVersion');
    if (versions.length !== 1 || typeof versions[0] !== 'string' || !/^[1-9]\d*$/.test(versions[0]))
      throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    const requestId = data.get('requestId');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))
      throw new FormValidationError('invalid_answer', 'An application request reference is required.');
    const digest = await digestMultipartRequest(data);
    const prior = await db.prepare(`SELECT config_version_id AS versionId FROM form_answer_sets
      WHERE form_id='rider.application' AND request_id=? LIMIT 1`)
      .bind(requestId).first<{ versionId: string }>();
    if (prior) {
      const id = await riderApplicationReplay(db, { userId: user.userId,
        requestId, versionId: prior.versionId, digest });
      if (!id) throw new RiderError('Application replay state is unavailable.');
      return json({ id, status: 'submitted' }, 201);
    }
    const config = await resolvePublishedForm(db, 'rider.application');
    const submitted = configuredMultipartAnswers(data, config);
    const form = await validateSellerFormSubmission(db, 'rider.application',
      submitted.version, submitted.customAnswers);
    const media = await prepareRiderEvidence(file, false);
    bucket = requireMediaBucket(bindings);
    key = 'private/rider-identity/' + user.userId + '/' + crypto.randomUUID();
    await bucket.put(key, media.bytes, { httpMetadata: { contentType: media.mime } });
    const id = await submitRiderApplication(db, { ...input, userId: user.userId,
      key, mime: media.mime, now: Date.now(),
      form: { requestId: submitted.requestId, versionId: form.versionId,
        answers: form.answers, digest } });
    const stored = await db.prepare('SELECT object_key AS objectKey FROM rider_applications WHERE id=?')
      .bind(id).first<{ objectKey: string }>();
    if (!stored) throw new RiderError('Application replay state is unavailable.');
    if (stored.objectKey !== key) {
      await bucket.delete(key).catch(() => undefined);
      key = null;
    }
    return json({ id, status: 'submitted' }, 201);
  } catch (error) {
    if (bucket && key) await bucket.delete(key).catch(() => undefined);
    if (error instanceof CustomerAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    if (error instanceof FormRuntimeError) return json({ error: error.message, code: error.code },
      error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof RiderError) return json({ error: error.message },
      /request reference|replay state/i.test(error.message) ? 409 : 400);
    if (error instanceof RiderMediaError) return json({ error: error.message }, 400);
    return json({ error: 'The application could not be saved. Refresh and try again.' }, 409);
  }
}
