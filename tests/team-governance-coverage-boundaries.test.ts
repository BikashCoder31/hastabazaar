import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance,processTeamGovernanceDue} from '../lib/operations/team-governance';
import {assignReviewTask,ensureReviewTask,reconcileReviewTaskCoverage} from '../lib/workflows/review-tasks';
import {saveCompanyAccountDraft,submitCompanyAccountForReview} from '../lib/payments/company-accounts';
import {companyDetails} from '../lib/content/company-details';

function interruptedWorker(db:D1Database){return {prepare(sql:string){if(sql.includes('operational_reminder_cursors'))throw new Error('Fictional postcommit worker interruption');return db.prepare(sql);},batch:db.batch.bind(db)}as D1Database;}
async function unavailable(f:Awaited<ReturnType<typeof completeVersionFixture>>){await executeTeamGovernance(interruptedWorker(f.db),{actorId:'reviewer',requestId:'boundary-absence',expectedRevision:null,now:f.now},{action:'availability',sourceId:'delegate',available:false,startsAt:f.now,endsAt:f.now+3600000,reason:'Record actual temporary unavailability while independent scheduled maintenance resumes later.'});}

void test('manual governance assignment preserves the exact duty scope and rejects its removal at commit',async()=>{
 for(const mode of ['outside','removed_at_commit']as const){const f=await completeVersionFixture(Date.now());try{
  f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='[\"payout.prepare\"]' WHERE user_id='delegate'").run();
  f.sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('other-finance','other-finance@local.hastabazaar.test','Fictional other Finance','active',?,?)").run(f.now,f.now);
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('other-finance','admin',?)").run(f.now);
  f.sqlite.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('other-finance','[\"payout.prepare\"]',1,'reviewer',?)").run(f.now);
  await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'manual-duty',expectedRevision:null,now:f.now},{action:'save_duty',sourceId:'finance_payout',primaryId:'delegate',backupIds:mode==='removed_at_commit'?['other-finance']:[],reason:'Use only this exact approved payout checkpoint coverage, not generic Finance membership.'});
  await processTeamGovernanceDue(f.db,{now:f.now,limit:50});
  const task=f.sqlite.prepare("SELECT t.id,t.revision,t.owner_id,t.started_at,t.due_at FROM review_tasks t JOIN team_governance_tasks g ON g.id=t.source_id WHERE g.kind='checkpoint' AND g.duty_id='finance_payout'").get()!;assert.ok(task);
  const originalBatch=f.db.batch.bind(f.db),direct={prepare:f.db.prepare.bind(f.db),batch:originalBatch}as D1Database;let raced=false;
  if(mode==='removed_at_commit')f.db.batch=async statements=>{if(!raced){raced=true;await executeTeamGovernance(direct,{actorId:'reviewer',requestId:'remove-checkpoint-backup',expectedRevision:'0',now:f.now},{action:'save_duty',sourceId:'finance_payout',primaryId:'delegate',backupIds:[],reason:'Remove the former exact duty backup before the queued assignment commits.'});}return originalBatch(statements);};
  await assert.rejects(assignReviewTask(f.db,{actorId:'reviewer',requestId:'manual-invalid-'+mode,expectedRevision:String(task.revision),now:f.now},{taskId:String(task.id),ownerId:'other-finance',reason:'An eligible Finance capability alone must not grant this separate native checkpoint assignment.'}),/permission|constraint|guard|scope/i,mode);
  assert.equal(raced,mode==='removed_at_commit');
  assert.deepEqual({...f.sqlite.prepare('SELECT id,revision,owner_id,started_at,due_at FROM review_tasks WHERE id=?').get(task.id)!},{...task});
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=?').get('manual-invalid-'+mode)!.n,0);
 }finally{f.dispose();}}
});

void test('automatic governance checkpoint coverage cannot assign ordinary staff outside its exact current duty scope',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='[\"payout.prepare\"]' WHERE user_id='delegate'").run();
  f.sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('other-finance','other-finance@local.hastabazaar.test','Fictional other Finance','active',?,?)").run(f.now,f.now);
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('other-finance','admin',?)").run(f.now);
  f.sqlite.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('other-finance','[\"payout.prepare\"]',1,'reviewer',?)").run(f.now);
  for(const [sourceId,primaryId] of [['finance_preparation','other-finance'],['finance_payout','delegate']])await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'boundary-'+sourceId,expectedRevision:null,now:f.now},{action:'save_duty',sourceId,primaryId,backupIds:[],reason:'Record this actual distinct Finance duty owner; equal capability does not add them to another duty.'});
  await processTeamGovernanceDue(f.db,{now:f.now,limit:50});
  const task=f.sqlite.prepare("SELECT t.id,t.started_at,t.due_at,t.calendar_version FROM review_tasks t JOIN team_governance_tasks g ON g.id=t.source_id WHERE t.source_type='team_governance' AND g.kind='checkpoint' AND g.duty_id='finance_payout'").get()!;assert.ok(task);
  await unavailable(f);
  const result=await reconcileReviewTaskCoverage(f.db,{taskId:String(task.id),formerOwnerId:'delegate',now:f.now});
  assert.equal(result.state,'gap');assert.equal(result.ownerId,null);assert.equal(f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(task.id)!.owner_id,null);
  const saved=f.sqlite.prepare('SELECT started_at,due_at,calendar_version FROM review_tasks WHERE id=?').get(task.id)!;assert.deepEqual({...saved},{started_at:task.started_at,due_at:task.due_at,calendar_version:task.calendar_version});
 }finally{f.dispose();}
});

