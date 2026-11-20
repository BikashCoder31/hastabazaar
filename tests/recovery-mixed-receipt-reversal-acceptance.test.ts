/** Acceptance reproductions only; fictional memory data. No production changes. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {recordReceiptReversal} from '../lib/payments/receipt-corrections';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from '../lib/payments/recovery-receipt-disposition';
import {mixedReceiptReview,completeOriginalPayerReturn} from './helpers/recovery-mixed-receipt-fixture';
for(const returnStage of ['reserved','returned'] as const)void test(`acceptance: recovery-only bank reversal remains reconcilable with an exact ${returnStage} original-payer excess return`,async()=>{
 const f=await mixedReceiptReview(returnStage),{receipt,returned,allocation,retainedReturnBefore,retainedPacketsBefore,reversed,current}=f;try{
 const dispositionContext=f.ctx('mixed-reversal-disposition',String(current.receiptRevision)),dispositionInput={reversalId:reversed.id,reviewDigest:current.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:allocation,amountPaisa:5000}],evidenceReference:'FICTIONAL-MIXED-EXACT-RECOVERY-REVERSAL',reason:'Attribute this actual reversal only to the original recovery allocation; do not reverse the completed excess return.',publicMessage:'The bank reversed NPR 50 of the original repayment. The separate excess return keeps its original bank status.'};
 const saved=await reconcileRecoveryReceiptReversal(f.db,dispositionContext,dispositionInput);
 assert.deepEqual(f.sqlite.prepare("SELECT * FROM manual_receipt_uses WHERE receipt_id=? AND kind='return'").get(receipt.id),retainedReturnBefore);assert.deepEqual(f.sqlite.prepare('SELECT * FROM outgoing_payment_packets WHERE obligation_id=? ORDER BY id').all(returned.obligationId),retainedPacketsBefore);
 const noticesBefore=f.sqlite.prepare("SELECT * FROM notification_messages WHERE related_id=? AND body_en=? ORDER BY id").all(f.recoveryId,dispositionInput.publicMessage);assert.ok(noticesBefore.length>=2);
 assert.deepEqual(await reconcileRecoveryReceiptReversal(f.db,dispositionContext,dispositionInput),saved);assert.deepEqual(f.sqlite.prepare("SELECT * FROM notification_messages WHERE related_id=? AND body_en=? ORDER BY id").all(f.recoveryId,dispositionInput.publicMessage),noticesBefore);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_receipt_reversal_reviews WHERE reversal_id=?').get(reversed.id)!.n,1);assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM seller_recovery_allocations WHERE id=?').get(allocation)!.amount_paisa,f.originalPaidPaisa);
 assert.equal(f.sqlite.prepare('SELECT amount_minor FROM company_receipt_reversals WHERE id=?').get(reversed.id)!.amount_minor,5000);
 assert.equal((await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId)).position.collectiblePaisa,5000);
 assert.equal(f.sqlite.prepare('SELECT state FROM refund_obligations WHERE id=?').get(returned.obligationId)!.state,returnStage==='returned'?'completed':'open');
 if(returnStage==='reserved'){const completed=await completeOriginalPayerReturn(f,receipt.id,'mixed-excess-after-reversal');assert.equal(completed.obligationId,returned.obligationId);assert.equal(completed.amount,1000);assert.equal(f.sqlite.prepare('SELECT state FROM refund_obligations WHERE id=?').get(returned.obligationId)!.state,'completed');assert.equal((await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId)).position.collectiblePaisa,5000);}
 }finally{f.dispose();}
});

for(const change of ['return_released','return_obligation_blocked'] as const)void test(`mixed-use reversal atomically rejects ${change} after source review`,async()=>{
 const f=await mixedReceiptReview();try{
 let moneyPrepared=false,injected=false,commits=0;const raced=Object.create(f.db) as D1Database;raced.prepare=(sql:string)=>{if(sql.includes('INSERT INTO seller_recovery_receipt_reversal_reviews('))moneyPrepared=true;return f.db.prepare(sql);};raced.batch=async statements=>{if(moneyPrepared&&!injected){injected=true;commits++;if(change==='return_released')f.sqlite.prepare("UPDATE manual_receipt_uses SET state='released',revision=revision+1 WHERE receipt_id=? AND kind='return'").run(f.receipt.id);else f.sqlite.prepare("UPDATE refund_obligations SET state='blocked',revision=revision+1 WHERE id=?").run(f.returned.obligationId);}return f.db.batch(statements);};
 await assert.rejects(reconcileRecoveryReceiptReversal(raced,f.ctx('raced-mixed-reversal',String(f.current.receiptRevision)),{reversalId:f.reversed.id,reviewDigest:f.current.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocation,amountPaisa:5000}],evidenceReference:'FICTIONAL-MIXED-ATOMIC-RETURN-PROOF',reason:'Require the exact retained original payer return proof to remain valid inside the write batch.',publicMessage:'The original repayment and return need current source review.'}));assert.equal(injected,true);assert.equal(commits,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_receipt_reversal_reviews WHERE reversal_id=?').get(f.reversed.id)!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_receipt_reversal_parts').get()!.n,0);
 }finally{f.dispose();}
});
void test('returned or reserved money is never reclassified as unused reversal capacity',async()=>{
 const f=await mixedReceiptReview();try{
 await assert.rejects(reconcileRecoveryReceiptReversal(f.db,f.ctx('cannot-use-reserved-as-unused',String(f.current.receiptRevision)),{reversalId:f.reversed.id,reviewDigest:f.current.reviewDigest,unallocatedPaisa:1000,allocations:[{allocationId:f.allocation,amountPaisa:4000}],evidenceReference:'FICTIONAL-NO-RETURN-REUSE',reason:'The retained original payer return cannot be labelled unused cash to bypass its real obligation.',publicMessage:'The retained original payer return remains separate from the recovery bank reversal.'}),/unallocated/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_receipt_reversal_reviews WHERE reversal_id=?').get(f.reversed.id)!.n,0);
 }finally{f.dispose();}
});

void test('two pending recovery-only reversals reconcile sequentially without releasing the original payer return or its remaining bank hold',async()=>{
 const f=await mixedReceiptReview();try{
 const second=await recordReceiptReversal(f.db,f.ctx('mixed-second-actual-reversal',String(f.current.receiptRevision)),{receiptId:f.receipt.id,amountMinor:5000,transactionIdentity:'FICTIONAL-MIXED-SECOND-BANK-REVERSAL',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-MIXED-SECOND-REVERSAL-PROOF',reason:'Retain a second actual independent partial bank reversal before either disposition is completed.'});
 for(const [index,reversalId] of [f.reversed.id,second.id].entries()){
 const review=await getRecoveryReceiptReversalReview(f.db,'reviewer',reversalId);
 await reconcileRecoveryReceiptReversal(f.db,f.ctx('mixed-sequential-disposition-'+index,String(review.receiptRevision)),{reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocation,amountPaisa:5000}],evidenceReference:'FICTIONAL-MIXED-SEQUENTIAL-REVIEW',reason:'Attribute only this exact actual bank reversal to the original recovery portion, retaining the other pending hold.',publicMessage:'This original recovery reversal is reviewed; any separate pending reversal still requires review.'});
 const current=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);assert.equal(current.position.collectiblePaisa,index===0?0:10000);assert.equal(f.sqlite.prepare("SELECT state FROM manual_receipt_uses WHERE receipt_id=? AND kind='return'").get(f.receipt.id)!.state,'reserved');
 }
 const completed=await completeOriginalPayerReturn(f,f.receipt.id,'mixed-multiple-completed-return');assert.equal(completed.amount,1000);
 }finally{f.dispose();}
});
