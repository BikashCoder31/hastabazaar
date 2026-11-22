import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteTextLengthPredicate,buildTextLengthParity} from '../lib/operations/text-length-parity.mjs';
import {schemaTokens} from '../lib/operations/sql-schema-inventory.mjs';
import {readFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {sqlStatements} from '../scripts/testing/verify-current-native.mjs';
import {splitFixtureSql} from '../scripts/portable-mariadb-fixture.mjs';
import {sameFeeSqlDefinition} from '../lib/operations/fee-schema-readiness.mjs';
void test('text length preserves original NULL branches, trimming and bounds',()=>{
 const result=sqliteTextLengthPredicate('label IS NULL OR length(trim(label)) BETWEEN 1 AND 200');
 assert.equal(result,'label IS NULL OR CHAR_LENGTH(SUBSTRING_INDEX(trim(label),(CHAR(0 USING utf8mb4) COLLATE utf8mb4_bin),1)) BETWEEN 1 AND 200');
});
void test('compound predicates retain grouping and both independent length calls',()=>{
 const sql="(status='pending' AND reason IS NULL) OR (status='confirmed' AND length(trim(reason))>=8 AND length(request_id) BETWEEN 1 AND 100)";
 const result=sqliteTextLengthPredicate(sql);assert.equal((result.match(/SUBSTRING_INDEX/g)??[]).length,2);assert.ok(result.startsWith("(status='pending' AND reason IS NULL) OR (status='confirmed' AND "));assert.ok(result.endsWith(' BETWEEN 1 AND 100)'));
});
void test('quoted function-like text is untouched and byte predicates are excluded',()=>{
 assert.ok(sqliteTextLengthPredicate("label<>'length(fake)' AND length(label)>0").includes("label<>'length(fake)'"));
 assert.throws(()=>sqliteTextLengthPredicate('length(CAST(payload AS BLOB))<=8192'),/BLOB/);assert.throws(()=>sqliteTextLengthPredicate('length(trim(reason)'),/Unclosed/);
});
void test('suffix delegates complete preflight before only additive CHECK DDL',()=>{
 const canonical='length(trim(reason))>=10',shape={columns:[],indexes:[],fks:[],checks:[],options:{ENGINE:'InnoDB',TABLE_COLLATION:'utf8mb4_unicode_ci',CREATE_OPTIONS:''}};
 const contract={sources:{},tables:{records:shape},triggers:[],checks:[{table:'records',name:'hb_nul_records_reason',canonical,expression:sqliteTextLengthPredicate(canonical),nativeClause:'calibrated unit fixture'}],corrections:[],nativeCalibration:{checks:1}};
 const sql=buildTextLengthParity(contract,{}),boundary=sql.indexOf('-- All read-only preflight has passed.');assert.ok(sql.indexOf('WHERE (CHAR_LENGTH(SUBSTRING_INDEX(trim(reason)')<boundary);assert.ok(sql.indexOf('ALTER TABLE')>boundary);
 const words=schemaTokens(sql).filter(t=>t.kind==='word').map(t=>t.value.toUpperCase());for(const word of ['DROP','MODIFY','INSERT','UPDATE','DELETE'])assert.ok(!words.includes(word));
 assert.throws(()=>buildTextLengthParity({...contract,corrections:[{}]},{}),/only add/);assert.throws(()=>buildTextLengthParity({...contract,checks:[{...contract.checks[0],expression:'1=1'}]},{}),/differs/);
 assert.throws(()=>buildTextLengthParity({...contract,nativeCalibration:undefined},{}),/calibration/);assert.throws(()=>buildTextLengthParity({...contract,checks:[{...contract.checks[0],nativeClause:null}]},{}),/calibrated/);
});
void test('calibrated19guard companion reconstructs the accepted prefix from maintained sources',async(t)=>{
 const root=new URL('../',import.meta.url),contract=JSON.parse(await readFile(new URL('lib/operations/text-length-parity-contract.json',root),'utf8'));
 assert.equal(contract.checks.length,19);assert.equal(Object.keys(contract.tables).length,14);assert.equal(contract.corrections.length,0);assert.ok(contract.checks.every(c=>c.sources.length&&c.nativeClause));
 for(const check of contract.checks){
  assert.ok(sameFeeSqlDefinition(check.nativeClause,check.nativeClause));
  const changedDelimiter=check.nativeClause.replaceAll('char(0 using','char(1 using');
  assert.ok(!sameFeeSqlDefinition(check.nativeClause,changedDelimiter));
 }
 const sources=Object.fromEntries(await Promise.all(Object.keys(contract.sources).map(async path=>[path,await readFile(new URL(path,root),'utf8')]))),sql=buildTextLengthParity(contract,sources);
 assert.equal(sql,await readFile(new URL('deployment/babal/mariadb-text-length-parity.sql',root),'utf8'));
 assert.equal(sqlStatements(sql).length,1);assert.equal(splitFixtureSql(sql).length,1);
 const projectRoot=fileURLToPath(root),artifacts=resolve(projectRoot,'.test-artifacts');await mkdir(artifacts,{recursive:true});
 const output=await mkdtemp(resolve(artifacts,'nul-source-reconstruction-'));
 const publicPaths=['deployment/babal/mariadb-schema.sql','deployment/babal/mariadb-reset-empty-import.sql'];
 const originalPublic=await Promise.all(publicPaths.map(path=>readFile(resolve(projectRoot,path))));
 await promisify(execFile)(process.execPath,[resolve(projectRoot,'scripts/generate-mariadb-schema.mjs'),'--output-directory='+output],{cwd:projectRoot,env:{...process.env,TEMP:output,TMP:output,TMPDIR:output},timeout:30000});
 const forwardSuffix=(await readFile(new URL('deployment/babal/mariadb-native-order-stock-governance.sql',root),'utf8')).replaceAll('\r\n','\n');
 const generated=await readFile(resolve(output,'mariadb-schema.sql')),suffix=Buffer.from('\n'+sql+'\n'+forwardSuffix),prefix=generated.subarray(0,generated.length-suffix.length);
 assert.deepEqual(generated.subarray(prefix.length),suffix);assert.equal(createHash('sha256').update(prefix).digest('hex'),contract.prefixSha256);
 assert.deepEqual(await Promise.all(publicPaths.map(path=>readFile(resolve(projectRoot,path)))),originalPublic);
 t.diagnostic('Owned generated output retained: '+output);
});
