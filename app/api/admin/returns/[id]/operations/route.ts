import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { advanceReturnAsAdmin, ReturnConflictError, type ReturnOperationsAction } from '@/lib/db/repositories/returns';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const actions: readonly ReturnOperationsAction[] = ['mark_in_transit', 'mark_received', 'resolve_replacement', 'resolve_return_to_origin', 'start_refund', 'complete_refund', 'fail_refund'];

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const staff = await requireStaffApi('refund.approve.standard');
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as ReturnOperationsAction;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const publicMessageEn = typeof body.publicMessageEn === 'string' ? body.publicMessageEn.trim() : '';
    const publicMessageNe = typeof body.publicMessageNe === 'string' ? body.publicMessageNe.trim() : '';
    const reference = typeof body.reference === 'string' ? body.reference.trim() : undefined;
    const restockQuantity = Number(body.restockQuantity ?? 0);
    const requestId = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    if (!actions.includes(action)) return json({ error: 'Select a valid return operation.' }, 400);
    if (note.length < 8 || note.length > 2_000) return json({ error: 'Add an operations note of 8–2,000 characters.' }, 400);
    if (publicMessageEn.length < 8 || publicMessageNe.length < 4) return json({ error: 'Add English and Nepali customer messages.' }, 400);
    if (!Number.isInteger(restockQuantity) || restockQuantity < 0) return json({ error: 'Restock quantity must be a non-negative whole number.' }, 400);
    if (requestId.length < 8 || requestId.length > 100) return json({ error: 'The request identifier is invalid.' }, 400);
    await advanceReturnAsAdmin(requireDatabase(env as unknown as { DB?: D1Database }), { returnRequestId: id, actorId: staff.id, actorRole: staff.role, action, note, publicMessageEn, publicMessageNe, reference, restockQuantity, requestId, now: Date.now() });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof ReturnConflictError) return json({ error: error.message }, 409);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400);
    console.error('Return operation failed', error);
    return json({ error: 'The return operation could not be saved.' }, 500);
  }
}
