import {createHash} from 'node:crypto';

const literal=value=>"'"+String(value).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const quote=name=>'`'+name.replaceAll('`','``')+'`';
const predicate=row=>Object.entries(row).map(([key,value])=>value===null?`${quote(key)} IS NULL`:typeof value==='number'?`${quote(key)}=${value}`:`BINARY ${quote(key)} <=> BINARY ${literal(value)}`).join(' AND ');
const equalRows=(query,rows)=>`(SELECT COUNT(*) FROM (${query}) hb_check_rows)=${rows.length}`+(rows.length?` AND NOT EXISTS(SELECT 1 FROM (${query}) hb_check_rows WHERE NOT (${rows.map(r=>'('+predicate(r)+')').join(' OR ')}))`:'');
const guard=(condition,code)=>` IF ${condition} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=${literal('check_parity_'+code)}; END IF;`;
function metadataQuery(kind,table){
 const where=`TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${literal(table)}`;
 if(kind==='columns')return `SELECT COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT FROM information_schema.COLUMNS WHERE ${where}`;
 if(kind==='indexes')return `SELECT INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED FROM information_schema.STATISTICS WHERE ${where}`;
 if(kind==='options')return `SELECT ENGINE,TABLE_COLLATION,CREATE_OPTIONS FROM information_schema.TABLES WHERE ${where} AND TABLE_TYPE='BASE TABLE'`;
 return `SELECT k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE,(k.REFERENCED_TABLE_SCHEMA=DATABASE()) REFERENCED_SCHEMA_IS_CURRENT FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME=${literal(table)} AND k.REFERENCED_TABLE_NAME IS NOT NULL`;
}

/** Adds only canonical missing invariants; never repairs historic rows or replaces existing guards. */
export function buildCheckParity(contract,sourceTexts){
 for(const [path,hash]of Object.entries(contract.sources))if(createHash('sha256').update(sourceTexts[path]??'').digest('hex')!==hash)throw new Error('Check parity source drift: '+path);
 const names=new Set();
 for(const check of contract.checks){
  if(names.has(check.name))throw new Error('Duplicate check name '+check.name);names.add(check.name);
  if(!contract.tables[check.table])throw new Error('Missing target metadata '+check.table);
  // Expressions are source-reviewed contract entries; nativeClause is compared byte-for-byte on replay.
 }
 const output=['-- Canonical CHECK parity: reviewed additive constraints only.',
 '-- Quiesce writers and preserve a reviewed backup. All target metadata and invalid rows are checked before DDL.',
 '-- DDL auto-commits; interrupted additions remain and exact replay resumes. No cross-ALTER rollback is claimed.',
 'DELIMITER $$','BEGIN NOT ATOMIC',guard("DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 OR @@check_constraint_checks<>1 OR @@SESSION.sql_mode LIKE '%NO_BACKSLASH_ESCAPES%' OR (@@SESSION.sql_mode NOT LIKE '%STRICT_TRANS_TABLES%' AND @@SESSION.sql_mode NOT LIKE '%STRICT_ALL_TABLES%')",'session_state')];
 for(const [table,metadata]of Object.entries(contract.tables)){
  for(const kind of ['options','columns','indexes','fks'])output.push(guard(`NOT (${equalRows(metadataQuery(kind,table),kind==='options'?[metadata.options]:metadata[kind])})`,table+'_'+kind));
  const additions=contract.checks.filter(c=>c.table===table),corrections=(contract.corrections??[]).filter(c=>c.table===table),excluded=[...additions,...corrections].map(c=>literal(c.name)).join(',');
  const query=`SELECT CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=${literal(table)}${excluded?' AND CONSTRAINT_NAME NOT IN ('+excluded+')':''}`;
  output.push(guard(`NOT (${equalRows(query,metadata.checks.filter(c=>!corrections.some(r=>r.name===c.CONSTRAINT_NAME)))})`,table+'_original_checks'));
  const triggers=contract.triggers.filter(t=>t.EVENT_OBJECT_TABLE===table);
  if(triggers.length){
   const keys=Object.keys(triggers[0]).map(quote).join(',');
   output.push(guard(`NOT (${equalRows(`SELECT ${keys} FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE=${literal(table)}`,triggers)})`,table+'_triggers'));
  }else output.push(guard(`EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE=${literal(table)})`,table+'_triggers'));
 }
 for(const check of contract.checks){
  const existing=`SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=${literal(check.name)}`;
  output.push(guard(`EXISTS(${existing}) AND NOT EXISTS(${existing} AND TABLE_NAME=${literal(check.table)} AND LEVEL='Table' AND BINARY CHECK_CLAUSE=BINARY ${literal(check.nativeClause??check.expression)})`,check.name+'_drift'));
 }
 for(const correction of contract.corrections??[]){
  output.push(guard(`(SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=${literal(correction.table)} AND CONSTRAINT_NAME=${literal(correction.name)} AND LEVEL='Column' AND (BINARY CHECK_CLAUSE=BINARY ${literal(correction.beforeClause)} OR BINARY CHECK_CLAUSE=BINARY ${literal(correction.afterClause)}))<>1`,correction.table+'_'+correction.name+'_correction_drift'));
 }
 for(const check of contract.checks)output.push(guard(`EXISTS(SELECT 1 FROM ${quote(check.table)} WHERE (${check.expression}) IS FALSE)`,check.name+'_invalid_rows'));
 for(const correction of contract.corrections??[])output.push(guard(`EXISTS(SELECT 1 FROM ${quote(correction.table)} WHERE (${correction.expression}) IS FALSE)`,correction.table+'_'+correction.name+'_invalid_rows'));
 output.push(' -- All read-only preflight has passed.');
 for(const check of contract.checks)output.push(` IF NOT EXISTS(SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=${literal(check.table)} AND CONSTRAINT_NAME=${literal(check.name)}) THEN\n  ALTER TABLE ${quote(check.table)} ADD CONSTRAINT ${quote(check.name)} CHECK (${check.expression});\n END IF;`);
 for(const correction of contract.corrections??[])output.push(` IF EXISTS(SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=${literal(correction.table)} AND CONSTRAINT_NAME=${literal(correction.name)} AND BINARY CHECK_CLAUSE=BINARY ${literal(correction.beforeClause)}) THEN\n  -- Approved byte-to-character correction; column type, nullability, collation and indexes are retained.\n  ALTER TABLE ${quote(correction.table)} MODIFY COLUMN ${quote(correction.name)} ${correction.definition} CHECK (${correction.expression});\n END IF;`);
 output.push('END$$','DELIMITER ;','');return output.join('\n');
}
