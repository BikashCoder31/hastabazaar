import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function smokeStandalone(root, release) {
  const operator = spawnSync(process.execPath, ['hosted-security.mjs', '--help'], {
    cwd: root, env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR },
    encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(operator.status, 0, 'Packaged hosted-security operator must run without source or a TypeScript loader.');
  assert.ok(operator.stdout.includes('--provision-new-host') && operator.stdout.includes('--recover-existing-host') && operator.stdout.includes('--check-readiness'));
  const require = createRequire(resolve(root, 'package.json'));
  const dependency = require.resolve('sharp');
  assert.ok(dependency.startsWith(resolve(root) + sep), 'Sharp dependency must come from the extracted package.');
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).png().toBuffer();
  assert.ok(png.length > 0, 'Packaged native Sharp must render an image.');
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((done, reject) => listener.close((error) => error ? reject(error) : done()));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['app.cjs'], {
    cwd: root,
    // Never inherit database, mail, payment, auth, or deployment credentials.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, SYSTEMROOT: process.env.SYSTEMROOT,
      TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR,
      HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'production', APP_ORIGIN: origin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-32_000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-32_000); });
  let startupError;
  child.on('error', (error) => { startupError = error; });
  try {
    const deadline = Date.now() + 30_000;
    let live = false;
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`Extracted server failed to start: ${output}`);
      try {
        const response = await fetch(`${origin}/health/live`, { signal: AbortSignal.timeout(1_000) });
        if (response.status === 200 && (await response.json()).status === 'ok') { live = true; break; }
      } catch { /* Wait for the owned process to bind its loopback port. */ }
      await delay(200);
    }
    assert.ok(live, `Extracted server liveness failed: ${output}`);
    const health = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(5_000) });
    const identity = await health.json();
    assert.equal(identity.release, release, 'Compiled release identity must match the artifact.');
    assert.equal(health.status, 503, 'Missing database configuration must fail closed.');
    assert.equal(identity.marketplaceReady, false);
    return { sharp: sharp.versions.sharp, vips: sharp.versions.vips, release, liveness: true, hostedSecurityOperator: true, databaseUntouched: true };
  } finally {
    if (child.exitCode === null && child.pid) {
      const exited = once(child, 'exit');
      child.kill();
      const stopped = await Promise.race([exited.then(() => true), delay(5_000).then(() => false)]);
      if (!stopped) { child.kill('SIGKILL'); await exited; }
    }
  }
}
