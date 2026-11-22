import assert from 'node:assert/strict';
import test from 'node:test';
import {refundPacketFixture} from './helpers/refund-funding-fixture';
void test('a lawful original fee entitlement stays unpaid until its independently funded actual transfer is recorded',async()=>{
 const f=await refundPacketFixture({serviceFee:true});try{
 const path='../lib/payments/refund-obligations',m=await import(path);assert.equal(typeof m.authorizeLawfulFeeRefund,'function');
 const input={orderId:f.orderId,amountPaisa:1000,legalBasis:'Documented mandatory remedy for the actual original fee charge.',caseReference:'FICTIONAL-FEE-CASE',evidenceReference:'FICTIONAL-VERIFIED-LEGAL-REMEDY'};
 const authorized=await m.authorizeLawfulFeeRefund(f.db,f.ctx('lawful-fee-authorized'),input);
 assert.deepEqual(await m.authorizeLawfulFeeRefund(f.db,f.ctx('lawful-fee-authorized'),input),authorized);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='platform_service_fee.refunded'").get()!.n,0);
 const obligation=await m.openRefundObligation(f.db,f.ctx('lawful-fee-obligation'),{kind:'service_fee',sourceId:authorized.id,reason:'Open the original legally required fee refund without reporting payment.'});
 const destination=await m.submitRefundDestination(f.db,{...f.ctx('fee-customer-bank'),actorId:'customer',sessionHash:'FICTIONAL-PACKET-SESSION'},{obligationId:obligation.id,details:{holder:'Fictional Buyer',bank:'Fictional Bank',branch:'Fictional Branch',accountNumber:'TEST-FEE-001',currency:'NPR'},relationship:'own_account',authorization:'I authorize this original fee refund to my exact own bank account.',evidenceReference:'FICTIONAL-FEE-CUSTOMER-OWNERSHIP',reason:'Retain the authenticated original payer refund instructions.'});
 await m.verifyRefundDestination(f.db,f.ctx('fee-bank-verified','0'),{versionId:destination.id,ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-VERIFIED-FEE-BENEFICIARY',reason:'Verify exact ownership and payment relationship for this original fee.'});
 const packet=await m.prepareRefundPacket(f.db,f.ctx('fee-packet','0'),{obligationId:obligation.id,destinationVersionId:destination.id,fundingStatementId:f.fundingId,reason:'Prepare one exact packet from the verified available company funds.'});
 await m.approveRefundPacket(f.db,f.ctx('fee-packet-approved','0'),{packetId:packet.id,reason:'Approve the exact independent funding without a second-person requirement.'});
 await m.startRefundPacket(f.db,f.ctx('fee-packet-started','1'),{packetId:packet.id,reason:'Record the original actual manual instruction entering processing.'});
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='platform_service_fee.refunded'").get()!.n,0);
 const paid={packetId:packet.id,outcome:'paid',amountPaisa:1000,bankAt:Date.now(),transactionIdentity:'FICTIONAL-ACTUAL-FEE-TRANSFER',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,evidenceReference:'FICTIONAL-INDEPENDENT-COMPLETED-FEE',reason:'Reconcile the original actual fee payment independently of merchandise.'};
 await m.recordRefundPacketOutcome(f.db,f.ctx('fee-paid','2'),paid);await m.recordRefundPacketOutcome(f.db,f.ctx('fee-paid','2'),paid);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='platform_service_fee.refunded'").get()!.n,1);
 assert.equal(f.sqlite.prepare("SELECT status FROM refunds WHERE id=?").get(f.refundId)!.status,'approved');
 await assert.rejects(m.authorizeLawfulFeeRefund(f.db,f.ctx('fee-over-cap'),{...input,caseReference:'FICTIONAL-SECOND-CASE',amountPaisa:1}),/fee|remaining/i);
 }finally{f.dispose();}
});
