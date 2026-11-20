import test from 'node:test';
import assert from 'node:assert/strict';
import {completedReceiptReturnFixture} from './helpers/completed-receipt-return-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from '../lib/payments/recovery-receipt-disposition';
import {actualManualReceiptUseSql} from '../lib/payments/receipt-use-accounting';
import {recordReceiptReversal} from '../lib/payments/receipt-corrections';
void test('native completed payer loss shares exact cumulative cap, rolls back changed authority/source and replays without debt',async()=>{
 const f=await completedReceiptReturnFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));native=await nativeFinanceClone(f.sqlite);const db=native.db;
 await assert.rejects(db.prepare(`INSERT INTO receipt_return_bank_losses(id,review_id,reversal_id,receipt_id,receipt_use_id,use_revision,packet_id,obligation_id,amount_paisa,actor_id,request_id,created_at) VALUES('forged-loss','missing-review',?,?,?,?,?,?,4000,'reviewer','forged-loss',?)`).bind(f.reversalId,f.receiptId,f.receiptUseId,1,f.returnPacketId,f.returnObligationId,Date.now()).run(),/completed_original_payer_return_loss_required/);
 const decision=(review:Awaited<ReturnType<typeof getRecoveryReceiptReversalReview>>,amountPaisa:number)=>({reversalId:review.reversal.id,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],completedReturns:[{receiptUseId:f.receiptUseId,packetId:f.returnPacketId,amountPaisa}],companyLossApproved:true,evidenceReference:'FICTIONAL-NATIVE-COMPLETED-RETURN-LOSS',reason:'Explicitly cover only this actual reversal after the independently proven original payer transfer completed.',publicMessage:'The completed original return remains paid and this actual bank reversal is a company cost.'});
 for(const mode of ['authority','source'] as const){
 const review=await getRecoveryReceiptReversalReview(db,'reviewer',f.reversalId);let raced=false;
 const boundary={prepare:db.prepare.bind(db),async batch(statements:D1PreparedStatement[]){if(!raced&&statements.length>10){raced=true;if(mode==='authority')await db.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();else await db.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=?').bind(f.receiptId).run();}return db.batch(statements);}} as D1Database;
 let rejected:unknown;try{await reconcileRecoveryReceiptReversal(boundary,f.ctx('native-loss-'+mode+'-changed',String(review.receiptRevision)),decision(review,4000));}catch(error){rejected=error;}assert.ok(rejected);assert.equal(raced,true,rejected instanceof Error?rejected.message:JSON.stringify(rejected));
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM receipt_return_bank_losses').first<{n:number}>())!.n,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_receipt_reversal_reviews').first<{n:number}>())!.n,0);
 if(mode==='authority')await db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1)").run();
 }
 async function race(reversalId:string,amount:number,prefix:string){const review=await getRecoveryReceiptReversalReview(db,'reviewer',reversalId),input=decision(review,amount);const results=await Promise.allSettled(['a','b'].map(suffix=>reconcileRecoveryReceiptReversal(db,f.ctx(prefix+suffix,String(review.receiptRevision)),input)));assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);const index=results.findIndex(result=>result.status==='fulfilled'),winner=results[index];if(winner.status!=='fulfilled')throw new Error('Missing exact native winner.');assert.deepEqual(await reconcileRecoveryReceiptReversal(db,f.ctx(prefix+(index===0?'a':'b'),String(review.receiptRevision)),input),winner.value);}
 await race(f.reversalId,4000,'native-paid-return-first-');
 assert.equal((await db.prepare('SELECT '+actualManualReceiptUseSql('used')+' n FROM manual_receipt_uses used WHERE id=?').bind(f.receiptUseId).first<{n:number}>())!.n,6000);
 const current=(await db.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').bind(f.receiptId).first<{revision:number}>())!.revision;
 const second=await recordReceiptReversal(db,f.ctx('native-paid-return-last-reversal',String(current)),{receiptId:f.receiptId,amountMinor:6000,transactionIdentity:'FICTIONAL-NATIVE-LAST-PAID-RETURN-REVERSAL',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-NATIVE-LAST-RETURN-REVERSAL',reason:'Retain the actual reversal of the remaining original incoming credit after its paid return.'});
 await race(second.id,6000,'native-paid-return-final-');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM receipt_return_bank_losses').first<{n:number}>())!.n,2);assert.equal((await db.prepare('SELECT used_paisa n FROM receipt_return_bank_loss_pools WHERE receipt_use_id=?').bind(f.receiptUseId).first<{n:number}>())!.n,10000);
 assert.equal((await db.prepare('SELECT '+actualManualReceiptUseSql('used')+' n FROM manual_receipt_uses used WHERE id=?').bind(f.receiptUseId).first<{n:number}>())!.n,0);
 assert.equal((await db.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').bind(f.returnPacketId).first<{state:string}>())!.state,'paid');assert.equal((await db.prepare('SELECT state FROM manual_receipt_uses WHERE id=?').bind(f.receiptUseId).first<{state:string}>())!.state,'returned');
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM notification_messages WHERE related_type='receipt_return_bank_loss' AND recipient_user_id='customer'").first<{n:number}>())!.n,4);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM manual_payment_exceptions WHERE receipt_id=? AND kind='receipt_reversal' AND state<>'resolved'").bind(f.receiptId).first<{n:number}>())!.n,0);
 }finally{if(native)await native.dispose();f.dispose();}
});

