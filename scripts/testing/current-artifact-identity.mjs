import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { ownedEvidencePath, realPath, requireLocalLinux, verifyLocalSource } from '../local-release-source.mjs';
import { readReleaseAssets, releaseManifestPath, releaseSchemaPath } from '../release-schema-assets.mjs';
import { verifyRelease } from '../release-files.mjs';
import { sameFeeSqlDefinition } from '../../lib/operations/fee-schema-readiness.mjs';

export const selectedSchemaSha256 = 'f1ece8aeb6c18b4921f70d43259a9cfcc4d2c82d1512761bd11c0cc2d96034b4';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function reviewedIdentityEnvironment(env) {
  return Object.fromEntries(['SOURCE', 'ARCHIVE', 'SCHEMA', 'MANIFEST'].map(name => {
    const key = `HASTABAZAAR_REVIEWED_${name}_SHA256`;
    assert.match(env[key] ?? '', /^[a-f0-9]{64}$/, `Explicit independently reviewed ${name} SHA256 required`);
    return [key, env[key]];
  }));
}

// CI remains commit-bound. A local artifact is an explicitly reviewed snapshot,
// never a fabricated commit and never a source-only recovery snapshot.
export function assertArtifactIdentity(inventory, env) {
  assert.equal(inventory.platform, 'linux'); assert.equal(inventory.arch, 'x64');
  assert.equal(inventory.runtime?.liveness, true);
  assert.match(inventory.archive, /^hastabazaar-release-[a-z0-9._-]+\.tar\.gz$/);
  assert.equal(inventory.archive, inventory.release + '.tar.gz');
  if (inventory.artifactKind === 'local-linux-candidate') {
    assert.ok(!env.CI && !env.GITHUB_ACTIONS && !env.GITHUB_SHA, 'Local artifacts cannot impersonate CI');
    reviewedIdentityEnvironment(env);
    assert.equal(inventory.commit, null);
    assert.equal(inventory.sourceIdentityKind, 'source-snapshot');
    assert.equal(inventory.linuxRuntimeVerified, true);
    assert.equal(inventory.productionReady, false); assert.equal(inventory.deploymentAuthorized, false);
    assert.equal(inventory.sourceSha256, env.HASTABAZAAR_REVIEWED_SOURCE_SHA256);
    assert.equal(inventory.archiveSha256, env.HASTABAZAAR_REVIEWED_ARCHIVE_SHA256);
    assert.equal(inventory.schemaSha256, env.HASTABAZAAR_REVIEWED_SCHEMA_SHA256);
    const manifest = inventory.files?.find(file => file.path === releaseManifestPath);
    assert.equal(manifest?.sha256, env.HASTABAZAAR_REVIEWED_MANIFEST_SHA256);
  } else {
    assert.ok(inventory.artifactKind === undefined || inventory.artifactKind === 'linux-release');
    assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/);
    assert.equal(inventory.commit, env.GITHUB_SHA);
  }
}

export async function verifyArtifactIdentity({ project, artifactDirectory, env = process.env }) {
  const root = await realPath(artifactDirectory);
  const inventory = JSON.parse(await readFile(await realPath(resolve(root, 'inventory.json')), 'utf8'));
  assertArtifactIdentity(inventory, env);
  if (inventory.artifactKind === 'local-linux-candidate') {
    requireLocalLinux();
    assert.equal(root, await ownedEvidencePath(project, root, 'candidate'));
    const snapshot = JSON.parse(await readFile(await realPath(resolve(root, 'source.json')), 'utf8'));
    await verifyLocalSource(project, snapshot, env.HASTABAZAAR_REVIEWED_SOURCE_SHA256);
    assert.equal(snapshot.schema.sha256, inventory.schemaSha256);
  } else assert.ok(root.startsWith(resolve(project, 'outputs') + sep), 'CI artifact must be in project outputs');
  const bytes = await readFile(await realPath(resolve(root, inventory.archive)));
  assert.equal(bytes.length, inventory.archiveBytes);
  assert.equal(digest(bytes), inventory.archiveSha256);
  return { root, inventory };
}

export async function verifySelectedPackage(root, inventory, env = process.env) {
  const { manifest, files, manifestBytes } = await readReleaseAssets(root, inventory.release);
  await verifyRelease(root, inventory.files, manifest.migrations.map(item => item.path));
  const schema = files.find(file => file.path === releaseSchemaPath).bytes;
  assert.equal(digest(schema), selectedSchemaSha256, 'Only the independently accepted selected schema is admitted');
  assert.equal(Object.keys(manifest.requiredExactChecks).length, 309);
  if (inventory.artifactKind === 'local-linux-candidate') {
    assert.equal(digest(schema), env.HASTABAZAAR_REVIEWED_SCHEMA_SHA256);
    assert.equal(digest(manifestBytes), env.HASTABAZAAR_REVIEWED_MANIFEST_SHA256);
  }
  return { manifest, schema, manifestSha256: digest(manifestBytes) };
}

export async function assertSelectedConstraints(connection, manifest) {
  assert.equal(Object.keys(manifest.requiredExactChecks).length, 309);
  const [settings] = await connection.query('SELECT @@foreign_key_checks foreignKeys, @@check_constraint_checks checksEnabled');
  assert.deepEqual(settings[0], {foreignKeys:1,checksEnabled:1}, 'Selected native constraints must remain enabled');
  const [rows] = await connection.query('SELECT TABLE_NAME tableName,CONSTRAINT_NAME name,CHECK_CLAUSE definition FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()');
  const checks = new Map(rows.map(row => [row.tableName + '.' + row.name, row.definition]));
  for (const [name, definition] of Object.entries(manifest.requiredExactChecks)) {
    assert.ok(sameFeeSqlDefinition(checks.get(name), definition), 'Missing or changed selected constraint: ' + name);
  }
  return 309;
}

export function nativeReadinessAdapter(connection) {
  return {dialect:'mariadb',prepare(sql){let values=[];return{
    bind(...next){values=next;return this;},
    async first(){return(await connection.query(sql,values))[0][0]??null;},
    async all(){return{results:(await connection.query(sql,values))[0]};},
  };}};
}
