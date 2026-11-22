/** Acceptance reproductions only; fictional memory data. No production changes. */
import assert from 'node:assert/strict';
import {approvedSellerRecoveryFixture} from './seller-recovery-fixture';
import {recordBankReceipt} from '../../lib/payments/manual-receipts';
import {allocateSellerRecoveryReceipt,getSellerRecoveryReview} from '../../lib/payments/seller-recovery';
import {approveRecoveryRepaymentAttribution} from '../../lib/payments/recovery-repayment-attribution';
import {recordReceiptReversal} from '../../lib/payments/receipt-corrections';
import {getRecoveryReceiptReversalReview} from '../../lib/payments/recovery-receipt-disposition';
export async function completeOriginalPayerReturn(f:Awaited<ReturnType<typeof approvedSellerRecoveryFixture>>,receiptId:string,tag:string,complete=true){
 const opened=await f.m.openRefundObligation(f.db,f.ctx(tag+'-open'),{kind:'receipt_return',sourceId:receiptId,reason:'Return only the unused actual receipt balance to the verified factual original payer.'});
 const amount=Number(f.sqlite.prepare('SELECT cash_paisa FROM refund_obligations WHERE id=?').get(opened.id)!.cash_paisa);
 if(!complete)return {obligationId:opened.id,amount};
 const destination=await f.m.submitRefundDestination(f.db,{...f.ctx(tag+'-destination'),actorId:'customer',sessionHash:'FICTIONAL-PACKET-SESSION'},{obligationId:opened.id,details:{holder:'Fictional Buyer',bank:'Fictional Bank',branch:'Fictional Branch',accountNumber:'TEST-REFUND-001',currency:'NPR'},relationship:'own_account',authorization:'I authorize return of this unused actual receipt to my verified original payer account.',evidenceReference:'FICTIONAL-EXCESS-ORIGINAL-PAYER-DESTINATION',reason:'Authenticate the actual original payer and preserve their exact beneficiary instructions.'});
 await f.m.verifyRefundDestination(f.db,f.ctx(tag+'-verified','0'),{versionId:destination.id,ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-EXCESS-OWNERSHIP',reason:'Independently verify this exact original payer beneficiary before the actual return.'});
 const revision=String(f.sqlite.prepare('SELECT revision FROM company_funding_accounts WHERE account_id=(SELECT account_id FROM company_payment_account_versions WHERE id=?)').get(f.accountVersionId)!.revision),now=Number(f.sqlite.prepare("SELECT CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) n").get()!.n);
 const funding=await f.m.recordRefundFundingStatement(f.db,f.ctx(tag+'-funding',revision),{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-'+tag+'-ACTUAL-FUNDS',asOf:now,cashPaisa:500000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-EXCESS-RETURN-FUNDING',restrictionsReference:'FICTIONAL-SEPARATE-RESTRICTED-FUNDS',availableFundsConfirmed:true,reason:'Verify actual company funds while preserving all original restricted obligations.'});
 const packet=await f.m.prepareRefundPacket(f.db,f.ctx(tag+'-packet','0'),{obligationId:opened.id,destinationVersionId:destination.id,fundingStatementId:funding.id,reason:'Prepare exactly this original payer return with its separate verified beneficiary and funds.'});
 await f.m.approveRefundPacket(f.db,f.ctx(tag+'-approved','0'),{packetId:packet.id,reason:'Approve only the exact separately reserved actual original payer return.'});
 await f.m.startRefundPacket(f.db,f.ctx(tag+'-started','1'),{packetId:packet.id,reason:'Record the one actual fictional original payer return instruction.'});
 await f.m.recordRefundPacketOutcome(f.db,f.ctx(tag+'-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:amount,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-'+tag+'-PAID',evidenceReference:'FICTIONAL-EXCESS-RETURN-COMPLETED',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the actual completed original payer return without changing the original receipt facts.'});
 return {obligationId:opened.id,amount};
}
export async function mixedReceiptReview(returnStage:'reserved'|'returned'='reserved'){
 const f=await approvedSellerRecoveryFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const receipt=await recordBankReceipt(f.db,f.ctx('mixed-receipt-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-MIXED-RECOVERY-EXCESS-CREDIT',bankAt:Date.now()-1,amountMinor:f.originalPaidPaisa+1000,currency:'NPR',payerReference:'Fictional original third-party payer',payerUserId:'customer',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-MIXED-ACTUAL-CREDIT',reason:'Verify the actual third-party credit containing both case repayment and unused excess.'});
 const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await approveRecoveryRepaymentAttribution(f.db,f.ctx('mixed-attributed','1'),{caseId:f.recoveryId,receiptId:receipt.id,receiptRevision:0,amountPaisa:f.originalPaidPaisa,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-MIXED-CASE-ATTRIBUTION',reason:'Attribute only the exact approved recovery amount while retaining the factual original payer.',publicMessage:'Actual repayment attribution is reviewed; allocation and unused excess return remain separate.'});
 await allocateSellerRecoveryReceipt(f.db,f.ctx('mixed-allocated','2'),{caseId:f.recoveryId,receiptId:receipt.id,receiptRevision:1,amountPaisa:f.originalPaidPaisa,method:'cash',evidenceReference:'FICTIONAL-MIXED-ACTUAL-ALLOCATION',reason:'Settle only the original approved native deficit with this actual attributed repayment.'});
 const returned=await completeOriginalPayerReturn(f,receipt.id,'mixed-excess',returnStage==='returned');assert.equal(returned.amount,1000);
 const use=f.sqlite.prepare("SELECT state FROM manual_receipt_uses WHERE receipt_id=? AND kind='return'").get(receipt.id)!;assert.equal(use.state,returnStage);
 const allocation=String(f.sqlite.prepare('SELECT id FROM seller_recovery_allocations WHERE receipt_id=?').get(receipt.id)!.id),control=String(f.sqlite.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').get(receipt.id)!.revision);
 const retainedReturnBefore=f.sqlite.prepare("SELECT * FROM manual_receipt_uses WHERE receipt_id=? AND kind='return'").get(receipt.id);
 const retainedPacketsBefore=f.sqlite.prepare('SELECT * FROM outgoing_payment_packets WHERE obligation_id=? ORDER BY id').all(returned.obligationId);
 const reversed=await recordReceiptReversal(f.db,f.ctx('mixed-later-bank-reversal',control),{receiptId:receipt.id,amountMinor:5000,transactionIdentity:'FICTIONAL-MIXED-LATER-BANK-REVERSAL',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-MIXED-LATER-REVERSAL-PROOF',reason:'The bank later reversed only part of the original recovery credit; the actual excess return stays paid.'});
 const current=await getRecoveryReceiptReversalReview(f.db,'reviewer',reversed.id);assert.equal(current.otherUses[0].state,returnStage);
 return {...f,receipt,returned,allocation,retainedReturnBefore,retainedPacketsBefore,reversed,current};
 }catch(error){f.dispose();throw error;}
}
