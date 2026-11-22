/** Explicit two-namespace fixture: original153 upgrade, then all-three absent-publication runtime. */
import assert from 'node:assert/strict';
import {readFile,writeFile,realpath,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withPortableMariaFixture,createFixtureDatabase,importFixtureSql,assertUnder} from './portable-mariadb-fixture.mjs';
import {generatePublicFeedbackMariaSql} from '../lib/forms/public-feedback-schema.mjs';
import {verifyT03PublicFeedbackTransition,verifyT03PublicFeedbackRuntime} from './t03-public-feedback-native-runtime.mjs';

const root=await realpath('C:/Users/abinash/Desktop/HastaBazaar');
assert.equal((await realpath(process.cwd())).toLowerCase(),root.toLowerCase());
assert.equal(process.argv.length,3);const id=process.argv[2];assert.match(id,/^fixture-\d{14}-[a-f0-9]{8}$/);
const proof=JSON.parse(await readFile(resolve(root,'.test-artifacts/t33/'+id+'.json'),'utf8'));
assert.equal(proof.id,id);assert.equal(proof.purpose,'t33-offline-preservation');assert.equal(proof.version,'10.11.19');
assert.equal(proof.sha256,'398ea30e5036010bbebe01d2b1804280424dcc2626e36d8e95155c04d25a0490');assert.equal(proof.copiedStaticArchiveOnly,true);
assertUnder(resolve(root,'test-artifacts/mariadb'),await realpath(proof.root));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const candidate=resolve(root,'.test-artifacts/t33/native-public-feedback-candidate-v8'),freeze=JSON.parse(await readFile(join(candidate,'freeze.json'),'utf8'));
const producerFreezeBytes=await readFile(resolve(root,'.test-artifacts/t03-followup/public-feedback-retention-source-freeze.json'));
const producerSources=Object.fromEntries(JSON.parse(producerFreezeBytes.toString()).files.map(({path,sha256})=>[path,sha256]));
const prefixPath=resolve(root,'.test-artifacts/t33/legacy-transition-candidate-v5/mariadb-schema.sql'),prefix=await readFile(prefixPath);
const full=await readFile(join(candidate,'mariadb-schema.sql')),appendPath=resolve(root,'deployment/babal/mariadb-native-public-feedback-defaults.sql'),append=await readFile(appendPath),footer=Buffer.from('SET FOREIGN_KEY_CHECKS = 1;\n');
assert.equal(hash(prefix),'27b50a85e8afd035565a238fb15f0e6a1411b0c8293f403930ad914e8a75ad56');
assert.equal(hash(full),freeze.schemaSha256);assert.equal(hash(append),freeze.append154Sha256);
assert.equal(append.toString(),generatePublicFeedbackMariaSql(await readFile(resolve(root,'drizzle/0154_native_public_feedback_defaults.sql'),'utf8')));
assert.ok(full.subarray(0,prefix.length-footer.length).equals(prefix.subarray(0,-footer.length)));
assert.equal(full.subarray(prefix.length-footer.length).toString(),append.toString().trim()+'\n'+footer.toString());
const paths=[...new Set([...Object.keys(freeze.sources),...Object.keys(producerSources),'scripts/test-t03-public-feedback-mariadb.mjs','scripts/t03-public-feedback-native-runtime.mjs',
 'lib/runtime/node-bindings.ts','app/api/feedback/route.ts','app/api/forms/[formId]/route.ts','lib/db/repositories/feedback-submissions.ts',
 'lib/db/repositories/form-answers.ts','lib/db/repositories/form-catalog.ts','lib/db/repositories/staff-mutation-guard.ts',
 'lib/forms/access.ts','lib/forms/runtime.ts','lib/forms/submission.ts','lib/forms/core-contracts.ts','lib/forms/core-receipts.ts','lib/forms/native-version.ts',
 'lib/forms/catalog-policy.ts','lib/feedback/customer-feedback.ts','lib/email/customer-feedback.ts','lib/http/rate-limit.ts','lib/http/request-security.ts','lib/marketplace/permissions.ts'])];
