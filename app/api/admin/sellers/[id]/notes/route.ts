import { env } from 'cloudflare:workers';
import { applySellerNoteChange, parseSellerNoteChange, SellerNotesError } from '@/lib/admin/seller-notes';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Request origin was not accepted.' }, 403);
  const intendedActorId = request.headers.get(ACTOR_INTENT_HEADER);
  if (!intendedActorId) return reply({ error: 'Refresh the current staff workspace.' }, 403);

  try {
    const staff = await requireStaffApi('seller.application.review', { intendedActorId });
    const { id } = await params;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return reply({ error: 'Invalid seller.' }, 400);
    const input = await readBoundedJsonObject(request);
    if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))
      return reply({ error: 'A request reference is required.' }, 400);

    const change = parseSellerNoteChange(input);
    await applySellerNoteChange(requireDatabase(env as unknown as { DB?: D1Database }), {
      actorId: staff.id, actorSubject: staff.authSubject, sellerId: id, requestId: input.requestId, now: Date.now(), change,
    });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError || error instanceof SellerNotesError)
      return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return reply({ error: error.message }, 413);
    if (error instanceof SyntaxError) return reply({ error: 'Invalid request.' }, 400);
    return reply({ error: 'The change could not be confirmed. Retry the same request.' }, 503);
  }
}
