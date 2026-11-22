import {actualManualReceiptUseSql} from './receipt-use-accounting';
import {customerRefundReversalPendingSql,CUSTOMER_REFUND_REVERSAL_BLOCKER,customerRefundCorrectionDisposition} from './customer-refund-reversal';
import {recoveryRepaymentCashGuard} from './recovery-repayment-attribution';
import {actualRecoveryAllocationSql,verifiedRecoveryReceiptSql,pendingRecoveryReceiptReversalSql} from './recovery-receipt-accounting';
import {readPaidOriginalBasis,type PaidOriginalBasis} from './recovery-partial-paid-source';
import {carrierUnpaidAvailableSql,carrierUnpaidDispositionPendingSql} from './recovery-carrier-unpaid';
import {readOriginalRecoveryPayoutSources,type OriginalRecoveryPayoutSource} from './recovery-original-payouts';
import {incomingRecoveryDisposition} from './recovery-incoming-disposition';
import {returnedPayoutDispositionPendingSql} from './recovery-returned-payout';
import {readRecoveryCalculationReviews} from './recovery-calculation-reviews';
import {readPartialUnpaidSource,originalUnpaidCapacitySql,type PartialUnpaidSource} from './recovery-partial-source';
import {carrierRecoveryDisposition,carrierDispositionPendingSql} from './recovery-carrier';
import {operationalNotificationRequestId} from '../operations/event-catalog';
import {readUnpaidRecoverySource,type UnpaidRecoverySource} from './recovery-unpaid-source';
import {readRecoveryPayoutRetirements,recoveryPayoutModels,retiredRecoveryPayoutSql,type RecoveryPayoutRetirement} from './recovery-payout-retirement';
import {managedRefundResponsibilityStatements} from '../managed-commerce/refund-responsibility';
import {readHistoricalRecoveryState,historicalRecoveryCandidatesSql,type HistoricalRecoveryState,type HistoricalRecoveryCandidate} from './recovery-historical';
import {recoveryLiabilityCorrection} from './recovery-liability-correction';
import {readRecoveryArrangement} from './recovery-arrangements';
import {recoverySourceDispositionSql,recoveryDispositionBindings} from './recovery-source-disposition';
import type {PayoutModel} from './payout-transfer-types';
import {staffMutationGuard,staffReadGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {paymentGuard} from './manual-receipts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {financeEvidenceReferenceGuards} from './refund-evidence';
import {recoveryNoticeStatements} from './recovery-notices';
import {verifiedIdentitySql,noRecoveryIdentityHoldSql} from '../sellers/protected-change-policy';
import {readModelRecoveryEarnings,modelRecoveryNettingStatements,managedRecoveryCaseCohortSql} from './recovery-earnings-models';
import {assertSimulationAllowed,type RuntimeEnvironment} from '../staging/environment';
import {recoveryNativeSettlementStatements} from './recovery-native-settlement';
import {pendingRecoveryDisputes} from './recovery-disputes';

export class SellerRecoveryError extends Error {constructor(message:string,readonly status=409){super(message);}}
function money(value:number){if(!Number.isSafeInteger(value)||value<0)throw new SellerRecoveryError('Use an exact nonnegative amount within the supported range.');return BigInt(value);}
function number(value:bigint){if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new SellerRecoveryError('The reconciled money total exceeds the supported range.');return Number(value);}
const positive=(value:bigint)=>value>BigInt(0)?value:BigInt(0);
class RecoveryAuthorityError extends SellerRecoveryError {constructor(message:string){super(message,403);}}
/** Historical financial authority follows exact immutable original order provenance, never present activation. */
export async function recoveryExecutionGate(db:D1Database,source:SellerRecoverySource,environment?:RuntimeEnvironment){
 if(source.model==='registered')return;
 if(source.model==='managed'&&source.kind==='refund'&&await db.prepare(`SELECT 1 FROM managed_commercial_snapshots s
  JOIN managed_live_activation_decisions d ON d.id=s.live_activation_decision_id AND d.seller_id=s.seller_id
  JOIN managed_live_clearances c ON c.id=s.live_clearance_id AND c.id=d.clearance_id AND c.seller_id=s.seller_id
  JOIN managed_live_financial_scopes f ON f.id=s.live_financial_scope_id AND f.id=d.financial_scope_id AND f.id=c.financial_scope_id
  JOIN return_requests request ON request.order_item_id=s.order_item_id JOIN refunds refund ON refund.return_request_id=request.id
  WHERE s.order_item_id=? AND s.seller_id=? AND refund.id=? AND refund.order_id=? AND s.record_kind='live' AND s.simulation_label IS NULL AND s.live_customer_id IS NOT NULL
   AND s.commercial_model='managed_sale_linked_percentage_v1'`).bind(source.orderItemId,source.sellerId,source.id,source.orderId).first())return;
 if(!environment)throw new SellerRecoveryError('This managed financial route requires the guarded local simulation environment.');
 assertSimulationAllowed(environment);
}

export interface RecoveryAmounts {
  exposurePaisa:number;confirmedPaisa:number;approvedCapPaisa:number;disputedPaisa:number;absorbedPaisa:number;
  recovered:{cash:number;earnings:number;returnedPayout:number;carrier:number};
}
/** All methods consume the same cap. Unknown money never enters recovered amounts. */
export function recoveryPosition(input:RecoveryAmounts){
  const exposure=money(input.exposurePaisa),confirmed=money(input.confirmedPaisa),approved=money(input.approvedCapPaisa);
  const disputed=money(input.disputedPaisa),absorbed=money(input.absorbedPaisa);
  const recovered=Object.values(input.recovered).reduce((sum,value)=>sum+money(value),BigInt(0));
  if(confirmed>exposure)throw new SellerRecoveryError('Reconcile the original exposure before increasing confirmed liability.');
  const liable=positive(confirmed-absorbed),remaining=positive(liable-recovered);
  const approvedRemaining=positive(approved-absorbed-recovered);
  return {provisionalPaisa:number(exposure-confirmed),recoveredPaisa:number(recovered),remainingPaisa:number(remaining),
    collectiblePaisa:number(positive((remaining<approvedRemaining?remaining:approvedRemaining)-disputed)),overRecoveredPaisa:number(positive(recovered-liable))};
}

export interface SellerRecoverySource {
  kind:'refund'|'supplier_adjustment';id:string;sellerId:string;ownerId:string;model:PayoutModel;currency:'NPR';
  refundId:string|null;orderId:string|null;orderItemId:string|null;customerId:string|null;originalCustomerId?:string|null;
  exposurePaisa:number;confirmedPaisa:number;nativeDebitPaisa:number;compensationPaisa:number;
  liabilityCorrectionPaisa?:number;historicalNettingPaisa:number;blocker:string|null;nativeEntries:{id:string;amount:number}[];originalPayoutIds:string[];
  blockerCode:'historical_netting'|'company_compensation'|'unpaid_original'|'payout_reconciliation'|'source_reconciliation'|'correction_reconciliation'|null;
  historicalCandidatePaisa?:number;historicalReview?:HistoricalRecoveryState;
  customerRefundReversalPending?:boolean;receiptReversedPaisa?:number;receiptCompanyLossPaisa?:number;companyCompensatedPaisa?:number;companyDeductedPaisa?:number;unpaidResponsibilityRestoredPaisa?:number;carrierUnpaidCoveredPaisa?:number;carrierUnpaidAvailablePaisa?:number;
  originalUnpaidOffsetPaisa?:number;originalUnpaidReviewId?:string|null;unpaidSource?:UnpaidRecoverySource|null;
  retirementSources?:RecoveryPayoutRetirement[];
  originalPaidPayouts?:OriginalRecoveryPayoutSource[];
  paidOriginalBasis?:PaidOriginalBasis|null;originalPartialReviewId?:string|null;originalPartialCapacityPaisa?:number;partialUnpaidSource?:PartialUnpaidSource|null;
}

/** Read original authoritative facts. This creates neither a debt nor a balancing entry. */
export async function readSellerRecoverySource(db:D1Database,source:{kind:'refund'|'supplier_adjustment';id:string}):Promise<SellerRecoverySource>{
 const original=await readOriginalSellerRecoverySource(db,source);
 const correction=await db.prepare(`SELECT COALESCE(SUM(x.old_confirmed_paisa-x.new_confirmed_paisa),0) AS amount FROM seller_recovery_liability_corrections x JOIN seller_recovery_cases c ON c.id=x.case_id WHERE c.source_kind=? AND c.source_id=?`).bind(source.kind,source.id).first<{amount:number}>();
 const reduced=correction?.amount??0;
 const result:SellerRecoverySource={...original,liabilityCorrectionPaisa:reduced,exposurePaisa:Math.max(0,original.exposurePaisa-reduced),confirmedPaisa:Math.max(0,original.confirmedPaisa-reduced),blocker:original.blocker??(reduced>original.confirmedPaisa?'Reconcile changed original responsibility and its retained corrections.':null),blockerCode:original.blockerCode??(reduced>original.confirmedPaisa?'correction_reconciliation':null)};
 const company=await db.prepare(`SELECT COALESCE(SUM(review.amount_paisa),0) AS amount FROM seller_recovery_source_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE c.source_kind=? AND c.source_id=? AND review.kind='company_compensation'`).bind(source.kind,source.id).first<{amount:number}>();
 result.companyCompensatedPaisa=company?.amount??0;
 const receiptDisposition=await db.prepare(`SELECT COALESCE(SUM(part.amount_paisa),0) reversed,COALESCE(SUM(part.company_loss_paisa),0) companyLoss FROM seller_recovery_receipt_reversal_parts part JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id JOIN seller_recovery_cases c ON c.id=part.case_id WHERE review.state='completed' AND c.source_kind=? AND c.source_id=?`).bind(source.kind,source.id).first<{reversed:number;companyLoss:number}>();
 result.receiptReversedPaisa=receiptDisposition?.reversed??0;result.receiptCompanyLossPaisa=receiptDisposition?.companyLoss??0;
 result.companyDeductedPaisa=(await db.prepare('SELECT COALESCE(SUM(h.amount_paisa),0) AS amount FROM seller_recovery_company_deductions h JOIN seller_recovery_cases c ON c.id=h.case_id WHERE c.source_kind=? AND c.source_id=?').bind(source.kind,source.id).first<{amount:number}>())?.amount??0;
 if(original.model==='registered'&&result.companyCompensatedPaisa){
  result.compensationPaisa=Math.max(0,original.compensationPaisa-result.companyCompensatedPaisa);
  if(result.blockerCode==='company_compensation'&&result.compensationPaisa===0){result.blocker=null;result.blockerCode=null;}
 }
 const unpaid=await db.prepare(`SELECT id,amount_paisa AS amount FROM seller_recovery_unpaid_sources WHERE refund_id=? AND seller_id=?`).bind(source.kind==='refund'?source.id:null,original.sellerId).first<{id:string;amount:number}>();
 result.originalUnpaidReviewId=unpaid?.id??null;result.originalUnpaidOffsetPaisa=original.model==='fixed'?original.originalUnpaidOffsetPaisa??0:unpaid?.amount??0;
 if(unpaid){
  result.historicalCandidatePaisa=original.historicalNettingPaisa;
  if(unpaid.amount===original.nativeDebitPaisa&&original.compensationPaisa===0&&reduced===0){
   result.exposurePaisa=0;result.confirmedPaisa=0;result.historicalNettingPaisa=0;
   if(result.blockerCode==='unpaid_original'||result.blockerCode==='payout_reconciliation'||result.blockerCode==='historical_netting'){result.blocker=null;result.blockerCode=null;}
  }else{result.blocker='Reconcile the changed native source against the retained original unpaid-earnings disposition.';result.blockerCode='correction_reconciliation';}
 }
 result.unpaidSource=!unpaid&&source.kind==='refund'?await readUnpaidRecoverySource(db,result):null;
 if(result.unpaidSource&&(result.blockerCode==='source_reconciliation'||result.blockerCode==='payout_reconciliation')&&result.compensationPaisa===0&&!reduced){result.blockerCode='unpaid_original';result.blocker='Review the released original unpaid earnings and the retained native refund adjustment.';}
 const partial=await db.prepare(`SELECT id,scope_id AS scopeId,amount_paisa AS amount,native_charge_paisa AS nativeCharge,capacity_paisa AS capacity,COALESCE(json_extract(source_json,'$.paidOriginalBasis.paidPaisa'),0) AS originalPaid FROM seller_recovery_partial_sources WHERE refund_id=? AND seller_id=?`).bind(source.kind==='refund'?source.id:null,original.sellerId).first<{id:string;scopeId:string;amount:number;nativeCharge:number;capacity:number;originalPaid:number}>();
 result.originalPartialReviewId=partial?.id??null;result.originalPartialCapacityPaisa=partial?.capacity;
 if(partial){
  result.originalUnpaidOffsetPaisa=partial.amount;result.historicalCandidatePaisa=original.historicalNettingPaisa;
  result.exposurePaisa=Math.max(0,partial.nativeCharge-partial.amount-reduced);result.confirmedPaisa=result.exposurePaisa;
  result.historicalNettingPaisa=Math.max(0,original.historicalNettingPaisa-partial.amount);
  result.blocker=original.blocker;result.blockerCode=original.blockerCode;
  if(result.blockerCode==='unpaid_original'||result.blockerCode==='historical_netting'&&!result.historicalNettingPaisa){result.blocker=null;result.blockerCode=null;}
  const model=original.model==='registered'?'registered':'managed';
  const capacity=await db.prepare('SELECT '+originalUnpaidCapacitySql(model,'?','?')+' AS amount').bind(partial.scopeId,original.sellerId).first<{amount:number}>();
  if(original.nativeDebitPaisa!==partial.nativeCharge||original.compensationPaisa||reduced>partial.nativeCharge-partial.amount||(capacity?.amount??-1)-partial.originalPaid!==partial.capacity){result.blocker='Reconcile changed original costs against the retained shared unpaid-earnings disposition.';result.blockerCode='correction_reconciliation';}
 }
 if(!unpaid&&!partial&&source.kind==='refund'&&!result.blocker&&result.compensationPaisa===0&&result.historicalNettingPaisa===0){
  const paidBasis=await readPaidOriginalBasis(db,result);
  if(paidBasis&&paidBasis.paidPaisa>0&&paidBasis.paidPaisa<paidBasis.basisPaisa-paidBasis.usedPaisa){
   result.paidOriginalBasis=paidBasis;result.confirmedPaisa=0;result.blockerCode='unpaid_original';
   result.blocker='Reconcile the still-unpaid original component of this partial original payment before approving any recovery.';
  }
 }
 result.partialUnpaidSource=!unpaid&&!partial&&source.kind==='refund'&&['unpaid_original','payout_reconciliation'].includes(result.blockerCode??'')?await readPartialUnpaidSource(db,result):null;
 const unpaidCorrections=await db.prepare(`SELECT COALESCE(SUM(x.amount_paisa),0) AS amount FROM seller_recovery_unpaid_corrections x JOIN seller_recovery_cases c ON c.id=x.case_id WHERE c.source_kind=? AND c.source_id=?`).bind(source.kind,source.id).first<{amount:number}>();
 result.unpaidResponsibilityRestoredPaisa=unpaidCorrections?.amount??0;
 const carrierUnpaid=await db.prepare('SELECT COALESCE(SUM(x.amount_paisa),0) AS amount FROM seller_recovery_carrier_unpaid_reviews x JOIN seller_recovery_cases c ON c.id=x.case_id WHERE c.source_kind=? AND c.source_id=?').bind(source.kind,source.id).first<{amount:number}>();
 result.carrierUnpaidCoveredPaisa=carrierUnpaid?.amount??0;
 const carrierUnpaidCapacity=await db.prepare('SELECT '+carrierUnpaidAvailableSql('c',(db as D1Database&{dialect?:string}).dialect==='mariadb'?'mariadb':'sqlite')+' AS amount FROM seller_recovery_cases c WHERE c.source_kind=? AND c.source_id=?').bind(source.kind,source.id).first<{amount:number}>();
 result.carrierUnpaidAvailablePaisa=Math.max(0,carrierUnpaidCapacity?.amount??0);
 if(await db.prepare('SELECT 1 WHERE '+carrierUnpaidDispositionPendingSql('(SELECT id FROM seller_recovery_cases WHERE source_kind=? AND source_id=?)')).bind(source.kind,source.id).first()){result.blocker='Complete the retained carrier coverage of original unpaid earnings before another financial action.';result.blockerCode='source_reconciliation';}

 result.retirementSources=await readRecoveryPayoutRetirements(db,result);
 const history=await readHistoricalRecoveryState(db,{...original,historicalNettingPaisa:result.historicalNettingPaisa});
 if(history){
  result.historicalCandidatePaisa=original.historicalNettingPaisa;result.historicalReview=history;
  if(history.complete){
   result.historicalNettingPaisa=history.recognizedPaisa;
   if(result.blockerCode==='historical_netting'){
    result.blocker=reduced>original.confirmedPaisa?'Reconcile changed original responsibility and its retained corrections.':null;
    result.blockerCode=result.blocker?'correction_reconciliation':null;
   }
  }else if(!result.blocker){result.blocker='Reconcile the actual original historical deductions and their shared attribution before further collection.';result.blockerCode='historical_netting';}
 }
 if(await db.prepare('SELECT 1 WHERE '+carrierDispositionPendingSql('(SELECT id FROM seller_recovery_cases WHERE source_kind=? AND source_id=?)')).bind(source.kind,source.id).first()){result.blocker='Complete the retained carrier reimbursement and original collection disposition before further financial action.';result.blockerCode='source_reconciliation';}
 const retainedCase=await db.prepare('SELECT id FROM seller_recovery_cases WHERE source_kind=? AND source_id=?').bind(source.kind,source.id).first<{id:string}>();
 result.originalPaidPayouts=retainedCase?await readOriginalRecoveryPayoutSources(db,retainedCase.id):[];
 if(retainedCase&&await db.prepare('SELECT 1 WHERE '+returnedPayoutDispositionPendingSql('?')).bind(retainedCase.id).first()){result.blocker='Complete the retained original payout return and restitution before further financial action.';result.blockerCode='source_reconciliation';}
 result.customerRefundReversalPending=source.kind==='refund'&&!!await db.prepare('SELECT 1 WHERE '+customerRefundReversalPendingSql('?')).bind(source.id).first();
 if(result.customerRefundReversalPending&&!result.blocker)result.blocker=CUSTOMER_REFUND_REVERSAL_BLOCKER;
 return result;
}
async function readOriginalSellerRecoverySource(db:D1Database,source:{kind:'refund'|'supplier_adjustment';id:string}):Promise<SellerRecoverySource>{
  if(source.kind==='supplier_adjustment')return readFixedRecoverySource(db,source.id);
  if(source.kind!=='refund')throw new SellerRecoveryError('Open the original refund or approved supplier adjustment.');
  const row=await db.prepare(`SELECT r.id,r.status,r.order_id AS orderId,c.order_item_id AS orderItemId,i.seller_id AS sellerId,
    s.user_id AS ownerId,o.customer_id AS customerId,CASE WHEN m.record_kind='live' THEN m.live_customer_id ELSE NULL END AS originalCustomerId,m.commercial_model AS commercialModel,
    COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0) AS sellerCost,
    (SELECT COUNT(*) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id) AS allocationCount,
    COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=i.seller_id),0) AS sellerMerchandise,
    COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=i.seller_id),0) AS sellerDelivery
    FROM refunds r JOIN return_requests c ON c.id=r.return_request_id JOIN order_items i ON i.id=c.order_item_id
    JOIN seller_profiles s ON s.id=i.seller_id JOIN orders o ON o.id=r.order_id LEFT JOIN managed_commercial_snapshots m ON m.order_item_id=i.id WHERE r.id=?`)
    .bind(source.id).first<{id:string;status:string;orderId:string;orderItemId:string;sellerId:string;ownerId:string;customerId:string|null;originalCustomerId:string|null;commercialModel:string|null;sellerCost:number;allocationCount:number;sellerMerchandise:number;sellerDelivery:number}>();
  if(!row)throw new SellerRecoveryError('The original authorized refund source was not found.',404);
  if(row.commercialModel&&row.commercialModel!=='managed_sale_linked_percentage_v1')throw new SellerRecoveryError('Fixed-supplier recovery must use its approved original supply adjustment, not the retail refund.');
  const model=row.commercialModel?'managed':'registered';
  const entries=await db.prepare(model==='registered'
    ?"SELECT id,amount_paisa AS amount FROM seller_ledger_entries WHERE refund_id=? AND seller_id=? AND type IN('refund','commission_reversal') ORDER BY id"
    :"SELECT x.id,x.amount_paisa AS amount FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id WHERE x.refund_id=? AND e.seller_id=? AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') ORDER BY x.id")
    .bind(source.id,row.sellerId).all<{id:string;amount:number}>();
  const nativeDebit=Math.max(0,-entries.results.reduce((sum,entry)=>sum+entry.amount,0));money(nativeDebit);
  const completed=!!await db.prepare(`SELECT 1 FROM refund_obligations o JOIN outgoing_payment_packets p ON p.obligation_id=o.id
    WHERE o.source_kind='return_refund' AND o.source_id=? AND o.state='completed' AND p.state='paid'
    AND (p.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities b WHERE b.packet_kind='refund' AND b.packet_id=p.id AND b.amount_paisa=p.amount_paisa))`).bind(source.id).first();
  const original=await db.prepare(model==='registered'
    ?`SELECT DISTINCT p.id,p.status,EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=p.id AND t.state='paid' AND EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa)) AS actualPaid
      FROM payouts p JOIN payout_entries pe ON pe.payout_id=p.id JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id
      WHERE e.seller_id=? AND e.order_item_id=? AND e.type='sale' AND (pe.released_at IS NULL OR ${retiredRecoveryPayoutSql('registered','p.id','e.seller_id')}) ORDER BY p.id`
    :`SELECT DISTINCT p.id,p.status,EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=p.id AND t.state='paid' AND EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa)) AS actualPaid
      FROM managed_payouts p JOIN managed_entitlements e ON e.seller_id=p.seller_id JOIN managed_commercial_snapshots m ON m.id=e.snapshot_id
      WHERE e.seller_id=? AND m.order_item_id=? AND (
        EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=e.id AND a.amount_paisa>0 AND (a.disposition<>'released' OR ${retiredRecoveryPayoutSql('managed','p.id','e.seller_id')}))
        OR EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE pe.payout_id=p.id AND x.entitlement_id=e.id AND x.amount_paisa>0)) ORDER BY p.id`)
    .bind(row.sellerId,row.orderItemId).all<{id:string;status:string;actualPaid:number}>();
  const disposition=recoverySourceDispositionSql(model),dispositionBindings=recoveryDispositionBindings(model,source.id,row.sellerId);
  const historical=await db.prepare(disposition.historicalSql).bind(...dispositionBindings.historical).first<{amount:number}>();
  const managedBase=model==='managed'?await db.prepare("SELECT COALESCE(-SUM(x.amount_paisa),0) AS amount FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id WHERE x.refund_id=? AND e.seller_id=? AND x.type='refund_adjustment'").bind(source.id,row.sellerId).first<{amount:number}>():null;
  const managedExpected=(row.sellerMerchandise>0?(managedBase?.amount??0):0)+row.sellerDelivery;
  const reserved=await db.prepare(disposition.reservedSql).bind(...dispositionBindings.reserved).first();
  const historicallyRecovered=model==='registered'?Math.max(0,historical?.amount??0):Math.min(nativeDebit,Math.max(0,historical?.amount??0));
  let blocker:string|null=null,blockerCode:SellerRecoverySource['blockerCode']=null,confirmed=0,exposure=row.status==='paid'?nativeDebit:row.sellerCost;
  // A wrong registered refund debit must be cancelled in full. Its original
  // commission reversal remains the seller's credit, not funding for company cost.
  const companyDebit=model==='registered'&&row.allocationCount>0&&row.sellerCost===0
   ?await db.prepare("SELECT COALESCE(-SUM(amount_paisa),0) AS amount FROM seller_ledger_entries WHERE refund_id=? AND seller_id=? AND type='refund'").bind(source.id,row.sellerId).first<{amount:number}>():null;
  const compensation=row.allocationCount>0&&row.sellerCost===0?model==='registered'?Math.max(0,companyDebit?.amount??0):nativeDebit:0;
  if(!row.allocationCount)blocker='Reconcile the original component responsibility before collecting any seller balance.';
  else if(!completed||row.status!=='paid')blocker='The original customer refund is not confirmed completed.';
  else if(row.sellerCost===0){exposure=0;blocker=compensation?'An approved native compensation is needed for the company-owned cost.':null;blockerCode=compensation?'company_compensation':null;}
  else if(model==='managed'&&nativeDebit!==managedExpected)blocker='Reconcile the original managed merchandise and delivery responsibility against its native adjustments.';
  else if(!original.results.some(p=>p.actualPaid)){blocker='Reconcile the original unpaid, historical or uncertain payout before collecting seller money.';blockerCode=original.results.length===0&&!reserved?'unpaid_original':'payout_reconciliation';}
  else if(original.results.some(p=>['processing','approved','prepared','scheduled'].includes(p.status))){blocker='An original payout remains reserved or uncertain; reconcile its affected exposure first.';blockerCode='payout_reconciliation';}
  else if(reserved){blocker='The original native adjustment is reserved in another payout. Reconcile its actual outcome before collecting.';blockerCode='payout_reconciliation';}
  else {confirmed=nativeDebit;if(historicallyRecovered>0){blocker='The original adjustment has already entered another payout; reconcile its actual netting before collecting.';blockerCode='historical_netting';}}
  return {kind:'refund',id:source.id,sellerId:row.sellerId,ownerId:row.ownerId,model,currency:'NPR',refundId:source.id,orderId:row.orderId,orderItemId:row.orderItemId,customerId:row.customerId,originalCustomerId:row.originalCustomerId,
    exposurePaisa:exposure,confirmedPaisa:confirmed,nativeDebitPaisa:nativeDebit,compensationPaisa:compensation,historicalNettingPaisa:historicallyRecovered,blocker,blockerCode:blockerCode??(blocker?'source_reconciliation':null),nativeEntries:entries.results,originalPayoutIds:original.results.map(p=>p.id)};
}

async function readFixedRecoverySource(db:D1Database,id:string):Promise<SellerRecoverySource>{
  const row=await db.prepare(`SELECT a.id,a.obligation_id AS obligationId,a.amount_paisa AS amount,a.created_at AS createdAt,o.seller_id AS sellerId,s.user_id AS ownerId,o.original_amount_paisa AS originalAmount
    FROM managed_supplier_adjustments a JOIN managed_supplier_obligations o ON o.id=a.obligation_id JOIN seller_profiles s ON s.id=o.seller_id WHERE a.id=?`).bind(id)
    .first<{id:string;obligationId:string;amount:number;createdAt:number;sellerId:string;ownerId:string;originalAmount:number}>();
  if(!row)throw new SellerRecoveryError('The approved original supplier adjustment was not found.',404);
  const payments=await db.prepare(`SELECT p.id,p.status,p.amount_paisa AS amount,${retiredRecoveryPayoutSql('fixed','p.id',"(SELECT seller_id FROM managed_supplier_obligations WHERE id=p.obligation_id)")} AS retired,EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=p.id AND t.state='paid' AND EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa)) AS actualPaid,
    EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=p.id AND t.state IN('processing','uncertain')) AS uncertain
    FROM managed_supplier_payments p WHERE p.obligation_id=? ORDER BY p.id`).bind(row.obligationId).all<{id:string;status:string;amount:number;actualPaid:number;uncertain:number;retired:number}>();
  const prior=await db.prepare('SELECT COALESCE(SUM(amount_paisa),0) AS amount FROM managed_supplier_adjustments WHERE obligation_id=? AND (created_at<? OR created_at=? AND id<?)')
    .bind(row.obligationId,row.createdAt,row.createdAt,id).first<{amount:number}>();
  const retained=await db.prepare("SELECT original_source_json AS original FROM seller_recovery_cases WHERE source_kind='supplier_adjustment' AND source_id=?").bind(id).first<{original:string}>();
  const retainedIds:unknown=retained?JSON.parse(retained.original).originalPayoutIds:null;
  if(retained&&(!Array.isArray(retainedIds)||retainedIds.some(value=>typeof value!=='string')))throw new SellerRecoveryError('Reconcile the retained original supplier payment basis.');
  // Later payouts of corrected or returned money are not a second original
  // payment for this same adjustment. Retained uncertain instructions still
  // become actual original money only when their bank outcome is confirmed.
  const originalPayments=Array.isArray(retainedIds)?payments.results.filter(p=>retainedIds.includes(p.id)):payments.results;
  const paid=originalPayments.filter(p=>p.actualPaid).reduce((sum,p)=>sum+p.amount,0);
  const deficit=Math.max(0,paid+(prior?.amount??0)+row.amount-row.originalAmount)-Math.max(0,paid+(prior?.amount??0)-row.originalAmount);
  const uncertain=(Array.isArray(retainedIds)&&originalPayments.length!==retainedIds.length)||payments.results.some(p=>p.uncertain||p.actualPaid&&p.status!=='paid'||!p.actualPaid&&!p.retired);
  return {kind:'supplier_adjustment',id,sellerId:row.sellerId,ownerId:row.ownerId,model:'fixed',currency:'NPR',refundId:null,orderId:null,orderItemId:null,customerId:null,
    exposurePaisa:uncertain?row.amount:deficit,confirmedPaisa:uncertain?0:deficit,nativeDebitPaisa:row.amount,compensationPaisa:0,historicalNettingPaisa:0,originalUnpaidOffsetPaisa:uncertain?0:row.amount-deficit,
    blocker:uncertain?'Reconcile the original supplier instruction and actual returned money before collecting.':null,blockerCode:uncertain?'source_reconciliation':null,nativeEntries:[{id,amount:-row.amount}],originalPayoutIds:originalPayments.map(p=>p.id)};
}

async function openSellerRecoveryAttempt(db:D1Database,ctx:CommandContext,input:{kind:'refund'|'supplier_adjustment';id:string;reason:string},retry=1):Promise<{id:string;revision:number}>{
  const reason=input.reason.trim();if(reason.length<10||reason.length>1500)throw new SellerRecoveryError('Record the original source and reason for reconciliation.',400);
  const authority=await staffMutationGuard(db,ctx.actorId,'payout.prepare',RecoveryAuthorityError);
  const source=await readSellerRecoverySource(db,input);
  await assertIndependent(db,source,ctx.actorId);
  const commandSource={action:'seller.recovery.open',subjectType:'seller_recovery_source',subjectId:input.kind+':'+input.id};
  const read=async()=>{try{return await commandReceipt(db,ctx,commandSource,{...input,reason});}catch(error){if(error instanceof Error&&error.message==='Request reference was already used for different command content.')throw new SellerRecoveryError(error.message);throw error;}};
  const receipt=await read();if(receipt.replayed)return receipt.result as {id:string;revision:number};
  const existing=await db.prepare('SELECT id,revision FROM seller_recovery_cases WHERE source_kind=? AND source_id=?').bind(input.kind,input.id).first<{id:string;revision:number}>();
  const clock=checkoutCommitClock(db),personal=source.kind==='refund'
    ?'EXISTS(SELECT 1 FROM seller_profiles s WHERE s.id=? AND s.user_id<>?) AND NOT EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=?)'
    :'EXISTS(SELECT 1 FROM seller_profiles s WHERE s.id=? AND s.user_id<>?)';
  const personalValues=source.kind==='refund'?[source.sellerId,ctx.actorId,source.orderId,ctx.actorId]:[source.sellerId,ctx.actorId];
  const id=existing?.id??crypto.randomUUID(),result={id,revision:existing?.revision??0};
  const state=source.blocker?(source.confirmedPaisa?'reconciliation':'provisional'):source.confirmedPaisa?'awaiting_approval':'closed_no_balance';
  const statements=[...authority.statements,...paymentGuard(db,personal,personalValues)];
  if(!existing)statements.push(
    db.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?').bind(source.sellerId),
    db.prepare(`INSERT INTO seller_recovery_cases(id,source_kind,source_id,refund_id,supplier_adjustment_id,seller_id,payout_model,currency,original_source_json,
      exposure_paisa,confirmed_paisa,historical_recovered_paisa,state,blocker,owner_id,first_review_due_at,next_action_at,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,'NPR',?,?,?,?,?,?,?,${clock}+86400000,${clock}+86400000,?,${clock},${clock})`)
      .bind(id,source.kind,source.id,source.refundId,source.kind==='supplier_adjustment'?source.id:null,source.sellerId,source.model,JSON.stringify(source),
        source.exposurePaisa,source.confirmedPaisa,0,state,source.blocker,ctx.actorId,ctx.actorId),
    db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at)
      VALUES(?,?,0,'opened',?,?,?,?,${clock})`).bind(crypto.randomUUID(),id,ctx.actorId,reason,JSON.stringify(source),ctx.requestId)
  );
  if(!existing)statements.push(...await recoveryNoticeStatements(db,ctx,id,'opened',`Original ${source.model} adjustment: NPR ${(source.nativeDebitPaisa/100).toFixed(2)}. Confirmed exposure: NPR ${(source.confirmedPaisa/100).toFixed(2)}. Open the itemized statement for the original refund, payout and current review. Collection requires an approved plan.`));
  statements.push(...authority.statements,receipt.insert(result));
  try{await db.batch(statements);}catch(error){
    const recovered=await read();if(recovered.replayed)return recovered.result as {id:string;revision:number};
    if(retry&&!existing&&await db.prepare('SELECT 1 FROM seller_recovery_cases WHERE source_kind=? AND source_id=?').bind(input.kind,input.id).first())
      return openSellerRecoveryAttempt(db,ctx,input,0);
    throw error;
  }
  return result;
}

export async function openSellerRecovery(db:D1Database,ctx:CommandContext,input:{kind:'refund'|'supplier_adjustment';id:string;reason:string}){return openSellerRecoveryAttempt(db,ctx,input);}

interface RecoveryCaseRow {
  id:string;kind:'refund'|'supplier_adjustment';sourceId:string;sellerId:string;model:PayoutModel;state:string;revision:number;
  exposurePaisa:number;confirmedPaisa:number;approvedCapPaisa:number;absorbedPaisa:number;disputedPaisa:number;historicalRecoveredPaisa:number;liabilityReducedPaisa:number;restoredPaisa:number;
  ownerId:string;firstReviewDueAt:number;nextActionAt:number;blocker:string|null;planJson:string|null;approvedAt:number|null;
}
async function caseRow(db:D1Database,id:string){
  const row=await db.prepare(`SELECT id,source_kind AS kind,source_id AS sourceId,seller_id AS sellerId,payout_model AS model,state,revision,
    exposure_paisa AS exposurePaisa,confirmed_paisa AS confirmedPaisa,approved_cap_paisa AS approvedCapPaisa,absorbed_paisa AS absorbedPaisa,
    liability_reduced_paisa AS liabilityReducedPaisa,restored_paisa AS restoredPaisa,disputed_paisa AS disputedPaisa,historical_recovered_paisa AS historicalRecoveredPaisa,owner_id AS ownerId,first_review_due_at AS firstReviewDueAt,next_action_at AS nextActionAt,blocker,plan_json AS planJson,approved_at AS approvedAt
    FROM seller_recovery_cases WHERE id=?`).bind(id).first<RecoveryCaseRow>();
  if(!row)throw new SellerRecoveryError('Open the original recovery case.',404);return row;
}
async function allocatedRecovery(db:D1Database,id:string,historical:number,net=true){
  const rows=await db.prepare(`SELECT method,SUM(${actualRecoveryAllocationSql('a')}${net?'-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)':''}) AS amount FROM seller_recovery_allocations a WHERE case_id=?
    AND (a.receipt_id IS NULL OR EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=a.receipt_id AND ${verifiedRecoveryReceiptSql('r')})) GROUP BY method`).bind(id).all<{method:string;amount:number}>();
  const restored=net?await db.prepare('SELECT COALESCE(SUM(amount_paisa),0) AS amount FROM seller_recovery_all_restorations WHERE case_id=? AND allocation_id IS NULL').bind(id).first<{amount:number}>():null;
  const reviewed=await db.prepare('SELECT COALESCE(SUM(amount_paisa),0) AS amount FROM seller_recovery_historical_attributions WHERE case_id=?').bind(id).first<{amount:number}>();
  historical=reviewed?.amount??0;
  const recovered={cash:0,earnings:Math.max(0,historical-(restored?.amount??0)),returnedPayout:0,carrier:0};
  for(const row of rows.results){const key=row.method==='returned_payout'?'returnedPayout':row.method as 'cash'|'earnings'|'carrier';recovered[key]+=row.amount;}
  return recovered;
}
async function reviewDigest(row:RecoveryCaseRow,source:SellerRecoverySource){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({row,source})));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function assertIndependent(db:D1Database,source:SellerRecoverySource,actorId:string){
  const retained=await db.prepare(`SELECT json_extract(original_source_json,'$.ownerId') AS ownerId,json_extract(original_source_json,'$.customerId') AS customerId FROM seller_recovery_cases WHERE source_kind=? AND source_id=?`).bind(source.kind,source.id).first<{ownerId:string;customerId:string|null}>();
  if([source.ownerId,source.customerId,source.originalCustomerId,retained?.ownerId,retained?.customerId].includes(actorId))throw new RecoveryAuthorityError('An eligible operator without a personal interest must handle this recovery.');
}
export async function getSellerRecoveryReview(db:D1Database,actorId:string,id:string,options:{allowReadOnly?:boolean}={}){
  const authority=options.allowReadOnly
    ?await staffReadGuard(db,actorId,['payout.prepare','refund.view'],RecoveryAuthorityError)
    :await staffMutationGuard(db,actorId,'payout.prepare',RecoveryAuthorityError);
  const row=await caseRow(db,id);
  const source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,actorId);
  await db.batch(authority.statements);
  const uncertain=await db.prepare(`SELECT COALESCE(SUM(a.amount_paisa),0) AS amount FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id
    WHERE a.case_id=? AND (NOT ${verifiedRecoveryReceiptSql('r')})`).bind(row.id).first<{amount:number}>();
  const position=recoveryPosition({...row,recovered:await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa)});
  if(row.blocker||source.blocker||uncertain?.amount||source.confirmedPaisa!==row.confirmedPaisa||source.historicalNettingPaisa!==row.historicalRecoveredPaisa)position.collectiblePaisa=0;
  const receiptReversals=await db.prepare(`SELECT DISTINCT reversal.id,reversal.amount_minor amountPaisa,reversal.bank_at bankAt,review.state dispositionState FROM company_receipt_reversals reversal JOIN seller_recovery_allocations a ON a.receipt_id=reversal.receipt_id LEFT JOIN seller_recovery_receipt_reversal_reviews review ON review.reversal_id=reversal.id WHERE a.case_id=? ORDER BY reversal.bank_at,reversal.id`).bind(id).all<{id:string;amountPaisa:number;bankAt:number;dispositionState:string|null}>();
  return {case:row,source,reviewDigest:await reviewDigest(row,source),position,unreconciledReceiptPaisa:uncertain?.amount??0,receiptReversals:receiptReversals.results};
}
async function recoveryEvidenceGuards(db:D1Database,reference:string,source:SellerRecoverySource){
  if(!reference.startsWith('fin-file-'))return [];
  if(source.kind==='refund'){
    const original=await db.prepare("SELECT id FROM refund_obligations WHERE source_kind='return_refund' AND source_id=?").bind(source.id).first<{id:string}>();
    if(!original)throw new SellerRecoveryError('Attach evidence to the original refund obligation.');
    return financeEvidenceReferenceGuards(db,reference,{kind:'obligation',id:original.id});
  }
  const original=await db.prepare(`SELECT v.account_version_id AS id FROM payout_transfer_packets v JOIN managed_supplier_payments p ON p.id=v.supplier_payment_id
    JOIN managed_supplier_adjustments a ON a.obligation_id=p.obligation_id JOIN finance_evidence_intents i ON i.id=? AND i.scope_kind='company_account' AND i.scope_id=v.account_version_id
    WHERE a.id=? AND v.state='paid' LIMIT 1`).bind(reference,source.id).first<{id:string}>();
  if(!original)throw new SellerRecoveryError('Attach evidence to the original supplier payment source.');
  return financeEvidenceReferenceGuards(db,reference,{kind:'company_account',id:original.id});
}
export function nativeSourceGuards(db:D1Database,source:SellerRecoverySource,options:{retireReservation?:boolean}={}){
  const guards=paymentGuard(db,'EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id=?)',[source.sellerId,source.ownerId]);
  if(source.kind==='refund')guards.push(...paymentGuard(db,`(${customerRefundReversalPendingSql('?')})=?`,[source.id,source.customerRefundReversalPending?1:0]));
  if(source.orderId)guards.push(...paymentGuard(db,'EXISTS(SELECT 1 FROM orders WHERE id=? AND (customer_id=? OR customer_id IS NULL AND ? IS NULL))',[source.orderId,source.customerId,source.customerId]));
  guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM (SELECT COALESCE(SUM(part.amount_paisa),0) reversed,COALESCE(SUM(part.company_loss_paisa),0) companyLoss FROM seller_recovery_receipt_reversal_parts part JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id JOIN seller_recovery_cases c ON c.id=part.case_id WHERE review.state='completed' AND c.source_kind=? AND c.source_id=?) current WHERE current.reversed=? AND current.companyLoss=?)`,[source.kind,source.id,source.receiptReversedPaisa??0,source.receiptCompanyLossPaisa??0]));
  guards.push(...paymentGuard(db,`(SELECT COALESCE(SUM(x.amount_paisa),0) FROM seller_recovery_unpaid_corrections x JOIN seller_recovery_cases c ON c.id=x.case_id WHERE c.source_kind=? AND c.source_id=?)=?`,[source.kind,source.id,source.unpaidResponsibilityRestoredPaisa??0]));
  guards.push(...paymentGuard(db,`(SELECT COUNT(*) FROM seller_recovery_unpaid_sources WHERE refund_id=? AND seller_id=?)=?`,[source.kind==='refund'?source.id:null,source.sellerId,source.originalUnpaidReviewId?1:0]));
  guards.push(...paymentGuard(db,'(SELECT COUNT(*) FROM seller_recovery_partial_sources WHERE refund_id=? AND seller_id=?)=?',[source.kind==='refund'?source.id:null,source.sellerId,source.originalPartialReviewId?1:0]));
  if(source.originalPartialReviewId&&source.model!=='fixed')guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.id=? AND partial.capacity_paisa=${originalUnpaidCapacitySql(source.model,'partial.scope_id','partial.seller_id')}-COALESCE(json_extract(partial.source_json,'$.paidOriginalBasis.paidPaisa'),0))`,[source.originalPartialReviewId]));
  guards.push(...paymentGuard(db,`(SELECT COALESCE(SUM(review.amount_paisa),0) FROM seller_recovery_source_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE c.source_kind=? AND c.source_id=? AND review.kind='company_compensation')=?`,[source.kind,source.id,source.companyCompensatedPaisa??0]));
  guards.push(...paymentGuard(db,'(SELECT COALESCE(SUM(x.old_confirmed_paisa-x.new_confirmed_paisa),0) FROM seller_recovery_liability_corrections x JOIN seller_recovery_cases c ON c.id=x.case_id WHERE c.source_kind=? AND c.source_id=?)=?',[source.kind,source.id,source.liabilityCorrectionPaisa??0]));
  if(source.kind==='refund'){
    if(!options.retireReservation)guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM refunds r JOIN refund_obligations o ON o.source_kind='return_refund' AND o.source_id=r.id
      JOIN outgoing_payment_packets p ON p.obligation_id=o.id WHERE r.id=? AND r.status='paid' AND o.state='completed' AND p.state='paid'
      AND (p.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities b WHERE b.packet_kind='refund' AND b.packet_id=p.id AND b.amount_paisa=p.amount_paisa)))`,[source.id]));
    const model=source.model==='registered'?'registered':'managed';
    const disposition=recoverySourceDispositionSql(model),bindings=recoveryDispositionBindings(model,source.id,source.sellerId);
    if(!options.retireReservation)guards.push(...paymentGuard(db,`NOT EXISTS(${disposition.reservedSql})`,bindings.reserved));
    const historicalCap=model==='registered'?'CASE WHEN amount<0 THEN 0 ELSE amount END':'CASE WHEN amount<0 THEN 0 WHEN amount>? THEN ? ELSE amount END';
    guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM (${disposition.historicalSql}) AS native_disposition WHERE ${historicalCap}=?)`,[
      ...bindings.historical,...(model==='managed'?[source.nativeDebitPaisa,source.nativeDebitPaisa]:[]),source.historicalCandidatePaisa??source.historicalNettingPaisa]));
    const table=source.model==='registered'?'seller_ledger_entries':'managed_settlement_entries';
    const types=source.model==='registered'?"type IN ('refund','commission_reversal')":"(type='refund_adjustment' OR type='dispute_adjustment' AND reason_code='refund_responsibility')";
    guards.push(...paymentGuard(db,`(SELECT COUNT(*) FROM ${table} WHERE refund_id=? AND ${types})=?`,[source.id,source.nativeEntries.length]));
    for(const entry of source.nativeEntries)guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM ${table} WHERE id=? AND refund_id=? AND amount_paisa=?)`,[entry.id,source.id,entry.amount]));
  }else guards.push(...paymentGuard(db,'EXISTS(SELECT 1 FROM managed_supplier_adjustments WHERE id=? AND amount_paisa=?)',[source.id,source.nativeDebitPaisa]));
  const column=source.model==='registered'?'registered_payout_id':source.model==='managed'?'managed_payout_id':'supplier_payment_id';
  if(!options.retireReservation)for(const id of source.originalPayoutIds)guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM payout_transfer_packets p JOIN company_outgoing_bank_identities b ON b.packet_id=p.id AND b.packet_kind='payout' AND b.identity_hash=p.transaction_identity_hash WHERE p.${column}=? AND p.state='paid' AND p.seller_id=?) OR ${retiredRecoveryPayoutSql(source.model,'?','?')}`,[id,source.sellerId,id,source.sellerId]));
  return [...guards,...historicalSourceGuards(db,source)];
}

/** Snapshot every native pool and its global usage, not only the clamped per-refund estimate. */
function historicalSourceGuards(db:D1Database,source:SellerRecoverySource){
 if(!source.historicalReview||source.model==='fixed')return [];
 const sql=historicalRecoveryCandidatesSql(source.model,'(SELECT refundId FROM requested_source)','(SELECT sellerId FROM requested_source)');
 const prefix='WITH requested_source AS(SELECT ? AS refundId,? AS sellerId) ';
 const guards=paymentGuard(db,`(SELECT COUNT(*) FROM (${prefix}${sql}) candidates)=?`,[source.id,source.sellerId,source.historicalReview.candidates.length]);
 for(const candidate of source.historicalReview.candidates){
  guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM (${prefix}${sql}) candidate WHERE kind=? AND payoutId=? AND scopeId=? AND capacityPaisa=? AND nativeProof=?)`,[source.id,source.sellerId,candidate.kind,candidate.payoutId,candidate.scopeId,candidate.capacityPaisa,candidate.nativeProof?1:0]));
  guards.push(...paymentGuard(db,`(SELECT COALESCE(SUM(amount_paisa),0) FROM seller_recovery_all_historical_uses WHERE kind=? AND payout_id=? AND scope_id=?)=?`,[candidate.kind,candidate.payoutId,candidate.scopeId,candidate.attributedPaisa]));
 }
 return guards;
}

