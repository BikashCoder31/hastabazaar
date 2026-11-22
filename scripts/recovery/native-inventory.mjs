import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {classifySqlTransferTable} from '../../lib/portability/d1-source.ts';
import {canonicalJson} from '../../lib/portability/values.ts';
import {customerFeeRecoveryMinimumRows} from '../../lib/operations/fee-schema-readiness.mjs';

export function nativeIdentifier(name){assert.match(name,/^[a-z_][a-z0-9_]*$/);return '`'+name+'`';}
const digest=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const MAX_ROW_BYTES=512_000;

/** Empty tables do not certify recovery of retained financial evidence. */
export function assertFeeRecoveryEvidence(inventory) {
 const expected = {
  ...customerFeeRecoveryMinimumRows,
  marketplace_fee_waiver_control: 1, marketplace_fee_waiver_campaigns: 1,
  marketplace_fee_waiver_revisions: 2, marketplace_fee_waiver_requests: 2,
  order_item_marketplace_fees: 1,
 };
 return Object.entries(expected).map(([name, minimum]) => {
  const table = inventory.tables.find(table => table.name === name);
  assert.ok(table && table.classification === 'durable' && table.rows >= minimum, 'Native recovery requires populated durable fee evidence: ' + name);
  if (name === 'marketplace_fee_waiver_control' || name === 'customer_fee_waiver_control') assert.equal(table.rows, 1);
  assert.match(table.sha256, /^[a-f0-9]{64}$/);
  return table;
 });
}

export function normalizeNativeView(sql,database){
 const tokens=[];
 const pattern=/'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|`(?:``|[^`])*`|[A-Za-z_][A-Za-z0-9_]*|[^\s]/g;
 for(const match of sql.matchAll(pattern)){
  const raw=match[0];if(raw.startsWith('--')||raw.startsWith('#')||raw.startsWith('/*'))continue;
  const identifier=raw.startsWith('`')||/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw);
  tokens.push({raw,value:raw.startsWith('`')?raw.slice(1,-1).replaceAll('``','`'):raw,identifier,index:match.index});
 }
 const replacements=[];let relations=0;
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i];if(!token.identifier)continue;
  const keyword=token.raw.startsWith('`')?'':token.value.toUpperCase();
  assert.notEqual(keyword,'JOIN','Unreviewed native view relation');
  if(keyword==='FROM'||keyword==='JOIN'){
   const [schema,dot,table]=tokens.slice(i+1,i+4);
   assert.ok(schema?.identifier,'Derived native view relation requires review');
   if(dot?.raw==='.'){
    assert.ok(table?.identifier);assert.equal(schema.value,database,'Cross-schema native view references are forbidden');
    assert.equal(table.value,'loyalty_daily_claims','Unreviewed native view relation');
    replacements.push({...schema,replacement:'`$database`'});
   }else{
    assert.equal(schema.value,'loyalty_daily_claims','Unreviewed native view relation');
    replacements.push({...schema,replacement:'`$database`.'+schema.raw});
   }
   // The reviewed view has one explicitly aliased relation per SELECT. A comma
   // or JOIN here would introduce an unchecked relation, even if its schema
   // happens to share an allowed column alias such as `d` or `newer`.
   const aliasIndex=i+(dot?.raw==='.'?4:2),alias=tokens[aliasIndex],next=tokens[aliasIndex+1];
   assert.ok(alias?.identifier&&['d','newer'].includes(alias.value),'Unreviewed native view relation alias');
   assert.ok(!next||next.raw.toUpperCase()==='WHERE','Unreviewed native view relation continuation');
   relations++;
  }
  if(keyword==='VIEW'&&tokens[i+2]?.raw==='.'){
   assert.equal(tokens[i+1]?.value,database,'Cross-schema native view identity is forbidden');replacements.push({...tokens[i+1],replacement:'`$database`'});
  }
  if(tokens[i+1]?.raw==='.'&&tokens[i+2]?.identifier){
   assert.ok([database,'d','newer'].includes(token.value),'Cross-schema or unreviewed native view qualifier');
   assert.notEqual(tokens[i+3]?.raw,'(','Schema-qualified native view routine is forbidden');
  }
 }
 assert.ok(relations>0,'Native view needs reviewed table references');
 let result=sql;for(const token of replacements.sort((a,b)=>b.index-a.index))result=result.slice(0,token.index)+token.replacement+result.slice(token.index+token.raw.length);
 return result;
}

