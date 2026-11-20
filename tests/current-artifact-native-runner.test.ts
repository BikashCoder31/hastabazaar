import assert from 'node:assert/strict';
import { lstat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import * as nativeRunner from '../scripts/testing/verify-current-artifact-native.mjs';
import { validateNativeProvenance } from '../scripts/recovery/native-recovery.mjs';
// The workflow's existing *.test.ts discovery includes the built-in identity suite.
import './current-artifact-identity.test.mjs';
import { inspectReadiness, releaseId } from '../lib/operations/readiness';
import { validateHostedSecurityConfiguration } from '../lib/security/hosted-policy';
import defaultManifest from '../deployment/babal/release-manifest.json';

const { artifactNativePlan, assertReviewedContainerImage, assertReviewedImage, initializeSelectedFixture, cancellableChild } = nativeRunner;
type TemporaryEnvironment = { TEMP: string; TMP: string; TMPDIR: string };
const hostedConfig = (root: string) => ({
  HASTABAZAAR_RUNTIME_ENV: 'production',
  APP_ORIGIN: 'https://native-security.example.test',
  HASTABAZAAR_SECURITY_KEY: Buffer.alloc(32, 1).toString('base64url'),
  HASTABAZAAR_SECURITY_POLICY_ROOT: root,
});

void test('hosted fixture uses a private external temporary directory and removes it on failure', async () => {
  const project = await realpath(process.cwd()), parent = await realpath(tmpdir());
  assert.throws(() => validateHostedSecurityConfiguration(hostedConfig(resolve(project, 'policy'))));
  await assert.rejects(nativeRunner.withExternalPolicyTemporary(project, project, async () => {
    assert.fail('The project must never be used as the external temporary parent');
  }), /outside the project/);
  let directory = '';
  await assert.rejects(nativeRunner.withExternalPolicyTemporary(project, parent, async (environment: TemporaryEnvironment) => {
    directory = environment.TMPDIR;
    assert.deepEqual(environment, { TEMP: directory, TMP: directory, TMPDIR: directory });
    const entry = await lstat(directory);
    assert.ok(entry.isDirectory() && !entry.isSymbolicLink());
    if (process.platform !== 'win32') assert.equal(entry.mode & 0o077, 0);
    assert.equal(validateHostedSecurityConfiguration(hostedConfig(resolve(directory, 'policy'))).root, resolve(directory, 'policy'));
    throw new Error('fixture failed after provisioning');
  }), /fixture failed after provisioning/);
  await assert.rejects(lstat(directory), { code: 'ENOENT' });
});

void test('in-process recovery observes external temporary storage and restores the prior environment on failure', async () => {
  const keys = ['TEMP', 'TMP', 'TMPDIR'] as const;
  const before = keys.map(key => process.env[key]);
  const project = await realpath(process.cwd()), parent = await realpath(tmpdir());
  try {
    process.env.TEMP = 'prior-temp';
    delete process.env.TMP;
    process.env.TMPDIR = '';
    await nativeRunner.withExternalPolicyTemporary(project, parent, async (environment: TemporaryEnvironment) => {
      await assert.rejects(nativeRunner.withPolicyTemporaryEnvironment(environment, async (applyTemporary: () => void) => {
        assert.deepEqual(keys.map(key => process.env[key]), Array(3).fill(environment.TMPDIR));
        for (const key of keys) process.env[key] = resolve(project, 'fixture-tmp');
        applyTemporary();
        assert.equal(await realpath(tmpdir()), environment.TMPDIR);
        const policy = resolve(tmpdir(), 'recovered-policy');
        assert.equal(validateHostedSecurityConfiguration(hostedConfig(policy)).root, policy);
        throw new Error('fixture recovery failed');
      }), /fixture recovery failed/);
      assert.deepEqual(keys.map(key => process.env[key]), ['prior-temp', undefined, '']);
    });
  } finally {
    for (const [index, key] of keys.entries()) {
      if (before[index] === undefined) delete process.env[key];
      else process.env[key] = before[index];
    }
  }
});

void test('selected fixture imports extracted statements once into an exclusively new unicode database', async () => {
  const queries:string[]=[];
  const query=async(sql:string)=>{queries.push(sql);return [[{value:'utf8mb4_unicode_ci'}]];};
  await initializeSelectedFixture({query,database:'native_123_fresh',statements:['SELECT 123','SELECT 456']});
  assert.deepEqual(queries,['CREATE DATABASE `native_123_fresh` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci','USE `native_123_fresh`','SELECT 123','SELECT 456','SELECT @@collation_database value']);
  await assert.rejects(initializeSelectedFixture({query,database:'saved',statements:[]}));
  let imports=0;
  await assert.rejects(initializeSelectedFixture({query:async(sql:string)=>{if(sql.startsWith('CREATE DATABASE'))throw new Error('exists');imports++;},database:'native_123_fresh',statements:['SELECT 1']}),/exists/);
  assert.equal(imports,0);
});
void test('cached image admission refuses changed image bytes or host architecture', () => {
  const id='sha256:'+'a'.repeat(64), image={Id:id,RepoTags:['mariadb:10.11'],Os:'linux',Architecture:'amd64'};
  const admitted = assertReviewedImage(image,id);
  assertReviewedContainerImage({ Image: id }, admitted);
  assert.throws(() => assertReviewedContainerImage({ Image: 'sha256:' + 'b'.repeat(64) }, admitted));
  for(const change of [{Id:'sha256:'+'b'.repeat(64)},{RepoTags:['mariadb:latest']},{Os:'windows'},{Architecture:'arm64'}])assert.throws(()=>assertReviewedImage({...image,...change},id));
  assert.throws(()=>assertReviewedImage(image,undefined));
});
void test('cached OCI index admission binds the tagged index to the reviewed x64 manifest', () => {
  const id = 'sha256:' + 'a'.repeat(64);
  const indexId = 'sha256:' + 'b'.repeat(64);
  const tags = ['mariadb:10.11'];
  const index = { Id: indexId, RepoTags: tags, Descriptor: {
    mediaType: 'application/vnd.oci.image.index.v1+json', digest: indexId, size: 5141,
  } };
  const descriptor = {
    mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: id, size: 2481,
    platform: { os: 'linux', architecture: 'amd64' }, annotations: { 'org.opencontainers.image.version': '10.11' },
  };
  const x64 = { Id: id, RepoTags: tags, Os: 'linux', Architecture: 'amd64', Descriptor: descriptor };

  const admitted = assertReviewedImage(index, id, x64);
  assert.deepEqual(admitted, { imageId: indexId, platformManifest: descriptor });
  assertReviewedContainerImage({ Image: indexId, ImageManifestDescriptor: descriptor }, admitted);
  assert.throws(() => assertReviewedContainerImage({ Image: id, ImageManifestDescriptor: descriptor }, admitted));
  assert.throws(() => assertReviewedContainerImage({ Image: indexId }, admitted));
  assert.throws(() => assertReviewedContainerImage({ Image: indexId, ImageManifestDescriptor: { ...descriptor, size: 2482 } }, admitted));
  assert.throws(() => assertReviewedContainerImage({ Image: indexId, ImageManifestDescriptor: { ...descriptor, annotations: {} } }, admitted));
  assert.throws(() => assertReviewedImage(index, id));
  assert.throws(() => assertReviewedImage({ ...index, Descriptor: { ...index.Descriptor, digest: id } }, id, x64));
  assert.throws(() => assertReviewedImage(index, id, { ...x64, Descriptor: { ...descriptor, digest: indexId } }));
  assert.throws(() => assertReviewedImage(index, id, { ...x64, Descriptor: { ...descriptor, platform: { os: 'linux', architecture: 'arm64' } } }));
});
void test('every inspected native suite has exact required TAP count and only final fee fixture enters recovery',()=>{
  assert.deepEqual(artifactNativePlan.map(item=>item.expected),[1,8,1,5,1,1,1,29]);
  assert.equal(artifactNativePlan.filter(item=>'recovery' in item&&item.recovery).length,1);
  assert.equal(artifactNativePlan.at(-1)?.file,'tests/customer-fee-native.test.ts');
});
void test('recovery local provenance retains distinct source, SQL bytes and live inventory digests',()=>{
  const legacy={release:'hastabazaar-release-fixture',artifactKind:'linux-release',sourceSha256:null,commit:'a'.repeat(40),artifactSha256:'b'.repeat(64),schemaSha256:'c'.repeat(64),keyIds:['d'.repeat(32)],engine:'10.11.14-MariaDB',writeMode:'paused',dispatchPaused:true};
  validateNativeProvenance(legacy);
  const local={...legacy,artifactKind:'local-linux-candidate',sourceSha256:'e'.repeat(64),commit:null,bootstrapSha256:'f'.repeat(64),releaseManifestSha256:'1'.repeat(64)};
  validateNativeProvenance(local);
  validateNativeProvenance({...legacy,artifactKind:'source-snapshot',sourceSha256:'e'.repeat(64),commit:null});
  for(const key of ['bootstrapSha256','releaseManifestSha256','sourceSha256']){const missing:Record<string,unknown>={...local};delete missing[key];assert.throws(()=>validateNativeProvenance(missing));}
  for(const change of [{commit:'a'.repeat(40)},{artifactKind:'source-snapshot'},{bootstrapSha256:'invalid'},{unexpected:true}])assert.throws(()=>validateNativeProvenance({...local,...change}));
  assert.throws(()=>validateNativeProvenance({...legacy,bootstrapSha256:'f'.repeat(64)}));
});
void test('cooperative cancellation interrupts a pending child so its owning lifecycle can close it',async()=>{
  const owner={run:async()=>new Promise(()=>{})};
  await assert.rejects(cancellableChild(owner,'unused',[],{},1000,{checkpoint:async()=>{throw new Error('cancelled fixture');}}),/cancelled fixture/);
});
void test('readiness accepts an explicit reviewed manifest without changing its historical default',async()=>{
  const db={prepare(){return{async all(){return{results:[]};},async first(){return null;}};}} as unknown as D1Database;
  const empty={...defaultManifest,requiredTables:{},requiredTriggers:{},requiredTriggerShapes:{},requiredChecks:{},requiredExactChecks:{},requiredGeneratedColumns:{},requiredColumnCollations:{},requiredUniqueIndexes:{},requiredForeignKeys:{}} as typeof defaultManifest;
  assert.deepEqual(await inspectReadiness(db,'mariadb',empty),{ready:true,missing:[]});
  assert.equal((await inspectReadiness(db,'mariadb')).ready,false);
  assert.equal(releaseId,defaultManifest.release);
});