/** Recognize an actual past deduction. This posts no money and grants no future collection authority. */
/** Identify an actual company-owned historical deduction without calling it
 * seller recovery. Its native cost correction remains a separate explicit action. */
export async function reviewSellerRecoveryCompanyHistory(db:D1Database,ctx:CommandContext,input:{caseId:string;reviewDigest:string;candidate:HistoricalRecoveryCandidate;amountPaisa:number;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'company_history_reviewed',row.id,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;revision:number};
 money(input.amountPaisa);const history=source.historicalReview;
 if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||source.kind!=='refund'||source.model==='fixed'||source.blockerCode!=='company_compensation'||source.compensationPaisa<=0||source.companyCompensatedPaisa||source.confirmedPaisa||row.confirmedPaisa||row.historicalRecoveredPaisa||history?.recognizedPaisa||row.absorbedPaisa||row.restoredPaisa||row.approvedCapPaisa||!history||input.amountPaisa<=0||input.amountPaisa>Math.min(source.compensationPaisa,source.historicalCandidatePaisa??0)-(source.companyDeductedPaisa??0))throw new SellerRecoveryError('Review the exact uncompensated company-owned cost and its actual remaining original deduction.');
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the original company-cost deduction evidence and owner explanation.',400);
 const candidate=history.candidates.find(c=>c.kind===input.candidate?.kind&&c.payoutId===input.candidate?.payoutId&&c.scopeId===input.candidate?.scopeId);
 if(!candidate||!candidate.nativeProof||input.amountPaisa>candidate.capacityPaisa-candidate.attributedPaisa)throw new SellerRecoveryError('Choose the actual original paid deduction and its remaining shared capacity.');
 if(await db.prepare('SELECT 1 FROM seller_recovery_allocations WHERE case_id=?').bind(row.id).first())throw new SellerRecoveryError('Reconcile existing collection and restitution separately before classifying this company cost.');
 const clock=checkoutCommitClock(db),id=crypto.randomUUID(),result={id:row.id,revision:row.revision+1};
 try{await db.batch([...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  db.prepare(`INSERT INTO seller_recovery_company_deductions(id,case_id,case_revision,seller_id,refund_id,kind,payout_id,scope_id,native_deduction_paisa,amount_paisa,actor_id,request_id,created_at,source_json,evidence_reference,reason,public_message)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,${clock},?,?,?,?)`).bind(id,row.id,row.revision,row.sellerId,source.refundId,candidate.kind,candidate.payoutId,candidate.scopeId,candidate.capacityPaisa,input.amountPaisa,ctx.actorId,ctx.requestId,JSON.stringify(source),input.evidenceReference,input.reason,input.publicMessage),
  db.prepare(`UPDATE seller_recovery_cases SET revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'company_history_reviewed',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({companyDeductionId:id,candidate,amountPaisa:input.amountPaisa,evidenceReference:input.evidenceReference,publicMessage:input.publicMessage}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'company_history_reviewed',input.publicMessage),...authority.statements,receipt.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}
 return result;
}

export async function reviewSellerRecoveryHistory(db:D1Database,ctx:CommandContext,input:{caseId:string;reviewDigest:string;candidate:HistoricalRecoveryCandidate|null;amountPaisa:number;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
 await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'history_reviewed',row.id,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;revision:number};
 money(input.amountPaisa);
 const history=source.historicalReview;
 if(!history||source.blocker&&source.blockerCode!=='historical_netting'||ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source))throw new SellerRecoveryError('Review the current original payout, shared historical deductions and responsibility first.');
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the exact historical evidence, review reason and owner explanation.',400);
 const candidate=input.candidate?history.candidates.find(c=>c.kind===input.candidate!.kind&&c.payoutId===input.candidate!.payoutId&&c.scopeId===input.candidate!.scopeId):null;
 if(input.amountPaisa>0?(!candidate||!candidate.nativeProof||input.amountPaisa>candidate.capacityPaisa-candidate.attributedPaisa):!!input.candidate||!history.complete)throw new SellerRecoveryError('Choose an actual paid native deduction with sufficient unassigned capacity, or finish a fully attributed review.');
 const allocations=await db.prepare(`SELECT COALESCE(SUM(a.amount_paisa),0) AS amount,
  COALESCE(SUM(CASE WHEN a.receipt_id IS NOT NULL AND (NOT ${verifiedRecoveryReceiptSql('r')}) THEN a.amount_paisa ELSE 0 END),0) AS uncertain
  FROM seller_recovery_allocations a LEFT JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=?`).bind(row.id).first<{amount:number;uncertain:number}>();
 const total=number(money(history.recognizedPaisa)+money(input.amountPaisa));
 const remaining=money(source.confirmedPaisa)+money(row.restoredPaisa)-money(row.absorbedPaisa)-money(allocations?.amount??0)-money(total);
 if(allocations?.uncertain||remaining<BigInt(0))throw new SellerRecoveryError('Reconcile reversed receipts or excess collection and its existing native credits before attributing this history.');
 const complete=history.candidates.length>0&&history.candidates.every(c=>c.nativeProof&&c.attributedPaisa+(c===candidate?input.amountPaisa:0)===c.capacityPaisa)
  &&history.candidates.reduce((sum,c)=>sum+BigInt(c.caseAttributedPaisa),BigInt(0))===BigInt(history.recognizedPaisa);
 const blocker=complete?null:'Reconcile the remaining shared historical deduction attribution before further collection.';
 const state=blocker?'reconciliation':remaining===BigInt(0)?row.disputedPaisa?'disputed':'recovered':'awaiting_approval';
 if(input.amountPaisa===0&&row.historicalRecoveredPaisa===total&&row.confirmedPaisa===source.confirmedPaisa&&row.exposurePaisa===source.exposurePaisa&&row.blocker===blocker&&row.state===state&&row.approvedCapPaisa===0)throw new SellerRecoveryError('This original historical attribution is already reconciled.');
 const pendingDisputes=await pendingRecoveryDisputes(db,row.id);
 const clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 const statements=[...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  ...paymentGuard(db,'NOT EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=?)',[source.orderId,ctx.actorId])];
 if(candidate&&input.amountPaisa>0)statements.push(db.prepare(`INSERT INTO seller_recovery_historical_attributions(id,case_id,case_revision,seller_id,refund_id,kind,payout_id,scope_id,native_deduction_paisa,amount_paisa,actor_id,request_id,created_at,evidence_reference,reason,public_message)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,${clock},?,?,?)`).bind(crypto.randomUUID(),row.id,row.revision,row.sellerId,source.refundId,candidate.kind,candidate.payoutId,candidate.scopeId,candidate.capacityPaisa,input.amountPaisa,ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage));
 statements.push(db.prepare(`UPDATE seller_recovery_cases SET exposure_paisa=?,confirmed_paisa=?,historical_recovered_paisa=?,approved_cap_paisa=0,plan_json=NULL,
  state=?,blocker=?,revision=revision+1,next_action_at=COALESCE(?,${clock}+86400000),updated_at=${clock} WHERE id=? AND revision=?`)
  .bind(source.exposurePaisa,source.confirmedPaisa,total,state,blocker,pendingDisputes[0]?.dueAt??null,row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'history_reviewed',?,?,?,?,${clock})`)
   .bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({candidate,amountPaisa:input.amountPaisa,previousRecordedPaisa:row.historicalRecoveredPaisa,recognizedPaisa:total,remainingPaisa:number(remaining),complete,evidenceReference:input.evidenceReference,publicMessage:input.publicMessage}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'history_reviewed',input.publicMessage),...authority.statements,receipt.insert(result));
 try{await db.batch(statements);}catch(error){const recovered=await read();if(recovered.replayed)return recovered.result as {id:string;revision:number};throw error;}
 return result;
}

