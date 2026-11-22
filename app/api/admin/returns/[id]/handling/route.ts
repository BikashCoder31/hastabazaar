import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {validateSellerFormSubmission} from '@/lib/forms/submission';
import {FormRuntimeError} from '@/lib/forms/runtime';
import {recordReturnHandling,ReturnHandlingError,type HandlingInput} from '@/lib/returns/handling';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 try{
  const actor=await requireStaffApi('order.manage'),db=requireDatabase(env as unknown as {DB?:D1Database}),{id}=await context.params,attempt=new URL(request.url).searchParams.get('attempt');
  if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in staff account changed. Open this original care record again.',403);
  if(!attempt||attempt.length>191)return json({error:'Use the original request reference.'},400);
  const result=await db.prepare("SELECT command_result_json AS result FROM audit_logs WHERE actor_id=? AND request_id=? AND subject_type='return_request' AND subject_id=? AND action LIKE 'return.handling.%' AND command_key IS NOT NULL").bind(actor.id,attempt,id).first<{result:string}>();
  return json({outcome:result?JSON.parse(result.result):null});
 }catch(error){return json({error:error instanceof StaffAuthorizationError?error.message:'The saved outcome could not be checked.'},error instanceof StaffAuthorizationError?error.status:409);}
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 if(!isTrustedMutationRequest(request))return json({error:'Cross-site request rejected.'},403);
 try{
  const actor=await requireStaffApi('order.manage'),db=requireDatabase(env as unknown as {DB?:D1Database}),{id}=await context.params,body=await readBoundedJsonObject(request);
  if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in staff account changed. Open this original care record again.',403);
  const allowed=['action','requestId','expectedRevision','occurredAt','publicMessage','privateNote','evidenceReference','quantity','disposition','instructions','shipmentId','carrierReference','customerAgreementReference','promisedAt','availabilityAt','formVersion','customAnswers'];
  if(Object.keys(body).some(key=>!allowed.includes(key))||typeof body.requestId!=='string'||typeof body.expectedRevision!=='string'||!/^\d+$/.test(body.expectedRevision)||typeof body.action!=='string'||!Number.isSafeInteger(body.formVersion)||!Array.isArray(body.customAnswers))return json({error:'Use the current physical handling form and saved case version.'},400);
  if(body.instructions&&(typeof body.instructions!=='object'||Array.isArray(body.instructions)||Object.keys(body.instructions).some(key=>!['destination','method','packaging','safeHandlingConfirmed'].includes(key))))return json({error:'Invalid return instructions.'},400);
  const form=await validateSellerFormSubmission(db,'staff.return-case-action',body.formVersion as number,body.customAnswers,body.requestId);
  const {requestId,expectedRevision,formVersion,customAnswers,...payload}=body;void formVersion;void customAnswers;
  return json(await recordReturnHandling(db,{actorId:actor.id,requestId:requestId as string,expectedRevision:expectedRevision as string,now:Date.now()},{...payload,caseId:id} as unknown as HandlingInput,{versionId:form.versionId,answers:form.answers}));
 }catch(error){
  return json({error:error instanceof ReturnHandlingError||error instanceof FormRuntimeError||error instanceof StaffAuthorizationError?error.message:'Physical handling could not be recorded. Check the original outcome before retrying.',...(error instanceof FormRuntimeError?{code:error.code}:{})},error instanceof StaffAuthorizationError?error.status:error instanceof ReturnHandlingError||error instanceof FormRuntimeError&&error.code==='stale_version'?409:503);
 }
}
