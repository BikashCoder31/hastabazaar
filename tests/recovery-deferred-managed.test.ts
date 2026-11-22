import assert from 'node:assert/strict';
import test from 'node:test';
import {deferredManagedFixture} from './helpers/deferred-managed-fixture';
import {accrueManagedEntitlements} from '../lib/db/repositories/managed-settlements';
void test('deferred managed refunds retain each original responsibility instead of charging all earlier refunds to the latest seller refund',async()=>{
 const f=await deferredManagedFixture();try{
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n,0);
 const input={orderId:f.orderId,actorId:'reviewer',requestId:'accrue-original-deferred-refunds',now:f.financialNow};
 assert.equal(await accrueManagedEntitlements(f.db,input),1);
 const rows=f.sqlite.prepare("SELECT refund_id,amount_paisa FROM managed_settlement_entries WHERE type='refund_adjustment' ORDER BY refund_id").all();
 assert.equal(rows.length,2);
 assert.equal(rows.find(row=>row.refund_id==='deferred-platform')!.amount_paisa,-27300);
 assert.equal(rows.find(row=>row.refund_id==='deferred-seller')!.amount_paisa,-18200);
 assert.equal(f.sqlite.prepare("SELECT amount_paisa FROM managed_settlement_entries WHERE refund_id='deferred-platform' AND reason_code='refund_responsibility'").get()!.amount_paisa,27300);
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM managed_settlement_entries').get()!.n,72800);
 assert.equal(await accrueManagedEntitlements(f.db,input),0);
 assert.equal(await accrueManagedEntitlements(f.db,{...input,requestId:'new-retry-same-original-facts'}),0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n,4);
 }finally{f.dispose();}
});

for(const scenario of [
 {parts:[{party:'seller' as const,base:5},{party:'platform' as const,base:1}],balance:90995,adjustments:1,compensation:0},
 {parts:[{party:'platform' as const,base:1},{party:'seller' as const,base:5}],balance:90996,adjustments:2,compensation:1},
])void test('deferred cumulative rounding follows original completion order and retains zero-money refund facts '+scenario.balance,async()=>{
 const f=await deferredManagedFixture(scenario.parts);try{
 assert.equal(await accrueManagedEntitlements(f.db,{orderId:f.orderId,actorId:'reviewer',requestId:'deferred-rounding',now:f.financialNow}),1);
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM managed_settlement_entries').get()!.n,scenario.balance);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='refund_adjustment'").get()!.n,scenario.adjustments);
 assert.equal(f.sqlite.prepare("SELECT COALESCE(SUM(amount_paisa),0) n FROM managed_settlement_entries WHERE reason_code='refund_responsibility'").get()!.n,scenario.compensation);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries WHERE amount_paisa=0').get()!.n,0);
 }finally{f.dispose();}
});

void test('a paid refund arriving after deferred review aborts the whole earning transaction before a refreshed retry',async()=>{
 const f=await deferredManagedFixture();try{
 let injected=false;const racing={prepare:f.db.prepare.bind(f.db),batch:async(statements:D1PreparedStatement[])=>{
  if(!injected){injected=true;
   f.sqlite.prepare("INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at) VALUES('deferred-late-return',?,'Fictional refund','Concurrent historical paid evidence','resolved',?)").run(f.itemId,f.now+30);
   f.sqlite.prepare("INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,item_amount_paisa,commission_base_refunded_paisa,liability,reason,requested_at,processed_at,operation_request_id) VALUES('deferred-late',?,'deferred-late-return','paid',1,1,1,'seller','Fictional separately confirmed refund',?,?,'deferred-late-paid')").run(f.orderId,f.now+30,f.now+30);
   f.sqlite.prepare("INSERT INTO refund_cost_allocations(refund_id,component,party,seller_id,amount_paisa,policy_version,created_by,created_at) VALUES('deferred-late','merchandise','seller',?,1,'approved_original_refund_costs_v1','reviewer',?)").run(f.sellerId,f.now+30);
  }
  return f.db.batch(statements);
 }} as D1Database;
 await assert.rejects(accrueManagedEntitlements(racing,{orderId:f.orderId,actorId:'reviewer',requestId:'stale-deferred-sources',now:f.financialNow}));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT status FROM managed_entitlements WHERE id=?').get(f.entitlementId)!.status,'calculated');
 assert.equal(await accrueManagedEntitlements(f.db,{orderId:f.orderId,actorId:'reviewer',requestId:'refreshed-deferred-sources',now:f.financialNow}),1);
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM managed_settlement_entries').get()!.n,72799);
 }finally{f.dispose();}
});
