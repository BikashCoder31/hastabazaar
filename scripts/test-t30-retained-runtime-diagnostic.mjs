/** Diagnostic only: reuse the verified fictional schema after rolled-back fixture setup.
 * Final acceptance still requires the complete fresh combined rehearsal. No reset/DDL. */
import assert from 'node:assert/strict';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {withPortableMariaFixture} from './portable-mariadb-fixture.mjs';
import {verifyT30AccessRuntime} from './t30-access-runtime.mjs';
const root=await realpath('C:/Users/abinash/Desktop/HastaBazaar');assert.equal((await realpath(process.cwd())).toLowerCase(),root.toLowerCase());
assert.equal(process.argv.length,3);const id=process.argv[2];assert.equal(id,'fixture-20261103032129-d7804952');
const sourceEvidence=resolve(root,'.test-artifacts/t30/ownership-maria-candidate/schema-native-mw0onqnv_4bb610.json');
const proof=JSON.parse(await readFile(sourceEvidence,'utf8'));assert.equal(proof.status,'PASS');assert.equal(proof.fixture,id);assert.equal(proof.database,'fixture_d7804952_t30own_mw0onqnv_4bb610');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(proof.schemaSha256,'70f52749d19f5ec87375f897c8d50c8c040e09bfa20a6f36184c3399e49791e8');
assert.equal(hash(await readFile(resolve(root,'.test-artifacts/t30/ownership-maria-candidate/mariadb-schema.sql'))),proof.schemaSha256);
for(const[path,expected]of Object.entries(proof.sources))assert.equal(hash(await readFile(resolve(root,path))),expected,'Previously proven schema sources remain unchanged: '+path);
let result;
try{result=await withPortableMariaFixture(id,async fixture=>{
 await fixture.connection.query('USE `'+proof.database+'`');fixture.database=proof.database;
 const[tables]=await fixture.connection.query('SHOW FULL TABLES');assert.equal(tables.length,357);
 for(const sql of ["SELECT COUNT(*) n FROM users WHERE id LIKE 'access-%'","SELECT COUNT(*) n FROM review_tasks WHERE id LIKE 'access-%'","SELECT COUNT(*) n FROM team_duties WHERE id='products'"]){const[rows]=await fixture.connection.query(sql);assert.equal(Number(rows[0].n),0,'The failed seed rolled back; refuse a used access namespace.');}
 return await verifyT30AccessRuntime(fixture);
});}catch(error){result={status:'FAIL',message:String(error.message),...error.diagnostic,failures:error.errors?.map(item=>String(item.message))};process.exitCode=1;}
const evidence=resolve(root,'.test-artifacts/t30/access-retained-diagnostic-'+Date.now()+'.json');
result={...result,diagnosticOnly:true,sourceEvidence};await writeFile(evidence,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({...result,evidencePath:evidence}));
