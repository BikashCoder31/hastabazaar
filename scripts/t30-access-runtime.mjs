import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {staffAccessGovernanceStatements} from '../lib/operations/team-access-impact.ts';
import {reconcileStaffAccessCoverage} from '../lib/operations/team-access-reconciliation.ts';
import {executeTeamGovernance} from '../lib/operations/team-governance.ts';
import {assignReviewTask,reconcileReviewTaskCoverage} from '../lib/workflows/review-tasks.ts';

const root=await realpath('C:/Users/abinash/Desktop/HastaBazaar');
const runtimePaths=['scripts/t30-access-runtime.mjs','lib/operations/team-access-impact.ts','lib/operations/team-access-reconciliation.ts','lib/operations/team-governance.ts','lib/operations/team-governance-tasks.ts','lib/operations/team-governance-dispatch.ts','lib/operations/team-coverage-dispatch.ts','lib/operations/team-notice-sources.ts','lib/db/repositories/staff-permissions.ts','lib/db/repositories/staff-mutation-guard.ts','lib/workflows/review-tasks.ts','lib/operations/review-task-assignment-notices.ts','lib/operations/incident-review.ts','lib/runtime/node-bindings.ts'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const runtimeHashes=Object.fromEntries(await Promise.all(runtimePaths.map(async path=>[path,digest(await readFile(resolve(root,path)))])));
async function proveFrozen(){for(const[path,hash]of Object.entries(runtimeHashes))assert.equal(digest(await readFile(resolve(root,path))),hash,'Native runtime source remained frozen: '+path);}

/** No server, schema, pool or external connection is created. Caller owns the already
 * authenticated fresh fixture; native checks and the standalone runner share this body. */
export async function verifyT30AccessRuntime(fixture){
 assert.equal((await realpath(process.cwd())).toLowerCase(),root.toLowerCase());assert.match(fixture.id,/^fixture-\d{14}-[a-f0-9]{8}$/);
 const connection=fixture.connection,database=fixture.database,[scope]=await connection.query('SELECT DATABASE() AS name');
 assert.match(String(database),/^fixture_[a-f0-9]{8}_[a-z][a-z0-9_]{0,24}$/);assert.equal(scope[0].name,database);await proveFrozen();
 const now=Date.now(),originalPool=mysql.createPool,keys=['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD'],previous=keys.map(key=>process.env[key]);
 const transport={query:connection.query.bind(connection),execute:connection.execute.bind(connection),beginTransaction:connection.beginTransaction.bind(connection),commit:connection.commit.bind(connection),rollback:connection.rollback.bind(connection),release(){},destroy(){throw new Error('Unexpected owned transport destruction');}};
 const pool={query:transport.query,execute:transport.execute,async getConnection(){return transport;}},previousJsonStrings=connection.connection.config.jsonStrings;
 mysql.createPool=configuration=>{assert.equal(configuration.host,'127.0.0.1');assert.equal(configuration.port,fixture.port);assert.equal(configuration.database,database);assert.equal(configuration.password,'fixture-connection-already-authenticated');assert.equal(configuration.jsonStrings,true);connection.connection.config.jsonStrings=true;return pool;};
 for(const[key,value]of Object.entries({DB_HOST:'127.0.0.1',DB_PORT:String(fixture.port),DB_NAME:database,DB_USER:'owned-fixture-transport',DB_PASSWORD:'fixture-connection-already-authenticated'}))process.env[key]=value;
 try{
  const{env}=await import('../lib/runtime/node-bindings.ts'),db=env.DB;
  await db.prepare('SELECT `cursor` AS `cursor`,revision FROM operational_reminder_cursors WHERE family=? AND lease_token=?').bind('fixture','fixture').all();
  const product=async(id,submission,task,owner,start)=>{
   await connection.execute("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES(?,'access-seller','access-category',?,?,'Fictional product','Fictional',10000,1,'Maker','NP','Clay','submitted',?,?)",[id,id,id,now-1000,now-1000]);
   await connection.execute("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,'access-seller','product.submitted','product',?,'Fictional original submission','{}',?,?)",[submission,id,submission,start]);
   await connection.execute("INSERT INTO review_tasks(id,source_type,source_id,source_revision,owner_id,started_at,due_at,calendar_version,updated_at) VALUES(?,'product_review',?,?,?,?,?,'continuous-v1',?)",[task,id,submission,owner,start,start+86400000,now]);
  };
  await connection.beginTransaction();
  await connection.execute("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('access-sa','access-sa@local.hastabazaar.test','Fictional SA','active',?,?),('access-old','access-old@local.hastabazaar.test','Fictional former reviewer','active',?,?),('access-seller','access-seller@local.hastabazaar.test','Fictional seller','active',?,?),('access-profile-admin','access-profile-admin@local.hastabazaar.test','Fictional profile-race reviewer','active',?,?)",[now,now,now,now,now,now,now,now]);
  await connection.execute("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('access-sa','super_admin',?),('access-old','admin',?),('access-seller','super_admin',?),('access-profile-admin','admin',?)",[now,now,now,now]);
  await connection.execute("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('access-old','[\"product.review\"]',1,'access-sa',?),('access-profile-admin','[\"product.review\"]',1,'access-sa',?)",[now,now]);
  await connection.execute("INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,reason,proposed_by,proposed_at,status,decided_by,decided_at,decision_note,decision_token) VALUES('native-access-change','access-old','[]',1,'Fictional original access removal','access-sa',?,'approved','access-sa',?,'Fictional direct decision','native-access-change')",[now,now]);
  await connection.execute("INSERT INTO team_duties(id,department,label,required_permission,reserved_super_admin,primary_user_id,updated_at,updated_by) VALUES('products','Products & storefront','Product review','product.review',0,'access-old',?,'access-sa')",[now]);
  await connection.execute("INSERT INTO team_duty_backups(duty_id,user_id,position) VALUES('products','access-sa',0)");
  await connection.execute("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at) VALUES('access-seller','access-seller','Fictional seller','Fictional shop','Local','ACCESS-FIX-REG','PAN','ACCESS-FIX-PAN','Fictional person','9800000000','access-seller@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Ward1','ACCESS-FIX-BANK','approved',?,?)",[now,now]);
  await connection.execute("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('access-category','access-category','Fictional',1,1,?,?)",[now,now]);
  await product('access-case-product','access-case-submission','access-case-task','access-sa',now-86400000);
  await product('access-profile-product','access-profile-submission','access-profile-task','access-sa',now-86400000);await connection.commit();

  // This supported-command negative intentionally precedes the125-source bulk work.
  const roster=(requestId,expectedRevision,backupIds,primaryId=null)=>executeTeamGovernance(db,{actorId:'access-sa',requestId,expectedRevision:String(expectedRevision),now},{action:'save_duty',sourceId:'products',primaryId,backupIds,reason:'An opaque roster identity never bypasses native seller-party exclusion.'});
  await roster('native-canonical-party-roster',0,['access-seller','access-sa']);
  await roster('native-canonical-marker-control',1,['access-seller','access-sa']);
  let caseVariantRejected=false,caseVariantPartyExcluded=false;
  try{await roster('native-case-party-roster',2,['ACCESS-SELLER','access-sa']);}catch(error){assert.match(String(error.message),/current|authority|eligible|permission|identifier|account/i);caseVariantRejected=true;}
  if(!caseVariantRejected){
   const task=await db.prepare('SELECT revision FROM review_tasks WHERE id=?').bind('access-case-task').first();
   await assignReviewTask(db,{actorId:'access-sa',requestId:'native-case-clear-owner',expectedRevision:String(task.revision),now},{taskId:'access-case-task',ownerId:null,reason:'Expose the original task for a real current-source coverage decision.'});
   await reconcileReviewTaskCoverage(db,{taskId:'access-case-task',formerOwnerId:'access-sa',now,requestId:'native-case-source-proof'});
   const[assigned]=await connection.execute('SELECT u.id FROM review_tasks t LEFT JOIN users u ON u.id=t.owner_id WHERE t.id=?',['access-case-task']);caseVariantPartyExcluded=assigned[0].id==='access-sa';
  }else caseVariantPartyExcluded=true;
  console.log(JSON.stringify({stage:'case-variant-party-checked',caseVariantRejected,caseVariantPartyExcluded}));

  // A hostile persisted-profile race is distinct from an accepted public grant: the
  // public validator cannot save uppercase permissions. The ACTUAL guarded command
  // must nevertheless fail closed if that corrupt profile appears before commit.
  let currentTask=await db.prepare('SELECT revision FROM review_tasks WHERE id=?').bind('access-profile-task').first();
  await assignReviewTask(db,{actorId:'access-profile-admin',requestId:'native-profile-race-control',expectedRevision:String(currentTask.revision),now},{taskId:'access-profile-task',ownerId:'access-sa',reason:'Prove the valid ordinary-profile guarded assignment before the exact-case race.'});
  currentTask=await db.prepare('SELECT revision FROM review_tasks WHERE id=?').bind('access-profile-task').first();let raced=false,profileCaseRejected=false;
  const racing={dialect:db.dialect,prepare:db.prepare.bind(db),async batch(statements){if(!raced){raced=true;await connection.execute("UPDATE staff_permission_profiles SET permissions_json='[\"PRODUCT.REVIEW\"]' WHERE user_id='access-profile-admin'");}return db.batch(statements);}};
  try{await assignReviewTask(racing,{actorId:'access-profile-admin',requestId:'native-profile-case-race',expectedRevision:String(currentTask.revision),now},{taskId:'access-profile-task',ownerId:'access-sa',reason:'Reject stale operational authority after a case-only corrupted profile change.'});}catch(error){assert.match(String(error.message),/guard|constraint|permission|authority|current|changed|invalid/i);profileCaseRejected=true;}
  assert.equal(raced,true,'The negative must reach the actual injected precommit race.');
  const afterRace=await db.prepare('SELECT revision FROM review_tasks WHERE id=?').bind('access-profile-task').first();if(profileCaseRejected){assert.equal(afterRace.revision,currentTask.revision,'Rejected profile race must not mutate the assignment.');const[receipts]=await connection.execute("SELECT COUNT(*) n FROM audit_logs WHERE request_id='native-profile-case-race'");assert.equal(Number(receipts[0].n),0,'Rejected profile race cannot leave a saved command receipt.');}
  console.log(JSON.stringify({stage:'profile-case-race-checked',raced,profileCaseRejected,caseVariantPartyExcluded}));
  const failures=[];if(!caseVariantPartyExcluded)failures.push(new Error('A CI case-variant native seller was assigned their own product review.'));if(!profileCaseRejected)failures.push(new Error('A case-only corrupted profile did not invalidate the real precommit permission guard.'));
  if(failures.length){const error=new AggregateError(failures,'Actual native negative checks failed: '+failures.map(item=>item.message).join(' '));error.diagnostic={runtimeHashes,caseVariantRejected,caseVariantPartyExcluded,profileCaseRejected,profileCaseRace:'hostile persisted profile before actual command commit'};throw error;}
  const[head]=await connection.query("SELECT revision FROM team_duties WHERE id='products'");await roster('native-bulk-original-roster',head[0].revision,['access-sa'],'access-old');

  const originalId='opaque-'+('x'.repeat(183));assert.equal(originalId.length,190);
  await connection.beginTransaction();for(let index=0;index<125;index++)await product('access-product-'+index,'access-submitted-'+index,index===0?originalId:'access-task-'+index,'access-old',now-86400000-index);await connection.commit();console.log(JSON.stringify({stage:'sources-seeded',count:125}));
  await db.batch([...await staffAccessGovernanceStatements(db,{userId:'access-old',actorId:'access-sa',requestId:'native-access-change',now,grantVersion:2}),db.prepare("UPDATE staff_permission_profiles SET permissions_json='[]',version=2,last_request_id='native-access-change',updated_at=? WHERE user_id='access-old' AND version=1").bind(now)]);
  const[profile]=await connection.query("SELECT version,permissions_json FROM staff_permission_profiles WHERE user_id='access-old'");assert.equal(profile[0].version,2);assert.equal(profile[0].permissions_json,'[]');
  const[rows]=await connection.query("SELECT id,source_id,source_reference_json FROM team_governance_tasks WHERE kind='access_reconciliation'");assert.equal(rows.length,126);assert.ok(rows.every(row=>row.id.length===32&&row.source_id.length===32));assert.ok(rows.some(row=>JSON.parse(row.source_reference_json).taskId===originalId));
  assert.equal(Number((await connection.query("SELECT COUNT(*) n FROM review_tasks WHERE owner_id='access-old'"))[0][0].n),0);console.log(JSON.stringify({stage:'snapshots-retained',count:126}));
  await assert.rejects(connection.execute("UPDATE team_governance_tasks SET source_reference_json=JSON_SET(source_reference_json,'$.taskId','forged') WHERE id=?",[rows[0].id]),/team_task_original_clock_immutable/);
  let scanned=0;for(let pass=0;pass<20;pass++){const outcome=await reconcileStaffAccessCoverage(db,{now,limit:20,deadlineMs:Date.now()+20000});scanned+=outcome.scanned;console.log(JSON.stringify({stage:'reconciliation-pass',pass,...outcome}));assert.equal(outcome.failures,0);if(!outcome.scanned)break;}
  assert.equal(Number((await connection.query("SELECT COUNT(*) n FROM review_tasks WHERE owner_id='access-sa' AND source_id LIKE 'access-product-%'"))[0][0].n),125);
  assert.equal(Number((await connection.query("SELECT COUNT(*) n FROM team_governance_tasks WHERE state='open' AND kind IN('access_change','access_reconciliation')"))[0][0].n),0);
  const[original]=await connection.execute('SELECT started_at,due_at,calendar_version FROM review_tasks WHERE id=?',[originalId]);assert.equal(original[0].started_at,now-86400000);assert.equal(original[0].due_at,now);assert.equal(original[0].calendar_version,'continuous-v1');
  await proveFrozen();return{status:'PASS',fixture:fixture.id,database,version:fixture.facts.version,runtimeHashes,originalReviewTasks:125,internalChildren:126,generatedKeyBytes:32,longOriginalIdBytes:190,scanned,immutableReferenceDenied:true,originalClocksRetained:true,caseVariantRejected,caseVariantPartyExcluded,profileCaseRejected,profileCaseRace:'hostile persisted profile before actual command commit',actualRuntimeAdapter:true};
 }finally{await connection.rollback().catch(()=>{});mysql.createPool=originalPool;connection.connection.config.jsonStrings=previousJsonStrings;keys.forEach((key,index)=>previous[index]===undefined?delete process.env[key]:process.env[key]=previous[index]);}
}
