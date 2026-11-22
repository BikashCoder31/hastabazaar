import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage = 'Require exactly --output-directory=<new-owned-child> --expected-sha256=<reviewed-lowercase-sha256>.';
const args = process.argv.slice(2);
const outputs = args.filter(arg => arg.startsWith('--output-directory='));
const hashes = args.filter(arg => arg.startsWith('--expected-sha256='));
if (args.length !== 2 || outputs.length !== 1 || hashes.length !== 1 ||
    !outputs[0].slice('--output-directory='.length) || !/^[a-f0-9]{64}$/.test(hashes[0].slice('--expected-sha256='.length))) {
  throw new Error(usage);
}
const expectedHash = hashes[0].slice('--expected-sha256='.length);
const artifactRoot = resolve(root, '.test-artifacts/t35');
const outputDirectory = resolve(root, outputs[0].slice('--output-directory='.length));
if (dirname(outputDirectory) !== artifactRoot || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(outputDirectory.slice(artifactRoot.length + 1))) {
  throw new Error('Schema preparation requires one new direct child of .test-artifacts/t35.');
}

// Create/check only these artifact ancestors, without traversing a link into private state.
for (const directory of [resolve(root, '.test-artifacts'), artifactRoot]) {
  try { await mkdir(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(directory)).toLowerCase() !== directory.toLowerCase()) {
    throw new Error('Schema preparation artifact ancestors must be real owned directories.');
  }
}
try { await mkdir(outputDirectory); } catch (error) {
  throw new Error('Schema preparation requires a new owned output directory; existing evidence is never reused or overwritten.', { cause: error });
}

// This generator only writes SQL source files. Never execute either generated SQL file.
const generated = spawnSync(process.execPath, [resolve(root, 'scripts/generate-mariadb-schema.mjs'), `--output-directory=${outputDirectory}`], {
  cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000,
});
if (generated.error || generated.status !== 0) {
  throw new Error('Source-only schema generation failed; no selected build input is supplied.', { cause: generated.error ?? new Error(generated.stderr) });
}
const schemaInput = resolve(outputDirectory, 'mariadb-schema.sql');
const schemaInfo = await lstat(schemaInput);
if (!schemaInfo.isFile() || schemaInfo.isSymbolicLink()) throw new Error('Generated schema input must be a regular source file.');
const sha256 = createHash('sha256').update(await readFile(schemaInput)).digest('hex');
if (sha256 !== expectedHash) {
  throw new Error(`Generated schema SHA256 does not match the explicitly reviewed selection; expected ${expectedHash}, generated ${sha256}. Retain this candidate for review; do not bless a replacement hash automatically.`);
}
// Only this exact SQL file can be passed to build:babal. The sibling reset stays
// outside the release manifest; existing standalone/package reset guards remain mandatory.
console.log(JSON.stringify({ schemaInput, sha256 }));
