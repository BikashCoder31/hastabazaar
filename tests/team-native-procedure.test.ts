import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance} from '../lib/operations/team-governance';
import * as legal from '../lib/legal-procedures/repository';
async function activeFixture(){
 const f=await completeVersionFixture(Date.now()),actor={id:'reviewer',authSubject:'reviewer',displayName:'Fictional reviewer'},draft=(await legal.getLegalDraftWorkspace(f.db)).current;
 const saved=await legal.saveLegalDraft(f.db,actor,{expectedRevision:draft.revision,expectedSha256:draft.sha256,sections:draft.sections,reason:'Save the actual native operating procedure for its separate approval.',requestId:crypto.randomUUID()},f.now);
 const command=(s:{sequence:number;sha256:string},operation:string,extra={})=>({operation,expectedSequence:s.sequence,expectedSha256:s.sha256,revision:saved.revision,documentSha256:saved.sha256,approvalSequence:null,effectiveFrom:null,confirmed:true,reason:'Use the actual native legal approval and activation workflow.',requestId:crypto.randomUUID(),...extra});
 let state=await legal.getLegalProcedureControl(f.db,f.now);const approval=await legal.changeLegalProcedureControl(f.db,actor,command(state,'approve'),f.now);state=await legal.getLegalProcedureControl(f.db,f.now);const active=await legal.changeLegalProcedureControl(f.db,actor,command(state,'activate',{approvalSequence:approval.sequence}),f.now+1);
 return {...f,actor,active,command};
}
void test('native active procedure assignment references exact original artifact and hash without copying or publishing it',async()=>{
 const f=await activeFixture();try{
 const result=await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'assign-native-procedure',expectedRevision:null,now:f.now+2},{action:'assign_native_procedure',sourceId:'native_operating_procedure',userIds:['delegate'],reason:'Assign the actual independently approved and activated staff procedure.'}) as {id:string};
 const row=f.sqlite.prepare('SELECT native_source_id,native_source_sha256,body FROM team_procedures WHERE id=?').get(result.id)!;assert.equal(row.native_source_id,f.active.id);assert.equal(row.native_source_sha256,f.active.document.sha256);assert.equal(row.body,'');
 await executeTeamGovernance(f.db,{actorId:'delegate',requestId:'ack-native-procedure',expectedRevision:null,now:f.now+3},{action:'acknowledge_procedure',sourceId:result.id,reason:'I read the exact currently active original operating procedure.'});
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM team_procedure_assignments WHERE procedure_id=? AND acknowledged_at IS NOT NULL').get(result.id)!.n,1);
 assert.equal((await legal.getLegalProcedureControl(f.db,f.now+3)).sequence,2);
 }finally{f.dispose();}
});
void test('actual native withdrawal between acknowledgment read and commit prevents stale procedure acknowledgment',async()=>{
 const f=await activeFixture();try{
 const result=await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'assign-native-race',expectedRevision:null,now:f.now+2},{action:'assign_native_procedure',sourceId:'native_operating_procedure',userIds:['delegate'],reason:'Assign only the actual current native operating procedure.'}) as {id:string};
 const wrapped=Object.create(f.db) as D1Database;let raced=false;wrapped.batch=(async(statements:D1PreparedStatement[])=>{if(!raced){raced=true;const state=await legal.getLegalProcedureControl(f.db,f.now+3);await legal.changeLegalProcedureControl(f.db,f.actor,f.command(state,'withdraw'),f.now+3);}return f.db.batch(statements);}) as D1Database['batch'];
 await assert.rejects(executeTeamGovernance(wrapped,{actorId:'delegate',requestId:'withdrawal-race-ack',expectedRevision:null,now:f.now+4},{action:'acknowledge_procedure',sourceId:result.id,reason:'The native procedure is withdrawn before this batch executes.'}));assert.equal(raced,true);
 assert.equal(f.sqlite.prepare('SELECT acknowledged_at FROM team_procedure_assignments WHERE procedure_id=?').get(result.id)!.acknowledged_at,null);
 }finally{f.dispose();}
});
