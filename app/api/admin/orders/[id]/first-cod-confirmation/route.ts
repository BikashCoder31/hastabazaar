import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  confirmFirstCodReview,
  FirstCodReviewConflictError,
} from '@/lib/orders/first-cod-review';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
export const dynamic = 'force-dynamic';
function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const intendedActorId = request.headers.get(ACTOR_INTENT_HEADER);
    const staff = await requireStaffApi('order.manage', intendedActorId ? { intendedActorId } : undefined);
    const { id } = await context.params;
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await readBoundedBody(request, 8192),
      ),
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return json({ error: 'Invalid confirmation request.' }, 400);
    const body = parsed as Record<string, unknown>;
    if (
      Object.keys(body).some((key) => !['reason', 'requestId'].includes(key)) ||
      typeof body.reason !== 'string' ||
      body.reason.trim().length < 8 ||
      body.reason.trim().length > 500 ||
      typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9:_-]{1,100}$/.test(body.requestId)
    )
      return json(
        {
          error:
            'Add a confirmation reason of 8–500 characters and a valid request reference.',
        },
        400,
      );
    await confirmFirstCodReview(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        orderId: id,
        actorId: staff.id,
        reason: body.reason,
        requestId: body.requestId,
        now: Date.now(),
      },
    );
    return json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Request too large.' }, 413);
    if (error instanceof FirstCodReviewConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid confirmation request.' }, 400);
    console.error('First-time COD confirmation failed', error);
    return json(
      { error: 'Confirmation is temporarily unavailable. Refresh and retry.' },
      503,
    );
  }
}
