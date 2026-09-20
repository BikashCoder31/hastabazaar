import manifest from '../../deployment/babal/release-manifest.json';
export const releaseId=manifest.release;
export async function inspectReadiness(db:D1Database,dialect:'mariadb'|'sqlite'='mariadb') {
 const missing:string[]=[];
 try {
  const columns=new Map<string,Set<string>>();
  const triggers=new Map<string,string>();
  if(dialect==='mariadb'){
   const rows=await db.prepare('SELECT TABLE_NAME AS tableName,COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()').all<{tableName:string;columnName:string}>();
   for(const row of rows.results){if(!columns.has(row.tableName))columns.set(row.tableName,new Set());columns.get(row.tableName)!.add(row.columnName);}
   const rows2=await db.prepare('SELECT TRIGGER_NAME AS name,ACTION_STATEMENT AS definition FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()').all<{name:string;definition:string}>();
   for(const row of rows2.results)triggers.set(row.name,row.definition.toLowerCase());
   const checkRows=await db.prepare('SELECT TABLE_NAME AS tableName,CONSTRAINT_NAME AS name,CHECK_CLAUSE AS definition FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()').all<{tableName:string;name:string;definition:string}>();
   const checks=new Map(checkRows.results.map(row=>[row.tableName+'.'+row.name,row.definition.toLowerCase().replace(/`/g,'')]));
   for(const [name,fragments] of Object.entries(manifest.requiredChecks)){
    const definition=checks.get(name);if(!definition)missing.push('check:'+name);
    else if(fragments.some(fragment=>!definition.includes(fragment)))missing.push('check-version:'+name);
   }
  }else{
   for(const name of Object.keys(manifest.requiredTables)){
    if(!/^[a-z_][a-z0-9_]*$/.test(name))throw new Error('Invalid manifest');
    const rows=await db.prepare(`PRAGMA table_info(${name})`).all<{name:string}>();
    if(rows.results.length)columns.set(name,new Set(rows.results.map(r=>r.name)));
   }
   const rows=await db.prepare("SELECT name,sql AS definition FROM sqlite_master WHERE type='trigger'").all<{name:string;definition:string}>();for(const row of rows.results)triggers.set(row.name,row.definition.toLowerCase());
  }
  for(const [table,names] of Object.entries(manifest.requiredTables)){
   if(!columns.has(table))missing.push(`table:${table}`);
   else for(const column of names)if(!columns.get(table)!.has(column))missing.push(`column:${table}.${column}`);
  }
  for(const [name,fragments] of Object.entries(manifest.requiredTriggers)){
   const definition=triggers.get(name);if(!definition)missing.push(`trigger:${name}`);
   else if(dialect==='mariadb'&&fragments.some(fragment=>!definition.replace(/`/g,'').includes(fragment)))missing.push(`trigger-version:${name}`);
  }
  return {ready:missing.length===0,missing};
 }catch{return {ready:false,missing:['database-unavailable']};}
}
export function publicReadinessResponse(ready:boolean){return Response.json({status:ready?'ok':'unavailable',marketplaceReady:ready,release:releaseId},{status:ready?200:503,headers:{'Cache-Control':'no-store'}});}
