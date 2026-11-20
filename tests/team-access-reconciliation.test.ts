import { fixtureWithOverrides } from './helpers/fixture-delegation';
import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance} from '../lib/operations/team-governance';
import {proposeStaffPermissions,decideStaffPermissions} from '../lib/db/repositories/staff-permissions';
import {ensureReviewTask,assignReviewTask} from '../lib/workflows/review-tasks';

async function setup(count=3){
 const f=await completeVersionFixture(Date.now()-60000);
 await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'impact-roster',expectedRevision:null,now:f.now},{action:'save_duty',sourceId:'products',primaryId:'delegate',backupIds:['reviewer'],reason:'Retain original product work with an actually eligible independent backup.'});
 f.sqlite.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('impact-category','impact-category','Fictional',1,1,1,1)").run();
 const tasks:string[]=[];
 for(let index=0;index<count;index++){
  const id='impact-product-'+index;
  f.sqlite.prepare("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES(?,'maker','impact-category',?,?,'Fictional review','Fictional',10000,1,'Maker','NP','Clay','submitted',1,1)").run(id,id,id);
  f.sqlite.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,'maker-user','product.submitted','product',?,'Original fictional submission','{}',?,?)").run('submission-'+index,id,'submission-'+index,f.now-86400000-index);
  const task=await ensureReviewTask(f.db,{sourceType:'product_review',sourceId:id,now:f.now});tasks.push(task);
  f.sqlite.prepare("UPDATE review_tasks SET owner_id='delegate' WHERE id=?").run(task);
 }
 return {...f,tasks};
}
function failedWorker(db:D1Database){return {prepare(sql:string){if(sql.includes('operational_reminder_cursors'))throw new Error('Fictional reconciliation storage outage');return db.prepare(sql);},batch:db.batch.bind(db)} as D1Database;}
async function worker(){return import('../lib/operations/team-access-reconciliation');}

void test('grant revocation commits original per-source snapshots even when postcommit reconciliation fails',async()=>{
 const f=await setup();try{
  const originals=f.sqlite.prepare("SELECT id,source_id,source_revision,started_at,due_at,calendar_version FROM review_tasks WHERE owner_id='delegate' ORDER BY id").all();
  await proposeStaffPermissions(failedWorker(f.db),{actorId:'reviewer',userId:'delegate',permissions:[],version:1,reason:'Revoke product work immediately despite a downstream reconciliation outage.',now:f.now});
  assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'[]');
  const children=f.sqlite.prepare("SELECT source_reference_json FROM team_governance_tasks WHERE kind='access_reconciliation'").all().map(row=>JSON.parse(String(row.source_reference_json)));
  assert.equal(children.filter(row=>row.snapshotKind==='review_task').length,3,'every original owner is durably captured before revocation clears shared metadata');
  for(const original of originals){const snapshot=children.find(row=>row.taskId===original.id);assert.ok(snapshot);assert.equal(snapshot.startedAt,original.started_at);assert.equal(snapshot.dueAt,original.due_at);assert.equal(snapshot.calendarVersion,original.calendar_version);assert.equal(snapshot.sourceRevision,original.source_revision);}
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE owner_id='delegate'").get()!.n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_tasks WHERE kind='access_change' AND state='open'").get()!.n,1);
  const root=f.sqlite.prepare("SELECT id FROM team_governance_tasks WHERE kind='access_change'").get()!;
  assert.deepEqual(await(await worker()).readStaffAccessReconciliationSummary(f.db,String(root.id)),{pendingSources:4,pendingTasks:3,pendingDuties:1});
 }finally{f.dispose();}
});

void test('bounded durable retries advance past a failing source and eventually restore original-clock work to current eligible cover',async()=>{
 const f=await setup();try{
  await proposeStaffPermissions(failedWorker(f.db),{actorId:'reviewer',userId:'delegate',permissions:[],version:1,reason:'Remove product authority while preserving every original source obligation.',now:f.now});
  const reconcile=(await worker()).reconcileStaffAccessCoverage;
  const poison={prepare(sql:string){const statement=f.db.prepare(sql);if(!sql.includes('FROM products p JOIN seller_profiles'))return statement;return {bind(...values:unknown[]){const bound=statement.bind(...values);if(values.includes('impact-product-0'))return fixtureWithOverrides(bound, {first:async()=>{throw new Error('Fictional one-source failure');}});return bound;}};},batch:f.db.batch.bind(f.db)} as D1Database;
  for(let pass=0;pass<12;pass++){const outcome=await reconcile(poison,{now:f.now,limit:1});assert.ok(outcome.scanned<=1);}
  assert.equal(f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(f.tasks[1])!.owner_id,'reviewer');
  assert.equal(f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(f.tasks[2])!.owner_id,'reviewer');
  assert.equal(f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(f.tasks[0])!.owner_id,null);
  for(let pass=0;pass<10;pass++)await reconcile(f.db,{now:f.now,limit:2});
  assert.equal(f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(f.tasks[0])!.owner_id,'reviewer');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_tasks WHERE kind IN('access_change','access_reconciliation') AND state='open'").get()!.n,0);
  for(let index=0;index<3;index++){const row=f.sqlite.prepare('SELECT started_at,due_at,calendar_version FROM review_tasks WHERE id=?').get(f.tasks[index])!;assert.equal(row.started_at,f.now-86400000-index);assert.equal(row.due_at,f.now-index);assert.equal(row.calendar_version,'continuous-v1');}
 }finally{f.dispose();}
});

