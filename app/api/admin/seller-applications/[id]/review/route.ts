import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';

import {
  requireStaffApi,
  StaffAuthorizationError,
} from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  reviewSellerApplication,
  SellerReviewConflictError,
  type SellerReviewAction,
} from '@/lib/db/repositories/seller-applications';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

const allowedActions: readonly SellerReviewAction[] = [
  'start_review',
  'request_changes',
  'approve_for_activation',
  'approve',
  'reject',
];

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }

  let validatedVersionId: string | undefined;
  try {
    const staff = await requireStaffApi('seller.application.review');
    const { id } = await context.params;
    const body = await readBoundedJsonObject(request) as {
      action?: unknown;
      reason?: unknown;
      payoutAccountReference?: unknown;
      settlementTermsReference?: unknown;
      requestId?: unknown;
      formVersion?: unknown;
      customAnswers?: unknown;
    };
    const action = body.action;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (
      typeof action !== 'string' ||
      !allowedActions.includes(action as SellerReviewAction)
    ) {
      return json({ error: 'Select a valid review action.' }, 400);
    }
    if (action !== 'start_review' && reason.length < 8) {
      return json(
        { error: 'Add a clear review note of at least 8 characters.' },
        400,
      );
    }
    if (reason.length > 1000) {
      return json({ error: 'The review note is too long.' }, 400);
    }

    const database = requireDatabase(
      env as unknown as { DB?: D1Database },
    );
    if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))
      return json({ error: 'A stable request reference is required.' }, 400);
    const form = await validateSellerFormSubmission(database, 'staff.seller-review-action',
      body.formVersion, body.customAnswers, body.requestId);
    validatedVersionId = form.versionId;
    const result = await reviewSellerApplication(database, {
      sellerId: id,
      actorId: staff.id,
      action: action as SellerReviewAction,
      reason: reason || 'Review started.',
      requestId: body.requestId,
      now: Date.now(),
      form: { versionId: form.versionId, answers: form.answers },
      payoutAccountReference:
        typeof body.payoutAccountReference === 'string'
          ? body.payoutAccountReference
          : undefined,
      settlementTermsReference:
        typeof body.settlementTermsReference === 'string'
          ? body.settlementTermsReference
          : undefined,
    });
    return json({ status: result.to, message: 'Application updated.' }, 200);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }), 'staff.seller-review-action', validatedVersionId))
      return json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, 409);
    if (error instanceof SellerReviewConflictError) {
      return json({ error: error.message }, 409);
    }
    return json({ error: 'The review action could not be completed.' }, 500);
  }
}
