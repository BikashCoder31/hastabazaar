import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';

async function governance(){const path='../lib/operations/team-governance';const loadedFixtureModule=await import(path).catch(()=>null);assert.equal(typeof loadedFixtureModule?.executeTeamGovernance,'function','guarded Team governance commands required');return loadedFixtureModule!;}
void test('ordered coverage cannot grant access or make sole primary its own absence backup',async()=>{
 const g=await governance(),f=await completeVersionFixture();try{
 const ctx=(requestId:string,revision:string|null=null)=>({actorId:'reviewer',requestId,expectedRevision:revision,now:f.now});
 await assert.rejects(g.executeTeamGovernance(f.db,ctx('reject-unprivileged-finance'),{action:'save_duty',sourceId:'finance_payout',primaryId:'reviewer',backupIds:['delegate'],reason:'An available account without Finance authority must never become eligible cover.'}));
 await g.executeTeamGovernance(f.db,ctx('save-finance'),{action:'save_duty',sourceId:'finance_payout',primaryId:'reviewer',backupIds:[],reason:'Record the actual fictional primary and show the missing qualified backup.'});
 let coverage=await g.readTeamDutyCoverage(f.db,'finance_payout',{now:f.now});assert.equal(coverage.activeOwnerId,'reviewer');assert.equal(coverage.backups.length,0);
 await assert.rejects(g.executeTeamGovernance(f.db,ctx('self-backup','0'),{action:'save_duty',sourceId:'finance_payout',primaryId:'reviewer',backupIds:['reviewer'],reason:'A duplicate primary cannot cover its own absence.'}));
 await g.executeTeamGovernance(f.db,ctx('absence'),{action:'availability',sourceId:'reviewer',startsAt:f.now,endsAt:f.now+3600000,available:false,reason:'Record a real fictional absence without revoking staff access.'});
 coverage=await g.readTeamDutyCoverage(f.db,'finance_payout',{now:f.now});assert.equal(coverage.activeOwnerId,null);assert.ok(coverage.gaps.length);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").get()!.n,1);
 const own=await g.getTeamWorkspace(f.db,'delegate',{now:f.now});assert.equal(own.mode,'own');assert.equal('people' in own,false);await assert.rejects(g.getTeamWorkspace(f.db,'customer',{now:f.now}));
 }finally{f.dispose();}
});

void test('availability corrections retain old absence history while restoring actual cover using the latest applicable version',async()=>{
 const g=await governance(),f=await completeVersionFixture(Date.now());try{
 const ctx=(requestId:string,revision:string|null=null)=>({actorId:'reviewer',requestId,expectedRevision:revision,now:f.now});
 await g.executeTeamGovernance(f.db,ctx('availability-roster'),{action:'save_duty',sourceId:'products',primaryId:'reviewer',backupIds:[],reason:'Retain the sole real fictional coverage record.'});
 const input={action:'availability',sourceId:'reviewer',startsAt:f.now,endsAt:f.now+3600000,available:false,reason:'Record the actual original short absence interval.'};
 await g.executeTeamGovernance(f.db,ctx('availability-away'),input);assert.equal((await g.readTeamDutyCoverage(f.db,'products',{now:f.now})).activeOwnerId,null);
 await g.executeTeamGovernance(f.db,ctx('availability-return','0'),{...input,available:true,reason:'The same person returned early; preserve the original absence fact and its correction.'});
 assert.equal((await g.readTeamDutyCoverage(f.db,'products',{now:f.now})).activeOwnerId,'reviewer');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_availability WHERE user_id='reviewer'").get()!.n,2);
 }finally{f.dispose();}
});

void test('Nepal appointments and access reviews are owned tasks with immutable due clocks and explicit completion',async()=>{
 const g=await governance(),f=await completeVersionFixture(Date.parse('2026-11-03T09:00:00Z'));try{
 const ctx=(requestId:string,revision:string|null=null)=>({actorId:'reviewer',requestId,expectedRevision:revision,now:f.now});
 await g.executeTeamGovernance(f.db,ctx('daily-roster'),{action:'save_duty',sourceId:'finance_payout',primaryId:'reviewer',backupIds:[],reason:'Map the genuine fictional daily Finance appointment owner.'});
 assert.equal(typeof g.processTeamGovernanceDue,'function');await g.processTeamGovernanceDue(f.db,{now:f.now,limit:50});
 const checkpoint=f.sqlite.prepare("SELECT id,due_at FROM team_checkpoints WHERE kind='payout_queue'").get()!;assert.equal(checkpoint.due_at,Date.parse('2026-11-03T08:15:00Z'));
 await g.executeTeamGovernance(f.db,ctx('complete-payout-review','0'),{action:'complete_checkpoint',sourceId:String(checkpoint.id),nextAction:'No instruction is executed by this review; retain separate bank approval and actual completion.',reason:'Reviewed the real queue and recorded its supported next action.'});
 assert.equal(f.sqlite.prepare('SELECT due_at FROM team_checkpoints WHERE id=?').get(checkpoint.id)!.due_at,checkpoint.due_at);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_tasks WHERE kind='checkpoint' AND source_id=? AND state='open'").get(checkpoint.id)!.n,0);
 await g.executeTeamGovernance(f.db,ctx('review-delegate','1'),{action:'complete_access_review',sourceId:'delegate',reason:'Reviewed the exact native version and current legitimate product duties.'});
 await g.processTeamGovernanceDue(f.db,{now:f.now+86400000,limit:50});
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_tasks WHERE kind='access_review' AND subject_user_id='delegate' AND state='open' AND due_at<=?").get(f.now+86400000)!.n,0);
 }finally{f.dispose();}
});

