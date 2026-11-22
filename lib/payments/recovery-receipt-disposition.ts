import {prepareReceiptReturnBankSatisfactions,receiptReturnBankSatisfactionHistoryStatements,readReceiptReturnBankSatisfactionCandidates,bankSatisfiedReceiptUseSql} from './receipt-return-bank-satisfaction';
import {prepareReceiptReturnBankLosses,receiptReturnBankLossHistoryStatements,readReceiptReturnBankLossCandidates,completedReceiptReturnProofSql,completedReceiptReturnLossSql,completedReturnUseLossSql} from './receipt-return-bank-loss';
import {actualManualReceiptUseSql} from './receipt-use-accounting';
import {CUSTOMER_REFUND_REVERSAL_BLOCKER} from './customer-refund-reversal';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {ManualPaymentError} from './manual-receipts';
import {getSellerRecoveryReview,nativeSourceGuards,recoveryExecutionGate} from './seller-recovery';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {paymentGuard} from './manual-receipts';
import {RECOVERY_RECEIPT_REVERSAL_BLOCKER,pendingRecoveryReceiptReversalSql,actualRecoveryAllocationSql} from './recovery-receipt-accounting';
import {financeEvidenceReferenceGuards} from './refund-evidence';
import {responseScopeContains} from '../orders/response-sql';
import {recoveryNoticeStatements} from './recovery-notices';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import type {RuntimeEnvironment} from '../staging/environment';

class ReversalAuthorityError extends ManualPaymentError{constructor(message:string){super(message,403);}}

/** Exact allocation arithmetic for a real, independently recorded incoming-bank
 * reversal. This cannot record a reversal or move money. A caller must bind its
 * current receipt, allocation, restoration, original liability and authority. */
export function recoveryReceiptReversalAmounts(input:{originalAllocatedPaisa:number;alreadyReversedPaisa:number;currentlyRestoredPaisa:number;reversedPaisa:number;companyLossApproved:boolean}){
 if(typeof input.companyLossApproved!=='boolean')throw new Error('Record an explicit company-loss decision.');
 const amount=(value:number)=>{if(!Number.isSafeInteger(value)||value<0)throw new Error('Use exact nonnegative reversal amounts.');return BigInt(value);};
 const original=amount(input.originalAllocatedPaisa),prior=amount(input.alreadyReversedPaisa),restored=amount(input.currentlyRestoredPaisa),reversed=amount(input.reversedPaisa),zero=BigInt(0);
 if(prior>original||restored>original-prior||reversed<=zero||reversed>original-prior)throw new Error('Reconcile the original allocation and its remaining actual receipt before attribution.');
 const actual=original-prior-reversed,cover=restored>actual?restored-actual:zero;
 if(cover>zero&&!input.companyLossApproved)throw new Error('An already restored portion requires an explicit company-loss decision before completing this attribution.');
 return {actualAllocatedPaisa:Number(actual),restoredPaisa:Number(restored-cover),restorationReclassifiedPaisa:Number(cover),companyLossPaisa:Number(cover),nativeSettlementDebitPaisa:Number(reversed),nativeCompanyCreditPaisa:Number(cover),reopenedOriginalPaisa:Number(reversed-cover)};
}

/** A return can coexist with a recovery-only reversal without changing its
 * outgoing outcome. These are retained original-payer obligations, never free cash. */
function unaffectedOriginalPayerReturnSql(use:string,receipt:string){return `${use}.kind='return' AND EXISTS(SELECT 1 FROM refund_obligations original_return WHERE original_return.id=${use}.target_id AND original_return.source_kind='receipt_return' AND original_return.source_id=${receipt}.id AND original_return.receipt_id=${receipt}.id AND original_return.receipt_use_id=${use}.id AND original_return.customer_id=${receipt}.payer_user_id AND original_return.currency='NPR' AND original_return.cash_paisa=${use}.amount_minor AND original_return.wallet_paisa=0
 AND (${use}.state='reserved' AND original_return.state IN('open','processing','uncertain') AND NOT EXISTS(SELECT 1 FROM outgoing_payment_packets paid WHERE paid.obligation_id=original_return.id AND paid.state='paid')
 OR ${use}.state='returned' AND original_return.state='completed' AND (${bankSatisfiedReceiptUseSql(use)}=${use}.amount_minor OR EXISTS(SELECT 1 FROM outgoing_payment_packets paid WHERE ${completedReceiptReturnProofSql(use,receipt,'paid','original_return')}))))`;}

