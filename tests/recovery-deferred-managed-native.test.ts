import assert from 'node:assert/strict';
import test from 'node:test';
import {deferredManagedFixture} from './helpers/deferred-managed-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {accrueManagedEntitlements} from '../lib/db/repositories/managed-settlements';
void test('native concurrent deferred accrual retains each original refund and posts its responsibility once',async()=>{
 const f=await deferredManagedFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 target=await nativeFinanceClone(f.sqlite);
 const results=await Promise.all([accrueManagedEntitlements(target.db,{orderId:f.orderId,actorId:'reviewer',requestId:'native-deferred-a',now:f.financialNow}),accrueManagedEntitlements(target.db,{orderId:f.orderId,actorId:'reviewer',requestId:'native-deferred-b',now:f.financialNow})]);
 assert.deepEqual(results.sort((a,b)=>a-b),[0,1]);
 assert.equal((await target.db.prepare('SELECT SUM(amount_paisa) n FROM managed_settlement_entries').first<{n:number}>())!.n,72800);
 assert.equal((await target.db.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='refund_adjustment'").first<{n:number}>())!.n,2);
 assert.equal((await target.db.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE reason_code='refund_responsibility'").first<{n:number}>())!.n,1);
 assert.equal((await target.db.prepare("SELECT amount_paisa n FROM managed_settlement_entries WHERE refund_id='deferred-platform' AND reason_code='refund_responsibility'").first<{n:number}>())!.n,27300);
 assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM operation_transaction_guards').first<{n:number}>())!.n,0);
 }finally{await target?.dispose();f.dispose();}
});
