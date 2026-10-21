import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, unlink, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as implementation from '../lib/security/hosted-policy';
import { readSecurityInitialization, markSecurityInitialized } from '../lib/security/runtime-policy';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';
import { securityDatabase } from './helpers/security-database';

type Configuration = { HASTABAZAAR_RUNTIME_ENV: string; APP_ORIGIN: string; HASTABAZAAR_SECURITY_KEY: string; HASTABAZAAR_SECURITY_POLICY_ROOT: string };
type Fixture = ReturnType<typeof securityDatabase> & { config: Configuration; temporary: string; bindings(): Configuration & { SECURITY_POLICY: ReturnType<typeof implementation.createHostedSecurityPolicy> } };
async function fixture(run: (f: Fixture) => Promise<void>) {
  const temporary = await mkdtemp(join(tmpdir(), 'hosted-security-test-'));
  const database = securityDatabase();
  database.sqlite.exec("INSERT INTO users VALUES('owner','owner','owner@example.test','Owner','active',0); INSERT INTO user_roles VALUES('owner','super_admin')");
  const config = { HASTABAZAAR_RUNTIME_ENV: 'production', APP_ORIGIN: 'https://fixture.example.test',
    HASTABAZAAR_SECURITY_KEY: Buffer.alloc(32, 61).toString('base64url'), HASTABAZAAR_SECURITY_POLICY_ROOT: join(temporary, 'policy') };
  try { await run({ ...database, config, temporary, bindings: () => ({ ...config, SECURITY_POLICY: implementation.createHostedSecurityPolicy(config) }) }); }
  finally { database.dispose(); await rm(temporary, { recursive: true, force: true }); }
}

void test('explicit hosted provisioning permits first enrollment and restart recovery without downgrading policy', async () => fixture(async f => {
  await implementation.provisionHostedSecurityPolicy(f.config, f.db);
  let bindings = f.bindings();
  assert.equal(await readSecurityInitialization(bindings), false);
  assert.equal((await implementation.inspectHostedSecurityReadiness(bindings, f.db)).ready, false);
  const store = new SecurityStore(f.db, f.config.HASTABAZAAR_SECURITY_KEY, await readSecurityInitialization(bindings));
  await store.initialize(['owner'], 60_000);
  const service = new MfaService(store), sessionHash = 'a'.repeat(64);
  const setup = await service.beginSetup({ userId: 'owner', sessionHash, now: 60_000 });
  const confirmation = await service.confirmSetup({ userId: 'owner', sessionHash, setupId: setup.setupId, code: totpAtCounter(setup.secret, 2), now: 60_000 });
  await Promise.all([markSecurityInitialized(bindings), markSecurityInitialized(f.bindings())]);
  await service.activateSetup({ userId: 'owner', sessionHash, setupId: setup.setupId, recoverySaved: true, passwordVerifiedAt: 60_000, now: 60_000 });
  bindings = f.bindings();
  assert.equal(await readSecurityInitialization(bindings), true);
  assert.deepEqual(await implementation.inspectHostedSecurityReadiness(bindings, f.db), { ready: true, phase: 'initialized', reasonCodes: [], enrolled: 1, pending: 0 });
  const restarted = new MfaService(new SecurityStore(f.db, f.config.HASTABAZAAR_SECURITY_KEY, await readSecurityInitialization(bindings)));
  await restarted.verifyRecovery({ userId: 'owner', sessionHash: 'b'.repeat(64), code: confirmation.codes[0], passwordVerifiedAt: 61_000, now: 61_000 });
  await assert.rejects(restarted.verifyRecovery({ userId: 'owner', sessionHash: 'c'.repeat(64), code: confirmation.codes[0], passwordVerifiedAt: 61_000, now: 61_000 }));
  await assert.rejects(implementation.provisionHostedSecurityPolicy(f.config, f.db));
  f.sqlite.exec("DELETE FROM marketplace_settings WHERE key='auth-private:manifest:v1'");
  assert.equal((await implementation.inspectHostedSecurityReadiness(f.bindings(), f.db)).ready, false);
  await assert.rejects(new SecurityStore(f.db, f.config.HASTABAZAAR_SECURITY_KEY, await readSecurityInitialization(f.bindings())).initialize(['owner']));
}));

void test('host policy never falls back for missing, tampered, wrong-key or wrong-origin state even after a successful read', async () => fixture(async f => {
  await assert.rejects(readSecurityInitialization(f.bindings()));
  await implementation.provisionHostedSecurityPolicy(f.config, f.db);
  await markSecurityInitialized(f.bindings());
  const bindings = f.bindings();
  assert.equal(await readSecurityInitialization(bindings), true);
  const path = join(f.config.HASTABAZAAR_SECURITY_POLICY_ROOT, 'policy.json');
  const saved = await readFile(path, 'utf8');
  await writeFile(path, '{}');
  await assert.rejects(readSecurityInitialization(bindings));
  await writeFile(path, saved);
  await assert.rejects(implementation.createHostedSecurityPolicy({ ...f.config, APP_ORIGIN: 'https://other.example.test' }).read());
  await assert.rejects(implementation.createHostedSecurityPolicy({ ...f.config, HASTABAZAAR_SECURITY_KEY: Buffer.alloc(32, 62).toString('base64url') }).read());
  await unlink(path);
  await assert.rejects(readSecurityInitialization(f.bindings()));
  await assert.rejects(implementation.provisionHostedSecurityPolicy(f.config, f.db));
  await assert.rejects(readSecurityInitialization({ HASTABAZAAR_RUNTIME_ENV: 'production' }));
}));

