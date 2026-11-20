import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve,sep} from 'node:path';
import mysql from 'mysql2';
import {nativeProcess,ownedDatabase,connectOwnedDatabase} from './owned-recovery-operations.mjs';
import {createNativeRecoveryBundle,extractNativeRecoveryBundle,assertDisposableRecoveryTarget,fileDigest} from './native-recovery.mjs';
import {captureNativeInventory,invalidateRestoredAuthority,nativeIdentifier,assertFeeRecoveryEvidence} from './native-inventory.mjs';
import {exportKeyRecovery,inspectKeyRecovery} from '../../lib/portability/crypto.ts';
import {decryptSecurityValue,securityKeyId,totpAtCounter,verifyTotp} from '../../lib/security/crypto.ts';
import {validateAccount,validateManifest} from '../../lib/security/model.ts';
import {inspectReadiness} from '../../lib/operations/readiness.ts';
import {assertLocalRecoveryMode} from './local-source-artifact.mjs';
import {createHostedSecurityPolicy,recoverHostedSecurityPolicy,inspectHostedSecurityReadiness} from '../../lib/security/hosted-policy.ts';
import {verifyArtifactIdentity,verifySelectedPackage,assertSelectedConstraints,nativeReadinessAdapter} from '../testing/current-artifact-identity.mjs';
import {readExpectedRegistrationMediaKeys,stageRegistrationMedia,verifyRestoredRegistrationMedia} from './registration-media.mjs';
import {assertSelectedRecoveryViewBinding} from './selected-native-views.mjs';
import {planSelectedNativeMedia,readSelectedNativeMediaCensus,stageSelectedNativeMedia,verifyRestoredSelectedNativeMedia} from './selected-native-media.mjs';

