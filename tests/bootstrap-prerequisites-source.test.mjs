import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const maria = await readFile(new URL('deployment/babal/mariadb-policy-commission-9-percent.sql',root),'utf8');
const sqlite = await readFile(new URL('drizzle/0043_policy_commission_9_percent.sql',root),'utf8');
const later = await Promise.all((await readdir(new URL('drizzle/',root))).filter(n=>/^\d{4}.*\.sql$/.test(n)&&n>'0043_zz').map(async name=>({name,sql:await readFile(new URL('drizzle/'+name,root),'utf8')})));
let build;
try { ({buildBootstrapPrerequisites:build}=await import('../lib/operations/bootstrap-prerequisites.mjs')); }
catch(e) { if(e.code!=='ERR_MODULE_NOT_FOUND')throw e; }
void test('bootstrap restores missing schema without copying policy activation',async()=>{
 const sql=build?build({maria,sqlite,later}):await readFile(new URL('deployment/babal/mariadb-schema.sql',root),'utf8');
 for(const name of ['commission_base_paisa','commission_rule_version','seller_agreement_version','original_seal_intact','settlement_terms_reference']) assert.ok(new RegExp('ADD COLUMN '+name+' ').test(sql),'missing '+name);
 assert.doesNotMatch(sql,/INSERT\s+(?:IGNORE\s+)?INTO marketplace_settings/i);
});
void test('rejects absent, duplicate, drifted and later-overridden authoritative definitions',()=>{
 assert.equal(typeof build,'function','guarded generator is missing');
 for(const changed of [maria.replace('commission_base_paisa BIGINT NULL','commission_base_paisa BIGINT UNSIGNED NULL'),maria.replace(/ALTER TABLE order_items ADD COLUMN IF NOT EXISTS commission_base_paisa[^;]+;/,''),maria+'\nALTER TABLE order_items ADD COLUMN IF NOT EXISTS commission_base_paisa BIGINT NULL;']) assert.throws(()=>build({maria:changed,sqlite,later}));
 assert.throws(()=>build({maria,sqlite:sqlite.replace('commission_base_paisa INTEGER','commission_base_paisa TEXT'),later}));
 assert.throws(()=>build({maria,sqlite,later:[...later,{name:'9999_drift.sql',sql:'ALTER TABLE order_items DROP COLUMN commission_base_paisa;'}]}));
});
void test('only the exact reviewed prospective pricing validation may read protected bootstrap columns',()=>{
 const pricing=later.find(file=>file.name==='0157_order_item_pricing_snapshots.sql');
 assert.ok(pricing);
 const existing=build({maria,sqlite,later});
 const historical=later.filter(file=>file!==pricing);
 assert.equal(existing,build({maria,sqlite,later:historical}),'the historical schema bridge must stay byte-for-byte identical');
 for(const change of [
  {name:pricing.name,sql:pricing.sql.replace("'order_item_pricing_mismatch'","'unexpected_pricing_mismatch'")},
  {name:pricing.name,sql:pricing.sql+'\nALTER TABLE order_items DROP COLUMN commission_base_paisa;'},
  {name:'0157_renamed_validation.sql',sql:pricing.sql},
 ]) assert.throws(()=>build({maria,sqlite,later:[...historical,change]}),/Review later bootstrap override/);
 assert.throws(()=>build({maria,sqlite,later:[...later,pricing]}),/Review later bootstrap override/);
});
void test('rejects drift for every selected column and refund index, without treating policy data as schema',()=>{
 for(const name of ['commission_base_paisa','commission_rule_version','seller_agreement_version','original_seal_intact','settlement_terms_reference']){
  const statement=maria.split(';').find(s=>new RegExp('ADD COLUMN IF NOT EXISTS '+name+' ').test(s)).trim()+';';
  assert.throws(()=>build({maria:maria.replace(statement,''),sqlite,later}),name+' absence');
  assert.throws(()=>build({maria:maria+'\n'+statement,sqlite,later}),name+' duplication');
  assert.throws(()=>build({maria:maria.replace(statement,statement.replace(/;$/,' DEFAULT 1;')),sqlite,later}),name+' default drift');
 }
 for(const changed of [maria.replace('(refund_id, type)','(type, refund_id)'),maria.replace('CREATE UNIQUE INDEX','CREATE INDEX'),maria.replace('idx_seller_ledger_refund_type_unique','idx_wrong')])assert.throws(()=>build({maria:changed,sqlite,later}));
 const a=build({maria,sqlite,later});
 const b=build({maria:maria.replace("'900'","'1234'"),sqlite:sqlite.replace("'900'","'1234'"),later});
 assert.equal(a,b,'policy data must never influence the schema-only companion');
});
