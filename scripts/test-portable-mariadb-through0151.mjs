/** Root-authorized fresh native fixture only. Never executes reset SQL. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,copyFile,writeFile,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {withPortableMariaFixture,createFixtureDatabase,importFixtureSql,assertUnder} from './portable-mariadb-fixture.mjs';
import {verifyT29MariaConstraints} from './t29-mariadb-constraints.mjs';
import {verifyT30MariaConstraints} from './t30-mariadb-constraints.mjs';
const project=await realpath('C:/Users/abinash/Desktop/HastaBazaar');assert.equal((await realpath(process.cwd())).toLowerCase(),project.toLowerCase());assert.equal(process.argv.length,3);
const id=process.argv[2];assert.match(id,/^fixture-\d{14}-[a-f0-9]{8}$/);
const candidate=resolve(project,'.test-artifacts/t30/maria-candidate'),source=join(candidate,'mariadb-schema.sql'),freeze=JSON.parse(await readFile(join(candidate,'freeze.json'),'utf8')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=await readFile(source);assert.equal(hash(bytes),freeze.schemaSha256);
const reset=await readFile(join(candidate,'mariadb-reset-empty-import.sql'),'utf8');assert.equal(hash(reset),freeze.resetSha256);
const previous=await readFile(resolve(project,'.test-artifacts/t29/maria-20261103-a901/mariadb-schema.sql'));assert.equal(hash(previous),'3edc00ea8003f9b88b5016c2ea0c865b4963dff6ff50324725a23207b91c4b98');
const footer='SET FOREIGN_KEY_CHECKS = 1;\n';assert.ok(previous.toString().endsWith(footer));const prefix=previous.subarray(0,-Buffer.byteLength(footer));assert.ok(bytes.subarray(0,prefix.length).equals(prefix),'Preserve the verified through0148 prefix exactly.');
for(const table of freeze.tables)assert.ok(reset.includes('DROP TABLE IF EXISTS `'+table+'`;'),'Complete reset inventory only; never execute it.');
for(const[name,expected]of Object.entries(freeze.sources))assert.equal(hash(await readFile(resolve(project,name))),expected);
const root=resolve(project,'test-artifacts/mariadb',id),owned=assertUnder(root,join(root,'frozen-through0151-'+randomUUID()+'.sql'));await copyFile(source,owned,constants.COPYFILE_EXCL);
const suffix=Date.now().toString(36)+'_'+randomUUID().slice(0,6),evidencePath=assertUnder(root,join(root,'import-through0151-'+suffix+'.json'));let result,nativeFacts;
try{result=await withPortableMariaFixture(id,async fixture=>{
 const database=await createFixtureDatabase(fixture,'t30_'+suffix),imported=await importFixtureSql(fixture,owned);
 const[tables]=await fixture.connection.query('SHOW FULL TABLES'),[foreignKeys]=await fixture.connection.query("SELECT TABLE_NAME tableName,COLUMN_NAME columnName,REFERENCED_TABLE_NAME parentTable,REFERENCED_COLUMN_NAME parentColumn FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL");
 const addedForeignKeys=foreignKeys.filter(row=>freeze.tables.includes(row.tableName));assert.equal(addedForeignKeys.length,freeze.expectedForeignKeyCount,'Every new inline reference must become an actual native FK.');
 for(const expected of freeze.expectedForeignKeys)assert.ok(addedForeignKeys.some(actual=>Object.keys(expected).every(key=>actual[key]===expected[key])),'Match actual native FK target: '+JSON.stringify(expected));
 nativeFacts={database,...imported,tableAndViewCount:tables.length,newTableCount:freeze.tables.length,newForeignKeyCount:addedForeignKeys.length};
 const previousConstraints=await verifyT29MariaConstraints(fixture.connection),constraints=await verifyT30MariaConstraints(fixture.connection);
 return{status:'PASS',fixture:id,version:fixture.facts.version,database,...imported,sourceSha256:freeze.schemaSha256,resetSha256:freeze.resetSha256,tableAndViewCount:tables.length,newTableCount:freeze.tables.length,newForeignKeyCount:addedForeignKeys.length,prior0148PrefixBytes:prefix.length,previousConstraints,constraints};
});}catch(error){result={status:'FAIL',fixture:id,...nativeFacts,...error.diagnostic??{message:String(error.message).slice(0,2500),stack:String(error.stack).slice(0,2500)}};process.exitCode=1;}
await writeFile(evidencePath,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({...result,evidencePath}));
