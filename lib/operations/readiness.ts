import manifest from '../../deployment/babal/release-manifest.json';
export const releaseId=manifest.release;
// MariaDB implements partial unique indexes and discount labels using generated
// columns. SQLite uses its native partial indexes and the current discount total.
const mariaOnlyColumns = new Set([
 'order_items.discount_source', 'orders.current_referral_discount_paisa', 'orders.discount_source',
 'payout_entries.active_ledger_entry_key', 'seller_ledger_entries.active_order_item_key',
 'seller_ledger_entries.active_order_item_type', 'seller_profiles.registration_authority_key',
 'seller_profiles.registration_number_key', 'seller_profiles.tax_registration_number_key',
 'staff_invitations.pending_email_key', 'seller_route_transition_applications.open_seller_key',
 'data_rights_legal_holds.active_user_id',
 'managed_payout_allocations.reserved_entitlement_key',
]);
export async function inspectReadiness(
 db:D1Database,
 dialect:'mariadb'|'sqlite'=(db as D1Database & {dialect?:string}).dialect==='mariadb'?'mariadb':'sqlite',
) {
 const missing:string[]=[];
 try {
  const columns=new Map<string,Set<string>>();
  const triggers=new Map<string,string>();
  if(dialect==='mariadb'){
   const rows=await db.prepare('SELECT TABLE_NAME AS tableName,COLUMN_NAME AS columnName,GENERATION_EXPRESSION AS generationExpression,COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()').all<{tableName:string;columnName:string;generationExpression?:string;collation?:string}>();
   for(const row of rows.results){if(!columns.has(row.tableName))columns.set(row.tableName,new Set());columns.get(row.tableName)!.add(row.columnName);}
   for(const [key,fragments] of Object.entries(manifest.requiredGeneratedColumns)){
    const row=rows.results.find(row=>row.tableName+'.'+row.columnName===key);
    const normalize=(value:string)=>value.replace(/'(?:''|[^'])*'|[^']+/g,token=>token.startsWith("'")?token:token.toLowerCase().replace(/[`\s]/g,''))
      .replace(/cast\((\w+)as(?:binary|charcharsetbinary)\)/g,'binary$1');
    const definition=normalize(row?.generationExpression??'');
    if(fragments.some(part=>definition!==normalize(part)))missing.push('generated-column-version:'+key);
   }
   for(const [key,collation] of Object.entries(manifest.requiredColumnCollations)){
    if(rows.results.find(row=>row.tableName+'.'+row.columnName===key)?.collation!==collation)missing.push('column-collation:'+key);
   }
   const indexRows=await db.prepare('SELECT TABLE_NAME AS tableName,INDEX_NAME AS name,NON_UNIQUE AS nonUnique,SEQ_IN_INDEX AS position,COLUMN_NAME AS columnName,SUB_PART AS prefixLength FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX').all<{tableName:string;name:string;nonUnique:number;position:number;columnName:string;prefixLength:number|null}>();
   for(const [key,expected] of Object.entries(manifest.requiredUniqueIndexes)){
    const actual=indexRows.results.filter(row=>row.tableName+'.'+row.name===key);
    if(!actual.length)missing.push('index:'+key);
    else if(actual.length!==expected.length||actual.some((row,i)=>Number(row.nonUnique)!==0||Number(row.position)!==i+1||row.columnName!==expected[i]||row.prefixLength!==null))missing.push('index-version:'+key);
   }
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
    if(name==='hastabazaar_schema_versions')continue;
    if(!/^[a-z_][a-z0-9_]*$/.test(name))throw new Error('Invalid manifest');
    const rows=await db.prepare(`PRAGMA table_info(${name})`).all<{name:string}>();
    if(rows.results.length)columns.set(name,new Set(rows.results.map(r=>r.name)));
   }
   const rows=await db.prepare("SELECT name,sql AS definition FROM sqlite_master WHERE type='trigger'").all<{name:string;definition:string}>();for(const row of rows.results)triggers.set(row.name,row.definition.toLowerCase());
   const indexes=await db.prepare("SELECT name,sql AS definition FROM sqlite_master WHERE type='index' AND name='managed_allocation_one_reservation'").all<{name:string;definition:string}>();
   const allocationIndex=indexes.results[0]?.definition?.toLowerCase().replace(/\s+/g,'')??'';
   if(!allocationIndex)missing.push('index:managed_payout_allocations.managed_allocation_one_reservation');
   else if(!allocationIndex.includes('createuniqueindex')||!allocationIndex.includes('(entitlement_id)')||!allocationIndex.includes("wheredisposition='reserved'"))missing.push('index-version:managed_payout_allocations.managed_allocation_one_reservation');
  }
  for(const [table,names] of Object.entries(manifest.requiredTables)){
   if(dialect==='sqlite'&&table==='hastabazaar_schema_versions')continue;
   if(!columns.has(table))missing.push(`table:${table}`);
   else for(const column of names){
    if(dialect==='sqlite'&&mariaOnlyColumns.has(`${table}.${column}`))continue;
    if(!columns.get(table)!.has(column))missing.push(`column:${table}.${column}`);
   }
  }
  for(const [name,fragments] of Object.entries(manifest.requiredTriggers)){
   const definition=triggers.get(name);if(!definition)missing.push(`trigger:${name}`);
   else if(dialect==='mariadb'&&fragments.some(fragment=>!definition.replace(/`/g,'').includes(fragment)))missing.push(`trigger-version:${name}`);
  }
  return {ready:missing.length===0,missing};
 }catch{return {ready:false,missing:['database-unavailable']};}
}
export function publicReadinessResponse(ready:boolean){return Response.json({status:ready?'ok':'unavailable',marketplaceReady:ready,release:releaseId},{status:ready?200:503,headers:{'Cache-Control':'no-store'}});}
