import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialManyOfferFixture} from './helpers/commercial-many-offer-fixture';
import {readCommercialCombinationPreview} from '../lib/incentives/commercial-combination-preview';
import {getOfferStock,pauseOfferStock} from '../lib/products/offer-inventory';

type Observation={sql:string;params:number};
function observe(db:D1Database,onBatch?:(statements:D1PreparedStatement[],run:()=>Promise<D1Result[]>)=>Promise<D1Result[]>){const queries:Observation[]=[],batches:number[]=[];let executed=0;const wrapped=new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>{const statement=target.prepare(sql);const wrap=(prepared:D1PreparedStatement):D1PreparedStatement=>new Proxy(prepared,{get(source,property){if(property==='bind')return(...values:unknown[])=>{if(sql.includes('proof_0'))queries.push({sql,params:values.length});return wrap(source.bind(...values));};if(property==='first'||property==='all')return(...args:unknown[])=>{executed++;return Reflect.apply(Reflect.get(source,property),source,args);};const value=Reflect.get(source,property);return typeof value==='function'?value.bind(source):value;}});return wrap(statement);};if(key==='batch')return async(statements:D1PreparedStatement[])=>{batches.push(statements.length);const run=()=>target.batch(statements);return onBatch?onBatch(statements,run):run();};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});return{db:wrapped,queries,batches,executed:()=>executed};}

void test('full native20-line preview deduplicates exact checks and uses one bounded read-only snapshot batch',async()=>{
 const f=await commercialManyOfferFixture();try{const seen=observe(f.db),before=f.sqlite.prepare('SELECT total_changes() n').get()?.n,result=await readCommercialCombinationPreview(seen.db,f.actor,f.input);assert.equal(result.lines.length,20);assert.equal(result.totals?.payablePaisa,1615700);assert.equal(result.eligibility.status,'eligible_at_snapshot');assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,before);assert.ok(seen.executed()<1000,'The supported20-line request must stay within the paid native query budget.');console.info(JSON.stringify({nativeSampleLines:20,executedReadonlyQueries:seen.executed(),atomicReadTransactions:seen.batches.length}));assert.equal(seen.batches.length,1);assert.ok(seen.batches[0]>1);assert.ok(seen.queries.every(query=>query.params<=100&&Buffer.byteLength(query.sql)<=80000));const sql=seen.queries.map(query=>query.sql).join('\n');assert.equal((sql.match(/v\.identity_revision=\?/g)??[]).length,1,'The same exact seller snapshot proof is retained once rather than sampled away.');
 }finally{f.dispose();}
});

void test('grouped preview rejects an actual stock change before the final snapshot transaction',async()=>{
 const f=await commercialManyOfferFixture();try{let changed=false;const seen=observe(f.db,async(_statements,run)=>{const stock=await getOfferStock(f.db,'preview-size-20');assert.ok(stock);await pauseOfferStock(f.db,{actorId:'registered-owner',requestId:'preview-group-source-change',expectedRevision:String(stock.revision),now:Date.now()},{offerId:stock.offerId,paused:true,reason:'Actual source change before the entire readonly proof transaction.'});changed=true;return run();});await assert.rejects(()=>readCommercialCombinationPreview(seen.db,f.actor,f.input),(error:unknown)=>error instanceof Error&&'status'in error&&error.status===409);assert.equal(changed,true);
 }finally{f.dispose();}
});

void test('cached composite offer data cannot hide a native change before its later detail read',async()=>{
 const f=await commercialManyOfferFixture();try{let changed=false;const raced=new Proxy(f.db,{get(target,key){if(key==='prepare')return(sql:string)=>{const statement=target.prepare(sql);if(!sql.startsWith('SELECT revision,available,paused'))return statement;const wrap=(source:D1PreparedStatement,offerId?:unknown):D1PreparedStatement=>new Proxy(source,{get(value,property){if(property==='bind')return(...bindings:unknown[])=>wrap(value.bind(...bindings),bindings[0]);if(property==='first')return async()=>{if(offerId==='preview-size-20'&&!changed){const stock=await getOfferStock(f.db,'preview-size-20');assert.ok(stock);await pauseOfferStock(f.db,{actorId:'registered-owner',requestId:'preview-mid-read-pause',expectedRevision:String(stock.revision),now:Date.now()},{offerId:'preview-size-20',paused:true,reason:'A genuine independent change between the public composite and stock-detail reads.'});changed=true;}return value.first();};const field=Reflect.get(value,property);return typeof field==='function'?field.bind(value):field;}});return wrap(statement);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});await assert.rejects(()=>readCommercialCombinationPreview(raced,f.actor,f.input),(error:unknown)=>error instanceof Error&&'status'in error&&error.status===409);assert.equal(changed,true);
 }finally{f.dispose();}
});

void test('grouped preview rejects current actor revocation before its transaction',async()=>{
 const f=await commercialManyOfferFixture();try{let changed=false;const seen=observe(f.db,async(_statements,run)=>{f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();changed=true;return run();});await assert.rejects(()=>readCommercialCombinationPreview(seen.db,f.actor,f.input),(error:unknown)=>error instanceof Error&&'status'in error&&error.status===403);assert.equal(changed,true);
 }finally{f.dispose();}
});

void test('missing proof groups and malformed native replay never return a partial preview',async()=>{
 const f=await commercialManyOfferFixture();try{for(const fault of ['missing-group','bad-guard','missing-replay-results']){const seen=observe(f.db,async(_statements,run)=>{const rows=await run();if(fault==='missing-group')return rows.slice(0,-1);if(fault==='bad-guard'){const first=rows[0];assert.ok(first);return[{...first,results:[{}]},...rows.slice(1)];}const last=rows.at(-1);assert.ok(last);Reflect.deleteProperty(last,'results');return rows;});await assert.rejects(()=>readCommercialCombinationPreview(seen.db,f.actor,f.input),(error:unknown)=>error instanceof Error&&'status'in error&&error.status===503,fault);}
 }finally{f.dispose();}
});
