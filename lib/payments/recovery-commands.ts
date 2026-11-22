import {approveRecoveryRepaymentAttribution} from './recovery-repayment-attribution';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from './recovery-receipt-disposition';
import * as recovery from './seller-recovery';
import {recordRecoveryContact,ensureRecoveryReviewWork,ensureRecoveryContactWork} from './recovery-followup';
import {submitRecoveryRepaymentClaim,reviewRecoveryRepaymentClaim,supplyRecoveryRepaymentEvidence,ensureRecoveryRepaymentWork} from './recovery-repayments';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import type {CommandContext} from '../workflows/contracts';
import type {RuntimeEnvironment} from '../staging/environment';

export type RecoveryMode='staff'|'seller';
const handlers={repayment_attribution:approveRecoveryRepaymentAttribution,receipt_reversal:reconcileRecoveryReceiptReversal,company_history:recovery.reviewSellerRecoveryCompanyHistory,carrier_unpaid:recovery.reconcileSellerRecoveryUnpaidCarrierReceipt,payout_return:recovery.reconcileSellerRecoveryReturnedPayout,request_calculation_review:recovery.requestSellerRecoveryCalculationReview,answer_calculation_review:recovery.answerSellerRecoveryCalculationReview,partial_source:recovery.reviewPartialUnpaidSellerRecoverySource,carrier:recovery.reconcileSellerRecoveryCarrierReceipt,correct_unpaid:recovery.correctUnpaidSellerRecoverySource,refresh_source:recovery.refreshSellerRecoveryZeroSource,retire_payout:recovery.retireSellerRecoveryPayoutSource,unpaid_source:recovery.reviewUnpaidSellerRecoverySource,compensate_source:recovery.compensateSellerRecoverySource,history:recovery.reviewSellerRecoveryHistory,open:recovery.openSellerRecovery,approve:recovery.approveSellerRecovery,receipt:recovery.allocateSellerRecoveryReceipt,
 review_arrangement:recovery.recordSellerRecoveryArrangementReview,review_proposal:recovery.reviewSellerRecoveryProposal,correct:recovery.correctSellerRecoveryLiability,absorb:recovery.absorbSellerRecovery,uphold:recovery.upholdSellerRecoveryDispute,contact:recordRecoveryContact,approve_plan:recovery.approveSellerRecoveryPlan,earnings:recovery.applySellerRecoveryEarnings,
 dispute:recovery.disputeSellerRecovery,propose:recovery.proposeSellerRecoveryPlan,claim:submitRecoveryRepaymentClaim,review_claim:reviewRecoveryRepaymentClaim,claim_evidence:supplyRecoveryRepaymentEvidence};
