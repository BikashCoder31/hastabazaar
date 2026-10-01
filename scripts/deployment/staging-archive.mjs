import assert from 'node:assert/strict';
import { readdir, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReadStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import * as tar from 'tar';
import { assertReleasePath } from '../release-files.mjs';

export function validateStagingInventory(files) {
  assert.ok(Array.isArray(files) && files.length > 0 && files.length <= 20_000, 'Invalid file inventory.');
  const expected = new Map();
  let total = 0;
  for (const file of files) {
    assertReleasePath(file.path);
    assert.ok(!expected.has(file.path), 'Duplicate inventory path.');
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= 50 * 1024 * 1024, 'Invalid file size.');
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    total += file.bytes;
    expected.set(file.path, file);
  }
  assert.ok(total <= 512 * 1024 * 1024, 'Expanded release is too large.');
  return expected;
}

/** @param {string} archive @param {string} root @param {{path:string,bytes:number,sha256:string}[]} files */
export async function extractStagingArchive(archive, root, files) {
  const expected = validateStagingInventory(files);
  assert.equal(await realpath(root), resolve(root), 'Extraction root must not redirect.');
  assert.equal((await readdir(root)).length, 0, 'Extraction requires a new empty directory.');
  const seen = new Set();
  const seenFiles = new Set();
  let expanded = 0;
  const bounded = new Transform({ transform(chunk, _encoding, done) {
    expanded += chunk.length;
    done(expanded > 600 * 1024 * 1024 ? new Error('Expanded tar stream is too large.') : null, chunk);
  } });
  // Inspect all headers before allowing any archive entry to write to disk.
  const parser = new tar.Parser({ strict: true, onReadEntry(entry) {
    try {
      const path = entry.path.startsWith('./') ? entry.path.slice(2) : entry.path;
      if ((path === '' || path === '.') && entry.type === 'Directory') return;
      const normalized = entry.type === 'Directory' ? path.replace(/\/$/, '') : path;
      assertReleasePath(normalized);
      assert.ok(!seen.has(normalized), 'Duplicate archive path.');
      seen.add(normalized);
      assert.ok(seen.size <= 25_000, 'Too many archive entries.');
      assert.ok(entry.type === 'File' || entry.type === 'Directory', 'Links and special files are forbidden.');
      if (entry.type === 'File') {
        assert.ok(expected.has(path), 'Unexpected archive file.');
        assert.equal(entry.size, expected.get(path).bytes, 'Archive file size differs from inventory.');
        seenFiles.add(path);
      } else {
        assert.equal(entry.size, 0, 'Directory entries must be empty.');
      }
    } catch (error) { parser.abort(error); }
    finally { entry.resume(); }
  } });
  await pipeline(createReadStream(archive), createGunzip(), bounded, parser);
  assert.equal(seenFiles.size, expected.size, 'Archive is missing inventoried files.');
  await tar.x({ file: archive, cwd: root, strict: true, preservePaths: false, chmod: false,
    filter: (_path, entry) => entry.type === 'File' || entry.type === 'Directory' });
}
