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
const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
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
    });
    return json({ id, status: 'pending' }, 201);
  } catch (error) {
    if (bucket && key) await bucket.delete(key).catch(() => undefined);
    if (error instanceof CustomerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError)
      return json({ error: error.message }, 413);
    if (error instanceof RiderError || error instanceof RiderMediaError)
      return json({ error: error.message }, 400);
    return json(
      { error: 'The report or assignment changed. Refresh and try again.' },
      409,
    );
  }
}
