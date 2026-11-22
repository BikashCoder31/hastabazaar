import assert from 'node:assert/strict';
import test from 'node:test';
import {refundPacketFixture} from './helpers/refund-funding-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {openSellerRecovery} from '../lib/payments/seller-recovery';
import {getSellerRecoveryReview,approveSellerRecovery,allocateSellerRecoveryReceipt,applySellerRecoveryEarnings} from '../lib/payments/seller-recovery';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {sellerRecoveryFixture,agreedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
void test('native concurrent recovery opening preserves one source case and gives both callers its saved identity',async()=>{
 const source=await refundPacketFixture({responsibility:'seller'});let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{target=await nativeFinanceClone(source.sqlite);const input={kind:'refund' as const,id:source.refundId,reason:'Reconcile the original confirmed responsibility without creating another economic charge.'};
 const results=await Promise.allSettled([openSellerRecovery(target.db,source.ctx('recovery-open-race-one'),input),openSellerRecovery(target.db,source.ctx('recovery-open-race-two'),input)]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,2);
 assert.equal((results[0] as PromiseFulfilledResult<{id:string}>).value.id,(results[1] as PromiseFulfilledResult<{id:string}>).value.id);
 assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM seller_recovery_cases').first<{n:number}>())!.n,1);
 assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM seller_recovery_events').first<{n:number}>())!.n,1);
 assert.equal((await target.db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='seller.recovery.open' AND command_key IS NOT NULL").first<{n:number}>())!.n,2);
 }finally{await target?.dispose();source.dispose();}
});

void test('native cash repayment and approved earnings compete for the same cap without double collection',async()=>{
 const source=await agreedSellerRecoveryFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 source.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('native-later-earned','registered','sale',100000,1,'Fictional later eligible income',1)").run();
 const receipt=await recordBankReceipt(source.db,source.ctx('native-mixed-credit'),{accountVersionId:source.accountVersionId,transactionIdentity:'FICTIONAL-NATIVE-MIXED-CREDIT',bankAt:Date.now()-1,amountMinor:source.originalPaidPaisa,currency:'NPR',payerReference:'Fictional original seller',payerUserId:'registered-owner',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-ACTUAL-RECEIVED-MIXED-MONEY',reason:'Independently verify actual same-seller company bank credit before the native race.'});
 target=await nativeFinanceClone(source.sqlite);
 const results=await Promise.allSettled([
  allocateSellerRecoveryReceipt(target.db,source.ctx('mixed-cash','3'),{caseId:source.recoveryId,receiptId:receipt.id,receiptRevision:0,amountPaisa:source.originalPaidPaisa,method:'cash',evidenceReference:'FICTIONAL-MIXED-RECEIPT-ALLOCATION',reason:'Allocate only actual received money within the shared original recovery cap.'}),
  applySellerRecoveryEarnings(target.db,source.ctx('mixed-earnings','3'),{caseId:source.recoveryId})
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
 const review=await getSellerRecoveryReview(target.db,'reviewer',source.recoveryId);
 assert.equal(review.position.recoveredPaisa,source.originalPaidPaisa);assert.equal(review.position.remainingPaisa,0);assert.equal(review.position.overRecoveredPaisa,0);
 const allocation=await target.db.prepare('SELECT method,amount_paisa AS amount FROM seller_recovery_allocations').all<{method:string;amount:number}>();assert.equal(allocation.results.length,1);
 const expected=allocation.results[0].method==='cash'?100000:100000-source.originalPaidPaisa;
 const available=await target.db.prepare("SELECT SUM(e.amount_paisa) AS amount FROM seller_ledger_entries e WHERE e.seller_id='registered' AND NOT EXISTS(SELECT 1 FROM payout_entries p WHERE p.ledger_entry_id=e.id AND p.released_at IS NULL)").first<{amount:number}>();
 assert.equal(available!.amount,expected);
 }finally{await target?.dispose();source.dispose();}
});

void test('native simultaneous repayments share one remaining case cap and a losing transaction cannot leave a phantom ledger credit',async()=>{
 const source=await sellerRecoveryFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 const opened=await openSellerRecovery(source.db,source.ctx('cap-race-open'),{kind:'refund',id:source.refundId,reason:'Review the original completed source before the isolated repayment race.'});
 const review=await getSellerRecoveryReview(source.db,'reviewer',opened.id);
 await approveSellerRecovery(source.db,source.ctx('cap-race-approve','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-ORIGINAL-RECONCILIATION',reason:'Approve only the actual net liability before competing actual repayments.'});
 const receipts=[];
 for(const suffix of ['one','two'])receipts.push(await recordBankReceipt(source.db,source.ctx('cap-race-receipt-'+suffix),{accountVersionId:source.accountVersionId,transactionIdentity:'FICTIONAL-RACE-RECEIPT-'+suffix,bankAt:Date.now()-1,amountMinor:source.originalPaidPaisa,currency:'NPR',payerReference:'Fictional original seller',payerUserId:'registered-owner',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-ACTUAL-RECEIVED-MONEY-'+suffix,reason:'Verify this independent actual incoming company bank credit before allocation.'}));
 target=await nativeFinanceClone(source.sqlite);
 const inputs=receipts.map(receipt=>({caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:source.originalPaidPaisa,method:'cash' as const,evidenceReference:'FICTIONAL-SOURCE-REPAYMENT-MATCH',reason:'Apply actual same-seller money within the one original approved recovery cap.'}));
 const contexts=inputs.map((_,i)=>source.ctx('native-recovery-cap-'+i,'1'));
 const results=await Promise.allSettled(inputs.map((input,i)=>allocateSellerRecoveryReceipt(target!.db,contexts[i],input)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
 assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,1);
 assert.equal((await target.db.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE type='recovery_settlement'").first<{n:number}>())!.n,source.originalPaidPaisa);
 const current=await getSellerRecoveryReview(target.db,'reviewer',opened.id);assert.equal(current.position.remainingPaisa,0);assert.equal(current.position.overRecoveredPaisa,0);
 const winner=results.findIndex(r=>r.status==='fulfilled');
 assert.deepEqual(await allocateSellerRecoveryReceipt(target.db,contexts[winner],inputs[winner]),(results[winner] as PromiseFulfilledResult<unknown>).value);
 const loser=1-winner;
 assert.equal((await target.db.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').bind(receipts[loser].id).first<{revision:number}>())!.revision,0);
 await assert.rejects(target.db.prepare("INSERT INTO manual_receipt_uses(id,receipt_id,kind,target_id,amount_minor,state,created_by,created_at) VALUES('spent-again',?,'return','another-target',1,'reserved','reviewer',1)").bind(receipts[winner].id).run());
 }finally{await target?.dispose();source.dispose();}
});
