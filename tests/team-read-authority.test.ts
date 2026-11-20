import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {getTeamWorkspace,executeTeamGovernance} from '../lib/operations/team-governance';
void test('downgrade during full Team data loading cannot return the former Super Admin governance DTO',async()=>{
 const f=await completeVersionFixture();try{
 const wrapped=Object.create(f.db) as D1Database;let raced=false;wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('AS accountStatus')){const all=statement.all.bind(statement);statement.all=(async()=>{const result=await all();if(!raced){raced=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',?)").run(f.now);f.sqlite.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('reviewer','[]',1,'reviewer',?)").run(f.now);}return result;}) as D1PreparedStatement['all'];}return statement;}) as D1Database['prepare'];
 await assert.rejects(getTeamWorkspace(wrapped,'reviewer'),/authority|access|changed|permission/i);assert.equal(raced,true);
 }finally{f.dispose();}
});
void test('supported roster removal during own contacts loading cannot return the removed duty or its current contact scope',async()=>{
 const f=await completeVersionFixture();try{
 await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'scope-initial-roster',expectedRevision:null,now:f.now},{action:'save_duty',sourceId:'products',primaryId:'delegate',backupIds:['reviewer'],reason:'Create the actual current staff responsibility and its relevant contacts.'});
 const wrapped=Object.create(f.db) as D1Database;let raced=false;wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.startsWith('SELECT id,display_name AS displayName,email FROM users')){const all=statement.all.bind(statement);statement.all=(async()=>{const result=await all();if(!raced){raced=true;await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'scope-remove-during-read',expectedRevision:'0',now:f.now+1},{action:'save_duty',sourceId:'products',primaryId:'reviewer',backupIds:[],reason:'Remove the old reader from the current duty through the actual supported roster command.'});}return result;}) as D1PreparedStatement['all'];}return statement;}) as D1Database['prepare'];
 await assert.rejects(getTeamWorkspace(wrapped,'delegate'),/scope|changed|authority/i);assert.equal(raced,true);
 const refreshed=await getTeamWorkspace(f.db,'delegate');assert.equal(refreshed.mode,'own');assert.equal(refreshed.coverage.length,0);
 }finally{f.dispose();}
});
void test('own view is fenced against role loss while its assigned procedures are being read',async()=>{
 const f=await completeVersionFixture();try{
 const wrapped=Object.create(f.db) as D1Database;let raced=false;wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('FROM team_procedures p')&&sql.includes('a.user_id=?')){const all=statement.all.bind(statement);statement.all=(async()=>{const result=await all();if(!raced){raced=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='delegate' AND role='admin'").run();}return result;}) as D1PreparedStatement['all'];}return statement;}) as D1Database['prepare'];
 await assert.rejects(getTeamWorkspace(wrapped,'delegate'),/authority|access|changed|permission/i);assert.equal(raced,true);
 }finally{f.dispose();}
});
