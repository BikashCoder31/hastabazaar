import {formAnswerSourceSql} from '@/lib/forms/answer-proof';
import { isRiderPortalEnabled } from '@/lib/riders/availability';
import { riderPortalHoldResponse } from '@/lib/riders/portal-hold';
import { env } from 'cloudflare:workers';
import {
  requireCustomerApi,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import {
  approvedRider,
  submitRiderReport,
  RiderError,
} from '@/lib/riders/repository';
import {
  prepareRiderEvidence,
  singleRiderFile,
  RiderMediaError,
} from '@/lib/riders/media-upload';
import { configuredMultipartAnswers, digestMultipartRequest, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError, resolvePublishedForm } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};
const allowedKeys = new Set(['jobId', 'version', 'kind', 'note', 'cash', 'cashPaisa',
  'requestId', 'openBoxOutcome', 'photo', 'video', 'formVersion']);
function validateStructure(form: FormData): void {
  const seen = new Set<string>();
  for (const [name, value] of form) {
    if (name.startsWith('custom.')) continue;
    if (!allowedKeys.has(name) || seen.has(name) ||
      (name === 'photo' || name === 'video') !== (value instanceof File))
      throw new FormValidationError('invalid_answer', 'Unknown or duplicate rider report control.');
    seen.add(name);
  }
}
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  if (!isRiderPortalEnabled()) return riderPortalHoldResponse();
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  let bucket: R2Bucket | null = null,
    key: string | null = null;
  try {
    const user = await requireCustomerApi(),
      bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket },
      db = requireDatabase(bindings);
    if (!(await approvedRider(db, user.userId)))
      return json({ error: 'Current approved rider access is required.' }, 403);
    const rate = await consumeRequestRateLimit(db, request, {
      scope: 'rider-report:' + user.userId,
      limit: 30,
      windowMs: 3600000,
    });
    if (!rate.allowed) return rateLimitJson(rate);
    const form = await readBoundedForm(request, 21 * 1024 * 1024),
      kind = text(form, 'kind'),
      file = singleRiderFile(form, ['photo', 'video'], kind === 'delivered');
    validateStructure(form);
    const versions = form.getAll('formVersion');
    if (versions.length !== 1 || typeof versions[0] !== 'string' || !/^[1-9]\d*$/.test(versions[0]))
      throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    const requestId = text(form, 'requestId');
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))
      throw new FormValidationError('invalid_answer', 'A report request reference is required.');
    const digest = await digestMultipartRequest(form);
    const previous = await db.prepare('SELECT id FROM rider_reports WHERE request_id=? LIMIT 1')
      .bind(requestId).first<{ id: string }>();
    if (previous) {
      const answer = await db.prepare(`SELECT config_version_id AS versionId FROM ${formAnswerSourceSql(db)} retained_answers
        WHERE form_id='rider.report' AND request_id=? LIMIT 1`)
        .bind(requestId).first<{ versionId: string }>();
      if (!answer) throw new RiderError('This report request reference is already used.');
      const id = await submitRiderReport(db, { riderId: user.userId,
        jobId: text(form, 'jobId'), version: Number(text(form, 'version') || 'NaN'),
        kind, note: text(form, 'note'), cashPaisa: Number(text(form, 'cashPaisa') || '0'),
        key: null, mime: null, requestId, openBoxOutcome: text(form, 'openBoxOutcome'),
        now: Date.now(), form: { requestId, versionId: answer.versionId,
          answers: { formId: 'rider.report', version: Number(versions[0]), answers: [] }, digest } });
      return json({ id, status: 'pending' }, 201);
    }
    const config = await resolvePublishedForm(db, 'rider.report');
    const submitted = configuredMultipartAnswers(form, config);
    const configured = await validateSellerFormSubmission(db, 'rider.report',
      submitted.version, submitted.customAnswers, submitted.requestId);
    let mime: string | null = null;
    if (file) {
      const media = await prepareRiderEvidence(file, true);
      mime = media.mime;
      bucket = requireMediaBucket(bindings);
      key = 'private/rider-proof/' + user.userId + '/' + crypto.randomUUID();
      await bucket.put(key, media.bytes, {
        httpMetadata: { contentType: media.mime },
      });
    }
    const id = await submitRiderReport(db, {
      riderId: user.userId,
      jobId: text(form, 'jobId'),
      version: Number(text(form, 'version') || 'NaN'),
      kind,
      note: text(form, 'note'),
      cashPaisa: Number(text(form, 'cashPaisa') || '0'),
      key,
      mime,
      requestId: text(form, 'requestId'),
      openBoxOutcome: text(form, 'openBoxOutcome'),
      now: Date.now(),
      form: { requestId: submitted.requestId, versionId: configured.versionId,
        answers: configured.answers, digest },
    });
    return json({ id, status: 'pending' }, 201);
  } catch (error) {
    if (bucket && key) await bucket.delete(key).catch(() => undefined);
    if (error instanceof CustomerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError)
      return json({ error: error.message }, 413);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof RiderError || error instanceof RiderMediaError)
      return json({ error: error.message }, error instanceof RiderError && /request reference/i.test(error.message) ? 409 : 400);
    return json(
      { error: 'The report or assignment changed. Refresh and try again.' },
      409,
    );
  }
}
