/** Explicit fresh local namespace, real Node adapter and native first-publication concurrency. */
import assert from 'node:assert/strict';
import {readFile,writeFile,realpath,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withPortableMariaFixture,createFixtureDatabase,importFixtureSql,assertUnder} from './portable-mariadb-fixture.mjs';
import {t33LegacyHistoricalStatements} from '../tests/helpers/t33-legacy-records.mjs';
import {verifyT03CoreFormRuntime} from './t03-core-form-native-runtime.mjs';

const root=await realpath('C:/Users/abinash/Desktop/HastaBazaar');
assert.equal((await realpath(process.cwd())).toLowerCase(),root.toLowerCase());
assert.equal(process.argv.length,3);const id=process.argv[2];assert.match(id,/^fixture-\d{14}-[a-f0-9]{8}$/);
const proof=JSON.parse(await readFile(resolve(root,'.test-artifacts/t33/'+id+'.json'),'utf8'));
assert.equal(proof.id,id);assert.equal(proof.purpose,'t33-offline-preservation');assert.equal(proof.version,'10.11.19');
assert.equal(proof.sha256,'398ea30e5036010bbebe01d2b1804280424dcc2626e36d8e95155c04d25a0490');assert.equal(proof.copiedStaticArchiveOnly,true);
assertUnder(resolve(root,'test-artifacts/mariadb'),await realpath(proof.root));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const candidate=resolve(root,'.test-artifacts/t33/legacy-transition-candidate-v5/mariadb-schema.sql'),schema=await readFile(candidate);
assert.equal(hash(schema),'27b50a85e8afd035565a238fb15f0e6a1411b0c8293f403930ad914e8a75ad56');
const paths=['scripts/test-t03-core-forms-mariadb.mjs','scripts/t03-core-form-native-runtime.mjs','lib/runtime/node-bindings.ts',
 'lib/forms/answer-proof.ts','lib/forms/core-contracts.ts','lib/forms/core-receipts.ts','lib/forms/native-version.ts','lib/forms/submission.ts','lib/forms/runtime.ts',
 'lib/db/repositories/form-answers.ts','lib/db/repositories/form-catalog.ts','lib/db/repositories/seller-profile.ts','lib/db/repositories/seller-applications.ts',
 'lib/db/repositories/staff-mutation-guard.ts','lib/sellers/registration-store.ts','lib/riders/repository.ts','lib/riders/availability.ts',
 'lib/db/repositories/fulfillment.ts','app/api/rider/reports/route.ts'];
const sources=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
const suffix=Date.now().toString(36)+'_'+randomUUID().slice(0,4),base=resolve(root,'.test-artifacts/t03-followup/native-core-forms-'+suffix);
await writeFile(base+'-source-freeze.json',JSON.stringify({schemaSha256:hash(schema),sources},null,2),{flag:'wx'});
let result,ownedPid;
try{
 result=await withPortableMariaFixture(id,async fixture=>{
  assert.equal((await realpath(fixture.root)).toLowerCase(),(await realpath(proof.root)).toLowerCase());
  ownedPid=fixture.pid;
  const owned=assertUnder(fixture.root,join(fixture.root,'t03-core-forms-'+suffix+'.sql'));
  await copyFile(candidate,owned,constants.COPYFILE_EXCL);await createFixtureDatabase(fixture,'t03f_'+suffix);
  fixture.connection.connection.config.jsonStrings=true;
  const imported=await importFixtureSql(fixture,owned);
  console.log(JSON.stringify({stage:'fresh-native-form-schema-imported',fixture:id,database:fixture.database}));
  // Original fictional account/role/source facts; no approval, publication or answer receipts synthesized.
  await fixture.connection.beginTransaction();
  try{for(const sql of t33LegacyHistoricalStatements){assert.match(sql,/^INSERT INTO /);await fixture.connection.query(sql);}await fixture.connection.commit();}
  catch(error){await fixture.connection.rollback();throw error;}
  const runtime=await verifyT03CoreFormRuntime(fixture);
  for(const[path,expected]of Object.entries(sources))assert.equal(hash(await readFile(resolve(root,path))),expected,'Source remained frozen: '+path);
  assert.equal(hash(await readFile(candidate)),hash(schema));
  return{status:'PASS',fixture:id,database:fixture.database,version:fixture.facts.version,imported,schemaSha256:hash(schema),...runtime,sources};
 });
}catch(error){
 result={status:'FAIL',fixture:id,message:String(error.message).slice(0,2000),stack:String(error.stack).slice(0,2200),...(error.diagnostic?{diagnostic:error.diagnostic}:{})};process.exitCode=1;
}finally{
 // Persist the primary result first: cleanup-evidence failures must not erase it.
 await writeFile(base+'.json',JSON.stringify(result??{status:'FAIL',fixture:id,message:'Native result unavailable before cleanup.'},null,2),{flag:'wx'});
 // Preserve the exact authenticated shutdown proof for this attempt, including failed attempts.
 if(ownedPid!==undefined){
  await copyFile(join(proof.root,'last-shutdown.json'),base+'-shutdown.json',constants.COPYFILE_EXCL);
  const shutdown=JSON.parse(await readFile(base+'-shutdown.json','utf8'));
  assert.equal(shutdown.pid,ownedPid);assert.equal(shutdown.stopped,true);assert.equal(shutdown.authenticatedShutdown,true);assert.equal(shutdown.forcedStop,false);
 }
}
console.log(JSON.stringify({...result,evidencePath:base+'.json'}));
