import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assertArtifactIdentity, assertSelectedConstraints, reviewedIdentityEnvironment } from '../scripts/testing/current-artifact-identity.mjs';
import { stagingNativeMode } from '../scripts/testing/staging-native-mode.mjs';

const hashes = Object.fromEntries(['SOURCE','ARCHIVE','SCHEMA','MANIFEST'].map((name, i) => [`HASTABAZAAR_REVIEWED_${name}_SHA256`, String(i + 1).repeat(64)]));
const local = () => ({ platform:'linux', arch:'x64', runtime:{liveness:true}, release:'hastabazaar-release-test', archive:'hastabazaar-release-test.tar.gz', artifactKind:'local-linux-candidate', commit:null, sourceIdentityKind:'source-snapshot', linuxRuntimeVerified:true, productionReady:false, deploymentAuthorized:false, sourceSha256:hashes.HASTABAZAAR_REVIEWED_SOURCE_SHA256, archiveSha256:hashes.HASTABAZAAR_REVIEWED_ARCHIVE_SHA256, schemaSha256:hashes.HASTABAZAAR_REVIEWED_SCHEMA_SHA256, files:[{path:'deployment/babal/release-manifest.json',sha256:hashes.HASTABAZAAR_REVIEWED_MANIFEST_SHA256}] });
void test('truthful local identity requires all four independent pins', () => {
  assert.doesNotThrow(() => assertArtifactIdentity(local(), hashes));
  for (const key of Object.keys(hashes)) {
    const env = {...hashes}; delete env[key];
    assert.throws(() => assertArtifactIdentity(local(), env));
    assert.throws(() => assertArtifactIdentity(local(), {...hashes,[key]:'f'.repeat(64)}));
  }
  assert.deepEqual(reviewedIdentityEnvironment({...hashes,DB_PASSWORD:'secret'}), hashes);
});
void test('local identity never admits CI, fictitious commits, snapshots or readiness escalation', () => {
  for (const key of ['CI','GITHUB_ACTIONS','GITHUB_SHA']) assert.throws(() => assertArtifactIdentity(local(), {...hashes,[key]:'1'}));
  for (const change of [{commit:'a'.repeat(40)}, {artifactKind:'source-snapshot'}, {linuxRuntimeVerified:false}, {productionReady:true}, {deploymentAuthorized:true}, {runtime:{liveness:false}}, {archive:'../elsewhere.tar.gz'}]) assert.throws(() => assertArtifactIdentity({...local(),...change}, hashes));
});
void test('CI still requires matching real commit and Linux liveness', () => {
  const ci = {...local(), artifactKind:'linux-release',commit:'a'.repeat(40)};
  assert.doesNotThrow(() => assertArtifactIdentity(ci, {GITHUB_SHA:'a'.repeat(40)}));
  assert.throws(() => assertArtifactIdentity(ci, hashes));
  assert.throws(() => assertArtifactIdentity(ci, {GITHUB_SHA:'b'.repeat(40)}));
});
void test('selected native checks require all 309 complete definitions, not names or count alone', async () => {
  const requiredExactChecks = Object.fromEntries(Array.from({length:309},(_,i)=>['fixture.check_'+i,'value BETWEEN 0 AND 9007199254740991']));
  const rows = Object.keys(requiredExactChecks).map(key=>({tableName:'fixture',name:key.split('.')[1],definition:'`value` between 0 and 9007199254740991'}));
  const connection = {query:async sql=>sql.startsWith('SELECT @@')?[[{foreignKeys:1,checksEnabled:1}]]:[rows]};
  assert.equal(await assertSelectedConstraints(connection,{requiredExactChecks}),309);
  await assert.rejects(assertSelectedConstraints({query:async()=>[[{foreignKeys:0,checksEnabled:1}]]},{requiredExactChecks}),/remain enabled/);
  rows[100].definition='value BETWEEN 0 AND 9007199254740992';
  await assert.rejects(assertSelectedConstraints(connection,{requiredExactChecks}),/fixture.check_100/);
  rows.splice(100,1);
  await assert.rejects(assertSelectedConstraints(connection,{requiredExactChecks}),/fixture.check_100/);
  await assert.rejects(assertSelectedConstraints(connection,{requiredExactChecks:{}}));
});
void test('historical mode is exclusive and retains every historical native assertion byte',async()=>{
  assert.deepEqual(stagingNativeMode([]),{localRecovery:false,historicalOnly:false});
  assert.deepEqual(stagingNativeMode(['--historical-only']),{localRecovery:false,historicalOnly:true});
  assert.deepEqual(stagingNativeMode(['--local-recovery']),{localRecovery:true,historicalOnly:false});
  for(const args of [['--unknown'],['--historical-only','--local-recovery'],['--historical-only','--historical-only'],['saved-db']])assert.throws(()=>stagingNativeMode(args));
  const source=(await readFile(new URL('../scripts/verify-staging-native.mjs',import.meta.url),'utf8')).replaceAll('\r\n','\n');
  const historical=source.slice(source.indexOf('try{'),source.indexOf('  if(!localRecovery'));
  assert.match(source,/async function create\(label\)[\s\S]*?CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/);
  assert.match(historical,/DROP DATABASE[^\n]+\n\s*await create\('fresh'\)/);
  const originalFixtureBlock = historical
    .replace('CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', 'CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci')
    .replace(
      "      await create('fresh');",
      "      await connection.query('CREATE DATABASE `native_'+run+'_fresh` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');\n      await connection.query('USE `native_'+run+'_fresh`');",
    );
  assert.equal(createHash('sha256').update(originalFixtureBlock).digest('hex'),'801f876ef9bf9ae6136b7e8a080b3824a99c814516ce139950db4654c0c682dc','Historical assertion body changed; review it separately');
  assert.match(source,/if\(!localRecovery&&!historicalOnly\)await check/);
  assert.match(source,/if\(!historicalOnly\)await check\(localRecovery/);
});
void test('workflow supplies the pinned MariaDB image before both required native gates',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/verify-release.yml',import.meta.url),'utf8');
  const pull=workflow.indexOf('      - name: Pull reviewed MariaDB image');
  const start=workflow.indexOf('      - name: Require preserved historical');
  const end=workflow.indexOf('      - name: Retain enumerated',start);
  assert.ok(pull>0&&start>pull&&end>start);
  const image=workflow.slice(pull,start);
  assert.match(image,/id: mariadb\b/);
  assert.match(image,/docker\.io\/library\/mariadb@sha256:5ae7fc7b20f8e07c0ee169ff24617b39cb99b4bfc147555cea758baa69834d9e/);
  assert.match(image,/docker pull --platform linux\/amd64 "\$image"/);
  assert.match(image,/docker image tag "\$image" mariadb:10\.11/);
  assert.match(image,/image_id=%s[^\n]+GITHUB_OUTPUT/);
  const gates=workflow.slice(start,end);
  assert.match(gates,/node --import tsx scripts\/verify-staging-native\.mjs --historical-only/);
  assert.match(gates,/HASTABAZAAR_REVIEWED_MARIADB_IMAGE_ID: \$\{\{ steps\.mariadb\.outputs\.image_id \}\}/);
  assert.match(gates,/node --import tsx scripts\/testing\/verify-current-artifact-native\.mjs/);
  assert.doesNotMatch(gates,/continue-on-error:|\bif:|\|\|/);
  assert.doesNotMatch(workflow,/vars\.HASTABAZAAR_REVIEWED_MARIADB_IMAGE_ID/);
  assert.match(workflow,/reviewed NUL schema source/);
});
