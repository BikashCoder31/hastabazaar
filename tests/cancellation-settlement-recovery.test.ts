import assert from 'node:assert/strict';
import test from 'node:test';
import {state,post} from './helpers/cancellation-fulfillment-fixture';
import {mixedOrder,commitWithoutAcknowledgement} from './helpers/cancellation-settlement-fixture';

for(const failure of ['lost-cancellation-ack','invoice-hook'] as const)void test(`exact approval POST resumes mixed-order settlement after ${failure} without repeating economics`,async()=>{
 const f=await mixedOrder();try{
  const wrapped=Object.create(f.db) as D1Database;let interrupted=false;
  if(failure==='lost-cancellation-ack')wrapped.batch=(async(statements:D1PreparedStatement[])=>{const result=await f.db.batch(statements);if(!interrupted&&f.sqlite.prepare('SELECT id FROM order_cancellation_events WHERE id=?').get('review:'+f.sourceId)){interrupted=true;throw Error('fictional_lost_cancellation_commit_ack');}return result;}) as D1Database['batch'];
  else wrapped.prepare=((sql:string)=>{if(sql.includes('SELECT snapshot_json AS json FROM order_documents')&&!interrupted){interrupted=true;throw Error('fictional_invoice_dependency_failure');}return f.db.prepare(sql);}) as D1Database['prepare'];
  state.db=wrapped;
  const first=await f.send();assert.equal(interrupted,true);
  assert.equal(first.status,503,'committed cancellation and unfinished settlement must remain distinct');
  const firstBody=await first.json() as Record<string,unknown>;assert.equal(firstBody.recorded,true);assert.equal(firstBody.requestId,f.requestId);assert.match(String(firstBody.error),/cancellation.*recorded.*settlement/i);
  state.db=f.db;
  assert.equal(f.sqlite.prepare('SELECT status FROM orders WHERE id=?').get(f.orderId)!.status,'delivered');
  assert.equal(f.sqlite.prepare('SELECT status FROM order_cancellation_reviews WHERE id=?').get(f.sourceId)!.status,'approved');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,failure==='lost-cancellation-ack'?0:1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,0);
  const economicSnapshot=()=>({events:f.sqlite.prepare('SELECT * FROM order_cancellation_events ORDER BY id').all(),refundSources:f.sqlite.prepare('SELECT * FROM cancellation_refund_sources ORDER BY id').all(),refunds:f.sqlite.prepare('SELECT * FROM refunds ORDER BY id').all(),stock:f.sqlite.prepare('SELECT id,inventory_quantity FROM products ORDER BY id').all(),holds:f.sqlite.prepare('SELECT * FROM order_fulfillment_holds ORDER BY id').all()});
  const economics=economicSnapshot();assert.equal(economics.events.length,1);assert.equal(economics.refundSources.length,1);assert.equal(economics.refundSources[0].cash_paisa,20000);assert.equal(economics.refunds.length,0);assert.equal(economics.stock.find(row=>row.id==='pending-product')!.inventory_quantity,10);
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const historical=await f.read();assert.equal(historical.status,200);const proof=await historical.json();assert.deepEqual(proof,{actorId:'reviewer',sourceId:f.sourceId,action:'approve',requestId:f.requestId,recorded:true,settlement:'unconfirmed'});assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
  const retry=await f.send();assert.equal(retry.status,200,await retry.clone().text());assert.deepEqual(await retry.json(),{...proof as Record<string,unknown>,settlement:'confirmed'});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,1,'same-wire POST must resume native managed earning');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,1,'same-wire POST must resume native invoice issuance');
  assert.deepEqual(economicSnapshot(),economics);
  const earned=f.sqlite.prepare('SELECT * FROM managed_settlement_entries ORDER BY id').all(),invoices=f.sqlite.prepare('SELECT * FROM managed_invoice_groups ORDER BY id').all();
  assert.equal(earned[0].request_id,'review:'+f.sourceId+':managed-accrue:earned:'+f.entitlementId);assert.equal(invoices[0].request_id,'review:'+f.sourceId+':managed-invoice:1');
  assert.equal((await f.send()).status,200);assert.deepEqual(economicSnapshot(),economics);assert.deepEqual(f.sqlite.prepare('SELECT * FROM managed_settlement_entries ORDER BY id').all(),earned);assert.deepEqual(f.sqlite.prepare('SELECT * FROM managed_invoice_groups ORDER BY id').all(),invoices);
  assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{state.db=null;f.dispose();}
});

