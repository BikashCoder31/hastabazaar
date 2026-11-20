import {env} from 'cloudflare:workers';
import {StaffAuthorizationError} from '@/lib/auth/staff';
import {requireExistingStaffIntentApi,requireStaffIntentApi} from '@/lib/auth/staff-intent';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {ProtectedChangeError} from './protected-change-policy';
import {SellerBankError} from './bank-details';
import {ProtectedAdminError,ProtectedAdminBeforeWriteError,readProtectedAdminOutcome,type ProtectedAdminAction} from './protected-admin-recovery';
type Reference={actorId:string;action:ProtectedAdminAction;sourceId:string;requestId:string};
type Context={params:Promise<{id:string}>};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function confirmActor(request:Request,actor:{id:string;authSubject:string}){
 const current=await requireExistingStaffIntentApi(request,'seller.application.review');
 if(current.id!==actor.id||current.authSubject!==actor.authSubject||current.role!=='super_admin')throw new StaffAuthorizationError('Current independent review access is required.',403);
}
export function protectedAdminGET(action:ProtectedAdminAction){return async(request:Request,context:Context)=>{
 let authenticated:{id:string;authSubject:string}|undefined;
 try{
  const actor=await requireExistingStaffIntentApi(request,'seller.application.review');
  authenticated=actor;
  if(actor.role!=='super_admin')return reply({error:'Super Admin review is required.'},403);
  const sourceId=(await context.params).id,requestId=new URL(request.url).searchParams.get('commandId');
  if(!sourceId||sourceId.length>191||!requestId||!/^[A-Za-z0-9_-]{1,160}$/.test(requestId))return reply({error:'Select the exact original action reference.'},400);
  const outcome=await readProtectedAdminOutcome(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:actor.id,actorAuthSubject:actor.authSubject,sourceId,requestId,action,now:Date.now()});
  await confirmActor(request,actor);
  return outcome?reply(outcome):reply({recorded:false,requestId,action,sourceId,code:'outcome_unconfirmed'},404);
 }catch(error){
  if(authenticated)try{await confirmActor(request,authenticated);}catch(access){return reply({error:'Current independent review access is required.'},access instanceof StaffAuthorizationError?access.status:503);}
  if(error instanceof StaffAuthorizationError||error instanceof ProtectedAdminError)return reply({error:error.message},error.status);return reply({code:'outcome_unconfirmed',error:'The original protected review outcome could not be checked.'},503);}
};}
export async function protectedAdminPOST(request:Request,context:Context,action:ProtectedAdminAction,perform:(db:D1Database,body:Record<string,unknown>,input:{actorId:string;actorAuthSubject:string;caseId:string;requestId:string;now:number})=>Promise<unknown>){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 let reference:Reference|undefined,authenticated:{id:string;authSubject:string}|undefined;
 try{
  const actor=await requireStaffIntentApi(request,'seller.application.review');if(actor.role!=='super_admin')return reply({error:'An eligible Super Admin must review protected evidence.'},403);
  authenticated=actor;
  const body=await readBoundedJsonObject(request),sourceId=(await context.params).id;
  if(!sourceId||sourceId.length>191||typeof body.commandId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(body.commandId))return reply({error:'Use an exact original action reference.'},400);
  reference={actorId:actor.id,action,sourceId,requestId:body.commandId};
  const db=requireDatabase(env as unknown as {DB?:D1Database});
  await perform(db,body,{actorId:actor.id,actorAuthSubject:actor.authSubject,caseId:sourceId,requestId:body.commandId,now:Date.now()});
  const outcome=await readProtectedAdminOutcome(db,{...reference,actorAuthSubject:actor.authSubject,now:Date.now()});
  await confirmActor(request,actor);
  return outcome?reply(outcome):reply({...reference,phase:'outcome_unconfirmed',error:'The original result is not yet proven. Keep its reference and check the saved outcome.'},503);
 }catch(error){
  if(authenticated)try{await confirmActor(request,authenticated);}catch(access){return reply({error:'Current independent review access is required.'},access instanceof StaffAuthorizationError?access.status:503);}
  const proof=reference?{...reference,phase:error instanceof ProtectedAdminBeforeWriteError?'before_write':'outcome_unconfirmed'}:{};
  if(error instanceof StaffAuthorizationError||error instanceof ProtectedAdminError||error instanceof ProtectedChangeError||error instanceof SellerBankError)return reply({...proof,error:error.message},error.status);
  if(error instanceof BodyTooLargeError)return reply({...proof,error:'Review content is too large.'},413);
  if(error instanceof SyntaxError)return reply({...proof,error:'Invalid review content.'},400);
  return reply({...proof,error:'The original protected decision could not be confirmed. Retain its reference and check the saved outcome.'},503);
 }
}
export function validateProtectedReview(valid:boolean){if(!valid)throw new ProtectedAdminBeforeWriteError('Inspect the exact current evidence and record its reason and confirmations.',400);}
