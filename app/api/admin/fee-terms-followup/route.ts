import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {FeePolicyError} from '@/lib/commission/coordinated-policy';
import {getFeeTermsWorkspace,recordFeeTermsContact} from '@/lib/commission/terms-followup';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){if(error instanceof FeePolicyError||error instanceof StaffAuthorizationError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:error.message},413);if(error instanceof SyntaxError)return reply({error:'Invalid follow-up request.'},400);return reply({error:'The follow-up outcome is unavailable. Retry the same request.'},503);}
export async function GET(request?:Request){try{const actor=await requireStaffApi('seller.application.review');if(request&&hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this follow-up view.',403);return reply(await getFeeTermsWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,Date.now()));}catch(error){return failure(error);}}
export async function POST(request:Request){if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);try{const actor=await requireStaffApi('seller.application.review');if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this follow-up view.',403);const body=await readBoundedJsonObject(request);
 if(Object.keys(body).some(key=>!['caseId','action','technicalOwnerId','outcome','note','nextAction','nextUpdateAt','requestId','expectedRevision'].includes(key))||typeof body.caseId!=='string'||typeof body.action!=='string'||!['contact','hold_review','super_admin_review','technical_issue','technical_assign','technical_resolved','manual_resend'].includes(body.action)||typeof body.outcome!=='string'||typeof body.note!=='string'||typeof body.nextAction!=='string'||typeof body.nextUpdateAt!=='number'||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(body.requestId)||typeof body.expectedRevision!=='string'||!/^\d+$/.test(body.expectedRevision))return reply({error:'Review the exact current case, outcome and next action.'},400);
 return reply(await recordFeeTermsContact(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:actor.id,requestId:body.requestId,expectedRevision:body.expectedRevision,now:Date.now()},{caseId:body.caseId,action:body.action as Parameters<typeof recordFeeTermsContact>[2]['action'],...(typeof body.technicalOwnerId==='string'?{technicalOwnerId:body.technicalOwnerId}:{}),outcome:body.outcome,note:body.note,nextAction:body.nextAction,nextUpdateAt:body.nextUpdateAt}));
 }catch(error){return failure(error);}}
