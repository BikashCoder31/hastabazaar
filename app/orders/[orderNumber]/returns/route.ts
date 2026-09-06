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
import { getCustomerUser } from '@/lib/auth/customer';
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
  if (
    Number(request.headers.get('content-length') ?? 0) >
    maximumReturnRequestBytes
  )
    return json({ error: 'The return request upload is too large.' }, 413);
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'The return request could not be read.' }, 400);
  }
  const parsed = parseReturnRequest(formData);
  if (!parsed.input)
    return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
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

  const { orderNumber } = await context.params;
  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
  const database = requireDatabase(bindings);
  const bucket = requireMediaBucket(bindings);
  const returnRequestId = crypto.randomUUID();
  const uploaded: ReturnEvidenceInput[] = [];
  try {
    for (const file of files) {
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
      });
    }
    const result = await createCustomerReturnRequest(database, {
      orderNumber,
      receiptTokenHash: token ? await hashOpaqueToken(token) : null,
      customerId: customer?.userId ?? null,
      ...parsed.input,
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
