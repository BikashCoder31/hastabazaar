/** Fresh owned fixture only. The existing canonical/local database and reset SQL are never used. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,copyFile,writeFile,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {withPortableMariaFixture,createFixtureDatabase,importFixtureSql,assertUnder} from './portable-mariadb-fixture.mjs';
import {verifyT30SystemOwnershipConstraints} from './t30-system-ownership-constraints.mjs';
import {verifyT30NotificationRuntimeConstraints} from './t30-notification-runtime-constraints.mjs';
import {verifyT30AccessRuntime} from './t30-access-runtime.mjs';

const project=await realpath('C:/Users/abinash/Desktop/HastaBazaar');
assert.equal((await realpath(process.cwd())).toLowerCase(),project.toLowerCase());assert.equal(process.argv.length,3);
const id=process.argv[2];assert.match(id,/^fixture-\d{14}-[a-f0-9]{8}$/);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const candidate=resolve(project,'.test-artifacts/t30/ownership-maria-candidate'),source=join(candidate,'mariadb-schema.sql');
const bytes=await readFile(source),previous=await readFile(resolve(project,'.test-artifacts/t30/maria-candidate/mariadb-schema.sql'));
assert.equal(hash(previous),'f7f6bafc9d767c817b119b2ee10f9c9a2db35edf4240ef81515cd30163fb5f0f');
const footer='SET FOREIGN_KEY_CHECKS = 1;\n';assert.ok(previous.toString().endsWith(footer));
const prefix=previous.subarray(0,-Buffer.byteLength(footer));assert.ok(bytes.subarray(0,prefix.length).equals(prefix),'Preserve every previously verified schema byte before the final footer.');
const reset=await readFile(join(candidate,'mariadb-reset-empty-import.sql'));
const oldReset=await readFile(resolve(project,'.test-artifacts/t30/maria-candidate/mariadb-reset-empty-import.sql'));
assert.equal(hash(oldReset),'0f14fdf32691bd7a27a8fcf8cb594f2d0a902ed5230f2b6a52f53d761c363d4c');
assert.ok(oldReset.subarray(-previous.length).equals(previous));assert.ok(reset.subarray(-bytes.length).equals(bytes),'Reset artifact embeds the exact new schema. It is never executed.');
assert.ok(oldReset.subarray(0,-previous.length).equals(reset.subarray(0,-bytes.length)),'No new tables: preserve the complete original drop inventory and warnings.');
const paths=['drizzle/0152_review_task_system_ownership.sql','lib/operations/system-ownership-schema.mjs','deployment/babal/mariadb-review-task-system-ownership.sql','scripts/t30-system-ownership-constraints.mjs','drizzle/0033_business_notifications.sql','drizzle/0035_guest_business_notifications.sql','lib/operations/notification-schema.mjs','deployment/babal/mariadb-notification-runtime-compatibility.sql','scripts/t30-notification-runtime-constraints.mjs'];
const sources=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(resolve(project,path)))])));
const suffix=Date.now().toString(36)+'_'+randomUUID().slice(0,6),evidence=resolve(candidate,'native-'+suffix+'.json'),schemaEvidence=resolve(candidate,'schema-native-'+suffix+'.json');let result;
try{result=await withPortableMariaFixture(id,async fixture=>{
 const ownedSource=assertUnder(fixture.root,join(fixture.root,'frozen-through0152-'+suffix+'.sql'));
 await copyFile(source,ownedSource,constants.COPYFILE_EXCL);
 const database=await createFixtureDatabase(fixture,'t30own_'+suffix),imported=await importFixtureSql(fixture,ownedSource);
 console.log(JSON.stringify({stage:'schema-imported',fixture:id,database,...imported}));
 const [tables]=await fixture.connection.query('SHOW FULL TABLES');assert.equal(tables.length,357);
 const checks=await verifyT30SystemOwnershipConstraints(fixture.connection);
 const notificationChecks=await verifyT30NotificationRuntimeConstraints(fixture.connection);
 for(const[path,expected]of Object.entries(sources))assert.equal(hash(await readFile(resolve(project,path))),expected,'Source remained frozen: '+path);
 const schemaProof={status:'PASS',fixture:id,database,version:fixture.facts.version,schemaSha256:hash(bytes),resetSha256:hash(reset),sources,prior151PrefixBytes:prefix.length,tableAndViewCount:tables.length,...imported,checks,notificationChecks};
 await writeFile(schemaEvidence,JSON.stringify(schemaProof,null,2),{flag:'wx'});
 await writeFile(join(candidate,'freeze.json'),JSON.stringify({schemaSha256:hash(bytes),resetSha256:hash(reset),sources,nativeEvidence:schemaEvidence},null,2));
 console.log(JSON.stringify({stage:'schema-constraints-passed',schemaEvidence}));
 const accessChecks=await verifyT30AccessRuntime(fixture);assert.equal(accessChecks.status,'PASS');
 return{...schemaProof,accessChecks,schemaEvidence};
});}catch(error){result={status:'FAIL',fixture:id,...error.diagnostic??{message:String(error.message).slice(0,2500),stack:String(error.stack).slice(0,2500)},...(error.errors?{failures:error.errors.map(failure=>({message:String(failure.message),stack:String(failure.stack).slice(0,1800)}))}:{})};process.exitCode=1;}
await writeFile(evidence,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({...result,evidencePath:evidence}));
if(result.status==='PASS')await writeFile(join(candidate,'freeze.json'),JSON.stringify({schemaSha256:hash(bytes),resetSha256:hash(reset),sources,nativeEvidence:evidence},null,2));
