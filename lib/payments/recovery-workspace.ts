import {actualManualReceiptUseSql} from './receipt-use-accounting';
import {readCustomerRefundReversals,CUSTOMER_REFUND_REVERSAL_BLOCKER} from './customer-refund-reversal';
import {getRecoveryRepaymentAttributionView,readOwnedRecoveryRepaymentAttributions} from './recovery-repayment-attribution';
import { actualRecoveryAllocationSql, pendingRecoveryReceiptReversalSql } from './recovery-receipt-accounting';
import {readRecoveryCalculationReviews} from './recovery-calculation-reviews';
import {readRecoveryArrangement} from './recovery-arrangements';
import {readOwnedSellerRecovery,getSellerRecoveryReview,getSellerRecoveryPlanTerms,SellerRecoveryError,type SellerRecoverySource} from './seller-recovery';
import {readRecoveryFollowup,readRecoveryContactHistory} from './recovery-followup';
import {getRecoveryRepaymentView,readRecoveryRepaymentClaims} from './recovery-repayments';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';

class AccessError extends SellerRecoveryError {constructor(message:string){super(message,403);}}
const ownerSql=`EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN users u ON u.id=s.user_id WHERE c.id=? AND u.id=? AND u.status='active')`;
async function owner(db:D1Database,actorId:string,id:string){if(!await db.prepare('SELECT 1 WHERE '+ownerSql).bind(id,actorId).first())throw new AccessError('Open your own available recovery statement.');}
async function originalBreakdown(db:D1Database,source:SellerRecoverySource){
 const order=source.refundId?await db.prepare(`SELECT o.order_number AS orderNumber,i.product_name_snapshot AS item,r.amount_paisa AS authorizedRefundPaisa,r.status AS refundState FROM refunds r JOIN orders o ON o.id=r.order_id JOIN order_items i ON i.id=? WHERE r.id=? AND i.seller_id=?`).bind(source.orderItemId,source.refundId,source.sellerId).first<{orderNumber:string;item:string;authorizedRefundPaisa:number;refundState:string}>():null;
 const costs=source.refundId?(await db.prepare("SELECT component,party,amount_paisa AS amountPaisa FROM refund_cost_allocations WHERE refund_id=? AND (party<>'seller' OR seller_id=?) ORDER BY component,party,seller_id").bind(source.refundId,source.sellerId).all<{component:string;party:string;amountPaisa:number}>()).results:[];
 const table=source.model==='registered'?'payouts':source.model==='managed'?'managed_payouts':'managed_supplier_payments';
 const payouts=source.originalPayoutIds.length?(await db.prepare(`SELECT id,status,amount_paisa AS amountPaisa FROM ${table} WHERE id IN (${source.originalPayoutIds.map(()=>'?').join(',')}) ORDER BY id`).bind(...source.originalPayoutIds).all<{id:string;status:string;amountPaisa:number}>()).results:[];
 return {order,costs,payouts};
}

