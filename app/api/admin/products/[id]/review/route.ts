import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  ProductReviewConflictError,
  reviewProduct,
  type ProductReviewAction,
} from '@/lib/db/repositories/products';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

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
  try {
    const { id } = await context.params;
    let body: { action?: unknown; reason?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
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

    const requestId =
      request.headers.get('cf-ray') ??
      request.headers.get('x-request-id') ??
      crypto.randomUUID();
    const status = await reviewProduct(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        productId: id,
        actorId: staff.id,
        action: body.action as ProductReviewAction,
        reason: reason || 'Product review started.',
        requestId,
        now: Date.now(),
      },
    );
    return json({ status, message: 'Product updated.' }, 200);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof ProductReviewConflictError) return json({ error: error.message }, 409);
    return json({ error: 'The product review action could not be completed.' }, 500);
  }
}
