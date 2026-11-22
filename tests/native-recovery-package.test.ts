import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createNativeRecoveryBundle, extractNativeRecoveryBundle, assertDisposableRecoveryTarget, validateNativeProvenance} from '../scripts/recovery/native-recovery.mjs';
import {assertLocalRecoveryMode} from '../scripts/recovery/local-source-artifact.mjs';

const phrase='fictional-native-recovery-passphrase';
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const provenance={release:'hastabazaar-release-fixture',artifactKind:'linux-release',sourceSha256:null,commit:'a'.repeat(40),artifactSha256:hash('artifact'),schemaSha256:'c'.repeat(64),keyIds:['d'.repeat(32)],engine:'10.11.14-MariaDB',writeMode:'paused',dispatchPaused:true};

void test('local source recovery can never satisfy a CI artifact gate',()=>{
 assertLocalRecoveryMode({NODE_ENV:'test'});
 for(const environment of [{CI:'true'},{CI:'false'},{GITHUB_ACTIONS:'true'}])assert.throws(()=>assertLocalRecoveryMode({NODE_ENV:'test',...environment}),/forbidden in CI/);
 assert.throws(()=>validateNativeProvenance({...provenance,artifactKind:'source-snapshot'}));
 assert.throws(()=>validateNativeProvenance({...provenance,sourceSha256:'e'.repeat(64)}));
});

void test('native recovery authenticates exact SQL, application, private media and metadata before extraction succeeds',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hasta-native-package-'));
 try{
  const source=join(root,'source'),target=join(root,'target');await mkdir(source);await mkdir(target);
  const contents={'database.sql':Buffer.from('CREATE TABLE fixture (value text);\n'),'release/artifact.tar.gz':Buffer.from('artifact'),'media/private/evidence.bin':Buffer.from([0,255,128,1]),'media/private/evidence.bin.metadata.json':Buffer.from('{"httpMetadata":{"contentType":"application/octet-stream"}}')};
  for(const [name,bytes] of Object.entries(contents)){const file=join(source,name);await mkdir(join(file,'..'),{recursive:true});await writeFile(file,bytes);}
  const archive=join(root,'snapshot.hzn');
  const prepared=await createNativeRecoveryBundle({source,output:archive,provenance,passphrase:phrase});
  assert.equal((await readFile(archive)).includes(Buffer.from('CREATE TABLE')),false);
  const result=await extractNativeRecoveryBundle({input:archive,destination:target,passphrase:phrase,expectedSha256:prepared.archiveSha256});
  assert.deepEqual(result.provenance,provenance);
  for(const [name,bytes] of Object.entries(contents))assert.deepEqual(await readFile(join(target,name)),bytes);
  await assert.rejects(extractNativeRecoveryBundle({input:archive,destination:target,passphrase:phrase,expectedSha256:prepared.archiveSha256}),/empty/);
  const wrong=join(root,'wrong');await mkdir(wrong);
  await assert.rejects(extractNativeRecoveryBundle({input:archive,destination:wrong,passphrase:'incorrect-native-recovery-passphrase',expectedSha256:prepared.archiveSha256}));
  const corrupt=join(root,'corrupt');await mkdir(corrupt);await writeFile(archive,(await readFile(archive)).subarray(0,-30));
  await assert.rejects(extractNativeRecoveryBundle({input:archive,destination:corrupt,passphrase:phrase,expectedSha256:prepared.archiveSha256}),/digest/);
 }finally{await rm(root,{recursive:true,force:true});}
});

void test('native recovery refuses unknown files, source drift and fabricated artifact provenance',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hasta-native-package-'));
 try{
  await mkdir(join(root,'source','release'),{recursive:true});await writeFile(join(root,'source','database.sql'),'fixture');await writeFile(join(root,'source','release','artifact.tar.gz'),'different artifact');
  await assert.rejects(createNativeRecoveryBundle({source:join(root,'source'),output:join(root,'snapshot.hzn'),provenance,passphrase:phrase}),/artifact/);
  await writeFile(join(root,'source','release','artifact.tar.gz'),'artifact');await writeFile(join(root,'source','.env'),'private');
  await assert.rejects(createNativeRecoveryBundle({source:join(root,'source'),output:join(root,'other.hzn'),provenance,passphrase:phrase}),/path/);
 }finally{await rm(root,{recursive:true,force:true});}
});

void test('native recovery refuses provenance without a paused exact release and rejects every non-owned target',()=>{
 validateNativeProvenance(provenance);
 validateNativeProvenance({...provenance,artifactKind:'source-snapshot',commit:null,sourceSha256:'e'.repeat(64)});
 for(const change of [{artifactSha256:null},{commit:'local-dirty'},{writeMode:'preliminary'},{dispatchPaused:false},{keyIds:[]}])assert.throws(()=>validateNativeProvenance({...provenance,...change}));
 const scope={containerId:'a'.repeat(64),database:'native_123_recovery',sourceDatabase:'native_123_fresh',run:'123',host:'127.0.0.1',owned:true,dispatchPaused:true};
 assertDisposableRecoveryTarget(scope);
 for(const change of [{database:'hastabaz_staging'},{database:'native_123_fresh'},{host:'example.com'},{owned:false},{dispatchPaused:false},{containerId:'different'}])assert.throws(()=>assertDisposableRecoveryTarget({...scope,...change}));
});
