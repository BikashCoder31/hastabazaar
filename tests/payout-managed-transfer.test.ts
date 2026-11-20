import assert from 'node:assert/strict';
import test from 'node:test';
import {earnedMaker} from './helpers/company-store-financial-fixture';
import {verifiedPayoutSources} from './helpers/verified-payout-sources';
import {addModernPayoutRegistration} from './helpers/modern-payout-registration';
import {prepareManagedPayout,transitionManagedPayout} from '../lib/db/repositories/managed-settlements';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';
void test('managed percentage earnings use original entitlement allocations and cannot bypass actual execution evidence',async()=>{
 const f=await earnedMaker(true,Date.now()-12*86400000);try{
 const sources=f.payoutSources,context={...f.context,now:Date.now(),scheduledFor:Date.now(),destinationReference:sources.beneficiaryReference};
 addModernPayoutRegistration(f.sqlite,f.sellerId,'managed');
 await assert.rejects(prepareManagedPayout(f.db,context),/registration/i);
 f.sqlite.prepare('UPDATE seller_registration_intakes SET review_ready=1 WHERE seller_id=?').run(f.sellerId);
 const payout=await prepareManagedPayout(f.db,context);
 await assert.rejects(transitionManagedPayout(f.db,{...context,payoutId:payout,action:'mark_paid',providerReference:'TYPED-REFERENCE-IS-NOT-PROOF',requestId:'unsafe-managed-paid'}));
 const before=f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(payout)!;
 const packet=await preparePayoutTransfer(f.db,sources.ctx('managed-transfer-prepare'),{model:'managed',payoutId:payout,accountVersionId:sources.accountVersionId,reason:'Bind original percentage earnings, deductions and exact bank evidence.',environment:context.environment});
 await approvePayoutTransfer(f.db,sources.ctx('managed-transfer-approve','0'),{packetId:packet.id,reason:'One eligible Super Admin reviews the original exact managed transfer.',environment:context.environment});
 await startPayoutTransfer(f.db,sources.ctx('managed-transfer-start','1'),{packetId:packet.id,reason:'Record the manual original managed bank instruction as processing.',environment:context.environment});
 const input={packetId:packet.id,outcome:'paid' as const,amountPaisa:Number(before.amount_paisa),bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-ORIGINAL-MANAGED-DEBIT',evidenceReference:'FICTIONAL-INDEPENDENT-MANAGED-BANK-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'The actual original full managed transfer has independently confirmed bank evidence.',environment:context.environment};
 await recordPayoutTransferOutcome(f.db,sources.ctx('managed-transfer-paid','2'),input);await recordPayoutTransferOutcome(f.db,sources.ctx('managed-transfer-paid','2'),input);
 assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts WHERE id=?').get(payout)!.status,'paid');
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM managed_payout_allocations WHERE payout_id=? AND disposition='paid'").get(payout)!.n,before.amount_paisa);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payouts').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,1);
 }finally{f.dispose();}
});

