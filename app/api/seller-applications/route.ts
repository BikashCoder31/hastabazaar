import { env } from 'cloudflare:workers';

import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { createSellerApplication } from '@/lib/db/repositories/seller-applications';
import {
  createSellerApplicationReference,
  maximumApplicationBytes,
  parseSellerApplication,
  sellerDocumentFields,
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
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > maximumApplicationBytes) {
    return json({ error: 'The application upload is too large.' }, 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'The application form could not be read.' }, 400);
  }

  const parsed = parseSellerApplication(formData);
  if (!parsed.input) {
    return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
  }

  const files: Array<{ file: File; kind: SellerApplicationDocument['kind'] }> =
    [];
  const fileErrors: string[] = [];

  for (const definition of sellerDocumentFields) {
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

    const kind =
      definition.field === 'taxCertificate' && parsed.input.taxMode === 'VAT'
        ? 'vat_certificate'
        : definition.kind;
    files.push({ file: value, kind });
  }

  if (fileErrors.length > 0) {
    return json({ error: fileErrors[0], errors: fileErrors }, 400);
  }

  const bindings = env as unknown as {
    DB?: D1Database;
    MEDIA?: R2Bucket;
  };
  const database = requireDatabase(bindings);
  const bucket = requireMediaBucket(bindings);
  const userId = crypto.randomUUID();
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
      sellerId,
      applicationReference,
      input: parsed.input,
      documents,
      now: Date.now(),
    });
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => bucket.delete(key)));
    const message = error instanceof Error ? error.message : '';
    if (message.includes('UNIQUE constraint failed')) {
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