/** Repair a proven original non-seller cost before any recovery collection. A
 * collected/returned/reversed legacy source needs its own explicit disposition. */
export async function compensateSellerRecoverySource(db:D1Database,ctx:CommandContext,input:{caseId:string;reviewDigest:string;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'source_compensated',row.id,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;revision:number};
 if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||source.kind!=='refund'||source.model==='fixed'||source.blockerCode!=='company_compensation'||source.compensationPaisa<=0||source.companyCompensatedPaisa||source.confirmedPaisa!==0||row.confirmedPaisa!==0||row.absorbedPaisa!==0||row.restoredPaisa!==0||row.approvedCapPaisa!==0)throw new SellerRecoveryError('Review the exact original completed non-seller responsibility and uncompensated native debit.');
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the original company-cost proof, decision and owner explanation.',400);
 if(source.historicalNettingPaisa||row.historicalRecoveredPaisa||source.historicalReview?.recognizedPaisa||await db.prepare('SELECT 1 FROM seller_recovery_allocations WHERE case_id=?').bind(row.id).first())throw new SellerRecoveryError('Reconcile already collected, returned or reversed money and its existing native credits before this source compensation.');
 const disposition=recoverySourceDispositionSql(source.model),bindings=recoveryDispositionBindings(source.model,source.id,source.sellerId);
 if(await db.prepare(disposition.reservedSql).bind(...bindings.reserved).first())throw new SellerRecoveryError('Reconcile the reserved original adjustment and actual payout outcome before compensating this source.');
 const original=await db.prepare('SELECT operation_request_id AS requestId FROM refunds WHERE id=? AND status=\'paid\'').bind(source.id).first<{requestId:string|null}>();
 if(!original?.requestId)throw new SellerRecoveryError('Reconcile the original completed refund operation before compensating its native cost.');
 const column=source.model==='registered'?'registered_payout_id':'managed_payout_id';
 for(const id of source.originalPayoutIds)if(!await db.prepare(`SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities b ON b.packet_kind='payout' AND b.packet_id=t.id AND b.identity_hash=t.transaction_identity_hash AND b.amount_paisa=t.amount_paisa WHERE t.${column}=? AND t.state='paid' UNION ALL SELECT 1 WHERE ${retiredRecoveryPayoutSql(source.model,'?','?')}`).bind(id,id,source.sellerId).first())throw new SellerRecoveryError('Reconcile the original unsent or uncertain payout before compensating this source.');
 const entitlement=source.model==='managed'?await db.prepare(`SELECT e.id FROM managed_entitlements e JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE e.seller_id=? AND s.order_item_id=? AND e.earned_at IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=? AND x.reason_code='refund_responsibility')`).bind(row.sellerId,source.orderItemId,source.id).first<{id:string}>():null;
 if(source.model==='managed'&&!entitlement)throw new SellerRecoveryError('Review the existing original responsibility entry before any additional correction.');
 const creditId=crypto.randomUUID(),id=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 const statements=[...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  ...paymentGuard(db,`NOT EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=?) AND EXISTS(SELECT 1 FROM refunds WHERE id=? AND status='paid' AND operation_request_id=?)
   AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations WHERE case_id=?)`,[source.orderId,ctx.actorId,source.id,original.requestId,row.id])];
 if(entitlement)statements.push(...managedRefundResponsibilityStatements(db,{entitlementId:entitlement.id,refundId:source.id,actorId:ctx.actorId,requestId:ctx.requestId,now:ctx.now,completedRefundRequestId:original.requestId}),...paymentGuard(db,'changes()=1'));
 else statements.push(db.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,refund_id,type,amount_paisa,available_at,description,created_at)
  VALUES(?,?,?,?,'recovery_source_compensation',?,${clock},?,${clock})`).bind(creditId,row.sellerId,source.orderItemId,source.id,source.compensationPaisa,'Original company responsibility compensation '+row.id));
 statements.push(db.prepare(`INSERT INTO seller_recovery_source_reviews(id,case_id,case_revision,kind,amount_paisa,registered_credit_id,managed_credit_id,source_json,actor_id,request_id,created_at,evidence_reference,reason,public_message)
  VALUES(?,?,?,'company_compensation',?,?,${entitlement?"(SELECT id FROM managed_settlement_entries WHERE request_id=? AND refund_id=? AND reason_code='refund_responsibility')":'NULL'},?,?,?,${clock},?,?,?)`)
  .bind(id,row.id,row.revision,source.compensationPaisa,entitlement?null:creditId,...entitlement?[ctx.requestId,source.id]:[],JSON.stringify(source),ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage),
  db.prepare(`UPDATE seller_recovery_cases SET exposure_paisa=0,confirmed_paisa=0,approved_cap_paisa=0,plan_json=NULL,state=?,blocker=NULL,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`)
   .bind(row.disputedPaisa?'disputed':'closed_no_balance',row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'source_compensated',?,?,?,?,${clock})`)
   .bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({sourceReviewId:id,amountPaisa:source.compensationPaisa,publicMessage:input.publicMessage,evidenceReference:input.evidenceReference}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'source_compensated',input.publicMessage),...authority.statements,receipt.insert(result));
 try{await db.batch(statements);}catch(error){const saved=await read();if(saved.replayed)return saved.result as {id:string;revision:number};throw error;}
 return result;
}

