import assert from 'node:assert/strict';
import type {DatabaseSync} from 'node:sqlite';
import {createIncentiveDb} from './incentive-db';

/** Copies only an inspected :memory: fictional fixture into a new nonpersistent D1.
 * Triggers are suspended only while loading the exact historical starting state,
 * then every real native trigger is restored before returning the test target.
 */
export async function nativeFinanceClone(source:DatabaseSync){
 assert.ok(source.prepare('PRAGMA database_list').all().every(row=>row.file===''),'Only an in-memory fixture may be cloned.');
 const target=await createIncentiveDb();
 const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
 try{
  const tables=source.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string;sql:string}[];
  const targetSchema=(await target.db.prepare("SELECT name,sql LIKE 'CREATE TABLE %' AS ordinary FROM sqlite_schema WHERE type='table'").all<{name:string;ordinary:number|null}>()).results;
  const targetTables=new Set(targetSchema.map(row=>row.name));
  for(const table of tables)if(!targetTables.has(table.name))await target.db.prepare(table.sql).run();
  const triggers=(await target.db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger'").all<{name:string;sql:string}>()).results;
  await target.db.batch(triggers.map(row=>target.db.prepare('DROP TRIGGER '+quote(row.name))));
  let tablesToDelete=tables;
  // A virtual table may implement DELETE itself, so keep the original batch
  // whenever any source or target table falls outside the ordinary schema.
  if(targetSchema.every(row=>row.ordinary===1)&&tables.every(row=>/^CREATE TABLE /i.test(row.sql))){
   const occupiedTables:typeof tables=[];
   // No caller can access this fresh target yet. With triggers suspended,
   // earlier deletes and their FK actions cannot populate an empty table.
   for(let offset=0;offset<tables.length;offset+=25){
    const chunk=tables.slice(offset,offset+25);
    const probes=chunk.map((table,slot)=>target.db.prepare(
     'SELECT '+slot+' AS slot, EXISTS(SELECT 1 FROM '+quote(table.name)+') AS occupied',
    ));
    const results=await target.db.batch<{slot:number;occupied:number}>(probes);
    assert.equal(results.length,chunk.length,'Every target table must be probed before pruning deletes.');
    for(const [slot,table] of chunk.entries()){
     const result=results[slot];
     assert.ok(result?.success&&result.results.length===1,'Invalid target table existence result.');
     const [row]=result.results;
     assert.ok(row?.slot===slot&&(row.occupied===0||row.occupied===1),'Invalid target table existence row.');
     if(row.occupied===1)occupiedTables.push(table);
    }
   }
   tablesToDelete=occupiedTables;
  }
  const statements=[target.db.prepare('PRAGMA defer_foreign_keys=ON'),...tablesToDelete.map(row=>target.db.prepare('DELETE FROM '+quote(row.name)))];
  for(const table of tables){
   const columns=(source.prepare('PRAGMA table_xinfo('+quote(table.name)+')').all() as {name:string;hidden:number}[]).filter(column=>column.hidden===0).map(column=>column.name);
   const rows=source.prepare('SELECT '+columns.map(quote).join(',')+' FROM '+quote(table.name)).all();
   for(const row of rows)statements.push(target.db.prepare('INSERT INTO '+quote(table.name)+'('+columns.map(quote).join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').bind(...columns.map(column=>row[column])));
  }
  await target.db.batch(statements);
  // Restore fixture DDL in bounded requests. A single growing batch of every
  // project trigger intermittently drops the local Miniflare transport. The
  // fictional data load above remains atomic; no tested operation runs here.
  for(let offset=0;offset<triggers.length;offset+=25)
   await target.db.batch(triggers.slice(offset,offset+25).map(row=>target.db.prepare(row.sql)));
  const restored=(await target.db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all<{name:string;sql:string}>()).results;
  assert.deepEqual(restored,[...triggers].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0),'Every original native trigger must be restored exactly before testing.');
  assert.equal((await target.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  return target;
 }catch(error){await target.dispose();throw error;}
}
