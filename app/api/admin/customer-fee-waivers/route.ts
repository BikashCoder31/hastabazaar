import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {readCommercialOutcome,CommercialOutcomeError} from '@/lib/admin/commercial-outcome';
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
  getAuthorizedCustomerFeeWaiverState,
  mutateCustomerFeeWaiver,
} from '@/lib/db/repositories/customer-fee-waivers';
import { presentFeeWaiverState } from '@/lib/marketplace/fee-waiver-presentation';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
function failure(error: unknown) {
  if(error instanceof CommercialOutcomeError)return json({error:error.message},error.status);
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
async function context(request:Request) {
  const actor = await requireStaffApi('commercial_policy.manage');
  if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this commercial view before using its retained fields.',403);
  if (actor.role !== 'super_admin') throw new FeeWaiverError('unauthorized');
  return {
    db: requireDatabase(env as unknown as { DB?: D1Database }),
    actorId: actor.id,
    authSubject: actor.authSubject,
  };
}
export async function GET(request: Request) {
  try {
    const { db, ...actor } = await context(request);
    const query=new URL(request.url).searchParams;
    if(query.has('attempt')){if(query.size!==1||query.getAll('attempt').length!==1)throw new FeeWaiverError('invalid');return json({outcome:await readCommercialOutcome(db,{id:actor.actorId,authSubject:actor.authSubject},'waiver',query.get('attempt')!)});}
    if (new URL(request.url).search) throw new FeeWaiverError('invalid');
    return json(
      {
        feeTarget: 'customer_service_fee',
        ...presentFeeWaiverState(
          await getAuthorizedCustomerFeeWaiverState(db, actor),
          Date.now(),
        ),
      },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const { db, ...actor } = await context(request);
    const body = await readBoundedJsonObject(request);
    if (
      Object.keys(body).some(
        (key) => !['feeTarget', 'command', 'expectedRevision', 'requestId','reason'].includes(key),
      ) ||
      body.feeTarget !== 'customer_service_fee' ||
      typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.trim().length>1000||
      !Number.isSafeInteger(body.expectedRevision) ||
      Number(body.expectedRevision) < 0 ||
      typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId)
    )
      throw new FeeWaiverError('invalid');
    const campaign = await mutateCustomerFeeWaiver(
      db,
      {
        ...actor,
        expectedRevision: Number(body.expectedRevision),
        requestId: body.requestId,
        now: Date.now(),
        reason:(body.reason as string).trim(),
      },
      body.command as FeeWaiverCommand,
    );
    return json({ campaign });
  } catch (error) {
    return failure(error);
  }
}
