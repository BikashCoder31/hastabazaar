import {env} from 'cloudflare:workers';
import {StaffAuthorizationError} from '@/lib/auth/staff';
import {requireStaffIntentApi,requireExistingStaffIntentApi} from '@/lib/auth/staff-intent';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {readBoundedBody,BodyTooLargeError} from '@/lib/http/bounded-body';
import {validateSellerFormSubmission} from '@/lib/forms/submission';
import {FormRuntimeError} from '@/lib/forms/runtime';
import {FormValidationError} from '@/lib/forms/validation';
import {executeTeamGovernance,readTeamSavedOutcome,TeamGovernanceConflict,TeamGovernanceAccessConflict,teamFailureBeforeWrite,type TeamCommand} from '@/lib/operations/team-governance';
export const dynamic='force-dynamic';
const actions=new Set(['save_duty','availability','propose_handoff','accept_handoff','cancel_handoff','publish_procedure','assign_native_procedure','acknowledge_procedure','complete_access_review','complete_checkpoint','review_invitation_grant','offboard_staff','schedule_policy_review','complete_policy_review']);
function json(body:unknown,status=200){return Response.json(body,{status,headers:{'cache-control':'no-store'}});}
function failure(error:unknown,invoked=false){
 const phase=!invoked||teamFailureBeforeWrite(error)?'rejected_before_write':'outcome_unconfirmed';
 if(error instanceof StaffAuthorizationError||error instanceof TeamGovernanceAccessConflict)return json({error:error.message,phase,code:phase==='rejected_before_write'?'access_denied_before_write':'access_changed'},error instanceof StaffAuthorizationError?error.status:403);
 if(error instanceof TeamGovernanceConflict)return json({error:error.message,phase},409);
 if(error instanceof FormRuntimeError)return json({error:error.message,code:error.code,phase},error.code==='stale_version'?409:503);
 if(error instanceof FormValidationError)return json({error:error.message,phase},400);
 if(error instanceof BodyTooLargeError)return json({error:error.message,phase},413);
 return json({error:'The Team change could not be confirmed. Check the saved outcome before retrying the same request.',phase},503);
}
export async function GET(request:Request){try{
 const actor=await requireExistingStaffIntentApi(request,'account.self.manage');
 if(hasActorIntentMismatch(request,actor.id))return json({error:'The signed-in account changed. Reopen Team with the current account.',code:'actor_intent_mismatch'},403);
 const query=new URL(request.url).searchParams,requestId=query.get('requestId'),action=query.get('action'),sourceId=query.get('sourceId');
 if(!requestId||!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))return json({error:'A valid saved request reference is required.'},400);
 if((action!==null||sourceId!==null)&&(!action||!actions.has(action)||!sourceId||sourceId.length>191))return json({error:'Identify the original Team action and source.'},400);
 const result=await readTeamSavedOutcome(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,requestId,{authSubject:actor.authSubject,...(action&&sourceId?{action,sourceId}:{})});
 return result?json({saved:true,result,...(action&&sourceId?{reference:{actorId:actor.id,requestId,action,sourceId}}:{})}):json({saved:false},404);
 }catch(error){return failure(error);}}
export async function POST(request:Request){let invoked=false;if(!isTrustedMutationRequest(request))return json({error:'Cross-site requests are not allowed.',phase:'rejected_before_write'},403);try{
 const actor=await requireStaffIntentApi(request,'account.self.manage'),db=requireDatabase(env as unknown as {DB?:D1Database});
 if(hasActorIntentMismatch(request,actor.id))return json({error:'The signed-in account changed. Reopen Team with the current account.',code:'actor_intent_mismatch',phase:'rejected_before_write'},403);
 let raw:Record<string,unknown>;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedBody(request,64*1024)));}catch(error){if(error instanceof BodyTooLargeError)throw error;return json({error:'Invalid Team operation.',phase:'rejected_before_write'},400);}
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.action!=='string'||!actions.has(raw.action)||typeof raw.sourceId!=='string'||!raw.sourceId||raw.sourceId.length>191||typeof raw.reason!=='string'||typeof raw.requestId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(raw.requestId)||raw.expectedRevision!==null&&typeof raw.expectedRevision!=='string')return json({error:'Review the operation, current version and reason.',phase:'rejected_before_write'},400);
 for(const key of ['backupIds','userIds'])if(raw[key]!==undefined&&(!Array.isArray(raw[key])||raw[key].length>20||raw[key].some((id:unknown)=>typeof id!=='string'||!id||id.length>191)))return json({error:'Select actual distinct staff accounts.',phase:'rejected_before_write'},400);
 await validateSellerFormSubmission(db,'staff.team-governance',raw.formVersion,raw.customAnswers,raw.requestId);
 const {requestId,expectedRevision,formVersion:_,customAnswers:__,...input}=raw;
  if(input.primaryId==='')input.primaryId=null;
 invoked=true;
 const result=await executeTeamGovernance(db,{actorId:actor.id,authSubject:actor.authSubject,requestId,expectedRevision:expectedRevision as string|null,now:Date.now()},input as unknown as TeamCommand);
 return json({saved:true,result,reference:{actorId:actor.id,requestId,action:raw.action,sourceId:raw.sourceId},message:'The Team change was recorded. Original business decisions and deadlines remain authoritative.'});
 }catch(error){return failure(error,invoked);}}
