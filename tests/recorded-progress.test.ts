import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {getRecordedProgress} from '../lib/db/repositories/business-activity';
const now=Date.parse('2026-09-13T12:00:00+05:45');
function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE users(id TEXT PRIMARY KEY,display_name TEXT);CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,created_at INTEGER);');sqlite.exec("INSERT INTO users VALUES ('admin-a','A'),('admin-b','B')");
 const db={prepare:(sql:string)=>{const statement=sqlite.prepare(sql);let values:(string|number)[]=[];return {bind:(...bindings:(string|number)[])=>{values=bindings;return {all:async()=>({results:statement.all(...values)})};}};}} as unknown as D1Database;
 const add=(id:string,actor:string,action:string,type='product',at=now)=>sqlite.prepare('INSERT INTO audit_logs VALUES (?,?,?,?,?,?)').run(id,actor,action,type,'record-'+id,at);
 return {db,sqlite,add};}
void test('progress counts only explicit completed recorded outcomes within Nepal dates and separates actors',async()=>{const f=fixture();try{
 f.add('1','admin-a','product.approved');f.add('2','admin-a','product.review.started');f.add('3','admin-b','product.rejected');f.add('4','admin-a','unknown.completed');f.add('5','admin-a','product.approved','order');f.add('6','admin-a','product.approved','product',now-40*86400000);
 const result=await getRecordedProgress(f.db,{id:'sa',role:'super_admin'},{from:'2026-09-13',to:'2026-09-13'},now);
 assert.equal(result.groups.length,2);assert.deepEqual(result.groups.map(g=>[g.actorId,g.action,g.count]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),[['admin-a','product.approved',1],['admin-b','product.rejected',1]]);
 assert.equal(result.events.length,3);assert.equal(result.events.find(e=>e.action==='product.review.started')?.completed,false);
 assert.ok(result.groups.every(g=>!g.outcome.includes('settled')));
 }finally{f.sqlite.close();}});
void test('Admin progress is own history restricted by effective source permissions and audit permission',async()=>{const f=fixture();try{
 f.add('1','admin-a','product.approved');f.add('2','admin-b','product.approved');f.add('3','admin-a','payout.prepared','payout');
 const staff={id:'admin-a',role:'admin' as const,permissions:['audit_log.view','product.review'] as const};
 const result=await getRecordedProgress(f.db,staff,{},now);assert.equal(result.events.length,1);assert.equal(result.events[0].actorId,'admin-a');
 await assert.rejects(()=>getRecordedProgress(f.db,staff,{actor:'admin-b'},now),/own/);
 await assert.rejects(()=>getRecordedProgress(f.db,{...staff,permissions:['product.review']},{},now),/audit/);
 await assert.rejects(()=>getRecordedProgress(f.db,{id:'customer',role:'customer'},{},now),/Staff/);
 const empty=await getRecordedProgress(f.db,{...staff,permissions:['audit_log.view']},{},now);assert.equal(empty.groups.length,0);
 }finally{f.sqlite.close();}});
void test('progress date range is bounded and filter text is bound rather than SQL',async()=>{const f=fixture();try{
 await assert.rejects(()=>getRecordedProgress(f.db,{id:'sa',role:'super_admin'},{from:'2020-01-01',to:'2026-09-13'},now),/366/);
 const result=await getRecordedProgress(f.db,{id:'sa',role:'super_admin'},{action:"product.approved' OR 1=1 --"},now);assert.equal(result.groups.length,0);
 }finally{f.sqlite.close();}});

void test('shipping and privacy completion counts obey actor and source capability and omit email attempts',async()=>{const f=fixture();try{
 f.add('s','admin-a','shipping.delivered','shipping_job');f.add('p','admin-a','privacy.complete','data_rights_request');f.add('p2','admin-b','privacy.complete','data_rights_request');f.add('e','admin-a','order.email.processing.finished','notification_queue');
 const own=await getRecordedProgress(f.db,{id:'admin-a',role:'admin',permissions:['audit_log.view','support.manage']},{},now);assert.equal(own.groups.length,1);assert.equal(own.groups[0].action,'privacy.complete');
 const all=await getRecordedProgress(f.db,{id:'sa',role:'super_admin'},{},now);assert.equal(all.groups.length,3);
 }finally{f.sqlite.close();}});
