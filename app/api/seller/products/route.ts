import { validateProductVideo } from '@/lib/media/product-video';
import { productPhotoCountError } from '@/lib/products/submission';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import {
  areActiveOccasions,
  createProductSubmission,
  isActiveCategory,
} from '@/lib/db/repositories/products';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import {
  createProductSlug,
  maximumProductSubmissionBytes,
  parseProductSubmission,
  productImageFiles,
  validateProductImage,
  validateProductImageContent,
  type ProductImageUpload,
} from '@/lib/products/submission';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > maximumProductSubmissionBytes) {
    return json({ error: 'The product submission is too large.' }, 413);
  }

  const uploadedKeys: string[] = [];
  let bucket: R2Bucket | null = null;
  try {
    const seller = await requireSellerApi();
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const database = requireDatabase(bindings);
    const rateLimit = await consumeRequestRateLimit(database, request, {
      scope: `seller-product-submission:${seller.sellerId}`,
      limit: 20,
      windowMs: 60 * 60_000,
    });
    if (!rateLimit.allowed) return rateLimitJson(rateLimit);
    let formData: FormData;
    try {
      formData = await readBoundedForm(request, maximumProductSubmissionBytes);
    } catch (error) {
      if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
      return json({ error: 'The product form could not be read.' }, 400);
    }

    formData.set('sku', ''); // New SKUs are generated; revisions retain the persisted SKU.
    const parsed = parseProductSubmission(formData);
    if (!parsed.input) {
      return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
    }

    const files: File[] = [];
    const imageErrors: string[] = [];
    for (const [index, value] of productImageFiles(formData).entries()) {
      const error =
        validateProductImage(value) ??
        (await validateProductImageContent(value));
      if (error) imageErrors.push(`Image ${index + 1}: ${error}`);
      else files.push(value);
    }
    const countError = productPhotoCountError(files.length);
    if (countError) imageErrors.push(countError);
    if (imageErrors.length > 0) {
      return json({ error: imageErrors[0], errors: imageErrors }, 400);
    }

    if (!(await isActiveCategory(database, parsed.input.categoryId))) {
      return json({ error: 'Select an active product category.' }, 400);
    }
    if (!(await areActiveOccasions(database, parsed.input.occasionIds))) {
      return json({ error: 'Select 1–5 active gift occasions.' }, 400);
    }

    const video = formData.get('video');
    if (video instanceof File && video.size > 0) {

      const videoError = await validateProductVideo(video);
      if (videoError) return json({ error: videoError }, 400);
      files.push(video);
    }

    bucket = requireMediaBucket(bindings);
    const productId = crypto.randomUUID();
    const images: ProductImageUpload[] = [];
    for (const [index, file] of files.entries()) {
      const mediaId = crypto.randomUUID();
      const objectKey = `private/product-media/${seller.sellerId}/${productId}/${mediaId}`;
      await bucket.put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { sellerId: seller.sellerId, productId },
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
        sortOrder: file.type === 'video/mp4' ? 1_000_000 : index,
      });
    }

    const slug = createProductSlug(parsed.input.nameEn);
    await createProductSubmission(database, {
      productId,
      sellerId: seller.sellerId,
      actorId: seller.userId,
      slug,
      input: parsed.input,
      images,
      now: Date.now(),
    });
    return json(
      {
        id: productId,
        slug,
        status: 'submitted',
        message: 'Product submitted for review.',
      },
      201,
    );
  } catch (error) {
    if (bucket && uploadedKeys.length > 0) {
      const cleanupBucket = bucket;
      await Promise.allSettled(
        uploadedKeys.map((key) => cleanupBucket.delete(key)),
      );
    }
    if (error instanceof SellerAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    const message = error instanceof Error ? error.message : '';
    if (/UNIQUE constraint failed|Duplicate entry/i.test(message)) {
      return json({ error: 'A unique product reference could not be reserved. Please reload and try again.' }, 409);
    }
    return json({ error: 'The product could not be submitted.' }, 500);
  }
}
