import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {applyLocalD1Migrations} from '../scripts/staging/local-d1.mjs';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'hb-approval-migrations-'));
 const directory=join(root,'state','v3','d1','miniflare-D1DatabaseObject');
 await mkdir(directory,{recursive:true});await mkdir(join(root,'drizzle'));
 const path=join(directory,'disposable.sqlite');new DatabaseSync(path).close();
 await writeFile(join(root,'drizzle','0000_seed.sql'),`CREATE TABLE parent(id TEXT PRIMARY KEY,value INTEGER);
 CREATE TABLE child(id TEXT PRIMARY KEY,parent_id TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE);
 INSERT INTO parent VALUES('one',5000);INSERT INTO child VALUES('entry','one');`);
 await applyLocalD1Migrations({state:join(root,'state')},root);
 return {root,path,paths:{state:join(root,'state')}};
}
void test('local migration runner rebuilds populated financial parents without cascading away dependent rows',async()=>{
 const f=await fixture();
 try{
  await writeFile(join(f.root,'drizzle','0001_rebuild.sql'),`PRAGMA foreign_keys=OFF;
  --> statement-breakpoint
  CREATE TABLE replacement(id TEXT PRIMARY KEY,value INTEGER);
  --> statement-breakpoint
  INSERT INTO replacement SELECT * FROM parent;
  --> statement-breakpoint
  DROP TABLE parent;
  --> statement-breakpoint
  ALTER TABLE replacement RENAME TO parent;
  --> statement-breakpoint
  PRAGMA foreign_keys=ON;`);
  assert.equal((await applyLocalD1Migrations(f.paths,f.root)).applied,1);
  const db=new DatabaseSync(f.path);
  try{assert.deepEqual({...db.prepare('SELECT * FROM parent').get() as object},{id:'one',value:5000});
   assert.deepEqual({...db.prepare('SELECT * FROM child').get() as object},{id:'entry',parent_id:'one'});
   assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
   assert.equal((await applyLocalD1Migrations(f.paths,f.root)).applied,0);
  }finally{db.close();}
 }finally{await rm(f.root,{recursive:true,force:true});}
});
void test('local migration runner rolls back an invalid rebuilt relationship and its migration marker',async()=>{
 const f=await fixture();
 try{
  await writeFile(join(f.root,'drizzle','0001_invalid.sql'),`PRAGMA foreign_keys=OFF;
  --> statement-breakpoint
  DELETE FROM parent;
  --> statement-breakpoint
  PRAGMA foreign_keys=ON;`);
  await assert.rejects(applyLocalD1Migrations(f.paths,f.root),/migration.*failed/i);
  const db=new DatabaseSync(f.path);
  try{assert.equal((db.prepare('SELECT COUNT(*) AS n FROM parent').get() as {n:number}).n,1);
   assert.equal((db.prepare('SELECT COUNT(*) AS n FROM child').get() as {n:number}).n,1);
   assert.equal((db.prepare('SELECT COUNT(*) AS n FROM _hastabazaar_local_migrations').get() as {n:number}).n,1);
  }finally{db.close();}
 }finally{await rm(f.root,{recursive:true,force:true});}
});