/** Restricted Finance review of actual bank evidence and every affected original
 * recovery. Receipt and case revisions are retained for the eventual decision. */
export async function getRecoveryReceiptReversalReview(db:D1Database,actorId:string,reversalId:string){
 const authority=await staffMutationGuard(db,actorId,'payment.receipt.verify',ReversalAuthorityError,'super_admin');
 const reversal=await db.prepare(`SELECT v.id,v.receipt_id receiptId,v.amount_minor amountPaisa,v.bank_at bankAt,v.source_identity_hash identityHash,
  r.account_version_id accountVersionId,r.amount_minor receiptAmountPaisa,r.currency,r.kind,r.status,r.payer_user_id payerId,control.revision receiptRevision
  FROM company_receipt_reversals v JOIN company_money_receipts r ON r.id=v.receipt_id JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE v.id=?`).bind(reversalId).first<{id:string;receiptId:string;amountPaisa:number;bankAt:number;identityHash:string;accountVersionId:string;receiptAmountPaisa:number;currency:string;kind:string;status:string;payerId:string|null;receiptRevision:number}>();
 if(!reversal)throw new ManualPaymentError('Open the actual recorded receipt reversal.',404);
 const conflict=`NOT EXISTS(SELECT 1 FROM company_receipt_conflicts WHERE receipt_id=? AND user_id=?)`;
 if(reversal.payerId===actorId||!await db.prepare('SELECT 1 WHERE '+conflict).bind(reversal.receiptId,actorId).first())throw new ReversalAuthorityError('An eligible Super Admin without a personal receipt interest must review its allocation.');
 const accountConflict=`EXISTS(SELECT 1 FROM company_payment_account_versions v WHERE v.id=? AND NOT ${responseScopeContains(db,'v.conflicts_json','?')})`;
 if(!await db.prepare('SELECT 1 WHERE '+accountConflict).bind(reversal.accountVersionId,actorId).first())throw new ReversalAuthorityError('Use an eligible reviewer without a personal interest in the original company account.');
 const returnAccountConflict=`NOT EXISTS(SELECT 1 FROM refund_obligations original_return JOIN outgoing_payment_packets prior ON prior.obligation_id=original_return.id JOIN company_payment_account_versions account ON account.id=prior.account_version_id WHERE original_return.source_kind='receipt_return' AND original_return.source_id=? AND original_return.receipt_id=? AND ${responseScopeContains(db,'account.conflicts_json','?')})`;
 const returnAccountValues=[reversal.receiptId,reversal.receiptId,actorId];
 if(!await db.prepare('SELECT 1 WHERE '+returnAccountConflict).bind(...returnAccountValues).first())throw new ReversalAuthorityError('Use an eligible reviewer without a personal interest in any retained outgoing company account for this original payer return.');
 const returnedCustomerConflict=`NOT EXISTS(SELECT 1 FROM customer_refund_reversals returned JOIN refund_obligations original ON original.id=returned.obligation_id JOIN seller_recovery_cases linked ON linked.refund_id=original.source_id JOIN seller_profiles seller ON seller.id=linked.seller_id LEFT JOIN refunds original_refund ON original_refund.id=linked.refund_id LEFT JOIN orders current_order ON current_order.id=original_refund.order_id WHERE returned.receipt_id=? AND original.source_kind='return_refund' AND (seller.user_id=? OR json_extract(linked.original_source_json,'$.ownerId')=? OR json_extract(linked.original_source_json,'$.customerId')=? OR original.customer_id=? OR current_order.customer_id=?))`;
 const returnedCustomerValues=[reversal.receiptId,actorId,actorId,actorId,actorId,actorId];
 if(!await db.prepare('SELECT 1 WHERE '+returnedCustomerConflict).bind(...returnedCustomerValues).first())throw new ReversalAuthorityError('An eligible operator without a current or retained personal interest in the original returned customer refund must review this bank reversal.');
 const allocations=(await db.prepare(`SELECT id allocationId,case_id caseId,method,amount_paisa amountPaisa,registered_credit_id registeredCreditId,managed_credit_id managedCreditId,fixed_credit_id fixedCreditId,(SELECT obligation_id FROM managed_supplier_recovery_credits fixed WHERE fixed.id=seller_recovery_allocations.fixed_credit_id) fixedObligationId FROM seller_recovery_allocations WHERE receipt_id=? ORDER BY case_id,id`).bind(reversal.receiptId).all<{allocationId:string;caseId:string;method:string;amountPaisa:number;registeredCreditId:string|null;managedCreditId:string|null;fixedCreditId:string|null;fixedObligationId:string|null}>()).results;
 const cases=[];for(const id of new Set(allocations.map(a=>a.caseId))){
  const current=await getSellerRecoveryReview(db,actorId,id),event=await db.prepare("SELECT details_json details FROM seller_recovery_events WHERE case_id=? AND action='receipt_reversal_review' AND json_extract(details_json,'$.reversalId')=? ORDER BY revision DESC LIMIT 1").bind(id,reversalId).first<{details:string}>();
  const history=event?JSON.parse(event.details) as {previousBlocker?:string|null}:null,previousBlocker=current.case.blocker!==RECOVERY_RECEIPT_REVERSAL_BLOCKER?current.case.blocker:history?.previousBlocker??null;
  cases.push({...current,previousBlocker});
 }
 const previousReviews=(await db.prepare('SELECT id,reversal_id reversalId,state,amount_paisa amountPaisa,unallocated_paisa unallocatedPaisa FROM seller_recovery_receipt_reversal_reviews WHERE receipt_id=? ORDER BY created_at,id').bind(reversal.receiptId).all<{id:string;reversalId:string;state:string;amountPaisa:number;unallocatedPaisa:number}>()).results;
 const previousParts=(await db.prepare(`SELECT part.id,part.allocation_id allocationId,part.amount_paisa amountPaisa,part.company_loss_paisa companyLossPaisa,review.state FROM seller_recovery_receipt_reversal_parts part JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id WHERE review.receipt_id=? ORDER BY part.id`).bind(reversal.receiptId).all<{id:string;allocationId:string;amountPaisa:number;companyLossPaisa:number;state:string}>()).results;
 const restorations=(await db.prepare(`SELECT restored.id,restored.case_id caseId,restored.allocation_id allocationId,restored.amount_paisa amountPaisa FROM seller_recovery_all_restorations restored JOIN seller_recovery_allocations a ON a.id=restored.allocation_id WHERE a.receipt_id=? ORDER BY restored.id`).bind(reversal.receiptId).all<{id:string;caseId:string;allocationId:string;amountPaisa:number}>()).results;
 const otherUses=(await db.prepare(`SELECT u.id,u.kind,u.target_id targetId,u.amount_minor amountPaisa,u.state,u.revision,${actualManualReceiptUseSql('u')} AS backingPaisa,${completedReturnUseLossSql('u.id')} AS completedReturnLossPaisa,${bankSatisfiedReceiptUseSql('u')} AS bankSatisfiedPaisa,(${unaffectedOriginalPayerReturnSql('u','r')}) AS unaffectedReturn FROM manual_receipt_uses u JOIN company_money_receipts r ON r.id=u.receipt_id WHERE u.receipt_id=? AND u.state<>'released' ORDER BY u.id`).bind(reversal.receiptId).all<{id:string;kind:string;targetId:string;amountPaisa:number;state:string;revision:number;backingPaisa:number;completedReturnLossPaisa:number;bankSatisfiedPaisa:number;unaffectedReturn:number}>()).results;
 const completedReturnCandidates=await readReceiptReturnBankLossCandidates(db,reversal.receiptId);
 const reservedReturnCandidates=await readReceiptReturnBankSatisfactionCandidates(db,reversal.receiptId);
 const previousReturnedLossPaisa=(await db.prepare(`SELECT ${completedReceiptReturnLossSql('?')} AS amount`).bind(reversal.receiptId).first<{amount:number}>())!.amount;
 const data={reversal,allocations,cases,previousReviews,previousParts,restorations,otherUses,completedReturnCandidates,reservedReturnCandidates,previousReturnedLossPaisa};
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));
 await db.batch([...authority.statements,...paymentGuard(db,conflict,[reversal.receiptId,actorId]),...paymentGuard(db,accountConflict,[reversal.accountVersionId,actorId]),...paymentGuard(db,returnAccountConflict,returnAccountValues),...paymentGuard(db,returnedCustomerConflict,returnedCustomerValues)]);
 return {...data,receiptRevision:reversal.receiptRevision,reviewDigest:Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')};
}

