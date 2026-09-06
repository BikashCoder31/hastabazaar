import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import {
  areActiveOccasions,
  getSellerProductForRevision,
  isActiveCategory,
  ProductRevisionConflictError,
  reviseAndResubmitProduct,
} from '@/lib/db/repositories/products';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {
  maximumProductSubmissionBytes,
  parseProductSubmission,
  productImageFields,
  validateProductImage,
  validateProductImageContent,
  type ProductImageUpload,
} from '@/lib/products/submission';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Cross-site requests are not allowed.' }, 403);
  if (Number(request.headers.get('content-length') ?? 0) > maximumProductSubmissionBytes) {
    return json({ error: 'The product submission is too large.' }, 413);
  }

  let bucket: R2Bucket | null = null;
  const uploadedKeys: string[] = [];
  try {
    const seller = await requireSellerApi();
    const { id } = await context.params;
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const database = requireDatabase(bindings);
    const current = await getSellerProductForRevision(database, seller.sellerId, id);
    if (!current) return json({ error: 'Product not found.' }, 404);
    if (current.status !== 'needs_changes') {
      return json({ error: 'Only products needing changes can be revised.' }, 409);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return json({ error: 'The product form could not be read.' }, 400);
    }
    const parsed = parseProductSubmission(formData);
    if (!parsed.input) return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
    if (!(await isActiveCategory(database, parsed.input.categoryId))) {
      return json({ error: 'Select an active product category.' }, 400);
    }
    if (!(await areActiveOccasions(database, parsed.input.occasionIds))) {
      return json({ error: 'Select 1–5 active gift occasions.' }, 400);
    }

    const files: File[] = [];
    const imageErrors: string[] = [];
    for (const field of productImageFields) {
      const value = formData.get(field);
      if (!(value instanceof File) || value.size === 0) continue;
      const error = validateProductImage(value) ?? (await validateProductImageContent(value));
      if (error) imageErrors.push(`${field}: ${error}`);
      else files.push(value);
    }
    if (current.mediaCount + files.length > 5) {
      imageErrors.push('A product can have no more than 5 images.');
    }
    if (imageErrors.length > 0) return json({ error: imageErrors[0], errors: imageErrors }, 400);

    bucket = requireMediaBucket(bindings);
    const images: ProductImageUpload[] = [];
    for (const [index, file] of files.entries()) {
      const mediaId = crypto.randomUUID();
      const objectKey = `private/product-media/${seller.sellerId}/${id}/${mediaId}`;
      await bucket.put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { sellerId: seller.sellerId, productId: id },
      });
      uploadedKeys.push(objectKey);
      images.push({
        id: mediaId,
        objectKey,
        originalName: file.name.slice(0, 180),
        mimeType: file.type,
        sizeBytes: file.size,
        altEn: parsed.input.nameEn,
        altNe: parsed.input.nameNe,
        sortOrder: current.mediaCount + index,
      });
    }

    await reviseAndResubmitProduct(database, {
      productId: id,
      sellerId: seller.sellerId,
      actorId: seller.userId,
      input: parsed.input,
      images,
      previousInventory: current.inventoryQuantity,
      now: Date.now(),
    });
    return json({ id, status: 'submitted', message: 'Product revised and resubmitted.' }, 200);
  } catch (error) {
    if (bucket && uploadedKeys.length > 0) {
      const cleanupBucket = bucket;
      await Promise.allSettled(uploadedKeys.map((key) => cleanupBucket.delete(key)));
    }
    if (error instanceof SellerAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof ProductRevisionConflictError) return json({ error: error.message }, 409);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('UNIQUE constraint failed')) return json({ error: 'This SKU is already used by your shop.' }, 409);
    return json({ error: 'The product could not be resubmitted.' }, 500);
  }
}
