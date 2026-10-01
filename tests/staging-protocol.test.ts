import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

const body = Buffer.from('archive fixture');
const identity = {
  schemaVersion: 1, release: 'hastabazaar-release-ci-test-1', commit: 'a'.repeat(40), platform: 'linux', arch: 'x64',
  archive: 'hastabazaar-release-ci-test-1.tar.gz', archiveBytes: body.length,
  archiveSha256: createHash('sha256').update(body).digest('hex'), fileCount: 1,
  runtime: { liveness: true, databaseUntouched: true },
  files: [{ path: 'app.cjs', bytes: 1, sha256: 'b'.repeat(64) }],
};

void test('staging protocol accepts bounded payload and validates its exact checksum', async () => {
  const { receiveStagingPayload } = await import('../scripts/deployment/staging-protocol.mjs');
  const root = await mkdtemp(join(tmpdir(), 'staging-protocol-'));
  try {
    const path = join(root, 'archive');
    const header = Buffer.from(JSON.stringify(identity) + '\n');
    const result = await receiveStagingPayload(Readable.from([header.subarray(0, 5), header.subarray(5), body]), path);
    assert.equal(result.release, identity.release);
    assert.deepEqual(await readFile(path), body);
    await assert.rejects(receiveStagingPayload(Readable.from([header, body]), path));
    await assert.rejects(receiveStagingPayload(Readable.from([header, Buffer.from('bad')]), join(root, 'bad')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

void test('staging protocol rejects foreign platform, unsafe metadata, huge headers and truncated input', async () => {
  const { receiveStagingPayload } = await import('../scripts/deployment/staging-protocol.mjs');
  const root = await mkdtemp(join(tmpdir(), 'staging-protocol-'));
  try {
    for (const overrides of [{ platform: 'win32' }, { release: '../escape' }, { archiveBytes: 200 * 1024 * 1024 }, { fileCount: 2 }]) {
      await assert.rejects(receiveStagingPayload(Readable.from([JSON.stringify({ ...identity, ...overrides }) + '\n', body]), join(root, 'rejected')));
    }
    await assert.rejects(receiveStagingPayload(Readable.from([Buffer.alloc(4 * 1024 * 1024 + 1)]), join(root, 'header')));
    await assert.rejects(receiveStagingPayload(Readable.from(['{}']), join(root, 'incomplete')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

void test('forced staging command rejects shells, scp, arguments and production targets', async () => {
  const { assertStagingCommand } = await import('../scripts/deployment/staging-protocol.mjs');
  assert.doesNotThrow(() => assertStagingCommand('deploy-staging-v1'));
  for (const command of [undefined, '', 'bash', 'scp -t app', 'deploy-production', 'deploy-staging-v1; whoami', 'deploy-staging-v1 ../production']) {
    assert.throws(() => assertStagingCommand(command));
  }
});
