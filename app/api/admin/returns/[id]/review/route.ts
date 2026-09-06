import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  reviewReturnAsAdmin,
  ReturnConflictError,
  type AdminReturnReviewAction,
  type ReturnOutcome,
  type ReturnResponsibility,
} from '@/lib/db/repositories/returns';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const staff = await requireStaffApi('refund.approve.standard');
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as AdminReturnReviewAction;
    const outcome = body.outcome as ReturnOutcome | undefined;
    const responsibility = body.responsibility as
      | ReturnResponsibility
      | undefined;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const publicMessageEn =
      typeof body.publicMessageEn === 'string'
        ? body.publicMessageEn.trim()
        : '';
    const publicMessageNe =
      typeof body.publicMessageNe === 'string' && body.publicMessageNe.trim()
        ? body.publicMessageNe.trim()
        : publicMessageEn;
    const requestId =
      typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    const itemRefundPaisa = Number(body.itemRefundPaisa ?? 0);
    const deliveryRefundPaisa = Number(body.deliveryRefundPaisa ?? 0);
    if (!['request_changes', 'reject', 'approve'].includes(action))
      return json({ error: 'Select a valid review action.' }, 400);
    if (note.length < 8 || note.length > 2_000)
      return json(
        { error: 'Add an investigation note of 8–2,000 characters.' },
        400,
      );
    if (publicMessageEn.length < 8 || publicMessageEn.length > 1_000)
      return json(
        { error: 'Add a clear customer message of 8–1,000 characters.' },
        400,
      );
    if (requestId.length < 8 || requestId.length > 100)
      return json({ error: 'The request identifier is invalid.' }, 400);
    if (
      ![itemRefundPaisa, deliveryRefundPaisa].every(
        (value) => Number.isInteger(value) && value >= 0,
      )
    )
      return json(
        { error: 'Refund amounts must be non-negative integer paisa.' },
        400,
      );
    await reviewReturnAsAdmin(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        returnRequestId: id,
        actorId: staff.id,
        actorRole: staff.role,
        action,
        note,
        publicMessageEn,
        publicMessageNe,
        responsibility,
        outcome,
        itemRefundPaisa,
        deliveryRefundPaisa,
        requestId,
        now: Date.now(),
      },
    );
    return json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof ReturnConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    console.error('Admin return review failed', error);
    return json({ error: 'The return decision could not be saved.' }, 500);
  }
}