/** Explicitly release an old instruction after proof that no money remained sent.
 * Monetary balances and existing approvals are unchanged; the refreshed source is
 * independently reviewed before a new payout or a newly collectible recovery.
 */
export async function retireSellerRecoveryPayoutSource(db:D1Database,ctx:CommandContext,input:{caseId:string;payoutId:string;reviewDigest:string;noFundsRemainSentConfirmed:boolean;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'payout_source_retired',row.id,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;revision:number};
 const original=source.retirementSources?.find(p=>p.id===input.payoutId);
 if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||input.noFundsRemainSentConfirmed!==true||!original)throw new SellerRecoveryError('Review the exact original unsent or fully reconciled instruction. Paid, processing, partial-return and uncertain money cannot be released.');
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the original instruction proof, reservation decision and owner explanation.',400);
 const model=recoveryPayoutModels[row.model],packets=(await db.prepare(`SELECT id,state,revision,started_at AS startedAt,account_version_id AS accountId,source_snapshot_json AS snapshot FROM payout_transfer_packets WHERE ${model.column}=? ORDER BY id`).bind(original.id).all<{id:string;state:string;revision:number;startedAt:number|null;accountId:string;snapshot:string}>()).results;
 if(packets.some(p=>JSON.parse(p.snapshot).ownerId===ctx.actorId))throw new RecoveryAuthorityError('An operator with an original beneficiary interest cannot retire this instruction.');
 const linksSql=row.model==='registered'?`SELECT pe.ledger_entry_id AS id,e.amount_paisa AS amount,pe.released_at AS releasedAt FROM payout_entries pe JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id WHERE pe.payout_id=? ORDER BY pe.ledger_entry_id`:
  row.model==='managed'?`SELECT 'allocation' AS kind,a.entitlement_id AS id,a.amount_paisa AS amount,a.disposition FROM managed_payout_allocations a WHERE a.payout_id=? UNION ALL SELECT 'legacy' AS kind,pe.settlement_entry_id AS id,x.amount_paisa AS amount,'retained' AS disposition FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE pe.payout_id=? ORDER BY kind,id`:
  `SELECT obligation_id AS id,amount_paisa AS amount FROM managed_supplier_payments WHERE id=?`;
 const links=await db.prepare(linksSql).bind(original.id,...row.model==='managed'?[original.id]:[]).all();
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 const statements=[...authority.statements,...nativeSourceGuards(db,source,{retireReservation:true}),
  ...paymentGuard(db,`EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id=?) AND NOT EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=?)
   AND (SELECT COUNT(*) FROM payout_transfer_packets WHERE ${model.column}=?)=?`,[row.sellerId,source.ownerId,source.orderId,ctx.actorId,original.id,packets.length])];
 const voided=packets.filter(p=>p.state==='prepared'||p.state==='approved');
 if(voided.length)for(const p of voided)statements.push(...await financeEvidenceReferenceGuards(db,input.evidenceReference,{kind:'company_account',id:p.accountId}));
 else if(packets.length)statements.push(...await financeEvidenceReferenceGuards(db,input.evidenceReference,{kind:'company_account',id:packets[packets.length-1].accountId}));
 else statements.push(...await recoveryEvidenceGuards(db,input.evidenceReference,source));
 for(const p of packets)statements.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM payout_transfer_packets WHERE id=? AND ${model.column}=? AND state=? AND revision=? AND source_snapshot_json=?)`,[p.id,original.id,p.state,p.revision,p.snapshot]));
 statements.push(db.prepare(`INSERT INTO seller_recovery_payout_retirements(id,case_id,case_revision,seller_id,payout_model,payout_id,original_status,original_amount_paisa,original_destination,original_updated_at,source_json,actor_id,request_id,created_at,evidence_reference,reason,public_message)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,${clock},?,?,?)`).bind(id,row.id,row.revision,row.sellerId,row.model,original.id,original.status,original.amountPaisa,original.destination,original.updatedAt,JSON.stringify({source,original,packets,links:links.results}),ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage));
 for(const p of voided)statements.push(db.prepare(`UPDATE payout_transfer_packets SET state='void',revision=revision+1,recorded_by=?,recorded_at=${clock},evidence_reference=? WHERE id=? AND revision=? AND state=? AND started_at IS NULL`).bind(ctx.actorId,input.evidenceReference,p.id,p.revision,p.state),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,?,'payout.transfer.event','payout_transfer',?,'voided',?,?,${clock})`).bind(crypto.randomUUID(),ctx.actorId,p.id,JSON.stringify({model:row.model,payoutId:original.id,input:{notSentConfirmed:true,reason:input.reason,evidenceReference:input.evidenceReference,recoveryRetirementId:id}}),ctx.requestId));
 statements.push(db.prepare(`UPDATE ${model.table} SET status=?,updated_at=${clock}${row.model==='registered'?',operation_request_id=?':''} WHERE id=? AND status=? AND updated_at=?`).bind(model.terminal,...row.model==='registered'?[ctx.requestId]:[],original.id,original.status,original.updatedAt),...paymentGuard(db,'changes()=1'));
 if(row.model==='registered')statements.push(db.prepare(`UPDATE payout_entries SET released_at=${clock},release_reason='recovery_source_retired' WHERE payout_id=? AND released_at IS NULL`).bind(original.id),
  db.prepare(`INSERT INTO payout_events(id,payout_id,from_status,to_status,action,actor_id,actor_type,note,request_id,created_at) VALUES(?,?,?,'rejected','recovery_source_retired',?,'super_admin',?,?,${clock})`).bind(crypto.randomUUID(),original.id,original.status,ctx.actorId,input.reason,ctx.requestId));
 if(row.model==='managed')statements.push(db.prepare(`UPDATE managed_payout_allocations SET disposition='released',terminal_at=${clock} WHERE payout_id=? AND disposition='reserved'`).bind(original.id));
 statements.push(...paymentGuard(db,retiredRecoveryPayoutSql(row.model,'?','?'),[original.id,row.sellerId]),
  db.prepare(`UPDATE seller_recovery_cases SET revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'payout_source_retired',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({retirementId:id,payoutId:original.id,publicMessage:input.publicMessage,evidenceReference:input.evidenceReference}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'payout_source_retired',input.publicMessage),...authority.statements,receipt.insert(result));
 try{await db.batch(statements);}catch(error){const saved=await read();if(saved.replayed)return saved.result as {id:string;revision:number};throw error;}
 return result;
}

/** Restore an overturned original unpaid charge; zero recovery is not zero original cost. */
export async function correctUnpaidSellerRecoverySource(db:D1Database,ctx:CommandContext,input:{caseId:string;newUnpaidResponsibilityPaisa:number;reviewDigest:string;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'unpaid_responsibility_corrected',row.id,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;revision:number};
 money(input.newUnpaidResponsibilityPaisa);
 const original=source.originalUnpaidOffsetPaisa??0,previous=source.unpaidResponsibilityRestoredPaisa??0,amount=original-previous-input.newUnpaidResponsibilityPaisa;
 const carrierCovered=source.carrierUnpaidCoveredPaisa??0;
 if(input.newUnpaidResponsibilityPaisa<carrierCovered)throw new SellerRecoveryError('Review a separate carrier-money disposition before overturning its covered original cost.');
 const combined=(!!source.originalPartialReviewId||source.model==='fixed'&&original<source.nativeDebitPaisa)&&recoveryPosition({...row,recovered:await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa)}).recoveredPaisa===0;
 if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||row.blocker||source.blocker||row.exposurePaisa||row.confirmedPaisa||source.exposurePaisa||source.confirmedPaisa||row.approvedCapPaisa||row.absorbedPaisa||!combined&&(row.restoredPaisa!==carrierCovered||row.liabilityReducedPaisa||original!==source.nativeDebitPaisa)||row.historicalRecoveredPaisa||row.disputedPaisa||amount<=0)throw new SellerRecoveryError('Review the current remaining original unpaid responsibility. Collected, disputed or uncertain money requires its own disposition.');
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the original correction evidence, independent reason and owner explanation.',400);
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 const native=recoveryNativeSettlementStatements(db,source,ctx,{caseId:row.id,creditId:crypto.randomUUID(),amountPaisa:amount,kind:'correction'});
 const fixed=source.model==='fixed'?await db.prepare('SELECT obligation_id AS id FROM managed_supplier_adjustments WHERE id=?').bind(source.id).first<{id:string}>():null;
 try{await db.batch([...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),...native.statements,
  db.prepare(`INSERT INTO seller_recovery_unpaid_corrections(id,case_id,case_revision,original_charge_paisa,previous_restored_paisa,amount_paisa,registered_credit_id,managed_credit_id,fixed_obligation_id,source_json,actor_id,request_id,created_at,evidence_reference,reason,public_message)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,${clock},?,?,?)`).bind(id,row.id,row.revision,original,previous,amount,native.registeredCreditId,native.managedCreditId,fixed?.id??null,JSON.stringify(source),ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage),
  db.prepare(`UPDATE seller_recovery_cases SET revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'unpaid_responsibility_corrected',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({correctionId:id,amountPaisa:amount,newUnpaidResponsibilityPaisa:input.newUnpaidResponsibilityPaisa,publicMessage:input.publicMessage,evidenceReference:input.evidenceReference}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'unpaid_responsibility_corrected',input.publicMessage),...authority.statements,receipt.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}
 return result;
}

/** Explicitly close a formerly provisional source after current native facts prove zero liability. */
export async function refreshSellerRecoveryZeroSource(db:D1Database,ctx:CommandContext,input:{caseId:string;reviewDigest:string;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'zero_source_reviewed',row.id,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;revision:number};
 if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||source.blocker||source.exposurePaisa||source.confirmedPaisa||source.historicalNettingPaisa||row.confirmedPaisa||row.approvedCapPaisa||row.historicalRecoveredPaisa||row.absorbedPaisa||row.restoredPaisa||row.liabilityReducedPaisa||!row.blocker&&!row.exposurePaisa&&row.state==='closed_no_balance')throw new SellerRecoveryError('Review the exact current zero-liability source. Collected, corrected or uncertain money needs its separate disposition.');
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the current zero-balance proof, decision and owner explanation.',400);
 const clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 const statements=[...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  ...paymentGuard(db,`NOT EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=?) AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations WHERE case_id=?)
   AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions WHERE case_id=?) AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections WHERE case_id=?)`,[source.orderId,ctx.actorId,row.id,row.id,row.id])];
 if(source.model==='fixed'){
  const paid=`COALESCE((SELECT SUM(p.amount_paisa) FROM managed_supplier_payments p WHERE p.obligation_id=obligation.id AND EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=packet.id AND bank.identity_hash=packet.transaction_identity_hash AND bank.amount_paisa=packet.amount_paisa WHERE packet.supplier_payment_id=p.id AND packet.state='paid')),0)`;
  const prior=`COALESCE((SELECT SUM(previous.amount_paisa) FROM managed_supplier_adjustments previous WHERE previous.obligation_id=obligation.id AND (previous.created_at<adjustment.created_at OR previous.created_at=adjustment.created_at AND previous.id<adjustment.id)),0)`;
  statements.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM managed_supplier_adjustments adjustment JOIN managed_supplier_obligations obligation ON obligation.id=adjustment.obligation_id
   WHERE adjustment.id=? AND obligation.seller_id=? AND (${paid}+${prior}+adjustment.amount_paisa<=obligation.original_amount_paisa OR adjustment.amount_paisa=0)
   AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments pending WHERE pending.obligation_id=obligation.id AND pending.status='approved'
    AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa WHERE packet.supplier_payment_id=pending.id AND packet.state='paid'))
   AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN managed_supplier_payments pending ON pending.id=packet.supplier_payment_id WHERE pending.obligation_id=obligation.id AND packet.state IN('processing','uncertain')))`,[source.id,source.sellerId]));
 }else statements.push(...paymentGuard(db,`NOT EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=? AND cost.party='seller' AND cost.seller_id=? AND cost.amount_paisa>0)
  OR EXISTS(SELECT 1 FROM seller_recovery_unpaid_sources unpaid WHERE unpaid.case_id=? AND unpaid.amount_paisa=?)`,[source.id,source.sellerId,row.id,source.nativeDebitPaisa]));
 statements.push(db.prepare(`UPDATE seller_recovery_cases SET exposure_paisa=0,confirmed_paisa=0,state=?,blocker=NULL,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(row.disputedPaisa?'disputed':'closed_no_balance',row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'zero_source_reviewed',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({source,publicMessage:input.publicMessage,evidenceReference:input.evidenceReference}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'zero_source_reviewed',input.publicMessage),...authority.statements,receipt.insert(result));
 try{await db.batch(statements);}catch(error){const saved=await read();if(saved.replayed)return saved.result as {id:string;revision:number};throw error;}
 return result;
}