for(const hook of ['accrual','invoice'] as const)for(const race of ['role','subject'] as const)void test(`approval ${hook} continuation rolls back on ${race} loss at its own commit`,async()=>{
 const f=await mixedOrder();try{
  await commitWithoutAcknowledgement(f);
  const revoke=()=>{if(race==='role')f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer'").run();else f.sqlite.prepare("UPDATE users SET auth_subject='different-authenticated-subject' WHERE id='reviewer'").run();};
  if(hook==='accrual')f.setBeforeBatch(revoke);
  else{const wrapped=Object.create(f.db) as D1Database;wrapped.prepare=((sql:string)=>{if(sql.includes('SELECT snapshot_json AS json FROM order_documents'))f.setBeforeBatch(revoke);return f.db.prepare(sql);}) as D1Database['prepare'];state.db=wrapped;}
  const retry=await f.send();assert.equal(retry.status,403,await retry.clone().text());
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,hook==='accrual'?0:1,'authority loss must roll back only its uncommitted continuation');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_cancellation_events').get()!.n,1);
 }finally{state.db=null;f.dispose();}
});

void test('unfinished approval rejects changed wire and a new nonce instead of adopting its original decision',async()=>{
 const f=await mixedOrder();try{
  await commitWithoutAcknowledgement(f);
  for(const body of [{...f.body,note:'Replace the original note with a different decision.'},{...f.body,clientAttemptId:crypto.randomUUID()}]){
   const response=await f.api.POST(post(f.path,body,'reviewer'));assert.notEqual(response.status,200);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,0);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,0);
  }
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='order.native-action'").get()!.n,1);
 }finally{state.db=null;f.dispose();}
});

void test('failed continuation reports the known original approval without claiming settlement succeeded',async()=>{
 const f=await mixedOrder();try{
  await commitWithoutAcknowledgement(f);
  const wrapped=Object.create(f.db) as D1Database;
  wrapped.batch=(async()=>{throw Error('fictional_settlement_dependency_unavailable');}) as D1Database['batch'];state.db=wrapped;
  const retry=await f.send();assert.equal(retry.status,503);
  const body=await retry.json() as Record<string,unknown>;
  assert.equal(body.recorded,true);assert.equal(body.action,'approve');assert.equal(body.requestId,f.requestId);assert.equal(body.sourceId,f.sourceId);assert.equal(body.actorId,'reviewer');assert.match(String(body.error),/cancellation.*recorded.*settlement/i);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,0);
 }finally{state.db=null;f.dispose();}
});

void test('lost-ack original-proof read failure fences concurrent staff authority loss before exposing history',async()=>{
 const f=await mixedOrder();try{
  const wrapped=Object.create(f.db) as D1Database;let readFailed=false;
  wrapped.batch=(async(statements:D1PreparedStatement[])=>{await f.db.batch(statements);throw Error('fictional_lost_cancellation_commit_ack');}) as D1Database['batch'];
  wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('SELECT command_result_json AS result FROM audit_logs'))statement.first=(async()=>{readFailed=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer'").run();throw Error('fictional_proof_read_failure_after_revocation');}) as D1PreparedStatement['first'];return statement;}) as D1Database['prepare'];
  state.db=wrapped;
  const response=await f.send();assert.equal(readFailed,true);assert.equal(response.status,403);assert.doesNotMatch(await response.text(),/recorded|sourceId|requestId|settlement/i);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_cancellation_events').get()!.n,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,0);
 }finally{state.db=null;f.dispose();}
});

void test('opaque original approval reference resumes only committed settlement after reload',async()=>{
 const f=await mixedOrder();try{
  await commitWithoutAcknowledgement(f);
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const proof=await (await f.read()).json() as Record<string,unknown>;
  assert.equal(proof.recorded,true);assert.equal(proof.settlement,'unconfirmed');
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
  const snapshot=()=>JSON.stringify({events:f.sqlite.prepare('SELECT * FROM order_cancellation_events').all(),refunds:f.sqlite.prepare('SELECT * FROM cancellation_refund_sources').all(),stock:f.sqlite.prepare('SELECT id,inventory_quantity FROM products ORDER BY id').all(),forms:f.sqlite.prepare("SELECT * FROM audit_logs WHERE action IN ('form.core_answers','cancellation.form_submitted','order.native-action') ORDER BY id").all()});
  const original=snapshot();
  const body={reviewId:f.sourceId,action:'approve',clientAttemptId:f.requestId,continuation:true};
  const response=await f.api.POST(post(f.path,body,'reviewer'));
  assert.equal(response.status,200,await response.clone().text());
  assert.deepEqual(await response.json(),{...proof,settlement:'confirmed'});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,1);
  assert.equal(snapshot(),original);
  assert.equal((await f.api.POST(post(f.path,body,'reviewer'))).status,200);
  assert.equal(snapshot(),original);
 }finally{state.db=null;f.dispose();}
});

