import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
class Conflict extends Error{}

/** Fresh memory only. NOCASE columns emulate the verified native CI hazard while the
 * actual canonical0031 guard CHECK and real prepared authority statements execute. */
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec("CREATE TABLE users(id TEXT COLLATE NOCASE PRIMARY KEY,status TEXT COLLATE NOCASE NOT NULL);CREATE TABLE user_roles(user_id TEXT COLLATE NOCASE,role TEXT COLLATE NOCASE);CREATE TABLE work(id TEXT PRIMARY KEY,owner TEXT);INSERT INTO work VALUES('original','unchanged');");
 sqlite.exec(readFileSync('drizzle/0031_staff_permissions.sql','utf8').replaceAll('permissions_json TEXT NOT NULL','permissions_json TEXT COLLATE NOCASE NOT NULL'));
 sqlite.exec("INSERT INTO users VALUES('reviewer','active'),('operator','active'),('legacy','active');INSERT INTO user_roles VALUES('reviewer','super_admin'),('operator','admin'),('legacy','admin');INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('operator','[\"product.review\"]',1,'reviewer',1);");
 const prepared:{sql:string;values:SQLInputValue[]}[]=[];
 const db={prepare(sql:string){const statement=sqlite.prepare(sql),record={sql,values:[] as SQLInputValue[]};prepared.push(record);let values:SQLInputValue[]=[];return{bind(...input:SQLInputValue[]){values=input;record.values=input;return this;},async first(){return statement.get(...values)??null;},async all(){return{results:statement.all(...values)};},async run(){return{meta:{changes:Number(statement.run(...values).changes)}};}};},async batch(statements:{run():Promise<unknown>}[]){sqlite.exec('BEGIN');try{const output=[];for(const statement of statements)output.push(await statement.run());sqlite.exec('COMMIT');return output;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
 return{sqlite,db,prepared,dispose:()=>sqlite.close()};
}
void test('canonical user identity rejects a CI case alias before granting actor or candidate authority',async()=>{
 const f=fixture();try{await assert.rejects(staffMutationGuard(f.db,'REVIEWER','product.review',Conflict),Conflict);assert.equal((await staffMutationGuard(f.db,'reviewer','product.review',Conflict)).role,'super_admin');const guard=f.prepared.find(row=>row.sql.includes('INSERT INTO staff_permission_guards')&&row.sql.includes('JOIN user_roles'))!;const plan=f.sqlite.prepare('EXPLAIN QUERY PLAN '+guard.sql).all(...guard.values).map(row=>String(row.detail)).filter(detail=>/\b(?:SEARCH u|SCAN r)\b/.test(detail));assert.match(plan[0],/^SEARCH u /,'Canonical identity lookup must use the existing user index before scanning roles.');}finally{f.dispose();}
});
void test('a case-only corrupt permission profile at commit rolls back the real guarded mutation',async()=>{
 const f=fixture();try{const proof=await staffMutationGuard(f.db,'operator','product.review',Conflict);f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='[\"PRODUCT.REVIEW\"]' WHERE user_id='operator'").run();await assert.rejects(f.db.batch([f.db.prepare("UPDATE work SET owner='forbidden' WHERE id='original'"),...proof.statements]));assert.equal(f.sqlite.prepare("SELECT owner FROM work WHERE id='original'").get()!.owner,'unchanged');await assert.rejects(staffMutationGuard(f.db,'operator','product.review',Conflict),Conflict);}finally{f.dispose();}
});
void test('case-only role replacement invalidates the retained authority guard',async()=>{
 const f=fixture();try{const proof=await staffMutationGuard(f.db,'reviewer','product.review',Conflict);f.sqlite.prepare("UPDATE user_roles SET role='SUPER_ADMIN' WHERE user_id='reviewer'").run();await assert.rejects(f.db.batch([f.db.prepare("UPDATE work SET owner='forbidden' WHERE id='original'"),...proof.statements]));assert.equal(f.sqlite.prepare("SELECT owner FROM work WHERE id='original'").get()!.owner,'unchanged');}finally{f.dispose();}
});
void test('account status stays exact both at read and at commit under CI storage',async()=>{
 const f=fixture();try{f.sqlite.prepare("UPDATE users SET status='ACTIVE' WHERE id='reviewer'").run();await assert.rejects(staffMutationGuard(f.db,'reviewer','product.review',Conflict),Conflict);f.sqlite.prepare("UPDATE users SET status='active' WHERE id='reviewer'").run();const proof=await staffMutationGuard(f.db,'reviewer','product.review',Conflict);f.sqlite.prepare("UPDATE users SET status='ACTIVE' WHERE id='reviewer'").run();await assert.rejects(f.db.batch(proof.statements));}finally{f.dispose();}
});
void test('legacy absence and explicit empty/invalid profiles retain their existing fail-closed meaning',async()=>{
 const f=fixture();try{const proof=await staffMutationGuard(f.db,'legacy','product.review',Conflict);await f.db.batch(proof.statements);f.sqlite.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('legacy','[]',1,'reviewer',1)").run();await assert.rejects(f.db.batch(proof.statements));await assert.rejects(staffMutationGuard(f.db,'legacy','product.review',Conflict),Conflict);f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='not-json' WHERE user_id='legacy'").run();await assert.rejects(staffMutationGuard(f.db,'legacy','product.review',Conflict),Conflict);}finally{f.dispose();}
});
