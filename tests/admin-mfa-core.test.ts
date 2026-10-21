import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodeBase32, encodeBase32, encryptSecurityValue, decryptSecurityValue,
  securityKeyId, totpAtCounter, verifyTotp, recoveryCodeHash, generateRecoveryCodes,
} from '../lib/security/crypto';
import { privilegedSessionExpired, validateAccount } from '../lib/security/model';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';

const key = Buffer.alloc(32, 7).toString('base64url');
void test('MFA crypto binds encrypted records to the account, row and external key', () => {
  const raw = encryptSecurityValue(key, 'auth-private:account:a', 'a', { value: 'private secret' });
  assert.equal(raw.includes('private secret'), false);
  assert.deepEqual(decryptSecurityValue(key, 'auth-private:account:a', 'a', raw), { value: 'private secret' });
  assert.throws(() => decryptSecurityValue(key, 'auth-private:account:b', 'a', raw));
  assert.throws(() => decryptSecurityValue(key, 'auth-private:account:a', 'b', raw));
  assert.throws(() => decryptSecurityValue(Buffer.alloc(32, 8).toString('base64url'), 'auth-private:account:a', 'a', raw));
  const modified = JSON.parse(raw); modified.c = `${modified.c[0] === 'A' ? 'B' : 'A'}${modified.c.slice(1)}`;
  assert.throws(() => decryptSecurityValue(key, 'auth-private:account:a', 'a', JSON.stringify(modified)));
  assert.throws(() => encryptSecurityValue('', 'x', 'a', {}));
  assert.equal(securityKeyId(key), securityKeyId(key));
  assert.notEqual(encryptSecurityValue(key, 'x', 'a', {}), encryptSecurityValue(key, 'x', 'a', {}));
});

void test('TOTP uses standard six-digit SHA1 vectors and bounded non-replay counters', () => {
  const secret = encodeBase32(Buffer.from('12345678901234567890'));
  assert.equal(decodeBase32(secret).toString(), '12345678901234567890');
  assert.equal(totpAtCounter(secret, 1), '287082');
  assert.equal(totpAtCounter(secret, 37_037_036), '081804');
  assert.equal(verifyTotp(secret, '287082', 59_000, null), 1);
  assert.equal(verifyTotp(secret, '287082', 59_000, 1), null);
  assert.equal(verifyTotp(secret, '287082', 119_000, null), null);
  assert.equal(verifyTotp(secret, '287082x', 59_000, null), null);
  assert.throws(() => decodeBase32('invalid!'));
});

void test('recovery codes have at least 128 bits, are account/set bound and store hashes only', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10); assert.equal(new Set(codes).size, 10);
  for (const code of codes) assert.match(code, /^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/);
  const hash = recoveryCodeHash('account-a', 'set-1', codes[0]);
  assert.equal(hash.length, 64); assert.equal(hash.includes(codes[0]), false);
  assert.equal(hash, recoveryCodeHash('account-a', 'set-1', codes[0].toLowerCase()));
  assert.notEqual(hash, recoveryCodeHash('account-b', 'set-1', codes[0]));
  assert.notEqual(hash, recoveryCodeHash('account-a', 'set-2', codes[0]));
});

void test('privileged session expiry is absolute and idle, including exact boundaries', () => {
  const start = 1_000_000;
  assert.equal(privilegedSessionExpired(start, start, start + 29 * 60_000), false);
  assert.equal(privilegedSessionExpired(start, start, start + 30 * 60_000), true);
  assert.equal(privilegedSessionExpired(start, start + 7 * 3_600_000, start + 8 * 3_600_000), true);
  assert.equal(privilegedSessionExpired(start, start + 60_000, start - 1), true);
  assert.throws(() => validateAccount({ schema: 1, kind: 'account', userId: 'a', status: 'active' }, 'a'));
});

