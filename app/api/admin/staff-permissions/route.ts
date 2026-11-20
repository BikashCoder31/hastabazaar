import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import {requireStaffIntentApi,requireExistingStaffIntentApi} from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import {
  decideStaffPermissions,
  proposeStaffPermissions,
  StaffPermissionConflictError,
  StaffPermissionAccessError,
  readStaffPermissionOutcome,
  type StaffPermissionAction,
} from '@/lib/db/repositories/staff-permissions';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import {validateAdminPermissions} from '@/lib/marketplace/permissions';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request:Request){
 try{
  const actor=await requireExistingStaffIntentApi(request,'admin.permissions.manage');
  if(actor.role!=='super_admin')return json({error:'Only a Super Admin can read permission outcomes.'},403);
  const params=new URL(request.url).searchParams,action=params.get('action'),requestId=params.get('requestId');
  if((action!=='propose'&&action!=='approve'&&action!=='reject')||!requestId||!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))return json({error:'Select an exact original permission command reference.'},400);
  const result=await readStaffPermissionOutcome(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:actor.id,actorAuthSubject:actor.authSubject,action,requestId});
  const confirmed=await requireStaffIntentApi(request,'admin.permissions.manage',actor.id);
  if(confirmed.authSubject!==actor.authSubject)throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
  return result?json(result,200):json({recorded:false,action,requestId,status:'unconfirmed',code:'outcome_unconfirmed'},404);
 }catch(error){
  if(error instanceof StaffAuthorizationError)return json({error:error.message},error.status);
  if(error instanceof StaffPermissionAccessError)return json({error:error.message},403);
  return json({error:'The original permission outcome could not be checked.',code:'outcome_unconfirmed',phase:'outcome_unconfirmed'},503);
 }
}
export async function POST(request: Request) {
  let validated: { formId: 'staff.staff-permission-1' | 'staff.staff-permission-2'; versionId: string } | undefined;
  let writeStarted=false,reference:{actorId:string;action:StaffPermissionAction;requestId:string;sourceId:string}|undefined;
  const fail=(body:Record<string,unknown>,status:number)=>json({...body,...reference,phase:writeStarted?'outcome_unconfirmed':'rejected_before_write'},status);
  if (!isTrustedMutationRequest(request))
    return fail({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const actor = await requireStaffIntentApi(request,'admin.permissions.manage');
    if (actor.role !== 'super_admin') return fail({ error: 'Only a Super Admin can manage staff permissions.' }, 403);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBody(request, 256 * 1024)),
      );
      if (!body || Array.isArray(body) || typeof body !== 'object')
        throw new Error();
    } catch (error) {
      return fail(
        {
          error:
            error instanceof BodyTooLargeError
              ? error.message
              : 'Invalid request.',
        },
        error instanceof BodyTooLargeError ? 413 : 400,
      );
    }
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const reason = typeof body.reason === 'string' ? body.reason : '';
    if(reason.trim().length<8||reason.trim().length>1000)return fail({error:'Add a reason of 8–1000 characters.'},400);
    if (body.action === 'propose') {
      if (
        typeof body.userId !== 'string' || !body.userId || body.userId.length>191 ||body.userId===actor.id||
        typeof body.version !== 'number' || !Number.isSafeInteger(body.version)||body.version<0||
        typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId)||
        !Array.isArray(body.permissions) ||
        body.permissions.some((p) => typeof p !== 'string')
      )
        return fail({ error: 'Select an Admin and valid permissions.' }, 400);
      let permissions;
      try{permissions=validateAdminPermissions(body.permissions);}catch{return fail({error:'Select only valid work access.'},400);}
      if(body.presetName!==undefined&&(typeof body.presetName!=='string'||body.presetName.trim().length>80))return fail({error:'Preset names must be at most80 characters.'},400);
      reference={actorId:actor.id,action:'propose',requestId:body.requestId,sourceId:body.userId};
      const configured = await validateSellerFormSubmission(db, 'staff.staff-permission-1',
        body.formVersion, body.customAnswers, body.requestId);
      validated = { formId: 'staff.staff-permission-1', versionId: configured.versionId };
      writeStarted=true;
      const id = await proposeStaffPermissions(db, {
        actorId: actor.id,
        actorAuthSubject:actor.authSubject,
        userId: body.userId,
        permissions,
        version: body.version,
        reason,
        presetName:
          typeof body.presetName === 'string' ? body.presetName : undefined,
        now: Date.now(),
        requestId: body.requestId,
        form: { requestId: body.requestId, versionId: configured.versionId, answers: configured.answers },
      });
      const confirmed=await requireStaffIntentApi(request,'admin.permissions.manage',actor.id);
      if(confirmed.authSubject!==actor.authSubject)throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
      const outcome=await readStaffPermissionOutcome(db,{actorId:actor.id,actorAuthSubject:actor.authSubject,action:'propose',requestId:body.requestId});
      if(!outcome)return fail({recorded:false,error:'Check the original permission outcome before trying again.',code:'outcome_unconfirmed'},503);
      return json(
        {
          ...outcome,id,phase:'recorded',
          message: 'Permissions saved. Effective access applies on the next request.',
        },
        201,
      );
    }
    if (
      (body.action === 'approve' || body.action === 'reject') &&
      typeof body.requestId === 'string' && body.requestId.length>0&&body.requestId.length<=191&&typeof body.formRequestId === 'string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(body.formRequestId)
    ) {
      reference={actorId:actor.id,action:body.action,requestId:body.formRequestId,sourceId:body.requestId};
      const configured = await validateSellerFormSubmission(db, 'staff.staff-permission-2',
        body.formVersion, body.customAnswers, body.formRequestId);
      validated = { formId: 'staff.staff-permission-2', versionId: configured.versionId };
      writeStarted=true;
      await decideStaffPermissions(db, {
        actorId: actor.id,
        actorAuthSubject:actor.authSubject,
        requestId: body.requestId,
        decision: body.action,
        reason,
        now: Date.now(),
        formRequestId: body.formRequestId,
        form: { requestId: body.formRequestId, versionId: configured.versionId, answers: configured.answers },
      });
      const confirmed=await requireStaffIntentApi(request,'admin.permissions.manage',actor.id);
      if(confirmed.authSubject!==actor.authSubject)throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
      const outcome=await readStaffPermissionOutcome(db,{actorId:actor.id,actorAuthSubject:actor.authSubject,action:body.action,requestId:body.formRequestId});
      if(!outcome)return fail({recorded:false,error:'Check the original decision outcome before trying again.',code:'outcome_unconfirmed'},503);
      return json(
        {
          ...outcome,phase:'recorded',
          message:
            body.action === 'approve'
              ? 'Approved. Effective permissions apply on the next request.'
              : 'Request rejected; effective access is unchanged.',
        },
        200,
      );
    }
    return fail({ error: 'Select a valid action.' }, 400);
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return fail({ error: error.message }, error.status);
    if(error instanceof StaffPermissionAccessError)return fail({error:error.message},403);
    let stale=false;try{stale=Boolean(validated&&await isValidatedFormVersionStale(requireDatabase(env as unknown as {DB?:D1Database}),validated.formId,validated.versionId));}catch{/* Unavailable diagnostics do not prove rollback. */}
    if(stale)return fail({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},409);
    if (error instanceof FormRuntimeError)
      return fail({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return fail({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof StaffPermissionConflictError)
      return fail({ error: error.message }, 409);
    return fail(
      {
        error:'The original permission outcome could not be confirmed.',code:'outcome_unconfirmed',
      },
      503,
    );
  }
}
