import assert from 'node:assert/strict';
import test from 'node:test';
import {mixedReceiptReview} from './helpers/recovery-mixed-receipt-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from '../lib/payments/recovery-receipt-disposition';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';
for(const state of ['reserved','returned'] as const)void test(`native recovery-only reversal preserves the exact ${state} original-payer excess return`,async()=>{
 const f=await mixedReceiptReview(state);let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 target=await nativeFinanceClone(f.sqlite);const base=target.db,metadata=new WeakMap<object,{sql:string;values:unknown[]}>(),db=Object.create(base) as D1Database;
 db.prepare=(sql:string)=>{const prepared=base.prepare(sql),bind=prepared.bind.bind(prepared);metadata.set(prepared,{sql,values:[]});prepared.bind=(...values:unknown[])=>{const bound=bind(...values);metadata.set(bound,{sql,values});return bound;};return prepared;};
 db.batch=async statements=>{try{return await base.batch(statements);}catch(error){if(/Expression tree/.test(String(error))){
 console.error('MIXED REVERSAL TRACKED',statements.filter(statement=>metadata.has(statement)).length,'OF',statements.length);
 let found=false;for(const statement of statements){const recorded=metadata.get(statement);if(!recorded)continue;try{await base.prepare('EXPLAIN '+recorded.sql).bind(...recorded.values).all();}catch(explainError){console.error('MIXED REVERSAL NATIVE FAILED SQL:',recorded.sql);console.error('MIXED REVERSAL EXPLAIN ERROR:',String(explainError));found=true;break;}}
 if(!found){let low=0,high=statements.length;while(low<high){const middle=Math.floor((low+high)/2);try{await base.batch([...statements.slice(0,middle+1),base.prepare('INSERT INTO operation_transaction_guards(id,valid) VALUES(?,0)').bind(crypto.randomUUID())]);throw new Error('Diagnostic rollback guard did not abort.');}catch(prefixError){if(/Expression tree/.test(String(prefixError)))high=middle;else if(/CHECK constraint/.test(String(prefixError)))low=middle+1;else throw prefixError;}}
 console.error('MIXED REVERSAL PREFIX FAILED INDEX',low,'SQL:',metadata.get(statements[low])?.sql??(statements[low] as unknown as {statement:string})?.statement);}
 }throw error;}};
 const review=await getRecoveryReceiptReversalReview(db,'reviewer',f.reversed.id);
 const before=await db.prepare("SELECT id,kind,target_id,amount_minor,state,revision FROM manual_receipt_uses WHERE receipt_id=? AND kind='return'").bind(f.receipt.id).first();
 const ctx=f.ctx('native-mixed-reversal',String(review.receiptRevision)),input={reversalId:f.reversed.id,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocation,amountPaisa:5000}],evidenceReference:'FICTIONAL-NATIVE-MIXED-RETURN-PROOF',reason:'Attribute this actual bank reversal only to its original recovery allocation and preserve the separate payer return.',publicMessage:'The original recovery bank reversal is reviewed without changing the separately reserved or paid excess return.'};
 const saved=await reconcileRecoveryReceiptReversal(db,ctx,input);assert.deepEqual(await reconcileRecoveryReceiptReversal(db,ctx,input),saved);
 assert.deepEqual(await db.prepare("SELECT id,kind,target_id,amount_minor,state,revision FROM manual_receipt_uses WHERE receipt_id=? AND kind='return'").bind(f.receipt.id).first(),before);
 assert.equal((await getSellerRecoveryReview(db,'reviewer',f.recoveryId)).position.collectiblePaisa,5000);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_receipt_reversal_reviews WHERE reversal_id=?').bind(f.reversed.id).first<{n:number}>())!.n,1);
 }finally{await target?.dispose();f.dispose();}
});
