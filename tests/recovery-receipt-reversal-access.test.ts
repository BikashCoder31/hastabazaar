import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {completedReceiptReturnFixture} from './helpers/completed-receipt-return-fixture';
import {completeOriginalPayerReturn} from './helpers/recovery-mixed-receipt-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {recordReceiptReversal} from '../lib/payments/receipt-corrections';
import {recordCustomerRefundReversal,retainCustomerRefundRecovery} from '../lib/payments/customer-refund-reversal';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from '../lib/payments/recovery-receipt-disposition';
import {recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount} from '../lib/payments/company-accounts';
import {companyDetails} from '../lib/content/company-details';
void test('return-only saved outcome rechecks a new personal interest in the linked original customer refund seller',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const original=f.sqlite.prepare("SELECT id,revision FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
 const receipt=await recordBankReceipt(f.db,f.ctx('access-customer-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-ACCESS-CUSTOMER-RETURN-CREDIT',bankAt:Date.now()-1,amountMinor:1000,currency:'NPR',payerReference:'Fictional original refund customer',payerUserId:'customer',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-ACCESS-CUSTOMER-RETURN-PROOF',reason:'Verify this actual returned original customer refund before retaining its original disposition.'});
 const returned=await recordCustomerRefundReversal(f.db,f.ctx('access-customer-return-recorded',String(original.revision)),{packetId:String(original.id),receiptId:receipt.id,receiptRevision:0,amountPaisa:1000,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-ACCESS-ORIGINAL-RETURN',reason:'Retain the actual original customer bank return and its linked original recovery parties.'});
 const retry=await f.m.openRefundObligation(f.db,f.ctx('access-original-customer-retry'),{kind:'receipt_return',sourceId:receipt.id,reason:'Retain the still-valid original customer refund against this actual returned bank credit.'});
 const current=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await retainCustomerRefundRecovery(f.db,f.ctx('access-customer-still-due',String(current.case.revision)),{caseId:f.recoveryId,reversalId:returned.id,retryObligationId:retry.id,reviewDigest:current.reviewDigest,stillValidObligationConfirmed:true,evidenceReference:'FICTIONAL-ACCESS-STILL-VALID-OBLIGATION',reason:'The original customer refund remains due and the original seller responsibility remains valid.',publicMessage:'The original customer refund remains due while its returned credit is reissued.'});
 await completeOriginalPayerReturn(f,receipt.id,'access-completed-customer-retry');
 const reversal=await recordReceiptReversal(f.db,f.ctx('access-later-customer-credit-reversal',String(f.sqlite.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').get(receipt.id)!.revision)),{receiptId:receipt.id,amountMinor:400,transactionIdentity:'FICTIONAL-ACCESS-LATER-INCOMING-REVERSAL',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-ACCESS-LATER-REVERSAL',reason:'Retain the actual later incoming bank reversal after this original customer reissue completed.'});
 const review=await getRecoveryReceiptReversalReview(f.db,'reviewer',reversal.id);assert.equal(review.cases.length,0);
 const ctx=f.ctx('access-return-only-saved-loss',String(review.receiptRevision)),packet=String(f.sqlite.prepare("SELECT id FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(retry.id)!.id),use=String(f.sqlite.prepare('SELECT receipt_use_id id FROM refund_obligations WHERE id=?').get(retry.id)!.id);
 const result=await reconcileRecoveryReceiptReversal(f.db,ctx,{reversalId:reversal.id,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],completedReturns:[{receiptUseId:use,packetId:packet,amountPaisa:400}],companyLossApproved:true,evidenceReference:'FICTIONAL-ACCESS-COMPANY-LOSS',reason:'Recognize only this actual company bank loss without changing the completed original customer payment.',publicMessage:'The original customer return remains paid and no new amount is due.'});
 assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',ctx.requestId,'staff'),result);
 f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();
 await assert.rejects(getRecoveryReceiptReversalReview(f.db,'reviewer',reversal.id),/personal interest|original returned customer/);
 await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',ctx.requestId,'staff'),/personal interest|original returned customer/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_losses').get()!.n,1);
 }finally{f.dispose();}
});
void test('saved return-only bank satisfaction rechecks every later outgoing company account before replay disclosure',async()=>{
 const f=await completedReceiptReturnFixture('prepared');try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 await f.m.voidUnsentRefundPacket(f.db,f.ctx('access-retire-unsent-packet','0'),{packetId:f.returnPacketId,notSentConfirmed:true,evidenceReference:'FICTIONAL-ACCESS-PROVEN-NOT-SENT',reason:'Retire the never-sent original instruction before reviewing the actual direct original payer bank return.'});
 const review=await getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId),ctx=f.ctx('access-saved-partial-bank-satisfaction',String(review.receiptRevision));
 const saved=await reconcileRecoveryReceiptReversal(f.db,ctx,{reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],reservedReturns:[{receiptUseId:f.receiptUseId,amountPaisa:4000,originalPayerReturnedConfirmed:true}],evidenceReference:'FICTIONAL-ACCESS-EXACT-PAYER-BANK-RETURN',reason:'The actual bank reversal returned this exact amount directly to the original payer; no outgoing return was paid.',publicMessage:'The actual bank returned part directly to the original payer. The remaining reviewed return stays separately due.'});
 assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',ctx.requestId,'staff'),saved);
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',1)").run();
 const other=(id:string,revision:string|null=null)=>({...f.ctx(id,revision),actorId:'registered-owner'});
 const account=await saveCompanyAccountDraft(f.db,other('access-other-outgoing-account'),{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional Different Company Bank',branch:'Fictional Other Branch',accountNumber:'TEST-LATER-OUTGOING-INTEREST',currency:'NPR',purpose:'both'},evidenceReference:'FICTIONAL-LATER-OUTGOING-ACCOUNT',conflictUserIds:['reviewer'],reason:'Retain this separately verified outgoing company account and its reviewer personal-interest declaration.'});
 await submitCompanyAccountForReview(f.db,other('access-other-account-submitted','0'),{versionId:account.versionId,reason:'Submit the exact different outgoing account and its retained personal-interest declaration.'});
 await verifyCompanyAccount(f.db,other('access-other-account-verified','1'),{versionId:account.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-LATER-ACCOUNT-OWNERSHIP',reason:'Verify this actual different company account using an eligible operator without its declared interest.'});
 const now=Number(f.sqlite.prepare("SELECT CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) n").get()!.n),funding=await f.m.recordRefundFundingStatement(f.db,other('access-other-account-funds'),{accountVersionId:account.versionId,statementIdentity:'FICTIONAL-LATER-OUTGOING-FUNDS',asOf:now,cashPaisa:50000,restrictedPaisa:0,evidenceReference:'FICTIONAL-LATER-AVAILABLE-FUNDS',restrictionsReference:'FICTIONAL-LATER-RESTRICTIONS',availableFundsConfirmed:true,reason:'Verify separate actual company funds for only the remaining original payer return.'});
 const destination=String(f.sqlite.prepare("SELECT id FROM refund_destination_versions WHERE obligation_id=? AND status='verified' ORDER BY created_at DESC LIMIT 1").get(f.returnObligationId)!.id),revision=String(f.sqlite.prepare('SELECT revision FROM refund_obligations WHERE id=?').get(f.returnObligationId)!.revision);
 await f.m.prepareRefundPacket(f.db,other('access-new-outgoing-account-packet',revision),{obligationId:f.returnObligationId,destinationVersionId:destination,fundingStatementId:funding.id,reason:'Prepare the remaining original payer return on the different verified company funding account.'});
 await assert.rejects(getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId),/outgoing company account/);
 await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',ctx.requestId,'staff'),/outgoing company account/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_satisfactions').get()!.n,1);
 }finally{f.dispose();}
});
