/** Authorized frozen T29 schema compatibility probe only; no application data. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {readFile,copyFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withPortableMariaFixture,createFixtureDatabase,importFixtureSql,assertUnder} from './portable-mariadb-fixture.mjs';
import {verifyT29MariaConstraints} from './t29-mariadb-constraints.mjs';
const project=await realpath('C:/Users/abinash/Desktop/HastaBazaar');assert.equal((await realpath(process.cwd())).toLowerCase(),project.toLowerCase());
assert.equal(process.argv.length,3,'Supply only the exact already verified owned fixture ID.');const id=process.argv[2];assert.match(id,/^fixture-\d{14}-[a-f0-9]{8}$/);
const source=resolve(project,'.test-artifacts/t29/maria-20261103-a901/mariadb-schema.sql'),expected='3edc00ea8003f9b88b5016c2ea0c865b4963dff6ff50324725a23207b91c4b98';
const bytes=await readFile(source),sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,expected,'Import only the exact root-authorized frozen source.');
const root=resolve(project,'test-artifacts/mariadb',id),ownedCopy=assertUnder(root,join(root,'frozen-through0148-'+randomUUID()+'.sql'));await copyFile(source,ownedCopy,constants.COPYFILE_EXCL);
const suffix=Date.now().toString(36)+'_'+randomUUID().slice(0,6),evidencePath=assertUnder(root,join(root,'import-through0148-'+suffix+'.json'));
let result;
try{result=await withPortableMariaFixture(id,async fixture=>{const database=await createFixtureDatabase(fixture,'t29_'+suffix);const imported=await importFixtureSql(fixture,ownedCopy);const constraints=await verifyT29MariaConstraints(fixture.connection);const[tables]=await fixture.connection.query('SHOW FULL TABLES');return {status:'PASS',fixture:id,version:fixture.facts.version,database,source,sha256,...imported,tableAndViewCount:tables.length,constraints};});}catch(error){result={status:'FAIL',fixture:id,source,sha256,...error.diagnostic??{message:String(error.message).slice(0,3000)}};process.exitCode=1;}
await writeFile(evidencePath,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({...result,evidencePath}));




