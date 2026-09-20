import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  CustomerDataConflictError,
  moderateProductReview,
} from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const [staff, { id }] = await Promise.all([
      requireStaffApi('product.review'),
      params,
    ]);
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      note?: string;
      idempotencyKey?: string;
    } | null;
    if (
      !body?.idempotencyKey ||
      !['publish', 'reject', 'hide'].includes(body.action ?? '')
    )
      return Response.json(
        { error: 'Valid action and idempotency key are required.' },
        { status: 400 },
      );
    await moderateProductReview(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        reviewId: id,
        actorId: staff.id,
        action: body.action as 'publish' | 'reject' | 'hide',
        note: body.note ?? '',
        requestId: body.idempotencyKey,
        now: Date.now(),
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CustomerDataConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'The review could not be moderated.' },
      { status: 500 },
    );
  }
}
