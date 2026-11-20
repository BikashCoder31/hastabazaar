import {createHash} from 'node:crypto';
const literal=value=>"'"+String(value).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const quote=name=>'`'+name.replaceAll('`','``')+'`';
const predicate=row=>Object.entries(row).map(([key,value])=>value===null?`${quote(key)} IS NULL`:typeof value==='number'?`${quote(key)}=${value}`:`BINARY ${quote(key)} <=> BINARY ${literal(value)}`).join(' AND ');
const equalRows=(query,rows)=>`(SELECT COUNT(*) FROM (${query}) hb_rows)=${rows.length}`+(rows.length?` AND NOT EXISTS(SELECT 1 FROM (${query}) hb_rows WHERE NOT (${rows.map(r=>'('+predicate(r)+')').join(' OR ')}))`:'');
const fail=code=>`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_completion_${code}';`;
const guard=(condition,code)=>` IF ${condition} THEN ${fail(code)} END IF;`;
const existsTable=name=>`EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${literal(name)})`;
const existsColumn=(table,name)=>`EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${literal(table)} AND COLUMN_NAME=${literal(name)})`;
const existsTrigger=name=>`EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=${literal(name)})`;
function queryMetadata(kind,table){
 const where=`TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${literal(table)}`;
 if(kind==='columns')return `SELECT COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE ${where}`;
 if(kind==='indexes')return `SELECT INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED FROM information_schema.STATISTICS WHERE ${where}`;
 if(kind==='options')return `SELECT ENGINE,TABLE_COLLATION,CREATE_OPTIONS FROM information_schema.TABLES WHERE ${where} AND TABLE_TYPE='BASE TABLE'`;
 if(kind==='checks')return `SELECT CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=${literal(table)}`;
 return `SELECT k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME=${literal(table)} AND k.REFERENCED_TABLE_NAME IS NOT NULL`;
}
function indexStates(name,expected){
 if(name==='referral_redemptions')return[expected,[...expected.filter(i=>i.INDEX_NAME!=='idx_referrals_referrer'),{...expected.find(i=>i.INDEX_NAME==='idx_referrals_referrer'),INDEX_NAME:'referrer_id',SEQ_IN_INDEX:1,COLUMN_NAME:'referrer_id'}]];
 if(name==='order_email_jobs')return[true,false].flatMap(event=>[true,false].map(due=>[...expected.filter(i=>i.INDEX_NAME!=='idx_order_email_event'||event).filter(i=>i.INDEX_NAME!=='idx_order_email_due'||due),...event?[]:[{...expected.find(i=>i.INDEX_NAME==='idx_order_email_event'),INDEX_NAME:'order_id',NON_UNIQUE:1,SEQ_IN_INDEX:1,COLUMN_NAME:'order_id'}]]));
 return[expected];
}
const execute=sql=>` SET @hb_completion_sql=${literal(sql.replace(/;\s*$/,''))};\n PREPARE hb_completion_statement FROM @hb_completion_sql;\n EXECUTE hb_completion_statement;\n DEALLOCATE PREPARE hb_completion_statement;`;
export function buildBootstrapCompletion({reference,metadata,sourceTexts}){
 for(const [path,hash]of Object.entries(reference.sources))if(createHash('sha256').update(sourceTexts[path]??'').digest('hex')!==hash)throw new Error('Bootstrap completion source drift: '+path);
 const output=['-- Reviewed schema completion. Quiesce writers and preserve a reviewed backup before applying.',
 '-- No policy activation or historical consent/audit backfill. DDL auto-commits.',
 '-- Complete replay performs no DDL. Recognized interrupted additions resume safely.',
 'DELIMITER $$','BEGIN NOT ATOMIC',
 guard("DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 OR @@SESSION.sql_mode LIKE '%NO_BACKSLASH_ESCAPES%'",'session_state')];
 for(const table of reference.tables){
  const expected=metadata.tables[table.name];if(!expected)throw new Error('Missing reviewed metadata '+table.name);
  for(const kind of ['options','columns','fks','checks'])output.push(guard(`${existsTable(table.name)} AND NOT (${equalRows(queryMetadata(kind,table.name),kind==='options'?[expected.options]:expected[kind])})`,table.name+'_'+kind));
  output.push(guard(`${existsTable(table.name)} AND NOT (${indexStates(table.name,expected.indexes).map(rows=>'('+equalRows(queryMetadata('indexes',table.name),rows)+')').join(' OR ')})`,table.name+'_indexes'));
  const allowed=reference.triggers.filter(t=>metadata.triggers.find(n=>n.TRIGGER_NAME===t.name)?.EVENT_OBJECT_TABLE===table.name).map(t=>literal(t.name));
  output.push(guard(`EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE=${literal(table.name)}${allowed.length?' AND TRIGGER_NAME NOT IN ('+allowed.join(',')+')':''})`,table.name+'_unexpected_trigger'));
 }
 for(const column of reference.columns){
  const expected=metadata.tables[column.table].columns.find(c=>c.COLUMN_NAME===column.name);const {ORDINAL_POSITION:_,...shape}=expected;
  output.push(guard(`NOT ${existsTable(column.table)}`,column.table+'_absent'));
  output.push(guard(`${existsColumn(column.table,column.name)} AND NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${literal(column.table)} AND ${predicate(shape)})`,column.name+'_column'));
 }
 const parents=new Map();for(const table of reference.tables)for(const fk of metadata.tables[table.name].fks)if(!reference.tables.some(t=>t.name===fk.REFERENCED_TABLE_NAME))parents.set(fk.REFERENCED_TABLE_NAME+'.'+fk.REFERENCED_COLUMN_NAME,{table:fk.REFERENCED_TABLE_NAME,name:fk.REFERENCED_COLUMN_NAME});
 for(const [table,names]of Object.entries({products:['id','sku'],refunds:['order_id'],orders:['id','status','updated_at','customer_id','customer_phone'],managed_commercial_snapshots:['id'],managed_settlement_entries:['id']}))for(const name of names)parents.set(table+'.'+name,{table,name});
 for(const parent of parents.values()){
  const {ORDINAL_POSITION:_,...shape}=metadata.tables[parent.table].columns.find(c=>c.COLUMN_NAME===parent.name);
  output.push(guard(`NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${literal(parent.table)} AND ${predicate(shape)})`,parent.table+'_'+parent.name+'_parent'));
 }
 for(const table of new Set([...parents.values()].map(p=>p.table)))output.push(guard(`NOT EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${literal(table)} AND TABLE_TYPE='BASE TABLE' AND ENGINE='InnoDB' AND TABLE_COLLATION='utf8mb4_unicode_ci')`,table+'_parent_engine'));
 for(const table of reference.tables)for(const fk of metadata.tables[table.name].fks)if(!reference.tables.some(t=>t.name===fk.REFERENCED_TABLE_NAME))output.push(guard(`NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${literal(fk.REFERENCED_TABLE_NAME)} AND COLUMN_NAME=${literal(fk.REFERENCED_COLUMN_NAME)} AND SEQ_IN_INDEX=1 AND SUB_PART IS NULL AND IGNORED='NO')`,table.name+'_parent_index'));
 for(const trigger of reference.triggers){const expected=metadata.triggers.find(t=>t.TRIGGER_NAME===trigger.name);const {ACTION_ORDER:_,...shape}=expected;
  output.push(guard(`${existsTrigger(trigger.name)} AND NOT EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND ${predicate(shape)})`,trigger.name+'_trigger'));
 }
 output.push(guard(`NOT ${existsTrigger('wallet_refund_guard')}`,'wallet_refund_guard_absent'));
 output.push(guard(`${existsTrigger('wallet_refund_lock')} AND NOT EXISTS(SELECT 1 FROM information_schema.TRIGGERS l JOIN information_schema.TRIGGERS g ON g.TRIGGER_SCHEMA=l.TRIGGER_SCHEMA WHERE l.TRIGGER_SCHEMA=DATABASE() AND l.TRIGGER_NAME='wallet_refund_lock' AND g.TRIGGER_NAME='wallet_refund_guard' AND l.ACTION_ORDER<g.ACTION_ORDER)`,'wallet_refund_lock_order'));
 // Unique-index duplicates must refuse before any CREATE/ALTER in the whole batch.
 output.push(` IF ${existsTable('order_email_jobs')} THEN\n${guard('EXISTS(SELECT 1 FROM order_email_jobs GROUP BY order_id,order_status HAVING COUNT(*)>1)','order_email_duplicate')}\n END IF;`);
 output.push(' -- All preflight checks above are read-only. Changes begin below.');
 for(const table of reference.tables)output.push(` IF NOT ${existsTable(table.name)} THEN\n${execute(table.sql)}\n END IF;`);
 for(const column of reference.columns)output.push(` IF NOT ${existsColumn(column.table,column.name)} THEN\n  ALTER TABLE ${quote(column.table)} ADD COLUMN ${quote(column.name)} ${column.definition};\n END IF;`);
 for(const index of reference.indexes){const table=/\bON\s+(\w+)/i.exec(index.sql)[1];output.push(` IF NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${literal(table)} AND INDEX_NAME=${literal(index.name)}) THEN\n${execute(index.sql)}\n END IF;`);}
 for(const trigger of reference.triggers){let sql=trigger.sql;if(trigger.name==='wallet_refund_lock')sql=sql.replace('FOR EACH ROW BEGIN','FOR EACH ROW PRECEDES wallet_refund_guard BEGIN');output.push(` IF NOT ${existsTrigger(trigger.name)} THEN\n${execute(sql)}\n END IF;`);}
 output.push(` -- Canonical0030 retains historical claims and maps only previously unclaimed SKUs.
 IF EXISTS(SELECT 1 FROM products p WHERE NOT EXISTS(SELECT 1 FROM product_sku_claims c WHERE c.sku=p.sku)) THEN
  INSERT IGNORE INTO product_sku_claims(sku,product_id) SELECT sku,MIN(id) FROM products GROUP BY sku;
 END IF;
 SET @hb_completion_sql=NULL;
END$$
DELIMITER ;
`);
 return output.join('\n');
}
