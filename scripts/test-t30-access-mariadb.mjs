/** Standalone wrapper; combined native proof invokes the same source-frozen runtime helper. */
import assert from 'node:assert/strict';
import {readFile,writeFile,realpath,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {withPortableMariaFixture,createFixtureDatabase,importFixtureSql,assertUnder} from './portable-mariadb-fixture.mjs';
import {verifyT30AccessRuntime} from './t30-access-runtime.mjs';
import {verifyT30NotificationRuntimeConstraints} from './t30-notification-runtime-constraints.mjs';
const root=await realpath('C:/Users/abinash/Desktop/HastaBazaar');assert.equal((await realpath(process.cwd())).toLowerCase(),root.toLowerCase());
const id=process.argv[2];assert.ok(process.argv.length===3||process.argv.length===4);assert.match(id,/^fixture-\d{14}-[a-f0-9]{8}$/);
const candidate=resolve(root,process.argv[3]??'.test-artifacts/t30/ownership-maria-candidate');assertUnder(resolve(root,'.test-artifacts/t30'),candidate);
const schema=join(candidate,'mariadb-schema.sql'),freeze=JSON.parse(await readFile(join(candidate,'freeze.json'),'utf8'));
assert.equal(createHash('sha256').update(await readFile(schema)).digest('hex'),freeze.schemaSha256);
const evidence=resolve(root,'.test-artifacts/t30/access-mariadb-'+Date.now()+'.json');let result;
try{result=await withPortableMariaFixture(id,async fixture=>{
 const ownedSource=assertUnder(fixture.root,join(fixture.root,'access-frozen-schema-'+Date.now()+'.sql'));await copyFile(schema,ownedSource,constants.COPYFILE_EXCL);
 await createFixtureDatabase(fixture,'t30_access_'+Date.now().toString(36));await importFixtureSql(fixture,ownedSource);console.log(JSON.stringify({stage:'schema-imported',fixture:id,database:fixture.database}));
 const notificationConstraints=await verifyT30NotificationRuntimeConstraints(fixture.connection),access=await verifyT30AccessRuntime(fixture);
 return{...access,schemaSha256:freeze.schemaSha256,notificationConstraints};
});}catch(error){result={status:'FAIL',fixture:id,message:String(error.message).slice(0,2500),stack:String(error.stack).slice(0,2500)};process.exitCode=1;}
await writeFile(evidence,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({...result,evidencePath:evidence}));
