import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance,getTeamWorkspace,readTeamDutyCoverage} from '../lib/operations/team-governance';
void test('recorded future absence exposes missing receipt; accepted cover and its cancellation retain original acknowledgment and corrections',async()=>{
 const f=await completeVersionFixture(Date.now());try{
 const ctx=(requestId:string,expectedRevision:string|null=null,actorId='reviewer')=>({actorId,requestId,expectedRevision,now:f.now}),startsAt=f.now+3600000,endsAt=f.now+4*3600000;
 await executeTeamGovernance(f.db,ctx('future-roster'),{action:'save_duty',sourceId:'products',primaryId:'reviewer',backupIds:['delegate'],reason:'Map actual currently qualified product primary and independent backup.'});
 await executeTeamGovernance(f.db,ctx('future-absence'),{action:'availability',sourceId:'reviewer',available:false,startsAt,endsAt,reason:'Record the actual known future absence without changing any original business clock.'});
 let view=await getTeamWorkspace(f.db,'reviewer');if(view.mode!=='full')throw new Error('Full governance view required');assert.equal(view.upcomingCoverage.find(row=>row.userId==='reviewer')!.duties.find(row=>row.id==='products')!.acceptedCover,false);
 const handoff=await executeTeamGovernance(f.db,ctx('future-handoff','0'),{action:'propose_handoff',sourceId:'products',toUserId:'delegate',startsAt,endsAt,reason:'Request genuine substitute receipt for the exact recorded future period.'}) as {id:string};
 assert.ok((await readTeamDutyCoverage(f.db,'products',{now:f.now})).gaps.some(value=>value.includes('receipt')));
 await executeTeamGovernance(f.db,ctx('future-accept','0','delegate'),{action:'accept_handoff',sourceId:handoff.id,reason:'I confirm receipt of the actual future responsibility within my current authority.'});
 view=await getTeamWorkspace(f.db,'reviewer');if(view.mode!=='full')throw new Error('Full governance view required');assert.equal(view.upcomingCoverage.find(row=>row.userId==='reviewer')!.duties.find(row=>row.id==='products')!.acceptedCover,true);
 const accepted=f.sqlite.prepare('SELECT accepted_at FROM team_handoffs WHERE id=?').get(handoff.id)!.accepted_at;
 await executeTeamGovernance(f.db,ctx('future-cancel','1'),{action:'cancel_handoff',sourceId:handoff.id,reason:'Cancel the current planned substitute without erasing the actual earlier receipt.'});assert.equal(f.sqlite.prepare('SELECT accepted_at FROM team_handoffs WHERE id=?').get(handoff.id)!.accepted_at,accepted);
 await executeTeamGovernance(f.db,ctx('future-correction','0'),{action:'availability',sourceId:'reviewer',available:true,startsAt,endsAt,reason:'The absence was cancelled; retain its original fact and current correction.'});
 view=await getTeamWorkspace(f.db,'reviewer');if(view.mode!=='full')throw new Error('Full governance view required');assert.equal(view.upcomingCoverage.some(row=>row.userId==='reviewer'),false);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_availability WHERE user_id='reviewer'").get()!.n,2);
 }finally{f.dispose();}
});