type Action=keyof typeof handlers;
const fields:Record<Action,readonly string[]>={repayment_attribution:['caseId','receiptId','receiptRevision','amountPaisa','reviewDigest','evidenceReference','reason','publicMessage'],receipt_reversal:['reversalId','reviewDigest','unallocatedPaisa','allocations','evidenceReference','reason','publicMessage'],company_history:['caseId','reviewDigest','candidate','amountPaisa','evidenceReference','reason','publicMessage'],carrier_unpaid:['caseId','receiptId','receiptRevision','amountPaisa','reviewDigest','originalUnpaidCostConfirmed','evidenceReference','reason','publicMessage'],payout_return:['caseId','payoutId','receiptId','receiptRevision','amountPaisa','resolveDisputedPaisa','reviewDigest','originalPayoutReturnConfirmed','evidenceReference','reason','publicMessage'],request_calculation_review:['caseId','reason','evidenceReference'],answer_calculation_review:['caseId','reviewId','reviewDigest','reason','publicMessage'],partial_source:['caseId','reviewDigest','evidenceReference','reason','publicMessage'],carrier:['caseId','receiptId','receiptRevision','amountPaisa','resolveDisputedPaisa','reviewDigest','originalCostReimbursementConfirmed','evidenceReference','reason','publicMessage'],correct_unpaid:['caseId','newUnpaidResponsibilityPaisa','reviewDigest','evidenceReference','reason','publicMessage'],refresh_source:['caseId','reviewDigest','evidenceReference','reason','publicMessage'],retire_payout:['caseId','payoutId','reviewDigest','noFundsRemainSentConfirmed','evidenceReference','reason','publicMessage'],unpaid_source:['caseId','reviewDigest','evidenceReference','reason','publicMessage'],compensate_source:['caseId','reviewDigest','evidenceReference','reason','publicMessage'],history:['caseId','reviewDigest','candidate','amountPaisa','evidenceReference','reason','publicMessage'],open:['kind','id','reason'],approve:['caseId','reviewDigest','evidenceReference','reason'],receipt:['caseId','receiptId','receiptRevision','amountPaisa','method','evidenceReference','reason'],
 review_arrangement:['caseId','proposalId','reviewDigest','nextReviewAt','reason','publicMessage'],review_proposal:['caseId','proposalId','decision','reviewDigest','nextReviewAt','reason','publicMessage'],correct:['caseId','newConfirmedPaisa','resolveDisputedPaisa','reviewDigest','evidenceReference','reason','publicMessage'],absorb:['caseId','amountPaisa','resolveDisputedPaisa','reviewDigest','evidenceReference','reason','collectionAttempts'],uphold:['caseId','amountPaisa','reviewDigest','evidenceReference','reason','publicMessage'],contact:['caseId','actualAt','evidenceReference','reason'],approve_plan:['caseId','proposalId','reviewDigest','reason'],earnings:['caseId'],
 dispute:['caseId','amountPaisa','reason','evidenceReference'],propose:['caseId','termsDigest','termsAccepted','nettingAuthorized','installments','contactDetails','nextReviewAt'],
 claim:['caseId','amountPaisa','paymentReference','claimedAt','accountVersionId','evidenceReference','note'],
 claim_evidence:['caseId','claimId','evidenceReference','note'],
 review_claim:['caseId','claimId','decision','receiptId','receiptRevision','reviewDigest','evidenceReference','reason','publicMessage','nextReviewAt']};
