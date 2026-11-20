import {claimReleaseAuthority,requireClaimReleaseProof} from './claim-release-authority';
import {ManualPaymentError} from './manual-receipts';
import {paymentAttemptReference,type PaymentAttemptAction,type PaymentAttemptOutcome} from './claim-release-client';
const unavailable=()=>new ManualPaymentError('The original outcome remains unconfirmed. Keep its reference for review.',409);
/** Immutable own command receipt only; no expiration, identity provisioning, upload completion or current-state inference. */
export async function readClaimReleaseOutcome(db:D1Database,actorId:string,sourceId:string,action:PaymentAttemptAction,requestId:string,authSubject:string):Promise<PaymentAttemptOutcome|null>{
 const reference=paymentAttemptReference({version:1,actorId,sourceId,action,requestId},actorId,sourceId,action);if(!reference)throw new ManualPaymentError('Use the original payment request reference.',400);
 const context={actorId,authSubject,requestId,expectedRevision:null,now:Date.now()},access=()=>claimReleaseAuthority(db,context,sourceId,action);await access();
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actorId,requestId]))),key=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
 const row=await db.prepare('SELECT actor_id actorId,action,subject_type subjectType,subject_id sourceId,request_id requestId,command_digest digest,command_result_json result,created_at recordedAt FROM audit_logs WHERE command_key=? AND HEX(command_key)=HEX(?)').bind(key,key).first<{actorId:string|null;action:string;subjectType:string;sourceId:string;requestId:string;digest:string;result:string;recordedAt:number}>();
 if(!row){await access();return null;}
 const suffix={claim:'claim.submitted',release:'fulfillment.released',upload:'file.saved'}[action];
 if(row.actorId!==actorId||row.action!=='manual.payment.'+suffix||row.subjectType!==(action==='upload'?'order':'manual_payment')||row.sourceId!==sourceId||row.requestId!==requestId||!/^[a-f0-9]{64}$/.test(row.digest)||!Number.isSafeInteger(row.recordedAt))throw unavailable();
 await requireClaimReleaseProof(db,context,sourceId,action,row.recordedAt);
 let parsed:unknown;try{parsed=JSON.parse(row.result);}catch{throw unavailable();}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw unavailable();const saved=parsed as Record<string,unknown>;let result:Record<string,unknown>;
 if(action==='release'){if(saved.orderId!==sourceId)throw unavailable();result={orderId:sourceId};}
 else if(action==='claim'){
  if(typeof saved.id!=='string'||!Number.isSafeInteger(saved.revision)||!await db.prepare('SELECT 1 FROM manual_payment_claim_events WHERE HEX(claim_id)=HEX(?) AND HEX(order_id)=HEX(?) AND HEX(actor_id)=HEX(?) AND HEX(request_id)=HEX(?) AND revision=?').bind(saved.id,sourceId,actorId,requestId,saved.revision).first())throw unavailable();result={id:saved.id,revision:saved.revision};
 }else{
  if(typeof saved.id!=='string'||typeof saved.name!=='string'||!await db.prepare('SELECT 1 FROM manual_payment_claim_files WHERE HEX(id)=HEX(?) AND HEX(order_id)=HEX(?) AND HEX(uploaded_by)=HEX(?)').bind(saved.id,sourceId,actorId).first())throw unavailable();result={id:saved.id,name:saved.name};
 }
 await access();return{reference,result,recordedAt:row.recordedAt};
}
