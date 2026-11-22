import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance,readTeamSavedOutcome} from '../lib/operations/team-governance';
const command={action:'save_duty',sourceId:'products',primaryId:'delegate',backupIds:[],reason:'Retain original account authority and the exact saved roster.'};
void test('Team replacement auth subject at commit cannot save a command authenticated under the original subject',async()=>{
 const f=await completeVersionFixture();try{
  f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE users SET auth_subject='replacement-subject' WHERE id='reviewer'").run();});
  const context={actorId:'reviewer',authSubject:'reviewer',requestId:'subject-at-commit',expectedRevision:null,now:f.now};
  await assert.rejects(executeTeamGovernance(f.db,context,command));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_duties WHERE id='products'").get()!.n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='subject-at-commit'").get()!.n,0);
 }finally{f.dispose();}
});
void test('Team original replay and saved outcome reject a newly replaced authenticated subject',async()=>{
 const f=await completeVersionFixture();try{
  const context={actorId:'reviewer',authSubject:'reviewer',requestId:'original-subject-replay',expectedRevision:null,now:f.now};
  await executeTeamGovernance(f.db,context,command);
  f.sqlite.prepare("UPDATE users SET auth_subject='replacement-subject' WHERE id='reviewer'").run();
  await assert.rejects(executeTeamGovernance(f.db,context,command));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='original-subject-replay'").get()!.n,1);
 }finally{f.dispose();}
});
void test('Team saved outcome cannot return after the original reader loses authority during receipt loading',async()=>{
 const f=await completeVersionFixture();try{
  await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'read-fence',expectedRevision:null,now:f.now},command);
  const wrapped=Object.create(f.db) as D1Database;let raced=false;
  wrapped.prepare=((sql:string)=>{
   const statement=f.db.prepare(sql);
   if(sql.includes('command_result_json AS result')&&sql.includes('action LIKE')){
    const bind=statement.bind.bind(statement);
    statement.bind=((...values:unknown[])=>{const bound=bind(...values),first=bound.first.bind(bound);bound.first=(async(...args:unknown[])=>{const value=await first(...args as []);if(!raced){raced=true;f.sqlite.prepare("UPDATE users SET auth_subject='replacement-subject' WHERE id='reviewer'").run();}return value;}) as D1PreparedStatement['first'];return bound;}) as D1PreparedStatement['bind'];
   }
   return statement;
  }) as D1Database['prepare'];
  await assert.rejects(readTeamSavedOutcome(wrapped,'reviewer','read-fence'));
  assert.equal(raced,true);
 }finally{f.dispose();}
});
