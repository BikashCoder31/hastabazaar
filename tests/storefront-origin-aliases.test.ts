import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isTrustedMutationRequest } from '../lib/http/request-security';

const canonical = 'https://hastabazaar.com';
const alias = 'https://www.hastabazaar.com';
function mutation(origin: string, extra: Record<string, string> = {}) {
  return new Request('http://127.0.0.1:3000/api/cart', {
    method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin', ...extra },
  });
}

void test('the explicit www alias accepts ordinary browser cart mutations behind TLS termination', () => {
  assert.equal(isTrustedMutationRequest(mutation(alias), canonical, alias), true);
  assert.equal(isTrustedMutationRequest(mutation(canonical), canonical, alias), true);
});

void test('an alias is opt-in and cannot admit arbitrary origins, schemes or ports', () => {
  assert.equal(isTrustedMutationRequest(mutation(alias), canonical, ''), false);
  for (const origin of ['https://attacker.example', 'http://www.hastabazaar.com',
    'https://www.hastabazaar.com:444', 'https://www.hastabazaar.com.attacker.example',
    'https://other.hastabazaar.com', 'null']) {
    assert.equal(isTrustedMutationRequest(mutation(origin), canonical, alias), false, origin);
  }
});

void test('aliases do not weaken fetch metadata protection or trust forwarded headers', () => {
  assert.equal(isTrustedMutationRequest(mutation(alias, { 'sec-fetch-site': 'cross-site' }), canonical, alias), false);
  assert.equal(isTrustedMutationRequest(mutation('https://attacker.example', {
    'x-forwarded-host': 'www.hastabazaar.com', 'x-forwarded-proto': 'https',
  }), canonical, alias), false);
});

void test('malformed or wildcard alias configuration fails closed', () => {
  for (const value of ['*', 'https://*.hastabazaar.com', 'https://www.hastabazaar.com/path',
    'https://user@www.hastabazaar.com', `${alias},https://attacker.example/path`, `${alias},`]) {
    assert.equal(isTrustedMutationRequest(mutation(alias), canonical, value), false, value);
  }
});

void test('the hosting entry point enables only the known production alias and respects staging configuration', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'hastabazaar-origins-'));
  try {
    writeFileSync(join(fixture, 'app.cjs'), readFileSync(new URL('../deployment/babal/app.cjs', import.meta.url)));
    writeFileSync(join(fixture, 'server.js'), 'console.log(JSON.stringify({origin:process.env.APP_ORIGIN,aliases:process.env.APP_ALLOWED_ORIGINS}));');
    const inherited = { ...process.env };
    delete inherited.APP_ORIGIN;
    delete inherited.APP_ALLOWED_ORIGINS;
    for (const [overrides, expected] of [
      [{}, { origin: canonical, aliases: alias }],
      [{ APP_ORIGIN: `${canonical}/` }, { origin: `${canonical}/`, aliases: alias }],
      [{ APP_ORIGIN: 'https://HASTABAZAAR.COM' }, { origin: 'https://HASTABAZAAR.COM', aliases: alias }],
      [{ APP_ORIGIN: 'https://staging.hastabazaar.com' }, { origin: 'https://staging.hastabazaar.com', aliases: '' }],
      [{ APP_ORIGIN: `${canonical}/path` }, { origin: `${canonical}/path`, aliases: '' }],
      [{ APP_ORIGIN: 'https://user@hastabazaar.com' }, { origin: 'https://user@hastabazaar.com', aliases: '' }],
      [{ APP_ORIGIN: canonical, APP_ALLOWED_ORIGINS: '' }, { origin: canonical, aliases: '' }],
    ] as const) {
      const result = spawnSync(process.execPath, [join(fixture, 'app.cjs')], { env: { ...inherited, ...overrides }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout.trim()), expected);
    }
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
