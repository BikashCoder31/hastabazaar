import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  PayoutConflictError,
  processPayoutRequest,
} from '@/lib/db/repositories/payouts';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {readPayoutRequestFinanceScope} from '@/lib/admin/finance-work-items';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 try{
  const actor=await requireStaffApi('payout.prepare');if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this Finance view before using its retained fields.',403);
  const {id}=await context.params,attempt=new URL(request.url).searchParams.get('attempt');if(!attempt||attempt.length>191)return Response.json({error:'Use the original saved request reference.'},{status:400});
  const db=requireDatabase(env as unknown as {DB?:D1Database}),source=await readPayoutRequestFinanceScope(db,actor.id,id);if(!source)return Response.json({error:'The original request is unavailable.'},{status:404});
  const saved=await db.prepare("SELECT id FROM payout_requests WHERE id=? AND operation_request_id=? AND processed_by=? AND status IN('prepared','rejected')").bind(source.id,attempt,actor.id).first<{id:string}>();
  const current=await readPayoutRequestFinanceScope(db,actor.id,id);if(!current)return Response.json({error:'The original request is unavailable.'},{status:404});
  return Response.json({outcome:saved?{id:saved.id}:null,currentStatus:current.status},{headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
 }catch(error){return Response.json({error:error instanceof StaffAuthorizationError?error.message:'The original request outcome could not be checked.'},{status:error instanceof StaffAuthorizationError?error.status:503,headers:{'Cache-Control':'private, no-store'}});}
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('payout.prepare');
    if(hasActorIntentMismatch(request,staff.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this Finance view before using its retained fields.',403);
    const body = (await readBoundedJsonObject(request)) as {
      action?: 'prepare' | 'reject';
      note?: string;
      requestId?: string;
      formVersion?: unknown;
      customAnswers?: unknown;
    };
    if (!body.requestId || !['prepare', 'reject'].includes(body.action ?? ''))
      return Response.json(
        { error: 'Valid action and request identifier are required.' },
        { status: 400 },
      );
    const { id } = await context.params;
    const database=requireDatabase(env as unknown as {DB?:D1Database});
    const form=await validateSellerFormSubmission(database,'staff.payout-request-action',
      body.formVersion,body.customAnswers,body.requestId);
    validatedVersionId=form.versionId;
    await processPayoutRequest(
      database,
      {
        id,
        actorId: staff.id,
        actorRole: staff.role,
        action: body.action!,
        note: body.note ?? '',
        requestId: body.requestId,
        now: Date.now(),
        form:{requestId:body.requestId,versionId:form.versionId,answers:form.answers},
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return Response.json({ error: error.message }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as {DB?:D1Database}),
      'staff.payout-request-action',validatedVersionId))
      return Response.json({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},{status:409});
    if (error instanceof PayoutConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError)
      return Response.json({error:error.message,code:error.code},{status:error.code==='stale_version'?409:503});
    if (error instanceof FormValidationError)
      return Response.json({error:error.message,fieldId:error.fieldId},{status:400});
    return Response.json(
      { error: 'Payout request could not be processed.' },
      { status: 500 },
    );
  }
}
