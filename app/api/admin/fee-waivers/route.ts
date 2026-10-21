import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import {
  FeeWaiverError,
  type FeeWaiverCommand,
} from '@/lib/marketplace/fee-waivers';
import {
  getAuthorizedFeeWaiverState,
  mutateFeeWaiver,
} from '@/lib/db/repositories/fee-waivers';
import { presentFeeWaiverState } from '@/lib/marketplace/fee-waiver-presentation';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
function failure(error: unknown) {
  if (error instanceof StaffAuthorizationError)
    return json({ error: error.message }, 403);
  if (error instanceof FeeWaiverError)
    return json(
      { error: error.message, code: error.code },
      error.code === 'unauthorized'
        ? 403
        : error.code === 'invalid'
          ? 422
          : 409,
    );
  if (error instanceof SyntaxError || error instanceof BodyTooLargeError)
    return json(
      { error: 'Review the campaign request.', code: 'invalid' },
      422,
    );
  return json(
    {
      error:
        'Fee waiver controls are unavailable. Refresh before trying again.',
    },
    503,
  );
}
async function context() {
  const actor = await requireStaffApi('commercial_policy.manage');
  if (actor.role !== 'super_admin') throw new FeeWaiverError('unauthorized');
  return {
    db: requireDatabase(env as unknown as { DB?: D1Database }),
    actorId: actor.id,
    authSubject: actor.authSubject,
  };
}
export async function GET(request: Request) {
  try {
    const { db, ...actor } = await context();
    if (new URL(request.url).search) throw new FeeWaiverError('invalid');
    return json(
      presentFeeWaiverState(
        await getAuthorizedFeeWaiverState(db, actor),
        Date.now(),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const { db, ...actor } = await context();
    const body = await readBoundedJsonObject(request);
    if (
      Object.keys(body).some(
        (key) => !['command', 'expectedRevision', 'requestId'].includes(key),
      ) ||
      !Number.isSafeInteger(body.expectedRevision) ||
      Number(body.expectedRevision) < 0 ||
      typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId)
    )
      throw new FeeWaiverError('invalid');
    const campaign = await mutateFeeWaiver(
      db,
      {
        ...actor,
        expectedRevision: Number(body.expectedRevision),
        requestId: body.requestId,
        now: Date.now(),
      },
      body.command as FeeWaiverCommand,
    );
    return json({ campaign });
  } catch (error) {
    return failure(error);
  }
}
