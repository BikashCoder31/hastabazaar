import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';

import {
  RECEIPT_COOKIE,
  hashOpaqueToken,
  readCookie,
} from '@/lib/cart/session';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import {
  createCustomerReturnRequest,
  ReturnConflictError,
  type ReturnEvidenceInput,
} from '@/lib/db/repositories/returns';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { getCustomerUser } from '@/lib/auth/customer';
import { validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import {
  maximumEvidenceFiles,
  maximumReturnRequestBytes,
  parseReturnRequest,
  validateEvidenceFile,
  validateEvidenceContent,
} from '@/lib/returns/validation';

export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  const token = readCookie(request, RECEIPT_COOKIE);
  const customer = await getCustomerUser();
  if (!token && !customer)
    return json({ error: 'Order access could not be verified.' }, 404);
  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
  const database = requireDatabase(bindings);
  const rateLimit = await consumeRequestRateLimit(database, request, {
    scope: 'customer-return',
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rateLimit.allowed) return rateLimitJson(rateLimit);
  if (
    Number(request.headers.get('content-length') ?? 0) >
    maximumReturnRequestBytes
  )
    return json({ error: 'The return request upload is too large.' }, 413);
  let formData: FormData;
  try {
    formData = await readBoundedForm(request, maximumReturnRequestBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    return json({ error: 'The return request could not be read.' }, 400);
  }
  const parsed = parseReturnRequest(formData);
  if (!parsed.input)
    return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
  const versions = formData.getAll('formVersion');
  const submittedAnswers = formData.getAll('customAnswers');
  if (versions.length !== 1 || typeof versions[0] !== 'string' ||
    !/^[1-9]\d*$/.test(versions[0]) || submittedAnswers.length !== 1 ||
    typeof submittedAnswers[0] !== 'string' ||
    [...formData.keys()].some((key) => key.startsWith('custom.')))
    return json({ error: 'Form version and answers are required.' }, 400);
  let rawAnswers: unknown;
  try { rawAnswers = JSON.parse(submittedAnswers[0]); }
  catch { return json({ error: 'Invalid form answers.' }, 400); }
  const files = formData
    .getAll('evidence')
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length > maximumEvidenceFiles)
    return json(
      { error: `Add no more than ${maximumEvidenceFiles} evidence files.` },
      400,
    );
  for (const file of files) {
    const error =
      validateEvidenceFile(file) ?? (await validateEvidenceContent(file));
    if (error) return json({ error: `${file.name}: ${error}` }, 400);
  }

  let configured;
  try {
    configured = await validateSellerFormSubmission(database, 'commerce.return-request',
      Number(versions[0]), rawAnswers, parsed.input.idempotencyKey);
  } catch (error) {
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    throw error;
  }

  const { orderNumber } = await context.params;
  const bucket = requireMediaBucket(bindings);
  const returnRequestId = crypto.randomUUID();
  const uploaded: ReturnEvidenceInput[] = [];
  try {
    for (const file of files) {
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
        await file.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const nameSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(file.name))), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const evidenceId = crypto.randomUUID();
      const objectKey = `private/return-evidence/${returnRequestId}/${evidenceId}`;
      await bucket.put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { evidenceId, kind: 'return_evidence' },
      });
      uploaded.push({
        id: evidenceId,
        objectKey,
        originalName: file.name.slice(0, 180),
        mimeType: file.type,
        sizeBytes: file.size,
        sha256,
        nameSha256,
      });
    }
    const result = await createCustomerReturnRequest(database, {
      orderNumber,
      receiptTokenHash: token ? await hashOpaqueToken(token) : null,
      customerId: customer?.userId ?? null,
      ...parsed.input,
      form: { versionId: configured.versionId, answers: configured.answers },
      evidence: uploaded,
      now: Date.now(),
    });
    if (result.duplicate)
      await Promise.allSettled(
        uploaded.map((file) => bucket.delete(file.objectKey)),
      );
    return json(
      {
        ...result,
        message: result.duplicate
          ? 'This request was already received.'
          : 'Your return request has been received.',
      },
      result.duplicate ? 200 : 201,
    );
  } catch (error) {
    await Promise.allSettled(
      uploaded.map((file) => bucket.delete(file.objectKey)),
    );
    if (error instanceof ReturnConflictError)
      return json({ error: error.message }, 409);
    console.error('Customer return request failed', error);
    return json({ error: 'The return request could not be saved.' }, 500);
  }
}
