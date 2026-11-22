import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { PayoutConflictError } from '@/lib/db/repositories/payouts';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { approveRunPayout } from '../run-data';

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const intendedActorId = request.headers.get(ACTOR_INTENT_HEADER);
    if (!intendedActorId) return reply({ error: 'Refresh the current staff workspace.' }, 403);
    const staff = await requireStaffApi('payout.approve', { intendedActorId });
    const { payoutId, review, runId, note, formVersion, customAnswers } = await readBoundedJsonObject(request);
    if (typeof payoutId !== 'string' || !payoutId || payoutId.length > 191 ||
      typeof review !== 'string' || !/^[0-9a-f]{64}$/.test(review) ||
      typeof runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId) ||
      typeof note !== 'string' || note.trim().length < 8 || note.trim().length > 1000)
      return reply({ error: 'Select a current payout and add an operational note of 8–1,000 characters.' }, 400);
    await approveRunPayout(requireDatabase(env as unknown as { DB?: D1Database }), staff,
      { payoutId, review, runId, note, formVersion, customAnswers });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return reply({ error: error.message }, 413);
    if (error instanceof SyntaxError) return reply({ error: 'Valid payout input is required.' }, 400);
    if (error instanceof PayoutConflictError) return reply({ error: error.message }, 409);
    if (error instanceof FormRuntimeError) return reply({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return reply({ error: error.message, fieldId: error.fieldId }, 400);
    return reply({ error: 'The payout could not be updated. Review its history before retrying.' }, 500);
  }
}