/** Recognize an existing original unpaid deduction; this is not a recovery or a new ledger entry. */
export async function reviewUnpaidSellerRecoverySource(db:D1Database,ctx:CommandContext,input:{caseId:string;reviewDigest:string;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'unpaid_source_reviewed',row.id,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;revision:number};
 const proof=source.unpaidSource;
 if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||source.kind!=='refund'||!proof||source.originalUnpaidReviewId||source.blockerCode!=='unpaid_original'||proof.offsetPaisa!==source.nativeDebitPaisa||row.confirmedPaisa||row.approvedCapPaisa||row.absorbedPaisa||row.restoredPaisa||row.historicalRecoveredPaisa||source.historicalNettingPaisa)throw new SellerRecoveryError('Review the exact original earned, wholly unpaid source and existing native refund adjustment. Instructions, partial deficits and already collected money need their explicit disposition.');
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the original unpaid-earnings proof, decision and owner explanation.',400);
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 const statements=[...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  ...paymentGuard(db,`NOT EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=?)`,[source.orderId,ctx.actorId]),
  db.prepare(`INSERT INTO seller_recovery_unpaid_sources(id,case_id,case_revision,seller_id,refund_id,order_item_id,scope_id,basis_paisa,amount_paisa,remaining_paisa,source_json,actor_id,request_id,created_at,evidence_reference,reason,public_message)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,${clock},?,?,?)`).bind(id,row.id,row.revision,row.sellerId,source.id,proof.orderItemId,proof.scopeId,proof.basisPaisa,proof.offsetPaisa,proof.remainingPaisa,JSON.stringify(source),ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage),
  db.prepare(`UPDATE seller_recovery_cases SET exposure_paisa=0,confirmed_paisa=0,approved_cap_paisa=0,plan_json=NULL,state=?,blocker=NULL,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(row.disputedPaisa?'disputed':'closed_no_balance',row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'unpaid_source_reviewed',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({unpaidSourceId:id,amountPaisa:proof.offsetPaisa,publicMessage:input.publicMessage,evidenceReference:input.evidenceReference}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'unpaid_source_reviewed',input.publicMessage),...authority.statements,receipt.insert(result)];
 try{await db.batch(statements);}catch(error){const saved=await read();if(saved.replayed)return saved.result as {id:string;revision:number};throw error;}
 return result;
}

/** Reconcile a shared original earned pool; only its additional deficit becomes confirmed exposure. */
export async function reviewPartialUnpaidSellerRecoverySource(db:D1Database,ctx:CommandContext,input:{caseId:string;reviewDigest:string;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'partial_source_reviewed',row.id,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;revision:number};
 const proof=source.partialUnpaidSource;
 if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||source.kind!=='refund'||!proof||source.originalUnpaidReviewId||source.originalPartialReviewId||proof.nativeDebitPaisa!==source.nativeDebitPaisa||row.confirmedPaisa||row.approvedCapPaisa||row.absorbedPaisa||row.restoredPaisa||row.historicalRecoveredPaisa||source.historicalNettingPaisa||source.compensationPaisa)throw new SellerRecoveryError('Review the exact original shared earnings, retained other costs and additional deficit before confirming this source.');
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the original shared-pool evidence, decision and owner explanation.',400);
 const id=crypto.randomUUID(),deficit=proof.nativeDebitPaisa-proof.offsetPaisa,clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 try{await db.batch([...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  db.prepare(`INSERT INTO seller_recovery_partial_sources(id,case_id,case_revision,seller_id,refund_id,order_item_id,scope_id,basis_paisa,native_charge_paisa,capacity_paisa,used_paisa,amount_paisa,source_json,actor_id,request_id,created_at,evidence_reference,reason,public_message)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${clock},?,?,?)`).bind(id,row.id,row.revision,row.sellerId,source.id,proof.orderItemId,proof.scopeId,proof.basisPaisa,proof.nativeDebitPaisa,proof.capacityPaisa,proof.usedPaisa,proof.offsetPaisa,JSON.stringify(source),ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage),
  db.prepare(`UPDATE seller_recovery_cases SET exposure_paisa=?,confirmed_paisa=?,approved_cap_paisa=0,plan_json=NULL,state=?,blocker=NULL,next_action_at=${clock}+86400000,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(deficit,deficit,row.disputedPaisa?'disputed':'awaiting_approval',row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'partial_source_reviewed',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({partialSourceId:id,amountPaisa:proof.offsetPaisa,deficitPaisa:deficit,publicMessage:input.publicMessage,evidenceReference:input.evidenceReference}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'partial_source_reviewed',input.publicMessage),...authority.statements,receipt.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as {id:string;revision:number};if(error instanceof Error&&/recovery_partial|operation_transaction_guards|CHECK constraint/i.test(error.message))throw new SellerRecoveryError('The original earned pool or review changed. Refresh its current shared use before another decision.');throw error;}
 return result;
}

/** Approval establishes the collectible cap; the native adjustment is never posted a second time. */
export async function approveSellerRecovery(db:D1Database,ctx:CommandContext,input:{caseId:string;reviewDigest:string;evidenceReference:string;reason:string}){
  const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
  const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
  const reason=input.reason.trim(),evidence=input.evidenceReference.trim();
  if(reason.length<10||reason.length>1500||evidence.length<8||evidence.length>1500)throw new SellerRecoveryError('Record the actual responsibility reconciliation and evidence.',400);
  const identity={action:'seller.recovery.approved',subjectType:'seller_recovery',subjectId:row.id};
  const read=async()=>{try{return await commandReceipt(db,ctx,identity,input);}catch(error){if(error instanceof Error&&error.message==='Request reference was already used for different command content.')throw new SellerRecoveryError(error.message);throw error;}};
  const receipt=await read();if(receipt.replayed)return receipt.result as {id:string;revision:number};
  if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source))throw new SellerRecoveryError('Review the exact current original refund, payout and adjustment before approval.');
  if(source.blocker||source.confirmedPaisa<=0||!['provisional','awaiting_approval','reconciliation'].includes(row.state)||row.approvedCapPaisa!==0)
    throw new SellerRecoveryError(source.blocker??'Review the existing recovery plan and actual remaining liability.');
  const plan={methods:['cash','returned_payout','carrier'],nettingAuthorized:false,evidenceReference:evidence,confirmedPaisa:source.confirmedPaisa,reviewDigest:input.reviewDigest};
  const responseNotice={inbox:await operationalNotificationRequestId('business.seller.recovery',ctx.requestId,'owner','in_app'),email:await operationalNotificationRequestId('business.seller.recovery',ctx.requestId,'owner','email')};
  const clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
  try{await db.batch([...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,evidence,source),
    ...paymentGuard(db,'EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id<>?) AND NOT EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=?)',[source.sellerId,ctx.actorId,source.orderId,ctx.actorId]),
    db.prepare(`UPDATE seller_recovery_cases SET exposure_paisa=?,confirmed_paisa=?,approved_cap_paisa=?,state='open',blocker=NULL,approved_by=?,approved_at=${clock},plan_json=?,
      revision=revision+1,next_action_at=${clock}+86400000,updated_at=${clock} WHERE id=? AND revision=? AND approved_cap_paisa=0 AND state=?`)
      .bind(source.exposurePaisa,source.confirmedPaisa,source.confirmedPaisa,ctx.actorId,JSON.stringify(plan),row.id,row.revision,row.state),...paymentGuard(db,'changes()=1'),
    db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'approved',?,?,?,?,${clock})`)
      .bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,reason,JSON.stringify({source,plan,responseNotice}),ctx.requestId),
    ...await recoveryNoticeStatements(db,ctx,row.id,'approved',`The confirmed original net recovery is NPR ${(source.confirmedPaisa/100).toFixed(2)}. Review the original order, actual payout and native adjustment in your itemized statement. Please respond, propose an arrangement or request a review within seven calendar days after this notice reaches your inbox and has a successful email handoff or recorded actual contact. This is a response target, not a deadline to repay the entire balance.`),...authority.statements,receipt.insert(result)]);
  }catch(error){const recovered=await read();if(recovered.replayed)return recovered.result as {id:string;revision:number};throw error;}
  return result;
}

/** Actual receipt allocation and settlement of the existing native debit are one transaction. */
/** Apply actual carrier money once and restore overlapping seller collection within the same native credit. */
/** Restore only a carrier-covered original unpaid component; any additional
 * seller deficit remains a separate, unchanged recovery obligation. */
export async function reconcileSellerRecoveryUnpaidCarrierReceipt(db:D1Database,ctx:CommandContext,input:{caseId:string;receiptId:string;receiptRevision:number;amountPaisa:number;reviewDigest:string;originalUnpaidCostConfirmed:boolean;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payment.receipt.verify',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'carrier_unpaid_reconciled',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;revision:number};
 money(input.amountPaisa);
 if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||row.blocker||source.blocker||source.confirmedPaisa!==row.confirmedPaisa||source.historicalNettingPaisa!==row.historicalRecoveredPaisa||input.originalUnpaidCostConfirmed!==true||input.amountPaisa<=0||input.amountPaisa>(source.carrierUnpaidAvailablePaisa??0))throw new SellerRecoveryError('Review the exact remaining original unpaid cost and its actual carrier reimbursement.');
 if(!Number.isSafeInteger(input.receiptRevision)||input.receiptRevision<0||input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the original unpaid component, current carrier credit and owner explanation.',400);
 const actual=await db.prepare(`SELECT receipt.payer_user_id AS payerId,receipt.status,receipt.currency,control.revision,
  receipt.amount_minor-COALESCE((SELECT SUM(bank_reversal.amount_minor) FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=receipt.id),0)-COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=receipt.id AND u.state<>'released'),0)-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.receipt_id=receipt.id),0) AS remaining
  FROM company_money_receipts receipt JOIN company_receipt_controls control ON control.receipt_id=receipt.id WHERE receipt.id=? AND receipt.kind='bank_credit' AND NOT ${pendingRecoveryReceiptReversalSql('receipt.id')}`).bind(input.receiptId).first<{payerId:string|null;status:string;currency:string;revision:number;remaining:number}>();
 if(!actual||actual.status!=='verified'||actual.currency!=='NPR'||actual.payerId!==null||actual.revision!==input.receiptRevision||actual.remaining<input.amountPaisa)throw new SellerRecoveryError('Use an independently verified unallocated carrier credit, with its exact current revision.');
 const id=crypto.randomUUID(),allocationId=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 const native=recoveryNativeSettlementStatements(db,source,ctx,{caseId:row.id,creditId:crypto.randomUUID(),amountPaisa:input.amountPaisa,kind:'settlement'});
 try{await db.batch([...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  db.prepare(`INSERT INTO seller_recovery_carrier_unpaid_reviews(id,case_id,case_revision,receipt_id,receipt_revision,allocation_id,amount_paisa,source_json,actor_id,request_id,created_at,evidence_reference,reason,public_message)
   VALUES(?,?,?,?,?,?,?,?,?,?,${clock},?,?,?)`).bind(id,row.id,row.revision,input.receiptId,input.receiptRevision,allocationId,input.amountPaisa,JSON.stringify({source,actual}),ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage),
  db.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=? AND revision=?').bind(input.receiptId,input.receiptRevision),...paymentGuard(db,'changes()=1'),...native.statements,
  db.prepare(`INSERT INTO seller_recovery_allocations(id,case_id,method,amount_paisa,receipt_id,registered_credit_id,managed_credit_id,fixed_credit_id,evidence_reference,reason,actor_id,request_id,created_at)
   VALUES(?,?,'carrier',?,?,?,?,?,?,?,?,?,${clock})`).bind(allocationId,row.id,input.amountPaisa,input.receiptId,native.registeredCreditId,native.managedCreditId,native.fixedCreditId,input.evidenceReference,input.reason,ctx.actorId,ctx.requestId),
  db.prepare(`UPDATE seller_recovery_cases SET restored_paisa=restored_paisa+?,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(input.amountPaisa,row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'carrier_unpaid_reconciled',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({reviewId:id,allocationId,receiptId:input.receiptId,amountPaisa:input.amountPaisa,publicMessage:input.publicMessage,evidenceReference:input.evidenceReference}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'carrier_unpaid_reconciled',input.publicMessage),...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;if(error instanceof Error&&/recovery_carrier_unpaid|operation_transaction_guards|recovery_remaining_cap/i.test(error.message))throw new SellerRecoveryError('The original unpaid component, carrier receipt or current review changed. Refresh before another decision.');throw error;}
 return result;
}

