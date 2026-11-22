import {hasActorIntentMismatch} from '../http/actor-intent';
import {readBoundedJsonObject} from '../http/form-json-body';
import {isTrustedMutationRequest} from '../http/request-security';
import {OrderResponseError,PreparationBeforeWriteError,recordPreparationFollowup,reportPreparationIssue} from './response-cases';
import {preparationCommandOutcome} from './response-outcome';

export async function handlePreparationCommand(request:Request,db:D1Database,actorId:string,audience:'seller'|'staff',identity:{actorAuthSubject?:string|null}={}){
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
 if(hasActorIntentMismatch(request,actorId))return json({error:'The signed-in account changed. Open this original preparation record again.'},403);
 const actor=await db.prepare("SELECT id,auth_subject AS authSubject FROM users WHERE id=? AND status='active'").bind(actorId).first<{id:string;authSubject:string|null}>();
 if(!actor||actor.id!==actorId||identity.actorAuthSubject!==undefined&&actor.authSubject!==identity.actorAuthSubject)return json({error:'Current preparation identity changed. Reopen the original workspace.'},403);
 if(request.method==='GET'){
  try{
   const params=new URL(request.url).searchParams,orderId=params.get('orderId'),sourceId=params.get('sourceId'),action=params.get('action'),attempt=params.get('attempt');
   if([...params.keys()].some(key=>!['orderId','sourceId','action','attempt'].includes(key))||!orderId||!sourceId||!attempt||![orderId,sourceId].every(id=>/^[a-zA-Z0-9:_-]{1,191}$/.test(id))||!/^[a-zA-Z0-9:_-]{1,150}$/.test(attempt)||action!=='report'&&action!=='followup')return json({error:'Keep the original bounded action reference and source.'},400);
   const outcome=await preparationCommandOutcome(db,actorId,audience,{orderId,sourceId,action,attempt,actorAuthSubject:actor.authSubject});
   return json({recorded:outcome!==null,actorId,action,sourceId,requestId:attempt,outcome});
  }catch(error){if(error instanceof OrderResponseError)return json({error:error.message},error.status);throw error;}
 }
 if(!isTrustedMutationRequest(request))return json({error:'Request origin was not accepted.'},403);
 let reference:{actorId:string;action:'report'|'followup';sourceId:string;requestId:string}|undefined;
 try{
  const body=await readBoundedJsonObject(request);
  if(Object.keys(body).some(k=>!['action','requestId','expectedRevision','input'].includes(k))||typeof body.requestId!=='string'||!/^[a-zA-Z0-9:_-]{1,150}$/.test(body.requestId)||body.expectedRevision!==null&&typeof body.expectedRevision!=='string'||!body.input||typeof body.input!=='object'||Array.isArray(body.input))throw new OrderResponseError('Keep the exact request reference and current saved case revision.',400);
  const input=body.input as Record<string,unknown>,context={actorId,actorAuthSubject:actor.authSubject,requestId:body.requestId,expectedRevision:body.expectedRevision as string|null,now:Date.now()};
  const sourceId=body.action==='report'?input.portionId:body.action==='followup'?input.caseId:null;
  if((body.action==='report'||body.action==='followup')&&typeof sourceId==='string')reference={actorId,action:body.action,sourceId,requestId:body.requestId};
  if(body.action==='report'){
   if(Object.keys(input).some(k=>!['portionId','itemIds','kind','detail','proposedReadyAt'].includes(k))||typeof input.portionId!=='string'||!Array.isArray(input.itemIds)||input.itemIds.some(i=>typeof i!=='string')||!['delay','cannot_fulfill'].includes(String(input.kind))||typeof input.detail!=='string'||input.proposedReadyAt!==null&&typeof input.proposedReadyAt!=='number')throw new PreparationBeforeWriteError('Choose the exact items and describe the actual issue.',400);
   return json({ok:true,recorded:true,actorId,action:'report',sourceId:input.portionId,requestId:context.requestId,result:await reportPreparationIssue(db,context,input as Parameters<typeof reportPreparationIssue>[2],audience)});
  }
  if(body.action==='followup'&&audience==='staff'){
   if(Object.keys(input).some(k=>!['caseId','ownerId','backupId','state','nextUpdateAt','privateNote','customerMessage'].includes(k))||typeof input.caseId!=='string'||typeof input.ownerId!=='string'||input.backupId!==null&&typeof input.backupId!=='string'||typeof input.privateNote!=='string'||typeof input.customerMessage!=='string'||input.nextUpdateAt!==null&&typeof input.nextUpdateAt!=='number'||!['open','waiting','resolved'].includes(String(input.state)))throw new PreparationBeforeWriteError('Complete the current owner, next action and separate customer message.',400);
   return json({ok:true,recorded:true,actorId,action:'followup',sourceId:input.caseId,requestId:context.requestId,result:await recordPreparationFollowup(db,context,input as Parameters<typeof recordPreparationFollowup>[2])});
  }
  return json({error:'This action is not available in your workspace.'},403);
 }catch(error){
  if(error instanceof OrderResponseError)return json({...(reference?{...reference,phase:error instanceof PreparationBeforeWriteError?'before_write':'outcome_unconfirmed'}:{}),error:error.message},error.status);
  if(error instanceof SyntaxError)return json({error:'Invalid request.'},400);
  if(/Request reference was already used/.test(String(error)))return json({error:'Keep the original request unchanged, or start a new action after refreshing.'},409);
  throw error;
 }
}
