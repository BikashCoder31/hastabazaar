import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'http://127.0.0.1:43871';
const runtimeEnv = { ...process.env, HOST: '127.0.0.1', PORT: '43871', NODE_ENV: 'production' };
delete runtimeEnv.APP_ORIGIN; // Verify the actual Passenger startup default.
const child = spawn(process.execPath, ['app.cjs'], {
  cwd: fileURLToPath(new URL('../dist/standalone/', import.meta.url)),
  env: runtimeEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (value) => { output += value.toString(); });
child.stderr.on('data', (value) => { output += value.toString(); });
child.on('error', (error) => { output += error.message; });

try {
  for (let attempt = 0; attempt < 100 && !output.includes(`running at ${origin}`); attempt++) {
    if (child.exitCode !== null) throw new Error(`Standalone server failed: ${output}`);
    await delay(200);
  }
  assert.ok(output.includes(`running at ${origin}`), `Standalone server must start before requests: ${output}`);
  const login = await fetch(`${origin}/login`);
  assert.equal(login.status, 200);
  const loginHtml = await login.text();
  assert.doesNotMatch(loginHtml, /signin-with-chatgpt|Sign in with ChatGPT/i);
  assert.match(loginHtml, /Continue with Google/);
  const googleUnavailable = await fetch(`${origin}/api/auth/google`, { redirect: 'manual' });
  assert.equal(googleUnavailable.status, 303);
  assert.match(googleUnavailable.headers.get('location') ?? '', /^\/login\?error=google_unavailable/);

  for (const route of ['register', 'login']) {
    // Empty fields stop at validation: no accounts, sessions, or database writes.
    const response = await fetch(`${origin}/api/auth/${route}`, {
      method: 'POST', redirect: 'manual', body: new URLSearchParams(),
      headers: { Origin: 'https://hastabazaar.com', 'Sec-Fetch-Site': 'same-origin' },
    });
    assert.equal(response.status, 303, `${route}: legitimate HTTPS form must reach validation`);
    assert.match(response.headers.get('location'), new RegExp(`^/${route}\\?`));
    const blocked = await fetch(`${origin}/api/auth/${route}`, {
      method: 'POST', redirect: 'manual', body: new URLSearchParams(),
      headers: { Origin: 'https://attacker.example', 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'https' },
    });
    assert.equal(blocked.status, 403, `${route}: spoofed forwarded headers must not bypass protection`);
  }
  console.log('Standalone login and Google entry point render; HTTPS registration/login pass the proxy check; untrusted origins remain blocked. No database writes performed.');
} finally {
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
}
