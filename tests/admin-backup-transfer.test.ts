import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';
import { decryptPortableFrames } from '../lib/portability/crypto';

const runtime = {
  db: null as D1Database | null,
  key: '',
  bucket: null as R2Bucket | null,
};
(
  globalThis as typeof globalThis & { backupTestRuntime: typeof runtime }
).backupTestRuntime = runtime;
registerHooks({
  resolve(specifier, parent, next) {
    return specifier === 'cloudflare:workers'
      ? {
          url:
            'data:text/javascript,' +
            encodeURIComponent(
              'export const env={get DB(){return globalThis.backupTestRuntime.db},get MEDIA(){return globalThis.backupTestRuntime.bucket},get HASTABAZAAR_SECURITY_KEY(){return globalThis.backupTestRuntime.key},SECURITY_POLICY:{async read(){return true},async mark(){}},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"http://localhost:3018"}',
            ),
          shortCircuit: true,
        }
      : next(specifier, parent);
  },
});
void test('backup and key downloads require recent MFA, remain separate and inspect without restoring', async () => {
  const f = securityDatabase();
  runtime.db = f.db;
  runtime.key = Buffer.from(randomBytes(32)).toString('base64url');
  const now = Date.now(),
    token = 'fictional-protected-session',
    hash = createHash('sha256').update(token).digest('hex');
  f.sqlite.exec(
    'CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT,ip_hash TEXT,created_at INTEGER)',
  );
  f.sqlite.exec(
    'CREATE TABLE homepage_hero_media(id TEXT PRIMARY KEY,object_key TEXT,mime_type TEXT,size_bytes INTEGER)',
  );
  const file = new Uint8Array([1, 2, 3]),
    originalFetch = globalThis.fetch,
    builtinKey = 'public/homepage/nepal-craft-hero.webp',
    builtinBytes = new Uint8Array([8, 9, 10]);
  let staticReads = 0;
  runtime.bucket = {
    async list() {
      return {
        objects: [
          {
            key: 'private/evidence/fictional',
            size: 3,
            etag: 'fixed',
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { purpose: 'fictional' },
          },
        ],
        truncated: false,
      };
    },
    async get(key: string) {
      if (key !== 'private/evidence/fictional') return null;
      return {
        key: 'private/evidence/fictional',
        size: 3,
        etag: 'fixed',
        httpMetadata: { contentType: 'application/octet-stream' },
        customMetadata: { purpose: 'fictional' },
        body: new ReadableStream({
          start(c) {
            c.enqueue(file);
            c.close();
          },
        }),
      };
    },
  } as unknown as R2Bucket;
  try {
    f.sqlite
      .prepare('INSERT INTO homepage_hero_media VALUES (?,?,?,?)')
      .run('system-nepal-craft-hero', builtinKey, 'image/webp', 3);
    globalThis.fetch = async (input, init) => {
      assert.equal(
        input instanceof Request ? input.url : input.toString(),
        'http://localhost:3018/homepage/nepal-craft-hero.webp',
      );
      assert.equal(init?.redirect, 'manual');
      staticReads++;
      return new Response(builtinBytes.slice(), {
        headers: { 'content-type': 'image/webp' },
      });
    };
    f.sqlite
      .prepare('INSERT INTO users VALUES (?,?,?,?,?,?)')
      .run(
        'super',
        'subject',
        'fictional@example.test',
        'Fictional',
        'active',
        now,
      );
    f.sqlite
      .prepare('INSERT INTO user_roles VALUES (?,?)')
      .run('super', 'super_admin');
    f.sqlite
      .prepare('INSERT INTO user_sessions VALUES (?,?,?,?,?)')
      .run(hash, 'super', now + 8 * 3600000, now, now);
    f.sqlite
      .prepare('INSERT INTO users VALUES (?,?,?,?,?,?)')
      .run(
        'other',
        'other-subject',
        'other@example.test',
        'Other fictional Admin',
        'active',
        now,
      );
    f.sqlite
      .prepare('INSERT INTO user_roles VALUES (?,?)')
      .run('other', 'admin');
    const store = new SecurityStore(f.db, runtime.key);
    await store.initialize(['super', 'other'], now);
    const mfa = new MfaService(store),
      setup = await mfa.beginSetup({ userId: 'super', sessionHash: hash, now });
    const service = await import('../lib/portability/service');
    const headers = {
      host: 'localhost:3018',
      origin: 'http://localhost:3018',
      cookie: 'hastabazaar_session=' + token,
      'content-type': 'application/json',
    };
    const req = (body: unknown) =>
      new Request('http://localhost:3018/api/admin/backup-transfer', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    assert.equal(
      (
        await service.createBackup(
          req({
            action: 'export',
            passphrase: 'fictional-backup-passphrase',
            confirmation: true,
          }),
        )
      ).status,
      403,
    );
    await mfa.confirmSetup({
      userId: 'super',
      sessionHash: hash,
      setupId: setup.setupId,
      code: totpAtCounter(setup.secret, Math.floor(now / 30000)),
      now,
    });
    await mfa.activateSetup({
      userId: 'super',
      sessionHash: hash,
      setupId: setup.setupId,
      recoverySaved: true,
      passwordVerifiedAt: now,
      now,
    });
    const beforeUsers = JSON.stringify(
        f.sqlite.prepare('SELECT * FROM users').all(),
      ),
      beforeRoles = JSON.stringify(
        f.sqlite.prepare('SELECT * FROM user_roles').all(),
      );
    const readiness = await service.backupReadiness(
      new Request('http://localhost:3018/api/admin/backup-transfer', {
        headers,
      }),
    );
    assert.equal(
      ((await readiness.json()) as { verificationExpiresAt: number })
        .verificationExpiresAt,
      now + 5 * 60000,
    );
    Object.assign(f.db,{dialect:'mariadb'});
    const nativeReadiness=await service.backupReadiness(new Request('http://localhost:3018/api/admin/backup-transfer',{headers}));
    assert.equal((await nativeReadiness.json() as {nativeRecoveryRequired?:boolean}).nativeRecoveryRequired,true);
    const nativeExport=await service.createBackup(req({action:'export',passphrase:'fictional-backup-passphrase',confirmation:true}));
    assert.equal(nativeExport.status,409);
    assert.equal((await nativeExport.json() as {code?:string}).code,'HOST_NATIVE_RECOVERY_REQUIRED');
    delete (f.db as D1Database & {dialect?:string}).dialect;
    const backup = await service.createBackup(
      req({
        action: 'export',
        passphrase: 'fictional-backup-passphrase',
        confirmation: true,
      }),
    );
    assert.equal(backup.status, 200);
    const bytes = new Uint8Array(await backup.arrayBuffer());
    assert.ok(bytes.length > 1000);
    assert.ok(
      !Buffer.from(bytes).toString().includes('fictional@example.test'),
    );
    let insideBuiltin = false,
      builtinCount = 0;
    const chunks: Buffer[] = [];
    for await (const { value } of decryptPortableFrames(
      bytes,
      'fictional-backup-passphrase',
      'data',
    )) {
      const frame = value as {
        type: string;
        object?: {
          key: string;
          customMetadata: Record<string, string>;
          httpMetadata: Record<string, string>;
        };
        data?: string;
      };
      if (frame.type === 'object-start') {
        insideBuiltin = frame.object?.key === builtinKey;
        if (insideBuiltin) {
          builtinCount++;
          assert.deepEqual(frame.object?.customMetadata, {
            portabilitySource: 'application-static',
          });
          assert.deepEqual(frame.object?.httpMetadata, {
            contentType: 'image/webp',
          });
        }
      }
      if (insideBuiltin && frame.type === 'object-bytes')
        chunks.push(Buffer.from(frame.data!, 'base64'));
      if (frame.type === 'object-end') insideBuiltin = false;
    }
    assert.equal(builtinCount, 1);
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(builtinBytes));
    assert.ok(
      staticReads >= 3,
      'Real protected export must read and recheck the registered application file',
    );
    const recovery = await service.createBackup(
      req({
        action: 'key-recovery',
        passphrase: 'different-fictional-key-passphrase',
        confirmation: true,
      }),
    );
    assert.equal(recovery.status, 200);
    const keys = new Uint8Array(await recovery.arrayBuffer());
    assert.ok(!Buffer.from(keys).toString().includes(runtime.key));
    const prepared = await service.inspectBackup(
      new Request('http://localhost:3018/api/admin/backup-transfer/inspect', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'prepare',
          passphrase: 'fictional-backup-passphrase',
        }),
      }),
    );
    assert.equal(prepared.status, 200);
    const { ticket } = (await prepared.json()) as { ticket: string };
    const upload = () =>
      new Request('http://localhost:3018/api/admin/backup-transfer/inspect', {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/octet-stream',
          'x-hastabazaar-inspection': ticket,
        },
        body: bytes,
      });
    const inspected = await service.inspectBackup(upload());
    assert.equal(inspected.status, 200);
    const result = (await inspected.json()) as {
      valid: boolean;
      inventory: { files: number };
    };
    assert.equal(result.valid, true);
    assert.equal(result.inventory.files, 2);
    assert.notEqual(
      (await service.inspectBackup(upload())).status,
      200,
      'Inspection tickets are one-use',
    );
    assert.equal(
      JSON.stringify(f.sqlite.prepare('SELECT * FROM users').all()),
      beforeUsers,
    );
    assert.equal(
      JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all()),
      beforeRoles,
    );
    assert.equal(
      (
        await service.createBackup(
          req({ action: 'restore', confirmation: true }),
        )
      ).status,
      403,
    );
    const preparedDownload = await service.createBackup(
      req({
        action: 'prepare-download',
        kind: 'export',
        passphrase: 'fictional-backup-passphrase',
        confirmation: true,
      }),
    );
    assert.equal(preparedDownload.status, 200);
    const downloadTicket = (
      (await preparedDownload.json()) as { ticket: string }
    ).ticket;
    const native = () =>
      new Request('http://localhost:3018/api/admin/backup-transfer/download', {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ ticket: downloadTicket }),
      });
    const download = await service.downloadBackup(native());
    assert.equal(download.status, 200);
    assert.ok((await download.arrayBuffer()).byteLength > 1000);
    assert.notEqual(
      (await service.downloadBackup(native())).status,
      200,
      'Native download ticket is one use',
    );
    const other = f.sqlite
      .prepare(
        "SELECT value FROM marketplace_settings WHERE `key`='auth-private:account:other'",
      )
      .get()!;
    f.sqlite
      .prepare(
        "DELETE FROM marketplace_settings WHERE `key`='auth-private:account:other'",
      )
      .run();
    assert.equal(
      (
        await service.createBackup(
          req({
            action: 'export',
            passphrase: 'fictional-backup-passphrase',
            confirmation: true,
          }),
        )
      ).status,
      409,
      'Missing other Admin security state cannot produce a complete backup',
    );
    f.sqlite
      .prepare(
        "INSERT INTO marketplace_settings VALUES ('auth-private:account:other',?,'other',?)",
      )
      .run('corrupted', now);
    assert.equal(
      (
        await service.createBackup(
          req({
            action: 'export',
            passphrase: 'fictional-backup-passphrase',
            confirmation: true,
          }),
        )
      ).status,
      409,
      'Corrupt other Admin security state cannot produce a complete backup',
    );
    f.sqlite
      .prepare(
        "UPDATE marketplace_settings SET value=? WHERE `key`='auth-private:account:other'",
      )
      .run(other.value);
    f.sqlite.prepare('DELETE FROM request_rate_limits').run();
    f.sqlite.exec(
      'CREATE TABLE unreviewed_fixture_backup_table(id TEXT PRIMARY KEY)',
    );
    const failed = await service.createBackup(
      req({
        action: 'export',
        passphrase: 'fictional-backup-passphrase',
        confirmation: true,
      }),
    );
    assert.equal(failed.status, 503);
    assert.equal(
      ((await failed.json()) as { code: string }).code,
      'BACKUP_PREPARATION_FAILED',
      'A storage preparation failure must not be mislabeled as an MFA failure',
    );
    f.sqlite.exec('DROP TABLE unreviewed_fixture_backup_table');
    f.sqlite.prepare('DELETE FROM request_rate_limits').run();
    const current = await store.readProof(hash, 'super');
    assert.ok(current);
    await store.checkedBatch(
      store.proofUpsert(
        current,
        {
          ...current.value,
          passwordVerifiedAt: now - 6 * 60000,
          verifiedAt: now - 6 * 60000,
          absoluteExpiresAt: now - 6 * 60000 + 8 * 3600000,
        },
        now,
      ),
    );
    for (const action of ['export', 'key-recovery', 'prepare-download'])
      assert.equal(
        (
          await service.createBackup(
            req({
              action,
              kind: 'export',
              passphrase: 'fictional-backup-passphrase',
              confirmation: true,
            }),
          )
        ).status,
        403,
        'Old MFA proof cannot authorize ' + action,
      );
    assert.equal(
      (
        await service.inspectBackup(
          req({ action: 'prepare', passphrase: 'fictional-backup-passphrase' }),
        )
      ).status,
      403,
    );
    const stale = await store.readProof(hash, 'super');
    await store.checkedBatch(store.proofUpsert(stale!, current.value, now));
    f.sqlite
      .prepare("UPDATE user_roles SET role='admin' WHERE user_id='super'")
      .run();
    f.sqlite.prepare('DELETE FROM request_rate_limits').run();
    for (const action of ['export', 'key-recovery', 'prepare-download'])
      assert.equal(
        (
          await service.createBackup(
            req({
              action,
              kind: 'export',
              passphrase: 'fictional-backup-passphrase',
              confirmation: true,
            }),
          )
        ).status,
        403,
        'Ordinary Admin cannot authorize ' + action,
      );
    assert.equal(
      (
        await service.inspectBackup(
          req({ action: 'prepare', passphrase: 'fictional-backup-passphrase' }),
        )
      ).status,
      403,
    );
  } finally {
    globalThis.fetch = originalFetch;
    runtime.db = null;
    runtime.bucket = null;
    f.dispose();
  }
});
