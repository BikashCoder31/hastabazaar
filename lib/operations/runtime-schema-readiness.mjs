import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sameCoreStorageDefinition} from '../forms/core-readiness.mjs';

let cached;
/** The reference is always disposable memory, never a path or the inspected database.
 * It models source DDL only; no reference data is copied to the caller's database.
 */
function currentSchemaReference(){
 const directory=new URL('../../drizzle/',import.meta.url);
 const sources=readdirSync(directory).filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort().map(name=>({name,sql:readFileSync(new URL(name,directory),'utf8')}));
 const digest=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
 if(cached?.digest===digest)return cached;
 const reference=new DatabaseSync(':memory:');
 try{
  reference.exec('PRAGMA foreign_keys=ON');
  for(const source of sources)reference.exec(source.sql);
  const rows=reference.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  cached=Object.freeze({digest,rows:Object.freeze(rows.map(row=>Object.freeze(row)))});
  return cached;
 }finally{reference.close();}
}
/** Read-only comparison against the real current source schema; no repair fallback. */
export function inspectCurrentRuntimeSchema(sqlite){
 const expected=currentSchemaReference();
 const actual=sqlite.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 const byName=new Map(actual.map(row=>[row.type+':'+row.name,row]));
 const missing=[],changed=[];
 for(const row of expected.rows){
  const found=byName.get(row.type+':'+row.name);
  if(!found)missing.push(row.type+':'+row.name);
  else if(found.tbl_name!==row.tbl_name||(found.sql!==row.sql&&!sameCoreStorageDefinition(found.sql,row.sql)))changed.push(row.type+':'+row.name);
 }
 return{ready:missing.length===0&&changed.length===0,sourceDigest:expected.digest,expectedObjects:expected.rows.length,missing,changed};
}
