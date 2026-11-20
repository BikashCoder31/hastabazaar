import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import test from 'node:test';

const repository = resolve(import.meta.dirname, '..');
// A pwsh parent exports its own module path; this child must use existing Windows 5.1 modules.
const powershellEnvironment = { ...process.env, PSModulePath: [
  join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'),
  join(process.env.ProgramFiles ?? 'C:\\Program Files', 'WindowsPowerShell', 'Modules'),
].join(';') };
const probe = process.platform === 'win32'
  ? spawnSync('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8', timeout: 30_000, env: powershellEnvironment })
  : null;
const skip = process.platform !== 'win32' ? 'Requires existing Windows powershell.exe; no runtime is installed by this test.'
  : probe?.error ? `Existing powershell.exe is unavailable: ${probe.error.message}` : false;
const releaseId = 'hastabazaar-release-manifest-fixture';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
interface FileProof { path: string; bytes: number; sha256: string }
interface ReleaseFileManifest { release: string; fileCount: number; totalBytes: number; files: FileProof[] }
const decodeJson = <T,>(text: string): T => JSON.parse(text.replace(/^\uFEFF/, '')) as T;

void test('actual Windows release package reports exact nonzero byte totals and archive file hashes without overwriting artifacts', { skip }, async () => {
  assert.equal(probe?.status, 0, probe?.stderr);
  const fixture = await mkdtemp(join(tmpdir(), 'release-package-manifest-'));
  try {
    const migrationPath = 'deployment/babal/mariadb-schema.sql';
    const selectedSchema = 'CREATE TABLE selected_candidate (id INTEGER);\r\n';
    const release = JSON.stringify({ release: releaseId, migrations: [{ path: migrationPath, sha256: sha256(Buffer.from(selectedSchema)), usage: 'empty-database-only' }] }) + '\n';
    const archiveContents: Record<string, string> = {
      'app.cjs': 'module.exports = { fixture: true };\n',
      'server.js': '// Synthetic package fixture.\n',
      'hosted-security.mjs': '// Synthetic operator fixture.\n',
      'package.json': '{"name":"release-fixture","private":true}\n',
      'dist/client/vinext-client-entry-manifest.json': '{"fixture":true}\n',
      'deployment/babal/release-manifest.json': release,
      [migrationPath]: selectedSchema,
    };
    const sourceContents: Record<string, string> = {
      'deployment/babal/release-manifest.json': JSON.stringify({ release: 'historical-root-release', migrations: [] }) + '\n',
      [migrationPath]: '-- Historical schema must never replace selected standalone bytes.\n',
      'lib/content/legal-policies.ts': `export const customer = 'customer-policy-set-2026-10-01';\nexport const seller = 'seller-agreement:sha256:${'a'.repeat(64)}';\n`,
    };
    for (const [path, content] of Object.entries(archiveContents)) {
      sourceContents['dist/standalone/' + path] = content;
    }
    for (const [path, content] of Object.entries(sourceContents)) {
      const destination = join(fixture, path);
      await mkdir(resolve(destination, '..'), { recursive: true });
      await writeFile(destination, content, 'utf8');
    }
    await mkdir(join(fixture, 'scripts'));
    await mkdir(join(fixture, 'outputs'));
    const script = join(fixture, 'scripts/package-babal-release.ps1');
    await copyFile(join(repository, 'scripts/package-babal-release.ps1'), script);
    await copyFile(join(repository, 'scripts/release-files.mjs'), join(fixture, 'scripts/release-files.mjs'));
    try { await copyFile(join(repository, 'scripts/release-schema-assets.mjs'), join(fixture, 'scripts/release-schema-assets.mjs')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const packageFixture = () => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ReleaseId', releaseId],
      { cwd: fixture, encoding: 'utf8', timeout: 120_000, env: powershellEnvironment });

    // Neither a correct repository copy nor a matching ZIP inventory can rescue
    // a stale/tampered built schema: the standalone manifest is the contract.
    await writeFile(join(fixture, 'dist/standalone', migrationPath), '-- Tampered built bytes.\n');
    const tampered = packageFixture();
    assert.notEqual(tampered.status, 0, 'schema hash mismatch must stop before archive creation');
    assert.match(tampered.stderr, /Migration hash mismatch/);
    await assert.rejects(readFile(join(fixture, 'outputs', releaseId + '.zip')), { code: 'ENOENT' });
    await writeFile(join(fixture, 'dist/standalone', migrationPath), selectedSchema);

    const packaged = packageFixture();
    assert.equal(packaged.status, 0, `${packaged.error?.message ?? ''}\n${packaged.stderr}\n${packaged.stdout}`);
    assert.equal(await readFile(join(fixture, migrationPath), 'utf8'), sourceContents[migrationPath], 'historical root schema is preserved');
    assert.equal(await readFile(join(fixture, 'deployment/babal/release-manifest.json'), 'utf8'), sourceContents['deployment/babal/release-manifest.json']);

    const expected = Object.entries(archiveContents).map(([path, content]) => ({ path, bytes: Buffer.byteLength(content, 'utf8'), sha256: sha256(Buffer.from(content, 'utf8')) }))
      .sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const knownTotal = expected.reduce((total, file) => total + file.bytes, 0);
    assert.ok(knownTotal > 0);
    const artifact = (suffix: string) => join(fixture, 'outputs', releaseId + suffix);
    const manifest = decodeJson<ReleaseFileManifest>(await readFile(artifact('.manifest.json'), 'utf8'));
    assert.equal(manifest.release, releaseId);
    assert.equal(manifest.totalBytes, knownTotal, 'totalBytes must equal the independently known fixture bytes');
    assert.equal(manifest.fileCount, 7);
    assert.deepEqual(manifest.files, expected);

    // Inspect the actual ZIP independently, rather than trusting the packaging report.
    const inspector = join(fixture, 'inspect-archive.ps1');
    await writeFile(inspector, `param([string]$Archive)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
  $files = @($zip.Entries | Where-Object { $_.Name -ne '' } | ForEach-Object {
    $entry = $_
    $stream = $entry.Open()
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose(); $stream.Dispose() }
    [pscustomobject]@{ path = $entry.FullName.Replace('\\', '/'); bytes = $entry.Length; sha256 = $hash }
  } | Sort-Object path)
  ConvertTo-Json -InputObject $files -Depth 4 -Compress
} finally { $zip.Dispose() }
`, 'utf8');
    const inspection = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', inspector, '-Archive', artifact('.zip')], { encoding: 'utf8', timeout: 30_000, env: powershellEnvironment });
    assert.equal(inspection.status, 0, `${inspection.error?.message ?? ''}\n${inspection.stderr}`);
    const actualArchiveFiles = decodeJson<FileProof[]>(inspection.stdout);
    assert.equal(actualArchiveFiles.length, 7);
    assert.deepEqual(actualArchiveFiles, expected);
    const verification = decodeJson<{ sourceFileCount: number; archiveFileCount: number; mismatchCount: number; missingRequired: string[]; zipSha256: string }>(await readFile(artifact('.verification.json'), 'utf8'));
    assert.equal(verification.sourceFileCount, 7);
    assert.equal(verification.archiveFileCount, 7);
    assert.equal(verification.mismatchCount, 0);
    assert.deepEqual(verification.missingRequired, []);
    const zipHash = sha256(await readFile(artifact('.zip')));
    assert.equal(verification.zipSha256, zipHash);
    assert.equal((await readFile(artifact('.sha256'), 'utf8')).trim(), `${zipHash}  ${releaseId}.zip`);

    const before = await Promise.all(['.zip', '.manifest.json', '.verification.json', '.sha256'].map(async suffix => sha256(await readFile(artifact(suffix)))));
    const repeated = packageFixture();
    assert.notEqual(repeated.status, 0);
    assert.match(repeated.stderr, /Refusing to overwrite existing release artifact/);
    const after = await Promise.all(['.zip', '.manifest.json', '.verification.json', '.sha256'].map(async suffix => sha256(await readFile(artifact(suffix)))));
    assert.deepEqual(after, before, 'repeated packaging must preserve every existing release artifact');
  } finally {
    assert.ok(resolve(fixture).startsWith(resolve(tmpdir()) + sep) && basename(fixture).startsWith('release-package-manifest-'), 'Cleanup must stay inside this test-created temporary fixture');
    await rm(fixture, { recursive: true, force: true });
  }
});
