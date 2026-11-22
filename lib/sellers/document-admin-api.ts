import {env} from 'cloudflare:workers';
import {StaffAuthorizationError} from '@/lib/auth/staff';
import {requireExistingStaffIntentApi,requireStaffIntentApi} from '@/lib/auth/staff-intent';
import {requireDatabase} from '@/lib/db/d1';
import {readDocumentAdminOutcome,SellerDocumentReviewError,DocumentDecisionBeforeWriteError} from './document-review';

export type DocumentAdminReference={actorId:string;action:'review'|'permission';sourceId:string;requestId:string};
export function documentAdminErrorReference(error:unknown,reference:DocumentAdminReference|undefined){
 return reference?{...reference,phase:error instanceof DocumentDecisionBeforeWriteError?'before_write':'outcome_unconfirmed'}:{};
}

export function documentAdminReply(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}
export async function confirmDocumentAdminActor(request:Request,actor:{id:string;authSubject:string}){
 const current=await requireStaffIntentApi(request,'seller.application.review',actor.id);
 if(current.authSubject!==actor.authSubject)throw new StaffAuthorizationError('Refresh the current document workspace.',403);
}
export async function documentAdminOutcomeGET(request:Request,context:{params:Promise<{id:string}>},action:'review'|'permission'){
 try{
  const actor=await requireExistingStaffIntentApi(request,'seller.application.review');
  if(actor.role!=='super_admin')return documentAdminReply({error:'Super Admin review is required.'},403);
  const sourceId=(await context.params).id,commandId=new URL(request.url).searchParams.get('commandId');
  if(!sourceId||sourceId.length>191||!commandId||!commandId.trim()||commandId.length>191)return documentAdminReply({error:'Select an exact original document command reference.'},400);
  const outcome=await readDocumentAdminOutcome(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:actor.id,actorAuthSubject:actor.authSubject,commandId,action,sourceId,now:Date.now()});
  await confirmDocumentAdminActor(request,actor);
  return outcome?documentAdminReply(outcome):documentAdminReply({recorded:false,requestId:commandId,action,sourceId,code:'outcome_unconfirmed'},404);
 }catch(error){
  if(error instanceof StaffAuthorizationError||error instanceof SellerDocumentReviewError)return documentAdminReply({error:error.message},error.status);
  return documentAdminReply({error:'The original document decision could not be checked.',code:'outcome_unconfirmed'},503);
 }
}