export async function reconcileSellerRecoveryCarrierReceipt(db:D1Database,ctx:CommandContext,input:{caseId:string;receiptId:string;receiptRevision:number;amountPaisa:number;resolveDisputedPaisa:number;reviewDigest:string;originalCostReimbursementConfirmed:boolean;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payment.receipt.verify',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'carrier_reconciled',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;revision:number};
 if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||row.blocker||source.blocker||source.confirmedPaisa!==row.confirmedPaisa||source.historicalNettingPaisa!==row.historicalRecoveredPaisa||input.originalCostReimbursementConfirmed!==true)throw new SellerRecoveryError('Review the exact original cost, actual carrier credit and existing seller collection.');
 if(!Number.isSafeInteger(input.receiptRevision)||input.receiptRevision<0||input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the original carrier cost proof, current receipt and owner explanation.',400);
 const recovered=await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa),position=recoveryPosition({...row,recovered});
 let disposition:ReturnType<typeof carrierRecoveryDisposition>;
 try{disposition=carrierRecoveryDisposition({confirmed:row.confirmedPaisa,absorbed:row.absorbedPaisa,disputed:row.disputedPaisa,recovered:position.recoveredPaisa,carrierRecovered:recovered.carrier,incoming:input.amountPaisa,resolveDisputed:input.resolveDisputedPaisa});}catch(error){throw new SellerRecoveryError(error instanceof Error?error.message:'Review the original reimbursement amounts.');}
 const actual=await db.prepare(`SELECT r.payer_user_id AS payerId,r.status,r.currency,control.revision,
  r.amount_minor-COALESCE((SELECT SUM(bank_reversal.amount_minor) FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id),0)-COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0) AS remaining
  FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE r.id=? AND r.kind='bank_credit' AND NOT ${pendingRecoveryReceiptReversalSql('r.id')}`).bind(input.receiptId).first<{payerId:string|null;status:string;currency:string;revision:number;remaining:number}>();
 if(!actual||actual.status!=='verified'||actual.currency!=='NPR'||actual.revision!==input.receiptRevision||actual.remaining<input.amountPaisa||actual.payerId!==null)throw new SellerRecoveryError('Use an independently verified unallocated carrier credit in NPR, with its exact current source. Seller money is not carrier reimbursement.');
 const collections=(await db.prepare(`SELECT a.id,a.method,${actualRecoveryAllocationSql('a')}-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0) AS remaining FROM seller_recovery_allocations a WHERE a.case_id=? AND a.method<>'carrier' ORDER BY a.created_at DESC,a.id DESC`).bind(row.id).all<{id:string;method:string;remaining:number}>()).results;
 const id=crypto.randomUUID(),allocationId=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 const restorationStatements:D1PreparedStatement[]=[];let remaining=disposition.restoredPaisa;
 const historical=recovered.earnings-collections.filter(a=>a.method==='earnings').reduce((sum,a)=>sum+a.remaining,0);
 for(const collection of [...collections,{id:null,method:'earnings',remaining:historical}]){
  const amount=Math.min(remaining,collection.remaining);if(amount<=0)continue;remaining-=amount;
  restorationStatements.push(db.prepare('INSERT INTO seller_recovery_carrier_restorations(id,review_id,case_id,allocation_id,method,amount_paisa) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,row.id,collection.id,collection.method,amount));
 }
 if(remaining)throw new SellerRecoveryError('Reconcile the original seller collection before restoring the carrier overlap.');
 const native=recoveryNativeSettlementStatements(db,source,ctx,{caseId:row.id,creditId:crypto.randomUUID(),amountPaisa:disposition.nativeCreditPaisa,kind:'settlement'});
 try{await db.batch([...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  db.prepare(`INSERT INTO seller_recovery_carrier_reviews(id,case_id,case_revision,receipt_id,receipt_revision,allocation_id,amount_paisa,restored_paisa,resolved_disputed_paisa,source_json,actor_id,request_id,created_at,evidence_reference,reason,public_message)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,${clock},?,?,?)`).bind(id,row.id,row.revision,input.receiptId,input.receiptRevision,allocationId,input.amountPaisa,disposition.restoredPaisa,input.resolveDisputedPaisa,JSON.stringify({source,recovered,actual}),ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage),
  db.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=? AND revision=?').bind(input.receiptId,input.receiptRevision),...paymentGuard(db,'changes()=1'),...native.statements,...restorationStatements,
  db.prepare(`INSERT INTO seller_recovery_allocations(id,case_id,method,amount_paisa,receipt_id,registered_credit_id,managed_credit_id,fixed_credit_id,evidence_reference,reason,actor_id,request_id,created_at)
   VALUES(?,?,'carrier',?,?,?,?,?,?,?,?,?,${clock})`).bind(allocationId,row.id,input.amountPaisa,input.receiptId,native.registeredCreditId,native.managedCreditId,native.fixedCreditId,input.evidenceReference,input.reason,ctx.actorId,ctx.requestId),
  db.prepare(`UPDATE seller_recovery_cases SET restored_paisa=restored_paisa+?,disputed_paisa=?,state=?,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(disposition.restoredPaisa,disposition.disputedPaisa,disposition.disputedPaisa?'disputed':disposition.remainingPaisa?(row.approvedCapPaisa?'part_recovered':'awaiting_approval'):'recovered',row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'carrier_reconciled',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({reviewId:id,allocationId,receiptId:input.receiptId,...disposition,resolveDisputedPaisa:input.resolveDisputedPaisa,publicMessage:input.publicMessage,evidenceReference:input.evidenceReference}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'carrier_reconciled',input.publicMessage),...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}
 return result;
}

/** Retain an actual original payout return, restoring overlap within one native credit. */
export async function reconcileSellerRecoveryReturnedPayout(db:D1Database,ctx:CommandContext,input:{caseId:string;payoutId:string;receiptId:string;receiptRevision:number;amountPaisa:number;resolveDisputedPaisa:number;reviewDigest:string;originalPayoutReturnConfirmed:boolean;evidenceReference:string;reason:string;publicMessage:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payment.receipt.verify',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'payout_return_reconciled',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;revision:number};
 if(ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||row.blocker||source.blocker||source.confirmedPaisa!==row.confirmedPaisa||source.historicalNettingPaisa!==row.historicalRecoveredPaisa||input.originalPayoutReturnConfirmed!==true)throw new SellerRecoveryError('Review the exact original paid transfer, returned bank credit and existing seller collection.');
 if(!Number.isSafeInteger(input.receiptRevision)||input.receiptRevision<0||input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the original payout return proof, current receipt and owner explanation.',400);
 const recovered=await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa),position=recoveryPosition({...row,recovered});
 const original=source.originalPaidPayouts?.find(payout=>payout.payoutId===input.payoutId);
 if(!original||input.amountPaisa>original.availablePaisa)throw new SellerRecoveryError('Review the exact original payout and its remaining shared principal capacity.');
 let disposition:ReturnType<typeof incomingRecoveryDisposition>;
 try{disposition=incomingRecoveryDisposition({kind:'returned_payout',returnedPrincipalAvailable:original.availablePaisa,confirmed:row.confirmedPaisa,absorbed:row.absorbedPaisa,disputed:row.disputedPaisa,recovered:position.recoveredPaisa,carrierRecovered:recovered.carrier,incoming:input.amountPaisa,resolveDisputed:input.resolveDisputedPaisa});}catch(error){throw new SellerRecoveryError(error instanceof Error?error.message:'Review the original reimbursement amounts.');}
 const actual=await db.prepare(`SELECT r.payer_user_id AS payerId,r.status,r.currency,r.bank_at AS bankAt,control.revision,
  r.amount_minor-COALESCE((SELECT SUM(bank_reversal.amount_minor) FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id),0)-COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0) AS remaining
  FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE r.id=? AND r.kind='bank_credit' AND NOT ${pendingRecoveryReceiptReversalSql('r.id')}`).bind(input.receiptId).first<{payerId:string|null;status:string;currency:string;bankAt:number;revision:number;remaining:number}>();
 if(!actual||actual.status!=='verified'||actual.currency!=='NPR'||actual.revision!==input.receiptRevision||actual.remaining<input.amountPaisa||actual.bankAt<original.bankAt||actual.payerId!==null&&actual.payerId!==source.ownerId)throw new SellerRecoveryError('Use independently verified unallocated NPR money returned after this original paid transfer, without another known payer.');
 const collections=(await db.prepare(`SELECT a.id,a.method,${actualRecoveryAllocationSql('a')}-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0) AS remaining FROM seller_recovery_allocations a WHERE a.case_id=? AND a.method<>'carrier' ORDER BY a.created_at DESC,a.id DESC`).bind(row.id).all<{id:string;method:string;remaining:number}>()).results;
 const id=crypto.randomUUID(),allocationId=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 const restorationStatements:D1PreparedStatement[]=[];let remaining=disposition.restoredSellerPaisa;
 const historical=recovered.earnings-collections.filter(a=>a.method==='earnings').reduce((sum,a)=>sum+a.remaining,0);
 for(const collection of [...collections,{id:null,method:'earnings',remaining:historical}]){
  const amount=Math.min(remaining,collection.remaining);if(amount<=0)continue;remaining-=amount;
  restorationStatements.push(db.prepare("INSERT INTO seller_recovery_payout_return_restorations(id,review_id,case_id,allocation_id,method,kind,amount_paisa) VALUES(?,?,?,?,?,'seller_collection',?)").bind(crypto.randomUUID(),id,row.id,collection.id,collection.method,amount));
 }
 if(remaining)throw new SellerRecoveryError('Reconcile the original seller collection before restoring the returned-payout overlap.');
 const native=recoveryNativeSettlementStatements(db,source,ctx,{caseId:row.id,creditId:crypto.randomUUID(),amountPaisa:disposition.nativeCreditPaisa,kind:'settlement'});
 try{await db.batch([...authority.statements,db.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?').bind(source.sellerId),...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  db.prepare(`INSERT INTO seller_recovery_payout_return_reviews(id,case_id,case_revision,payout_model,payout_id,scope_id,original_payout_paisa,scope_paisa,receipt_id,receipt_revision,allocation_id,amount_paisa,restored_paisa,principal_excess_paisa,resolved_disputed_paisa,source_json,actor_id,request_id,created_at,evidence_reference,reason,public_message)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${clock},?,?,?)`).bind(id,row.id,row.revision,row.model,original.payoutId,original.scopeId,original.originalPayoutPaisa,original.scopePaisa,input.receiptId,input.receiptRevision,allocationId,input.amountPaisa,disposition.restoredPaisa,disposition.returnedPrincipalExcessPaisa,input.resolveDisputedPaisa,JSON.stringify({source,recovered,actual,original}),ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage),
  db.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=? AND revision=?').bind(input.receiptId,input.receiptRevision),...paymentGuard(db,'changes()=1'),...native.statements,...restorationStatements,
  db.prepare(`INSERT INTO seller_recovery_allocations(id,case_id,method,amount_paisa,receipt_id,registered_credit_id,managed_credit_id,fixed_credit_id,evidence_reference,reason,actor_id,request_id,created_at)
   VALUES(?,?,'returned_payout',?,?,?,?,?,?,?,?,?,${clock})`).bind(allocationId,row.id,input.amountPaisa,input.receiptId,native.registeredCreditId,native.managedCreditId,native.fixedCreditId,input.evidenceReference,input.reason,ctx.actorId,ctx.requestId),
  ...(disposition.returnedPrincipalExcessPaisa?[db.prepare("INSERT INTO seller_recovery_payout_return_restorations(id,review_id,case_id,allocation_id,method,kind,amount_paisa) VALUES(?,?,?,?,'returned_payout','returned_principal',?)").bind(crypto.randomUUID(),id,row.id,allocationId,disposition.returnedPrincipalExcessPaisa)]:[]),
  db.prepare(`UPDATE seller_recovery_cases SET restored_paisa=restored_paisa+?,disputed_paisa=?,state=?,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(disposition.restoredPaisa,disposition.disputedPaisa,disposition.disputedPaisa?'disputed':disposition.remainingPaisa?(row.approvedCapPaisa?'part_recovered':'awaiting_approval'):(row.confirmedPaisa?(row.absorbedPaisa===row.confirmedPaisa?'absorbed':'recovered'):'closed_no_balance'),row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'payout_return_reconciled',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({reviewId:id,allocationId,payoutId:original.payoutId,receiptId:input.receiptId,...disposition,resolveDisputedPaisa:input.resolveDisputedPaisa,publicMessage:input.publicMessage,evidenceReference:input.evidenceReference}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'payout_return_reconciled',input.publicMessage),...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;if(error instanceof Error&&/recovery_payout_return|recovery_remaining_cap|operation_transaction_guards|CHECK constraint/i.test(error.message))throw new SellerRecoveryError('The original payout principal, receipt or review changed. Refresh its current shared use before another decision.');throw error;}
 return result;
}

export async function allocateSellerRecoveryReceipt(db:D1Database,ctx:CommandContext,input:{caseId:string;receiptId:string;receiptRevision:number;amountPaisa:number;method:'cash'|'returned_payout'|'carrier';evidenceReference:string;reason:string;environment?:RuntimeEnvironment}){
  const authority=await staffMutationGuard(db,ctx.actorId,'payment.receipt.verify',RecoveryAuthorityError,'super_admin');
  const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
  await recoveryExecutionGate(db,source,input.environment);
  const identity={action:'seller.recovery.receipt_allocated',subjectType:'seller_recovery',subjectId:row.id};
  const read=async()=>{try{return await commandReceipt(db,ctx,identity,input);}catch(error){if(error instanceof Error&&error.message==='Request reference was already used for different command content.')throw new SellerRecoveryError(error.message);throw error;}};
  const command=await read();if(command.replayed)return command.result as {id:string;caseId:string;revision:number};
  money(input.amountPaisa);
  if(input.amountPaisa===0||!Number.isSafeInteger(input.receiptRevision)||input.receiptRevision<0||input.reason.trim().length<10||input.reason.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the exact actual amount, source evidence and allocation reason.',400);
  if(input.method!=='cash')throw new SellerRecoveryError('Reconcile incoming-money responsibility before allocating this reimbursement or returned payout.');
  const position=recoveryPosition({...row,recovered:await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa)});
  if(ctx.expectedRevision!==String(row.revision)||row.blocker||source.blocker||source.confirmedPaisa!==row.confirmedPaisa||input.amountPaisa>position.collectiblePaisa)
    throw new SellerRecoveryError('Refresh the confirmed recovery, disputed portion and remaining approved cap before allocation.');
  const actual=await db.prepare(`SELECT r.payer_user_id AS payerId,r.status,r.currency,c.revision,
    r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
    -COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
    -COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0) AS remaining
    FROM company_money_receipts r JOIN company_receipt_controls c ON c.receipt_id=r.id WHERE r.id=? AND r.kind='bank_credit'`).bind(input.receiptId)
    .first<{payerId:string|null;status:string;currency:string;revision:number;remaining:number}>();
  const cashAuthority=await recoveryRepaymentCashGuard(db,{caseId:row.id,receiptId:input.receiptId,ownerId:source.ownerId,amountPaisa:input.amountPaisa});
  if(!cashAuthority.allowed||!actual||actual.status!=='verified'||actual.currency!=='NPR'||actual.revision!==input.receiptRevision||actual.remaining<input.amountPaisa)
    throw new SellerRecoveryError('Use independently verified, unallocated NPR money from this original seller; an incoming claim is not a receipt.');
  const conflict='NOT EXISTS(SELECT 1 FROM company_receipt_conflicts WHERE receipt_id=? AND user_id=?)';
  if(!await db.prepare('SELECT 1 WHERE '+conflict).bind(input.receiptId,ctx.actorId).first())throw new RecoveryAuthorityError('An eligible operator without a personal receipt interest must allocate this money.');
  const id=crypto.randomUUID(),creditId=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id,caseId:row.id,revision:row.revision+1};
  const native=recoveryNativeSettlementStatements(db,source,ctx,{caseId:row.id,creditId,amountPaisa:input.amountPaisa,kind:'settlement'});
  const state=position.remainingPaisa===input.amountPaisa?'recovered':row.disputedPaisa?'disputed':'part_recovered';
  try{await db.batch([...authority.statements,...cashAuthority.statements,
    db.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?').bind(source.sellerId),
    ...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
    ...paymentGuard(db,conflict,[input.receiptId,ctx.actorId]),
    db.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=? AND revision=?').bind(input.receiptId,input.receiptRevision),...paymentGuard(db,'changes()=1'),
    ...native.statements,
    db.prepare(`INSERT INTO seller_recovery_allocations(id,case_id,method,amount_paisa,receipt_id,registered_credit_id,managed_credit_id,fixed_credit_id,evidence_reference,reason,actor_id,request_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,${clock})`).bind(id,row.id,input.method,input.amountPaisa,input.receiptId,native.registeredCreditId,native.managedCreditId,native.fixedCreditId,input.evidenceReference,input.reason,ctx.actorId,ctx.requestId),
    db.prepare(`UPDATE seller_recovery_cases SET state=?,revision=revision+1,next_action_at=${clock}+86400000,updated_at=${clock} WHERE id=? AND revision=? AND confirmed_paisa=? AND blocker IS NULL`)
      .bind(state,row.id,row.revision,source.confirmedPaisa),...paymentGuard(db,'changes()=1'),
    db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'receipt_allocated',?,?,?,?,${clock})`)
      .bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({allocationId:id,receiptId:input.receiptId,amountPaisa:input.amountPaisa,method:input.method,creditId}),ctx.requestId),
    ...await recoveryNoticeStatements(db,ctx,row.id,'receipt_allocated',`Actual repayment allocated: NPR ${(input.amountPaisa/100).toFixed(2)}. Remaining balance: NPR ${((position.remainingPaisa-input.amountPaisa)/100).toFixed(2)}. The statement retains the original receipt allocation and native debt settlement.`),
    ...authority.statements,command.insert(result)]);
  }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;
    if(error instanceof Error&&/recovery_.*(?:cap|balance)|operation_transaction_guards|CHECK constraint/i.test(error.message))throw new SellerRecoveryError('The recovery or incoming money changed. Refresh the original case and receipt before another allocation.');throw error;
  }
  return result;
}

async function recoveryReceipt(db:D1Database,ctx:CommandContext,action:string,caseId:string,input:unknown){
  try{return await commandReceipt(db,ctx,{action:'seller.recovery.'+action,subjectType:'seller_recovery',subjectId:caseId},input);}
  catch(error){if(error instanceof Error&&error.message==='Request reference was already used for different command content.')throw new SellerRecoveryError(error.message);throw error;}
}

/** Ask about the original statement even when there is no collectible balance. No amount changes. */
export async function requestSellerRecoveryCalculationReview(db:D1Database,ctx:CommandContext,input:{caseId:string;reason:string;evidenceReference:string|null}){
 const {row,source,reconciliation}=await readOwnedSellerRecovery(db,ctx.actorId,input.caseId);
 const read=()=>recoveryReceipt(db,ctx,'calculation_review_requested',row.id,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;reviewId:string;revision:number};
 if(Math.max(row.exposurePaisa,row.confirmedPaisa)-row.absorbedPaisa-row.disputedPaisa>0)throw new SellerRecoveryError('Use the amount-based review for a current recovery amount; its disputed portion receives the appropriate collection pause.');
 if(ctx.expectedRevision!==String(row.revision))throw new SellerRecoveryError('Refresh the current statement before requesting its review.');
 if(input.reason.trim().length<10||input.reason.length>1500||input.evidenceReference!==null&&(input.evidenceReference.trim().length<8||input.evidenceReference.length>1500))throw new SellerRecoveryError('Explain what needs review; supporting evidence is optional.',400);
 if((await readRecoveryCalculationReviews(db,row.id)).some(review=>review.status==='pending'))throw new SellerRecoveryError('The existing statement review is pending. Its original response target remains in place.');
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:row.id,reviewId:id,revision:row.revision+1};
 const message='Your statement review was requested. Finance will review the original calculation within one service day. This request records no new charge or repayment.';
 try{await db.batch([...paymentGuard(db,sellerOwnerPredicate,[row.sellerId,ctx.actorId]),
  db.prepare(`INSERT INTO seller_recovery_calculation_reviews(id,case_id,case_revision,submitted_by,reason,evidence_reference,source_json,request_id,created_at,due_at)
   VALUES(?,?,?,?,?,?,?,?,${clock},${clock}+86400000)`).bind(id,row.id,row.revision,ctx.actorId,input.reason,input.evidenceReference,JSON.stringify({case:row,source}),ctx.requestId),
  db.prepare(`UPDATE seller_recovery_cases SET next_action_at=${!reconciliation&&['closed_no_balance','recovered','absorbed'].includes(row.state)?clock+'+86400000':`CASE WHEN next_action_at>${clock}+86400000 THEN ${clock}+86400000 ELSE next_action_at END`},revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'calculation_review_requested',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({reviewId:id,publicMessage:message}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'calculation_review_requested',message),...paymentGuard(db,sellerOwnerPredicate,[row.sellerId,ctx.actorId]),receipt.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;if(error instanceof Error&&/recovery_calculation|operation_transaction_guards|CHECK constraint/i.test(error.message))throw new SellerRecoveryError('The current statement or pending review changed. Refresh the retained outcome before another request.');throw error;}
 return result;
}

/** Explain a reconciled original calculation; financial corrections remain explicit native commands. */
export async function answerSellerRecoveryCalculationReview(db:D1Database,ctx:CommandContext,input:{caseId:string;reviewId:string;reviewDigest:string;reason:string;publicMessage:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
 const read=()=>recoveryReceipt(db,ctx,'calculation_review_answered',row.id,input),receipt=await read();if(receipt.replayed)return receipt.result as {id:string;reviewId:string;revision:number};
 const pending=(await readRecoveryCalculationReviews(db,row.id)).find(review=>review.id===input.reviewId&&review.status==='pending');
 if(!pending||ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source))throw new SellerRecoveryError('Open the current pending statement review and exact source before answering.');
 if(row.blocker||source.blocker||source.confirmedPaisa!==row.confirmedPaisa||source.historicalNettingPaisa!==row.historicalRecoveredPaisa)throw new SellerRecoveryError('Reconcile the original money before concluding the calculation review. The owned review and its response target remain open.');
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500)throw new SellerRecoveryError('Record the actual review basis and clear owner explanation.',400);
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:row.id,reviewId:input.reviewId,revision:row.revision+1};
 try{await db.batch([...authority.statements,...nativeSourceGuards(db,source),
  db.prepare(`INSERT INTO seller_recovery_calculation_answers(id,review_id,case_id,case_revision,actor_id,reason,public_message,source_json,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,${clock})`).bind(id,input.reviewId,row.id,row.revision,ctx.actorId,input.reason,input.publicMessage,JSON.stringify({case:row,source}),ctx.requestId),
  db.prepare(`UPDATE seller_recovery_cases SET revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'calculation_review_answered',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({reviewId:input.reviewId,publicMessage:input.publicMessage}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'calculation_review_answered',input.publicMessage),...authority.statements,receipt.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;if(error instanceof Error&&/recovery_calculation|operation_transaction_guards|CHECK constraint|UNIQUE constraint/i.test(error.message))throw new SellerRecoveryError('The source or review changed. Refresh its saved outcome before another answer.');throw error;}
 return result;
}

/** A seller response is evidence to review, never automatic fault or collection authority. */
export async function disputeSellerRecovery(db:D1Database,ctx:CommandContext,input:{caseId:string;amountPaisa:number;reason:string;evidenceReference:string|null}){
  const row=await caseRow(db,input.caseId),owner=`EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND u.status='active')`;
  if(!await db.prepare('SELECT 1 WHERE '+owner).bind(row.sellerId,ctx.actorId).first())throw new RecoveryAuthorityError('Open your own seller recovery to request a review.');
  const read=()=>recoveryReceipt(db,ctx,'disputed',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;revision:number};
  money(input.amountPaisa);
  if(input.amountPaisa===0||input.reason.trim().length<10||input.reason.length>1500||input.evidenceReference!==null&&(input.evidenceReference.length<8||input.evidenceReference.length>1500))throw new SellerRecoveryError('Describe the disputed amount; supporting evidence is optional.',400);
  const maximum=Math.max(row.confirmedPaisa,row.exposurePaisa)-row.absorbedPaisa-row.disputedPaisa;
  if(ctx.expectedRevision!==String(row.revision)||input.amountPaisa>maximum||row.state==='closed_no_balance')throw new SellerRecoveryError('Review the current original amount and any existing dispute.');
  const clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
  try{await db.batch([...paymentGuard(db,owner,[row.sellerId,ctx.actorId]),
    db.prepare(`UPDATE seller_recovery_cases SET next_action_at=CASE WHEN disputed_paisa>0 THEN CASE WHEN next_action_at>${clock}+86400000 THEN ${clock}+86400000 ELSE next_action_at END ELSE ${clock}+86400000 END,disputed_paisa=disputed_paisa+?,state='disputed',revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`)
      .bind(input.amountPaisa,row.id,row.revision),...paymentGuard(db,'changes()=1'),
    db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'disputed',?,?,?,?,${clock})`)
      .bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({amountPaisa:input.amountPaisa,evidenceReference:input.evidenceReference}),ctx.requestId),
    ...await recoveryNoticeStatements(db,ctx,row.id,'disputed',`A review was requested for NPR ${(input.amountPaisa/100).toFixed(2)}. Collection of the disputed portion is paused. Your statement shows the next review target; the customer refund keeps its original outcome.`),
    ...paymentGuard(db,owner,[row.sellerId,ctx.actorId]),command.insert(result)]);
  }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}

