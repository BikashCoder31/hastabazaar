import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  ProductReviewConflictError,
  reviewProduct,
  type ProductReviewAction,
} from '@/lib/db/repositories/products';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

const allowedActions: readonly ProductReviewAction[] = [
  'start_review',
  'request_changes',
  'approve',
  'publish',
  'unpublish',
  'reject',
];

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Cross-site requests are not allowed.' }, 403);
  let validatedVersionId: string | undefined;
  try {
    const { id } = await context.params;
    let body: { action?: unknown; reason?: unknown; requestId?: unknown;
      formVersion?: unknown; customAnswers?: unknown };
    try {
      body = await readBoundedJsonObject(request) as typeof body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SyntaxError();
    } catch (error) {
      if (error instanceof BodyTooLargeError) throw error;
      return json({ error: 'The review request is invalid.' }, 400);
    }
    if (typeof body.action !== 'string' || !allowedActions.includes(body.action as ProductReviewAction)) {
      return json({ error: 'Select a valid review action.' }, 400);
    }
    const permission = body.action === 'publish' ? 'product.publish' : 'product.review';
    const staff = await requireStaffApi(permission);
    if (body.action === 'unpublish' && staff.role !== 'super_admin') return json({ error: 'Only Super Admin can unpublish products.' }, 403);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (body.action !== 'start_review' && reason.length < 8) {
      return json({ error: 'Add a clear review note of at least 8 characters.' }, 400);
    }
    if (reason.length > 1000) return json({ error: 'The review note is too long.' }, 400);

    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))
      return json({ error: 'A stable review request reference is required.' }, 400);
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(database, 'staff.product-review',
      body.formVersion, body.customAnswers, requestId);
    validatedVersionId = form.versionId;
    const status = await reviewProduct(
      database,
      {
        productId: id,
        actorId: staff.id,
        action: body.action as ProductReviewAction,
        reason: reason || 'Product review started.',
        requestId,
        now: Date.now(),
        form: { versionId: form.versionId, answers: form.answers },
      },
    );
    return json({ status, message: 'Product updated.' }, 200);
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof StaffAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }), 'staff.product-review', validatedVersionId))
      return json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, 409);
    if (error instanceof ProductReviewConflictError) return json({ error: error.message }, 409);
    return json({ error: 'The product review action could not be completed.' }, 500);
  }
}
