import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {proposeStaffPermissions} from '../lib/db/repositories/staff-permissions';
import {processReminderDispatch} from '../lib/operations/reminder-dispatch';

void test('shared scheduled dispatch resumes a committed access obligation after postcommit worker failure within its total budget',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  const unavailableWorker={prepare(sql:string){if(sql.includes('operational_reminder_cursors'))throw new Error('Fictional maintenance outage');return f.db.prepare(sql);},batch:f.db.batch.bind(f.db)} as D1Database;
  await proposeStaffPermissions(unavailableWorker,{actorId:'reviewer',userId:'delegate',permissions:[],version:1,reason:'Revoke access now even though immediate background reconciliation is unavailable.',now:f.now});
  const impact=f.sqlite.prepare("SELECT id,state FROM team_governance_tasks WHERE kind='access_change' AND subject_user_id='delegate'").get()!;
  assert.equal(impact.state,'open');
  assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'[]');
  f.sqlite.prepare("INSERT INTO operational_reminder_cursors(family,cursor) VALUES('dispatch','team_access')").run();
  const expired=await processReminderDispatch(f.db,{now:f.now,limit:1,deadlineMs:Date.now()-1});
  assert.equal(expired.scanned,0);
  const result=await processReminderDispatch(f.db,{now:f.now,limit:1});
  assert.ok(result.scanned<=1);assert.deepEqual(result.failures,[]);
  assert.equal(f.sqlite.prepare('SELECT state FROM team_governance_tasks WHERE id=?').get(impact.id)!.state,'completed');
  assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'[]');
 }finally{f.dispose();}
});