void test('offboarding keeps revocation committed and exposes gaps until available lawful cover exists',async()=>{
 const f=await setup(1);try{
  await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'backup-away',expectedRevision:null,now:f.now},{action:'availability',sourceId:'reviewer',startsAt:f.now,endsAt:f.now+3600000,available:false,reason:'The only alternative reviewer is genuinely unavailable for this interval.'});
  await executeTeamGovernance(failedWorker(f.db),{actorId:'reviewer',requestId:'offboard-impact',expectedRevision:'1',now:f.now},{action:'offboard_staff',sourceId:'delegate',reason:'Remove work access now and retain source-native coverage obligations.'});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id='delegate' AND role='admin'").get()!.n,0);
  const reconcile=(await worker()).reconcileStaffAccessCoverage;
  for(let pass=0;pass<4;pass++)await reconcile(f.db,{now:f.now,limit:3});
  assert.equal(f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(f.tasks[0])!.owner_id,null);
  assert.ok(Number(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_tasks WHERE kind='access_reconciliation' AND state='open'").get()!.n)>0);
  await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'backup-return',expectedRevision:'0',now:f.now},{action:'availability',sourceId:'reviewer',startsAt:f.now,endsAt:f.now+3600000,available:true,reason:'Record the actual return without restoring the removed staff grant.'});
  for(let pass=0;pass<6;pass++)await reconcile(f.db,{now:f.now,limit:3});
  assert.equal(f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(f.tasks[0])!.owner_id,'reviewer');
  assert.equal(f.sqlite.prepare("SELECT status FROM users WHERE id='delegate'").get()!.status,'active');
 }finally{f.dispose();}
});

void test('a final source-guard race leaves its journal pending and still checkpoints the fair scan',async()=>{
 const f=await setup(1);try{
  await proposeStaffPermissions(failedWorker(f.db),{actorId:'reviewer',userId:'delegate',permissions:[],version:1,reason:'A later source race must not rewind or prevent this access removal.',now:f.now});
  const sqls=new WeakMap<object,string>();let raced=false;
  const racing={prepare(sql:string){const value=f.db.prepare(sql);sqls.set(value,sql);return value;},async batch(statements:D1PreparedStatement[]){if(!raced&&statements.some(statement=>sqls.get(statement)?.includes("UPDATE team_governance_tasks SET state='completed'"))){raced=true;throw new Error('Fictional final source guard race');}return f.db.batch(statements);}} as D1Database;
  const outcome=await(await worker()).reconcileStaffAccessCoverage(racing,{now:f.now,limit:3});
  assert.equal(raced,true);assert.ok(outcome.failures>=1);assert.ok(outcome.scanned>=2);
  assert.ok(String(f.sqlite.prepare("SELECT `cursor` FROM operational_reminder_cursors WHERE family='team.access-reconciliation'").get()!.cursor).length>0);
 }finally{f.dispose();}
});

void test('legacy approval creates the same durable original-source obligation',async()=>{
 const f=await setup(1);try{
  f.sqlite.prepare("INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,reason,proposed_by,proposed_at,status) VALUES('legacy-impact','delegate','[]',1,'Original pending access change','reviewer',?,'pending')").run(f.now-1000);
  await decideStaffPermissions(failedWorker(f.db),{actorId:'reviewer',requestId:'legacy-impact',decision:'approve',reason:'Apply the exact original pending revocation and retain its affected source.',now:f.now});
  assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'[]');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_tasks WHERE kind='access_reconciliation' AND json_extract(source_reference_json,'$.snapshotKind')='review_task'").get()!.n,1);
  const event=f.sqlite.prepare("SELECT id FROM team_governance_events WHERE action='access_changed' AND source_id='delegate'").get()!;
  assert.ok(event);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages WHERE related_id=?').get(event.id)!.n,4);
 }finally{f.dispose();}
});

