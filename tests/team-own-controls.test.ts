import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance,getTeamWorkspace,processTeamGovernanceDue} from '../lib/operations/team-governance';
import {getTeamTaskDestination} from '../lib/operations/team-task-destination';
import {proposeStaffPermissions} from '../lib/db/repositories/staff-permissions';
void test('sole eligible Super Admin can acknowledge their own exact assigned staff procedure from the full workspace',async()=>{
 const f=await completeVersionFixture();try{
 const procedure=await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'sa-own-procedure',expectedRevision:null,now:f.now},{action:'publish_procedure',sourceId:'products',title:'Exact internal review instructions',body:'Use the protected original action and preserve every native evidence and decision boundary.',userIds:['reviewer'],reason:'Assign the exact procedure to the same eligible Super Admin who performs this duty.'}) as {id:string};
 let model=await getTeamWorkspace(f.db,'reviewer');assert.equal(model.mode,'full');if(model.mode!=='full')throw new Error('Full workspace required');assert.equal(model.myProcedures.find(value=>value.id===procedure.id)!.acknowledgedAt,null);
 await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'sa-own-ack',expectedRevision:null,now:f.now+1},{action:'acknowledge_procedure',sourceId:procedure.id,reason:'I have read the exact currently assigned staff procedure version.'});
 model=await getTeamWorkspace(f.db,'reviewer');if(model.mode!=='full')throw new Error('Full workspace required');assert.equal(model.myProcedures.find(value=>value.id===procedure.id)!.acknowledgedAt,f.now+1);
 }finally{f.dispose();}
});
void test('ordinary assigned Finance owner reaches the original checkpoint control without bank execution authority',async()=>{
 const realNow=Date.now(),offset=20700000,day=86400000,now=Math.floor((realNow+offset)/day)*day-offset-day+16*3600000,f=await completeVersionFixture(now);try{
 await proposeStaffPermissions(f.db,{actorId:'reviewer',userId:'delegate',permissions:['payout.prepare'],version:1,reason:'Grant only actual Finance preparation scope, not outgoing payment authority.',now,requestId:'own-finance-grant'});
 await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'own-finance-roster',expectedRevision:null,now},{action:'save_duty',sourceId:'finance_payout',primaryId:'delegate',backupIds:['reviewer'],reason:'Record the actual Finance queue review owner and eligible backup.'});
 await processTeamGovernanceDue(f.db,{now,limit:50});
 const native=f.sqlite.prepare("SELECT id,revision FROM team_governance_tasks WHERE kind='checkpoint' LIMIT 1").get()!,shared=f.sqlite.prepare("SELECT id FROM review_tasks WHERE source_type='team_governance' AND source_id=?").get(native.id)!;
 const link=await getTeamTaskDestination(f.db,'delegate',String(shared.id));assert.match(link.href,/tab=calendar/);assert.match(link.href,/#checkpoint-/);
 const own=await getTeamWorkspace(f.db,'delegate',{now});assert.equal(own.mode,'own');assert.equal(own.checkpoints.length,1);assert.equal('people' in own,false);
 const checkpoint=own.checkpoints[0],checkpointId=checkpoint.id;assert.ok(typeof checkpointId==='string'&&checkpointId.length>0);await executeTeamGovernance(f.db,{actorId:'delegate',requestId:'own-finance-review',expectedRevision:String(checkpoint.revision),now},{action:'complete_checkpoint',sourceId:checkpointId,nextAction:'Review finished; actual financial instructions remain separately protected and unpaid here.',reason:'Record the actual queue check without confirming bank money.'});
 assert.equal(f.sqlite.prepare('SELECT completed_by FROM team_checkpoints WHERE id=?').get(checkpointId)!.completed_by,'delegate');assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'["payout.prepare"]');
 }finally{f.dispose();}
});
