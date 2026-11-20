import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance,getTeamWorkspace,readTeamDutyCoverage,processTeamGovernanceDue} from '../lib/operations/team-governance';
void test('work access turns off immediately while buyer account, original task clock and owned coverage follow-up survive',async()=>{
 const f=await completeVersionFixture(Date.now());try{
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('delegate','customer',?)").run(f.now);
 const ctx=(requestId:string,expectedRevision:string|null=null)=>({actorId:'reviewer',requestId,expectedRevision,now:f.now});
 await executeTeamGovernance(f.db,ctx('offboard-roster'),{action:'save_duty',sourceId:'products',primaryId:'delegate',backupIds:['reviewer'],reason:'The genuine existing reviewer covers this actual product responsibility.'});
 await executeTeamGovernance(f.db,ctx('offboard-procedure'),{action:'publish_procedure',sourceId:'products',title:'Retained exact review procedure',body:'Use the original source evidence, permission and decision action. Keep all original service clocks and histories.',userIds:['delegate'],reason:'Create a genuine original personal procedure task before work access is removed.'});
 await processTeamGovernanceDue(f.db,{now:f.now,limit:50});
 const original=f.sqlite.prepare("SELECT id,started_at,due_at,calendar_version FROM review_tasks WHERE source_type='team_governance' AND owner_id='delegate' LIMIT 1").get()!;assert.ok(original);
 await executeTeamGovernance(f.db,ctx('offboard-native','1'),{action:'offboard_staff',sourceId:'delegate',reason:'Remove work authority now without disabling or deleting the original buyer account.'});
 assert.equal(f.sqlite.prepare("SELECT status FROM users WHERE id='delegate'").get()!.status,'active');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id='delegate' AND role='admin'").get()!.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id='delegate' AND role='customer'").get()!.n,1);
 await assert.rejects(getTeamWorkspace(f.db,'delegate'));assert.equal((await readTeamDutyCoverage(f.db,'products',{now:f.now})).activeOwnerId,'reviewer');
 const after=f.sqlite.prepare('SELECT started_at,due_at,calendar_version FROM review_tasks WHERE id=?').get(original.id)!;assert.deepEqual({...after},{started_at:original.started_at,due_at:original.due_at,calendar_version:original.calendar_version});
 assert.ok(f.sqlite.prepare("SELECT id FROM team_governance_tasks WHERE kind='access_change' AND subject_user_id='delegate' AND state='open'").get());
 await assert.rejects(executeTeamGovernance(f.db,ctx('last-super-offboard','0'),{action:'offboard_staff',sourceId:'reviewer',reason:'An ordinary work edit must not remove the last usable Super Admin.'}));assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").get()!.n,1);
 }finally{f.dispose();}
});
