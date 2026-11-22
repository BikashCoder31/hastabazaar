import {historicalPartialManagedFixture} from './historical-partial-managed-fixture';
import {historicalPartialRegisteredFixture} from './historical-partial-registered-fixture';
import {getReturnHandling,recordReturnHandling} from '../../lib/returns/handling';
import {advanceReturnAsAdmin} from '../../lib/db/repositories/returns';
import * as recovery from '../../lib/payments/seller-recovery';
import {recordBankReceipt} from '../../lib/payments/manual-receipts';
import assert from 'node:assert/strict';
import {sellerRecoveryFixture} from './seller-recovery-fixture';
import {unpaidManagedRefundFixture} from './managed-recovery-fixture';
import {openSellerRecovery,getSellerRecoveryReview} from '../../lib/payments/seller-recovery';

export async function partialUnpaidFixture(model:'registered'|'managed',partialPaid=false){
 const f=partialPaid?(model==='registered'?await historicalPartialRegisteredFixture():await historicalPartialManagedFixture()):(model==='registered'?await sellerRecoveryFixture(true,'seller',false):await unpaidManagedRefundFixture('seller',false));
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  if(partialPaid){
   const physicalId=String(f.sqlite.prepare('SELECT return_request_id FROM refunds WHERE id=?').get(f.refundId)!.return_request_id),handling=(await getReturnHandling(f.db,physicalId))!;
   await recordReturnHandling(f.db,f.ctx('partial-paid-physical-reviewed',String(handling.revision)),{caseId:physicalId,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The original physical return is waived after review.',privateNote:'The fictional no-return evidence was reviewed before closing physical care.',evidenceReference:'FICTIONAL-PARTIAL-NO-RETURN-PROOF'});
   await advanceReturnAsAdmin(f.db,{returnRequestId:physicalId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'Original actual refund and physical care complete.',publicMessageEn:'Your original refund case is complete.',publicMessageNe:'Original refund case complete.',requestId:'partial-paid-physical-complete',now:Date.now()});
  }else if('entitlementId'in f)f.sqlite.prepare("INSERT INTO managed_settlement_entries(id,entitlement_id,type,amount_paisa,reason_code,created_by,request_id,created_at) VALUES('partial-original-cost',?,'dispute_adjustment',-60000,'legacy_original_charge','reviewer','partial-original-cost',1)").run(f.entitlementId);
  else{
   const item=f.sqlite.prepare("SELECT order_item_id AS id FROM seller_ledger_entries WHERE seller_id='registered' AND type='sale'").get()!;
   f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,type,amount_paisa,available_at,description,created_at) VALUES('partial-original-cost','registered',?,'adjustment',-10000,1,'Fictional retained original expense',1)").run(item.id);
  }
  const opened=await openSellerRecovery(f.db,f.ctx('partial-original-open'),{kind:'refund',id:f.refundId,reason:'Review the completed original refund against its shared earned pool and retained original expenses.'});
  const review=await getSellerRecoveryReview(f.db,'reviewer',opened.id),environment='context'in f?f.context.environment:undefined;
  return {...f,model,environment,caseId:opened.id,review,input:{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-PRIVATE-PARTIAL-SOURCE',reason:'Use only the original unpaid earnings remaining after every retained original expense and earlier review.',publicMessage:'Original unpaid earnings cover part of this refund. Only the additional deficit needs separate recovery approval.'}};
 }catch(error){f.dispose();throw error;}
}

export async function combinedPartialUnpaidFixture(model:'registered'|'managed',partialPaid=false){
 const f=await partialUnpaidFixture(model,partialPaid);try{
  const env=f.environment?{environment:f.environment}:{};
  await recovery.reviewPartialUnpaidSellerRecoverySource(f.db,f.ctx('partial-combined-review','0'),{...f.input,...env});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);const unpaid=review.source.originalUnpaidOffsetPaisa!,deficit=review.case.confirmedPaisa;
  await recovery.approveSellerRecovery(f.db,f.ctx('partial-combined-approval','1'),{caseId:f.caseId,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-PARTIAL-DEFICIT-PROOF',reason:'Approve only the additional native deficit after the shared original earnings were used once.'});
  const receipt=await recordBankReceipt(f.db,f.ctx('partial-combined-cash'),{accountVersionId:'payoutSources'in f?f.payoutSources.accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-PARTIAL-DEFICIT-REPAYMENT',bankAt:Date.now()-1,amountMinor:deficit,currency:'NPR',payerReference:'Fictional original seller',payerUserId:review.source.ownerId,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-PARTIAL-DEFICIT-RECEIPT',reason:'Independently verify the actual fictional repayment of only the additional original deficit.'});
  await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('partial-combined-allocated','2'),{caseId:f.caseId,receiptId:receipt.id,receiptRevision:0,amountPaisa:deficit,method:'cash',...env,evidenceReference:'FICTIONAL-PARTIAL-DEFICIT-RECEIPT',reason:'Settle only the approved additional deficit without collecting the original unpaid portion again.'});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  await recovery.correctSellerRecoveryLiability(f.db,f.ctx('partial-combined-correct-deficit','3'),{caseId:f.caseId,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,...env,evidenceReference:'FICTIONAL-PARTIAL-RESPONSIBILITY-OVERTURNED',reason:'The original responsibility is overturned. Restore the actual additional repayment before correcting the original unpaid deduction.',publicMessage:'The additional liability is removed and your actual repayment is restored to your seller balance.'});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  const input={caseId:f.caseId,newUnpaidResponsibilityPaisa:0,reviewDigest:review.reviewDigest,...env,evidenceReference:'FICTIONAL-PARTIAL-ORIGINAL-DEDUCTION-OVERTURNED',reason:'Restore the separately retained original unpaid deduction after the additional collected liability was fully reconciled.',publicMessage:'The original unpaid deduction is also restored. Both parts of the overturned original responsibility are now reconciled.'};
  return {...f,unpaid,deficit,correctionInput:input};
 }catch(error){f.dispose();throw error;}
}
