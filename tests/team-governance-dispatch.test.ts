import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance,processTeamGovernanceDue} from '../lib/operations/team-governance';
void test('one-source slices retain fair durable cursors across later users, procedure assignments and shared task materialization',async()=>{
 const f=await completeVersionFixture(Date.now());try{
 for(let index=0;index<6;index++){const id='tail-staff-'+index;f.sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)").run(id,id+'@local.hastabazaar.test','Fictional '+id,f.now,f.now);f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'admin',?)").run(id,f.now);f.sqlite.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES(?,'[]',1,'reviewer',?)").run(id,f.now);}
 const publication=await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'dispatch-procedures',expectedRevision:null,now:f.now},{action:'publish_procedure',sourceId:'products',title:'Current exact review instructions',body:'Retain original review clocks and use only the actual protected evidence and action authority.',userIds:['delegate',...Array.from({length:6},(_,index)=>'tail-staff-'+index)],reason:'Assign actual fictional staff readers without granting any new work access.'}) as {id:string};
 for(let scan=0;scan<60;scan++){const result=await processTeamGovernanceDue(f.db,{now:f.now,limit:1,deadlineMs:Date.now()+5000});assert.ok(result.scanned<=1,'limit bounds all discovered/ensured source work, not each query independently');assert.deepEqual(result.failures,[]);}
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_tasks WHERE kind='access_review' AND subject_user_id LIKE 'tail-staff-%'").get()!.n,6);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_tasks WHERE kind='procedure_ack' AND source_id LIKE ?").get(publication.id+':%')!.n,7);
 assert.ok(Number(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='team_governance'").get()!.n)>=13);
 assert.ok(f.sqlite.prepare("SELECT `cursor` FROM operational_reminder_cursors WHERE family='team.scan.access'").get());
 const expired=await processTeamGovernanceDue(f.db,{now:f.now,limit:1,deadlineMs:Date.now()-1});assert.equal(expired.scanned,0);assert.equal(expired.budgetExhausted,true);
 }finally{f.dispose();}
});
