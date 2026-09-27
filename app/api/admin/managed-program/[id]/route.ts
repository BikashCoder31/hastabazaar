import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { addFixedSupplyAdjustment, decideFixedSupplyRecord, FixedSupplyError, prepareFixedSupplierPayment, transitionFixedSupplierPayment } from '@/lib/managed-commerce/fixed-supply';
import { reviewRouteTransition, RouteTransitionError } from '@/lib/managed-commerce/route-transition';
import { resolveRuntimeEnvironment } from '@/lib/staging/environment';
import { FormRequestConflictError, isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const commonKeys=['action','requestId','formVersion','customAnswers'];
const allowed=(body:Record<string,unknown>,keys:readonly string[])=>Object.keys(body).every(key=>commonKeys.includes(key)||keys.includes(key));

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 let validatedFormId:string|undefined,validatedVersionId:string|undefined;
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{
  let raw:unknown;
  try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedBody(request,24*1024)));}
  catch(error){if(error instanceof BodyTooLargeError)throw error;return reply({error:'Invalid JSON request.'},400);}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return reply({error:'Invalid program-review request.'},400);
  const body=raw as Record<string,unknown>;
  const permission=body.action==='prepare_payment'?'payout.prepare':body.action==='approve_payment'?'payout.approve':body.action==='mark_payment_paid'?'payout.mark_paid':body.action==='add_adjustment'?'refund.approve.high_value':'seller.application.review';
  const actor=await requireStaffApi(permission);
  const {id:sellerId}=await context.params;
  const database=requireDatabase(env as unknown as {DB?:D1Database});
  if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId)||!Number.isSafeInteger(body.formVersion)||!Array.isArray(body.customAnswers))return reply({error:'Invalid program-review form context.'},400);
  const bindings=env as unknown as Record<string,string>;
  const environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});
  const now=Date.now(),requestId=body.requestId;
  let formId:''|'staff.managed-supply-decision'|'staff.managed-adjustment'|'staff.managed-payment-preparation'|'staff.managed-payment-action'|'staff.managed-transition-decision'='';
  if(body.action==='decide_supply')formId='staff.managed-supply-decision';
  else if(body.action==='add_adjustment')formId='staff.managed-adjustment';
  else if(body.action==='prepare_payment')formId='staff.managed-payment-preparation';
  else if(body.action==='approve_payment'||body.action==='mark_payment_paid')formId='staff.managed-payment-action';
  else if(body.action==='review_transition')formId='staff.managed-transition-decision';
  else return reply({error:'Select a supported program-review action.'},400);
  const form=await validateSellerFormSubmission(database,formId,body.formVersion,body.customAnswers,requestId);
  validatedFormId=formId;validatedVersionId=form.versionId;
  const contextForm={requestId,versionId:form.versionId,answers:form.answers};
  if(body.action==='decide_supply'){
   if(!allowed(body,['recordId','decision','quantityAccepted','possessionStatus','qualityStatus','ownershipRecordStatus','riskRecordStatus','evidenceReference','reason'])||typeof body.recordId!=='string'||!['accept','reject','cancel'].includes(String(body.decision))||typeof body.quantityAccepted!=='number'||!Number.isSafeInteger(body.quantityAccepted)||!['received','returned','not_received'].includes(String(body.possessionStatus))||!['accepted','rejected','not_inspected'].includes(String(body.qualityStatus))||!['simulated_terms_recorded','not_recorded'].includes(String(body.ownershipRecordStatus))||!['simulated_terms_recorded','not_recorded'].includes(String(body.riskRecordStatus))||typeof body.evidenceReference!=='string'||typeof body.reason!=='string')return reply({error:'Invalid supply decision.'},400);
   if(!await database.prepare('SELECT 1 FROM managed_supply_records WHERE id=? AND seller_id=?').bind(body.recordId,sellerId).first())return reply({error:'Supply record was not found for this seller.'},404);
   await decideFixedSupplyRecord(database,{recordId:body.recordId,actorId:actor.id,action:body.decision as 'accept'|'reject'|'cancel',quantityAccepted:body.quantityAccepted,possessionStatus:body.possessionStatus as 'received'|'returned'|'not_received',qualityStatus:body.qualityStatus as 'accepted'|'rejected'|'not_inspected',ownershipRecordStatus:body.ownershipRecordStatus as 'simulated_terms_recorded'|'not_recorded',riskRecordStatus:body.riskRecordStatus as 'simulated_terms_recorded'|'not_recorded',evidenceReference:body.evidenceReference,reason:body.reason,requestId,now,environment,form:contextForm});
  }else if(body.action==='add_adjustment'){
   if(!allowed(body,['recordId','kind','amountNpr','amountPaisa','reason'])||typeof body.recordId!=='string'||!['cancellation','rejection','defect'].includes(String(body.kind))||typeof body.amountPaisa!=='number'||!Number.isSafeInteger(body.amountPaisa)||body.amountNpr!==undefined&&(typeof body.amountNpr!=='number'||Math.round(body.amountNpr*100)!==body.amountPaisa)||typeof body.reason!=='string')return reply({error:'Invalid supplier adjustment.'},400);
   if(!await database.prepare('SELECT 1 FROM managed_supplier_obligations WHERE id=? AND seller_id=?').bind(body.recordId,sellerId).first())return reply({error:'Supply obligation was not found for this seller.'},404);
   await addFixedSupplyAdjustment(database,{recordId:body.recordId,actorId:actor.id,kind:body.kind as 'cancellation'|'rejection'|'defect',amountPaisa:body.amountPaisa,reason:body.reason,requestId,now,environment,form:contextForm});
  }else if(body.action==='prepare_payment'){
   if(!allowed(body,['recordId','destinationReference'])||typeof body.recordId!=='string'||typeof body.destinationReference!=='string')return reply({error:'Invalid supplier payment preparation.'},400);
   if(!await database.prepare('SELECT 1 FROM managed_supplier_obligations WHERE id=? AND seller_id=?').bind(body.recordId,sellerId).first())return reply({error:'Supply obligation was not found for this seller.'},404);
   const paymentId=await prepareFixedSupplierPayment(database,{recordId:body.recordId,actorId:actor.id,destinationReference:body.destinationReference,requestId,now,environment,form:contextForm});return reply({ok:true,paymentId,simulation:true});
  }else if(body.action==='approve_payment'||body.action==='mark_payment_paid'){
   if(!allowed(body,['paymentId'])||typeof body.paymentId!=='string')return reply({error:'Invalid supplier payment action.'},400);
   if(!await database.prepare('SELECT 1 FROM managed_supplier_payments p JOIN managed_supplier_obligations o ON o.id=p.obligation_id WHERE p.id=? AND o.seller_id=?').bind(body.paymentId,sellerId).first())return reply({error:'Supplier payment was not found for this seller.'},404);
   await transitionFixedSupplierPayment(database,{paymentId:body.paymentId,actorId:actor.id,action:body.action==='approve_payment'?'approve':'mark_paid',requestId,now,environment,form:contextForm});
  }else if(body.action==='review_transition'){
   if(!allowed(body,['applicationId','decision','reason','effectiveLocal','effectiveAt'])||typeof body.applicationId!=='string'||!['approve','reject','request_changes'].includes(String(body.decision))||typeof body.reason!=='string'||body.decision==='approve'&&(typeof body.effectiveAt!=='number'||!Number.isSafeInteger(body.effectiveAt)))return reply({error:'Invalid transition decision.'},400);
   if(!await database.prepare('SELECT 1 FROM seller_route_transition_applications WHERE id=? AND seller_id=?').bind(body.applicationId,sellerId).first())return reply({error:'Route transition was not found for this seller.'},404);
   await reviewRouteTransition(database,{applicationId:body.applicationId,actorId:actor.id,action:body.decision as 'approve'|'reject'|'request_changes',reason:body.reason,effectiveAt:body.decision==='approve'?body.effectiveAt as number:undefined,requestId,now,environment,form:contextForm});
  }
  return reply({ok:true,sellerId,simulation:true});
 }catch(error){
  if(error instanceof StaffAuthorizationError)return reply({error:error.message},error.status);
  if(error instanceof BodyTooLargeError)return reply({error:error.message},413);
  if(error instanceof SyntaxError)return reply({error:'Invalid request.'},400);
  if(error instanceof FormRequestConflictError)return reply({error:error.message},409);
  if(error instanceof FormRuntimeError)return reply({error:error.message,code:error.code},error.code==='stale_version'?409:503);
  if(error instanceof FormValidationError)return reply({error:error.message,fieldId:error.fieldId},400);
  if(error instanceof FixedSupplyError||error instanceof RouteTransitionError||error instanceof RangeError||error instanceof TypeError)return reply({error:error.message},409);
  if(validatedFormId&&validatedVersionId&&await isValidatedFormVersionStale(
   requireDatabase(env as unknown as {DB?:D1Database}),validatedFormId,validatedVersionId))
   return reply({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},409);
  return reply({error:'The simulated program action could not be completed.'},500);
 }
}
