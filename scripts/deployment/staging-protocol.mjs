import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { validateStagingInventory } from './staging-archive.mjs';

export function assertStagingCommand(command) {
  assert.equal(command, 'deploy-staging-v1', 'Only the staging deployment command is allowed.');
}

function validateIdentity(identity) {
  assert.equal(identity.schemaVersion, 1);
  assert.equal(identity.platform, 'linux');
  assert.equal(identity.arch, 'x64');
  assert.match(identity.release, /^hastabazaar-release-[a-z0-9._-]{1,100}$/);
  assert.match(identity.commit, /^[a-f0-9]{40}$/);
  assert.equal(identity.archive, `${identity.release}.tar.gz`);
  assert.ok(Number.isSafeInteger(identity.archiveBytes) && identity.archiveBytes > 0 && identity.archiveBytes <= 100 * 1024 * 1024);
  assert.match(identity.archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(identity.runtime?.liveness, true);
  assert.equal(identity.runtime?.databaseUntouched, true);
  const inventory = validateStagingInventory(identity.files);
  assert.equal(identity.fileCount, inventory.size);
}

export async function receiveStagingPayload(stream, path, signal) {
  let header = Buffer.alloc(0);
  let identity;
  let file;
  let bytes = 0;
  const hash = createHash('sha256');
  const abort = () => stream.destroy(signal.reason);
  signal?.throwIfAborted();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for await (const input of stream) {
      signal?.throwIfAborted();
      let chunk = Buffer.isBuffer(input) ? input : Buffer.from(input);
      if (!identity) {
        const boundary = chunk.indexOf(10);
        const part = boundary < 0 ? chunk : chunk.subarray(0, boundary);
        assert.ok(header.length + part.length <= 4 * 1024 * 1024, 'Staging header is too large.');
        header = Buffer.concat([header, part]);
        if (boundary < 0) continue;
        identity = JSON.parse(header.toString('utf8'));
        validateIdentity(identity);
        file = await open(path, 'wx', 0o600);
        header = Buffer.alloc(0);
        chunk = chunk.subarray(boundary + 1);
      }
      bytes += chunk.length;
      assert.ok(bytes <= identity.archiveBytes, 'Staging payload exceeds its declared size.');
      hash.update(chunk);
      await file.writeFile(chunk);
    }
    assert.ok(identity, 'Staging payload has no complete header.');
    assert.equal(bytes, identity.archiveBytes, 'Staging payload is truncated.');
    assert.equal(hash.digest('hex'), identity.archiveSha256, 'Staging archive checksum mismatch.');
    return identity;
  } finally {
    signal?.removeEventListener('abort', abort);
    await file?.close();
  }
}