const reference=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{3,190}$/.test(value);
const integer=(value:unknown,min=0):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min;
function invalid():never{throw new recovery.SellerRecoveryError('Use the current protected recovery form with exact amounts, source revision and required evidence.',400);}
export function parseRecoveryCommand(body:Record<string,unknown>,mode:RecoveryMode){
 const action=body.action as Action;
 if(body.sourceFormId!==(mode==='staff'?'system.recovery-finance':'system.recovery-seller')||!Object.hasOwn(handlers,action)||!reference(body.requestId)||Object.keys(body).some(key=>!['sourceFormId','action','requestId','expectedRevision','input'].includes(key))||!body.input||typeof body.input!=='object'||Array.isArray(body.input))invalid();
 if(['request_calculation_review','dispute','propose','claim','claim_evidence'].includes(action)!==(mode==='seller'))invalid();
 if(action==='open'?body.expectedRevision!==null:typeof body.expectedRevision!=='string'||!/^(0|[1-9]\d{0,15})$/.test(body.expectedRevision)||!Number.isSafeInteger(Number(body.expectedRevision)))invalid();
 const input=body.input as Record<string,unknown>;
 const correctionKeys=action==='correct'?['customerRefundReversalId','customerRefundReversalIds'].filter(key=>Object.hasOwn(input,key)):[];
 if(correctionKeys.length>1)invalid();
 if(correctionKeys[0]==='customerRefundReversalId'&&!reference(input.customerRefundReversalId))invalid();
 if(correctionKeys[0]==='customerRefundReversalIds'&&(!Array.isArray(input.customerRefundReversalIds)||input.customerRefundReversalIds.length===0||input.customerRefundReversalIds.length>100||input.customerRefundReversalIds.some(id=>!reference(id))||new Set(input.customerRefundReversalIds).size!==input.customerRefundReversalIds.length))invalid();
 const returnKeys=action==='receipt_reversal'?['completedReturns','companyLossApproved','reservedReturns'].filter(key=>Object.hasOwn(input,key)):[];
 if(action==='receipt_reversal'){
  if(Object.hasOwn(input,'completedReturns')!==Object.hasOwn(input,'companyLossApproved'))invalid();
  if(Object.hasOwn(input,'companyLossApproved')&&typeof input.companyLossApproved!=='boolean')invalid();
  for(const key of ['completedReturns','reservedReturns'])if(Object.hasOwn(input,key)){
   const rows=input[key],paid=key==='completedReturns',keys=paid?['receiptUseId','packetId','amountPaisa']:['receiptUseId','amountPaisa','originalPayerReturnedConfirmed'];
   if(!Array.isArray(rows)||rows.length>100||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==3||Object.keys(row).some(field=>!keys.includes(field))||!reference(row.receiptUseId)||!integer(row.amountPaisa,1)||(paid?!reference(row.packetId):typeof row.originalPayerReturnedConfirmed!=='boolean'))||new Set(rows.map(row=>row.receiptUseId)).size!==rows.length)invalid();
  }
 }
 const optionalKeys=[...correctionKeys,...returnKeys];
 if(Object.keys(input).length!==fields[action].length+optionalKeys.length||Object.keys(input).some(key=>!fields[action].includes(key)&&!optionalKeys.includes(key)))invalid();
 for(const key of fields[action]){
  const value=input[key];
  if(['claim','claim_evidence'].includes(action)&&['accountVersionId','evidenceReference'].includes(key)&&value===null)continue;
  if(action==='review_claim'&&['receiptId','receiptRevision','nextReviewAt'].includes(key)&&value===null)continue;
  if(key==='allocations'){
   if(!Array.isArray(value)||value.length>100||value.some(row=>!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==3||Object.keys(row).some(key=>!['allocationId','amountPaisa','companyLossApproved'].includes(key))||!reference(row.allocationId)||!integer(row.amountPaisa,1)||typeof row.companyLossApproved!=='boolean'))invalid();
  }else if(key==='candidate'){
   if(value===null&&action==='history')continue;
   if(typeof value!=='object'||Array.isArray(value)||!value)invalid();
   const candidate=value as Record<string,unknown>;
   if(Object.keys(candidate).length!==5||Object.keys(candidate).some(key=>!['kind','payoutId','scopeId','capacityPaisa','nativeProof'].includes(key))||!['registered_refund_group','managed_allocation','managed_legacy_group'].includes(String(candidate.kind))||!reference(candidate.payoutId)||!reference(candidate.scopeId)||!integer(candidate.capacityPaisa,1)||typeof candidate.nativeProof!=='boolean')invalid();
  }else if(['unallocatedPaisa','newUnpaidResponsibilityPaisa','newConfirmedPaisa','amountPaisa','receiptRevision','resolveDisputedPaisa','actualAt','claimedAt','nextReviewAt'].includes(key)){if(!integer(value,key==='amountPaisa'&&action!=='history'?1:0))invalid();}
  else if(key==='installments'){
   if(!Array.isArray(value)||value.length>60||value.some(i=>!i||typeof i!=='object'||Object.keys(i).length!==2||!Object.hasOwn(i,'amountPaisa')||!Object.hasOwn(i,'dueAt')||!integer(i.amountPaisa,1)||!integer(i.dueAt,1)))invalid();
  }else if(key==='termsAccepted'||key==='nettingAuthorized'||key==='noFundsRemainSentConfirmed'||key==='originalCostReimbursementConfirmed'||key==='originalUnpaidCostConfirmed'||key==='originalPayoutReturnConfirmed'){if(typeof value!=='boolean'||(key==='termsAccepted'||key==='noFundsRemainSentConfirmed'||key==='originalCostReimbursementConfirmed'||key==='originalUnpaidCostConfirmed'||key==='originalPayoutReturnConfirmed')&&!value)invalid();}
  else if(key==='kind'){if(value!=='refund'&&value!=='supplier_adjustment')invalid();}
  else if(key==='method'){if(!['cash','returned_payout','carrier'].includes(String(value)))invalid();}
  else if(key==='decision'){if(!(action==='review_proposal'?['changes_requested','rejected']:['needs_evidence','receipt_verified','not_received']).includes(String(value)))invalid();}
  else if(key==='reviewDigest'||key==='termsDigest'){if(typeof value!=='string'||! /^[a-f0-9]{64}$/.test(value))invalid();}
  else if(key==='evidenceReference'&&['dispute','request_calculation_review'].includes(action)&&value===null)continue;
  else{const min=['reason','collectionAttempts','publicMessage','note'].includes(key)?10:key==='evidenceReference'?8:key==='contactDetails'?5:1,max=key==='contactDetails'?1000:['reason','collectionAttempts','evidenceReference','publicMessage','note'].includes(key)?1500:191;if(typeof value!=='string'||value.trim().length<min||value.length>max)invalid();}
 }
 return {action,requestId:body.requestId as string,expectedRevision:body.expectedRevision as string|null,input};
}
export async function runRecoveryCommand(db:D1Database,actorId:string,body:Record<string,unknown>,mode:RecoveryMode,environment?:RuntimeEnvironment){
 const command=parseRecoveryCommand(body,mode),ctx:CommandContext={actorId,requestId:command.requestId,expectedRevision:command.expectedRevision,now:Date.now()};
 const run=handlers[command.action] as (db:D1Database,ctx:CommandContext,input:never)=>Promise<unknown>;
 const result=await run(db,ctx,{...command.input,...environment!==undefined&&['receipt_reversal','company_history','carrier_unpaid','payout_return','partial_source','carrier','correct_unpaid','refresh_source','retire_payout','unpaid_source','compensate_source','history','receipt','absorb','earnings','correct'].includes(command.action)?{environment}:{}} as never);
 if(command.action==='receipt_reversal'){const review=await getRecoveryReceiptReversalReview(db,actorId,String(command.input.reversalId));for(const affected of review.cases){await ensureRecoveryReviewWork(db,affected.case.id);await ensureRecoveryContactWork(db,affected.case.id);}return result;}
 const caseId=command.action==='open'?(result as {id:string}).id:String(command.input.caseId);
 // The financial command is already retained if queue repair fails; exact outcome recovery never repeats its money.
 await ensureRecoveryReviewWork(db,caseId);await ensureRecoveryContactWork(db,caseId);
 if(['claim','review_claim','claim_evidence'].includes(command.action))await ensureRecoveryRepaymentWork(db,(result as {claimId:string}).claimId);
 return result;
}
class AuthorityError extends recovery.SellerRecoveryError{constructor(message:string){super(message,403);}}
export async function recoverRecoveryCommand(db:D1Database,actorId:string,attempt:string,mode:RecoveryMode){
 if(!reference(attempt))invalid();
 if(mode==='staff')await staffMutationGuard(db,actorId,'payout.prepare',AuthorityError);
 const saved=await db.prepare(`SELECT action,subject_type AS subjectType,subject_id AS subjectId,command_result_json AS result FROM audit_logs WHERE actor_id=? AND request_id=? AND action LIKE 'seller.recovery.%' AND command_key IS NOT NULL`).bind(actorId,attempt).first<{action:string;subjectType:string;subjectId:string;result:string}>();
 if(!saved)return null;
 const action=saved.action.slice('seller.recovery.'.length),sellerAction=['calculation_review_requested','disputed','plan_proposed','claim_submitted','claim_evidence_supplied'].includes(action);
 if(sellerAction!==(mode==='seller'))return null;
 if(saved.subjectType==='recovery_receipt_reversal'){if(mode!=='staff'||action!=='receipt_reversal_reconciled')return null;await getRecoveryReceiptReversalReview(db,actorId,saved.subjectId);return JSON.parse(saved.result) as {id:string};}
 const result=JSON.parse(saved.result) as {id:string},caseId=saved.subjectType==='seller_recovery_source'?result.id:saved.subjectId;
 if(mode==='seller')await recovery.readOwnedSellerRecovery(db,actorId,caseId);
 else{
  const permission=['repayment_attributed','carrier_unpaid_reconciled','payout_return_reconciled','carrier_reconciled','receipt_allocated','claim_receipt_verified'].includes(action)?'payment.receipt.verify':['calculation_review_answered','partial_source_reviewed','unpaid_responsibility_corrected','zero_source_reviewed','payout_source_retired','unpaid_source_reviewed','source_compensated','company_history_reviewed','history_reviewed','plan_reviewed','liability_corrected','approved','absorbed','plan_approved','dispute_upheld'].includes(action)?'payout.approve':'payout.prepare';
  const authority=await staffMutationGuard(db,actorId,permission,AuthorityError,['repayment_attributed','carrier_unpaid_reconciled','payout_return_reconciled','calculation_review_answered','partial_source_reviewed','carrier_reconciled','unpaid_responsibility_corrected','zero_source_reviewed','payout_source_retired','unpaid_source_reviewed','source_compensated','company_history_reviewed','history_reviewed','plan_reviewed','liability_corrected','receipt_allocated','claim_receipt_verified','approved','absorbed','plan_approved','dispute_upheld'].includes(action)?'super_admin':undefined);
  await recovery.getSellerRecoveryReview(db,actorId,caseId);await db.batch(authority.statements);
 }
 return result;
}
