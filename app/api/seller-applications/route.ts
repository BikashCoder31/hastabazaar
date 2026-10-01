import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';
import { getCustomerUser, CustomerAuthorizationError } from '@/lib/auth/customer';

import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { createSellerApplication } from '@/lib/db/repositories/seller-applications';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import {
  createSellerApplicationReference,
  maximumApplicationBytes,
  parseSellerApplication,
  sellerDocumentsForApplication,
  type SellerApplicationDocument,
  validateSellerDocument,
  validateSellerDocumentContent,
} from '@/lib/sellers/application';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
  const database = requireDatabase(bindings);
  const rateLimit = await consumeRequestRateLimit(database, request, {
    scope: 'seller-application',
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rateLimit.allowed) return rateLimitJson(rateLimit);
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > maximumApplicationBytes) {
    return json({ error: 'The application upload is too large.' }, 413);
  }

  let formData: FormData;
  try {
    formData = await readBoundedForm(request, maximumApplicationBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    return json({ error: 'The application form could not be read.' }, 400);
  }

  const parsed = parseSellerApplication(formData);
  if (!parsed.input) {
    return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
  }

  let customer;
  try {
    customer = await getCustomerUser();
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return json({ error: error.message }, error.status);
    throw error;
  }
  if (customer && parsed.input.email.toLowerCase() !== customer.email.toLowerCase()) {
    return json({ error: 'Use your signed-in account email for this application. To apply with a different account, sign in to that account first.' }, 409);
  }
  if (!customer) {
    const existing = await database.prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1')
      .bind(parsed.input.email.toLowerCase()).first();
    if (existing) return json({ error: 'Sign in with this email before applying to sell, then return to this form.' }, 409);
  }

  const files: Array<{ file: File; kind: SellerApplicationDocument['kind'] }> =
    [];
  const fileErrors: string[] = [];

  for (const definition of sellerDocumentsForApplication(parsed.input)) {
    const value = formData.get(definition.field);
    if (!(value instanceof File) || value.size === 0) {
      if (definition.required)
        fileErrors.push(`${definition.label} is required.`);
      continue;
    }

    const validationError =
      validateSellerDocument(value) ??
      (await validateSellerDocumentContent(value));
    if (validationError) {
      fileErrors.push(`${definition.label}: ${validationError}`);
      continue;
    }

    const kind = definition.kind;
    files.push({ file: value, kind });
  }

  if (fileErrors.length > 0) {
    return json({ error: fileErrors[0], errors: fileErrors }, 400);
  }

  const bucket = requireMediaBucket(bindings);
  const userId = customer?.userId ?? crypto.randomUUID();
  const sellerId = crypto.randomUUID();
  const applicationReference = createSellerApplicationReference();
  const uploadedKeys: string[] = [];
  const documents: SellerApplicationDocument[] = [];

  try {
    for (const { file, kind } of files) {
      const documentId = crypto.randomUUID();
      const objectKey = `private/seller-documents/${sellerId}/${documentId}`;
      await bucket.put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { sellerId, documentKind: kind },
      });
      uploadedKeys.push(objectKey);
      documents.push({
        id: documentId,
        kind,
        objectKey,
        originalName: file.name.slice(0, 180),
        mimeType: file.type,
        sizeBytes: file.size,
      });
    }

    await createSellerApplication(database, {
      userId,
      existingAccount: Boolean(customer),
      sellerId,
      applicationReference,
      input: parsed.input,
      documents,
      now: Date.now(),
    });
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => bucket.delete(key)));
    const message = error instanceof Error ? error.message : '';
    if (/UNIQUE constraint failed|Duplicate entry/i.test(message)) {
      return json(
        {
          error:
            'An application already exists for this email, phone, registration, or tax number.',
        },
        409,
      );
    }
    return json(
      { error: 'The application could not be saved. Please try again.' },
      500,
    );
  }

  return json(
    {
      applicationReference,
      status: 'submitted',
      message: 'Your seller application has been received for review.',
    },
    201,
  );
}
