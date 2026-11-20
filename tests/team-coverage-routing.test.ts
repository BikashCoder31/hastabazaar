import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance} from '../lib/operations/team-governance';
import {ensureReviewTask,reconcileReviewTaskCoverage} from '../lib/workflows/review-tasks';
import {processReminderDispatch} from '../lib/operations/reminder-dispatch';

async function setup(){
 const f=await completeVersionFixture(Date.now()-1000);
 await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'coverage-duty',expectedRevision:null,now:f.now},{action:'save_duty',sourceId:'products',primaryId:'delegate',backupIds:['reviewer'],reason:'Use actual permitted product review duty and independent available backup.'});
 f.sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('coverage-category','coverage-category','Fictional',1,1,1,1);INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES('coverage-product','maker','coverage-category','coverage-product','COVERAGE-FIXTURE','Fictional review','Fictional',10000,1,'Maker','NP','Clay','submitted',1,1)");
 f.sqlite.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES('coverage-submission','maker-user','product.submitted','product','coverage-product','Original fictional submission','{}','coverage-submission',?)").run(f.now-3600000);
 const taskId=await ensureReviewTask(f.db,{sourceType:'product_review',sourceId:'coverage-product',now:f.now});
 f.sqlite.prepare("UPDATE review_tasks SET owner_id='delegate' WHERE id=?").run(taskId);
 const original=f.sqlite.prepare('SELECT started_at,due_at,calendar_version FROM review_tasks WHERE id=?').get(taskId);
 const owner=()=>f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(taskId)!.owner_id;
 const clocks=()=>assert.deepEqual(f.sqlite.prepare('SELECT started_at,due_at,calendar_version FROM review_tasks WHERE id=?').get(taskId),original);
 return {...f,taskId,owner,clocks};
}
async function scan(){const loadedFixtureModule=await import('../lib/operations/team-coverage-dispatch').catch(()=>null);assert.equal(typeof loadedFixtureModule?.reconcileTeamTaskCoverage,'function');return loadedFixtureModule!.reconcileTeamTaskCoverage;}
function clock(f:Awaited<ReturnType<typeof setup>>,now:number){f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));}

void test('current absence reroutes original owned work immediately without changing its grant or clock',async()=>{
 const f=await setup();try{
  await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'current-absence',expectedRevision:null,now:f.now},{action:'availability',sourceId:'delegate',startsAt:f.now,endsAt:f.now+3600000,available:false,reason:'Current unexpected absence needs the recorded eligible backup now.'});
  assert.equal(f.owner(),'reviewer');f.clocks();
  assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'["product.review"]');
 }finally{f.dispose();}
});

void test('bounded scheduled coverage observes future absence only at its real start without duplicating a stable assignment',async()=>{
 const f=await setup();try{
  const run=await scan(),start=f.now+120000;
  clock(f,f.now);
  await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'future-absence',expectedRevision:null,now:f.now},{action:'availability',sourceId:'delegate',startsAt:start,endsAt:start+3600000,available:false,reason:'Future absence must not move the current work early.'});
  assert.equal(f.owner(),'delegate');
  f.sqlite.prepare("INSERT OR IGNORE INTO operational_reminder_cursors(family) VALUES('dispatch')").run();
  const selectCoverage=f.sqlite.prepare("UPDATE operational_reminder_cursors SET cursor='team_coverage' WHERE family='dispatch'");
  const taskCount=Number(f.sqlite.prepare('SELECT COUNT(*) n FROM review_tasks').get()!.n);
  const receipts=f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='review_task.coverage_rerouted' AND subject_id=?");
  const sweep=async(now:number)=>{
   clock(f,now);
   // Other fixture tasks have random IDs. Visit every row through the real one-row scheduled family.
   for(let pass=0;pass<taskCount;pass++){
    selectCoverage.run();
    const result=await processReminderDispatch(f.db,{now,limit:1});
    assert.equal(result.scanned,1);
    assert.deepEqual(result.failures,[]);
    assert.equal(result.busy,false);
    assert.equal(result.budgetExhausted,false);
   }
  };
  await sweep(start-1);
  assert.equal(f.owner(),'delegate');f.clocks();
  assert.equal(receipts.get(f.taskId)!.n,0);
  await sweep(start);
  assert.equal(f.owner(),'reviewer');f.clocks();
  assert.equal(receipts.get(f.taskId)!.n,1);
  assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'["product.review"]');
  const repeat=await run(f.db,{now:start,limit:taskCount});
  assert.deepEqual(repeat.failures,[]);
  assert.equal(repeat.changed,0);
  assert.equal(receipts.get(f.taskId)!.n,1);
 }finally{f.dispose();}
});

void test('handoff cancellation after preparation prevents a stale ownership transfer at commit',async()=>{
 const f=await setup();try{
  const handoff=await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'race-handoff',expectedRevision:'0',now:f.now},{action:'propose_handoff',sourceId:'products',toUserId:'reviewer',startsAt:f.now,endsAt:f.now+3600000,reason:'Prepare a real received handoff for the cancellation race.'});
  assert.ok(handoff&&typeof handoff==='object'&&'id'in handoff&&typeof handoff.id==='string');const handoffId=handoff.id;
  const offlineWorker={prepare(sql:string){if(sql.includes('operational_reminder_cursors'))throw new Error('Fictional worker interruption');return f.db.prepare(sql);},batch:f.db.batch.bind(f.db)}as D1Database;
  await executeTeamGovernance(offlineWorker,{actorId:'reviewer',requestId:'receive-race-handoff',expectedRevision:'0',now:f.now},{action:'accept_handoff',sourceId:handoffId,reason:'Receipt is confirmed while immediate background processing is interrupted.'});
  assert.equal(f.owner(),'delegate');
  f.setBeforeBatch(()=>executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'cancel-before-transfer',expectedRevision:'1',now:f.now},{action:'cancel_handoff',sourceId:handoffId,reason:'Cancel this received handoff before its prepared ownership transfer commits.'}).then(()=>{}));
  await assert.rejects(reconcileReviewTaskCoverage(f.db,{taskId:f.taskId,formerOwnerId:'delegate',now:f.now}),/guard|CHECK|constraint/i);
  assert.equal(f.owner(),'delegate');f.clocks();
 }finally{f.dispose();}
});

void test('only a received active handoff moves its original owners work; a proposal does not transfer authority or ownership',async()=>{
 const f=await setup();try{
  const handoff=await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'coverage-handoff',expectedRevision:'0',now:f.now},{action:'propose_handoff',sourceId:'products',toUserId:'reviewer',startsAt:f.now,endsAt:f.now+3600000,reason:'Transfer the specific existing product work to the eligible substitute.'});
  assert.ok(handoff&&typeof handoff==='object'&&'id'in handoff&&typeof handoff.id==='string');const handoffId=handoff.id;
  assert.equal(f.owner(),'delegate');
  await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'receive-coverage',expectedRevision:'0',now:f.now},{action:'accept_handoff',sourceId:handoffId,reason:'The substitute confirms receipt of this current product responsibility.'});
  assert.equal(f.owner(),'reviewer');f.clocks();
 }finally{f.dispose();}
});
