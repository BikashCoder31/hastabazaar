import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,target,state,post,origin} from './helpers/cancellation-fulfillment-fixture';
for(const kind of ['cancellation','fulfillment'] as const)void test(`${kind} actual native confirmation binds original request and read-only historical outcome`,async()=>{
 const f=await fixture();try{
  const {requestId,sourceId,body,actorId,path,api,context}=await target(f,kind);
  const saved=await api.POST(post(path,body,actorId),context);assert.equal(saved.status,200,await saved.clone().text());const result=await saved.json() as Record<string,unknown>;
  assert.equal(result.recorded,true);assert.equal(result.actorId,actorId);assert.equal(result.sourceId,sourceId);assert.equal(result.requestId,requestId);assert.equal(result.action,body.action);
  const get=(api as Record<string,unknown>).GET;assert.equal(typeof get,'function');if(typeof get!=='function')return;
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const query=new Request(origin+path+`?sourceId=${sourceId}&action=${String(body.action)}&requestId=${requestId}`,{headers:{'X-Hastabazaar-Actor':actorId}});
  const recovered=await get(query,context) as Response;assert.equal(recovered.status,200,await recovered.clone().text());assert.deepEqual(await recovered.json(),result);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
  const repeated=await api.POST(post(path,body,actorId),context);assert.equal(repeated.status,200);assert.deepEqual(await repeated.json(),result);
  const changed=await api.POST(post(path,{...body,note:'A changed reason cannot replace the original immutable action.'},actorId),context);assert.equal(changed.status,409);
 }finally{state.db=null;f.dispose();}
});
void test('seller fulfillment rejects stale actor intent before mutation',async()=>{
 const f=await fixture();try{state.actor='registered-owner';const api=await import('../app/api/seller/orders/[id]/fulfillment/route'),requestId=crypto.randomUUID();
 const response=await api.POST(post(`/api/seller/orders/${f.orderId}/fulfillment`,{requestId,action:'start_packing',itemIds:f.rows.map(r=>String(r.id)),note:'Original preparation command.'},'other-displayed-seller'),{params:Promise.resolve({id:f.orderId})});
 assert.equal(response.status,403,await response.text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_item_status_events WHERE request_id=?').get(requestId)!.n,0);
 }finally{state.db=null;f.dispose();}
});

for(const kind of ['cancellation','fulfillment'] as const)void test(`${kind} native commit rejects changed authenticated subject and current role`,async(t)=>{
 for(const race of ['subject','role'] as const)await t.test(race,async()=>{const f=await fixture();try{
  const x=await target(f,kind);f.setBeforeBatch(()=>{if(race==='subject')f.sqlite.prepare("UPDATE users SET auth_subject='rebound-at-commit' WHERE id=?").run(x.actorId);else f.sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(x.actorId);});
  const result=await x.api.POST(post(x.path,x.body,x.actorId),x.context);assert.equal(result.status,403,await result.text());
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=?').get(x.requestId+':native-proof')!.n,0);
  assert.equal(f.sqlite.prepare(kind==='cancellation'?'SELECT status state FROM order_cancellation_reviews WHERE id=?':'SELECT fulfillment_status state FROM order_items WHERE order_id=?').get(x.sourceId)!.state,kind==='cancellation'?'pending':'confirmed');
 }finally{state.db=null;f.dispose();}});
});
for(const kind of ['cancellation','fulfillment'] as const)void test(`${kind} lost acknowledgement recovers only the immutable original receipt`,async()=>{
 const f=await fixture();try{const x=await target(f,kind),wrapped=Object.create(f.db) as D1Database;let committed=false;
 wrapped.batch=(async(statements:D1PreparedStatement[])=>{const result=await f.db.batch(statements);if(!committed){committed=true;throw Error('fictional_lost_commit_acknowledgement');}return result;}) as D1Database['batch'];state.db=wrapped;
 const response=await x.api.POST(post(x.path,x.body,x.actorId),x.context);assert.equal(committed,true);assert.notEqual(response.status,200);
 state.db=f.db;const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
 const get=await x.api.GET(new Request(origin+x.path+`?sourceId=${x.sourceId}&action=${String(x.body.action)}&requestId=${x.requestId}`,{headers:{'X-Hastabazaar-Actor':x.actorId}}),x.context);
 assert.equal(get.status,200,await get.clone().text());assert.equal((await get.json() as {recorded:boolean}).recorded,true);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
 const replay=await x.api.POST(post(x.path,x.body,x.actorId),x.context);assert.equal(replay.status,200);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
 state.actor='foreign';const denied=await x.api.GET(new Request(origin+x.path+`?sourceId=${x.sourceId}&action=${String(x.body.action)}&requestId=${x.requestId}`,{headers:{'X-Hastabazaar-Actor':x.actorId}}),x.context);assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/recorded|Original evidence|itemIds/);
 }finally{state.db=null;f.dispose();}
});
for(const kind of ['cancellation','fulfillment'] as const)void test(`${kind} legacy successful action cannot acquire invented original proof`,async()=>{
 const f=await fixture();try{const x=await target(f,kind);
 if(kind==='cancellation'){const {clientAttemptId:omitted,...legacy}=x.body;assert.ok(omitted);const saved=await x.api.POST(post(x.path,legacy,x.actorId),x.context);assert.equal(saved.status,200,await saved.text());}
 else{const {transitionSellerFulfillment}=await import('../lib/db/repositories/fulfillment');await transitionSellerFulfillment(f.db,{orderId:f.orderId,sellerId:String(f.rows[0].sellerId),actorId:x.actorId,requestId:x.requestId,action:'start_packing',itemIds:x.body.itemIds as string[],note:String(x.body.note),now:Date.now()});}
 const audits=f.sqlite.prepare('SELECT * FROM audit_logs ORDER BY id').all();const repeat=await x.api.POST(post(x.path,x.body,x.actorId),x.context);assert.notEqual(repeat.status,200);assert.deepEqual(f.sqlite.prepare('SELECT * FROM audit_logs ORDER BY id').all(),audits);const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
 const read=await x.api.GET(new Request(origin+x.path+`?sourceId=${x.sourceId}&action=${String(x.body.action)}&requestId=${x.requestId}`,{headers:{'X-Hastabazaar-Actor':x.actorId}}),x.context);assert.equal(read.status,404);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
 }finally{state.db=null;f.dispose();}
});
void test('approved cancellation keeps deterministic economic identity and its immutable original proof',async()=>{
 const f=await fixture();try{const x=await target(f,'cancellation'),{cancellationPreview}=await import('../lib/cancellation/repository');
 const preview=await cancellationPreview(f.db,{actorId:x.actorId,orderNumber:f.order.orderNumber},[String(f.rows[0].sellerId)]),body={...x.body,action:'approve',fingerprint:preview.fingerprint};
 const saved=await x.api.POST(post(x.path,body,x.actorId),x.context);assert.equal(saved.status,200,await saved.clone().text());const proof=await saved.json();
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_cancellation_events WHERE id=?').get('review:'+x.sourceId)!.n,1);
 const events=f.sqlite.prepare('SELECT * FROM order_cancellation_events ORDER BY id').all(),stock=f.sqlite.prepare('SELECT id,inventory_quantity FROM products ORDER BY id').all();
 const repeat=await x.api.POST(post(x.path,body,x.actorId),x.context);assert.equal(repeat.status,200);assert.deepEqual(await repeat.json(),proof);assert.deepEqual(f.sqlite.prepare('SELECT * FROM order_cancellation_events ORDER BY id').all(),events);assert.deepEqual(f.sqlite.prepare('SELECT id,inventory_quantity FROM products ORDER BY id').all(),stock);
 }finally{state.db=null;f.dispose();}
});
void test('fulfillment original start proof remains historical after actual ready-for-pickup transition',async()=>{
 const f=await fixture();try{const x=await target(f,'fulfillment'),saved=await x.api.POST(post(x.path,x.body,x.actorId),x.context);assert.equal(saved.status,200);const original=await saved.json();
 const next=await x.api.POST(post(x.path,{...x.body,action:'ready_for_pickup',requestId:crypto.randomUUID(),note:'The same selected items are now actually packed and ready.'},x.actorId),x.context);assert.equal(next.status,200,await next.text());
 assert.equal(f.sqlite.prepare('SELECT fulfillment_status FROM order_items WHERE order_id=?').get(f.orderId)!.fulfillment_status,'ready_for_pickup');const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
 const read=await x.api.GET(new Request(origin+x.path+`?action=start_packing&requestId=${x.requestId}`,{headers:{'X-Hastabazaar-Actor':x.actorId}}),x.context);assert.equal(read.status,200);assert.deepEqual(await read.json(),original);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
 }finally{state.db=null;f.dispose();}
});
void test('first cancellation stale-form rejection explicitly proves before-write identity',async()=>{
 const f=await fixture();try{const x=await target(f,'cancellation'),response=await x.api.POST(post(x.path,{...x.body,formVersion:999},x.actorId),x.context);assert.equal(response.status,409);const rejected=await response.json() as Record<string,unknown>;
 assert.equal(rejected.phase,'before_write');assert.equal(rejected.recorded,false);assert.equal(rejected.requestId,x.requestId);assert.equal(rejected.sourceId,x.sourceId);assert.equal(rejected.actorId,x.actorId);
 assert.equal(f.sqlite.prepare('SELECT status FROM order_cancellation_reviews WHERE id=?').get(x.sourceId)!.status,'pending');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='order.native-action'").get()!.n,0);
 }finally{state.db=null;f.dispose();}
});
for(const kind of ['cancellation','fulfillment'] as const)void test(`${kind} outcome read failure still fences concurrent authority loss`,async()=>{
 const f=await fixture();try{const x=await target(f,kind);assert.equal((await x.api.POST(post(x.path,x.body,x.actorId),x.context)).status,200);
 const wrapped=Object.create(f.db) as D1Database;let raced=false;
 wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('SELECT command_result_json AS result FROM audit_logs'))statement.first=(async()=>{raced=true;f.sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(x.actorId);throw Error('fictional_read_failure_after_role_loss');}) as D1PreparedStatement['first'];return statement;}) as D1Database['prepare'];state.db=wrapped;
 const response=await x.api.GET(new Request(origin+x.path+`?sourceId=${x.sourceId}&action=${String(x.body.action)}&requestId=${x.requestId}`,{headers:{'X-Hastabazaar-Actor':x.actorId}}),x.context);assert.equal(raced,true);assert.equal(response.status,403,await response.text());
 }finally{state.db=null;f.dispose();}
});
void test('cancellation approval original proof and economic effects roll back on authenticated-subject drift',async()=>{
 const f=await fixture();try{const x=await target(f,'cancellation'),{cancellationPreview}=await import('../lib/cancellation/repository');const preview=await cancellationPreview(f.db,{actorId:x.actorId,orderNumber:f.order.orderNumber},[String(f.rows[0].sellerId)]);
 const stock=f.sqlite.prepare('SELECT id,inventory_quantity FROM products ORDER BY id').all();f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE users SET auth_subject='rebound-before-approval' WHERE id=?").run(x.actorId);});
 const response=await x.api.POST(post(x.path,{...x.body,action:'approve',fingerprint:preview.fingerprint},x.actorId),x.context);assert.equal(response.status,403,await response.text());assert.equal(f.sqlite.prepare('SELECT status FROM order_cancellation_reviews WHERE id=?').get(x.sourceId)!.status,'pending');assert.deepEqual(f.sqlite.prepare('SELECT id,inventory_quantity FROM products ORDER BY id').all(),stock);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_cancellation_events WHERE id=?').get('review:'+x.sourceId)!.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='order.native-action'").get()!.n,0);
 }finally{state.db=null;f.dispose();}
});
