import { validateProductVideo } from '@/lib/media/product-video';
import { ProductWatermarkError } from '@/lib/products/watermark';
import { productPhotoCountError } from '@/lib/products/submission';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireManagedMakerApi, ManagedMakerAuthorizationError } from '@/lib/auth/managed-maker';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import {
  areActiveOccasions,
  getSellerProductForRevision,
  isActiveCategory,
  listSellerOwnedMediaForMutation,
  ProductRevisionConflictError,
  reviseAndResubmitProduct,
} from '@/lib/db/repositories/products';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { configuredMultipartAnswers, digestMultipartRequest, FormRequestConflictError,
  formRequestReplay, validateSellerFormSubmission, validateSellerMultipartStructure } from '@/lib/forms/submission';
import { FormRuntimeError, resolvePublishedForm } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import {
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  if (
    Number(request.headers.get('content-length') ?? 0) >
    maximumProductSubmissionBytes
  ) {
    return json({ error: 'The product submission is too large.' }, 413);
  }

  let bucket: R2Bucket | null = null;
  const uploadedKeys: string[] = [];
  try {
    const makerWorkspace = new URL(request.url).searchParams.get('workspace') === 'maker';
    const seller = makerWorkspace ? await requireManagedMakerApi() : await requireSellerApi();
    const { id } = await context.params;
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const database = requireDatabase(bindings);
    const current = await getSellerProductForRevision(
      database,
      seller.sellerId,
      id,
    );
    if (!current) return json({ error: 'Product not found.' }, 404);
    const linked=await database.prepare('SELECT draft_id AS draftId FROM product_publication_links WHERE product_id=?').bind(id).first<{draftId:string}>();
    if(linked)return json({error:'Continue the retained private workspace to change this product.',workspaceHref:'/seller/products/new?draftId='+encodeURIComponent(linked.draftId)},409);
    const rateLimit = await consumeRequestRateLimit(database, request, {
      scope: `seller-product-revision:${seller.sellerId}`, limit: 20, windowMs: 60 * 60_000,
    });
    if (!rateLimit.allowed) return rateLimitJson(rateLimit);
    let formData: FormData;
    try {
      formData = await readBoundedForm(request, maximumProductSubmissionBytes);
    } catch (error) {
      if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
      return json({ error: 'The product form could not be read.' }, 400);
    }
    validateSellerMultipartStructure(formData, 'seller.product-submission');
    const rawRequestIds = formData.getAll('requestId');
    if (rawRequestIds.length !== 1 || typeof rawRequestIds[0] !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(rawRequestIds[0]))
      return json({ error: 'A valid product request reference is required.' }, 400);
    const requestId = rawRequestIds[0];
    const requestDigest = await digestMultipartRequest(formData);
    if (await formRequestReplay(database, { formId: 'seller.product-submission', requestId,
      actorId: seller.userId, action: 'product.resubmitted', digest: requestDigest, subjectId: id }))
      return json({ id, status: 'submitted', message: 'Product revised and resubmitted for approval.' }, 200);
    if (!['draft', 'needs_changes', 'rejected', 'approved', 'published'].includes(current.status)) {
      return json({ error: 'This product cannot be edited while it is in its current review state.' }, 409);
    }
    if(formData.get('reviewRequestId') !== (current.reviewRequestId ?? ''))return json({error:'This product review changed. Reload the form before resubmitting.'},409);
    const config = await resolvePublishedForm(database, 'seller.product-submission');
    const submitted = configuredMultipartAnswers(formData, config);
    // Removed seller fields retain their original persisted values on revision.
    formData.set('producer', current.producer);
    if (!formData.has('materials')) formData.set('materials', current.materials);
    if (!formData.has('warrantyOffered')) formData.set('warranty', current.warranty ?? '');
    formData.set('sku', ''); // New SKUs are generated; revisions retain the persisted SKU.
    const parsed = parseProductSubmission(formData);
    if (!parsed.input)
      return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
    const form = await validateSellerFormSubmission(database, 'seller.product-submission',
      submitted.version, submitted.customAnswers, undefined,
      { nameEn: parsed.input.nameEn, descriptionEn: parsed.input.descriptionEn });
    if (!(await isActiveCategory(database, parsed.input.categoryId))) {
      return json({ error: 'Select an active product category.' }, 400);
    }
    if (!(await areActiveOccasions(database, parsed.input.occasionIds))) {
      return json({ error: 'Select 1–5 active gift occasions.' }, 400);
    }

    const ownedMedia = await listSellerOwnedMediaForMutation(
      database,
      seller.sellerId,
      id,
    );
    const ownedById = new Map(ownedMedia.map((media) => [media.id, media]));
    const removedMediaIds = new Set(
      formData
        .getAll('removeMediaId')
        .filter((value): value is string => typeof value === 'string'),
    );
    const imageFiles = productImageFiles(formData);
    const replacementImages: File[] = [];
    for (const [field, value] of formData.entries()) {
      if (!field.startsWith('replaceImage:') || !(value instanceof File) || value.size === 0) continue;
      const mediaId = field.slice('replaceImage:'.length);
      const existing = ownedById.get(mediaId);
      if (!existing || !existing.mimeType.startsWith('image/')) {
        return json({ error: 'An image selected for replacement is no longer available.' }, 409);
      }
      removedMediaIds.add(mediaId);
      replacementImages.push(value);
    }
    const replacementVideo = formData.get('replacementVideo');
    if (replacementVideo instanceof File && replacementVideo.size > 0) {
      const existingVideo = ownedMedia.find((media) => media.mimeType === 'video/mp4');
      if (!existingVideo) return json({ error: 'The video selected for replacement is no longer available.' }, 409);
      removedMediaIds.add(existingVideo.id);
    }
    if ([...removedMediaIds].some((mediaId) => !ownedById.has(mediaId))) {
      return json({ error: 'One of the selected media items is no longer available.' }, 409);
    }

    const files: File[] = [];
    const imageErrors: string[] = [];
    for (const [index, value] of [...imageFiles, ...replacementImages].entries()) {
      const error =
        validateProductImage(value) ??
        (await validateProductImageContent(value));
      if (error) imageErrors.push(`Image ${index + 1}: ${error}`);
      else files.push(value);
    }
    const retainedImageCount = ownedMedia.filter(
      (media) => media.mimeType.startsWith('image/') && !removedMediaIds.has(media.id),
    ).length;
    const countError = productPhotoCountError(files.length, retainedImageCount);
    if (countError) imageErrors.push(countError);
    if (imageErrors.length > 0)
      return json({ error: imageErrors[0], errors: imageErrors }, 400);

    const video = replacementVideo instanceof File && replacementVideo.size > 0
      ? replacementVideo
      : formData.get('video');
    if (video instanceof File && video.size > 0) {
      const retainedVideoCount = ownedMedia.filter(
        (media) => media.mimeType === 'video/mp4' && !removedMediaIds.has(media.id),
      ).length;
      if (retainedVideoCount > 0) return json({ error: 'Remove or replace the existing video before uploading another.' }, 400);
      const videoError = await validateProductVideo(video);
      if (videoError) return json({ error: videoError }, 400);
      files.push(video);
    }

    bucket = requireMediaBucket(bindings);
    const images: ProductImageUpload[] = [];
    const nextImageSort = Math.max(
      -1,
      ...ownedMedia
        .filter((media) => media.mimeType.startsWith('image/') && !removedMediaIds.has(media.id))
        .map((media) => media.sortOrder),
    ) + 1;
    let imageOffset = 0;
    for (const file of files) {
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
        altNe: parsed.input.nameNe === undefined ? current.nameNe : parsed.input.nameNe,
        sortOrder: file.type === 'video/mp4' ? 1_000_000 : nextImageSort + imageOffset++,
      });
    }

    const outcome = await reviseAndResubmitProduct(database, {
      productId: id,
      sellerId: seller.sellerId,
      actorId: seller.userId,
      input: parsed.input,
      images,
      removedMediaIds: [...removedMediaIds],
      previousInventory: current.inventoryQuantity,
      expectedStatus: current.status,
      expectedReviewRequestId: current.reviewRequestId,
      workspaceMode: makerWorkspace ? 'maker' : 'seller',
      now: Date.now(),
      form: { requestId, versionId: form.versionId, answers: form.answers, digest: requestDigest },
    });
    if (outcome === 'replayed') {
      await Promise.allSettled(uploadedKeys.map((key) => bucket!.delete(key)));
      return json({ id, status: 'submitted', message: 'Product revised and resubmitted for approval.' }, 200);
    }
    const removedKeys = ownedMedia
      .filter((media) => removedMediaIds.has(media.id))
      .map((media) => media.objectKey);
    if (removedKeys.length > 0) {
      await Promise.allSettled(removedKeys.map((key) => bucket!.delete(key)));
    }
    return json(
      {
        id,
        status: 'submitted',
        message:
          current.status === 'published' || current.status === 'approved'
            ? 'Product updated and submitted for approval.'
            : 'Product revised and resubmitted for approval.',
      },
      200,
    );
  } catch (error) {
    if (bucket && uploadedKeys.length > 0) {
      const cleanupBucket = bucket;
      await Promise.allSettled(
        uploadedKeys.map((key) => cleanupBucket.delete(key)),
      );
    }
    if (error instanceof ProductWatermarkError) return json({ error: error.message }, error.status);
    if (error instanceof SellerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof ManagedMakerAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof ProductRevisionConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof FormRequestConflictError) return json({ error: error.message, code: 'request_id_conflict' }, 409);
    if (error instanceof FormRuntimeError) return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return json({ error: error.message, fieldId: error.fieldId }, 400);
    const message = error instanceof Error ? error.message : '';
    if (/UNIQUE constraint failed|Duplicate entry/i.test(message))
      return json({ error: 'A unique product reference could not be reserved. Please reload and try again.' }, 409);
    return json({ error: 'The product could not be resubmitted.' }, 500);
  }
}