/** Reduce the original responsibility, retaining every collection and restoring excess once. */
export async function correctSellerRecoveryLiability(db:D1Database,ctx:CommandContext,input:{caseId:string;newConfirmedPaisa:number;resolveDisputedPaisa:number;reviewDigest:string;evidenceReference:string;reason:string;publicMessage:string;customerRefundReversalId?:string;customerRefundReversalIds?:string[];environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
 await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'liability_corrected',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;revision:number};
 if(input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the original correction evidence, reason and explanation for the seller.',400);
 const recovered=await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa),position=recoveryPosition({...row,recovered});
 if(row.blocker||(source.blocker&&!((input.customerRefundReversalId||input.customerRefundReversalIds?.length)&&source.blocker===CUSTOMER_REFUND_REVERSAL_BLOCKER))||source.confirmedPaisa!==row.confirmedPaisa||source.historicalNettingPaisa!==row.historicalRecoveredPaisa||ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source))throw new SellerRecoveryError('Review the current original liability, collection and correction source.');
 if(input.newConfirmedPaisa-Math.min(row.absorbedPaisa,input.newConfirmedPaisa)<recovered.carrier)throw new SellerRecoveryError('Reconcile the carrier reimbursement excess separately; carrier funds cannot be gifted to the seller as restored collection.');
 let correction:ReturnType<typeof recoveryLiabilityCorrection>;
 try{correction=recoveryLiabilityCorrection({confirmed:row.confirmedPaisa,absorbed:row.absorbedPaisa,recovered:position.recoveredPaisa,disputed:row.disputedPaisa,newConfirmed:input.newConfirmedPaisa,resolveDisputed:input.resolveDisputedPaisa});}catch(error){throw new SellerRecoveryError(error instanceof Error?error.message:'Review the correction amounts.');}
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 const refundDisposition=input.customerRefundReversalId||input.customerRefundReversalIds?.length?await customerRefundCorrectionDisposition(db,ctx,{reversalId:input.customerRefundReversalId,reversalIds:input.customerRefundReversalIds,caseId:row.id,caseRevision:row.revision,correctionId:id,evidenceReference:input.evidenceReference,reason:input.reason,publicMessage:input.publicMessage}):{guards:[],finish:[]};
 const native=recoveryNativeSettlementStatements(db,source,ctx,{caseId:row.id,creditId:crypto.randomUUID(),amountPaisa:correction.nativeCreditPaisa,kind:'correction'});
 const fixed=source.model==='fixed'?await db.prepare('SELECT obligation_id AS id FROM managed_supplier_adjustments WHERE id=?').bind(source.id).first<{id:string}>():null;
 const collections=await db.prepare(`SELECT a.id,a.method,${actualRecoveryAllocationSql('a')}-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0) AS remaining FROM seller_recovery_allocations a WHERE a.case_id=? AND a.method<>'carrier' ORDER BY a.created_at DESC,a.id DESC`).bind(row.id).all<{id:string;method:string;remaining:number}>();
 const restorations:D1PreparedStatement[]=[];let remaining=correction.restoredPaisa;
 for(const collection of [...collections.results,{id:null,method:'earnings',remaining:recovered.earnings-collections.results.filter(a=>a.method==='earnings').reduce((sum,a)=>sum+a.remaining,0)}]){
  const amount=Math.min(remaining,collection.remaining);if(amount<=0)continue;remaining-=amount;
  restorations.push(db.prepare('INSERT INTO seller_recovery_restorations(id,correction_id,case_id,allocation_id,method,amount_paisa) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,row.id,collection.id,collection.method,amount));
 }
 if(remaining)throw new SellerRecoveryError('Reconcile the exact original collection before restoring its amount.');
 const state=correction.disputedPaisa?'disputed':correction.remainingPaisa?'awaiting_approval':!correction.confirmedPaisa?'closed_no_balance':correction.confirmedPaisa===correction.absorbedPaisa?'absorbed':'recovered';
 try{await db.batch([...authority.statements,...refundDisposition.guards,db.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?').bind(row.sellerId),...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  ...native.statements,
  db.prepare(`INSERT INTO seller_recovery_liability_corrections(id,case_id,case_revision,old_confirmed_paisa,new_confirmed_paisa,old_absorbed_paisa,new_absorbed_paisa,native_credit_paisa,restored_paisa,registered_credit_id,managed_credit_id,fixed_obligation_id,evidence_reference,reason,public_message,actor_id,request_id,created_at,review_due_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${clock},${clock}+86400000)`).bind(id,row.id,row.revision,row.confirmedPaisa,correction.confirmedPaisa,row.absorbedPaisa,correction.absorbedPaisa,correction.nativeCreditPaisa,correction.restoredPaisa,native.registeredCreditId,native.managedCreditId,fixed?.id??null,input.evidenceReference,input.reason,input.publicMessage,ctx.actorId,ctx.requestId),
  ...restorations,...refundDisposition.finish,
  db.prepare(`UPDATE seller_recovery_cases SET exposure_paisa=exposure_paisa-?,confirmed_paisa=?,absorbed_paisa=?,disputed_paisa=?,approved_cap_paisa=0,plan_json=NULL,
   liability_reduced_paisa=liability_reduced_paisa+?,restored_paisa=restored_paisa+?,state=?,revision=revision+1,next_action_at=${clock}+86400000,updated_at=${clock} WHERE id=? AND revision=?`)
   .bind(row.confirmedPaisa-correction.confirmedPaisa,correction.confirmedPaisa,correction.absorbedPaisa,correction.disputedPaisa,row.confirmedPaisa-correction.confirmedPaisa,correction.restoredPaisa,state,row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'liability_corrected',?,?,?,?,${clock})`)
   .bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({correctionId:id,...correction,resolveDisputedPaisa:input.resolveDisputedPaisa,evidenceReference:input.evidenceReference,publicMessage:input.publicMessage,supersededPlan:row.planJson?JSON.parse(row.planJson):null}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'liability_corrected',`${input.publicMessage} Remaining balance: NPR ${(correction.remainingPaisa/100).toFixed(2)}. ${correction.remainingPaisa?'The previous arrangement is superseded; Finance must review revised terms before further collection.':'Open the statement for the retained collection and restoration history.'}`),
  ...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}
 return result;
}

/** Company absorption is an audited cost and native debt settlement, never a recovery receipt. */
export async function absorbSellerRecovery(db:D1Database,ctx:CommandContext,input:{caseId:string;amountPaisa:number;resolveDisputedPaisa:number;reviewDigest:string;evidenceReference:string;reason:string;collectionAttempts:string;environment?:RuntimeEnvironment}){
  const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
  const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
  await recoveryExecutionGate(db,source,input.environment);
  const read=()=>recoveryReceipt(db,ctx,'absorbed',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;revision:number};
  money(input.amountPaisa);money(input.resolveDisputedPaisa);
  if(input.amountPaisa===0||input.reason.trim().length<10||input.reason.length>1500||input.collectionAttempts.trim().length<10||input.collectionAttempts.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the exact approved company cost, evidence, collection attempts and reason.',400);
  const position=recoveryPosition({...row,recovered:await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa)});
  if(row.blocker||source.blocker||source.confirmedPaisa!==row.confirmedPaisa||ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)
    ||input.amountPaisa>position.remainingPaisa||input.resolveDisputedPaisa>Math.min(row.disputedPaisa,input.amountPaisa))throw new SellerRecoveryError('Review the exact current liability and disputed portion before an absorption decision.');
  const clock=checkoutCommitClock(db),id=crypto.randomUUID(),creditId=crypto.randomUUID(),result={id:row.id,revision:row.revision+1};
  const native=recoveryNativeSettlementStatements(db,source,ctx,{caseId:row.id,creditId,amountPaisa:input.amountPaisa,kind:'absorption'});
  const disputed=row.disputedPaisa-input.resolveDisputedPaisa,state=disputed?'disputed':position.remainingPaisa===input.amountPaisa?'absorbed':position.recoveredPaisa?'part_recovered':'open';
  try{await db.batch([...authority.statements,
    db.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?').bind(row.sellerId),...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
    ...native.statements,
    db.prepare(`INSERT INTO seller_recovery_reductions(id,case_id,amount_paisa,registered_credit_id,managed_credit_id,fixed_credit_id,evidence_reference,reason,collection_attempts,approved_by,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,${clock})`)
      .bind(id,row.id,input.amountPaisa,native.registeredCreditId,native.managedCreditId,native.fixedCreditId,input.evidenceReference,input.reason,input.collectionAttempts,ctx.actorId,ctx.requestId),
    db.prepare(`UPDATE seller_recovery_cases SET absorbed_paisa=absorbed_paisa+?,disputed_paisa=?,state=?,revision=revision+1,next_action_at=${clock}+86400000,updated_at=${clock} WHERE id=? AND revision=? AND confirmed_paisa=? AND blocker IS NULL`)
      .bind(input.amountPaisa,disputed,state,row.id,row.revision,source.confirmedPaisa),...paymentGuard(db,'changes()=1'),
    db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'absorbed',?,?,?,?,${clock})`)
      .bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({reductionId:id,creditId,amountPaisa:input.amountPaisa,resolveDisputedPaisa:input.resolveDisputedPaisa,evidenceReference:input.evidenceReference,collectionAttempts:input.collectionAttempts}),ctx.requestId),
    ...await recoveryNoticeStatements(db,ctx,row.id,'absorbed',`Approved company absorption: NPR ${(input.amountPaisa/100).toFixed(2)}. Remaining balance: NPR ${((position.remainingPaisa-input.amountPaisa)/100).toFixed(2)}. The company-borne amount is shown separately from actual repayments.`),
    ...authority.statements,command.insert(result)]);
  }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}

const sellerOwnerPredicate="EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND u.status='active')";
/** Fresh review upholds only an existing disputed portion. It creates no money or new liability. */
export async function upholdSellerRecoveryDispute(db:D1Database,ctx:CommandContext,input:{caseId:string;amountPaisa:number;reviewDigest:string;evidenceReference:string;reason:string;publicMessage:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin'),row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
 const read=()=>recoveryReceipt(db,ctx,'dispute_upheld',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;revision:number};
 money(input.amountPaisa);
 if(!input.amountPaisa||input.amountPaisa>row.disputedPaisa||input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)throw new SellerRecoveryError('Record the reviewed disputed portion, original evidence and a clear seller-facing explanation.',400);
 if(row.blocker||source.blocker||source.confirmedPaisa!==row.confirmedPaisa||source.historicalNettingPaisa!==row.historicalRecoveredPaisa||ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source))throw new SellerRecoveryError('Review the exact current original liability and disputed portion before this decision.');
 const pending=await pendingRecoveryDisputes(db,row.id,input.amountPaisa),disputed=row.disputedPaisa-input.amountPaisa;
 if(pending.reduce((sum,item)=>sum+item.remainingPaisa,0)!==disputed)throw new SellerRecoveryError('Reconcile the retained original dispute decisions first.');
 const position=recoveryPosition({...row,recovered:await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa)}),plan=row.planJson?JSON.parse(row.planJson):null;
 const state=disputed?'disputed':!position.remainingPaisa?'recovered':plan?.proposalId?'repayment_plan':position.recoveredPaisa?'part_recovered':'open',clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 try{await db.batch([...authority.statements,...nativeSourceGuards(db,source),...await recoveryEvidenceGuards(db,input.evidenceReference,source),
  db.prepare(`UPDATE seller_recovery_cases SET disputed_paisa=?,state=?,revision=revision+1,next_action_at=COALESCE(?,${clock}+86400000),updated_at=${clock} WHERE id=? AND revision=? AND disputed_paisa=? AND blocker IS NULL`).bind(disputed,state,pending[0]?.dueAt??null,row.id,row.revision,row.disputedPaisa),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'dispute_upheld',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({amountPaisa:input.amountPaisa,publicMessage:input.publicMessage,evidenceReference:input.evidenceReference}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'dispute_upheld',input.publicMessage+` Reviewed amount upheld: NPR ${(input.amountPaisa/100).toFixed(2)}. Remaining disputed portion: NPR ${(disputed/100).toFixed(2)}. This decision records no repayment.`),...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}
async function assertRecoveryOwner(db:D1Database,actorId:string,row:RecoveryCaseRow){
 if(!await db.prepare('SELECT 1 WHERE '+sellerOwnerPredicate).bind(row.sellerId,actorId).first())throw new RecoveryAuthorityError('Open your own recovery statement.');
}
/** Server-only input to the explicit seller DTO; never return this raw source to a browser. */
export async function readOwnedSellerRecovery(db:D1Database,actorId:string,id:string){
 const row=await caseRow(db,id);await assertRecoveryOwner(db,actorId,row);
 const source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});
 const recovered=await allocatedRecovery(db,id,row.historicalRecoveredPaisa,false),position=recoveryPosition({...row,recovered:await allocatedRecovery(db,id,row.historicalRecoveredPaisa)});
 const uncertain=await db.prepare(`SELECT COALESCE(SUM(a.amount_paisa),0) amount FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=? AND (NOT ${verifiedRecoveryReceiptSql('r')})`).bind(id).first<{amount:number}>();
 const reconciliation=!!(row.blocker||source.blocker||uncertain?.amount||source.confirmedPaisa!==row.confirmedPaisa||source.historicalNettingPaisa!==row.historicalRecoveredPaisa);
 if(reconciliation)position.collectiblePaisa=0;
 await assertRecoveryOwner(db,actorId,row);
 return {row,source,recovered,position,reconciliation,unreconciledReceiptPaisa:uncertain?.amount??0};
}
async function valueDigest(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}