for(const hook of ['accrual','invoice'] as const)for(const race of ['role','subject','party'] as const)void test(`opaque continuation fences ${race} at ${hook} commit`,async()=>{
 const f=await mixedOrder();try{
  await commitWithoutAcknowledgement(f);
  const revoke=()=>{if(race==='role')f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer'").run();else if(race==='subject')f.sqlite.prepare("UPDATE users SET auth_subject='changed-subject' WHERE id='reviewer'").run();else f.sqlite.prepare("UPDATE orders SET customer_id='reviewer' WHERE id=?").run(f.orderId);};
  if(hook==='accrual')f.setBeforeBatch(revoke);else{const wrapped=Object.create(f.db) as D1Database;wrapped.prepare=((sql:string)=>{if(sql.includes('SELECT snapshot_json AS json FROM order_documents'))f.setBeforeBatch(revoke);return f.db.prepare(sql);}) as D1Database['prepare'];state.db=wrapped;}
  const response=await f.api.POST(post(f.path,{reviewId:f.sourceId,action:'approve',clientAttemptId:f.requestId,continuation:true},'reviewer'));
  assert.equal(response.status,race==='party'?503:403);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,hook==='accrual'?0:1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_cancellation_events').get()!.n,1);
 }finally{state.db=null;f.dispose();}
});
void test('opaque continuation cannot adopt absent proof, absent form history or replacement terms',async()=>{
 const f=await mixedOrder();try{
  const body={reviewId:f.sourceId,action:'approve',clientAttemptId:f.requestId,continuation:true};
  assert.equal((await f.api.POST(post(f.path,body,'reviewer'))).status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_cancellation_events').get()!.n,0);
  await commitWithoutAcknowledgement(f);
  assert.equal((await f.api.POST(post(f.path,{...body,clientAttemptId:crypto.randomUUID()},'reviewer'))).status,409);
  assert.equal((await f.api.POST(post(f.path,{...body,note:'A replacement approval is not a continuation.'},'reviewer'))).status,400);
  const wrapped=Object.create(f.db) as D1Database;wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes("action='cancellation.form_submitted'")&&sql.includes('next_json AS json'))statement.first=(async()=>null) as D1PreparedStatement['first'];return statement;}) as D1Database['prepare'];state.db=wrapped;
  const response=await f.api.POST(post(f.path,body,'reviewer'));assert.equal(response.status,503);const known=await response.json() as Record<string,unknown>;assert.equal(known.recorded,true);assert.equal(known.settlement,'unconfirmed');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,0);
 }finally{state.db=null;f.dispose();}
});

for(const race of ['role','subject','party'] as const)void test(`already-completed opaque continuation fences ${race} after final native reads`,async()=>{
 const f=await mixedOrder();try{
  assert.equal((await f.send()).status,200);
  const original=JSON.stringify({earned:f.sqlite.prepare('SELECT * FROM managed_settlement_entries ORDER BY id').all(),invoices:f.sqlite.prepare('SELECT * FROM managed_invoice_groups ORDER BY id').all()});
  const wrapped=Object.create(f.db) as D1Database;let reads=0;
  wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('FROM orders WHERE order_number=?')){const first=statement.first.bind(statement);statement.first=(async()=>{const row=await first();if(++reads===2){if(race==='role')f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer'").run();else if(race==='subject')f.sqlite.prepare("UPDATE users SET auth_subject='changed-subject' WHERE id='reviewer'").run();else f.sqlite.prepare("UPDATE orders SET customer_id='reviewer' WHERE id=?").run(f.orderId);}return row;}) as D1PreparedStatement['first'];}return statement;}) as D1Database['prepare'];state.db=wrapped;
  const response=await f.api.POST(post(f.path,{reviewId:f.sourceId,action:'approve',clientAttemptId:f.requestId,continuation:true},'reviewer'));
  assert.equal(reads,2);assert.equal(response.status,race==='party'?503:403);
  if(race!=='party')assert.doesNotMatch(await response.text(),/recorded|requestId|sourceId/);
  assert.equal(JSON.stringify({earned:f.sqlite.prepare('SELECT * FROM managed_settlement_entries ORDER BY id').all(),invoices:f.sqlite.prepare('SELECT * FROM managed_invoice_groups ORDER BY id').all()}),original);
 }finally{state.db=null;f.dispose();}
});