const databaseTest = test;
async function fixture() { return (await import('./helpers/security-fixture')).securityFixture(); }
const sessionA = 'a'.repeat(64); const sessionB = 'b'.repeat(64);
const now = 1_900_000_000_000;

void databaseTest('initialized security cannot downgrade when an expected record, manifest or key disappears', async () => {
  const f = await fixture();
  try {
    const store = new SecurityStore(f.database, key);
    assert.equal(await store.readAccount('a'), null);
    await store.initialize(['a', 'b'], now);
    assert.equal((await store.readAccount('a'))!.value.status, 'pending');
    await assert.rejects(new SecurityStore(f.database, Buffer.alloc(32, 8).toString('base64url')).readAccount('a'));
    f.sqlite.prepare('DELETE FROM marketplace_settings WHERE "key"=?').run('auth-private:account:a');
    await assert.rejects(store.readAccount('a'));
    f.sqlite.prepare('DELETE FROM marketplace_settings WHERE "key"=?').run('auth-private:manifest:v1');
    await assert.rejects(store.readManifest());
  } finally { f.close(); }
});

void databaseTest('setup is session-bound, code-confirmed and activated only after recovery acknowledgement', async () => {
  const f = await fixture();
  try {
    const store = new SecurityStore(f.database, key); await store.initialize(['a'], now);
    const mfa = new MfaService(store);
    const setup = await mfa.beginSetup({ userId: 'a', sessionHash: sessionA, now });
    await assert.rejects(mfa.confirmSetup({ userId: 'a', sessionHash: sessionB, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor(now / 30_000)), now }));
    const confirmed = await mfa.confirmSetup({ userId: 'a', sessionHash: sessionA, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor(now / 30_000)), now });
    assert.equal((await store.readAccount('a'))!.value.status, 'pending');
    await assert.rejects(mfa.confirmSetup({ userId: 'a', sessionHash: sessionA, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor(now / 30_000)), now }));
    assert.equal(confirmed.codes.length, 10);
    assert.equal(JSON.stringify((await store.readAccount('a'))!.value).includes(confirmed.codes[0]), false);
    await assert.rejects(mfa.activateSetup({ userId: 'a', sessionHash: sessionA, setupId: setup.setupId, recoverySaved: false, passwordVerifiedAt: now, now }));
    const proof = await mfa.activateSetup({ userId: 'a', sessionHash: sessionA, targetSessionHash: sessionB, setupId: setup.setupId, recoverySaved: true, passwordVerifiedAt: now, now });
    assert.equal(proof.sessionHash, sessionB); assert.equal((await store.readAccount('a'))!.value.status, 'active');
    assert.equal(await store.readProof(sessionA, 'a'), null); assert.equal((await store.readProof(sessionB, 'a'))!.value.generation, proof.generation);
    await assert.rejects(mfa.verifyTotp({ userId: 'a', sessionHash: sessionB, code: totpAtCounter(setup.secret, Math.floor(now / 30_000)), passwordVerifiedAt: now, now }));
  } finally { f.close(); }
});

