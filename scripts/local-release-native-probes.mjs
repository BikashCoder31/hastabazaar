// Reusable finite native proof; caller must first accept the fresh final-root dependency audit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { realPath, requireLocalLinux } from './local-release-source.mjs';
import { verifyInputs } from './local-release-namespace.mjs';

export async function probeNativeDependencies(input, output, env, inputs) {
requireLocalLinux();
assert.equal(process.version, 'v22.23.2');
assert.equal(process.execPath, '/runtime/bin/node');
await realPath(input);
await realPath(join(input, 'node_modules'));
await verifyInputs(input, inputs);
await mkdir(output);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const commands = [], binaryFiles = [], packages = [];
const startedAt = new Date().toISOString();
let errorMessage = null, inputsUnchanged = false;
async function probe(name, executable, args, expected = null) {
  const command = spawnSync(executable, args, { cwd: input, env, encoding: 'utf8', timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
  const log = `${command.stdout ?? ''}\n${command.stderr ?? ''}`;
  await writeFile(join(output, `${name}.log`), log, { flag: 'wx' });
  const receipt = { name, executable, args, cwd: input, exitCode: command.status, signal: command.signal, error: command.error?.message ?? null, logSha256: sha256(log), stdout: command.stdout?.trim() ?? '' };
  commands.push(receipt);
  await save(`${name}.json`, receipt);
  if (command.error) throw command.error;
  assert.equal(command.status, 0, `Native probe failed: ${name}`);
  if (expected !== null) assert.equal(command.stdout.trim(), expected, `Native version mismatch: ${name}`);
  return command.stdout.trim();
}
async function nativeFile(path, expectedSha256) {
  await realPath(path);
  assert.equal(await realpath(path), path);
  const handle = await open(path, 'r');
  let bytes;
  try { const header = Buffer.alloc(64); await handle.read(header, 0, 64, 0); bytes = header; }
  finally { await handle.close(); }
  assert.equal(bytes.subarray(0, 4).toString('hex'), '7f454c46');
  assert.equal(bytes[4], 2, 'Expected ELF64');
  assert.equal(bytes[5], 1, 'Expected little endian ELF');
  assert.equal(bytes.readUInt16LE(18), 62, 'Expected ELF x86_64');
  const digest = createHash('sha256');
  for await (const part of createReadStream(path)) digest.update(part);
  const actual = digest.digest('hex');
  assert.equal(actual, expectedSha256, `Static/native bytes changed: ${path}`);
  binaryFiles.push({ path, sha256: actual, elfClass: 64, machine: 'x86_64' });
}
try {
  const compilers = [
    { name: 'esbuild-direct', base: 'node_modules/esbuild', binary: 'node_modules/@esbuild/linux-x64/bin/esbuild', version: '0.28.2', sha256: 'e1698a3d5c6c0798fee4fd3b5cc816651f460c63d390a7a26ea4beb0b1884100' },
    { name: 'esbuild-core-utils', base: 'node_modules/@esbuild-kit/core-utils/node_modules/esbuild', binary: 'node_modules/@esbuild-kit/core-utils/node_modules/@esbuild/linux-x64/bin/esbuild', version: '0.25.12', sha256: 'bab29b2ca7a9e89b67cf720b77b2d743f9f31f5cf0d5bd74ee8c8de30ced7014' },
    { name: 'esbuild-drizzle-kit', base: 'node_modules/drizzle-kit/node_modules/esbuild', binary: 'node_modules/drizzle-kit/node_modules/@esbuild/linux-x64/bin/esbuild', version: '0.25.12', sha256: 'bab29b2ca7a9e89b67cf720b77b2d743f9f31f5cf0d5bd74ee8c8de30ced7014' },
  ];
  for (const compiler of compilers) {
    const base = join(input, compiler.base);
    const require = createRequire(join(base, 'package.json'));
    assert.equal(await realpath(require.resolve('@esbuild/linux-x64/bin/esbuild')), join(input, compiler.binary));
    assert.throws(() => require.resolve('pnpapi'), { code: 'MODULE_NOT_FOUND' });
    assert.equal(JSON.parse(await readFile(join(base, 'package.json'))).version, compiler.version);
    await nativeFile(join(input, compiler.binary), compiler.sha256);
    packages.push({ name: compiler.name, version: compiler.version, path: base });
  }
  const workerd = join(input, 'node_modules/@cloudflare/workerd-linux-64/bin/workerd');
  const requireWorkerd = createRequire(join(input, 'node_modules/workerd/package.json'));
  assert.equal(await realpath(requireWorkerd.resolve('@cloudflare/workerd-linux-64/bin/workerd')), workerd);
  assert.throws(() => requireWorkerd.resolve('pnpapi'), { code: 'MODULE_NOT_FOUND' });
  await nativeFile(workerd, '3ee1cc5b09497de8f47f513b5c5c485da99a9fc8b188b5618cb05de63f3b4b64');
  await nativeFile(join(input, 'node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.5.node'), 'cf896cc1b7f3ae9c3e8eb3d7b2b198b8de2824ff7d0681d684bab5a825def335');
  await nativeFile(join(input, 'node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.7'), '4aa73553408c3964071728f4a231a8e86918e39bc49f1fbae75355f7ea933ea9');
  await save('binary-admission.json', { binaryFiles, pnpapiAvailable: false, absoluteOverrideUsed: false });
  for (const compiler of compilers) {
    await probe(`${compiler.name}-native-version`, join(input, compiler.binary), ['--version'], compiler.version);
    await probe(`${compiler.name}-wrapper-version`, process.execPath, [join(input, compiler.base, 'bin/esbuild'), '--version'], compiler.version);
    const script = `const assert=require('node:assert/strict');const esbuild=require(process.argv[1]);assert.equal(esbuild.version,process.argv[2]);try{const result=esbuild.transformSync('const answer: number = 42;', {loader:'ts'});assert.match(result.code,/answer = 42/);console.log(JSON.stringify({version:esbuild.version,input:'in-memory TypeScript fixture',code:result.code.trim()}));}finally{esbuild.stop();}`;
    await probe(`${compiler.name}-transform`, process.execPath, ['--input-type=commonjs', '-e', script, join(input, compiler.base), compiler.version]);
  }
  await probe('workerd-native-version', workerd, ['--version'], 'workerd 2026-10-06');
  await probe('workerd-wrapper-version', process.execPath, [join(input, 'node_modules/workerd/bin/workerd'), '--version'], 'workerd 2026-10-06');
  await probe('vite-version', process.execPath, [join(input, 'node_modules/vite/bin/vite.js'), '--version']);
  await probe('vinext-version', process.execPath, [join(input, 'node_modules/vinext/dist/cli.js'), '--version']);
  const sharpScript = `const assert=require('node:assert/strict');const sharp=require(process.argv[1]);assert.equal(sharp.versions.sharp,'0.35.5');sharp.concurrency(1);(async()=>{const png=await sharp({create:{width:8,height:8,channels:4,background:{r:10,g:20,b:30,alpha:1}}}).png().toBuffer();const metadata=await sharp(png).metadata();assert.equal(metadata.format,'png');assert.equal(metadata.width,8);assert.equal(metadata.height,8);console.log(JSON.stringify({versions:sharp.versions,render:{width:metadata.width,height:metadata.height,format:metadata.format,bytes:png.length,sha256:require('node:crypto').createHash('sha256').update(png).digest('hex')}}));})().catch(error=>{console.error(error);process.exitCode=1;});`;
  await probe('sharp-render', process.execPath, ['--input-type=commonjs', '-e', sharpScript, join(input, 'node_modules/sharp')]);
  for (const name of ['vinext', 'vite', 'sharp', 'workerd']) {
    const path = join(input, 'node_modules', name, 'package.json');
    const bytes = await readFile(await realPath(path));
    packages.push({ name, version: JSON.parse(bytes).version, path, packageJsonSha256: sha256(bytes) });
  }
  await verifyInputs(input, inputs);
  inputsUnchanged = true;
} catch (error) { errorMessage = error.stack ?? error.message; }
finally {
  try { await verifyInputs(input, inputs); inputsUnchanged = true; } catch (error) { errorMessage = `${errorMessage ?? ''}\nInput preservation failure: ${error.stack ?? error.message}`; }
  await save('result.json', { kind: 'linux-owned-dependency-native-probes', startedAt, finishedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, node: process.version, nodeAbi: process.versions.modules, napi: process.versions.napi, packageCount: packages.length, packages, binaryFiles, probeCount: commands.length, commands, inputsUnchanged, error: errorMessage, lifecycleScriptsExecuted: false, applicationBuild: false });
}

assert.equal(errorMessage, null, 'Native dependency proof failed; retain receipt and report for Astra review without retrying blind.');

}
