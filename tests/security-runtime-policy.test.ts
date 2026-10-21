import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readSecurityInitialization, markSecurityInitialized, LOCAL_SECURITY_POLICY_PATH, LOCAL_SECURITY_POLICY_ORIGIN, securityPolicyRequestSignature } from '../lib/security/runtime-policy';
import { provisionLocalSecurityKey, readLocalSecurityPolicy, markLocalSecurityInitialized } from '../scripts/staging/security-key.mjs';
import { createLocalSecurityPolicyHandler } from '../lib/staging/security-policy-plugin';
import { SecurityStore } from '../lib/security/store';
import { securityKeyId } from '../lib/security/crypto';

const key = Buffer.alloc(32, 23).toString('base64url');
async function cleanup(root: string) {
  const resolved = await realpath(root);
  assert.equal(dirname(resolved).toLowerCase(), (await realpath(tmpdir())).toLowerCase());
  assert.equal(basename(resolved).startsWith('hasta-security-policy-'), true);
  await rm(resolved, { recursive: true, force: true });
}

void test('security initialization is monotonic and survives provider changes through its external key', async () => {
  let initialized = false;
  const bindings = { HASTABAZAAR_SECURITY_KEY: key, SECURITY_POLICY: { async read() { return initialized; }, async mark() { initialized = true; } } };
  assert.equal(await readSecurityInitialization(bindings), false);
  await markSecurityInitialized(bindings);
  assert.equal(initialized, true);
  initialized = false;
  assert.equal(await readSecurityInitialization(bindings), true);
  assert.equal(await readSecurityInitialization({ HASTABAZAAR_SECURITY_KEY: key, HASTABAZAAR_SECURITY_INITIALIZED: 'false' }), true);
  assert.equal(await readSecurityInitialization({ HASTABAZAAR_SECURITY_KEY: Buffer.alloc(32, 27).toString('base64url'), HASTABAZAAR_SECURITY_INITIALIZED: 'false' }), true);
});

void test('a keyless legacy runtime stays pending but malformed keys or policy adapters fail closed', async () => {
  assert.equal(await readSecurityInitialization({}), false);
  await assert.rejects(markSecurityInitialized({}));
  await assert.rejects(readSecurityInitialization({ HASTABAZAAR_SECURITY_KEY: 'wrong' }));
  await assert.rejects(readSecurityInitialization({ HASTABAZAAR_SECURITY_KEY: key, SECURITY_POLICY: 'false' } as never));
});

void test('local security policy requires authenticated loopback and never falls back to a pending environment flag', async () => {
  const anotherKey = Buffer.alloc(32, 24).toString('base64url');
  await assert.rejects(readSecurityInitialization({ HASTABAZAAR_SECURITY_KEY: anotherKey, HASTABAZAAR_RUNTIME_ENV: 'local_staging', APP_ORIGIN: 'https://remote.example', HASTABAZAAR_SECURITY_INITIALIZED: 'false' }));
  await assert.rejects(readSecurityInitialization({ HASTABAZAAR_SECURITY_KEY: anotherKey, HASTABAZAAR_RUNTIME_ENV: 'local_staging', APP_ORIGIN: 'http://localhost:9999' }));
});

void test('local key provisioning upgrades legacy metadata and never clears initialized state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hasta-security-policy-'));
  try {
    await mkdir(join(root, '.staging', 'security'), { recursive: true });
    const file = join(root, '.staging', 'security', 'key.json');
    await writeFile(file, JSON.stringify({ version: 1, key }), 'utf8');
    assert.equal(await provisionLocalSecurityKey(root, false), key);
    assert.equal((await readLocalSecurityPolicy(root, key)).initialized, false);
    await Promise.all([provisionLocalSecurityKey(root, false), markLocalSecurityInitialized(root, key), provisionLocalSecurityKey(root, false)]);
    assert.equal((await readLocalSecurityPolicy(root, key)).initialized, true);
    assert.equal(await provisionLocalSecurityKey(root, false), key);
    const record = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(record, { version: 1, key, initialized: true });
    await assert.rejects(readLocalSecurityPolicy(root, Buffer.alloc(32, 25).toString('base64url')));
  } finally { await cleanup(root); }
});

void test('existing encrypted records cannot silently provision a replacement missing key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hasta-security-policy-'));
  try {
    await mkdir(join(root, '.staging'));
    await assert.rejects(provisionLocalSecurityKey(root, true));
    const created = await provisionLocalSecurityKey(root, false);
    assert.equal((await readLocalSecurityPolicy(root, created)).initialized, false);
    await provisionLocalSecurityKey(root, true);
    assert.equal((await readLocalSecurityPolicy(root, created)).initialized, true);
  } finally { await cleanup(root); }
});

void test('strict external initialization rejects even a completely deleted private namespace', async () => {
  let batchCalled = false;
  const database = { prepare() { return { bind() { return this; }, async first() { return null; } }; }, async batch() { batchCalled = true; return []; } } as unknown as D1Database;
  assert.equal(await new SecurityStore(database, key).readManifest(), null);
  await assert.rejects(new SecurityStore(database, key, true).readManifest());
  await assert.rejects(new SecurityStore(database, key, true).initialize(['existing-admin'], 1));
  assert.equal(batchCalled, false);
});

