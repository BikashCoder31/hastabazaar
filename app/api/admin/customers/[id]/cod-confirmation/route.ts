import { env } from 'cloudflare:workers';
import { CustomerCodConfirmationError, setCustomerCodConfirmation } from '@/lib/admin/customers-cod-confirmation';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Request origin was not accepted.' }, 403);
  const intendedActorId = request.headers.get(ACTOR_INTENT_HEADER);
  if (!intendedActorId) return reply({ error: 'Refresh the current staff workspace.' }, 403);
  try {
    const staff = await requireStaffApi('audit_log.view', { intendedActorId });
    if (staff.role !== 'super_admin') return reply({ error: 'Super Admin access is required.' }, 403);
    const { id } = await params;
    if (!/^[a-zA-Z0-9_:-]{1,160}$/.test(id)) return reply({ error: 'Invalid customer.' }, 400);
    const input: unknown = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 4096)));
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return reply({ error: 'Invalid request.' }, 400);
    const { enabled, reason, requestId } = input as Record<string, unknown>;
    if (typeof enabled !== 'boolean' || typeof reason !== 'string' || typeof requestId !== 'string' ||
        Object.keys(input).some(key => !['enabled', 'reason', 'requestId'].includes(key)))
      return reply({ error: 'Choose a setting and give a reason.' }, 400);
    await setCustomerCodConfirmation(requireDatabase(env as unknown as { DB?: D1Database }), {
      actorId: staff.id, actorSubject: staff.authSubject, customerId: id, enabled, reason, requestId, now: Date.now(),
    });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError || error instanceof CustomerCodConfirmationError)
      return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return reply({ error: 'Request too large.' }, 413);
    if (error instanceof SyntaxError) return reply({ error: 'Invalid request.' }, 400);
    return reply({ error: 'The change could not be confirmed. Retry the same request.' }, 503);
  }
}
