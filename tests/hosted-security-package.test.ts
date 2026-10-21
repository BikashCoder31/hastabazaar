import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

void test('packaged hosted-security operator runs without source, tsx or node_modules and refuses unsafe invocation', async () => {
  const build = await import('../scripts/build-hosted-security-cli.mjs').catch(() => null);
  assert.equal(typeof build?.buildHostedSecurityCli, 'function', 'The release needs its own bundled operator tool');
  const root = await mkdtemp(join(tmpdir(), 'hosted-operator-package-'));
  try {
    const application = join(root, 'application');
    await mkdir(application);
    await build!.buildHostedSecurityCli(application);
    assert.deepEqual(await readdir(application), ['hosted-security.mjs']);
    const env = { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR };
    const run = (args: string[], extra: Record<string, string | undefined> = {}) => spawnSync(process.execPath, ['hosted-security.mjs', ...args],
      { cwd: application, env: { ...env, ...extra, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 10_000 });
    const help = run(['--help']);
    assert.equal(help.status, 0, help.stderr);
    for (const action of ['--provision-new-host', '--recover-existing-host', '--check-readiness']) assert.ok(help.stdout.includes(action));
    assert.equal(run(['--provision-new-host']).status, 1);
    assert.equal(run(['--recover-existing-host']).status, 1);
    const readiness = run(['--check-readiness']);
    assert.equal(readiness.status, 2);
    assert.deepEqual(JSON.parse(readiness.stdout), { ready: false, phase: 'unavailable', reasonCodes: ['SECURITY_STATE_UNAVAILABLE'], enrolled: 0, pending: 0 });
    const suppliedSecret = 'SHOULD-NEVER-BE-PRINTED';
    const bad = run(['--provision-new-host', suppliedSecret]);
    assert.equal(bad.status, 1); assert.ok(!(bad.stdout + bad.stderr).includes(suppliedSecret));
    await mkdir(join(application, '.staging'));
    const guarded = run(['--provision-new-host'], { HASTABAZAAR_RUNTIME_ENV: 'production', APP_ORIGIN: 'https://fixture.example.test',
      HASTABAZAAR_SECURITY_KEY: Buffer.alloc(32, 73).toString('base64url'), HASTABAZAAR_SECURITY_POLICY_ROOT: join(root, 'policy') });
    assert.equal(guarded.status, 1);
    assert.deepEqual((await readdir(root)).sort(), ['application'], 'The local-checkout guard must not create policy or data');
  } finally { await rm(root, { recursive: true, force: true }); }
});
