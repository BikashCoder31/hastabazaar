import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type { SecurityPolicyAdapter } from './runtime-policy';

// Explicit test adapter for an independently owned extracted package. The ordinary
// checked preview and production never select this adapter.
export function commercePolicyRecord(environment: NodeJS.ProcessEnv) {
  assert.equal(environment.NODE_ENV, 'development');
  assert.equal(environment.HASTABAZAAR_RUNTIME_ENV, 'local_staging');
  assert.equal(environment.HASTABAZAAR_MAIL_MODE, 'capture');
  assert.equal(environment.HASTABAZAAR_PAYMENT_MODE, 'simulated');
  assert.equal(environment.HASTABAZAAR_RECIPIENT_DOMAIN, 'local.hastabazaar.test');
  const origin = new URL(environment.APP_ORIGIN!);
  assert.ok(origin.origin === environment.APP_ORIGIN && origin.protocol === 'http:' && origin.hostname === '127.0.0.1' && origin.port && origin.port !== '3018');
  assert.equal(environment.DB_HOST, '127.0.0.1');
  assert.equal(environment.DB_PORT, '13329');
  assert.match(environment.DB_NAME!, /^native_\d+_fresh$/);
  assert.match(environment.HASTABAZAAR_SECURITY_KEY!, /^[A-Za-z0-9_-]{43}$/);
  assert.match(environment.HASTABAZAAR_COMMERCE_ARCHIVE_SHA256!, /^[a-f0-9]{64}$/);
  assert.match(environment.HASTABAZAAR_COMMERCE_OWNER_TOKEN!, /^[a-f0-9]{48}$/);
  assert.match(environment.HASTABAZAAR_COMMERCE_CONTAINER_ID!, /^[a-f0-9]{64}$/);
  return { schema: 1, initialized: true, origin: origin.origin, database: environment.DB_NAME,
    archiveSha256: environment.HASTABAZAAR_COMMERCE_ARCHIVE_SHA256,
    containerId: environment.HASTABAZAAR_COMMERCE_CONTAINER_ID, ownerToken: environment.HASTABAZAAR_COMMERCE_OWNER_TOKEN };
}
export function signedCommercePolicy(environment: NodeJS.ProcessEnv) {
  const record = commercePolicyRecord(environment);
  return { ...record, mac: createHmac('sha256', Buffer.from(environment.HASTABAZAAR_SECURITY_KEY!, 'base64url'))
    .update(JSON.stringify(['isolated-commerce-policy', record])).digest('hex') };
}
export function assertCommercePolicyProof(environment: NodeJS.ProcessEnv, actual: Record<string, unknown>) {
  const expected = signedCommercePolicy(environment);
  assert.equal(Object.keys(actual).sort().join(','), Object.keys(expected).sort().join(','));
  assert.match(String(actual.mac), /^[a-f0-9]{64}$/);
  assert.ok(timingSafeEqual(Buffer.from(String(actual.mac), 'hex'), Buffer.from(expected.mac, 'hex')));
  assert.deepEqual(actual, expected);
}
export function assertNativeCommerceOwner(environment: NodeJS.ProcessEnv, marker: Record<string, unknown>, native: { database_name: string; hostname: string }) {
  commercePolicyRecord(environment);
  assert.equal(marker.token, environment.HASTABAZAAR_COMMERCE_OWNER_TOKEN);
  assert.equal(marker.id, environment.HASTABAZAAR_COMMERCE_CONTAINER_ID);
  assert.equal(marker.host, '127.0.0.1'); assert.equal(marker.port, 13329);
  assert.equal(marker.database, environment.DB_NAME); assert.equal(marker.password, environment.DB_PASSWORD);
  assert.equal(marker.name, 'hastabazaar-native-' + environment.DB_NAME!.slice(7, -6));
  assert.equal(native.database_name, marker.database);
  assert.match(native.hostname, /^[a-f0-9]{12,64}$/);
  assert.ok(String(marker.id).startsWith(native.hostname));
}
// Metadata is checked on the real path and again on opened file descriptors.
export function assertPrivateCommerceNode(stat: { uid: number; mode: number; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }, uid: number, directory: boolean) {
  assert.ok(!stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile()));
  assert.equal(stat.uid, uid, 'Commerce path must belong to the current user');
  assert.equal(stat.mode & 0o077, 0, 'Commerce path must be private');
}
async function privatePath(path: string, uid: number, directory: boolean) {
  assert.ok(isAbsolute(path) && resolve(path) === path);
  assert.equal(await realpath(path), path, 'Commerce path cannot contain links or aliases');
  assertPrivateCommerceNode(await lstat(path), uid, directory);
}
export function createIsolatedCommercePolicy(environment: NodeJS.ProcessEnv, database: D1Database): SecurityPolicyAdapter {
  const expected = signedCommercePolicy(environment);
  const path = environment.HASTABAZAAR_COMMERCE_POLICY_FILE!;
  assert.ok(isAbsolute(path) && resolve(path) === path);
  const read = async () => {
    assert.equal(typeof process.getuid, 'function', 'POSIX ownership is required');
    const uid = process.getuid!();
    const temporary = await realpath(tmpdir()), cwd = process.cwd(), epoch = dirname(cwd);
    assert.equal(dirname(epoch), temporary, 'Epoch must be a direct child of the temporary root');
    assert.match(basename(epoch), /^hastabazaar-native-commerce-[A-Za-z0-9]{6}$/);
    assert.equal(cwd, resolve(epoch, 'package'), 'Only the direct package child is admitted');
    await privatePath(epoch, uid, true);
    await privatePath(cwd, uid, true);
    assert.equal(path, resolve(epoch, 'commerce-policy.json'));
    await privatePath(path, uid, false);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      assertPrivateCommerceNode(stat, uid, false);
      assert.ok(stat.size < 2048);
      const actual = JSON.parse(await file.readFile('utf8'));
      assertCommercePolicyProof(environment, actual);
      const markerPath = environment.HASTABAZAAR_COMMERCE_NATIVE_MARKER!;
      assert.ok(isAbsolute(markerPath) && markerPath.includes(sep + '.superpowers' + sep + 'sdd' + sep + '2026-10-16-staging-native-compatibility' + sep));
      await privatePath(markerPath, uid, false);
      const markerFile = await open(markerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await markerFile.stat();
        assertPrivateCommerceNode(info, uid, false);
        assert.ok(info.size < 4096);
        const marker = JSON.parse(await markerFile.readFile('utf8'));
        const native = await database.prepare('SELECT DATABASE() AS database_name, @@hostname AS hostname').first<{ database_name: string; hostname: string }>();
        assert.ok(native); assertNativeCommerceOwner(environment, marker, native);
        assert.ok(markerPath.endsWith(sep + '.native-' + String(marker.name).slice(19) + '.json'));
        const proof = await database.prepare('SELECT value FROM marketplace_settings WHERE `key`=?')
          .bind('isolated-commerce-owner:' + expected.ownerToken).first<{ value: string }>();
        assert.ok(proof); assert.deepEqual(JSON.parse(proof.value), expected);
      } finally { await markerFile.close(); }
      return true;
    } finally { await file.close(); }
  };
  return { read, async mark() { await read(); } };
}