void test('provisioning refuses orphaned private DB records and release readiness rejects unenrolled or unregistered active staff', async () => fixture(async f => {
  f.sqlite.exec("INSERT INTO marketplace_settings VALUES('auth-private:orphan','broken',NULL,0)");
  await assert.rejects(implementation.provisionHostedSecurityPolicy(f.config, f.db));
  f.sqlite.exec('DELETE FROM marketplace_settings');
  await implementation.provisionHostedSecurityPolicy(f.config, f.db);
  const store = new SecurityStore(f.db, f.config.HASTABAZAAR_SECURITY_KEY);
  await store.initialize(['owner']);
  await markSecurityInitialized(f.bindings());
  const pending = await implementation.inspectHostedSecurityReadiness(f.bindings(), f.db);
  assert.equal(pending.ready, false); assert.equal(pending.pending, 1);
  f.sqlite.exec("INSERT INTO users VALUES('new','new','new@example.test','New','active',0); INSERT INTO user_roles VALUES('new','admin')");
  const unknown = await implementation.inspectHostedSecurityReadiness(f.bindings(), f.db);
  assert.equal(unknown.ready, false); assert.ok(unknown.reasonCodes.includes('SECURITY_STAFF_UNREGISTERED'));
}));

void test('durable initialized marker rejects deletion and prevents a restored pending policy from resetting MFA', async () => fixture(async f => {
  await implementation.provisionHostedSecurityPolicy(f.config, f.db);
  const path = join(f.config.HASTABAZAAR_SECURITY_POLICY_ROOT, 'policy.json');
  const pending = await readFile(path);
  await markSecurityInitialized(f.bindings());
  // Model restoring just an old policy file, preserving the separate monotonic marker.
  await unlink(path); await writeFile(path, pending, { mode: 0o600 });
  assert.equal(await readSecurityInitialization(f.bindings()), true);
  await markSecurityInitialized(f.bindings());
  await unlink(join(f.config.HASTABAZAAR_SECURITY_POLICY_ROOT, 'initialized.json'));
  await assert.rejects(readSecurityInitialization(f.bindings()));
}));

void test('oversized or linked policy files and local or application-owned roots fail closed', async () => fixture(async f => {
  await implementation.provisionHostedSecurityPolicy(f.config, f.db);
  const path = join(f.config.HASTABAZAAR_SECURITY_POLICY_ROOT, 'policy.json');
  const saved = await readFile(path);
  await writeFile(path, 'x'.repeat(1025));
  await assert.rejects(readSecurityInitialization(f.bindings()));
  await unlink(path);
  const target = join(f.temporary, 'external-policy.json'); await writeFile(target, saved, { mode: 0o600 });
  if (process.platform === 'win32') {
    // Windows file symlinks need an OS privilege; directory junctions still exercise real link rejection.
    const linkedRoot = join(f.temporary, 'linked-policy');
    await symlink(f.config.HASTABAZAAR_SECURITY_POLICY_ROOT, linkedRoot, 'junction');
    await assert.rejects(implementation.createHostedSecurityPolicy({ ...f.config, HASTABAZAAR_SECURITY_POLICY_ROOT: linkedRoot }).read());
  } else {
    await symlink(target, path, 'file');
    await assert.rejects(readSecurityInitialization(f.bindings()));
  }
  for (const config of [{ ...f.config, HASTABAZAAR_RUNTIME_ENV: 'local_staging' },
    { ...f.config, HASTABAZAAR_SECURITY_POLICY_ROOT: join(process.cwd(), '.staging', 'security') },
    { ...f.config, HASTABAZAAR_SECURITY_KEY: undefined },
    { ...f.config, MEDIA_ROOT: f.temporary }]) {
    assert.throws(() => implementation.createHostedSecurityPolicy(config));
  }
}));

void test('explicit recovered-host policy requires matching intact protected state and can never provision it pending', async () => fixture(async f => {
  assert.equal(typeof implementation.recoverHostedSecurityPolicy,'function');
  await assert.rejects(implementation.recoverHostedSecurityPolicy(f.config,f.db));
  const store=new SecurityStore(f.db,f.config.HASTABAZAAR_SECURITY_KEY);
  await store.initialize(['owner'],60_000);
  await assert.rejects(implementation.recoverHostedSecurityPolicy({...f.config,HASTABAZAAR_SECURITY_KEY:Buffer.alloc(32,99).toString('base64url')},f.db));
  await implementation.recoverHostedSecurityPolicy(f.config,f.db);
  assert.equal(await readSecurityInitialization(f.bindings()),true);
  assert.equal((await implementation.inspectHostedSecurityReadiness(f.bindings(),f.db)).ready,false,'Recovery does not bypass outstanding enrollment');
  await assert.rejects(implementation.recoverHostedSecurityPolicy(f.config,f.db));
  f.sqlite.exec("DELETE FROM marketplace_settings WHERE key='auth-private:manifest:v1'");
  await assert.rejects(implementation.recoverHostedSecurityPolicy({...f.config,HASTABAZAAR_SECURITY_POLICY_ROOT:join(f.temporary,'second-policy')},f.db));
}));
