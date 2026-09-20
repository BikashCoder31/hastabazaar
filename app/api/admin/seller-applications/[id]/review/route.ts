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

export const dynamic = 'force-dynamic';

const allowedActions: readonly SellerReviewAction[] = [
  'start_review',
  'request_changes',
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

  try {
    const staff = await requireStaffApi('seller.application.review');
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: unknown;
      reason?: unknown;
      payoutAccountReference?: unknown;
      settlementTermsReference?: unknown;
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
    const result = await reviewSellerApplication(database, {
      sellerId: id,
      actorId: staff.id,
      action: action as SellerReviewAction,
      reason: reason || 'Review started.',
      requestId:
        request.headers.get('cf-ray') ??
        request.headers.get('x-request-id') ??
        crypto.randomUUID(),
      now: Date.now(),
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
    if (error instanceof SellerReviewConflictError) {
      return json({ error: error.message }, 409);
    }
    return json({ error: 'The review action could not be completed.' }, 500);
  }
}