/** Explicit owner DTO: no customer, employee, bank, receipt identity or restricted evidence fields. */
export async function getSellerRecoveryStatement(db:D1Database,actorId:string,id:string){
 await owner(db,actorId,id);
 const {row,source,recovered,position,reconciliation,unreconciledReceiptPaisa}=await readOwnedSellerRecovery(db,actorId,id);
 const contacts=await readRecoveryContactHistory(db,id),followup=await readRecoveryFollowup(db,id),original=await originalBreakdown(db,source);
 const events=await db.prepare("SELECT id,action,created_at AS createdAt,CASE WHEN action IN('repayment_attributed','customer_refund_reversed','customer_reversal_retained','receipt_reversal_reconciled','carrier_unpaid_reconciled','payout_return_reconciled','calculation_review_requested','calculation_review_answered','partial_source_reviewed','carrier_reconciled','unpaid_responsibility_corrected','zero_source_reviewed','payout_source_retired','unpaid_source_reviewed','source_compensated','company_history_reviewed','history_reviewed','dispute_upheld','liability_corrected','plan_reviewed','arrangement_reviewed') THEN json_extract(details_json,'$.publicMessage') END AS message FROM seller_recovery_events WHERE case_id=? ORDER BY revision").bind(id).all<{id:string;action:string;createdAt:number;message:string|null}>();
 let agreement:Awaited<ReturnType<typeof getSellerRecoveryPlanTerms>>|null=null;
 if(!reconciliation&&row.approvedCapPaisa>0&&position.remainingPaisa>0)try{agreement=await getSellerRecoveryPlanTerms(db,actorId,id);}catch(error){if(!(error instanceof SellerRecoveryError))throw error;}
 // Terms explicitly show accepted legal seller/model authority, but never private source snapshots.
 await owner(db,actorId,id);
 return {calculationReviews:(await readRecoveryCalculationReviews(db,id)).map(({evidenceReference:_restricted,...review})=>review),id:row.id,revision:row.revision,model:row.model,currency:'NPR' as const,state:row.state,
  sourceKind:row.kind,sourceReference:row.sourceId,exposurePaisa:row.exposurePaisa,confirmedPaisa:row.confirmedPaisa,approvedCapPaisa:row.approvedCapPaisa,
  originalAdjustmentPaisa:source.nativeDebitPaisa,companyResponsibilityPaisa:source.compensationPaisa,absorbedPaisa:row.absorbedPaisa,disputedPaisa:row.disputedPaisa,
  carrierUnpaidCoveredPaisa:source.carrierUnpaidCoveredPaisa??0,unpaidResponsibilityRestoredPaisa:source.unpaidResponsibilityRestoredPaisa??0,originalUnpaidOffsetPaisa:source.originalUnpaidOffsetPaisa??0,companyCompensatedPaisa:source.companyCompensatedPaisa??0,companyDeductedPaisa:source.companyDeductedPaisa??0,historicalRecoveredPaisa:source.historicalReview?.recognizedPaisa??0,receiptReversedPaisa:source.receiptReversedPaisa??0,receiptCompanyLossPaisa:source.receiptCompanyLossPaisa??0,restoredPaisa:row.restoredPaisa+(source.receiptCompanyLossPaisa??0),liabilityReducedPaisa:row.liabilityReducedPaisa,recovered,position,reconciliation,unreconciledReceiptPaisa,agreement,original,contacts,repaymentAttributions:await readOwnedRecoveryRepaymentAttributions(db,actorId,id),events:events.results,repayment:await getRecoveryRepaymentView(db,actorId,id),
  followup:{phase:followup.phase,needsResponse:followup.needsResponse,firstReviewDueAt:followup.firstReviewDueAt,nextActionAt:followup.nextActionAt,responseDueAt:followup.responseDueAt,
   reviewDueAt:followup.reviewDueAt,installments:followup.installments,unplannedPaisa:followup.unplannedPaisa}};
}
export type SellerRecoveryStatement=Awaited<ReturnType<typeof getSellerRecoveryStatement>>;
export async function listSellerRecoveries(db:D1Database,actorId:string){
 return (await db.prepare(`SELECT c.id,c.payout_model AS model,c.state,c.updated_at AS updatedAt FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN users u ON u.id=s.user_id WHERE u.id=? AND u.status='active' ORDER BY c.updated_at DESC,c.id LIMIT 100`).bind(actorId).all<{id:string;model:string;state:string;updatedAt:number}>()).results;
}