void test('coverage command rejects authority-at-commit race and replays one saved outcome',async()=>{
 const g=await governance(),f=await completeVersionFixture();try{
 const ctx={actorId:'reviewer',requestId:'coverage-once',expectedRevision:null,now:f.now},input={action:'save_duty',sourceId:'products',primaryId:'delegate',backupIds:[],reason:'Use the exact currently granted product review scope.'};
 const first=await g.executeTeamGovernance(f.db,ctx,input);assert.deepEqual(await g.executeTeamGovernance(f.db,ctx,input),first);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_events WHERE request_id='coverage-once'").get()!.n,1);
 f.setBeforeBatch(()=>{f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();});
 await assert.rejects(g.executeTeamGovernance(f.db,{...ctx,requestId:'revoked-race',expectedRevision:'0'},{...input,primaryId:null}));
 assert.equal(f.sqlite.prepare("SELECT primary_user_id FROM team_duties WHERE id='products'").get()!.primary_user_id,'delegate');
 }finally{f.dispose();}
});

void test('planned handoff stays pending until actual eligible substitute accepts; no access or task clock changes',async()=>{
 const g=await governance(),f=await completeVersionFixture(Date.now());try{
 const ctx=(requestId:string,expectedRevision:string|null=null,actorId='reviewer')=>({actorId,requestId,expectedRevision,now:f.now});
 await g.executeTeamGovernance(f.db,ctx('handoff-roster'),{action:'save_duty',sourceId:'products',primaryId:'reviewer',backupIds:['delegate'],reason:'Map an actual currently eligible product backup.'});
 const h=await g.executeTeamGovernance(f.db,ctx('handoff-propose','0'),{action:'propose_handoff',sourceId:'products',toUserId:'delegate',startsAt:f.now,endsAt:f.now+86400000,reason:'A planned substitute must explicitly accept this responsibility.'});
 assert.equal((await g.readTeamDutyCoverage(f.db,'products',{now:f.now})).activeOwnerId,'reviewer');
 await assert.rejects(g.executeTeamGovernance(f.db,ctx('wrong-accept','0','reviewer'),{action:'accept_handoff',sourceId:h.id,reason:'The original primary cannot accept for the substitute.'}));
 await g.executeTeamGovernance(f.db,ctx('handoff-accept','0','delegate'),{action:'accept_handoff',sourceId:h.id,reason:'I confirm receipt of the actual product review duty.'});
 assert.equal((await g.readTeamDutyCoverage(f.db,'products',{now:f.now})).activeOwnerId,'delegate');
 assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'["product.review"]');
 }finally{f.dispose();}
});

void test('published staff procedures require exact version acknowledgment without granting permission or completing business decisions',async()=>{
 const g=await governance(),f=await completeVersionFixture();try{
 const ctx=(requestId:string,expectedRevision:string|null=null,actorId='reviewer')=>({actorId,requestId,expectedRevision,now:f.now});
 const v1=await g.executeTeamGovernance(f.db,ctx('procedure-v1'),{action:'publish_procedure',sourceId:'products',title:'Actual product review procedure',body:'Read the original submitted evidence and use the protected product review action; publication requires its own authority.',userIds:['delegate'],reason:'Publish the exact staff procedure for its assigned reader.'});
 await g.executeTeamGovernance(f.db,ctx('procedure-ack',null,'delegate'),{action:'acknowledge_procedure',sourceId:v1.id,reason:'I read this exact original procedure version.'});
 const v2=await g.executeTeamGovernance(f.db,ctx('procedure-v2','1'),{action:'publish_procedure',sourceId:'products',title:'Updated product review procedure',body:'Retain the original submission clock and review real selected variants before any separate protected publication decision.',userIds:['delegate'],reason:'Publish a material procedure change as a new immutable version.'});
 const own=await g.getTeamWorkspace(f.db,'delegate',{now:f.now});assert.equal(own.procedures.find((p:{id:string})=>p.id===v2.id).acknowledgedAt,null);
 assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'["product.review"]');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM team_procedure_assignments WHERE acknowledged_at IS NOT NULL').get()!.n,1);
 }finally{f.dispose();}
});
