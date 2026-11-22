import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feeManagedSeller } from './customer-fee-native-sources';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const digest = /^[a-f0-9]{64}$/;
const clearanceKey = /^private\/managed-clearance-evidence\/clearance-file-[a-f0-9]{64}$/;
const maximumBytes = 4096;
const jsonUtf8 = new TextDecoder('utf-8', { ignoreBOM: true });

async function readBoundedFile(path: string) {
  const status = await lstat(path);
  assert.ok(status.isFile() && status.nlink === 1 && status.size > 0 && status.size <= maximumBytes);
  assert.equal(await realpath(path), path);
  const bytes = await readFile(path);
  assert.equal(bytes.length, status.size);
  return bytes;
}

/** Called only by the selected artifact's customer-fee test entry point. */
export async function prepareNativeFeeClearanceMedia() {
  const env = process.env;
  const workspace = env.HASTABAZAAR_NATIVE_FEE_MEDIA_WORKSPACE;
  const containerId = env.HASTABAZAAR_NATIVE_FEE_MEDIA_CONTAINER_ID;
  const archiveSha256 = env.HASTABAZAAR_NATIVE_FEE_MEDIA_ARCHIVE_SHA256;
  if (workspace === undefined && containerId === undefined && archiveSha256 === undefined) {
    assert.notEqual(env.HASTABAZAAR_CURRENT_ARTIFACT_NATIVE, '1', 'Selected fee fixture requires its media handoff');
    return undefined;
  }
  assert.equal(env.HASTABAZAAR_CURRENT_ARTIFACT_NATIVE, '1');
  assert.ok(env.HASTABAZAAR_NATIVE_ARTIFACT_DIRECTORY);
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.HASTABAZAAR_RUNTIME_ENV, 'local_staging');
  assert.equal(env.HASTABAZAAR_MAIL_MODE, 'capture');
  assert.equal(env.HASTABAZAAR_PAYMENT_MODE, 'simulated');
  assert.equal(env.HASTABAZAAR_RECIPIENT_DOMAIN, 'local.hastabazaar.test');
  assert.ok(containerId && digest.test(containerId));
  assert.ok(archiveSha256 && digest.test(archiveSha256));
  assert.equal(env.HATSKALA_STAGING_NATIVE, '1');
  assert.ok(!env.DOCKER_HOST && !env.DOCKER_CONTEXT && !env.DOCKER_TLS_VERIFY && !env.DOCKER_CERT_PATH);
  const project = resolve(fileURLToPath(new URL('../../', import.meta.url)));
  assert.equal(resolve(process.cwd()), project);
  const artifactDirectory = env.HASTABAZAAR_NATIVE_ARTIFACT_DIRECTORY;
  const parent = resolve(project, '.test-artifacts/t35');
  assert.ok(workspace && workspace.startsWith(parent + sep));
  const [run, target, ...tail] = workspace.slice(parent.length + 1).split(sep);
  assert.ok(/^current-artifact-native-\d+$/.test(run) && /^\d+$/.test(target) && tail.length === 0);
  assert.equal(env.MEDIA_ROOT, resolve(workspace, 'media'));
  assert.equal(env.TMPDIR, resolve(workspace, 'tmp'));
  const { verifyArtifactIdentity } = await import('../../scripts/testing/current-artifact-identity.mjs');
  const { attestCleanup } = await import('../../scripts/testing/verify-current-native.mjs');
  const { realPath } = await import('../../scripts/local-release-source.mjs');
  const docker = process.platform === 'win32' ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker';
  const inspect = (args: string[]) => JSON.parse(execFileSync(docker, args, { encoding: 'utf8', timeout: 30000 }))[0];
  const markerRoot = resolve(project, '.superpowers/sdd/2026-10-16-staging-native-compatibility');
  const markerPath = env.HATSKALA_NATIVE_MARKER ?? '';
  assert.ok(markerPath.startsWith(markerRoot + sep));
  assert.match(markerPath.slice(markerRoot.length + 1), /^\.native-\d+\.json$/);
  const ownerPath = resolve(workspace, 'ownership.json');

  const attestArchive = async () => {
    const admitted = await verifyArtifactIdentity({ project, artifactDirectory });
    assert.equal(admitted.root, artifactDirectory);
    assert.equal(admitted.inventory.archiveSha256, archiveSha256, 'Selected archive differs from the parent admission');
  };
  const attestOwner = async () => {
    for (const directory of [parent, dirname(workspace), workspace]) {
      assert.equal(await realPath(directory), directory);
      assert.ok((await lstat(directory)).isDirectory());
    }
    for (const path of [markerPath, ownerPath]) assert.equal(await realPath(path), path);
    const marker = JSON.parse(jsonUtf8.decode(await readBoundedFile(markerPath)));
    const owner = JSON.parse(jsonUtf8.decode(await readBoundedFile(ownerPath)));
    assert.deepEqual(Object.keys(owner).sort(), ['endpoint', 'name', 'token']);
    assert.match(marker.name, /^hastabazaar-native-\d+$/);
    const markerRun = marker.name.slice('hastabazaar-native-'.length);
    assert.equal(markerPath, resolve(markerRoot, '.native-' + markerRun + '.json'));
    const database = 'native_' + markerRun + '_fresh';
    assert.equal(marker.database, database);
    assert.equal(marker.id, containerId);
    assert.equal(marker.host, '127.0.0.1');
    assert.equal(marker.port, 13329);
    assert.ok(typeof marker.token === 'string' && /^[a-f0-9]{48}$/.test(marker.token) &&
      owner.token === marker.token && env.HATSKALA_NATIVE_TOKEN === marker.token, 'Selected ownership token mismatch');
    assert.ok(typeof marker.password === 'string' && /^[a-f0-9]{64}$/.test(marker.password) &&
      env.DB_PASSWORD === marker.password, 'Selected database password mismatch');
    assert.equal(owner.name, marker.name);
    assert.equal(env.DB_HOST, marker.host);
    assert.equal(env.DB_PORT, '13329');
    assert.equal(env.DB_USER, 'root');
    assert.equal(env.DB_NAME, marker.database);
    const context = inspect(['context', 'inspect']);
    const container = inspect(['inspect', '--type', 'container', containerId]);
    assert.ok(container.Config.Labels['codex.native-owner'] === marker.token, 'Inspected container owner mismatch');
    attestCleanup(context, container, { ...owner, id: containerId });
    assert.equal(container.State.Running, true);
    assert.deepEqual(container.NetworkSettings.Ports['3306/tcp'], [{ HostIp: '127.0.0.1', HostPort: '13329' }]);
    return {
      endpoint: context.Endpoints.docker.Host as string,
      token: marker.token,
      scope: { host: '127.0.0.1', port: 13329, user: 'root', password: marker.password, database },
    };
  };
  await attestArchive();
  const initial = await attestOwner();
  const { database } = initial.scope;
  async function attestFixture() {
    const current = await attestOwner();
    assert.ok(current.endpoint === initial.endpoint && current.token === initial.token &&
      current.scope.database === database && current.scope.password === initial.scope.password,
      'Selected fixture ownership or database scope changed');
    return current.scope;
  }
  const root = resolve(workspace, 'fee-native-media');
  await mkdir(root, { mode: 0o700 }); // Refuse existing handoff roots, including incomplete runs.
  const { LocalMediaBucket } = await import('../../lib/runtime/node-bindings');
  const storage = new LocalMediaBucket(root);
  let uploadedKey: string | undefined;
  const bucket = {
    async get(key: string) {
      assert.ok(clearanceKey.test(key) && uploadedKey === undefined);
      assert.equal(await storage.head(key), null);
      return null;
    },
    async put(key: string, value: ArrayBuffer, options: Parameters<typeof storage.put>[2]) {
      assert.ok(clearanceKey.test(key) && uploadedKey === undefined);
      assert.ok(value instanceof ArrayBuffer && value.byteLength > 0 && value.byteLength <= maximumBytes);
      uploadedKey = key;
      return storage.put(key, value, options);
    },
  } as unknown as R2Bucket;

  return {
    bucket,
    attestFixture,
    async verifyCommitted(db: D1Database) {
      assert.ok(uploadedKey);
      await attestFixture();
      assert.equal((await db.prepare('SELECT DATABASE() AS name').first<{ name: string }>())?.name, database);
      const rows = (await db.prepare(`
        SELECT i.id, i.object_key objectKey, i.size_bytes bytes, i.content_hash sha256,
          i.material_scope_digest scopeDigest, i.seller_id sellerId,
          i.mime_type mimeType, i.original_name originalName
        FROM managed_clearance_evidence_intents i
        JOIN managed_clearance_evidence_files f ON BINARY f.id=BINARY i.id
        WHERE BINARY i.request_id=BINARY ? AND BINARY i.uploaded_by=BINARY ?
          AND BINARY i.seller_id=BINARY ? AND f.retained_at IS NOT NULL
        LIMIT 2
      `).bind('fee-managed-clearance-file', 'owner', feeManagedSeller).all<{
        id: string; objectKey: string; bytes: number; sha256: string;
        scopeDigest: string; sellerId: string; mimeType: string; originalName: string;
      }>()).results;
      assert.equal(rows.length, 1);
      const [row] = rows;
      assert.equal(row.objectKey, uploadedKey);
      assert.equal(row.objectKey, 'private/managed-clearance-evidence/' + row.id);
      assert.equal(row.mimeType, 'application/pdf');
      assert.equal(row.originalName, 'fictional-clearance.pdf');
      assert.match(row.scopeDigest, digest);
      assert.match(row.sha256, digest);
      return async function publishAfterClose() {
        for (const path of [workspace, root, resolve(root, 'private'), dirname(resolve(root, row.objectKey))]) {
          assert.equal(await realpath(path), path);
          assert.ok((await lstat(path)).isDirectory());
        }
        const inventory = await storage.list({ limit: 2 });
        assert.deepEqual(inventory.objects.map(object => object.key), [row.objectKey]);
        assert.equal(inventory.truncated, false);
        const sidecarPath = row.objectKey + '.metadata.json';
        const body = await readBoundedFile(resolve(root, row.objectKey));
        const sidecar = await readBoundedFile(resolve(root, sidecarPath));
        const metadata = JSON.parse(jsonUtf8.decode(sidecar));
        const bodySha256 = sha256(body);
        assert.equal(body.length, Number(row.bytes));
        assert.equal(bodySha256, row.sha256);
        assert.equal(metadata.size, body.length);
        assert.equal(metadata.etag, bodySha256);
        assert.deepEqual(metadata.httpMetadata, { contentType: row.mimeType });
        assert.deepEqual(metadata.customMetadata, {
          sellerId: row.sellerId, contentHash: row.sha256, materialScopeDigest: row.scopeDigest,
        });
        assert.ok(typeof metadata.uploaded === 'string' && Number.isFinite(Date.parse(metadata.uploaded)));
        const manifest = Buffer.from(JSON.stringify({
          version: 1, producer: 'native-fee-clearance-fixture-v1', database, containerId, archiveSha256,
          files: [
            { path: row.objectKey, bytes: body.length, sha256: bodySha256 },
            { path: sidecarPath, bytes: sidecar.length, sha256: sha256(sidecar) },
          ],
        }) + '\n');
        await attestArchive();
        await attestFixture();
        await writeFile(resolve(workspace, 'fee-native-media.json'), manifest, { flag: 'wx', mode: 0o600 });
        return sha256(manifest);
      };
    },
  };
}
