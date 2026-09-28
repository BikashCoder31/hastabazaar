import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import {
  cancellationPreview,
  cancelSelectedParcels,
  CancellationConflictError,
  rejectCancellationReview,
} from '@/lib/cancellation/repository';
export async function POST(request: Request) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site request rejected.' }, 403);
  let db: D1Database | null = null;
  let validatedVersionId: string | undefined;
  try {
    const staff = await requireStaffApi('order.manage'),
      database = requireDatabase(env as unknown as { DB?: D1Database }),
      body = await readBoundedJsonObject(request) as unknown;
    db = database;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['reviewId','action','note','fingerprint',
        'formVersion','customAnswers'].includes(key)))
      return json({ error: 'Invalid cancellation review request.' }, 400);
    const input = body as Record<string, unknown>;
    if (typeof input.reviewId !== 'string' || !/^[a-zA-Z0-9:_-]{1,150}$/.test(input.reviewId))
      return json({ error: 'Select a review.' }, 400);
    if (!['preview','approve','reject'].includes(String(input.action)) ||
      !Number.isSafeInteger(input.formVersion) || !Array.isArray(input.customAnswers))
      return json({ error: 'Review the current decision form.' }, 400);
    const requestId = input.action === 'approve' ? `review:${input.reviewId}` :
      input.action === 'reject' ? `review-reject:${input.reviewId}` : undefined;
    const form = await validateSellerFormSubmission(database, 'staff.cancellation-review',
      input.formVersion, input.customAnswers, requestId);
    validatedVersionId = form.versionId;
    const row = await database
      .prepare(
        'SELECT r.seller_ids_json AS sellers,r.status,o.order_number AS number FROM order_cancellation_reviews r JOIN orders o ON o.id=r.order_id WHERE r.id=?',
      )
      .bind(input.reviewId)
      .first<{ sellers: string; number: string; status: string }>();
    if (!row)
      throw new CancellationConflictError('Review was not found.');
    if (input.action === 'reject') {
      if (typeof input.note !== 'string' ||
        input.fingerprint !== undefined && typeof input.fingerprint !== 'string')
        return json({ error: 'Add a decision reason.' }, 400);
      await rejectCancellationReview(database, {
        id: input.reviewId,
        actorId: staff.id,
        note: input.note,
        fingerprint: input.fingerprint as string | undefined,
        now: Date.now(),
        form: { formId: 'staff.cancellation-review', requestId: requestId!,
          versionId: form.versionId, answers: form.answers },
      });
      return json({ ok: true });
    }
    const access = { actorId: staff.id, orderNumber: row.number },
      sellerIds = JSON.parse(row.sellers) as string[];
    if (input.action === 'preview') {
      if (row.status !== 'pending' || input.fingerprint !== undefined ||
        input.note !== undefined && typeof input.note !== 'string')
        throw new CancellationConflictError('Review is no longer pending.');
      const p = await cancellationPreview(database, access, sellerIds);
      return json({
        fingerprint: p.fingerprint,
        total: p.next.total,
        walletRestored: p.walletRestored,
        delivery: p.next.delivery,
        deliveryPricingPolicy:p.deliveryPricingPolicy,
      });
    }
    if (
      input.action !== 'approve' ||
      typeof input.fingerprint !== 'string' ||
      typeof input.note !== 'string'
    )
      return json(
        { error: 'Review current amounts and add a decision reason.' },
        400,
      );
    return json(
      await cancelSelectedParcels(database, access, {
        sellerIds,
        fingerprint: input.fingerprint,
        requestId: requestId!,
        note: input.note,
        reviewId: input.reviewId,
        now: Date.now(),
        form: { formId: 'staff.cancellation-review', requestId: requestId!,
          versionId: form.versionId, answers: form.answers },
      }),
    );
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ error: 'Request too large.' }, 413);
    if (e instanceof SyntaxError) return json({ error: 'Invalid review request.' }, 400);
    if (e instanceof FormValidationError)
      return json({ error: e.message, fieldId: e.fieldId }, 400);
    if (e instanceof FormRuntimeError)
      return json({ error: e.message, code: e.code }, e.code === 'stale_version' ? 409 : 503);
    if (db && validatedVersionId && await isValidatedFormVersionStale(db,
      'staff.cancellation-review', validatedVersionId))
      return json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, 409);
    return json(
      {
        error:
          e instanceof CancellationConflictError ||
          e instanceof StaffAuthorizationError
            ? e.message
            : 'Review could not be saved.',
      },
      e instanceof StaffAuthorizationError ? e.status : 409,
    );
  }
}