/** Private Finance view. Personal seller/customer cases are excluded before loading their sources. */
export async function getRecoveryFinanceWorkspace(db:D1Database,actorId:string,caseId?:string){
 const authority=await staffMutationGuard(db,actorId,'payout.prepare',AccessError);
 const ids=await db.prepare(`SELECT c.id,s.trading_name AS sellerName,c.state,c.payout_model AS model,c.next_action_at AS nextActionAt,lead.display_name AS ownerName,backup.display_name AS backupName FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN users lead ON lead.id=c.owner_id LEFT JOIN users backup ON backup.id=c.backup_id LEFT JOIN refunds r ON r.id=c.refund_id LEFT JOIN orders o ON o.id=r.order_id
  WHERE s.user_id<>? AND (o.customer_id IS NULL OR o.customer_id<>?) AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>? AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>? ${caseId?'AND c.id=?':''} ORDER BY c.next_action_at,c.id LIMIT 100`).bind(actorId,actorId,actorId,actorId,...caseId?[caseId]:[]).all<{id:string;sellerName:string;state:string;model:string;nextActionAt:number;ownerName:string;backupName:string|null}>();
 if(caseId&&!ids.results.length)throw new AccessError('This private recovery is unavailable to an operator with a personal interest.');
 const cases=[];
 for(const item of caseId?ids.results:[]){
  const review=await getSellerRecoveryReview(db,actorId,item.id),followup=await readRecoveryFollowup(db,item.id);
  const proposals=await db.prepare(`SELECT id,case_revision AS caseRevision,amount_paisa AS amountPaisa,installments_json AS installmentsJson,netting_authorized AS nettingAuthorized,contact_details AS contactDetails,next_review_at AS nextReviewAt,accepted_at AS acceptedAt FROM seller_recovery_proposals WHERE case_id=? ORDER BY accepted_at DESC,id LIMIT 20`).bind(item.id).all<{id:string;caseRevision:number;amountPaisa:number;installmentsJson:string;nettingAuthorized:number;contactDetails:string;nextReviewAt:number;acceptedAt:number}>();
  const receipts=authority.role==='super_admin'?await db.prepare(`SELECT r.id,c.revision,r.amount_minor AS amountPaisa,r.account_version_id AS accountVersionId,r.amount_minor-COALESCE((SELECT SUM(bank_reversal.amount_minor) FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id),0)-COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0) AS remainingPaisa
   FROM company_money_receipts r JOIN company_receipt_controls c ON c.receipt_id=r.id WHERE r.payer_user_id=? AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR'
   AND NOT ${pendingRecoveryReceiptReversalSql('r.id')} AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts x WHERE x.receipt_id=r.id AND x.user_id=?) ORDER BY r.confirmed_at,r.id LIMIT 100`).bind(review.source.ownerId,actorId).all<{id:string;revision:number;remainingPaisa:number;amountPaisa:number;accountVersionId:string}>():{results:[]};
  const carrierReceived=await db.prepare(`SELECT COALESCE(SUM(${actualRecoveryAllocationSql('a')}),0) AS amount FROM seller_recovery_allocations a WHERE case_id=? AND method='carrier'`).bind(item.id).first<{amount:number}>();
  const carrierReceipts=authority.role==='super_admin'?(await db.prepare(`SELECT r.id,control.revision,r.payer_reference AS payerReference,r.amount_minor-COALESCE((SELECT SUM(bank_reversal.amount_minor) FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id),0)-COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0) AS remainingPaisa
   FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE r.payer_user_id IS NULL AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR'
   AND NOT ${pendingRecoveryReceiptReversalSql('r.id')} AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts x WHERE x.receipt_id=r.id AND x.user_id=?) ORDER BY r.confirmed_at,r.id LIMIT 100`).bind(actorId).all<{id:string;revision:number;payerReference:string;remainingPaisa:number}>()).results.filter(r=>r.remainingPaisa>0):[];
  const repaymentAttribution=authority.role==='super_admin'?await getRecoveryRepaymentAttributionView(db,actorId,item.id):{receipts:[]};
  const attributed=repaymentAttribution.receipts.filter(receipt=>receipt.attributedCaseId===item.id),receiptIds=new Set(receipts.results.map(receipt=>receipt.id));
  const currentReceipts=[...receipts.results,...attributed.filter(receipt=>!receiptIds.has(receipt.id))];
  const customerRefundReversals=review.source.kind==='refund'?await readCustomerRefundReversals(db,review.source.id):[];
  const customerReversalReviews=[];for(const reversal of customerRefundReversals){const retryObligations=await db.prepare("SELECT id,state FROM refund_obligations WHERE source_kind='receipt_return' AND source_id=? ORDER BY created_at,id").bind(reversal.receiptId).all<{id:string;state:string}>();customerReversalReviews.push({...reversal,retryObligations:retryObligations.results});}
  cases.push({canCorrectCustomerRefundReversal:!review.case.blocker&&(!review.source.blocker||review.source.blocker===CUSTOMER_REFUND_REVERSAL_BLOCKER)&&!review.unreconciledReceiptPaisa&&review.source.confirmedPaisa===review.case.confirmedPaisa&&review.source.historicalNettingPaisa===review.case.historicalRecoveredPaisa,repaymentAttribution,customerRefundReversals:customerReversalReviews,calculationReviews:await readRecoveryCalculationReviews(db,item.id),carrierReceivedPaisa:carrierReceived?.amount??0,carrierReceipts,sellerName:item.sellerName,ownerName:item.ownerName,backupName:item.backupName,review,original:await originalBreakdown(db,review.source),followup,contacts:await readRecoveryContactHistory(db,item.id),arrangement:await readRecoveryArrangement(db,item.id),proposals:proposals.results,receipts:currentReceipts.filter(r=>r.remainingPaisa>0),claimReceipts:currentReceipts,claims:await readRecoveryRepaymentClaims(db,item.id)});
 }
 const sources=caseId?[]:(await db.prepare(`SELECT r.id AS sourceId,'refund' AS kind,s.trading_name AS label FROM refunds r JOIN return_requests q ON q.id=r.return_request_id JOIN order_items i ON i.id=q.order_item_id JOIN seller_profiles s ON s.id=i.seller_id JOIN orders o ON o.id=r.order_id WHERE r.status IN('approved','paid','failed') AND s.user_id<>? AND o.customer_id<>? AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.refund_id=r.id)
  UNION ALL SELECT a.id,'supplier_adjustment',s.trading_name FROM managed_supplier_adjustments a JOIN managed_supplier_obligations o ON o.id=a.obligation_id JOIN seller_profiles s ON s.id=o.seller_id WHERE s.user_id<>? AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.supplier_adjustment_id=a.id) LIMIT 100`).bind(actorId,actorId,actorId).all<{sourceId:string;kind:'refund'|'supplier_adjustment';label:string}>()).results;
 await db.batch(authority.statements);
 return {superAdmin:authority.role==='super_admin',cases,summaries:caseId?[]:ids.results,sources};
}
export type RecoveryFinanceWorkspace=Awaited<ReturnType<typeof getRecoveryFinanceWorkspace>>;
