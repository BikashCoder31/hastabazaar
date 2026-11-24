import {ACTOR_INTENT_HEADER,hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {FeePolicyError,getCommonFeeState,publishCommonFeePolicy,cancelCommonFeePolicy,publishInitialCommonFeePolicy} from '@/lib/commission/coordinated-policy';
import {FRESH_PASSWORD_MS,proofIsCurrent} from '@/lib/security/model';
import {requiredStore,securityActor,securityBindings,SecurityRequestError} from '@/lib/security/request';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){if(error instanceof SecurityRequestError)return reply({error:error.message,code:error.code},error.status);if(error instanceof FeePolicyError||error instanceof StaffAuthorizationError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:error.message},413);if(error instanceof SyntaxError||error instanceof RangeError)return reply({error:'Review the exact fee policy request.'},400);return reply({error:'The saved outcome is unavailable. Keep the same request for recovery.'},503);}

async function initialize(request:Request,body:Record<string,unknown>){
 if(!request.headers.get('origin')||!isTrustedMutationRequest(request,securityBindings().APP_ORIGIN))
  throw new SecurityRequestError('Cross-site requests are not allowed.');
 if(!request.headers.get(ACTOR_INTENT_HEADER))throw new SecurityRequestError('Refresh the current commission settings.');
 const {db,actor,key,initialized}=await securityActor(request);
 if(actor.role!=='super_admin')throw new SecurityRequestError('Only Super Admin can publish the initial selling rates.');
 const store=requiredStore(db,key,initialized);
 const account=await store.readAccount(actor.id);
 const proof=actor.sessionHash?await store.readProof(actor.sessionHash,actor.id):null;
 const now=Date.now();
 if(actor.raw?.accountId!==actor.id||actor.raw.userId!==actor.authSubject||!actor.sessionHash||!account||!proof||
   !proofIsCurrent(proof.value,account.value,now)||proof.value.passwordVerifiedAt>now||
   now-proof.value.passwordVerifiedAt>FRESH_PASSWORD_MS||now-proof.value.verifiedAt>FRESH_PASSWORD_MS)
  throw new SecurityRequestError('Verify your password and authenticator again to publish the initial rates.',403,'MFA_REQUIRED');
 if(typeof body.requestId!=='string'||body.requestId.length>100||typeof body.expectedContext!=='string'||typeof body.reason!=='string'||
   typeof body.registeredBasisPoints!=='number'||typeof body.managedBasisPoints!=='number')
  throw new FeePolicyError('Enter both initial rates and a reason, then review the publication.',400);
 const result=await publishInitialCommonFeePolicy(db,{actorId:actor.id,requestId:body.requestId,expectedRevision:null,now},{
  expectedContext:body.expectedContext,reason:body.reason,registeredBasisPoints:body.registeredBasisPoints,managedBasisPoints:body.managedBasisPoints,
 },{authSubject:actor.authSubject,sessionHash:actor.sessionHash,account,proof});
 return reply(result,201);
}

export async function GET(request?:Request){try{const actor=await requireStaffApi('commercial_policy.manage');if(request&&hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in account changed.',403);const state=await getCommonFeeState(requireDatabase(env as unknown as {DB?:D1Database}),Date.now());const current=await requireStaffApi('commercial_policy.manage');if(current.id!==actor.id)throw new StaffAuthorizationError('The signed-in account changed.',403);return reply(state);}catch(error){return failure(error);}}
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{
  const actor=await requireStaffApi('commercial_policy.manage');if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this commercial view.',403);if(actor.role!=='super_admin')return reply({error:'A current Super Admin must publish this fee policy.'},403);
  const body=await readBoundedJsonObject(request),allowed=['action','requestId','expectedContext','reason',...(body.action==='initialize'?['registeredBasisPoints','managedBasisPoints']:body.action==='publish'?['basisPoints','effectiveAt','replacesId']:['policyId'])];
  if(Object.keys(body).some(key=>!allowed.includes(key))||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(body.requestId)||typeof body.expectedContext!=='string'||!/^[a-f0-9]{64}$/.test(body.expectedContext)||typeof body.reason!=='string')return reply({error:'Review the exact policy version, reason and request.'},400);
  if(body.action==='initialize')return await initialize(request,body);
  const db=requireDatabase(env as unknown as {DB?:D1Database}),ctx={actorId:actor.id,requestId:body.requestId,expectedRevision:null,now:Date.now()};
  if(body.action==='publish'&&typeof body.basisPoints==='number'&&typeof body.effectiveAt==='number'&&(body.replacesId===null||typeof body.replacesId==='string'))return reply(await publishCommonFeePolicy(db,ctx,{expectedContext:body.expectedContext,basisPoints:body.basisPoints,effectiveAt:body.effectiveAt,replacesId:body.replacesId,reason:body.reason}));
  if(body.action==='cancel'&&typeof body.policyId==='string')return reply(await cancelCommonFeePolicy(db,ctx,{policyId:body.policyId,expectedContext:body.expectedContext,reason:body.reason}));
  return reply({error:'Choose a reviewed common schedule action.'},400);
 }catch(error){return failure(error);}
}
