import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import type {Permission} from '../marketplace/permissions';
import {ManualPaymentError} from './manual-receipts';
import {guidedReleaseKey} from './manual-payment-lifecycle';
import {parseIncomingReference,type IncomingReference,type IncomingOutcome} from './incoming-outcome-contract';

class OutcomeAuthorityError extends ManualPaymentError{constructor(message:string){super(message,403);}}
const unavailable=()=>new ManualPaymentError('The original incoming outcome cannot be verified. Keep its reference and review the native records.',409);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=191&&!/[\p{Cc}]/u.test(value);
const actions={record_bank:'receipt.recorded',allocate:'receipt.allocated',review_claim:'claim.reviewed',release:'fulfillment.released',close_expired:'window.closed',record_reversal:'receipt.reversed',reconcile_cod:'cod.reconciled',record_cash:'cash.received',triage_exception:'exception.triaged'} as const;
async function audience(db:D1Database,actorId:string,reference:IncomingReference){
 if(reference.action==='triage_exception'){const grants=await Promise.allSettled([staffMutationGuard(db,actorId,'payment.receipt.verify',OutcomeAuthorityError),staffMutationGuard(db,actorId,'order.manage',OutcomeAuthorityError)]);if(grants.every(grant=>grant.status==='rejected'))throw new OutcomeAuthorityError('Current incoming review access is required.');return;}
 await staffMutationGuard(db,actorId,reference.action==='release'?'order.manage':'payment.receipt.verify',OutcomeAuthorityError,['record_cash','record_reversal','reconcile_cod','close_expired'].includes(reference.action)?'super_admin':undefined);
}
async function key(actorId:string,requestId:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actorId,requestId]))));return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');}
async function scope(db:D1Database,reference:IncomingReference):Promise<{permission:Permission;role?:'super_admin'}>{
 const {action,sourceId}=reference;
 if(action==='record_cash'){if(sourceId!==reference.requestId)throw unavailable();return{permission:'payment.receipt.verify',role:'super_admin'};}
 let exists:unknown;
 if(action==='record_bank')exists=await db.prepare('SELECT 1 FROM company_payment_account_versions WHERE id=? AND HEX(id)=HEX(?) AND verified_at IS NOT NULL').bind(sourceId,sourceId).first();
 else if(action==='allocate'||action==='record_reversal')exists=await db.prepare("SELECT 1 FROM company_money_receipts WHERE id=? AND HEX(id)=HEX(?) AND kind='bank_credit'").bind(sourceId,sourceId).first();
 else if(action==='review_claim'||action==='release'||action==='close_expired')exists=await db.prepare('SELECT 1 FROM manual_payment_windows WHERE order_id=? AND HEX(order_id)=HEX(?)').bind(sourceId,sourceId).first();
 else if(action==='reconcile_cod')exists=await db.prepare("SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id WHERE j.id=? AND HEX(j.id)=HEX(?) AND o.payment_mode='cod'").bind(sourceId,sourceId).first();
 else{
  const row=await db.prepare('SELECT kind FROM manual_payment_exceptions WHERE id=? AND HEX(id)=HEX(?)').bind(sourceId,sourceId).first<{kind:string}>();if(!row)throw unavailable();
  return{permission:row.kind==='fulfillment_release'?'order.manage':'payment.receipt.verify'};
 }
 if(!exists)throw unavailable();return{permission:action==='release'?'order.manage':'payment.receipt.verify',...action==='record_reversal'||action==='reconcile_cod'||action==='close_expired'?{role:'super_admin' as const}:{}};
}
/** Own immutable command facts only. This never grants current funding/party eligibility or performs an operation. */
export async function readIncomingCommandOutcome(db:D1Database,actorId:string,input:unknown):Promise<IncomingOutcome|null>{
 const reference=parseIncomingReference(input,actorId);if(!reference)throw new ManualPaymentError('Use the original opaque incoming reference.',400);
 await audience(db,actorId,reference);
 const authority=await scope(db,reference);await staffMutationGuard(db,actorId,authority.permission,OutcomeAuthorityError,authority.role);
 let requireSuperAdmin=authority.role==='super_admin';
 const commandKey=await key(actorId,reference.requestId),row=await db.prepare(`SELECT actor_id actorId,action,subject_type subjectType,subject_id subjectId,request_id requestId,command_digest digest,command_result_json result,created_at createdAt FROM audit_logs WHERE command_key=? AND HEX(command_key)=HEX(?)`).bind(commandKey,commandKey).first<{actorId:string|null;action:string;subjectType:string;subjectId:string;requestId:string;digest:string;result:string;createdAt:number}>();
 let outcome:IncomingOutcome|null=null;
 if(row){
  if(row.actorId!==null&&row.actorId!==actorId||row.action!=='manual.payment.'+actions[reference.action]||row.subjectType!=='manual_payment'||row.requestId!==reference.requestId||reference.action!=='record_cash'&&row.subjectId!==reference.sourceId||!/^[a-f0-9]{64}$/.test(row.digest)||!Number.isSafeInteger(row.createdAt))throw unavailable();
  let result:unknown;try{result=JSON.parse(row.result);}catch{throw unavailable();}if(!object(result))throw unavailable();
  let entity:IncomingOutcome['entity']|null=null;const resultId=result.id;
  if(reference.action==='record_bank'||reference.action==='record_cash'){
   if(!id(resultId))throw unavailable();
   const receipt=await db.prepare('SELECT kind,account_version_id accountVersionId,transaction_identity identity FROM company_money_receipts WHERE id=? AND HEX(id)=HEX(?)').bind(resultId,resultId).first<{kind:string;accountVersionId:string|null;identity:string}>();if(!receipt)throw unavailable();
   if(reference.action==='record_bank'){
    const match=await db.prepare('SELECT 1 FROM company_payment_account_versions original JOIN company_payment_account_versions retained ON HEX(retained.identity_hash)=HEX(original.identity_hash) WHERE original.id=? AND HEX(original.id)=HEX(?) AND retained.id=? AND HEX(retained.id)=HEX(?)').bind(reference.sourceId,reference.sourceId,receipt.accountVersionId,receipt.accountVersionId).first();
    if(receipt.kind!=='bank_credit'||!match)throw unavailable();
   }else if(receipt.kind!=='cash_handover'||receipt.identity!==row.subjectId)throw unavailable();
   entity={kind:'receipt',id:resultId};
  }else if(reference.action==='allocate'){
   if(!id(resultId)||!id(result.orderId)||result.receiptId!==reference.sourceId)throw unavailable();
   const allocation=await db.prepare('SELECT a.exception_json exceptionJson,EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.source_key=? AND e.receipt_id=a.receipt_id) AS guided FROM manual_payment_allocations a WHERE a.id=? AND HEX(a.id)=HEX(?) AND HEX(a.receipt_id)=HEX(?) AND HEX(a.order_id)=HEX(?) AND HEX(a.actor_id)=HEX(?)').bind(guidedReleaseKey(result.orderId),resultId,resultId,reference.sourceId,result.orderId,actorId).first<{exceptionJson:string|null;guided:number}>();if(!allocation)throw unavailable();
   if(allocation.exceptionJson||allocation.guided){requireSuperAdmin=true;await staffMutationGuard(db,actorId,'payment.receipt.verify',OutcomeAuthorityError,'super_admin');}entity={kind:'allocation',id:resultId};
  }else if(reference.action==='review_claim'){
   if(!id(resultId)||!Number.isSafeInteger(result.revision)||!await db.prepare('SELECT 1 FROM manual_payment_claim_events WHERE HEX(claim_id)=HEX(?) AND HEX(order_id)=HEX(?) AND HEX(actor_id)=HEX(?) AND HEX(request_id)=HEX(?) AND revision=?').bind(resultId,reference.sourceId,actorId,reference.requestId,result.revision).first())throw unavailable();entity={kind:'claim',id:resultId};
  }else if(reference.action==='release'){
   if(result.orderId!==reference.sourceId||!await db.prepare('SELECT 1 FROM manual_payment_windows WHERE order_id=? AND HEX(order_id)=HEX(?) AND released_at IS NOT NULL').bind(reference.sourceId,reference.sourceId).first())throw unavailable();entity={kind:'order',id:reference.sourceId};
  }else if(reference.action==='close_expired'){
   const closure=await db.prepare(`SELECT 1 FROM manual_payment_windows w JOIN audit_logs a ON a.id=? AND HEX(a.subject_id)=HEX(w.order_id)
    WHERE w.order_id=? AND HEX(w.order_id)=HEX(?) AND w.closure_reason='expired' AND w.closed_at IS NOT NULL AND HEX(a.actor_id)=HEX(?)`)
    .bind('manual-expiry:'+reference.sourceId,reference.sourceId,reference.sourceId,actorId).first();
   if(result.orderId!==reference.sourceId||!closure)throw unavailable();entity={kind:'order',id:reference.sourceId};
  }else if(reference.action==='record_reversal'){
   if(!id(resultId)||result.receiptId!==reference.sourceId||!await db.prepare('SELECT 1 FROM company_receipt_reversals WHERE id=? AND HEX(id)=HEX(?) AND HEX(receipt_id)=HEX(?)').bind(resultId,resultId,reference.sourceId).first())throw unavailable();entity={kind:'reversal',id:resultId};
  }else if(reference.action==='reconcile_cod'){
   if(result.jobId!==reference.sourceId)throw unavailable();
   // Deduction-only reconciliation creates no cash allocation. Its native command receipt is the fact; the destination remains its real parcel.
   entity={kind:'parcel',id:reference.sourceId};
  }else{
   if(resultId!==reference.sourceId||!Number.isSafeInteger(result.revision)||!await db.prepare('SELECT 1 FROM manual_payment_exception_events WHERE HEX(exception_id)=HEX(?) AND HEX(actor_id)=HEX(?) AND revision=?').bind(reference.sourceId,actorId,result.revision).first())throw unavailable();entity={kind:'exception',id:reference.sourceId};
  }
  outcome={recordedAt:row.createdAt,entity};
 }
 await audience(db,actorId,reference);const final=await scope(db,reference);await staffMutationGuard(db,actorId,final.permission,OutcomeAuthorityError,requireSuperAdmin?'super_admin':final.role);
 return outcome;
}
/** Actorless browser entries are never assigned to the current account merely because no outcome was found. */
export async function probeIncomingCommandOutcome(db:D1Database,actorId:string,requestId:string):Promise<{reference:IncomingReference;outcome:IncomingOutcome}|null>{
 if(!/^[A-Za-z0-9_-]{8,160}$/.test(requestId))throw new ManualPaymentError('Keep the original incoming request reference.',400);
 const grants=await Promise.allSettled([staffMutationGuard(db,actorId,'payment.receipt.verify',OutcomeAuthorityError),staffMutationGuard(db,actorId,'order.manage',OutcomeAuthorityError)]);if(grants.every(grant=>grant.status==='rejected'))throw new OutcomeAuthorityError('Current incoming review access is required.');
 const commandKey=await key(actorId,requestId),row=await db.prepare('SELECT action,subject_type subjectType,subject_id subjectId,request_id requestId,actor_id actorId FROM audit_logs WHERE command_key=? AND HEX(command_key)=HEX(?)').bind(commandKey,commandKey).first<{action:string;subjectType:string;subjectId:string;requestId:string;actorId:string|null}>();
 if(!row)return null;
 const action=(Object.keys(actions) as (keyof typeof actions)[]).find(candidate=>row.action==='manual.payment.'+actions[candidate]);
 if(!action||row.subjectType!=='manual_payment'||row.requestId!==requestId||row.actorId!==null&&row.actorId!==actorId)throw unavailable();
 const reference:IncomingReference={version:1,actorId,action,requestId,sourceId:action==='record_cash'?requestId:row.subjectId},outcome=await readIncomingCommandOutcome(db,actorId,reference);if(!outcome)throw unavailable();return{reference,outcome};
}