/** Exact server-side encodings avoid mysql2's JS integer/decimal conversions. */
export async function captureNativeInventory(connection,selectedViews){
 const [databaseRows]=await connection.query('SELECT DATABASE() name');const database=databaseRows[0].name;nativeIdentifier(database);
 const [tableRows]=await connection.query("SELECT TABLE_NAME name,TABLE_TYPE kind,ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY BINARY TABLE_NAME");
 assert.ok(tableRows.length>0&&tableRows.length<=2048);
 const [routines]=await connection.query('SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()');
 const [events]=await connection.query('SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()');
 assert.equal(routines.length,0,'Unreviewed stored routines block native recovery');assert.equal(events.length,0,'Database events must not enter recovery');
 const selectedDefinitions=selectedViews?await import('./selected-native-views.mjs').then(({verifySelectedRecoveryViews})=>
  verifySelectedRecoveryViews(connection,database,selectedViews.database,tableRows.filter(table=>table.kind==='VIEW').map(table=>table.name),selectedViews.baseline)):null;
 const tables=[],schema=[];let views=0;
 for(const table of tableRows){
  if(table.kind==='VIEW'){
   if(selectedDefinitions){schema.push(selectedDefinitions[views++]);continue;}
   assert.equal(table.name,'loyalty_latest_claims','Unreviewed views block native recovery');
   const [definition]=await connection.query('SHOW CREATE VIEW '+nativeIdentifier(table.name)),value=definition[0];
   // MariaDB qualifies view references with the containing database. Normalize
   // only that exact qualifier; preserve all other SQL and security metadata.
   schema.push({view:table.name,sql:normalizeNativeView(value['Create View'],database),characterSet:value.character_set_client,collation:value.collation_connection});views++;continue;
  }
  assert.equal(table.kind,'BASE TABLE');assert.equal(table.engine,'InnoDB');
  const classification=classifySqlTransferTable(table.name),name=nativeIdentifier(table.name);
  const [definition]=await connection.query('SHOW CREATE TABLE '+name);
  schema.push({table:table.name,sql:definition[0]['Create Table'].replace(/ AUTO_INCREMENT=\d+/g,'')});
  const [columns]=await connection.query('SELECT COLUMN_NAME name,COLUMN_TYPE type,EXTRA extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[table.name]);
  assert.ok(columns.length>0&&columns.length<=512);
  const names=columns.map(column=>nativeIdentifier(column.name));
  const size=names.map(column=>'COALESCE(OCTET_LENGTH(CAST('+column+' AS BINARY)),0)').join('+');
  const select=names.map((column,index)=>'HEX(CAST('+column+' AS BINARY)) AS '+nativeIdentifier('c'+index)).join(',');
  const ordering=names.map(column=>'CAST('+column+' AS BINARY)').join(',');
  const hash=createHash('sha256');let rows=0;
  // A too-large row is rejected before its bytes cross the driver boundary.
  const [large]=await connection.query('SELECT 1 found FROM '+name+' WHERE ('+size+')>? LIMIT 1',[MAX_ROW_BYTES]);assert.equal(large.length,0,'A native row exceeds the recovery bound');
  for(let offset=0;;offset+=16){
   const [batch]=await connection.query('SELECT '+select+' FROM '+name+' ORDER BY '+ordering+' LIMIT 16 OFFSET ?',[offset]);
   for(const row of batch){const bytes=Buffer.from(canonicalJson(columns.map((_,index)=>row['c'+index])));hash.update(String(bytes.length)+':');hash.update(bytes);rows++;assert.ok(rows<=100_000_000);}
   if(batch.length<16)break;
  }
  tables.push({name:table.name,classification,rows,sha256:hash.digest('hex')});
 }
 const [triggers]=await connection.query('SELECT TRIGGER_NAME name,EVENT_MANIPULATION event,ACTION_TIMING timing,EVENT_OBJECT_TABLE tableName,ACTION_STATEMENT statement,SQL_MODE sqlMode FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY BINARY TRIGGER_NAME');
 return {schemaSha256:digest({schema,triggers}),tables,triggers:triggers.length,views};
}

/** Runs only after a full exact comparison in an owned, offline restored fixture. */
export async function invalidateRestoredAuthority(connection,inventory){
 await connection.beginTransaction();
 try{
  for(const table of inventory.tables.filter(table=>table.classification==='transient'))await connection.query('DELETE FROM '+nativeIdentifier(table.name));
  // Retain the encrypted enrollment and consumed recovery state exactly. Never reactivate grants.
  await connection.query("DELETE FROM marketplace_settings WHERE `key` LIKE 'auth-private:%' AND `key`<>'auth-private:manifest:v1' AND `key` NOT LIKE 'auth-private:account:%'");
  await connection.query("UPDATE staff_invitations SET status='expired' WHERE status='pending'");
  if(inventory.tables.some(table=>table.name==='operational_reminder_cursors'))
   await connection.query('UPDATE operational_reminder_cursors SET lease_token=NULL,lease_until=NULL WHERE lease_token IS NOT NULL OR lease_until IS NOT NULL');
  // Keep the claimed message and deadline as a cross-message cadence fence.
  if(inventory.tables.some(table=>table.name==='commission_terms_email_controls'))
   await connection.query('UPDATE commission_terms_email_controls SET routine_claim_token=NULL WHERE routine_claim_token IS NOT NULL');
  await connection.commit();
 }catch(error){await connection.rollback();throw error;}
}
