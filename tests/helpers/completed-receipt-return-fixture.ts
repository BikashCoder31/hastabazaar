import assert from 'node:assert/strict';
import {refundPacketFixture} from './refund-funding-fixture';
import {recordBankReceipt} from '../../lib/payments/manual-receipts';
import {recordReceiptReversal} from '../../lib/payments/receipt-corrections';
/** A separately verified incoming credit is actually returned to its exact original payer. */
export async function completedReceiptReturnFixture(outcome:'paid'|'uncertain'|'prepared'='paid'){
 const f=await refundPacketFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const credit=await recordBankReceipt(f.db,f.ctx('loss-original-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-ORIGINAL-PAYER-RETURN-CREDIT',bankAt:Date.now()-1,amountMinor:10000,currency:'NPR',payerReference:'Original authenticated customer payer',payerUserId:'customer',evidenceReference:'FICTIONAL-ORIGINAL-PAYER-ACTUAL-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify the actual incoming original payer credit before its separately authorized return.'});
 const obligation=await f.m.openRefundObligation(f.db,f.ctx('loss-original-return'),{kind:'receipt_return',sourceId:credit.id,reason:'Reserve only this actual unused credit for return to its authenticated original payer.'});
 const destination=await f.m.submitRefundDestination(f.db,{...f.ctx('loss-return-destination'),actorId:'customer',sessionHash:'FICTIONAL-PACKET-SESSION'},{obligationId:obligation.id,details:{holder:'Fictional Buyer',bank:'Fictional Bank',branch:'Fictional Branch',accountNumber:'TEST-ORIGINAL-PAYER-RETURN',currency:'NPR'},relationship:'own_account',authorization:'I authorize the return of my original credit to this exact customer-owned bank account.',evidenceReference:'FICTIONAL-RETURN-OWNERSHIP-EVIDENCE',reason:'Authenticate the original payer return destination without inventing a completed transfer.'});
 await f.m.verifyRefundDestination(f.db,f.ctx('loss-return-destination-verified','0'),{versionId:destination.id,ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-RETURN-VERIFIED-OWNERSHIP',reason:'Verify exact original payer ownership and authority before approving the return.'});
 const packet=await f.m.prepareRefundPacket(f.db,f.ctx('loss-return-packet','0'),{obligationId:obligation.id,destinationVersionId:destination.id,fundingStatementId:f.fundingId,reason:'Prepare only the exact original payer return with independently verified company funding.'});
 if(outcome!=='prepared'){
 await f.m.approveRefundPacket(f.db,f.ctx('loss-return-approved','0'),{packetId:packet.id,reason:'Approve actual funding and the independently verified original payer return.'});
 await f.m.startRefundPacket(f.db,f.ctx('loss-return-started','1'),{packetId:packet.id,reason:'Record the actual original payer return bank instruction once.'});
 await f.m.recordRefundPacketOutcome(f.db,f.ctx('loss-return-outcome','2'),{packetId:packet.id,outcome,...outcome==='paid'?{amountPaisa:10000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-ACTUAL-COMPLETED-PAYER-RETURN',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true}:{},evidenceReference:'FICTIONAL-ACTUAL-PAYER-RETURN-OUTCOME',reason:'Retain the actual independently reconciled outgoing original payer return outcome.'});
 }
 const reversal=await recordReceiptReversal(f.db,f.ctx('loss-actual-incoming-reversal',String(f.sqlite.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').get(credit.id)!.revision)),{receiptId:credit.id,amountMinor:4000,transactionIdentity:'FICTIONAL-LATER-INCOMING-CREDIT-REVERSAL',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-LATER-BANK-REVERSAL-PROOF',reason:'The bank actually reversed part of the original incoming credit after its separate return instruction.'});
 const use=f.sqlite.prepare('SELECT receipt_use_id id FROM refund_obligations WHERE id=?').get(obligation.id)!;
 return {...f,receiptId:credit.id,returnObligationId:obligation.id,returnPacketId:packet.id,receiptUseId:String(use.id),reversalId:reversal.id};
 }catch(error){f.dispose();throw error;}
}

