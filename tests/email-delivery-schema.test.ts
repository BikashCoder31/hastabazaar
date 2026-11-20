import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import * as schema from '../db/schema';
import {ormSourceContracts} from './helpers/orm-source-contract';
const files=['0147_durable_email_delivery.sql','0148_email_service_health.sql'];
function fixture(){const db=new DatabaseSync(':memory:');for(const file of [...files, '0150_incident_governance.sql'])db.exec(readFileSync('drizzle/'+file,'utf8'));return db;}
void test('ORM contains every durable delivery and health source column',()=>{
 const tables=ormSourceContracts(schema),db=fixture();
 try{
 for(const file of files)for(const table of readFileSync('drizzle/'+file,'utf8').matchAll(/CREATE TABLE (\w+)\s*\(([\s\S]+?)\);/g)){
  assert.ok(tables[table[1]],table[1]);
  const columns=(db.prepare('PRAGMA table_info('+table[1]+')').all() as {name:string}[]).map(column=>column.name);
  assert.deepEqual(tables[table[1]].columns.map(column=>column.name),columns);
 }
 }finally{db.close();}
});
void test('native delivery evidence prevents conflicting claims and accepted history rewrites',()=>{
 const db=fixture();try{
  const insert=db.prepare("INSERT INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,phase,message_id,started_at,transport,provider_receipt,completed_at) VALUES(?,?,?,?,?,'accepted','message',100,'provider','smtp250',101)");
  insert.run('a','business','q','claim',1);
  assert.throws(()=>insert.run('b','business','q','other',1),/UNIQUE/);
  assert.throws(()=>insert.run('b','order','q','claim',2),/UNIQUE/);
  assert.throws(()=>db.exec("UPDATE email_delivery_attempts SET phase='not_accepted'"),/delivery_acceptance_immutable/);
  assert.throws(()=>db.exec("UPDATE email_delivery_attempts SET queue_id='other'"),/delivery_attempt_identity_immutable/);
  assert.throws(()=>db.exec('DELETE FROM email_delivery_attempts'),/delivery_attempt_retained/);
 }finally{db.close();}
});
void test('health episodes remain isolated by environment and only one unresolved episode exists',()=>{
 const db=fixture();try{
  const insert=db.prepare("INSERT INTO service_health_incidents(id,environment,service_key,episode,state,first_seen_at,last_seen_at) VALUES(?,?,'email.sender',?,'detected',100,100)");
  insert.run('a','test',1);insert.run('b','local_staging',1);
  assert.throws(()=>insert.run('c','test',2),/UNIQUE/);
  db.exec("UPDATE service_health_incidents SET state='resolved',resolved_at=200 WHERE id='a'");insert.run('c','test',2);
  assert.throws(()=>db.exec("UPDATE service_health_incidents SET environment='production' WHERE id='c'"),/identity_immutable/);
  db.exec("INSERT INTO service_health_observations(id,environment,service_key,run_key,observed_at,successful,eligible_backlog,source_kind) VALUES('o','test','email.sender','run',100,1,0,'sender')");
  assert.throws(()=>db.exec("UPDATE service_health_observations SET successful=0"),/observation_immutable/);
 }finally{db.close();}
});
