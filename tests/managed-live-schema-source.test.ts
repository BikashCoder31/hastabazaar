import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as schema from '../db/schema';
import {ormSourceContracts} from './helpers/orm-source-contract';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const contracts=ormSourceContracts(schema);
function fields(body:string){let depth=0,start=0;const out:string[]=[];for(let index=0;index<body.length;index++){if(body[index]==='(')depth++;if(body[index]===')')depth--;if(body[index]===','&&depth===0){out.push(body.slice(start,index).trim());start=index+1;}}out.push(body.slice(start).trim());return out;}
function checks(body:string){const out:string[]=[];for(const match of body.matchAll(/CHECK\(/g)){let depth=1,index=match.index!+6;const start=index;for(;index<body.length&&depth;index++){if(body[index]==='(')depth++;if(body[index]===')')depth--;}assert.equal(depth,0);out.push(body.slice(start,index-1));}return out;}
const normalize=(value:string)=>value.replace(/"[a-z_]+"\./g,'').replaceAll('"','').replace(/\s+/g,'');
void test('ORM managed live table columns retain the exact0145/0146 source contracts',async()=>{
 let count=0;
 for(const file of ['0145_managed_live_activation.sql','0146_managed_live_financial.sql']){const source=await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8');
  for(const match of source.matchAll(/CREATE TABLE (\w+)\s*\(([\s\S]+?)\);/g)){const name=match[1],table=contracts[name];assert.ok(table,'ORM includes '+name);count++;
   const columns=fields(match[2]).filter(field=>! /^(CHECK|UNIQUE|PRIMARY KEY|FOREIGN KEY)\b/.test(field)).map(field=>{const parsed=field.match(/^(\w+)\s+(TEXT|INTEGER)([\s\S]*)$/);assert.ok(parsed);return {name:parsed[1],type:parsed[2].toLowerCase(),notNull:/NOT NULL|PRIMARY KEY/.test(parsed[3]),default:parsed[3].match(/DEFAULT ('[^']*'|-?\d+)/)?.[1]};});
   assert.deepEqual(table.columns.map((column:{name:string})=>column.name),columns.map(column=>column.name),name+' retains every source column in order');
   for(const expected of columns){const actual=table.columns.find((column:{name:string})=>column.name===expected.name);assert.ok(actual);assert.equal(actual.type,expected.type);assert.equal(actual.notNull,expected.notNull);if(expected.default!==undefined)assert.equal(actual.default,expected.default.startsWith("'")?expected.default.slice(1,-1):Number(expected.default));}
   for(const field of fields(match[2])){
    const foreign=field.match(/^(\w+)\s+[\s\S]*?REFERENCES (\w+)\((\w+)\)/);if(foreign)assert.ok(table.foreignKeys.some((key:{columns:string[];foreignTable:string;foreignColumns:string[]})=>key.columns.join(',')===foreign[1]&&key.foreignTable===foreign[2]&&key.foreignColumns.join(',')===foreign[3]),name+' retains '+foreign[1]+' parent proof');
    const unique=field.match(/^UNIQUE\(([^)]+)\)/),inline=field.match(/^(\w+)\s+[\s\S]*?\bUNIQUE\b/),names=unique?unique[1].split(',').map(column=>column.trim()):inline?[inline[1]]:null;
    if(names)assert.ok(table.indexes.some(index=>index.unique&&index.columns.join(',')===names.join(','))||table.uniqueConstraints.some((columns:string[])=>columns.join(',')===names.join(','))||names.length===1&&table.columns.some((column:{name:string;unique:boolean})=>column.name===names[0]&&column.unique),name+' retains uniqueness of '+names.join(','));
   }
   for(const predicate of checks(match[2]))assert.ok(table.checks.some(check=>typeof check.sql==='string'&&normalize(check.sql)===normalize(predicate)),name+' retains CHECK '+predicate);
  }
 }assert.equal(count,8);
});
void test('ORM existing managed provenance columns are nullable only as retained source permits and legacy indexes remain',()=>{
 const indexes:Record<string,string[]>={managed_commercial_snapshots:['idx_managed_snapshots_order_item','idx_managed_snapshots_seller_created'],managed_payouts:['idx_managed_payouts_number','idx_managed_payouts_request','idx_managed_payouts_status'],managed_invoice_groups:['idx_managed_invoice_number','idx_managed_invoice_request','idx_managed_invoice_order_issuer'],managed_invoice_adjustments:['idx_managed_invoice_adjustments_number','idx_managed_invoice_adjustments_request','idx_managed_invoice_adjustments_invoice']};
 for(const[table,names]of Object.entries(indexes)){const config=contracts[table];assert.equal(config.columns.find((column:{name:string})=>column.name==='simulation_label')?.notNull,false);const kind=config.columns.find((column:{name:string})=>column.name==='record_kind');assert.ok(kind);assert.equal(kind.notNull,true);assert.equal(kind.default,'simulation');assert.deepEqual(config.indexes.map((index:{name:string})=>index.name),names);}
 const snapshot=contracts.managed_commercial_snapshots;
 for(const[column,parent]of [['live_activation_decision_id','managed_live_activation_decisions'],['live_clearance_id','managed_live_clearances'],['live_financial_scope_id','managed_live_financial_scopes'],['live_customer_id','users']])assert.ok(snapshot.foreignKeys.some((key:{columns:string[];foreignTable:string})=>key.columns.join(',')===column&&key.foreignTable===parent));
});
void test('managed live shared source inclusion and recovery reset preserve dependency ordering',async()=>{
 const generator=await readFile(new URL('../scripts/generate-mariadb-schema.mjs',import.meta.url),'utf8');
 assert.ok(generator.includes('mariadb-managed-live-activation.sql'),'Read the exact retained0145 parity source');assert.ok(generator.includes('mariadb-managed-live-financial.sql'),'Read the exact retained0146 parity source');
 const prior=generator.indexOf('fundingBankReversalFreshnessSql.trim()'),activation=generator.indexOf('managedLiveActivationSql.trim()'),financial=generator.indexOf('managedLiveFinancialSql.trim()');assert.ok(prior>=0&&activation>prior&&financial>activation);
 const reset=generator.slice(generator.indexOf('const resetTables = ['));
 for(const name of ['managed_live_invoice_adjustment_sources','managed_live_invoice_numbers','managed_live_invoice_series','managed_live_financial_scopes','managed_live_activation_decisions','managed_live_clearances','managed_clearance_evidence_files','managed_clearance_evidence_intents'])assert.ok(reset.includes("'"+name+"'"),'Empty-import reset source retains '+name);
 assert.ok(reset.indexOf("'managed_live_invoice_numbers'")<reset.indexOf("'managed_live_financial_scopes'"));assert.ok(reset.indexOf("'managed_live_activation_decisions'")<reset.indexOf("'managed_live_clearances'"));assert.ok(reset.indexOf("'managed_clearance_evidence_files'")<reset.indexOf("'managed_clearance_evidence_intents'"));
 const normalizeSource=(source:string)=>source.replaceAll('\r\n','\n').replace(/[ \t]+$/gm,'').trim();
 const[combined,recovery,activationSource,financialSource]=await Promise.all(['mariadb-schema.sql','mariadb-reset-empty-import.sql','mariadb-managed-live-activation.sql','mariadb-managed-live-financial.sql'].map(name=>readFile(new URL('../deployment/babal/'+name,import.meta.url),'utf8')));
 assert.ok(combined.includes(normalizeSource(activationSource)));assert.ok(combined.includes(normalizeSource(financialSource)));assert.ok(recovery.endsWith(combined));
 assert.ok(combined.indexOf(normalizeSource(activationSource))<combined.indexOf(normalizeSource(financialSource)));
 for(const name of ['managed_live_invoice_adjustment_sources','managed_live_invoice_numbers','managed_live_invoice_series','managed_live_financial_scopes','managed_live_activation_decisions','managed_live_clearances','managed_clearance_evidence_files','managed_clearance_evidence_intents'])assert.ok(recovery.includes('DROP TABLE IF EXISTS `'+name+'`;'));
});
void test('retained managed live SQLite and Maria sources exactly match captured generator output without rewriting them',()=>{
 const project=fileURLToPath(new URL('../',import.meta.url)),result=JSON.parse(execFileSync(process.execPath,['--import','tsx','scripts/check-managed-live-source-parity.mjs'],{cwd:project,encoding:'utf8'}));assert.equal(result.status,'PASS');assert.equal(result.capturedWritesOnly,true);assert.equal(result.results.length,4);
});
void test('Maria evidence iteration retains both literal JSON_TABLE paths after generator replacement',async()=>{
 const source=await readFile(new URL('../deployment/babal/mariadb-managed-live-activation.sql',import.meta.url),'utf8');assert.ok(/JSON_TABLE\(NEW\.evidence_ids_json,'\$\[\*\]' COLUMNS\(evidence_id VARCHAR\(191\) PATH '\$'\)\)/.test(source),'Keep array path $[*] and scalar path $ literal in the native evidence guard.');
});
