import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { inspectIdentityFormReadiness, prepareIdentityFormBaselines, runIdentityFormReadiness } from '../scripts/staging/identity-form-readiness.mjs';

function fixture(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  }
  sqlite.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
      VALUES ('local-test-super-admin','local-test-super-admin','superadmin@local.hastabazaar.test',
        'SIMULATED existing reviewer','en-NP','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES('local-test-super-admin','super_admin',1);`);
  return sqlite;
}

void test('feature readiness inspection is read-only and reports all24 required hidden configurations', () => {
  const sqlite = fixture();
  try {
    const before = sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n;
    const plan = inspectIdentityFormReadiness(sqlite);
    assert.equal(plan.ready, false);
    assert.equal(plan.actorReady, true);
    assert.deepEqual(plan.missing, ['identity.register', 'identity.login-password', 'identity.email-code-request',
      'identity.email-code-verify', 'identity.password-reset-request', 'identity.password-reset-complete',
      'account.profile', 'account.address', 'account.daily-reward', 'account.points-redemption',
      'commerce.promo-quote', 'commerce.gift-card-redeem', 'staff.staff-invitation', 'staff.staff-permission-1',
      'staff.staff-permission-2', 'rider.code-verify', 'staff.homepage-hero-manager', 'staff.homepage-occasion-manager',
      'staff.homepage-visibility', 'staff.business-settings-manager', 'staff.delivery-rate', 'staff.promo-code',
      'staff.loyalty-settings', 'staff.referral-settings']);
    assert.deepEqual(plan.blocked, []);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n, before);
  } finally { sqlite.close(); }
});

void test('local preparation captures a coherent prewrite recovery and replays without another backup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hastabazaar-identity-baseline-'));
  const source = join(directory, 'disposable.sqlite');
  const backup = join(directory, 'before-forms.sqlite');
  const sqlite = fixture(source);
  try {
    sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;');
    sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
      VALUES('committed-wal-user','committed-wal-user','committed@local.hastabazaar.test',
        'SIMULATED committed before backup','en-NP','active',2,2);`);
    const existingAudit = sqlite.prepare('SELECT * FROM audit_logs ORDER BY id').all();
    const result = await prepareIdentityFormBaselines(sqlite, backup, 1000);
    assert.equal(result.ready, true);
    assert.equal(result.created.length, 24);
    assert.equal(result.backup, backup);
    const saved = new DatabaseSync(backup, { readOnly: true });
    try {
      assert.equal(saved.prepare("SELECT display_name FROM users WHERE id='committed-wal-user'").get()?.display_name,
        'SIMULATED committed before backup');
      assert.equal(saved.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, 0);
      assert.deepEqual(saved.prepare('SELECT * FROM audit_logs ORDER BY id').all(), existingAudit);
    } finally { saved.close(); }
    const forms = sqlite.prepare('SELECT * FROM form_config_versions ORDER BY form_id').all();
    const audits = sqlite.prepare('SELECT * FROM audit_logs ORDER BY id').all();
    const replay = await prepareIdentityFormBaselines(sqlite, join(directory, 'unused.sqlite'), 2000);
    assert.deepEqual(replay.created, []);
    assert.equal(replay.preserved.length, 24);
    assert.equal(replay.backup, null);
    assert.deepEqual(sqlite.prepare('SELECT * FROM form_config_versions ORDER BY form_id').all(), forms);
    assert.deepEqual(sqlite.prepare('SELECT * FROM audit_logs ORDER BY id').all(), audits);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 2);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_roles').get()?.n, 1);
    assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { sqlite.close(); await rm(directory, { recursive: true, force: true }); }
});

void test('local preparation refuses a removed or colliding reviewer instead of repairing authority', async () => {
  for (const change of ["DELETE FROM user_roles", "UPDATE users SET auth_subject='unrelated-identity'",
    "UPDATE users SET status='suspended'"]) {
    const sqlite = fixture();
    try {
      sqlite.exec(change);
      const users = sqlite.prepare('SELECT * FROM users').all();
      const roles = sqlite.prepare('SELECT * FROM user_roles').all();
      await assert.rejects(prepareIdentityFormBaselines(sqlite, 'must-not-open-a-backup.sqlite'), /existing active fictional Super Admin/);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, 0);
      assert.deepEqual(sqlite.prepare('SELECT * FROM users').all(), users);
      assert.deepEqual(sqlite.prepare('SELECT * FROM user_roles').all(), roles);
    } finally { sqlite.close(); }
  }
});

void test('backup collision prevents every publication and retains the recovery file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hastabazaar-identity-backup-collision-'));
  const backup = join(directory, 'existing.sqlite');
  const sqlite = fixture();
  const saved = new DatabaseSync(backup);
  saved.exec("CREATE TABLE preserved(value TEXT); INSERT INTO preserved VALUES('retain this recovery');");
  saved.close();
  try {
    await assert.rejects(prepareIdentityFormBaselines(sqlite, backup), /EEXIST/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, 0);
    const existing = new DatabaseSync(backup, { readOnly: true });
    try { assert.equal(existing.prepare('SELECT value FROM preserved').get()?.value, 'retain this recovery'); }
    finally { existing.close(); }
  } finally { sqlite.close(); await rm(directory, { recursive: true, force: true }); }
});

void test('identity readiness rejects nonlocal runtime context before opening a database', async () => {
  const project = fileURLToPath(new URL('../', import.meta.url));
  const environment = { HASTABAZAAR_RUNTIME_ENV: 'local_staging', NODE_ENV: 'development',
    APP_ORIGIN: 'http://localhost:4173', HASTABAZAAR_MAIL_MODE: 'capture', HASTABAZAAR_PAYMENT_MODE: 'simulated',
    HASTABAZAAR_RECIPIENT_DOMAIN: 'local.hastabazaar.test' };
  for (const change of [{ HASTABAZAAR_RUNTIME_ENV: 'production' }, { NODE_ENV: 'production' },
    { APP_ORIGIN: 'https://hastabazaar.com' }, { HASTABAZAAR_MAIL_MODE: 'smtp' },
    { DB_HOST: 'remote.example.test' }, { HASTABAZAAR_PAYMENT_MODE: 'live' }]) {
    await assert.rejects(runIdentityFormReadiness(project, project, { ...environment, ...change }, '--apply'));
  }
  await assert.rejects(runIdentityFormReadiness('C:/Users/abinash/Desktop/Hatskala',
    'C:/Users/abinash/Desktop/Hatskala', environment, '--apply'), /approved isolated checkout/);
});
