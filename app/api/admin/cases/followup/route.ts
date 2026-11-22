import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {validateSellerFormSubmission} from '@/lib/forms/submission';
import {FormRuntimeError} from '@/lib/forms/runtime';
import {recordAftercareFollowup,AftercareConflict,type AftercareFollowup} from '@/lib/returns/followup';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function authorized(type:string){try{return await requireStaffApi('support.manage');}catch(error){if(type!=='return_request'||!(error instanceof StaffAuthorizationError)||error.status!==403)throw error;return requireStaffApi('order.manage');}}
export async function GET(request:Request){
 try{const query=new URL(request.url).searchParams,type=query.get('sourceType'),id=query.get('sourceId'),attempt=query.get('attempt'),actor=await authorized(type??''),db=requireDatabase(env as unknown as {DB?:D1Database});
  if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in staff account changed. Open this original care record again.',403);
  if(!['return_request','complaint'].includes(type??'')||!id||!attempt||attempt.length>191)return json({error:'Use the saved case and action reference.'},400);
  const row=await db.prepare("SELECT command_result_json AS result FROM audit_logs WHERE actor_id=? AND subject_type=? AND subject_id=? AND request_id=? AND action='aftercare.followup' AND command_key IS NOT NULL").bind(actor.id,type,id,attempt).first<{result:string}>();return json({outcome:row?JSON.parse(row.result):null});
 }catch(error){return json({error:error instanceof StaffAuthorizationError?error.message:'The saved outcome could not be checked.'},error instanceof StaffAuthorizationError?error.status:503);}
}
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return json({error:'Cross-site request rejected.'},403);
 try{const body=await readBoundedJsonObject(request),actor=await authorized(String(body.sourceType)),db=requireDatabase(env as unknown as {DB?:D1Database}),allowed=['sourceType','sourceId','ownerId','backupId','waitingFor','nextUpdateAt','nextAction','publicMessage','privateNote','newClarification','requestId','expectedRevision','formVersion','customAnswers'];
  if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in staff account changed. Open this original care record again.',403);
  if(Object.keys(body).some(key=>!allowed.includes(key))||!['return_request','complaint'].includes(String(body.sourceType))||typeof body.sourceId!=='string'||typeof body.ownerId!=='string'||body.backupId!==null&&typeof body.backupId!=='string'||typeof body.requestId!=='string'||typeof body.expectedRevision!=='string'||!Number.isSafeInteger(body.formVersion)||!Array.isArray(body.customAnswers))return json({error:'Use the current owned case follow-up form.'},400);
  const formId=body.sourceType==='return_request'?'staff.return-case-action':'staff.complaint-case-action',form=await validateSellerFormSubmission(db,formId,body.formVersion,body.customAnswers,body.requestId);
  const {requestId,expectedRevision,formVersion,customAnswers,...input}=body;void formVersion;void customAnswers;
  return json(await recordAftercareFollowup(db,{actorId:actor.id,requestId:requestId as string,expectedRevision:expectedRevision as string,now:Date.now()},input as unknown as AftercareFollowup,{versionId:form.versionId,answers:form.answers}));
 }catch(error){return json({error:error instanceof AftercareConflict||error instanceof FormRuntimeError||error instanceof StaffAuthorizationError?error.message:'The follow-up could not be confirmed. Check its saved outcome.',...(error instanceof FormRuntimeError?{code:error.code}:{})},error instanceof StaffAuthorizationError?error.status:error instanceof AftercareConflict?409:503);}
}