void test('large fanout has no snapshot truncation or concatenated-ID overflow and children stay internal',async()=>{
 const f=await setup(125);try{
  const longId='opaque-'+('x'.repeat(183));assert.equal(longId.length,190);
  f.sqlite.prepare('UPDATE review_tasks SET id=? WHERE id=?').run(longId,f.tasks[0]);
  await proposeStaffPermissions(failedWorker(f.db),{actorId:'reviewer',userId:'delegate',permissions:[],version:1,reason:'Every one of the original sources must survive a large access-change fanout.',now:f.now});
  const children=f.sqlite.prepare("SELECT id,source_id,source_reference_json FROM team_governance_tasks WHERE kind='access_reconciliation'").all();
  assert.equal(children.length,126);assert.ok(children.every(row=>String(row.id).length===32&&String(row.source_id).length===32));
  assert.ok(children.some(row=>JSON.parse(String(row.source_reference_json)).taskId===longId));
  const source=(await import('../lib/operations/team-governance-tasks')).teamReviewSource;
  await assert.rejects(source(f.db,String(children[0].id),f.now));
  await assert.rejects(executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'forged-child-complete',expectedRevision:'0',now:f.now},{action:'complete_policy_review',sourceId:String(children[0].id),reason:'Internal reconciliation cannot be manually certified away.',nextAction:'A human action is never a substitute for actual guarded rerouting.'}));
  await (await import('../lib/operations/team-governance-tasks')).processTeamGovernanceDue(f.db,{now:f.now,limit:100});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks r JOIN team_governance_tasks t ON r.source_id=t.id WHERE r.source_type='team_governance' AND t.kind='access_reconciliation'").get()!.n,0);
 }finally{f.dispose();}
});

void test('native applied access notice deduplicates exact replay, reaches current subject and SA, and supersedes old queued copies',async()=>{
 const f=await setup(1);try{
  const answers={formId:'staff.staff-permission-1',version:1,answers:[]};
  f.sqlite.prepare("INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES('access-permission-form','staff.staff-permission-1',1,'published',?,'Fictional compatible core form','reviewer',?,'reviewer',?,'reviewer',?,'access-form-publish')").run(JSON.stringify({formId:'staff.staff-permission-1',fields:[]}),f.now,f.now,f.now);
  const input={actorId:'reviewer',userId:'delegate',permissions:[],version:1,reason:'The staff member and supervising Super Admin need one exact access-change notice.',now:f.now,requestId:'access-notice-first',form:{requestId:'access-notice-first',versionId:'access-permission-form',answers}};
  await proposeStaffPermissions(failedWorker(f.db),input);
  const event=f.sqlite.prepare("SELECT id FROM team_governance_events WHERE action='access_changed' AND source_id='delegate'").get();assert.ok(event,'the actual applied access decision must produce its native common Team notice');
  const notices=f.sqlite.prepare("SELECT recipient_user_id,channel,template_key,related_id,request_id,audience_role,related_type FROM notification_messages WHERE related_id=?").all(event.id);
  assert.equal(notices.length,4);assert.deepEqual(new Set(notices.map(row=>row.recipient_user_id)),new Set(['delegate','reviewer']));assert.ok(notices.every(row=>row.template_key==='business.team.governance'));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.permissions.changed'").get()!.n,0,'one effective access transition has one common notice family');
  await proposeStaffPermissions(failedWorker(f.db),input);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages WHERE related_id=?').get(event.id)!.n,4);
  const current=(await import('../lib/operations/team-notice-sources')).isCurrentTeamNotice;
  const projected=notices.map(row=>({userId:String(row.recipient_user_id),channel:String(row.channel),template:String(row.template_key),relatedId:String(row.related_id),requestId:String(row.request_id),audience:String(row.audience_role),relatedType:String(row.related_type)}));
  for(const notice of projected)assert.equal(await current(f.db,notice,f.now),true);
  await proposeStaffPermissions(failedWorker(f.db),{actorId:'reviewer',userId:'delegate',permissions:['order.manage'],version:2,reason:'A later exact grant replaces stale queued access-change action copies.',now:f.now+1});
  for(const notice of projected)assert.equal(await current(f.db,notice,f.now+1),false);
 }finally{f.dispose();}
});

void test('native party conflicts defeat roster eligibility while a new lawful current assignee is preserved',async()=>{
 const f=await setup(2);try{
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('maker-user','super_admin',?),('foreign','super_admin',?)").run(f.now,f.now);
  await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'conflicted-backup-roster',expectedRevision:'0',now:f.now},{action:'save_duty',sourceId:'products',primaryId:'delegate',backupIds:['maker-user','reviewer'],reason:'Generic roster eligibility cannot override the original product seller conflict.'});
  await proposeStaffPermissions(failedWorker(f.db),{actorId:'reviewer',userId:'delegate',permissions:[],version:1,reason:'Current source party authority must govern the eventual restored assignment.',now:f.now});
  await assignReviewTask(f.db,{actorId:'reviewer',requestId:'new-lawful-owner',expectedRevision:'1',now:f.now},{taskId:f.tasks[1],ownerId:'foreign',reason:'Preserve a later legitimate source-authorized assignment over an old access journal.'});
  const reconcile=(await worker()).reconcileStaffAccessCoverage;
  for(let pass=0;pass<10;pass++)await reconcile(f.db,{now:f.now,limit:2});
  assert.equal(f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(f.tasks[0])!.owner_id,'reviewer');
  assert.equal(f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(f.tasks[1])!.owner_id,'foreign');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='review_task.coverage_rerouted' AND actor_id IS NOT NULL").get()!.n,0);
 }finally{f.dispose();}
});