void test('local service refuses forged, browser, replayed and oversized requests and returns metadata only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hasta-security-policy-'));
  const timestamp = 1_900_000_000_000;
  try {
    await mkdir(join(root, '.staging', 'security'), { recursive: true });
    await writeFile(join(root, '.staging', 'security', 'key.json'), JSON.stringify({ version: 1, key, initialized: false }));
    const handler = createLocalSecurityPolicyHandler({ projectRoot: root, key, origin: LOCAL_SECURITY_POLICY_ORIGIN, now: () => timestamp });
    async function call(action: 'read' | 'initialize', sequence: number, overrides: { headers?: Record<string, string>; body?: string; remote?: string } = {}) {
      const nonce = sequence.toString(16).padStart(32, '0');
      const body = overrides.body ?? JSON.stringify({ action, timestamp, nonce });
      const request = Object.assign(Readable.from([Buffer.from(body)]), { method: 'POST', url: LOCAL_SECURITY_POLICY_PATH, headers: { host: 'localhost:3018', 'content-type': 'application/json', 'x-hastabazaar-security-auth': securityPolicyRequestSignature(key, action, timestamp, nonce), ...overrides.headers }, socket: { remoteAddress: overrides.remote ?? '127.0.0.1' } }) as unknown as IncomingMessage;
      const headers: Record<string, string> = {}; let output = '';
      const response = { statusCode: 200, setHeader(name: string, value: string) { headers[name] = value; }, end(value: string) { output = value; } } as unknown as ServerResponse;
      await handler(request, response);
      return { status: response.statusCode, output, headers };
    }
    const first = await call('read', 1);
    assert.equal(first.status, 200); assert.deepEqual(JSON.parse(first.output), { initialized: false, keyId: securityKeyId(key) });
    assert.equal(first.output.includes(key), false); assert.match(first.headers['cache-control'], /no-store/);
    assert.equal((await call('read', 1)).status, 403);
    assert.equal((await call('initialize', 2, { headers: { origin: LOCAL_SECURITY_POLICY_ORIGIN } })).status, 403);
    assert.equal((await call('initialize', 3, { headers: { 'sec-fetch-site': 'same-origin' } })).status, 403);
    assert.equal((await call('initialize', 4, { headers: { host: 'attacker.example' } })).status, 403);
    assert.equal((await call('initialize', 5, { headers: { 'x-hastabazaar-security-auth': '0'.repeat(64) } })).status, 403);
    assert.equal((await call('initialize', 6, { remote: '203.0.113.1' })).status, 403);
    assert.equal((await call('initialize', 7, { body: 'x'.repeat(1_025) })).status, 403);
    const activated = await call('initialize', 8);
    assert.equal(activated.status, 200); assert.equal(JSON.parse(activated.output).initialized, true);
    assert.equal(JSON.parse((await call('read', 9)).output).initialized, true);
  } finally { await cleanup(root); }
});

void test('the local runtime sends server-only signed policy requests and latches successful activation', async () => {
  const localKey = Buffer.alloc(32, 26).toString('base64url');
  const fetchBefore = globalThis.fetch;
  let initialized = false; let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input, `${LOCAL_SECURITY_POLICY_ORIGIN}${LOCAL_SECURITY_POLICY_PATH}`);
    assert.equal(init?.method, 'POST'); assert.equal(init?.redirect, 'manual');
    const payload = JSON.parse(init?.body as string);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('origin'), null);
    assert.equal(headers.get('x-hastabazaar-security-auth'), securityPolicyRequestSignature(localKey, payload.action, payload.timestamp, payload.nonce));
    if (payload.action === 'initialize') initialized = true;
    return Response.json({ initialized, keyId: securityKeyId(localKey) });
  };
  try {
    const bindings = { HASTABAZAAR_SECURITY_KEY: localKey, HASTABAZAAR_RUNTIME_ENV: 'local_staging', APP_ORIGIN: LOCAL_SECURITY_POLICY_ORIGIN };
    assert.equal(await readSecurityInitialization(bindings), false);
    await markSecurityInitialized(bindings); assert.equal(calls, 2);
    initialized = false; assert.equal(await readSecurityInitialization(bindings), true); assert.equal(calls, 2);
  } finally { globalThis.fetch = fetchBefore; }
});

void test('unavailable local policy cannot become a pending fallback through an environment string', async () => {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Fixture policy unavailable'); };
  try {
    await assert.rejects(readSecurityInitialization({ HASTABAZAAR_SECURITY_KEY: Buffer.alloc(32, 28).toString('base64url'), HASTABAZAAR_RUNTIME_ENV: 'local_staging', APP_ORIGIN: LOCAL_SECURITY_POLICY_ORIGIN, HASTABAZAAR_SECURITY_INITIALIZED: 'false' }));
  } finally { globalThis.fetch = fetchBefore; }
});
