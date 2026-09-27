import { sanitizeReviewPhoto, InvalidReviewPhotoError } from '@/lib/reviews/sanitize-photo';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';

import {
  CustomerAuthorizationError,
  requireCustomerApi,
} from '@/lib/auth/customer';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import {
  maximumReviewBytes,
  readReviewForm,
  validateReviewPhotos,
} from '@/lib/reviews/uploads';
import type { ReviewPhotoInput } from '@/lib/db/repositories/customers';
import {
  createProductReview,
  CustomerDataConflictError,
  productReviewRequestStatus,
  validateReviewFormSubmission,
} from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

async function digestReviewRequest(body: { orderItemId: string; rating: number; title: string; body: string }, files: readonly File[]): Promise<string> {
  const photos = await Promise.all(files.map(async (file) => {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }));
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({
    orderItemId: body.orderItemId, rating: body.rating, title: body.title.trim(), body: body.body.trim(), photos,
  })));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const uploaded: string[] = [];
  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
  async function cleanUnattached() {
    if (!uploaded.length) return;
    for (const key of uploaded) {
      try {
        if (
          !(await requireDatabase(bindings)
            .prepare('SELECT id FROM review_photos WHERE object_key=?')
            .bind(key)
            .first())
        )
          await requireMediaBucket(bindings).delete(key);
      } catch {
        /* Preserve referenced photos if database state cannot be checked. */
      }
    }
  }
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const [customer, { id }] = await Promise.all([
      requireCustomerApi(),
      params,
    ]);
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const rateLimit = await consumeRequestRateLimit(database, request, {
      scope: 'product-review',
      limit: 10,
      windowMs: 60 * 60_000,
    });
    if (!rateLimit.allowed) return rateLimitJson(rateLimit);
    if (Number(request.headers.get('content-length') ?? 0) > maximumReviewBytes)
      return Response.json(
        { error: 'Review photos are too large.' },
        { status: 413 },
      );
    const multipart = request.headers
      .get('content-type')
      ?.startsWith('multipart/form-data');
    let files: File[] = [];
    let raw: unknown;
    if (multipart) {
      const form = await readReviewForm(request);
      for (const key of ['orderItemId', 'rating', 'title', 'body', 'idempotencyKey', 'formVersion', 'customAnswers']) {
        if (form.getAll(key).length !== 1) return Response.json({ error: 'Review fields must appear exactly once.' }, { status: 400 });
      }
      files = form
        .getAll('photos')
        .filter((v): v is File => v instanceof File && v.size > 0);
      raw = Object.fromEntries(
        ['orderItemId', 'rating', 'title', 'body', 'idempotencyKey', 'formVersion'].map(
          (k) => [k, form.get(k)],
        ),
      );
      const customAnswers = form.get('customAnswers');
      if (typeof customAnswers !== 'string') return Response.json({ error: 'Invalid review answers.' }, { status: 400 });
      (raw as Record<string, unknown>).customAnswers = JSON.parse(customAnswers);
    } else {
      raw = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 64*1024))) as unknown;
    }
    const body = raw as {
      orderItemId?: string;
      rating?: number;
      title?: string;
      body?: string;
      idempotencyKey?: string;
      formVersion?: number | string;
      customAnswers?: unknown;
    } | null;
    if (
      typeof body?.orderItemId !== 'string' ||
      typeof body.idempotencyKey !== 'string' ||
      !body.orderItemId ||
      !body.idempotencyKey ||
      body.idempotencyKey.length > 100 ||
      body.orderItemId.length > 100 ||
      id.length > 100 ||
      (body.title != null && typeof body.title !== 'string') ||
      typeof body.body !== 'string'
      || !Array.isArray(body.customAnswers)
      || !Number.isSafeInteger(Number(body.formVersion))
      || Number(body.formVersion) < 1
    )
      return Response.json(
        { error: 'Verified order item and idempotency key are required.' },
        { status: 400 },
      );
    const photoError = await validateReviewPhotos(files);
    if (photoError)
      return Response.json({ error: photoError }, { status: 400 });
    const requestDigest = await digestReviewRequest({ orderItemId: body.orderItemId, rating: Number(body.rating), title: body.title ?? '', body: body.body }, files);
    const replay = await productReviewRequestStatus(database, { userId: customer.userId, productId: id,
      orderItemId: body.orderItemId, requestId: body.idempotencyKey, formVersion: Number(body.formVersion),
      customAnswers: body.customAnswers, requestDigest });
    if (replay.status === 'same') return Response.json({ id: replay.id }, { status: 201 });
    if (replay.status === 'conflict') throw new CustomerDataConflictError('This request ID was already used for different review values.');
    const form = await validateReviewFormSubmission(database, Number(body.formVersion), body.customAnswers);
    const eligible = await database
      .prepare(
        `SELECT i.id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=? AND i.product_id=? AND o.customer_id=? AND o.status='delivered' AND i.fulfillment_status='delivered'`,
      )
      .bind(body.orderItemId, id, customer.userId)
      .first();
    if (!eligible)
      return Response.json(
        { error: 'Only your delivered purchases can be reviewed.' },
        { status: 409 },
      );
    const photos: ReviewPhotoInput[] = [];
    for (const [index, original] of files.entries()) {
      const file = await sanitizeReviewPhoto(original);
      const photoId = crypto.randomUUID();
      const objectKey = `private/review-photos/${customer.userId}/${photoId}`;
      await requireMediaBucket(bindings).put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type },
      });
      uploaded.push(objectKey);
      photos.push({
        id: photoId,
        objectKey,
        mimeType: file.type,
        sizeBytes: file.size,
        sortOrder: index,
      });
    }
    const reviewId = await createProductReview(database, {
      userId: customer.userId,
      productId: id,
      orderItemId: body.orderItemId,
      rating: Number(body.rating),
      title: body.title ?? '',
      body: body.body ?? '',
      requestId: body.idempotencyKey,
      now: Date.now(),
      photos,
      form,
      requestDigest,
    });
    await cleanUnattached();
    return Response.json({ id: reviewId }, { status: 201 });
  } catch (error) {
    await cleanUnattached();
    if (error instanceof BodyTooLargeError) return Response.json({error:error.message},{status:413});
    if (error instanceof InvalidReviewPhotoError || error instanceof SyntaxError) return Response.json({error:error instanceof InvalidReviewPhotoError?error.message:'Invalid review request.'},{status:400});
    if (error instanceof CustomerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CustomerDataConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError) return Response.json({ error: error.code === 'stale_version' ? error.message : 'Form configuration is unavailable.', code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError) return Response.json({ error: error.message, ...(error.fieldId ? { fieldId: error.fieldId } : {}) }, { status: 400 });
    return Response.json(
      { error: 'The review could not be submitted.' },
      { status: 500 },
    );
  }
}