void databaseTest('recovery and TOTP claims are atomic and linked session failures roll back consumption', async () => {
  const f = await fixture();
  try {
    const store = new SecurityStore(f.database, key); await store.initialize(['a'], now);
    const mfa = new MfaService(store); const setup = await mfa.beginSetup({ userId: 'a', sessionHash: sessionA, now });
    const confirmed = await mfa.confirmSetup({ userId: 'a', sessionHash: sessionA, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor(now / 30_000)), now });
    await mfa.activateSetup({ userId: 'a', sessionHash: sessionA, setupId: setup.setupId, recoverySaved: true, passwordVerifiedAt: now, now });
    const before = (await store.readAccount('a'))!.raw;
    await assert.rejects(mfa.verifyRecovery({ userId: 'a', sessionHash: sessionB, code: confirmed.codes[0], passwordVerifiedAt: now, now,
      linkedStatements: [f.database.prepare("INSERT INTO fixture_events(id) VALUES ('duplicate')"), f.database.prepare("INSERT INTO fixture_events(id) VALUES ('duplicate')")] }));
    assert.equal((await store.readAccount('a'))!.raw, before); assert.equal(await store.readProof(sessionB, 'a'), null);
    const outcomes = await Promise.allSettled([1, 2].map(() => mfa.verifyRecovery({ userId: 'a', sessionHash: sessionB, code: confirmed.codes[0], passwordVerifiedAt: now, now })));
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.match(String(outcomes.find(result => result.status === 'rejected')?.reason), /CHECK constraint/);
    assert.equal((await store.readAccount('a'))!.value.recovery!.hashes.length, 9);
    await assert.rejects(mfa.verifyRecovery({ userId: 'a', sessionHash: sessionB, code: confirmed.codes[0], passwordVerifiedAt: now, now }));
    const later = now + 30_000;
    const outcomes2 = await Promise.allSettled([1, 2].map(() => mfa.verifyTotp({ userId: 'a', sessionHash: sessionB, code: totpAtCounter(setup.secret, Math.floor(later / 30_000)), passwordVerifiedAt: later, now: later })));
    assert.equal(outcomes2.filter(result => result.status === 'fulfilled').length, 1);
    assert.match(String(outcomes2.find(result => result.status === 'rejected')?.reason), /CHECK constraint/);
  } finally { f.close(); }
});

void databaseTest('stale byte-exact CAS aborts all linked writes and expired setup cannot activate', async () => {
  const f = await fixture();
  try {
    const store = new SecurityStore(f.database, key); await store.initialize(['a'], now);
    const first = (await store.readAccount('a'))!; const stale = (await store.readAccount('a'))!;
    await store.checkedBatch(store.accountCas(first, { ...first.value, updatedAt: now + 1 }, now + 1));
    await assert.rejects(store.checkedBatch([f.database.prepare("INSERT INTO fixture_events(id) VALUES ('must rollback')"), ...store.accountCas(stale, { ...stale.value, updatedAt: now + 2 }, now + 2)]));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM fixture_events').get()!.n, 0);
    const mfa = new MfaService(store); const setup = await mfa.beginSetup({ userId: 'a', sessionHash: sessionA, now: now + 2 });
    await assert.rejects(mfa.confirmSetup({ userId: 'a', sessionHash: sessionA, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor((now + 600_002) / 30_000)), now: now + 600_002 }));
  } finally { f.close(); }
});

void databaseTest('active-factor replacement requires fresh assurance and recovery regeneration invalidates the previous set', async () => {
  const f = await fixture();
  try {
    const store = new SecurityStore(f.database, key); await store.initialize(['a'], now);
    const mfa = new MfaService(store); const setup = await mfa.beginSetup({ userId: 'a', sessionHash: sessionA, now });
    const first = await mfa.confirmSetup({ userId: 'a', sessionHash: sessionA, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor(now / 30_000)), now });
    await mfa.activateSetup({ userId: 'a', sessionHash: sessionA, setupId: setup.setupId, recoverySaved: true, passwordVerifiedAt: now, now });
    await assert.rejects(mfa.beginSetup({ userId: 'a', sessionHash: sessionB, now }));
    await assert.rejects(mfa.beginSetup({ userId: 'a', sessionHash: sessionA, now: now + 300_001 }));
    const regenerated = await mfa.rotateRecovery({ userId: 'a', sessionHash: sessionA, passwordVerifiedAt: now + 1_000, now: now + 1_000 });
    assert.equal(regenerated.remaining, 10);
    await assert.rejects(mfa.verifyRecovery({ userId: 'a', sessionHash: sessionA, code: first.codes[0], passwordVerifiedAt: now, now: now + 1_000 }));
    await mfa.verifyRecovery({ userId: 'a', sessionHash: sessionA, code: regenerated.codes[0], passwordVerifiedAt: now, now: now + 1_000 });
  } finally { f.close(); }
});