void test('a stable empty personal acknowledgment coverage gap creates no second revision receipt or notice',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  const procedure=await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'boundary-procedure',expectedRevision:null,now:f.now},{action:'publish_procedure',sourceId:'products',title:'Exact personal reading assignment',body:'Read the current assigned version; this acknowledgment cannot be reassigned or change a business decision.',userIds:['delegate'],reason:'Assign the actual staff reader a version-specific personal acknowledgment.'});
  assert.ok(procedure!==null&&typeof procedure==='object'&&'id'in procedure&&typeof procedure.id==='string');
  await processTeamGovernanceDue(f.db,{now:f.now,limit:50});
  const task=f.sqlite.prepare("SELECT t.id,t.started_at,t.due_at,t.calendar_version FROM review_tasks t JOIN team_governance_tasks g ON g.id=t.source_id WHERE t.source_type='team_governance' AND g.kind='procedure_ack' AND g.source_id=?").get(procedure.id+':delegate')!;assert.ok(task);
  await unavailable(f);
  const first=await reconcileReviewTaskCoverage(f.db,{taskId:String(task.id),formerOwnerId:'delegate',now:f.now});assert.equal(first.state,'gap');assert.equal(first.changed,true);
  const snapshot=()=>({task:f.sqlite.prepare('SELECT owner_id,revision,started_at,due_at,calendar_version FROM review_tasks WHERE id=?').get(task.id),receipts:f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE subject_id=? AND action='review_task.coverage_rerouted'").get(task.id)!.n,notices:f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.workflow.assignment'").get()!.n});
  const before=snapshot(),second=await reconcileReviewTaskCoverage(f.db,{taskId:String(task.id),formerOwnerId:'',now:f.now});
  assert.equal(second.state,'gap');assert.equal(second.changed,false);assert.deepEqual(snapshot(),before);
  assert.equal(f.sqlite.prepare('SELECT acknowledged_at FROM team_procedure_assignments WHERE procedure_id=? AND user_id=?').get(procedure.id,'delegate')!.acknowledged_at,null);
 }finally{f.dispose();}
});

void test('company-account absence uses explicit identity-bank coverage while excluding ordinary or personally conflicted staff',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  for(const id of ['bank-conflict','bank-cover']){f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES(?,?,?,?,'active',?,?)").run(id,id,id+'@local.hastabazaar.test','Fictional '+id,f.now,f.now);f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',?)").run(id,f.now);}
  await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'bank-duty',expectedRevision:null,now:f.now},{action:'save_duty',sourceId:'identity_bank',primaryId:'reviewer',backupIds:['bank-conflict','bank-cover'],reason:'Record actual eligible reserved bank review cover, retaining native source-party exclusion.'});
  await assert.rejects(executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'bank-ordinary',expectedRevision:'0',now:f.now},{action:'save_duty',sourceId:'identity_bank',primaryId:'delegate',backupIds:['reviewer'],reason:'An ordinary department assignment must not grant reserved bank review authority.'}));
  const account=await saveCompanyAccountDraft(f.db,{actorId:'reviewer',requestId:'bank-draft',expectedRevision:null,now:f.now},{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional Bank',branch:'Fictional Branch',accountNumber:'FICTIONAL-COVERAGE-001',currency:'NPR',purpose:'both'},evidenceReference:'FICTIONAL-PRIVATE-BANK-COVERAGE',conflictUserIds:['bank-conflict'],reason:'Record a fictional bank account with its actual declared reviewer conflict.'});
  assert.ok(account!==null&&typeof account==='object'&&'versionId'in account&&typeof account.versionId==='string');
  await submitCompanyAccountForReview(f.db,{actorId:'reviewer',requestId:'bank-submit',expectedRevision:'0',now:f.now},{versionId:account.versionId,reason:'Submit this exact company account for independent native bank ownership review.'});
  const taskId=await ensureReviewTask(f.db,{sourceType:'company_account',sourceId:account.versionId,now:f.now});
  await assignReviewTask(f.db,{actorId:'reviewer',requestId:'bank-own',expectedRevision:'0',now:f.now},{taskId,ownerId:'reviewer',reason:'The currently eligible original Super Admin owns this exact pending bank review.'});
  const original=f.sqlite.prepare('SELECT started_at,due_at,calendar_version FROM review_tasks WHERE id=?').get(taskId);
  await executeTeamGovernance(interruptedWorker(f.db),{actorId:'reviewer',requestId:'bank-absence',expectedRevision:null,now:f.now},{action:'availability',sourceId:'reviewer',available:false,startsAt:f.now,endsAt:f.now+3600000,reason:'Unplanned primary absence needs actual reserved and independent bank coverage.'});
  const result=await reconcileReviewTaskCoverage(f.db,{taskId,formerOwnerId:'reviewer',now:f.now});
  assert.equal(result.ownerId,'bank-cover');assert.equal(result.state,'settled');
  assert.deepEqual(f.sqlite.prepare('SELECT started_at,due_at,calendar_version FROM review_tasks WHERE id=?').get(taskId),original);
  assert.equal(f.sqlite.prepare('SELECT status FROM company_payment_account_versions WHERE id=?').get(account.versionId)!.status,'awaiting_verification');
 }finally{f.dispose();}
});
