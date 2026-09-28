import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { ensureLocalTestAccount } from '../lib/auth/local-test-seed';
import type { LocalTestRole } from '../lib/auth/local-test-access';

class MemoryStatement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[], success: true, meta: {} }; }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const names = (await readdir(new URL('../drizzle/', import.meta.url)))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  for (const name of names) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean))
      sqlite.exec(statement);
  }
  const database = {
    prepare(sql: string) { return new MemoryStatement(sqlite.prepare(sql)); },
    async batch(statements: MemoryStatement[]) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  return { sqlite, database };
}

function snapshot(sqlite: DatabaseSync) {
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map((row) => String(row.name));
  return Object.fromEntries(tables.map((table) => {
    const quoted = '"' + table.replaceAll('"', '""') + '"';
    return [table, sqlite.prepare(`SELECT * FROM ${quoted}`).all().map((row) => JSON.stringify(row)).sort()];
  }));
}

const roles: LocalTestRole[] = ['customer', 'buyer', 'seller', 'rider', 'admin', 'super_admin'];

void test('repeat local role seeding preserves changed identities, removed grants and rider review decisions', async () => {
  const { sqlite, database } = await fixture();
  try {
    for (const role of roles) await ensureLocalTestAccount(database, role);
    sqlite.exec(`
      UPDATE users SET display_name='Edited fictional profile',email=id || '@edited.example.test',
        status='suspended',updated_at=1790555935329 WHERE id LIKE 'local-test-%';
      DELETE FROM user_roles WHERE user_id LIKE 'local-test-%';
      UPDATE seller_profiles SET support_email='edited-seller@example.test',status='suspended',
        updated_at=1790555935329 WHERE id='local-test-seller-profile';
      UPDATE rider_profiles SET status='suspended',version=7,open_box_eligible=0,
        open_box_reviewed_by='local-test-admin',open_box_reviewed_at=1790551018502,
        review_note='Training permission revoked',updated_at=1790551018502
        WHERE user_id='local-test-rider';
      INSERT INTO rider_events(id,user_id,actor_id,action,note,created_at)
        VALUES ('retained-rider-review','local-test-rider','local-test-admin','review',
          'Fictional review history must remain intact',1790551018502);
    `);
    const before = snapshot(sqlite);
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const role of roles) await ensureLocalTestAccount(database, role);
      assert.deepEqual(snapshot(sqlite), before, 'Role switching must preserve every persisted field and removed grant');
    }
  } finally { sqlite.close(); }
});

for (const role of ['buyer', 'seller', 'rider', 'admin', 'super_admin'] as const) {
  void test(`existing incomplete ${role} fixture is preserved without repairing access or configuration`, async () => {
    const { sqlite, database } = await fixture();
    const userId = role === 'super_admin' ? 'local-test-super-admin' : `local-test-${role}`;
    try {
      if (role === 'super_admin') await ensureLocalTestAccount(database, 'admin');
      sqlite.prepare(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
        VALUES (?,?,?,'Restricted fictional fixture','en-NP','active',1,1790551018502)`)
        .run(userId, userId, `${userId}@edited.example.test`);
      const before = snapshot(sqlite);
      await ensureLocalTestAccount(database, role);
      assert.deepEqual(snapshot(sqlite), before, 'An existing account must not receive roles, profiles or published settings');
    } finally { sqlite.close(); }
  });
}

for (const collision of ['id', 'subject', 'both'] as const) {
  void test(`local seed rejects ${collision} identity collision without granting privileges or changing records`, async () => {
    const { sqlite, database } = await fixture();
    try {
      const insert = sqlite.prepare(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
        VALUES (?,?,?,'Unrelated fictional identity','en-NP','active',1,1790551018502)`);
      if (collision !== 'subject') insert.run('local-test-admin', 'other-auth-subject', 'id-collision@example.test');
      if (collision !== 'id') insert.run('other-user', 'local-test-admin', 'subject-collision@example.test');
      const before = snapshot(sqlite);
      await assert.rejects(ensureLocalTestAccount(database, 'admin'), /identity|collision|another/i);
      assert.deepEqual(snapshot(sqlite), before, 'A rejected fixture collision must be read-only');
    } finally { sqlite.close(); }
  });
}

void test('absent local fixtures initialize intended users, roles, profiles and fictional settings', async () => {
  const { sqlite, database } = await fixture();
  try {
    for (const role of roles) await ensureLocalTestAccount(database, role);
    assert.deepEqual(sqlite.prepare('SELECT id,auth_subject,status FROM users ORDER BY id').all().map((row) => ({ ...row })), [
      { id: 'local-test-admin', auth_subject: 'local-test-admin', status: 'active' },
      { id: 'local-test-buyer', auth_subject: 'local-test-buyer', status: 'active' },
      { id: 'local-test-customer', auth_subject: 'local-test-customer', status: 'active' },
      { id: 'local-test-rider', auth_subject: 'local-test-rider', status: 'active' },
      { id: 'local-test-seller', auth_subject: 'local-test-seller', status: 'active' },
      { id: 'local-test-super-admin', auth_subject: 'local-test-super-admin', status: 'active' },
    ]);
    assert.deepEqual(sqlite.prepare('SELECT user_id,role FROM user_roles ORDER BY user_id,role').all().map((row) => [row.user_id, row.role]), [
      ['local-test-admin', 'admin'], ['local-test-admin', 'customer'], ['local-test-buyer', 'customer'],
      ['local-test-customer', 'customer'], ['local-test-rider', 'customer'], ['local-test-seller', 'customer'],
      ['local-test-seller', 'seller'], ['local-test-super-admin', 'customer'], ['local-test-super-admin', 'super_admin'],
    ]);
    assert.equal(sqlite.prepare("SELECT status FROM seller_profiles WHERE user_id='local-test-seller'").get()?.status, 'approved');
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM seller_participation_profiles WHERE seller_id='local-test-seller-profile'").get()?.n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM seller_operational_addresses WHERE seller_id='local-test-seller-profile'").get()?.n, 1);
    assert.deepEqual({ ...sqlite.prepare("SELECT status,open_box_eligible,application_id FROM rider_profiles WHERE user_id='local-test-rider'").get() },
      { status: 'approved', open_box_eligible: 1, application_id: 'local-test-rider-application' });
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM rider_applications WHERE user_id='local-test-rider'").get()?.n, 1);
    assert.deepEqual(sqlite.prepare("SELECT setting_key,status FROM business_setting_versions WHERE id LIKE 'local-staging-%' ORDER BY setting_key")
      .all().map((row) => [row.setting_key, row.status]), [['open_box_service_area_codes', 'published'], ['rider_finance_policy', 'published']]);
  } finally { sqlite.close(); }
});
