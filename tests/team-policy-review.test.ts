import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance,getTeamWorkspace} from '../lib/operations/team-governance';
void test('explicit policy review retains the exact original version and due time; assigned staff completion publishes nothing',async()=>{
 const f=await completeVersionFixture(Date.now());try{
 const before=f.sqlite.prepare('SELECT id,value_json,status,revision FROM business_setting_versions ORDER BY id').all();
 const scheduled=await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'calendar-review',expectedRevision:null,now:f.now},{action:'schedule_policy_review',sourceId:'service_calendar',toUserId:'delegate',endsAt:f.now+86400000,reason:'Ask the actual assigned coordinator to review the approved current calendar without changing it.'}) as {id:string};
 const source=f.sqlite.prepare('SELECT created_at,due_at,source_reference_json FROM team_governance_tasks WHERE id=?').get(scheduled.id)!;assert.equal(JSON.parse(String(source.source_reference_json)).version,'continuous-v1');
 const own=await getTeamWorkspace(f.db,'delegate');assert.equal(own.mode,'own');assert.ok(own.policyTasks.some(task=>task.id===scheduled.id));assert.equal('people' in own,false);
 await executeTeamGovernance(f.db,{actorId:'delegate',requestId:'calendar-reviewed',expectedRevision:'0',now:f.now+1},{action:'complete_policy_review',sourceId:scheduled.id,nextAction:'Retain continuous coverage. Any future fixed calendar requires its own explicit prospective publication and impact review.',reason:'Record the actual review recommendation; this does not change any calendar or deadline.'});
 const after=f.sqlite.prepare('SELECT created_at,due_at,source_reference_json,state FROM team_governance_tasks WHERE id=?').get(scheduled.id)!;assert.equal(after.created_at,source.created_at);assert.equal(after.due_at,source.due_at);assert.equal(after.source_reference_json,source.source_reference_json);assert.equal(after.state,'completed');
 assert.deepEqual(f.sqlite.prepare('SELECT id,value_json,status,revision FROM business_setting_versions ORDER BY id').all(),before);
 }finally{f.dispose();}
});