const sources=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
for(const[path,expected]of Object.entries(freeze.sources))assert.equal(sources[path],expected,'Reviewed candidate source remains current: '+path);
for(const[path,expected]of Object.entries(producerSources))assert.equal(sources[path],expected,'Producer dependency freeze remains current: '+path);
const suffix=Date.now().toString(36)+'_'+randomUUID().slice(0,4),base=resolve(root,'.test-artifacts/t03-followup/native-public-feedback-'+suffix);
await writeFile(base+'-source-freeze.json',JSON.stringify({candidateSchemaSha256:hash(full),prefix153Sha256:hash(prefix),append154Sha256:hash(append),producerFreezeSha256:hash(producerFreezeBytes),sources},null,2),{flag:'wx'});
let result,ownedPid;
try{
 result=await withPortableMariaFixture(id,async fixture=>{
  ownedPid=fixture.pid;assert.equal((await realpath(fixture.root)).toLowerCase(),(await realpath(proof.root)).toLowerCase());
  fixture.connection.connection.config.jsonStrings=true;
  const ownedPrefix=assertUnder(fixture.root,join(fixture.root,'public154-prefix153-'+suffix+'.sql')),
   ownedAppend=assertUnder(fixture.root,join(fixture.root,'public154-append-'+suffix+'.sql')),
   ownedFull=assertUnder(fixture.root,join(fixture.root,'public154-complete-'+suffix+'.sql'));
  await copyFile(prefixPath,ownedPrefix,constants.COPYFILE_EXCL);await copyFile(appendPath,ownedAppend,constants.COPYFILE_EXCL);await copyFile(join(candidate,'mariadb-schema.sql'),ownedFull,constants.COPYFILE_EXCL);
  const transitionDatabase=await createFixtureDatabase(fixture,'public154a_'+suffix),imported153=await importFixtureSql(fixture,ownedPrefix);
  console.log(JSON.stringify({stage:'public154-original153-imported',fixture:id,database:transitionDatabase}));
  let applied=false,imported154;
  const transition=await verifyT03PublicFeedbackTransition(fixture,{async apply154(){
   assert.equal(applied,false,'Apply the reviewed154 append once only.');
   assert.equal(fixture.database,transitionDatabase);assert.equal((await fixture.connection.query('SELECT DATABASE() name'))[0][0].name,transitionDatabase);
   imported154=await importFixtureSql(fixture,ownedAppend);applied=true;return imported154;
  }});
  assert.equal(applied,true,'The transition proof must actually apply154 after its original-data snapshot.');
  assert.equal(transition.actualIncremental153To154,true);assert.equal(transition.foreignKeysKeptEnabled,true);assert.equal(transition.preservedStatuses,5);
  assert.equal(typeof transition.columnDefaultChanged,'boolean','Raw default metadata comparison must be reported, never normalized away.');
  // Root reviewed only this actual Maria nullable-column descriptor delta.
  // Do not broaden it, normalize metadata, or relabel the earlier exit1 proof.
  assert.equal(transition.reviewedExactNullableDefault,true);
  assert.equal(transition.beforeColumn.COLUMN_DEFAULT,null);assert.equal(transition.beforeColumn.IS_NULLABLE,'NO');
  assert.equal(transition.afterColumn.COLUMN_DEFAULT,'NULL');assert.equal(transition.afterColumn.IS_NULLABLE,'YES');
  assert.deepEqual(transition.afterColumn,{...transition.beforeColumn,COLUMN_DEFAULT:'NULL',IS_NULLABLE:'YES'});
  console.log(JSON.stringify({stage:'public154-original-five-states-preserved',database:transitionDatabase}));
  const runtimeDatabase=await createFixtureDatabase(fixture,'public154b_'+suffix),importedFull=await importFixtureSql(fixture,ownedFull);
  assert.notEqual(runtimeDatabase,transitionDatabase);
  console.log(JSON.stringify({stage:'public154-fresh-runtime-schema-imported',database:runtimeDatabase}));
  const runtime=await verifyT03PublicFeedbackRuntime(fixture);
  assert.equal(runtime.actualNodeAdapter,true);assert.equal(runtime.publicVariants,3);assert.equal(runtime.nativeJobs,3);assert.equal(runtime.exactOriginalReplay,true);
  assert.equal(runtime.currentSupportRead,true);assert.equal(runtime.unauthorizedReadDenied,true);assert.equal(runtime.externalMailAttempts,0);
  assert.equal(runtime.parentProofUpdateRejected,true);assert.equal(runtime.parentProofDeleteRejected,true);assert.equal(runtime.historicalActorAnonymization,true);
  for(const[path,expected]of Object.entries(sources))assert.equal(hash(await readFile(resolve(root,path))),expected,'Source stayed frozen: '+path);
  assert.equal(hash(await readFile(prefixPath)),hash(prefix));assert.equal(hash(await readFile(join(candidate,'mariadb-schema.sql'))),hash(full));assert.equal(hash(await readFile(appendPath)),hash(append));
  for(const[path,expected]of Object.entries(freeze.retained))assert.equal(hash(await readFile(resolve(root,path))),expected,'Retained artifact unchanged: '+path);
  return{status:'PASS',fixture:id,version:fixture.facts.version,transitionDatabase,runtimeDatabase,twoFreshOwnedNamespaces:true,reviewedExactNullableDefault:true,imported153,imported154,importedFull,transition,runtime,candidateSchemaSha256:hash(full),prefix153Sha256:hash(prefix),append154Sha256:hash(append),producerFreezeSha256:hash(producerFreezeBytes),sources};
 });
}catch(error){result={status:'FAIL',fixture:id,message:String(error.message).slice(0,2200),stack:String(error.stack).slice(0,2500),...(error.diagnostic?{diagnostic:error.diagnostic}:{})};process.exitCode=1;
}finally{
 await writeFile(base+'.json',JSON.stringify(result??{status:'FAIL',fixture:id,message:'No native result before cleanup.'},null,2),{flag:'wx'});
 if(ownedPid!==undefined){
  await copyFile(join(proof.root,'last-shutdown.json'),base+'-shutdown.json',constants.COPYFILE_EXCL);
  const shutdown=JSON.parse(await readFile(base+'-shutdown.json','utf8'));assert.equal(shutdown.pid,ownedPid);assert.equal(shutdown.authenticatedShutdown,true);assert.equal(shutdown.stopped,true);assert.equal(shutdown.forcedStop,false);
 }
}
console.log(JSON.stringify({...result,evidencePath:base+'.json'}));
