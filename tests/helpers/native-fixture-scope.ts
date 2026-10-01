import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Two explicitly owned loopback fixtures; never a general connection override.
export async function assertNativeFixtureScope() {
  assert.equal(resolve(process.cwd()), resolve(fileURLToPath(new URL('../../', import.meta.url))), 'Native fixture tests must run from their own checkout');
  assert.equal(process.env.DB_HOST, '127.0.0.1');
  assert.equal(process.env.HASTABAZAAR_RUNTIME_ENV, 'local_staging');
  if (process.env.HATSKALA_MARIADB_RELEASE === '1') {
    assert.equal(process.env.DB_PORT, '13328');
    assert.match(process.env.DB_NAME ?? '', /^release_\d+_fresh$/);
    assert.equal(process.env.DB_USER, 'root');
    const privateState = JSON.parse(await readFile(new URL('../../.superpowers/sdd/2026-09-30-local-audit-remediation-roadmap/.env.mariadb-release-private.json', import.meta.url), 'utf8'));
    assert.equal(privateState.name, 'hastabazaar-release-readiness-20261001');
    assert.equal(privateState.port, 13328);
    assert.ok(process.env.DB_PASSWORD === privateState.password, 'Dedicated fictional fixture credentials must match');
    const context = JSON.parse(execFileSync('docker', ['context', 'inspect'], {encoding: 'utf8'}))[0];
    assert.match(context.Endpoints.docker.Host, /^(npipe|unix):\/\//);
    const container = JSON.parse(execFileSync('docker', ['inspect', privateState.name], {encoding: 'utf8'}))[0];
    assert.equal(container.Id, privateState.id);
    assert.equal(container.State.Running, true);
    assert.equal(container.Config.Image, 'mariadb:10.11');
    assert.equal(container.Config.Labels['codex.task'], 'local-audit-remediation');
    assert.equal(container.Config.Labels['codex.scope'], 'mariadb-release-readiness');
    assert.deepEqual(container.HostConfig.PortBindings['3306/tcp'], [{HostIp: '127.0.0.1', HostPort: '13328'}]);
  } else {
    assert.equal(process.env.DB_PORT, '13327');
    assert.equal(process.env.DB_NAME, 'hastabazaar_audit');
    assert.equal(process.env.DB_USER, 'audit_fixture');
  }
  return {host: '127.0.0.1', port: Number(process.env.DB_PORT), database: process.env.DB_NAME!, user: process.env.DB_USER!, password: process.env.DB_PASSWORD};
}
