import {env} from 'cloudflare:workers';
import {getAuthenticatedUser} from '@/app/auth';
import {requireExistingCustomerApi,CustomerAuthorizationError} from '../auth/customer';
import {requireExistingStaffIntentApi} from '../auth/staff-intent';
import {StaffAuthorizationError} from '../auth/staff';
import {requireDatabase} from '../db/d1';
import {hasActorIntentMismatch} from '../http/actor-intent';
import {isTrustedMutationRequest} from '../http/request-security';
import {readBoundedJsonObject} from '../http/form-json-body';
import {BodyTooLargeError} from '../http/bounded-body';
import {ManualPaymentError,ManualPaymentNotAppliedError,submitPaymentClaim,releasePaidManualOrder,type PaymentClaimInput} from './manual-receipts';
import {ClaimReleaseAuthorityError,ClaimReleaseProofError} from './claim-release-authority';
import {readClaimReleaseOutcome} from './claim-release-outcomes';
import type {PaymentAttemptAction,PaymentAttemptReference} from './claim-release-client';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie'}});
function keys(body:Record<string,unknown>,allowed:string[]){if(Object.keys(body).some(key=>!allowed.includes(key)))throw new ManualPaymentNotAppliedError('This command contains unsupported fields.',400);}
export async function claimReleasePrincipal(request:Request,action:PaymentAttemptAction){
 const viewer=action==='release'?await requireExistingStaffIntentApi(request,'order.manage'):await requireExistingCustomerApi();
 const identity=await getAuthenticatedUser({readOnly:true});if(!identity)throw new CustomerAuthorizationError('Authentication is required.',401);
 if(viewer.authSubject!==identity.userId)throw new CustomerAuthorizationError('Refresh the original payment view.',403);
 const actorId='id' in viewer?viewer.id:viewer.userId;
 if(hasActorIntentMismatch(request,actorId))throw new CustomerAuthorizationError('The signed-in account changed. Refresh the original payment view.',403);
 return {actorId,authSubject:identity.userId};
}
export async function recheckClaimReleasePrincipal(request:Request,action:PaymentAttemptAction,original:{actorId:string;authSubject:string}){
 const current=await claimReleasePrincipal(request,action);if(current.actorId!==original.actorId||current.authSubject!==original.authSubject)throw new CustomerAuthorizationError('Refresh the original payment view.',403);
}
export async function claimReleaseHttp(request:Request,orderId:string,action:PaymentAttemptAction){
 if(request.method!=='GET'&&!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 let reference:PaymentAttemptReference|undefined;let completed=false;let principal:{actorId:string;authSubject:string}|undefined;
 try{
  principal=await claimReleasePrincipal(request,action);const {actorId,authSubject}=principal;
  const db=requireDatabase(env as unknown as {DB?:D1Database});
  if(request.method==='GET'){
   const outcome=await readClaimReleaseOutcome(db,actorId,orderId,action,new URL(request.url).searchParams.get('attempt')??'',authSubject);
   await recheckClaimReleasePrincipal(request,action,principal);
   return reply({outcome});
  }
  if(action==='upload')throw new ManualPaymentError('Use the evidence upload form.',400);
  const body=await readBoundedJsonObject(request);keys(body,action==='release'?['action','requestId','expectedRevision','input']:['requestId','expectedRevision','input']);
  if(typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(body.requestId)||!(body.expectedRevision===null||typeof body.expectedRevision==='string'&&/^\d{1,12}$/.test(body.expectedRevision)))throw new ManualPaymentError('Use the original request reference and revision.',400);
  reference={version:1,actorId,sourceId:orderId,action,requestId:body.requestId};
  if(!body.input||typeof body.input!=='object'||Array.isArray(body.input))throw new ManualPaymentNotAppliedError('Use a complete payment command.',400);const input=body.input as Record<string,unknown>,context={actorId,authSubject,requestId:body.requestId,expectedRevision:body.expectedRevision,now:Date.now()};
  await recheckClaimReleasePrincipal(request,action,principal);
  let result:unknown;
  if(action==='claim'){keys(input,['amountPaisa','paymentDate','bankReference','note','evidenceIds']);result=await submitPaymentClaim(db,context,{...input,orderId,bankReference:input.bankReference??null,note:input.note??'',evidenceIds:input.evidenceIds??[]} as unknown as PaymentClaimInput);}
  else{keys(input,['orderId','reason']);if(body.action!=='release'||input.orderId!==orderId)throw new ManualPaymentError('Use the original release source.',400);result=await releasePaidManualOrder(db,context,input as {orderId:string;reason:string});}
  completed=true;
  // Retain the old result fields for native callers; new clients require this exact original receipt.
  const outcome=await readClaimReleaseOutcome(db,actorId,orderId,action,reference.requestId,authSubject);
  if(!outcome)throw new Error('Committed outcome unavailable.');
  await recheckClaimReleasePrincipal(request,action,principal);
  return reply({...result as Record<string,unknown>,outcome});
 }catch(caught){let error=caught;
  if(principal){try{await recheckClaimReleasePrincipal(request,action,principal);}catch(denial){error=denial;}}
  if(error instanceof ManualPaymentError||error instanceof CustomerAuthorizationError||error instanceof StaffAuthorizationError||error instanceof ClaimReleaseAuthorityError||error instanceof ClaimReleaseProofError)return reply({error:error.message,...request.method!=='GET'&&!completed&&reference&&error instanceof ManualPaymentNotAppliedError?{notApplied:true,reference}:{}},error.status);
  if(error instanceof BodyTooLargeError)return reply({error:'This request exceeds the allowed size.'},413);
  if(error instanceof Error&&error.message==='Request reference was already used for different command content.')return reply({error:error.message},409);
  if(error instanceof SyntaxError||error instanceof TypeError)return reply({error:'The payment request is incomplete or invalid.'},400);
  return reply({error:'The original outcome remains unconfirmed. Keep this request and check its saved outcome.'},503);
 }
}
