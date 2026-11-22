import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCheckParity} from '../lib/operations/check-parity.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sqlStatements} from '../scripts/testing/verify-current-native.mjs';
import {splitFixtureSql} from '../scripts/portable-mariadb-fixture.mjs';
const shape={columns:[],indexes:[],fks:[],checks:[],options:{ENGINE:'InnoDB',TABLE_COLLATION:'utf8mb4_unicode_ci',CREATE_OPTIONS:''}};
const contract={version:1,sources:{},tables:{first:shape,last:shape},triggers:[],checks:[{table:'first',name:'first_enum',expression:"HEX(status) IN ('6F6B')"},{table:'last',name:'last_amount',expression:'amount IS NULL OR amount>=0'}]};
void test('all schema and invalid-row preflight precedes first additive DDL',()=>{
 const sql=buildCheckParity(contract,{}),boundary=sql.indexOf('-- All read-only preflight has passed.');
 assert.ok(boundary>0);assert.ok(sql.indexOf('FROM `last` WHERE (amount IS NULL OR amount>=0) IS FALSE')<boundary);
 assert.ok(sql.indexOf('ALTER TABLE')>boundary);assert.doesNotMatch(sql,/DROP\s|DELETE\s|UPDATE\s+`|INSERT\s|FOREIGN_KEY_CHECKS\s*=\s*0/i);
});
void test('replay checks constraint level, table, exact expression, and enabled guards',()=>{
 const sql=buildCheckParity(contract,{});assert.match(sql,/LEVEL='Table'/);assert.match(sql,/CHECK_CLAUSE/);assert.match(sql,/check_constraint_checks<>1/);assert.match(sql,/FOREIGN_KEY_CHECKS<>1/);assert.match(sql,/IF NOT EXISTS/);
});
void test('source drift fails closed before producing companion SQL',()=>{
 assert.throws(()=>buildCheckParity({...contract,sources:{'canonical.sql':'wrong'}},{'canonical.sql':'changed'}),/source drift/);
});
void test('duplicate names and absent target metadata are rejected',()=>{
 assert.throws(()=>buildCheckParity({...contract,checks:[...contract.checks,contract.checks[0]]},{}),/Duplicate/);
 assert.throws(()=>buildCheckParity({...contract,tables:{}},{}),/metadata/);
});
void test('approved character correction validates old or corrected Column CHECK before all DDL',()=>{
 const correction={table:'last',name:'request_id',beforeClause:'octet_length(`request_id`) between 1 and 191',afterClause:'char_length(`request_id`) between 1 and 191',expression:'CHAR_LENGTH(request_id) BETWEEN 1 AND 191',definition:'VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL'};
 const sql=buildCheckParity({...contract,corrections:[correction]},{}),boundary=sql.indexOf('-- All read-only preflight has passed.');
 assert.ok(sql.indexOf("LEVEL='Column'")<boundary);assert.ok(sql.indexOf('WHERE (CHAR_LENGTH(request_id) BETWEEN 1 AND 191) IS FALSE')<boundary);
 assert.ok(sql.indexOf('MODIFY COLUMN `request_id`')>boundary);assert.doesNotMatch(sql,/DROP CONSTRAINT/);
});
void test('reviewed full contract regenerates exactly and appends one compound block to immutable prefix',async()=>{
 const root=new URL('../',import.meta.url),contract=JSON.parse(await readFile(new URL('lib/operations/check-parity-contract.json',root),'utf8'));
 assert.equal(contract.checks.length,228);assert.equal(contract.corrections.length,1);
 assert.ok(contract.checks.every(c=>c.nativeClause&&c.sources.length));
 const sources=Object.fromEntries(await Promise.all(Object.keys(contract.sources).map(async path=>[path,await readFile(new URL(path,root),'utf8')])));
 const sql=buildCheckParity(contract,sources);assert.equal(sql,await readFile(new URL('deployment/babal/mariadb-check-parity.sql',root),'utf8'));
 const prefix=await readFile(new URL('.test-artifacts/t35/complete-bootstrap-candidate-20261105-v2/mariadb-schema.sql',root),'utf8');
 assert.equal(createHash('sha256').update(prefix).digest('hex'),contract.prefixSha256);
 for(const parse of [sqlStatements,splitFixtureSql]){assert.equal(parse(sql).length,1);assert.equal(parse(prefix+'\n'+sql).length,1780);assert.deepEqual(parse(prefix+'\n'+sql).slice(0,-1),parse(prefix));}
});