/** Creates its target inside the verified disposable container only; never accepts another host. */
export async function rehearseNativeRecovery({docker,marker,owned,source,workspace,artifactDirectory,key,localRecovery=false,selectedPackageRoot,registrationMediaManifestSha256,feeNativeMediaManifestSha256,selectedViewBaseline,cancellation}){
 const operations={cancellation};
 source=ownedDatabase(source.connection,operations);
 await owned();const run=marker.name.replace('hastabazaar-native-','');
 const targetName='native_'+run+'_recovery';
 assertDisposableRecoveryTarget({containerId:marker.id,database:targetName,sourceDatabase:marker.database,run,host:marker.host,owned:true,dispatchPaused:true});
 assert.equal(source.connection.config.host,marker.host);assert.equal(source.connection.config.port,marker.port);
 assert.equal((await source.query('SELECT DATABASE() value'))[0][0].value,marker.database,'Snapshot source must be the owned fixture schema');
 const [existing]=await source.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[targetName]);assert.equal(existing.length,0,'Recovery target already exists');
 const [eventMode]=await source.query('SELECT @@global.event_scheduler value');assert.ok(['OFF','DISABLED'].includes(eventMode[0].value),'Dispatch must remain paused');
 const artifactRoot=await import('node:fs/promises').then(fs=>fs.realpath(artifactDirectory));
 const artifactInventory=JSON.parse(await readFile(resolve(artifactRoot,'inventory.json'),'utf8'));
 assert.match(artifactInventory.archive,/^hastabazaar-release-[a-z0-9._-]+\.tar\.gz$/);
 if(localRecovery){assertLocalRecoveryMode();assert.equal(artifactInventory.artifactKind,'source-snapshot');assert.equal(artifactInventory.commit,null);assert.equal(artifactInventory.linuxRuntimeVerified,false);assert.match(artifactInventory.sourceSha256,/^[a-f0-9]{64}$/);}
 else if(artifactInventory.artifactKind==='local-linux-candidate'){
  assert.ok(selectedPackageRoot,'Local candidate recovery requires selected schema binding');
  await verifyArtifactIdentity({project:process.cwd(),artifactDirectory});
 }
 else {assert.ok(artifactInventory.artifactKind===undefined||artifactInventory.artifactKind==='linux-release');assert.equal(artifactInventory.platform,'linux');assert.equal(artifactInventory.arch,'x64');assert.match(process.env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.equal(artifactInventory.commit,process.env.GITHUB_SHA,'Rehearsal artifact must match the current CI source');assert.equal(artifactInventory.runtime?.liveness,true);}
 assert.ok(!localRecovery||!selectedPackageRoot,'Source snapshot recovery cannot claim selected packaged acceptance');
 const selected=selectedPackageRoot?await verifySelectedPackage(selectedPackageRoot,artifactInventory):null;
 assert.equal(selectedViewBaseline!==undefined,Boolean(selected),'View baseline is required only for selected packaged recovery');
 if(selected)assertSelectedRecoveryViewBinding(selectedViewBaseline,{
  connection:source,database:marker.database,containerId:marker.id,selected,archiveSha256:artifactInventory.archiveSha256,
 });
 const inventory=(connection,database)=>captureNativeInventory(connection,selected?{baseline:selectedViewBaseline,database}:undefined);
 if(selected){await assertSelectedConstraints(source,selected.manifest);assert.deepEqual(await inspectReadiness(nativeReadinessAdapter(source),'mariadb',selected.manifest),{ready:true,missing:[]});}
 assert.equal(registrationMediaManifestSha256!==undefined,Boolean(selected),'Registration media handoff is required for selected packaged recovery');
 assert.equal(feeNativeMediaManifestSha256!==undefined,Boolean(selected),'Fee media handoff is required only for selected packaged recovery');
 const executionTarget=selected?marker.id:marker.name;
 assert.equal(await fileDigest(resolve(artifactRoot,artifactInventory.archive)),artifactInventory.archiveSha256);
 const root=await mkdtemp(resolve(workspace,'native-recovery-')),snapshot=resolve(root,'source'),target=resolve(root,'restored');
 assert.ok(root.startsWith(resolve(workspace)+sep));
 await mkdir(snapshot,{mode:0o700});await mkdir(target,{mode:0o700});await mkdir(resolve(snapshot,'release'),{mode:0o700});
 await copyFile(resolve(artifactRoot,artifactInventory.archive),resolve(snapshot,'release/artifact.tar.gz'));
 let before,selectedCensus,selectedMedia,registrationMedia,mediaObjects;
 let syntheticMediaObjects=0;
 if(selected){
  before=await inventory(source,marker.database);
  selectedCensus=await readSelectedNativeMediaCensus(source,cancellation);
  const expectedKeys=await readExpectedRegistrationMediaKeys(source);
  selectedMedia=await planSelectedNativeMedia({source,workspace,marker,archiveSha256:artifactInventory.archiveSha256,
   feeNativeMediaManifestSha256,census:selectedCensus,registrationKeys:expectedKeys,
   packageRoot:selectedPackageRoot,releaseFiles:artifactInventory.files,cancellation});
  await owned();
  registrationMedia=await stageRegistrationMedia({project:process.cwd(),workspace,snapshot,marker,
   archiveSha256:artifactInventory.archiveSha256,manifestSha256:registrationMediaManifestSha256,referencedKeys:selectedCensus,
   expectedKeys,cancellation});
  await stageSelectedNativeMedia(snapshot,selectedMedia,cancellation);
  mediaObjects=selectedMedia.mediaObjects;
  syntheticMediaObjects=selectedMedia.summary.syntheticReferencedMediaObjects+selectedMedia.summary.syntheticFreeProbeObjects;
 }else{
 const [referenceColumns]=await source.query("SELECT TABLE_NAME tableName,COLUMN_NAME columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME='object_key'");
 const mediaKeys=new Set(['private/recovery/fictional-proof.bin','public/recovery/fictional-image.webp']);
 for(const column of referenceColumns){const [rows]=await source.query('SELECT DISTINCT '+nativeIdentifier(column.columnName)+' value FROM '+nativeIdentifier(column.tableName)+' WHERE '+nativeIdentifier(column.columnName)+' IS NOT NULL');for(const row of rows)if(row.value)mediaKeys.add(row.value);}
 for(const mediaKey of mediaKeys){
  await cancellation?.checkpoint();
  assert.ok(/^(public|private)\//.test(mediaKey)&&!mediaKey.split('/').some(part=>part==='..'||part==='.'||!part)&&!/[\\:]/.test(mediaKey)&&!Array.from(mediaKey).some(character=>character.charCodeAt(0)<32));
  const file=resolve(snapshot,'media',mediaKey);assert.ok(file.startsWith(resolve(snapshot,'media')+sep));await mkdir(dirname(file),{recursive:true,mode:0o700});
  const bytes=Buffer.from('Fictional native recovery fixture\0'+mediaKey);await writeFile(file,bytes,{flag:'wx',mode:0o600});
  await writeFile(file+'.metadata.json',JSON.stringify({httpMetadata:{contentType:'application/octet-stream',cacheControl:mediaKey.startsWith('private/')?'private, no-store':'public, max-age=600'},customMetadata:{fixture:'native-recovery'},size:bytes.length,etag:createHash('sha256').update(bytes).digest('hex'),uploaded:'2026-10-21T00:00:00.000Z'}),{flag:'wx',mode:0o600});
  syntheticMediaObjects++;
 }
 mediaObjects=mediaKeys.size;
 before=await inventory(source,marker.database);
 }
 const [engine]=await source.query('SELECT VERSION() value');
 const feeEvidence=assertFeeRecoveryEvidence(before);
 const provenance={release:artifactInventory.release,artifactKind:localRecovery?'source-snapshot':artifactInventory.artifactKind??'linux-release',sourceSha256:localRecovery||artifactInventory.artifactKind==='local-linux-candidate'?artifactInventory.sourceSha256:null,commit:artifactInventory.commit,artifactSha256:artifactInventory.archiveSha256,schemaSha256:before.schemaSha256,...(selected?{bootstrapSha256:selected.manifest.migrations[0].sha256,releaseManifestSha256:selected.manifestSha256}:{}),keyIds:[securityKeyId(key)],engine:engine[0].value,writeMode:'paused',dispatchPaused:true};
 const dump=resolve(snapshot,'database.sql');
 await nativeProcess(docker,['exec',executionTarget,'sh','-c','MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb-dump --user=root --single-transaction --hex-blob --order-by-primary --skip-comments --skip-dump-date --routines --triggers "$1"','native-dump',marker.database],dump,'dump',operations);
 assert.deepEqual(await inventory(source,marker.database),before,'Source changed during native dump');
 const dataPassphrase=randomBytes(32).toString('base64url'),keyPassphrase=randomBytes(32).toString('base64url');
 const bundle=await createNativeRecoveryBundle({source:snapshot,output:resolve(root,'snapshot.hzn'),provenance,passphrase:dataPassphrase});
 const keyBytes=await exportKeyRecovery({version:1,activeKeyId:securityKeyId(key),keys:[{id:securityKeyId(key),keyBase64:Buffer.from(key,'base64url').toString('base64')}]},keyPassphrase);
 await writeFile(resolve(root,'keys.hzk'),keyBytes,{flag:'wx',mode:0o600});
 const recovered=await inspectKeyRecovery(keyBytes,keyPassphrase);assert.deepEqual(recovered.keys.map(entry=>entry.id),provenance.keyIds);
 await assert.rejects(inspectKeyRecovery(keyBytes,dataPassphrase));
 const extracted=await extractNativeRecoveryBundle({input:resolve(root,'snapshot.hzn'),destination:target,passphrase:dataPassphrase,expectedSha256:bundle.archiveSha256});
 assert.deepEqual(extracted.provenance,provenance);
 const registrationEvidence=registrationMedia?await verifyRestoredRegistrationMedia(target,registrationMedia,cancellation):null;
 if(selectedMedia)await verifyRestoredSelectedNativeMedia(target,selectedMedia,cancellation);
 await owned();
 await source.query('CREATE DATABASE '+nativeIdentifier(targetName)+' CHARACTER SET utf8mb4 COLLATE '+(selected?'utf8mb4_unicode_ci':'utf8mb4_general_ci'));
 let restored,policyParent,primaryFailure,report;let failed=false;
 try{
  await nativeProcess(docker,['exec','-i',executionTarget,'sh','-c','MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb --user=root --binary-mode=1 --comments "$1"','native-restore',targetName],resolve(target,'database.sql'),'restore',operations);
  restored=await connectOwnedDatabase(config=>mysql.createConnection(config),{host:marker.host,port:marker.port,user:'root',password:marker.password,database:targetName,connectTimeout:5000},operations);
  const after=await inventory(restored,targetName);assert.deepEqual(after,before,'Native restored records/schema/triggers differ');
  if(selected){
   await assertSelectedConstraints(restored,selected.manifest);
   const restoredCensus=await readSelectedNativeMediaCensus(restored,cancellation);
   // Boolean assertion avoids displaying raw private keys on failure.
   assert.ok(restoredCensus.size===selectedCensus.size&&[...restoredCensus].every(([key,record])=>{
    const original=selectedCensus.get(key);
    return original?.required===record.required&&JSON.stringify(original.bindings)===JSON.stringify(record.bindings);
   }),'Restored selected native media census differs');
  }
  assert.deepEqual(assertFeeRecoveryEvidence(after),feeEvidence,'Encrypted recovery lost historical seller or customer campaign revisions, receipts or order evidence');
  const adapter={dialect:'mariadb',prepare(sql){let values=[];return{bind(...next){values=next;return this;},async first(){const [results]=await restored.query(sql,values);return results[0]??null;},async all(){const [results]=await restored.query(sql,values);return{results};}};}};
  assert.deepEqual(await inspectReadiness(adapter,'mariadb',selected?.manifest),{ready:true,missing:[]});
  const [security]=await restored.query("SELECT `key`,value FROM marketplace_settings WHERE `key`='auth-private:manifest:v1' OR `key` LIKE 'auth-private:account:%' ORDER BY BINARY `key`");
  const recoveredKey=Buffer.from(recovered.keys[0].keyBase64,'base64').toString('base64url');
  let active=0;
  for(const row of security){
   if(row.key==='auth-private:manifest:v1')validateManifest(decryptSecurityValue(recoveredKey,row.key,'manifest',row.value));
   else {const userId=decodeURIComponent(row.key.slice('auth-private:account:'.length)),account=validateAccount(decryptSecurityValue(recoveredKey,row.key,userId,row.value),userId);if(account.status==='active'){active++;assert.equal(account.recovery.hashes.length,9,'Consumed recovery code state must remain consumed');assert.equal(verifyTotp(account.factor.secret,totpAtCounter(account.factor.secret,account.factor.lastCounter),account.factor.lastCounter*30000,account.factor.lastCounter),null);}}
  }
  assert.ok(active>0,'Native recovery must exercise enrolled MFA');
  policyParent=await mkdtemp(resolve(tmpdir(),'hastabazaar-native-recovered-policy-'));
  const policyConfiguration={HASTABAZAAR_RUNTIME_ENV:'production',APP_ORIGIN:'https://native-security.example.test',HASTABAZAAR_SECURITY_KEY:recoveredKey,HASTABAZAAR_SECURITY_POLICY_ROOT:resolve(policyParent,'policy')};
  await recoverHostedSecurityPolicy(policyConfiguration,adapter);
  const policyBindings={...policyConfiguration,SECURITY_POLICY:createHostedSecurityPolicy(policyConfiguration)};
  assert.equal((await inspectHostedSecurityReadiness(policyBindings,adapter)).ready,true,'Recovered external policy must accept the retained MFA identities');
  await assert.rejects(recoverHostedSecurityPolicy(policyConfiguration,adapter),'Recovery must never overwrite external policy');
  await invalidateRestoredAuthority(restored,after);
  for(const table of after.tables.filter(table=>table.classification==='transient'))assert.equal((await restored.query('SELECT COUNT(*) n FROM '+nativeIdentifier(table.name)))[0][0].n,0);
  assert.equal((await restored.query("SELECT COUNT(*) n FROM marketplace_settings WHERE `key` LIKE 'auth-private:%' AND `key`<>'auth-private:manifest:v1' AND `key` NOT LIKE 'auth-private:account:%'"))[0][0].n,0);
  assert.deepEqual((await restored.query("SELECT `key`,value FROM marketplace_settings WHERE `key`='auth-private:manifest:v1' OR `key` LIKE 'auth-private:account:%' ORDER BY BINARY `key`"))[0],security);
  assert.deepEqual(await inventory(source,marker.database),before,'Source changed during restore');
  report={passed:true,feeEvidence,activationAllowed:false,containerOwned:true,dispatchPaused:true,engine:provenance.engine,release:provenance.release,artifactKind:provenance.artifactKind,sourceSha256:provenance.sourceSha256,linuxRuntimeVerified:!localRecovery,commit:provenance.commit,artifactSha256:provenance.artifactSha256,archiveSha256:bundle.archiveSha256,manifestSha256:bundle.manifestHash,keyArchiveSha256:createHash('sha256').update(keyBytes).digest('hex'),keyIds:provenance.keyIds,schemaSha256:before.schemaSha256,tables:before.tables.length,views:before.views,rows:before.tables.reduce((sum,table)=>sum+table.rows,0),mediaObjects,enrolledAccountsVerified:active,externalPolicyRecovered:true,transientAuthorityCleared:true,sourceUnchanged:true};
  Object.assign(report,{syntheticMediaObjects,...registrationEvidence});
  if(selectedMedia)Object.assign(report,selectedMedia.summary);
  if(selected)Object.assign(report,{bootstrapSha256:provenance.bootstrapSha256,releaseManifestSha256:provenance.releaseManifestSha256,requiredExactChecks:309,selectedViewSchemaSha256:selectedViewBaseline.sha256});
  await writeFile(resolve(root,'verification.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 }catch(error){primaryFailure=error;failed=true;}
  const cleanupErrors=[];
  try{await restored?.end();}catch(error){cleanupErrors.push(error);}
  try{if(policyParent){assert.ok(policyParent.startsWith(resolve(tmpdir(),'hastabazaar-native-recovered-policy-')));assert.equal(resolve(policyParent),policyParent);await rm(policyParent,{recursive:true,force:true});}}catch{cleanupErrors.push(new Error('Native recovery policy cleanup failed'));}
  if(cleanupErrors.length)throw new AggregateError([...(failed?[primaryFailure]:[]),...cleanupErrors],[primaryFailure?.message,...cleanupErrors.map(error=>error.message)].filter(Boolean).join('; '));
 if(failed)throw primaryFailure;
 return report;
}