/** These are new case-specific terms, not inferred consent from an old agreement. */
export async function getSellerRecoveryPlanTerms(db:D1Database,actorId:string,caseId:string){
 const row=await caseRow(db,caseId);await assertRecoveryOwner(db,actorId,row);
 const source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});
 const position=recoveryPosition({...row,recovered:await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa)});
 const identity=await db.prepare('SELECT identity_revision AS revision FROM seller_protected_revisions WHERE seller_id=?').bind(row.sellerId).first<{revision:number}>();
 if(!identity||row.blocker||source.blocker||source.confirmedPaisa!==row.confirmedPaisa||source.historicalNettingPaisa!==row.historicalRecoveredPaisa||row.approvedCapPaisa===0||position.remainingPaisa===0)throw new SellerRecoveryError('Resolve the original financial reconciliation before proposing a repayment agreement.');
 const terms={version:'recovery-case-agreement-v1',caseId:row.id,revision:row.revision,sellerId:row.sellerId,model:row.model,currency:'NPR',remainingPaisa:position.remainingPaisa,identityRevision:identity.revision,
  text:'I propose the displayed installment amounts, dates and contact details for this original itemized recovery. If I select earnings netting, I explicitly authorize only eligible, unreserved, undisputed earnings for this same legal seller, NPR currency and commercial model, within the approved remaining liability. Each actual cash repayment or earnings application reduces the oldest remaining installment first. Disputed amounts are paused. The company must approve this proposal; my acceptance does not authorize an external bank debit, waive review rights or change another agreement.'};
 return {terms,termsDigest:await valueDigest(terms)};
}
interface RecoveryProposalInput {caseId:string;termsDigest:string;termsAccepted:boolean;nettingAuthorized:boolean;installments:{amountPaisa:number;dueAt:number}[];contactDetails:string;nextReviewAt:number;}
export async function proposeSellerRecoveryPlan(db:D1Database,ctx:CommandContext,input:RecoveryProposalInput){
 const row=await caseRow(db,input.caseId);await assertRecoveryOwner(db,ctx.actorId,row);
 const read=()=>recoveryReceipt(db,ctx,'plan_proposed',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;caseId:string;revision:number};
 const {terms,termsDigest}=await getSellerRecoveryPlanTerms(db,ctx.actorId,row.id),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});
 if(input.termsAccepted!==true||typeof input.nettingAuthorized!=='boolean'||input.termsDigest!==termsDigest||ctx.expectedRevision!==String(row.revision))throw new SellerRecoveryError('Review and explicitly accept the exact current case-specific terms before proposing this arrangement.');
 if(!Array.isArray(input.installments)||input.installments.length>60||!input.installments.length&&!input.nettingAuthorized||input.contactDetails.trim().length<5||input.contactDetails.length>1000||!Number.isSafeInteger(input.nextReviewAt)||input.nextReviewAt<=ctx.now)throw new SellerRecoveryError('Provide the proposed dates, repayment method and a usable contact route.',400);
 let total=BigInt(0),priorDate=ctx.now;
 for(const installment of input.installments){total+=money(installment.amountPaisa);if(!installment.amountPaisa||!Number.isSafeInteger(installment.dueAt)||installment.dueAt<=priorDate)throw new SellerRecoveryError('Use positive installments with increasing future dates.',400);priorDate=installment.dueAt;}
 if(input.installments.length&&number(total)!==terms.remainingPaisa)throw new SellerRecoveryError('The proposed installments must explain the exact current remaining balance.');
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id,caseId:row.id,revision:row.revision+1};
 try{await db.batch([...paymentGuard(db,sellerOwnerPredicate,[row.sellerId,ctx.actorId]),...nativeSourceGuards(db,source),
  ...paymentGuard(db,'EXISTS(SELECT 1 FROM seller_protected_revisions WHERE seller_id=? AND identity_revision=?)',[row.sellerId,terms.identityRevision]),
  db.prepare(`INSERT INTO seller_recovery_proposals(id,case_id,case_revision,seller_id,payout_model,currency,amount_paisa,identity_revision,source_json,installments_json,netting_authorized,accepted_terms_json,terms_digest,contact_details,next_review_at,accepted_by,accepted_at,request_id)
   VALUES(?,?,?,?,?,'NPR',?,?,?,?,?,?,?,?,?,?,${clock},?)`).bind(id,row.id,row.revision,row.sellerId,row.model,terms.remainingPaisa,terms.identityRevision,JSON.stringify(source),JSON.stringify(input.installments),input.nettingAuthorized?1:0,JSON.stringify(terms),termsDigest,input.contactDetails,input.nextReviewAt,ctx.actorId,ctx.requestId),
  db.prepare(`UPDATE seller_recovery_cases SET plan_json=?,state=?,revision=revision+1,next_action_at=${clock}+86400000,updated_at=${clock} WHERE id=? AND revision=? AND blocker IS NULL`)
   .bind(JSON.stringify({status:'proposal_review',pendingProposalId:id,nettingAuthorized:false}),row.disputedPaisa?'disputed':row.confirmedPaisa-row.absorbedPaisa-terms.remainingPaisa>0?'part_recovered':'open',row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'plan_proposed',?,'Seller accepted a case-specific repayment proposal.',?,?,${clock})`)
   .bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,JSON.stringify({proposalId:id,termsDigest}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'plan_proposed','A seller-accepted repayment proposal is ready for Finance review. The proposed schedule and optional earnings authority require an eligible Super Admin decision.'),
  ...paymentGuard(db,sellerOwnerPredicate,[row.sellerId,ctx.actorId]),command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}

/** A proposal decision changes no money and never revives an older earnings authorization. */
export async function reviewSellerRecoveryProposal(db:D1Database,ctx:CommandContext,input:{caseId:string;proposalId:string;decision:'changes_requested'|'rejected';reviewDigest:string;nextReviewAt:number;reason:string;publicMessage:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin'),row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
 const read=()=>recoveryReceipt(db,ctx,'plan_reviewed',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;revision:number};
 const arrangement=await readRecoveryArrangement(db,row.id),position=recoveryPosition({...row,recovered:await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa)});
 if(!arrangement||arrangement.proposal.id!==input.proposalId||arrangement.status!=='pending'||!position.remainingPaisa||ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source))throw new SellerRecoveryError('Review the latest undecided proposal and current case. An old or approved arrangement cannot be rejected through this action.');
 if(!['changes_requested','rejected'].includes(input.decision)||!Number.isSafeInteger(input.nextReviewAt)||input.nextReviewAt<=ctx.now||input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500)throw new SellerRecoveryError('Explain the decision to the seller and record a future case-specific Finance review date.',400);
 const result={id:row.id,revision:row.revision+1},clock=checkoutCommitClock(db);
 try{await db.batch([...authority.statements,...paymentGuard(db,'EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id=?)',[row.sellerId,source.ownerId]),
  db.prepare(`UPDATE seller_recovery_cases SET plan_json=?,next_action_at=?,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`)
   .bind(JSON.stringify({status:input.decision,pendingProposalId:input.proposalId,nettingAuthorized:false}),input.nextReviewAt,row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'plan_reviewed',?,?,?,?,${clock})`)
   .bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({proposalId:input.proposalId,decision:input.decision,nextReviewAt:input.nextReviewAt,publicMessage:input.publicMessage}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'plan_reviewed',input.publicMessage+' No replacement earnings authority is active until revised terms receive approval.'),...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}

/** Record actual Finance follow-up without changing accepted amounts, dates or collection authority. */
export async function recordSellerRecoveryArrangementReview(db:D1Database,ctx:CommandContext,input:{caseId:string;proposalId:string;reviewDigest:string;nextReviewAt:number;reason:string;publicMessage:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.prepare',RecoveryAuthorityError),row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
 const read=()=>recoveryReceipt(db,ctx,'arrangement_reviewed',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;revision:number};
 const arrangement=await readRecoveryArrangement(db,row.id),position=recoveryPosition({...row,recovered:await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa)});
 if(!arrangement||arrangement.proposal.id!==input.proposalId||!['approved','changes_requested','rejected'].includes(arrangement.status)||!position.remainingPaisa||ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||arrangement.status==='approved'&&(!row.planJson||JSON.parse(row.planJson).proposalId!==input.proposalId))throw new SellerRecoveryError('Review the current arrangement and its remaining balance. A pending proposal requires a decision before a later follow-up.');
 if(!Number.isSafeInteger(input.nextReviewAt)||input.nextReviewAt<=ctx.now||input.reason.trim().length<10||input.reason.length>1500||input.publicMessage.trim().length<10||input.publicMessage.length>1500)throw new SellerRecoveryError('Record the actual follow-up, seller update and a future Finance review date.',400);
 const result={id:row.id,revision:row.revision+1},clock=checkoutCommitClock(db);
 try{await db.batch([...authority.statements,...paymentGuard(db,'EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id=?)',[row.sellerId,source.ownerId]),
  db.prepare(`UPDATE seller_recovery_cases SET next_action_at=?,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(input.nextReviewAt,row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'arrangement_reviewed',?,?,?,?,${clock})`)
   .bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify({proposalId:input.proposalId,nextReviewAt:input.nextReviewAt,publicMessage:input.publicMessage}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'arrangement_reviewed',input.publicMessage),...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}

export async function approveSellerRecoveryPlan(db:D1Database,ctx:CommandContext,input:{caseId:string;proposalId:string;reviewDigest:string;reason:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',RecoveryAuthorityError,'super_admin');
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
 const read=()=>recoveryReceipt(db,ctx,'plan_approved',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;revision:number};
 const proposal=await db.prepare(`SELECT id,case_revision AS caseRevision,amount_paisa AS amount,identity_revision AS identityRevision,source_json AS sourceJson,
  installments_json AS installments,netting_authorized AS netting,accepted_by AS acceptedBy,next_review_at AS nextReviewAt,terms_digest AS termsDigest
  FROM seller_recovery_proposals WHERE id=? AND case_id=? AND seller_id=? AND payout_model=? AND currency='NPR'`).bind(input.proposalId,row.id,row.sellerId,row.model)
  .first<{id:string;caseRevision:number;amount:number;identityRevision:number;sourceJson:string;installments:string;netting:number;acceptedBy:string;nextReviewAt:number;termsDigest:string}>();
 const position=recoveryPosition({...row,recovered:await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa)});
 if(!proposal||proposal.acceptedBy!==source.ownerId||proposal.caseRevision+1!==row.revision||proposal.sourceJson!==JSON.stringify(source)||proposal.amount!==position.remainingPaisa||proposal.nextReviewAt<=ctx.now
  ||ctx.expectedRevision!==String(row.revision)||input.reviewDigest!==await reviewDigest(row,source)||row.blocker||source.blocker||source.confirmedPaisa!==row.confirmedPaisa||source.historicalNettingPaisa!==row.historicalRecoveredPaisa||input.reason.trim().length<10||input.reason.length>1500)throw new SellerRecoveryError('Review the current seller-accepted proposal, original facts and repayment dates before approval.');
 if((JSON.parse(proposal.installments) as {dueAt:number}[]).some(i=>i.dueAt<=ctx.now))throw new SellerRecoveryError('Ask for current dates; do not approve an already overdue proposed installment.');
 const plan={proposalId:proposal.id,nettingAuthorized:proposal.netting===1,identityRevision:proposal.identityRevision,acceptedBy:proposal.acceptedBy,termsDigest:proposal.termsDigest,installments:JSON.parse(proposal.installments),allocationOrder:'oldest_installment_first',approvedBy:ctx.actorId};
 const clock=checkoutCommitClock(db),result={id:row.id,revision:row.revision+1};
 try{await db.batch([...authority.statements,...nativeSourceGuards(db,source),
  ...paymentGuard(db,`EXISTS(SELECT 1 FROM seller_protected_revisions r JOIN seller_profiles s ON s.id=r.seller_id WHERE r.seller_id=? AND r.identity_revision=? AND s.user_id=? ${proposal.netting?'AND '+verifiedIdentitySql('s.id',ctx.now):''})`,[row.sellerId,proposal.identityRevision,proposal.acceptedBy]),
  db.prepare(`UPDATE seller_recovery_cases SET plan_json=?,state=?,next_action_at=?,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=? AND blocker IS NULL`).bind(JSON.stringify(plan),row.disputedPaisa?'disputed':'repayment_plan',proposal.nextReviewAt,row.id,row.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'plan_approved',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,input.reason,JSON.stringify(plan),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'plan_approved','Your accepted repayment arrangement was approved. Open the statement for its exact installments, optional earnings authority and next review date. Each actual allocation reduces the same remaining balance.'),...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}

export function registeredRecoveryEarningsSql(){return `SELECT COALESCE(SUM(e.amount_paisa-CASE WHEN e.type IN('sale','reserve_release') AND e.id=(SELECT original.id FROM seller_ledger_entries original
 WHERE original.seller_id=e.seller_id AND original.order_item_id=e.order_item_id AND original.type IN('sale','reserve_release') AND original.available_at<=e.available_at
 AND NOT EXISTS(SELECT 1 FROM payout_entries paid WHERE paid.ledger_entry_id=original.id AND paid.released_at IS NULL)
 ORDER BY original.available_at,original.id LIMIT 1) THEN COALESCE((SELECT SUM(unpaid.amount_paisa) FROM seller_recovery_unpaid_sources unpaid WHERE unpaid.seller_id=e.seller_id AND unpaid.order_item_id=e.order_item_id),0)+COALESCE((SELECT SUM(partial.amount_paisa) FROM seller_recovery_partial_sources partial WHERE partial.seller_id=e.seller_id AND partial.order_item_id=e.order_item_id),0) ELSE 0 END),0) FROM seller_ledger_entries e WHERE e.seller_id=? AND e.available_at<=?
 AND e.type NOT IN('recovery_receipt_reversal','recovery_bank_loss','recovery_settlement','recovery_absorption','recovery_netting_relief','recovery_correction','recovery_source_compensation')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases debt WHERE debt.refund_id=e.refund_id AND debt.seller_id=e.seller_id AND debt.blocker IS NULL AND
  (debt.approved_cap_paisa>0 AND debt.confirmed_paisa>0 OR debt.exposure_paisa=debt.confirmed_paisa AND
   debt.confirmed_paisa-debt.absorbed_paisa-debt.historical_recovered_paisa+debt.restored_paisa-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.case_id=debt.id),0)=0
   AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=debt.id AND (NOT ${verifiedRecoveryReceiptSql('r')}))))
 AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=e.order_item_id)
 AND NOT EXISTS(SELECT 1 FROM order_items mi WHERE mi.id=e.order_item_id AND mi.commission_rule_version LIKE 'managed-%')
 AND NOT EXISTS(SELECT 1 FROM payout_entries pe WHERE pe.ledger_entry_id=e.id AND pe.released_at IS NULL)`;}

/** Native relief + linked withholding allocates the existing debit, with zero second charge. */
export async function applySellerRecoveryEarnings(db:D1Database,ctx:CommandContext,input:{caseId:string;environment?:RuntimeEnvironment}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.prepare',RecoveryAuthorityError);
 const row=await caseRow(db,input.caseId),source=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});await assertIndependent(db,source,ctx.actorId);
 await recoveryExecutionGate(db,source,input.environment);
 const read=()=>recoveryReceipt(db,ctx,'earnings_applied',row.id,input),command=await read();if(command.replayed)return command.result as {id:string;caseId:string;revision:number;amountPaisa:number};
 const plan=row.planJson?JSON.parse(row.planJson) as {proposalId?:string;nettingAuthorized?:boolean;identityRevision?:number;acceptedBy?:string}:null;
 if(row.blocker||source.blocker||source.confirmedPaisa!==row.confirmedPaisa||ctx.expectedRevision!==String(row.revision)||!plan?.proposalId||plan.nettingAuthorized!==true||plan.acceptedBy!==source.ownerId)throw new SellerRecoveryError('Use a current approved, seller-accepted earnings agreement for this exact original model and identity.');
 const position=recoveryPosition({...row,recovered:await allocatedRecovery(db,row.id,row.historicalRecoveredPaisa)});
 const modelPool=row.model==='registered'?null:await readModelRecoveryEarnings(db,source,ctx.now);
 const pool=modelPool??await db.prepare('SELECT ('+registeredRecoveryEarningsSql()+') AS amount').bind(row.sellerId,ctx.now).first<{amount:number}>();
 const cohort=row.model==='managed'&&modelPool?.recordKind?managedRecoveryCaseCohortSql('c',modelPool.recordKind):'1=1';
 const protectedSql=`SELECT COALESCE(SUM(disputed_paisa),0) FROM seller_recovery_cases c WHERE seller_id=? AND payout_model=? AND blocker IS NULL AND ${cohort}`;
 const uncertainSql=`SELECT COALESCE(SUM(a.amount_paisa),0) FROM seller_recovery_allocations a JOIN seller_recovery_cases c ON c.id=a.case_id JOIN company_money_receipts r ON r.id=a.receipt_id
  WHERE c.seller_id=? AND c.payout_model=? AND ${cohort} AND (NOT ${verifiedRecoveryReceiptSql('r')})`;
 const protectionSql=`SELECT (${protectedSql})${row.model==='registered'?'':`+(${uncertainSql})`} AS amount`;
 const protectionBindings=row.model==='registered'?[row.sellerId,row.model]:[row.sellerId,row.model,row.sellerId,row.model];
 const protectedAmount=await db.prepare(protectionSql).bind(...protectionBindings).first<{amount:number}>();
 const amount=Math.min(position.collectiblePaisa,modelPool?.maxAllocationPaisa??Number.MAX_SAFE_INTEGER,Math.max(0,(pool?.amount??0)-(protectedAmount?.amount??0)));money(amount);
 if(!amount)throw new SellerRecoveryError('No eligible, unreserved, undisputed earnings remain for this approved recovery.');
 const oldest=`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.seller_id=? AND c.payout_model=? AND c.currency='NPR' AND c.blocker IS NULL AND ${cohort}
  AND json_extract(c.plan_json,'$.nettingAuthorized')=1
  AND EXISTS(SELECT 1 FROM seller_recovery_proposals p JOIN seller_profiles s ON s.id=p.seller_id JOIN seller_protected_revisions r ON r.seller_id=s.id
   WHERE p.id=json_extract(c.plan_json,'$.proposalId') AND p.case_id=c.id AND p.seller_id=c.seller_id AND p.payout_model=c.payout_model AND p.currency=c.currency
   AND p.netting_authorized=1 AND p.accepted_by=s.user_id AND p.accepted_by=json_extract(c.plan_json,'$.acceptedBy')
   AND p.identity_revision=r.identity_revision AND p.identity_revision=json_extract(c.plan_json,'$.identityRevision'))
  AND c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)>0
  AND (c.approved_at<? OR c.approved_at=? AND c.id<?))`;
 if(!await db.prepare('SELECT 1 WHERE '+oldest).bind(row.sellerId,row.model,row.approvedAt,row.approvedAt,row.id).first())throw new SellerRecoveryError('Apply or reconcile the older approved recovery before this case.');
 const clock=checkoutCommitClock(db),id=crypto.randomUUID(),creditId=crypto.randomUUID(),debitId=crypto.randomUUID(),result={id,caseId:row.id,revision:row.revision+1,amountPaisa:amount};
 const native=modelPool?modelRecoveryNettingStatements(db,source,ctx,{caseId:row.id,allocationId:id,futureId:modelPool.futureId!,amount,creditId,debitId,proposalId:plan.proposalId}):[
  db.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,type,amount_paisa,available_at,description,created_at) VALUES(?,?,?,'recovery_netting_relief',?,${clock},?,${clock})`).bind(creditId,row.sellerId,source.orderItemId,amount,'Link existing recovery debit to approved earnings allocation '+id),
  db.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES(?,?,'recovery_netting_withholding',?,${clock},?,${clock})`).bind(debitId,row.sellerId,-amount,'Eligible earnings allocated once to original recovery '+row.id),
  db.prepare(`INSERT INTO seller_recovery_allocations(id,case_id,method,amount_paisa,registered_credit_id,registered_debit_id,evidence_reference,reason,actor_id,request_id,created_at) VALUES(?,?,'earnings',?,?,?,?,?,?,?,${clock})`)
    .bind(id,row.id,amount,creditId,debitId,plan.proposalId,'Apply eligible earnings under the original explicit accepted agreement.',ctx.actorId,ctx.requestId),
 ];
 try{await db.batch([...authority.statements,db.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?').bind(row.sellerId),...nativeSourceGuards(db,source),
  ...paymentGuard(db,`EXISTS(SELECT 1 FROM seller_recovery_proposals p JOIN seller_protected_revisions r ON r.seller_id=p.seller_id JOIN seller_profiles s ON s.id=r.seller_id
    WHERE p.id=? AND p.case_id=? AND p.accepted_by=s.user_id AND p.netting_authorized=1 AND p.identity_revision=r.identity_revision AND r.identity_revision=? AND ${verifiedIdentitySql('s.id',ctx.now)})`,[plan.proposalId,row.id,plan.identityRevision]),
  ...paymentGuard(db,"EXISTS(SELECT 1 FROM notification_messages WHERE related_type='seller_recovery' AND related_id=? AND recipient_user_id=? AND audience_role='seller' AND channel='in_app')",[row.id,source.ownerId]),
  ...paymentGuard(db,noRecoveryIdentityHoldSql('?'),[row.sellerId]),
  ...paymentGuard(db,oldest,[row.sellerId,row.model,row.approvedAt,row.approvedAt,row.id]),
  ...paymentGuard(db,`(${protectionSql})=?`,[...protectionBindings,protectedAmount?.amount??0]),
  ...(modelPool?modelPool.guards:paymentGuard(db,`(${registeredRecoveryEarningsSql()})=?`,[row.sellerId,ctx.now,pool!.amount])),
  ...native,
  db.prepare(`UPDATE seller_recovery_cases SET state=?,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=? AND plan_json=? AND blocker IS NULL`).bind(position.remainingPaisa===amount?'recovered':row.disputedPaisa?'disputed':'part_recovered',row.id,row.revision,row.planJson),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'earnings_applied',?,'Apply eligible earnings within the explicit accepted recovery plan.',?,?,${clock})`).bind(crypto.randomUUID(),row.id,result.revision,ctx.actorId,JSON.stringify({allocationId:id,amountPaisa:amount,creditId,debitId,proposalId:plan.proposalId}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,row.id,'earnings_applied',`Eligible earnings applied: NPR ${(amount/100).toFixed(2)}. Remaining recovery: NPR ${((position.remainingPaisa-amount)/100).toFixed(2)}. The itemized statement links this application to the original debt and accepted agreement.`),...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}


