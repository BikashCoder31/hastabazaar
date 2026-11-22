import { env } from 'cloudflare:workers';
import { RECEIPT_COOKIE, hashOpaqueToken, readCookie } from '@/lib/cart/session';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { addCustomerReturnClarification, hasCustomerReturnClarificationAccess,
  ReturnConflictError, type ReturnEvidenceInput } from '@/lib/db/repositories/returns';
import { validateEvidenceContent } from '@/lib/documents/document-content';
import { BodyTooLargeError, formText, readBoundedBody, readBoundedForm } from '@/lib/http/bounded-body';
import { consumePublicRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readOrderCustomerIntent } from '@/lib/orders/customer-intent';
import { deletePrivateReturnEvidence, uploadPrivateReturnEvidence } from '@/lib/returns/private-evidence-upload';
import { maximumEvidenceFiles, maximumReturnRequestBytes, validateEvidenceFile } from '@/lib/returns/validation';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string; id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  const token = readCookie(request, RECEIPT_COOKIE);
  const intent = await readOrderCustomerIntent(request);
  if (!intent.ok) return json({ error: intent.error }, intent.status);
  const customer = intent.customer;
  if (!token && !customer)
    return json({ error: 'Order access could not be verified.' }, 404);

  let bucket: R2Bucket | undefined;
  let uploaded: ReturnEvidenceInput[] = [];
  try {
    const { orderNumber, id } = await context.params;
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const database = requireDatabase(bindings);
    const scope = { returnRequestId: id, orderNumber, receiptTokenHash: token ? await hashOpaqueToken(token) : null,
      customerId: customer?.userId ?? null };
    const multipart = request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data') ?? false;
    let body: Record<string, unknown>;
    let files: File[] = [];

    if (multipart) {
      if (!await hasCustomerReturnClarificationAccess(database, scope))
        return json({ error: 'This original return is unavailable.' }, 404);
      const rateLimit = await consumePublicRequestRateLimit(database, request, {
        scope: 'customer-return-reply-evidence', limit: 10, windowMs: 60 * 60_000,
      });
      if (!rateLimit.allowed) return rateLimitJson(rateLimit);
      const form = await readBoundedForm(request, maximumReturnRequestBytes);
      const keys = ['message', 'locale', 'idempotencyKey'];
      if (keys.some(key => form.getAll(key).length !== 1) || [...form.keys()].some(key => !keys.includes(key) && key !== 'evidence'))
        return json({ error: 'Check your reply and attach only the requested photos.' }, 400);
      const evidence = form.getAll('evidence');
      if (evidence.some(value => !(value instanceof File)))
        return json({ error: 'Choose the original photo files.' }, 400);
      files = evidence.filter((value): value is File => value instanceof File && value.size > 0);
      body = Object.fromEntries(keys.map(key => [key, formText(form, key)]));
    } else {
      const decoded: unknown = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 24 * 1024)));
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
        return json({ error: 'Invalid request.' }, 400);
      body = decoded as Record<string, unknown>;
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const locale = body.locale === 'ne-NP' ? 'ne-NP' : 'en-NP';
    const requestId = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    if (message.length < 10 || message.length > 2_000)
      return json({ error: 'Add a reply of 10–2,000 characters.' }, 400);
    if (requestId.length < 8 || requestId.length > 100)
      return json({ error: 'The request identifier is invalid.' }, 400);
    if (files.length > maximumEvidenceFiles)
      return json({ error: `Choose up to ${maximumEvidenceFiles} photos.` }, 400);
    for (const file of files) {
      const error = !file.type.startsWith('image/') ? 'Use a JPG, PNG or WebP photo.' : validateEvidenceFile(file) ?? await validateEvidenceContent(file);
      if (error) return json({ error: `${file.name}: ${error}` }, 400);
    }
    if (files.length) {
      bucket = requireMediaBucket(bindings);
      uploaded = await uploadPrivateReturnEvidence(bucket, crypto.randomUUID(), files);
    }
    const result = await addCustomerReturnClarification(database, { ...scope, message, locale, requestId,
      now: Date.now(), evidence: uploaded });
    if (result.duplicate && bucket) await deletePrivateReturnEvidence(bucket, uploaded);
    return json({ ok: true });
  } catch (error) {
    if (bucket) await deletePrivateReturnEvidence(bucket, uploaded);
    if (error instanceof ReturnConflictError) return json({ error: error.message }, 409);
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    if (error instanceof SyntaxError || error instanceof TypeError) return json({ error: 'Check the reply and photos and try again.' }, 400);
    console.error('Return clarification failed', error);
    return json({ error: 'The reply could not be saved.' }, 500);
  }
}