export interface RecoveryReceiptReversalInput {
 reversalId:string;reviewDigest:string;unallocatedPaisa:number;
 allocations:{allocationId:string;amountPaisa:number;companyLossApproved?:boolean}[];
 completedReturns?:{receiptUseId:string;packetId:string;amountPaisa:number}[];companyLossApproved?:boolean;
 reservedReturns?:{receiptUseId:string;amountPaisa:number;originalPayerReturnedConfirmed:boolean}[];
 evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment;
}
/** Attribute actual reversed money without deleting original receipt or allocation facts. */
export async function reconcileRecoveryReceiptReversal(db:D1Database,ctx:CommandContext,input:RecoveryReceiptReversalInput){
 const authority=await staffMutationGuard(db,ctx.actorId,'payment.receipt.verify',ReversalAuthorityError,'super_admin');
 const review=await getRecoveryReceiptReversalReview(db,ctx.actorId,input.reversalId);
 for(const affected of review.cases)await recoveryExecutionGate(db,affected.source,input.environment);
 const identity={action:'seller.recovery.receipt_reversal_reconciled',subjectType:'recovery_receipt_reversal',subjectId:input.reversalId};
 const read=()=>commandReceipt(db,ctx,identity,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;receiptId:string;revision:number};
 if(ctx.expectedRevision!==String(review.receiptRevision)||input.reviewDigest!==review.reviewDigest)throw new ManualPaymentError('Refresh the actual reversal, original allocations and every affected recovery before deciding.');
 const exact=(n:number)=>{if(!Number.isSafeInteger(n)||n<0)throw new ManualPaymentError('Use exact nonnegative amounts in paisa.',400);return BigInt(n);};
 if(!Array.isArray(input.allocations)||input.allocations.length>100||new Set(input.allocations.map(a=>a.allocationId)).size!==input.allocations.length)throw new ManualPaymentError('Identify each original allocation once.',400);
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new ManualPaymentError('Record the actual evidence, independent decision and owner explanation.',400);
 if(review.reversal.kind!=='bank_credit'||review.reversal.currency!=='NPR'||review.previousReviews.some(r=>r.state!=='completed'||r.reversalId===input.reversalId))throw new ManualPaymentError('Reconcile the original receipt, other payment uses and any unfinished attribution first.');
 const unallocated=exact(input.unallocatedPaisa),previousUnallocated=review.previousReviews.reduce((n,r)=>n+BigInt(r.unallocatedPaisa),BigInt(0));
 const originalUnallocated=BigInt(review.reversal.receiptAmountPaisa)-review.allocations.reduce((n,a)=>n+BigInt(a.amountPaisa),BigInt(0))-review.otherUses.reduce((n,use)=>n+exact(use.amountPaisa),BigInt(0))-previousUnallocated;
 if(unallocated>originalUnallocated)throw new ManualPaymentError('The reversal attribution exceeds the retained unallocated original receipt.');
 const parts=input.allocations.map(proposed=>{
  const original=review.allocations.find(a=>a.allocationId===proposed.allocationId);if(!original)throw new ManualPaymentError('Use an allocation belonging to this original receipt.');
  const affected=review.cases.find(c=>c.case.id===original.caseId)!;
  if((affected.source.blocker&&affected.source.blocker!==CUSTOMER_REFUND_REVERSAL_BLOCKER)||affected.source.confirmedPaisa!==affected.case.confirmedPaisa||affected.source.historicalNettingPaisa!==affected.case.historicalRecoveredPaisa)throw new ManualPaymentError('Resolve changed original responsibility before attributing this bank reversal.');
  if(proposed.companyLossApproved!==undefined&&typeof proposed.companyLossApproved!=='boolean')throw new ManualPaymentError('Record an explicit company-loss decision.',400);
  const prior=review.previousParts.filter(p=>p.allocationId===original.allocationId).reduce((n,p)=>n+p.amountPaisa,0),restored=review.restorations.filter(r=>r.allocationId===original.allocationId).reduce((n,r)=>n+r.amountPaisa,0);
  let amounts:ReturnType<typeof recoveryReceiptReversalAmounts>;
  try{amounts=recoveryReceiptReversalAmounts({originalAllocatedPaisa:original.amountPaisa,alreadyReversedPaisa:prior,currentlyRestoredPaisa:restored,reversedPaisa:proposed.amountPaisa,companyLossApproved:proposed.companyLossApproved===true});}catch(error){throw new ManualPaymentError((error as Error).message,400);}
  let needed=amounts.restorationReclassifiedPaisa;
  const reclassifications=review.restorations.filter(r=>r.allocationId===original.allocationId).flatMap(r=>{const amount=Math.min(needed,r.amountPaisa);needed-=amount;return amount?[{id:crypto.randomUUID(),restorationId:r.id,amountPaisa:amount}]:[];});
  if(needed)throw new ManualPaymentError('Refresh the original restored allocation amounts.');
  return {id:crypto.randomUUID(),allocationId:original.allocationId,caseId:original.caseId,caseRevision:affected.case.revision,model:affected.source.model,amountPaisa:proposed.amountPaisa,...amounts,reclassifications,companyLossApproved:proposed.companyLossApproved===true,
   registeredDebitId:affected.source.model==='registered'?crypto.randomUUID():null,managedDebitId:affected.source.model==='managed'?crypto.randomUUID():null,fixedObligationId:original.fixedObligationId,
   registeredCompanyCreditId:amounts.companyLossPaisa&&affected.source.model==='registered'?crypto.randomUUID():null,managedCompanyCreditId:amounts.companyLossPaisa&&affected.source.model==='managed'?crypto.randomUUID():null};
 });
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id,receiptId:review.reversal.receiptId,revision:review.receiptRevision+1};
 const returnLosses=await prepareReceiptReturnBankLosses(db,ctx,{reviewId:id,reversalId:input.reversalId,completedReturns:input.completedReturns,companyLossApproved:input.companyLossApproved});
 const returnSatisfactions=await prepareReceiptReturnBankSatisfactions(db,ctx,{reviewId:id,reversalId:input.reversalId,reservedReturns:input.reservedReturns});
 const affectedReturnIds=[...returnLosses.parts,...returnSatisfactions.parts].map(part=>part.receiptUseId);
 const untouchedUses=review.otherUses.filter(use=>!affectedReturnIds.includes(use.id));
 if(untouchedUses.some(use=>!use.unaffectedReturn))throw new ManualPaymentError('Reconcile unsupported receipt uses or their actual outgoing outcomes before attributing this reversal.');
 if(parts.reduce((sum,p)=>sum+exact(p.amountPaisa),unallocated)+exact(returnLosses.amountPaisa)+exact(returnSatisfactions.amountPaisa)!==BigInt(review.reversal.amountPaisa))throw new ManualPaymentError('Attribute exactly the actual bank reversal, including its separately unallocated portion.');
 const unaffectedGuards:D1PreparedStatement[]=[];
 if(review.otherUses.length){
  const recoveredReversalPaisa=parts.reduce((sum,part)=>sum+part.amountPaisa,0)+returnLosses.amountPaisa+returnSatisfactions.amountPaisa;
  const coverage=`EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=? AND r.amount_minor-COALESCE((SELECT SUM(done.amount_paisa) FROM seller_recovery_receipt_reversal_reviews done WHERE done.receipt_id=r.id AND done.state='completed'),0)-?-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0)+?-COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)>=0)`;
  const values=[review.reversal.receiptId,review.reversal.amountPaisa,recoveredReversalPaisa];
  unaffectedGuards.push(...paymentGuard(db,"(SELECT COUNT(*) FROM manual_receipt_uses u WHERE u.receipt_id=? AND u.state<>'released')=?",[review.reversal.receiptId,review.otherUses.length]));
  if(!await db.prepare('SELECT 1 WHERE '+coverage).bind(...values).first())throw new ManualPaymentError('The exact original-payer return remains reserved or paid. This reversal cannot overlap it or leave its retained amount uncovered.');
  unaffectedGuards.push(...paymentGuard(db,coverage,values));
  for(const use of untouchedUses){
   unaffectedGuards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM manual_receipt_uses u WHERE u.id=? AND u.receipt_id=? AND u.revision=? AND u.state=? AND u.kind='return' AND u.target_id=? AND u.amount_minor=?)`,[use.id,review.reversal.receiptId,use.revision,use.state,use.targetId,use.amountPaisa]));
   // Compile only the snapshotted proof branch. Combining every historical
   // paid/direct/reserved alternative exceeds native D1's expression-depth cap.
   const origin=`original_return.source_kind='receipt_return' AND original_return.source_id=r.id AND original_return.receipt_id=r.id AND original_return.receipt_use_id=u.id AND original_return.customer_id=r.payer_user_id AND original_return.currency='NPR' AND original_return.cash_paisa=u.amount_minor AND original_return.wallet_paisa=0`;
   const proof=use.state==='reserved'
    ?`EXISTS(SELECT 1 FROM manual_receipt_uses u JOIN company_money_receipts r ON r.id=u.receipt_id JOIN refund_obligations original_return ON original_return.id=u.target_id WHERE u.id=? AND ${origin} AND original_return.state IN('open','processing','uncertain') AND NOT EXISTS(SELECT 1 FROM outgoing_payment_packets paid WHERE paid.obligation_id=original_return.id AND paid.state='paid'))`
    :use.bankSatisfiedPaisa===use.amountPaisa
     ?`EXISTS(SELECT 1 FROM manual_receipt_uses u JOIN company_money_receipts r ON r.id=u.receipt_id JOIN refund_obligations original_return ON original_return.id=u.target_id WHERE u.id=? AND ${origin} AND original_return.state='completed' AND ${bankSatisfiedReceiptUseSql('u')}=u.amount_minor)`
     :`EXISTS(SELECT 1 FROM manual_receipt_uses u JOIN company_money_receipts r ON r.id=u.receipt_id JOIN refund_obligations original_return ON original_return.id=u.target_id JOIN outgoing_payment_packets paid ON paid.obligation_id=original_return.id WHERE u.id=? AND ${completedReceiptReturnProofSql('u','r','paid','original_return')})`;
   unaffectedGuards.push(...paymentGuard(db,proof,[use.id]));
  }
 }

 const evidence=await financeEvidenceReferenceGuards(db,input.evidenceReference,{kind:'company_account',id:review.reversal.accountVersionId});
 const statements=[...authority.statements,...evidence,...returnLosses.guards,...returnSatisfactions.guards,...unaffectedGuards,...review.cases.flatMap(c=>nativeSourceGuards(db,c.source)),
  db.prepare(`INSERT INTO seller_recovery_receipt_reversal_reviews(id,reversal_id,receipt_id,receipt_revision,state,amount_paisa,unallocated_paisa,source_json,plan_json,actor_id,request_id,created_at,evidence_reference,reason,public_message)
   VALUES(?,?,?,?,'planned',?,?,?,?,?,?,${clock},?,?,?)`).bind(id,input.reversalId,review.reversal.receiptId,review.receiptRevision,review.reversal.amountPaisa,input.unallocatedPaisa,JSON.stringify(review),JSON.stringify({parts,returnLosses:returnLosses.parts,returnSatisfactions:returnSatisfactions.parts,companyLossApproved:input.companyLossApproved===true}),ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage),
  db.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=? AND revision=?').bind(review.reversal.receiptId,review.receiptRevision),...paymentGuard(db,'changes()=1'),...returnLosses.inserts,...returnSatisfactions.inserts];
 for(const part of parts){
  const original=review.allocations.find(a=>a.allocationId===part.allocationId)!,affected=review.cases.find(c=>c.case.id===part.caseId)!;
  if(part.model==='registered'){
   for(const entry of [{id:part.registeredDebitId,amount:-part.amountPaisa,type:'recovery_receipt_reversal'},...(part.registeredCompanyCreditId?[{id:part.registeredCompanyCreditId,amount:part.companyLossPaisa,type:'recovery_bank_loss'}]:[])])statements.push(db.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,type,amount_paisa,available_at,description,created_at) VALUES(?,?,?,?,?,${clock},?,${clock})`).bind(entry.id,affected.source.sellerId,affected.source.orderItemId,entry.type,entry.amount,'Original recovery receipt reversal '+part.id));
  }else if(part.model==='managed'){
   for(const entry of [{id:part.managedDebitId,amount:-part.amountPaisa,type:'recovery_receipt_reversal'},...(part.managedCompanyCreditId?[{id:part.managedCompanyCreditId,amount:part.companyLossPaisa,type:'recovery_bank_loss'}]:[])])statements.push(db.prepare(`INSERT INTO managed_settlement_entries(id,entitlement_id,refund_id,type,amount_paisa,metadata_json,reason_code,request_id,created_by,created_at) SELECT ?,original.entitlement_id,original.refund_id,'dispute_adjustment',?,?,?,?,?,${clock} FROM managed_settlement_entries original WHERE original.id=?`).bind(entry.id,entry.amount,JSON.stringify({caseId:part.caseId,reviewId:id,partId:part.id,allocationId:part.allocationId}),entry.type,entry.id,ctx.actorId,original.managedCreditId),...paymentGuard(db,'changes()=1'));
  }
  statements.push(db.prepare(`INSERT INTO seller_recovery_receipt_reversal_parts(id,review_id,case_id,case_revision,allocation_id,amount_paisa,company_loss_paisa,registered_debit_id,managed_debit_id,fixed_obligation_id,registered_company_credit_id,managed_company_credit_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(part.id,id,part.caseId,part.caseRevision,part.allocationId,part.amountPaisa,part.companyLossPaisa,part.registeredDebitId,part.managedDebitId,part.fixedObligationId,part.registeredCompanyCreditId,part.managedCompanyCreditId));
  for(const restored of part.reclassifications)statements.push(db.prepare('INSERT INTO seller_recovery_restoration_reclassifications(id,part_id,restoration_id,amount_paisa) VALUES(?,?,?,?)').bind(restored.id,part.id,restored.restorationId,restored.amountPaisa));
 }
 statements.push(db.prepare(`UPDATE seller_recovery_receipt_reversal_reviews SET state='completed',completed_at=${clock} WHERE id=? AND state='planned'`).bind(id),...paymentGuard(db,'changes()=1'));
 for(const affected of review.cases){
  const reclassified=parts.filter(p=>p.caseId===affected.case.id).reduce((n,p)=>n+p.restorationReclassifiedPaisa,0);
  const pending=`EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=seller_recovery_cases.id AND a.receipt_id IS NOT NULL AND ${pendingRecoveryReceiptReversalSql('a.receipt_id')})`;
  const remaining=`confirmed_paisa-absorbed_paisa-historical_recovered_paisa+restored_paisa-${reclassified}-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.case_id=seller_recovery_cases.id),0)`;
  statements.push(db.prepare(`UPDATE seller_recovery_cases SET state=CASE WHEN ${pending} OR ? IS NOT NULL THEN 'reconciliation' WHEN confirmed_paisa=0 THEN 'closed_no_balance' WHEN absorbed_paisa=confirmed_paisa THEN 'absorbed' WHEN ${remaining}=0 THEN 'recovered' WHEN disputed_paisa>0 THEN 'disputed' WHEN json_extract(plan_json,'$.proposalId') IS NOT NULL THEN 'repayment_plan' ELSE 'open' END,
   blocker=CASE WHEN ${pending} THEN blocker ELSE ? END,restored_paisa=restored_paisa-?,revision=revision+1,next_action_at=${clock}+86400000,updated_at=${clock} WHERE id=? AND revision=?`).bind(affected.previousBlocker,affected.previousBlocker,reclassified,affected.case.id,affected.case.revision),...paymentGuard(db,'changes()=1'),
   db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'receipt_reversal_reconciled',?,?,?,?,${clock})`).bind(crypto.randomUUID(),affected.case.id,affected.case.revision+1,ctx.actorId,input.reason,JSON.stringify({reviewId:id,receiptId:review.reversal.receiptId,reversalId:input.reversalId,publicMessage:input.publicMessage}),ctx.requestId+':'+affected.case.id),
   ...await recoveryNoticeStatements(db,{...ctx,requestId:ctx.requestId+':'+affected.case.id},affected.case.id,'receipt_reversal_reconciled',input.publicMessage));
 }
 statements.push(...await receiptReturnBankLossHistoryStatements(db,ctx,returnLosses.parts),...await receiptReturnBankSatisfactionHistoryStatements(db,ctx,returnSatisfactions.parts));
 const exceptionEvent=ctx.requestId+':receipt-resolved';
 statements.push(db.prepare(`UPDATE manual_payment_exceptions SET state='resolved',revision=revision+1,updated_at=${clock},last_event_id=? WHERE receipt_id=? AND order_id IS NULL AND kind='receipt_reversal' AND state<>'resolved' AND NOT ${pendingRecoveryReceiptReversalSql('manual_payment_exceptions.receipt_id')}`).bind(exceptionEvent,review.reversal.receiptId));
 statements.push(...authority.statements,receipt.insert(result));
 try{await db.batch(statements);}catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}
 return result;
}
