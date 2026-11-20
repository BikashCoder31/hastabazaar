import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredLiveFinancialFixture,refundActualLiveOrder} from './helpers/live-financial-lifecycle-fixture';
import {actualMixedCohortFixture} from './helpers/live-financial-cohort-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {getLiveManagedPayoutPreview,prepareLiveManagedPayout,getLiveManagedFinanceSummary} from '../lib/managed-commerce/live-payout-operations';
import * as transfers from '../lib/payments/payout-transfers';
import {readOwnedLiveManagedInvoices,issueLiveManagedInvoiceAdjustment} from '../lib/managed-commerce/live-billing';
import * as recovery from '../lib/payments/seller-recovery';
import {modelRecoveryNettingStatements} from '../lib/payments/recovery-earnings-models';

void test('native actual source executes maker payout and customer refund, retains one invoice and its original source credit',async()=>{
 const f=await deliveredLiveFinancialFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 native=await nativeFinanceClone(f.sqlite);const db=native.db,preview=await getLiveManagedPayoutPreview(db,f.sellerId,Date.now());assert.equal(preview.amountPaisa,69000);
 const p=await prepareLiveManagedPayout(db,f.ctx('native-actual-payout'),{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'Review the exact actual native original earning and independently verified beneficiary.'});
 const packet=await transfers.preparePayoutTransfer(db,f.ctx('native-actual-packet'),{model:'managed',payoutId:p.id,accountVersionId:f.sources.accountVersionId,reason:'Use the original actual native payout and independently verified company funds.'});
 await db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").bind(f.buyerId).run();
 await db.prepare('UPDATE orders SET customer_id=? WHERE id=?').bind(f.ownerId,f.orderId).run();
 await assert.rejects(()=>db.prepare("UPDATE payout_transfer_packets SET state='approved',revision=revision+1,approved_by=?,approved_at=? WHERE id=?").bind(f.buyerId,Date.now(),packet.id).run(),/managed_live.*party|managed_live.*independent/);
 await assert.rejects(()=>transfers.approvePayoutTransfer(db,{...f.ctx('native-retained-buyer-denied','0'),actorId:f.buyerId},{packetId:packet.id,reason:'The original retained buyer remains personally interested after customer metadata correction.'}),e=>e instanceof Error&&'status' in e&&e.status===403);
 await db.prepare('UPDATE orders SET customer_id=? WHERE id=?').bind(f.buyerId,f.orderId).run();
 await transfers.approvePayoutTransfer(db,f.ctx('native-actual-approved','0'),{packetId:packet.id,reason:'Approve this exact actual original source and current verified destination.'});
 await transfers.startPayoutTransfer(db,f.ctx('native-actual-started','1'),{packetId:packet.id,reason:'Retain this one actual fictional bank instruction as processing.'});
 const ctx=f.ctx('native-actual-paid','2'),input={packetId:packet.id,outcome:'paid' as const,amountPaisa:69000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-NATIVE-ACTUAL-MAKER-DEBIT',evidenceReference:'FICTIONAL-NATIVE-ACTUAL-MAKER-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual original completed native bank debit and exact beneficiary.'};
 await transfers.recordPayoutTransferOutcome(db,ctx,input);await transfers.recordPayoutTransferOutcome(db,ctx,input);
 assert.equal((await getLiveManagedFinanceSummary(db,f.sellerId)).paidPaisa,69000);
 const refunded=await refundActualLiveOrder({...f,db},'native-actual-customer-refund');
 const [invoice]=await readOwnedLiveManagedInvoices(db,{orderId:f.orderId,customerId:f.buyerId});
 await issueLiveManagedInvoiceAdjustment(db,f.ctx('native-actual-credit'),{invoiceGroupId:invoice.id,sourceKind:'refund',sourceId:refunded.refundId,reason:'Credit this exact original invoice only after the actual native customer refund.'});
 assert.equal((await readOwnedLiveManagedInvoices(db,{orderId:f.orderId,customerId:f.buyerId}))[0].adjustments.length,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM managed_live_invoice_numbers').first<{n:number}>())!.n,2);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').first<{n:number}>())!.n,2);
 await db.prepare('UPDATE orders SET customer_id=? WHERE id=?').bind(f.ownerId,f.orderId).run();
 await assert.rejects(()=>recovery.openSellerRecovery(db,{...f.ctx('native-original-buyer-recovery-denied'),actorId:f.buyerId},{kind:'refund',id:refunded.refundId,reason:'The immutable original customer cannot review this first actual recovery after metadata correction.'}),e=>e instanceof Error&&'status' in e&&e.status===403);
 await db.prepare('UPDATE orders SET customer_id=? WHERE id=?').bind(f.buyerId,f.orderId).run();
 const source=await recovery.readSellerRecoverySource(db,{kind:'refund',id:refunded.refundId});await recovery.recoveryExecutionGate(db,source);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await native?.dispose();f.dispose();}
});

void test('native actual netting ignores older simulation dispute and rejects an atomic cross-cohort withholding',async()=>{
 const f=await actualMixedCohortFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await recovery.getSellerRecoveryReview(db,'reviewer',f.actualCase),old=await db.prepare('SELECT * FROM seller_recovery_cases WHERE id=?').bind(f.historicalCase).first<Record<string,unknown>>();
 const plan=JSON.parse(String((await db.prepare('SELECT plan_json FROM seller_recovery_cases WHERE id=?').bind(f.actualCase).first<{plan_json:string}>())!.plan_json));
 await assert.rejects(()=>db.batch(modelRecoveryNettingStatements(db,review.source,f.ctx('native-forged-cohort'),{caseId:f.actualCase,allocationId:'native-forged-cohort',futureId:f.historical.entitlementId,amount:1,creditId:'native-forged-credit',debitId:'native-forged-debit',proposalId:plan.proposalId})),/managed_recovery_cannot_mix_simulation_live/);
 const applied=await recovery.applySellerRecoveryEarnings(db,f.ctx('native-actual-netting',String(review.case.revision)),{caseId:f.actualCase});assert.equal(applied.amountPaisa,69000);
 assert.deepEqual(await db.prepare('SELECT * FROM seller_recovery_cases WHERE id=?').bind(f.historicalCase).first(),old);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE entitlement_id=? AND reason_code='recovery_netting_withholding'").bind(f.historical.entitlementId).first<{n:number}>())!.n,0);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await native?.dispose();f.dispose();}
});

