import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { addFixedSupplyAdjustment, decideFixedSupplyRecord, FixedSupplyError, prepareFixedSupplierPayment, transitionFixedSupplierPayment } from '@/lib/managed-commerce/fixed-supply';
import { reviewRouteTransition, RouteTransitionError } from '@/lib/managed-commerce/route-transition';
import { resolveRuntimeEnvironment } from '@/lib/staging/environment';

export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const value=(body:Record<string,unknown>,key:string)=>typeof body[key]==='string'?body[key] as string:'';

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{
  const body=JSON.parse(new TextDecoder().decode(await readBoundedBody(request,24*1024))) as Record<string,unknown>;
  const permission=body.action==='prepare_payment'?'payout.prepare':body.action==='approve_payment'?'payout.approve':body.action==='mark_payment_paid'?'payout.mark_paid':body.action==='add_adjustment'?'refund.approve.high_value':'seller.application.review';
  const actor=await requireStaffApi(permission);
  const {id:sellerId}=await context.params;
  const database=requireDatabase(env as unknown as {DB?:D1Database});
  const bindings=env as unknown as Record<string,string>;
  const environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});
  const now=Date.now(),requestId=value(body,'requestId')||crypto.randomUUID();
  if(body.action==='decide_supply'){
   const action=body.decision==='accept'?'accept':body.decision==='reject'?'reject':'cancel';
   await decideFixedSupplyRecord(database,{recordId:value(body,'recordId'),actorId:actor.id,action,quantityAccepted:Number(body.quantityAccepted),possessionStatus:body.possessionStatus==='received'?'received':body.possessionStatus==='returned'?'returned':'not_received',qualityStatus:body.qualityStatus==='accepted'?'accepted':body.qualityStatus==='rejected'?'rejected':'not_inspected',ownershipRecordStatus:body.ownershipRecordStatus==='simulated_terms_recorded'?'simulated_terms_recorded':'not_recorded',riskRecordStatus:body.riskRecordStatus==='simulated_terms_recorded'?'simulated_terms_recorded':'not_recorded',evidenceReference:value(body,'evidenceReference'),reason:value(body,'reason'),requestId,now,environment});
  }else if(body.action==='add_adjustment'){
   const kind=body.kind==='cancellation'?'cancellation':body.kind==='rejection'?'rejection':'defect';
   await addFixedSupplyAdjustment(database,{recordId:value(body,'recordId'),actorId:actor.id,kind,amountPaisa:Number(body.amountPaisa),reason:value(body,'reason'),requestId,now,environment});
  }else if(body.action==='prepare_payment'){
   const paymentId=await prepareFixedSupplierPayment(database,{recordId:value(body,'recordId'),actorId:actor.id,destinationReference:value(body,'destinationReference'),requestId,now,environment});return reply({ok:true,paymentId,simulation:true});
  }else if(body.action==='approve_payment'||body.action==='mark_payment_paid'){
   await transitionFixedSupplierPayment(database,{paymentId:value(body,'paymentId'),actorId:actor.id,action:body.action==='approve_payment'?'approve':'mark_paid',requestId,now,environment});
  }else if(body.action==='review_transition'){
   const decision=body.decision==='approve'?'approve':body.decision==='reject'?'reject':'request_changes';
   await reviewRouteTransition(database,{applicationId:value(body,'applicationId'),actorId:actor.id,action:decision,reason:value(body,'reason'),effectiveAt:decision==='approve'?Number(body.effectiveAt):undefined,requestId,now,environment});
  }else return reply({error:'Select a supported program-review action.'},400);
  return reply({ok:true,sellerId,simulation:true});
 }catch(error){
  if(error instanceof StaffAuthorizationError)return reply({error:error.message},error.status);
  if(error instanceof BodyTooLargeError)return reply({error:error.message},413);
  if(error instanceof SyntaxError)return reply({error:'Invalid request.'},400);
  if(error instanceof FixedSupplyError||error instanceof RouteTransitionError||error instanceof RangeError||error instanceof TypeError)return reply({error:error.message},409);
  return reply({error:'The simulated program action could not be completed.'},500);
 }
}
