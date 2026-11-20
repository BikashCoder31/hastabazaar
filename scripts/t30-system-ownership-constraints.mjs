import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';

/** Native constraint proof only. Caller owns the authenticated portable-fixture lifecycle.
 * No connection creation, schema changes, trigger disabling, installer or application env access.
 */
export async function verifyT30SystemOwnershipConstraints(connection){
 const run=(sql,values=[])=>connection.query(sql,values),rows=async(sql,values=[])=>((await run(sql,values))[0]);
 const database=(await rows('SELECT DATABASE() AS name'))[0]?.name;
 assert.match(String(database),/^fixture_[a-f0-9]{8}_[a-z][a-z0-9_]{0,24}$/,'Only the already selected owned portable fixture database is permitted.');
 const prefix='t30-system-'+randomBytes(4).toString('hex'),id=name=>prefix+'-'+name,now=Date.now(),passed=[];
 const human=id('human'),former=id('former'),backup=id('backup'),seller=id('seller'),product=id('product'),otherProduct=id('other-product'),caseId=id('case'),taskId='priority-'+caseId,reported=id('reported'),triaged=id('triaged');
 const scalar=value=>typeof value==='bigint'?Number(value):value;
 const readCase=async()=>Object.fromEntries(Object.entries((await rows('SELECT * FROM product_priority_cases WHERE id=?',[caseId]))[0]).map(([key,value])=>[key,scalar(value)]));
 const readTask=async()=>Object.fromEntries(Object.entries((await rows('SELECT * FROM review_tasks WHERE id=?',[taskId]))[0]).map(([key,value])=>[key,scalar(value)]));
 // Each negative assertion uses a savepoint; failed multi-statement attempts leave no orphan receipt/task mutation.
 const reject=async(name,operation,pattern=/product_priority_case_revision/)=>{
  await run('SAVEPOINT t30_system_ownership_negative');
  try{await assert.rejects(operation,pattern,name);passed.push(name);}finally{await run('ROLLBACK TO SAVEPOINT t30_system_ownership_negative');await run('RELEASE SAVEPOINT t30_system_ownership_negative');}
 };
 await connection.beginTransaction();
 try{
  for(const user of [human,former,backup,seller])await run("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)",[user,user+'@local.hastabazaar.test','Fictional native ownership fixture',now,now]);
  for(const[user,role]of [[human,'super_admin'],[former,'admin'],[backup,'admin']])await run('INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,?,?)',[user,role,now]);
  for(const user of [former,backup])await run("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES(?,'[\"product.review\"]',1,?,?)",[user,human,now]);
  await run("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at) VALUES(?,?,'Fictional seller','Fictional shop','Local','FIX-REG','PAN','FIX-PAN','Fictional person','9800000000',?,'Bagmati','Kathmandu','Kathmandu','Ward1','FIX-BANK','approved',?,?)",[seller,seller,seller+'@local.hastabazaar.test',now,now]);
  const category=id('category');await run("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES(?,?,'Fictional',1,1,?,?)",[category,category,now,now]);
  for(const item of [product,otherProduct])await run("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES(?,?,?,?,?,'Fictional product','Fictional',10000,1,'Maker','NP','Clay','submitted',?,?)",[item,seller,category,item,item,now,now]);
  const productBefore=(await rows('SELECT * FROM products WHERE id=?',[product]))[0];
  await run("INSERT INTO product_priority_events(id,case_id,product_id,revision,kind,actor_id,detail_json,created_at) VALUES(?,?,?,0,'reported',?,?,?)",[reported,caseId,product,seller,JSON.stringify({note:'Fictional native constraint report'}),now]);
  await run("INSERT INTO product_priority_cases(id,product_id,kind,public_version_id,reported_by,state,active_slot,revision,last_event_id,created_at,updated_at) VALUES(?,?,'price_error',NULL,?,'open',1,0,?,?,?)",[caseId,product,seller,reported,now,now]);
  const originalTask=await readTask();assert.equal(originalTask.owner_id,null);assert.equal(Number(originalTask.revision),0);
  const nextUpdate=now+3_600_000,triageDetail={state:'open',ownerId:former,backupId:backup,backupUnavailableReason:'',nextUpdateAt:nextUpdate,note:'Actual human fixture triage with original promise'};
  await run("INSERT INTO product_priority_events(id,case_id,product_id,revision,kind,actor_id,detail_json,created_at) VALUES(?,?,?,1,'triaged',?,?,?)",[triaged,caseId,product,human,JSON.stringify(triageDetail),now+1]);
  await run('UPDATE review_tasks SET owner_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=0',[former,now+1,taskId]);
  await run("UPDATE product_priority_cases SET backup_id=?,backup_unavailable_reason='',next_update_at=?,triaged_at=?,last_event_id=?,revision=1,updated_at=? WHERE id=?",[backup,nextUpdate,now+1,triaged,now+1,caseId]);
  const before=await readCase(),beforeTask=await readTask();assert.equal(before.backup_id,backup);assert.equal(Number(before.revision),1);passed.push('original human triage remains valid');
  const nativePriority={id:caseId,productId:product,previousRevision:1,revision:2,lastHumanEventId:triaged,state:'open',triagedAt:now+1,nextUpdateAt:nextUpdate,backupId:null,backupUnavailableReason:'Current coverage needs a separate eligible backup'};
  const base={taskId,revision:2,ownerId:backup,previousOwnerId:former,sourceRevision:caseId,sourceType:'product_priority',sourceId:caseId,reason:'Automatic responsibility reconciliation after actual access loss',system:true,nativePriority};
  const receipt=async(detail,actor=null,suffix='proof')=>{
   const requestId=id(suffix),key=createHash('sha256').update(JSON.stringify(['review-task-coverage',requestId,taskId,1])).digest('hex');
   await run("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,created_at,command_key,command_digest,command_result_json) VALUES(?,?,'review_task.coverage_rerouted','review_task',?,?,?,?,?,?)",[requestId,actor,taskId,requestId,now+2,key,key,JSON.stringify(detail)]);return requestId;
  };
  const moveTask=()=>run('UPDATE review_tasks SET owner_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=1',[backup,now+2,taskId]);
  const updateCase=(changes={})=>{
   const values={revision:2,backup_id:null,backup_unavailable_reason:nativePriority.backupUnavailableReason,updated_at:now+2,...changes};
   for(const key of Object.keys(values))assert.match(key,/^[a-z_]+$/);
   return run('UPDATE product_priority_cases SET '+Object.keys(values).map(key=>'`'+key+'`=?').join(',')+' WHERE id=?',[...Object.values(values),caseId]);
  };
  await reject('no receipt cannot authorize system ownership',async()=>{await moveTask();await updateCase();});
  await reject('case-only write cannot bypass shared owner revision',async()=>{await receipt(base);await updateCase();});
  await reject('human-attributed receipt cannot authorize system ownership',async()=>{await moveTask();await receipt(base,human);await updateCase();});
  const mutations=[
   ['mismatched previous native revision',d=>{d.nativePriority.previousRevision=99;}],
   ['mismatched next native revision',d=>{d.nativePriority.revision=3;}],
   ['mismatched shared revision',d=>{d.revision=99;}],
   ['mismatched owner',d=>{d.ownerId=former;}],
   ['mismatched backup',d=>{d.nativePriority.backupId=backup;}],
   ['mismatched source',d=>{d.sourceId=id('other-case');}],
   ['case-only source type rejected',d=>{d.sourceType='PRODUCT_PRIORITY';}],
   ['case-only source identity rejected',d=>{d.sourceId=caseId.toUpperCase();}],
   ['trailing-space source identity rejected',d=>{d.sourceId=caseId+' ';}],
   ['case-only task identity rejected',d=>{d.taskId=taskId.toUpperCase();}],
   ['trailing-space task identity rejected',d=>{d.taskId=taskId+' ';}],
   ['case-only backup reason rejected',d=>{d.nativePriority.backupUnavailableReason=nativePriority.backupUnavailableReason.toUpperCase();}],
   ['trailing-space backup reason rejected',d=>{d.nativePriority.backupUnavailableReason+=' ';}],
   ['numeric system flag rejected',d=>{d.system=1;}],
   ['string system flag rejected',d=>{d.system='true';}],
   ['false system flag rejected',d=>{d.system=false;}],
  ];
  for(const[name,change]of mutations)await reject(name,async()=>{const detail=structuredClone(base);change(detail);await moveTask();await receipt(detail);await updateCase();});
  for(const[name,changes]of [
   ['system cannot change native state',{state:'waiting_seller'}],
   ['system cannot change triage time',{triaged_at:now+3}],
   ['system cannot change promised update',{next_update_at:nextUpdate+1}],
   ['system cannot replace last human event',{last_event_id:reported}],
   ['system cannot change original creation time',{created_at:now+1}],
   ['system cannot change product',{product_id:otherProduct}],
   ['system cannot change concern kind',{kind:'safety'}],
   ['system cannot change original reporter',{reported_by:human}],
   ['case-only native identity rejected',{id:caseId.toUpperCase()}],
   ['trailing-space native identity rejected',{id:caseId+' '}],
  ])await reject(name,async()=>{const detail=structuredClone(base);for(const [column,jsonKey]of [['state','state'],['triaged_at','triagedAt'],['next_update_at','nextUpdateAt'],['last_event_id','lastHumanEventId'],['product_id','productId']])if(column in changes)detail.nativePriority[jsonKey]=changes[column];await moveTask();await receipt(detail);await updateCase(changes);});
  assert.deepEqual(await readCase(),before);assert.deepEqual(await readTask(),beforeTask);
  // This is a real NULL-actor maintenance receipt; the initiating human is not represented as its executor.
  await run("UPDATE staff_permission_profiles SET permissions_json='[]',version=version+1,updated_at=? WHERE user_id=?",[now+2,former]);
  const currentPermissions=(await rows('SELECT permissions_json AS permissions FROM staff_permission_profiles WHERE user_id=?',[former]))[0].permissions;assert.deepEqual(typeof currentPermissions==='string'?JSON.parse(currentPermissions):currentPermissions,[]);
  await moveTask();const systemReceipt=await receipt(base,null,'accepted');await updateCase();
  const after=await readCase(),afterTask=await readTask();assert.equal(afterTask.owner_id,backup);assert.equal(Number(afterTask.revision),2);assert.equal(Number(after.revision),2);assert.equal(after.backup_id,null);
  for(const field of ['id','product_id','kind','public_version_id','reported_by','state','active_slot','triaged_at','next_update_at','last_event_id','created_at'])assert.equal(after[field],before[field],field);
  for(const field of ['source_type','source_id','source_revision','started_at','due_at','calendar_version','has_deadline'])assert.equal(afterTask[field],originalTask[field],field);
  assert.deepEqual((await rows('SELECT * FROM products WHERE id=?',[product]))[0],productBefore);
  assert.equal(Number((await rows('SELECT COUNT(*) AS count FROM product_priority_events WHERE case_id=?',[caseId]))[0].count),2);
  const stored=(await rows('SELECT actor_id,command_result_json FROM audit_logs WHERE id=?',[systemReceipt]))[0];assert.equal(stored.actor_id,null);const storedDetail=typeof stored.command_result_json==='string'?JSON.parse(stored.command_result_json):stored.command_result_json;assert.equal(storedDetail.system,true);passed.push('valid system ownership preserves original business facts and human history');
  for(const[name,column,value]of [
   ['receipt actor immutable','actor_id',human],['receipt action immutable','action','review_task.assigned'],['receipt action case immutable','action','REVIEW_TASK.COVERAGE_REROUTED'],['receipt action trailing space immutable','action','review_task.coverage_rerouted '],['receipt subject immutable','subject_id',id('other-task')],['receipt subject case immutable','subject_id',taskId.toUpperCase()],['receipt subject trailing space immutable','subject_id',taskId+' '],['receipt request immutable','request_id',id('other-request')],['receipt creation time immutable','created_at',now+3],['receipt key immutable','command_key','f'.repeat(64)],['receipt digest immutable','command_digest','e'.repeat(64)],['receipt result immutable','command_result_json',JSON.stringify({...base,ownerId:former})],['receipt result whitespace immutable','command_result_json',JSON.stringify(base,null,2)],
  ])await reject(name,()=>run('UPDATE audit_logs SET `'+column+'`=? WHERE id=?',[value,systemReceipt]),/review_task_system_ownership_receipt_immutable|command_receipt_immutable/);
  await reject('system receipt retained',()=>run('DELETE FROM audit_logs WHERE id=?',[systemReceipt]),/review_task_system_ownership_receipt_retained|command_receipt_retained/);
  const resolved=id('resolved'),resolution={state:'resolved',ownerId:backup,backupId:null,backupUnavailableReason:'',nextUpdateAt:null,note:'Actual separate human fixture resolution'};
  await run("INSERT INTO product_priority_events(id,case_id,product_id,revision,kind,actor_id,detail_json,created_at) VALUES(?,?,?,3,'resolved',?,?,?)",[resolved,caseId,product,backup,JSON.stringify(resolution),now+3]);
  await run('UPDATE review_tasks SET owner_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=2',[backup,now+3,taskId]);
  await run("UPDATE product_priority_cases SET state='resolved',active_slot=NULL,revision=3,backup_id=NULL,backup_unavailable_reason='',next_update_at=NULL,last_event_id=?,updated_at=? WHERE id=?",[resolved,now+3,caseId]);
  const final=await readCase();assert.equal(final.state,'resolved');assert.equal(final.last_event_id,resolved);assert.equal(final.triaged_at,before.triaged_at);assert.equal(final.created_at,before.created_at);assert.equal(Number((await rows('SELECT COUNT(*) AS count FROM product_priority_events WHERE case_id=?',[caseId]))[0].count),3);passed.push('original human resolution remains valid after system ownership');
  await connection.commit();
  return{status:'PASS',database,passed,checks:passed.length,actualNativeSql:true,guardsDisabled:false,systemActor:null,humanTriagePreserved:true,humanResolutionPreserved:true,systemFactsPreserved:['case identity','original first seen','triage time','promised update','last human event','product facts','shared source clocks'],fixtureIds:{caseId,taskId,systemReceipt}};
 }catch(error){await connection.rollback();throw error;}
}
