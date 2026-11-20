// Schema-only bridge for omissions from the historical 0020 bootstrap.
// Inputs are authoritative source text; no connection or data access occurs here.
import {createHash} from 'node:crypto';

const columns = [
 ['order_items','commission_base_paisa','BIGINT NULL','INTEGER'],
 ['order_items','commission_rule_version','LONGTEXT NULL','TEXT'],
 ['order_items','seller_agreement_version','LONGTEXT NULL','TEXT'],
 ['return_requests','original_seal_intact','BIGINT NOT NULL DEFAULT 0','INTEGER NOT NULL DEFAULT 0'],
 ['seller_profiles','settlement_terms_reference','LONGTEXT NULL','TEXT'],
];
// The prospective pricing migration validates its original snapshot using three
// protected columns. The one reviewed validation statement can read them;
// every other statement remains subject to the existing override check.
const reviewedPricingRead={
 name:'0157_order_item_pricing_snapshots.sql',
 sha256:'a70d2626f56ece0c6e0f7721ecfebb086bcf7c34ef765e039c9a4af786821bf8',
};
function unreviewedLaterSql(file) {
 if(file.name!==reviewedPricingRead.name)return file.sql;
 let reviewed=0;
 const remainder=file.sql.replaceAll('\r\n','\n').split('--> statement-breakpoint').filter(statement=>{
  const exact=createHash('sha256').update(statement.trim()).digest('hex')===reviewedPricingRead.sha256;
  if(exact)reviewed++;
  return !exact;
 });
 if(reviewed!==1)throw new Error('Review later bootstrap override: '+file.name);
 return remainder.join('\n');
}
const clean=s=>s.replace(/--[^\n]*/g,'').replace(/`/g,'').replace(/\s+/g,' ').trim();
function validateSource(source, dialect) {
 const statements=clean(source).split(';').map(s=>s.trim()).filter(Boolean);
 for(const [table,name,maria,sqlite] of columns) {
  const found=statements.filter(s=>new RegExp(`^ALTER TABLE ${table} ADD COLUMN (?:IF NOT EXISTS )?${name}\\b`,'i').test(s));
  const expected=`ALTER TABLE ${table} ADD COLUMN ${dialect==='maria'?'IF NOT EXISTS ':''}${name} ${dialect==='maria'?maria:sqlite}`;
  if(found.length!==1 || found[0]!==expected)throw new Error(`Invalid ${dialect} bootstrap definition: ${table}.${name}`);
 }
 const indexes=statements.filter(s=>/^CREATE .*INDEX .*idx_seller_ledger_refund_type_unique\b/i.test(s));
 if(indexes.length!==1 || indexes[0]!==`CREATE UNIQUE INDEX ${dialect==='maria'?'IF NOT EXISTS ':''}idx_seller_ledger_refund_type_unique ON seller_ledger_entries (refund_id, type)`)throw new Error('Invalid refund/type canonical index');
}
const fail = message => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_${message}';`;
const colWhere=(table,name)=>`TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND COLUMN_NAME='${name}'`;
export function buildBootstrapPrerequisites({maria,sqlite,later}) {
 validateSource(maria,'maria'); validateSource(sqlite,'sqlite');
 if(!Array.isArray(later))throw new Error('Later migration inventory required');
 if(later.filter(file=>file.name===reviewedPricingRead.name).length>1)
  throw new Error('Review later bootstrap override: '+reviewedPricingRead.name);
 for(const file of later) {
  const sql=clean(unreviewedLaterSql(file));
  if(columns.some(([,name])=>new RegExp(`\\b${name}\\b`,'i').test(sql)) || /\bidx_seller_ledger_refund_(?:type_)?unique\b/i.test(sql)) throw new Error('Review later bootstrap override: '+file.name);
 }
 const sql=[`-- Schema-only bootstrap prerequisites. No policy activation or historical backfill.
-- MariaDB 10.11+. Quiesce writers and preserve a reviewed backup before applying.
-- Every metadata and duplicate check precedes the first ALTER. DDL auto-commits.
-- on interruption re-inspect before resuming. Completed replay performs no DDL.
-- Anonymous compound block avoids creating/replacing any persistent routine.
DELIMITER $$
BEGIN NOT ATOMIC
 DECLARE old_index_count INT DEFAULT 0;
 DECLARE new_index_count INT DEFAULT 0;
 IF DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 THEN
  ${fail('database_or_fk_state')}
 END IF;
 IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME IN ('order_items','return_requests','seller_profiles','seller_ledger_entries')
  AND TABLE_TYPE='BASE TABLE' AND ENGINE='InnoDB' AND TABLE_COLLATION='utf8mb4_unicode_ci')<>4 THEN
  ${fail('parent_metadata')}
 END IF;`];
 for(const [table,name,definition] of columns){
  const isText=definition.startsWith('LONGTEXT'), required=definition.includes('NOT NULL');
  const predicate=`DATA_TYPE='${isText?'longtext':'bigint'}' AND COLUMN_TYPE ${isText?"='longtext'":"IN ('bigint','bigint(20)')"}
   AND IS_NULLABLE='${required?'NO':'YES'}' AND ${required?"COLUMN_DEFAULT='0'":"(COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT='NULL')"}
   AND EXTRA='' AND COALESCE(GENERATION_EXPRESSION,'')=''
   AND ${isText?"CHARACTER_SET_NAME='utf8mb4' AND COLLATION_NAME='utf8mb4_unicode_ci'":"CHARACTER_SET_NAME IS NULL AND COLLATION_NAME IS NULL"}`;
  sql.push(` IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE ${colWhere(table,name)})
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE ${colWhere(table,name)} AND ${predicate}) THEN
  ${fail(name+'_metadata')}
 END IF;`);
 }
 sql.push(` IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_ledger_entries'
  AND ((COLUMN_NAME='refund_id' AND IS_NULLABLE='YES' AND (COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT='NULL'))
    OR (COLUMN_NAME='type' AND IS_NULLABLE='NO' AND COLUMN_DEFAULT IS NULL))
  AND COLUMN_TYPE='varchar(191)' AND CHARACTER_SET_NAME='utf8mb4' AND COLLATION_NAME='utf8mb4_unicode_ci'
  AND EXTRA='' AND COALESCE(GENERATION_EXPRESSION,'')='')<>2 THEN
  ${fail('ledger_columns')}
 END IF;
 SELECT COUNT(*) INTO old_index_count FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_ledger_entries' AND INDEX_NAME='idx_seller_ledger_refund_unique';
 SELECT COUNT(*) INTO new_index_count FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_ledger_entries' AND INDEX_NAME='idx_seller_ledger_refund_type_unique';
 IF old_index_count NOT IN (0,1) OR new_index_count NOT IN (0,2) OR (old_index_count=0 AND new_index_count=0) THEN
  ${fail('index_checkpoint')}
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_ledger_entries'
  AND INDEX_NAME IN ('idx_seller_ledger_refund_unique','idx_seller_ledger_refund_type_unique')
  AND (NON_UNIQUE<>0 OR INDEX_TYPE<>'BTREE' OR SUB_PART IS NOT NULL OR IGNORED<>'NO'
   OR COLLATION IS NULL OR COLLATION<>'A' OR COLUMN_NAME IS NULL
   OR NOT ((SEQ_IN_INDEX=1 AND COLUMN_NAME='refund_id')
     OR (INDEX_NAME='idx_seller_ledger_refund_type_unique' AND SEQ_IN_INDEX=2 AND COLUMN_NAME='type')))) THEN
  ${fail('index_metadata')}
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_ledger_entries'
  AND NON_UNIQUE=0 AND INDEX_NAME NOT IN ('idx_seller_ledger_refund_unique','idx_seller_ledger_refund_type_unique')
  GROUP BY INDEX_NAME HAVING COUNT(*)=1 AND MAX(COLUMN_NAME)='refund_id') THEN
  ${fail('alternate_refund_uniqueness')}
 END IF;
 IF EXISTS (SELECT 1 FROM seller_ledger_entries WHERE refund_id IS NOT NULL GROUP BY refund_id,type HAVING COUNT(*)>1) THEN
  ${fail('duplicate_refund_type')}
 END IF;
 -- All preconditions above are read-only. Known partial additions resume below.`);
 // One ALTER per parent; missing columns only. Existing definitions are never rewritten.
 for(const table of ['order_items','return_requests','seller_profiles']) {
  sql.push(` SET @hb_bootstrap_ddl='';`);
  for(const [,name,definition] of columns.filter(c=>c[0]===table))sql.push(` IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE ${colWhere(table,name)}) THEN
  SET @hb_bootstrap_ddl=CONCAT(@hb_bootstrap_ddl,IF(@hb_bootstrap_ddl='','',', '),'ADD COLUMN ${name} ${definition}');
 END IF;`);
  sql.push(` IF @hb_bootstrap_ddl<>'' THEN
  SET @hb_bootstrap_ddl=CONCAT('ALTER TABLE ${table} ',@hb_bootstrap_ddl);
  PREPARE hb_bootstrap_stmt FROM @hb_bootstrap_ddl;
  EXECUTE hb_bootstrap_stmt;
  DEALLOCATE PREPARE hb_bootstrap_stmt;
 END IF;`);
 }
 sql.push(` SET @hb_bootstrap_ddl=NULL;
 IF new_index_count=0 THEN
  ALTER TABLE seller_ledger_entries ADD UNIQUE INDEX idx_seller_ledger_refund_type_unique (refund_id,type);
 END IF;
 IF old_index_count=1 THEN
  ALTER TABLE seller_ledger_entries DROP INDEX idx_seller_ledger_refund_unique;
 END IF;
END$$
DELIMITER ;
`);
 const result=sql.join('\n');
 if(/\b(?:INSERT|UPDATE|DELETE|REPLACE|TRUNCATE)\s+(?:INTO|TABLE|FROM|IGNORE)\b/i.test(result))throw new Error('Unexpected data mutation in bootstrap companion');
 return result;
}
