import assert from 'node:assert/strict';
import {refundPacketFixture} from './refund-funding-fixture';
import {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails} from '../../lib/sellers/bank-details';
import {accrueExistingDeliveredEarnings,prepareSellerPayout} from '../../lib/db/repositories/payouts';
import {recordRefundFundingStatement} from '../../lib/payments/refund-funding';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../../lib/payments/payout-transfers';
/** Full fictional native order/delivery/payout, followed by the original customer refund. */
export async function sellerRecoveryFixture(completeRefund=true,responsibility:'seller'|'platform'='seller',payOriginal=true,itemRefundPaisa?:number,originalOutcome:'paid'|'prepared'|'no_debit'|'debit_returned'|'uncertain'='paid'){
 let payoutId='',originalPacketId='',originalPaidPaisa=0;
 const ctx=(requestId:string,expectedRevision:string|null=null)=>({actorId:'reviewer',requestId,expectedRevision,now:Date.now()});
 const f=await refundPacketFixture({responsibility,itemRefundPaisa,immediateSettlement:true,fundingAsOfNow:true,fundingCashPaisa:originalOutcome==='paid'?undefined:250000,beforeReturn:async original=>{
  assert.ok(original.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  assert.equal(original.sqlite.prepare("SELECT COUNT(*) n FROM seller_beneficiary_versions WHERE seller_id='registered'").get()!.n,0);
  original.sqlite.prepare("UPDATE seller_profiles SET payout_account_reference=NULL WHERE id='registered'").run();
  const state=await sellerBankState(original.db,'registered');
  await submitSellerBankDetails(original.db,{sellerId:'registered',actorId:'registered-owner',revision:state.revision,now:Date.now(),details:{payoutBeneficiary:'Fictional Registered Company',bankName:'Fictional Company Bank',bankBranch:'Fictional branch',bankAccountNumber:'TEST-RECOVERY-ORIGINAL'},document:{id:'recovery-original-bank',kind:'bank_verification',objectKey:'private/seller-documents/registered/recovery-original-bank',originalName:'company-bank.png',mimeType:'image/png',sizeBytes:20}});
  const pending=await sellerBankState(original.db,'registered');await reviewSellerBankDetails(original.db,{sellerId:'registered',actorId:'reviewer',revision:pending.revision,reference:'FICTIONAL-COMPANY-BENEFICIARY-OWNERSHIP',reason:'Independently verify the original legal company and its bank evidence before payment.',ownershipBasis:'same_legal_entity',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'recovery-original-bank-review',now:Date.now()});
  await accrueExistingDeliveredEarnings(original.db,{actorId:'reviewer',requestId:'recovery-original-earned',now:Date.now()});
  assert.ok(Number(original.sqlite.prepare("SELECT COALESCE(SUM(amount_paisa),0) n FROM seller_ledger_entries WHERE seller_id='registered' AND available_at<=?").get(Date.now())!.n)>0,JSON.stringify({order:original.sqlite.prepare('SELECT id,status,payment_status,delivered_at FROM orders WHERE id=?').get(original.orderId),ledger:original.sqlite.prepare("SELECT type,amount_paisa,available_at FROM seller_ledger_entries WHERE seller_id='registered'").all(),items:original.sqlite.prepare('SELECT seller_id,fulfillment_status,commission_rule_version FROM order_items WHERE order_id=?').all(original.orderId),parcels:original.sqlite.prepare('SELECT j.status,p.cod_due_paisa,p.remitted_paisa FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=?').all(original.orderId),terms:original.sqlite.prepare("SELECT json_extract(terms_snapshot_json,'$.registeredSettlementTerms') terms FROM order_policy_acceptances WHERE order_id=?").get(original.orderId)}));
  if(!payOriginal)return;
  const payout=await prepareSellerPayout(original.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',note:'Pay the original delivered earnings under their actual zero-day fixture terms.',requestId:'recovery-original-payout',now:Date.now()});payoutId=payout.id;
  originalPaidPaisa=Number(original.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(payout.id)!.amount_paisa);
  await recordRefundFundingStatement(original.db,ctx('recovery-before-payout-funds'),{accountVersionId:original.accountVersionId,statementIdentity:'FICTIONAL-RECOVERY-ORIGINAL-CAPITAL',asOf:Date.now()-5000,cashPaisa:200000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-RECOVERY-ACTUAL-CAPITAL',restrictionsReference:'FICTIONAL-RESTRICTED-CUSTOMER-FUNDS',availableFundsConfirmed:true,reason:'Independently verify actual fictional company funding before the original seller payout.'});
  const packet=await preparePayoutTransfer(original.db,ctx('recovery-original-packet'),{model:'registered',payoutId:payout.id,accountVersionId:original.accountVersionId,reason:'Bind original earned money and the verified original company beneficiary.'});
  originalPacketId=packet.id;if(originalOutcome==='prepared')return;
  await approvePayoutTransfer(original.db,ctx('recovery-original-approval','0'),{packetId:packet.id,reason:'One eligible Super Admin approves the exact original source and amount.'});
  await startPayoutTransfer(original.db,ctx('recovery-original-start','1'),{packetId:packet.id,reason:'Record the one fictional original manual bank instruction.'});
  if(originalOutcome==='paid')await recordPayoutTransferOutcome(original.db,ctx('recovery-original-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:originalPaidPaisa,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-RECOVERY-ORIGINAL-SELLER-DEBIT',evidenceReference:'FICTIONAL-RECOVERY-CONFIRMED-SELLER-DEBIT',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the actual fictional completed original seller transfer and exact beneficiary.'});
  else await recordPayoutTransferOutcome(original.db,ctx('recovery-original-not-paid','2'),{packetId:packet.id,outcome:originalOutcome==='uncertain'?'uncertain':'failed',...(originalOutcome==='no_debit'?{failureBasis:'no_debit' as const,noDebitConfirmed:true}:originalOutcome==='debit_returned'?{failureBasis:'debit_returned' as const,returnedDebitConfirmed:true,returnedAmountPaisa:originalPaidPaisa}:{}),evidenceReference:'FICTIONAL-REGISTERED-ORIGINAL-OUTCOME',reason:'Retain the actual fictional instruction outcome while keeping its native reservation for explicit disposition.'});
 }});
 try{
 if(completeRefund){const packet=await f.m.prepareRefundPacket(f.db,ctx('recovery-customer-packet','0'),{obligationId:f.obligationId,destinationVersionId:f.destinationId,fundingStatementId:f.fundingId,reason:'Prepare the authorized original customer refund independently of seller recovery.'});
 await f.m.approveRefundPacket(f.db,ctx('recovery-customer-approval','0'),{packetId:packet.id,reason:'Approve actual company funding without waiting for the seller to repay.'});
 await f.m.startRefundPacket(f.db,ctx('recovery-customer-start','1'),{packetId:packet.id,reason:'Record the original fictional customer refund instruction once.'});
 await f.m.recordRefundPacketOutcome(f.db,ctx('recovery-customer-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:f.cashPaisa,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-RECOVERY-CUSTOMER-REFUND',evidenceReference:'FICTIONAL-RECOVERY-CUSTOMER-REFUND-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm actual customer cash return and restoration of the original wallet credit.'});}
 return {...f,payoutId,originalPacketId,originalPaidPaisa};
 }catch(error){f.dispose();throw error;}
}

export async function approvedSellerRecoveryFixture(){
 const f=await sellerRecoveryFixture();try{
 const m=await import('../../lib/payments/seller-recovery');
 const opened=await m.openSellerRecovery(f.db,f.ctx('approved-fixture-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the actual original payout and customer refund in this isolated fixture.'});
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 await m.approveSellerRecovery(f.db,f.ctx('approved-fixture-decision','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-ORIGINAL-RESPONSIBILITY-RECONCILIATION',reason:'Approve the exact original net balance with one eligible Super Admin in this fictional fixture.'});
 return {...f,recoveryId:opened.id};
 }catch(error){f.dispose();throw error;}
}

export async function agreedSellerRecoveryFixture(){
 const f=await approvedSellerRecoveryFixture();try{
 const m=await import('../../lib/payments/seller-recovery');
 const terms=await m.getSellerRecoveryPlanTerms(f.db,'registered-owner',f.recoveryId),now=Date.now();
 const proposal=await m.proposeSellerRecoveryPlan(f.db,{...f.ctx('fixture-explicit-agreement','1'),actorId:'registered-owner'},{caseId:f.recoveryId,termsDigest:terms.termsDigest,termsAccepted:true,nettingAuthorized:true,installments:[{amountPaisa:f.originalPaidPaisa,dueAt:now+7*86400000}],contactDetails:'Use my verified seller account contact.',nextReviewAt:now+3*86400000});
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await m.approveSellerRecoveryPlan(f.db,f.ctx('fixture-approved-agreement','2'),{caseId:f.recoveryId,proposalId:proposal.id,reviewDigest:review.reviewDigest,reason:'Approve the explicitly accepted exact case-specific earnings authority and repayment dates.'});
 return f;
 }catch(error){f.dispose();throw error;}
}
