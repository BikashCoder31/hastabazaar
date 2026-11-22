import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredLiveFinancialFixture,refundActualLiveOrder} from './helpers/live-financial-lifecycle-fixture';
import {getLiveManagedPayoutPreview,prepareLiveManagedPayout} from '../lib/managed-commerce/live-payout-operations';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';
import {readOwnedLiveManagedInvoices,issueLiveManagedInvoiceAdjustment} from '../lib/managed-commerce/live-billing';
import {readSellerRecoverySource,openSellerRecovery,recoveryExecutionGate,getSellerRecoveryReview,approveSellerRecovery,absorbSellerRecovery} from '../lib/payments/seller-recovery';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../lib/db/repositories/business-settings';
import {readManagedLiveEligibility} from '../lib/managed-commerce/live-activation';
import {getSellerEarnings} from '../lib/seller/earnings';
import {getSellerReadiness} from '../lib/sellers/readiness';

void test('actual live original checkout, company fulfillment, customer payment and maker bank payout never require simulation permission',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
 assert.equal((await getSellerEarnings(f.db,f.sellerId)).managed!.summary.payablePaisa,69000,'Seller-visible actual payable money must match the original live earning.');
 assert.equal((await getSellerReadiness(f.db,f.sellerId,Date.now())).payouts,true);
 const fee=await createBusinessSettingDraft(f.db,{key:'managed_sale_linked_platform_retention_bps',value:1625,actorId:'reviewer',reason:'A genuinely published new fee must hold only new orders pending this owner acceptance.',requestId:'actual-new-fee-draft',now:Date.now()});
 const feePublishedAt=Date.now();
 await publishBusinessSettingDraft(f.db,{id:fee.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:feePublishedAt,reason:'Publish the new offer without changing original accepted order economics.',requestId:'actual-new-fee-published',now:feePublishedAt,simulationAllowed:true});
 assert.equal((await readManagedLiveEligibility(f.db,f.sellerId,Date.now())).enabled,false);
 const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now());assert.equal(preview.amountPaisa,69000);
 const input={sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'Independently review the original actual paid delivered source and current maker beneficiary.'},ctx=f.ctx('actual-live-native-payout');
 const native=await prepareLiveManagedPayout(f.db,ctx,input);assert.deepEqual(await prepareLiveManagedPayout(f.db,ctx,input),native);
 const reserved=(await getSellerEarnings(f.db,f.sellerId)).managed!;assert.equal(reserved.recordKind,'live');assert.equal(reserved.summary.reservedPaisa,69000);assert.equal(reserved.summary.payablePaisa,0);assert.equal(reserved.summary.paidPaisa,0);
 const packet=await preparePayoutTransfer(f.db,f.ctx('actual-live-bank-prepare'),{model:'managed',payoutId:native.id,accountVersionId:f.sources.accountVersionId,reason:'Bind the actual original native live payout to independently verified company funds.'});
 await approvePayoutTransfer(f.db,f.ctx('actual-live-bank-approved','0'),{packetId:packet.id,reason:'Review the actual original verified source and beneficiary before manual payment.'});
 await startPayoutTransfer(f.db,f.ctx('actual-live-bank-started','1'),{packetId:packet.id,reason:'Retain the one actual fictional manual bank instruction as processing.'});
 const paidCtx=f.ctx('actual-live-bank-paid','2'),paidInput={packetId:packet.id,outcome:'paid' as const,amountPaisa:69000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-ACTUAL-LIVE-MAKER-DEBIT',evidenceReference:'FICTIONAL-INDEPENDENT-ACTUAL-MAKER-DEBIT',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual fictional completed original debit and exact retained maker beneficiary.'};
 await recordPayoutTransferOutcome(f.db,paidCtx,paidInput);await recordPayoutTransferOutcome(f.db,paidCtx,paidInput);
 assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts WHERE id=?').get(native.id)!.status,'paid');
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM managed_payout_allocations WHERE payout_id=? AND disposition='paid'").get(native.id)!.n,69000);
 assert.equal((await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now())).amountPaisa,0);
 const paidSummary=(await getSellerEarnings(f.db,f.sellerId)).managed!.summary;assert.equal(paidSummary.paidPaisa,69000);assert.equal(paidSummary.reservedPaisa,0);assert.equal(paidSummary.balancePaisa,0);
 const [invoice]=await readOwnedLiveManagedInvoices(f.db,{orderId:f.orderId,customerId:f.buyerId});assert.equal(invoice.snapshot.issuerModel,'company_commercial_invoice_v1');assert.equal(invoice.snapshot.items[0].orderItemId,f.orderItemId);assert.doesNotMatch(JSON.stringify(invoice),/SIMULATED|SIM-INV|private\/managed-clearance/);
 const paymentReceipt=JSON.parse(String(f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE order_id=? AND kind='payment_receipt'").get(f.orderId)!.snapshot_json));
 assert.equal(paymentReceipt.billing.receiptGroups[0].canonicalInvoiceId,invoice.id);assert.equal(paymentReceipt.billing.receiptGroups[0].billNumber,invoice.invoiceNumber);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='billing.receipt.numbered'").get()!.n,0,'The actual payment receipt must reuse its canonical invoice number.');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_live_invoice_numbers').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,1);
 const refunded=await refundActualLiveOrder(f),source=await readSellerRecoverySource(f.db,{kind:'refund',id:refunded.refundId});
 assert.equal(source.model,'managed');await recoveryExecutionGate(f.db,source);
 await assert.rejects(()=>recoveryExecutionGate(f.db,{...source,orderItemId:'not-the-original-live-item'}),/simulation environment/);
 const originalInvoice=f.sqlite.prepare('SELECT * FROM managed_invoice_groups WHERE id=?').get(invoice.id);
 const credit=await issueLiveManagedInvoiceAdjustment(f.db,f.ctx('actual-live-refund-invoice-credit'),{invoiceGroupId:invoice.id,sourceKind:'refund',sourceId:refunded.refundId,reason:'Credit the exact original commercial invoice after its actual completed customer refund.'});
 assert.ok(credit.id);assert.deepEqual(f.sqlite.prepare('SELECT * FROM managed_invoice_groups WHERE id=?').get(invoice.id),originalInvoice);
 assert.equal(f.sqlite.prepare('SELECT status FROM refunds WHERE id=?').get(refunded.refundId)!.status,'paid');
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM managed_settlement_entries WHERE entitlement_id=? AND type='refund_adjustment'").get(f.entitlementId)!.n,-69000);
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(f.buyerId);
 f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(f.ownerId,f.orderId);
 await assert.rejects(()=>openSellerRecovery(f.db,{...f.ctx('original-buyer-cannot-open-recovery'),actorId:f.buyerId},{kind:'refund',id:refunded.refundId,reason:'The retained original customer must remain independent before the first owned case opens.'}),e=>e instanceof Error&&'status' in e&&e.status===403);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_cases').get()!.n,0);
 f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(f.buyerId,f.orderId);
 const recovery=await openSellerRecovery(f.db,f.ctx('actual-live-refund-owned-case'),{kind:'refund',id:refunded.refundId,reason:'Own the original actual post-payment maker exposure without inventing a new charge or conditioning the customer refund.'});assert.ok(recovery.id);
 const refundSummary=(await getSellerEarnings(f.db,f.sellerId)).managed!.summary;assert.equal(refundSummary.paidPaisa,69000);assert.equal(refundSummary.payablePaisa,0);assert.equal(refundSummary.refundOffsetPaisa,-refundSummary.balancePaisa);assert.equal(refundSummary.calculatedPaisa,69000);
 assert.equal((await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now())).amountPaisa,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,2);
 const [afterRefund]=await readOwnedLiveManagedInvoices(f.db,{orderId:f.orderId,customerId:f.buyerId});assert.equal(afterRefund.adjustments.length,1);assert.equal(afterRefund.adjustments[0].amountPaisa,refunded.cashPaisa);
 const review=await getSellerRecoveryReview(f.db,'reviewer',recovery.id);
 await approveSellerRecovery(f.db,f.ctx('actual-original-recovery-approved',String(review.case.revision)),{caseId:recovery.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-ACTUAL-ORIGINAL-RECOVERY-REVIEW',reason:'Confirm only the actual original already paid liability and existing source amounts.'});
 const confirmed=await getSellerRecoveryReview(f.db,'reviewer',recovery.id);
 const absorbed=await absorbSellerRecovery(f.db,f.ctx('actual-original-company-cost',String(confirmed.case.revision)),{caseId:recovery.id,amountPaisa:confirmed.position.remainingPaisa,resolveDisputedPaisa:0,reviewDigest:confirmed.reviewDigest,evidenceReference:'FICTIONAL-INDEPENDENT-ORIGINAL-COMPANY-COST',reason:'Record the independently reviewed fictional company cost against only the original confirmed liability.',collectionAttempts:'The actual fictional customer remedy is complete and the maker was contacted; the eligible reviewer records this original-case company cost decision.'});
 assert.ok(absorbed.id);assert.equal((await getSellerRecoveryReview(f.db,'reviewer',recovery.id)).position.remainingPaisa,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,2,'Absorption is no additional bank payment.');
 assert.equal((await readManagedLiveEligibility(f.db,f.sellerId,Date.now())).enabled,false,'A historical financial decision does not fabricate acceptance of new terms.');
 }finally{f.dispose();}
});

void test('actual held earnings remain visible and are not advertised as eligible before their original holding period ends',async()=>{
 const f=await deliveredLiveFinancialFixture(7);try{const managed=(await getSellerEarnings(f.db,f.sellerId)).managed!;assert.equal(managed.recordKind,'live');assert.equal(managed.summary.calculatedPaisa,69000);assert.equal(managed.summary.earnedPaisa,69000);assert.equal(managed.summary.heldPaisa,69000);assert.equal(managed.summary.blockedPaisa,69000);assert.equal(managed.summary.payablePaisa,0);assert.equal(managed.summary.reservedPaisa,0);assert.equal(managed.summary.paidPaisa,0);assert.equal((await getSellerReadiness(f.db,f.sellerId,Date.now())).payouts,false);}finally{f.dispose();}
});