void test('fixed supplier payout follows accepted supply, independently of customer resale, and retains guarded actual execution',async()=>{
 const {readyMaker}=await import('./helpers/company-store-lifecycle-fixture');const fixed=await import('../lib/managed-commerce/fixed-supply');
 const f=await readyMaker(Date.now()-12*86400000);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 // Explicit initial historical fixed contract, not live activation or a changed existing sale.
 f.sqlite.prepare("UPDATE seller_participation_profiles SET application_stage='active',commercial_model='managed_fixed_supplier_price_v1',payout_beneficiary_reference='SIM-FIXED-ORIGINAL',managed_agreement_version='FICTIONAL-FIXED-AGREEMENT',managed_agreement_language='en',managed_agreement_accepted_at=? WHERE seller_id=?").run(f.now,f.sellerId);
 const sources=await verifiedPayoutSources(f,f.sellerId),environment=f.activation.environment;
 const recordId=await fixed.createFixedSupplyRecord(f.db,{sellerId:f.sellerId,productId:'cup',quantity:2,agreedUnitPaisa:40000,createdBy:f.actorId,agreementVersion:'FICTIONAL-FIXED-AGREEMENT',agreementLanguage:'en',payoutBeneficiaryReference:sources.beneficiaryReference,requestId:'fixed-supply-proposed',now:Date.now(),environment});
 await fixed.decideFixedSupplyRecord(f.db,{recordId,actorId:'reviewer',action:'accept',quantityAccepted:2,possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',riskRecordStatus:'simulated_terms_recorded',evidenceReference:'FICTIONAL-INDEPENDENT-ACCEPTED-GOODS',reason:'Record independently inspected and accepted original fictional fixed-price goods.',requestId:'fixed-supply-accepted',now:Date.now(),environment});
 addModernPayoutRegistration(f.sqlite,f.sellerId,'fixed');
 const preparation={recordId,actorId:'reviewer',destinationReference:sources.beneficiaryReference,requestId:'fixed-native-preparation',now:Date.now(),environment};
 await assert.rejects(fixed.prepareFixedSupplierPayment(f.db,preparation),/registration/i);
 f.sqlite.prepare('UPDATE seller_registration_intakes SET review_ready=1 WHERE seller_id=?').run(f.sellerId);
 const payoutId=await fixed.prepareFixedSupplierPayment(f.db,preparation);
 await assert.rejects(fixed.transitionFixedSupplierPayment(f.db,{paymentId:payoutId,actorId:'reviewer',action:'mark_paid',requestId:'unsafe-fixed-paid',now:Date.now(),environment}));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n,0);
 const packet=await preparePayoutTransfer(f.db,sources.ctx('fixed-transfer-prepare'),{model:'fixed',payoutId,accountVersionId:sources.accountVersionId,reason:'Bind the accepted supplier obligation independently from any customer resale.',environment});
 await approvePayoutTransfer(f.db,sources.ctx('fixed-transfer-approve','0'),{packetId:packet.id,reason:'Approve the actual original supplier amount and exact verified bank source.',environment});
 await startPayoutTransfer(f.db,sources.ctx('fixed-transfer-start','1'),{packetId:packet.id,reason:'Record the original manual fixed-supplier instruction as processing.',environment});
 await recordPayoutTransferOutcome(f.db,sources.ctx('fixed-transfer-uncertain','2'),{packetId:packet.id,outcome:'uncertain',reason:'The original bank instruction has not yet received a definitive outcome.',evidenceReference:'FICTIONAL-FIXED-UNKNOWN-BANK-RESULT',environment});
 const {requestDocumentChange}=await import('../lib/sellers/document-review');const identity=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id=? AND kind='representative_identity' LIMIT 1").get(f.sellerId)!.id);
 await requestDocumentChange(f.db,{sellerId:f.sellerId,documentId:identity,actorId:f.actorId,reason:'Later identity evidence changes must retain the original uncertain supplier instruction.',commandId:'fixed-later-identity',now:Date.now()});
 assert.equal(f.sqlite.prepare("SELECT disposition FROM seller_payout_review_blocks WHERE payout_model='fixed' AND payout_id=?").get(payoutId)!.disposition,'reconcile');
 assert.throws(()=>f.sqlite.prepare("UPDATE managed_supplier_payments SET status='cancelled' WHERE id=?").run(payoutId),/original_payout_instruction/);
 await recordPayoutTransferOutcome(f.db,sources.ctx('fixed-transfer-paid','3'),{packetId:packet.id,outcome:'paid',amountPaisa:80000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-FIXED-ACTUAL-DEBIT',evidenceReference:'FICTIONAL-FIXED-COMPLETED-BANK-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Independently confirmed original supplier debit to the exact beneficiary.',environment});
 assert.equal((await fixed.getFixedSupplyBalance(f.db,recordId)).paidPaisa,80000);assert.equal((await fixed.getFixedSupplyBalance(f.db,recordId)).balancePaisa,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_entitlements').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payouts').get()!.n,0);
 }finally{f.dispose();}
});
