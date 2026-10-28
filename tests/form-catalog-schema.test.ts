import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users(id TEXT PRIMARY KEY);
    INSERT INTO users(id) VALUES ('admin'), ('customer');
  `);
  const migration = await readFile(
    new URL('../drizzle/0056_form_catalog.sql', import.meta.url),
    'utf8',
  );
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) sqlite.exec(statement);
  }
  return sqlite;
}

function insertVersion(
  sqlite: DatabaseSync,
  id: string,
  formId: string,
  version: number,
  status: 'draft' | 'published',
  configJson = '{"fields":[]}',
) {
  sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
     updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, formId, version, 1, status, configJson, 'Initial configuration',
      'admin', 100, 'admin', 100,
      status === 'published' ? 'admin' : null,
      status === 'published' ? 100 : null,
      `request-${id}`);
}

function insertAnswer(
  sqlite: DatabaseSync,
  id: string,
  formId: string,
  requestId: string,
  versionId: string,
  answersJson = '{"answers":[]}',
) {
  sqlite.prepare(`INSERT INTO form_answer_sets
    (id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, formId, requestId, versionId, 'customer_profile', 'profile-1',
      'customer', answersJson, 200);
}

void test('config versions enforce JSON, bounds, uniqueness, and immutable publication', async () => {
  const sqlite = await fixture();
  try {
    insertVersion(sqlite, 'v1', 'account.profile', 1, 'published');
    assert.throws(() => insertVersion(sqlite, 'v1-copy', 'account.profile', 1, 'draft'));
    assert.throws(() => insertVersion(sqlite, 'bad-json', 'account.profile', 2, 'draft', '{'));
    assert.throws(() => insertVersion(sqlite, 'huge', 'account.profile', 2, 'draft', `{"x":"${'a'.repeat(65536)}"}`));
    assert.throws(() => sqlite.exec("UPDATE form_config_versions SET config_json='{}' WHERE id='v1'"));
    assert.throws(() => sqlite.exec("DELETE FROM form_config_versions WHERE id='v1'"));
    insertVersion(sqlite, 'draft', 'account.profile', 2, 'draft');
    sqlite.exec("UPDATE form_config_versions SET revision=2,updated_at=201 WHERE id='draft'");
    assert.equal(sqlite.prepare("SELECT revision FROM form_config_versions WHERE id='draft'").get()?.revision, 2);
  } finally {
    sqlite.close();
  }
});

void test('feedback delivery job migration enforces one cross-source request and uncertain-send state', async () => {
  const sqlite = await fixture();
  try {
    const migration = await readFile(new URL('../drizzle/0059_feedback_delivery_jobs.sql', import.meta.url), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
    insertVersion(sqlite, 'contact-v1', 'public.contact', 1, 'published');
    insertVersion(sqlite, 'footer-v1', 'public.footer-feedback', 1, 'published');
    const add = (id: string, request: string, formId: string, versionId: string, status: string, token: string | null, expiry: number | null, sent: number | null) =>
      sqlite.prepare(`INSERT INTO feedback_delivery_jobs(id,request_id,form_id,config_version_id,payload_hash,feedback_json,status,lease_token,lease_expires_at,attempt_count,created_at,updated_at,sent_at)
        VALUES (?,?,?,?,?,'{}',?,?,?,1,100,100,?)`).run(id, request, formId, versionId, 'a'.repeat(64), status, token, expiry, sent);
    add('job-1', 'shared-request', 'public.contact', 'contact-v1', 'sending', 'lease-1', 200, null);
    assert.throws(() => add('job-2', 'shared-request', 'public.footer-feedback', 'footer-v1', 'pending', null, null, null));
    assert.throws(() => add('job-3', 'another-request', 'public.contact', 'contact-v1', 'sent', null, null, null));
    assert.throws(() => add('job-4', 'third-request', 'public.contact', 'footer-v1', 'pending', null, null, null));
    assert.equal(sqlite.prepare("SELECT status FROM feedback_delivery_jobs WHERE id='job-1'").get()?.status, 'sending');
    const generated = await readFile(new URL('../deployment/babal/mariadb-schema.sql', import.meta.url), 'utf8');
    const recovery = await readFile(new URL('../deployment/babal/mariadb-reset-empty-import.sql', import.meta.url), 'utf8');
    for (const source of [generated, recovery]) {
      assert.match(source, /CREATE TABLE IF NOT EXISTS `feedback_delivery_jobs`/);
      assert.match(source, /feedback_delivery_jobs_version_fk/);
      assert.match(source, /idx_feedback_delivery_jobs_request/);
    }
  } finally { sqlite.close(); }
});

void test('answer sets enforce same-form version references, request idempotency, and snapshot bounds', async () => {
  const sqlite = await fixture();
  try {
    insertVersion(sqlite, 'profile-v1', 'account.profile', 1, 'published');
    insertVersion(sqlite, 'review-v1', 'account.review', 1, 'published');
    insertAnswer(sqlite, 'a1', 'account.profile', 'submission-1', 'profile-v1', '{"answers":[{"fieldId":"old","label":"Original label","value":"yes"}]}');
    assert.throws(() => insertAnswer(sqlite, 'duplicate', 'account.profile', 'submission-1', 'profile-v1'));
    assert.throws(() => insertAnswer(sqlite, 'cross-form', 'account.profile', 'submission-2', 'review-v1'));
    assert.throws(() => insertAnswer(sqlite, 'bad-json', 'account.profile', 'submission-3', 'profile-v1', '{'));
    assert.throws(() => insertAnswer(sqlite, 'huge', 'account.profile', 'submission-4', 'profile-v1', `{"x":"${'a'.repeat(131072)}"}`));
    const indexNames = sqlite.prepare("SELECT name FROM pragma_index_list('form_answer_sets')").all().map((row) => row.name);
    assert.ok(indexNames.includes('idx_form_answer_sets_owner'));
    assert.ok(indexNames.includes('idx_form_answer_sets_form_request'));
    assert.throws(() => sqlite.exec("DELETE FROM form_config_versions WHERE id='profile-v1'"));
    insertVersion(sqlite, 'profile-v2', 'account.profile', 2, 'published');
    const old = sqlite.prepare('SELECT config_version_id,answers_json FROM form_answer_sets WHERE id=?').get('a1');
    assert.deepEqual({ ...old }, { config_version_id: 'profile-v1', answers_json: '{"answers":[{"fieldId":"old","label":"Original label","value":"yes"}]}' });
  } finally {
    sqlite.close();
  }
});

void test('identifier equality stays case and trailing-space sensitive in D1 and generated MariaDB DDL', async () => {
  const sqlite = await fixture();
  const reviewRoot = await mkdtemp(join(tmpdir(), 'form-catalog-collation-'));
  try {
    insertVersion(sqlite, 'Cfg', 'Case.Form', 1, 'published');
    insertVersion(sqlite, 'cfg', 'case.form', 1, 'published');
    insertVersion(sqlite, 'Cfg ', 'Case.Form ', 1, 'published');
    insertAnswer(sqlite, 'Answer', 'Case.Form', 'Submit', 'Cfg');
    insertAnswer(sqlite, 'answer', 'Case.Form', 'submit', 'Cfg');
    insertAnswer(sqlite, 'Answer ', 'Case.Form', 'Submit ', 'Cfg');
    assert.throws(() => insertAnswer(sqlite, 'wrong-case-reference', 'Case.Form', 'different', 'cfg'));
    sqlite.exec("UPDATE form_answer_sets SET subject_id='Profile-1' WHERE id='Answer'");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE subject_id='profile-1'").get()?.count, 2);

    const projectRoot = new URL('../', import.meta.url);
    const folders = ['scripts', 'drizzle/meta', 'deployment/babal', 'lib/operations'];
    for (const folder of folders) await mkdir(join(reviewRoot, folder), { recursive: true });
    await copyFile(new URL('../scripts/generate-mariadb-schema.mjs', import.meta.url), join(reviewRoot, 'scripts/generate-mariadb-schema.mjs'));
    await copyFile(new URL('../lib/operations/fee-schema-readiness.mjs', import.meta.url), join(reviewRoot, 'lib/operations/fee-schema-readiness.mjs'));
    await copyFile(new URL('../drizzle/meta/0020_snapshot.json', import.meta.url), join(reviewRoot, 'drizzle/meta/0020_snapshot.json'));
    for (const name of await readdir(new URL('deployment/babal/', projectRoot))) {
      if (name.startsWith('mariadb-') && name.endsWith('.sql')) {
        await copyFile(new URL(`deployment/babal/${name}`, projectRoot), join(reviewRoot, 'deployment/babal', name));
      }
    }
    execFileSync(process.execPath, [join(reviewRoot, 'scripts/generate-mariadb-schema.mjs')]);
    const generated = await readFile(join(reviewRoot, 'deployment/babal/mariadb-schema.sql'), 'utf8');
    for (const [table, columns] of [
      ['form_config_versions', ['id', 'form_id', 'last_request_id', 'status']],
      ['form_answer_sets', ['id', 'form_id', 'request_id', 'config_version_id', 'subject_type', 'subject_id']],
    ] as const) {
      const start = generated.indexOf('CREATE TABLE IF NOT EXISTS `' + table + '` (');
      assert.ok(start >= 0, `generated schema creates ${table}`);
      const end = generated.indexOf(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;', start);
      assert.ok(end > start, `generated schema completes ${table}`);
      const ddl = generated.slice(start, end);
      for (const column of columns) {
        const line = ddl.split('\n').find((part) => part.trimStart().startsWith(`\`${column}\` `));
        assert.match(line ?? '', /COLLATE utf8mb4_nopad_bin/, `${table}.${column} must preserve D1 identifier equality`);
      }
    }
  } finally {
    sqlite.close();
    await rm(reviewRoot, { recursive: true, force: true });
  }
});

void test('legal holds store one active hold per customer and preserve released history', async () => {
  const sqlite = await fixture();
  try {
    const migration = await readFile(new URL('../drizzle/0057_data_rights_legal_holds.sql', import.meta.url), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
    const insert = sqlite.prepare(`INSERT INTO data_rights_legal_holds
      (id,user_id,reason,placed_by,placed_at) VALUES (?, 'customer', 'Open legal dispute', 'admin', ?)`);
    insert.run('hold-1', 100);
    assert.throws(() => insert.run('hold-2', 101), /UNIQUE/);
    assert.throws(() => sqlite.exec("UPDATE data_rights_legal_holds SET released_at=102 WHERE id='hold-1'"));
    sqlite.exec("UPDATE data_rights_legal_holds SET released_by='admin',released_at=102 WHERE id='hold-1'");
    insert.run('hold-2', 103);
    assert.deepEqual(sqlite.prepare('SELECT id,released_at AS releasedAt FROM data_rights_legal_holds ORDER BY placed_at').all()
      .map((row) => ({ ...row })), [{ id: 'hold-1', releasedAt: 102 }, { id: 'hold-2', releasedAt: null }]);
    const generated = await readFile(new URL('../deployment/babal/mariadb-schema.sql', import.meta.url), 'utf8');
    assert.match(generated, /CREATE TABLE IF NOT EXISTS `data_rights_legal_holds`/);
    assert.match(generated, /UNIQUE KEY `idx_data_rights_legal_holds_one_active`/);
  } finally { sqlite.close(); }
});

void test('deleted-address answer ownership survives its parent row in D1 and generated MariaDB schema', async () => {
  const sqlite = await fixture();
  try {
    const migration = await readFile(new URL('../drizzle/0058_address_answer_owner_tombstones.sql', import.meta.url), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
    sqlite.prepare(`INSERT INTO address_answer_owner_tombstones
      (address_id,user_id,deletion_request_id,deleted_at) VALUES ('address-1','customer','delete-1',100)`).run();
    assert.throws(() => sqlite.exec(`INSERT INTO address_answer_owner_tombstones
      (address_id,user_id,deletion_request_id,deleted_at) VALUES ('address-1','admin','delete-2',101)`));
    assert.throws(() => sqlite.exec(`INSERT INTO address_answer_owner_tombstones
      (address_id,user_id,deletion_request_id,deleted_at) VALUES ('address-2','missing','delete-2',101)`));
    assert.deepEqual({ ...sqlite.prepare(`SELECT address_id,user_id FROM address_answer_owner_tombstones
      WHERE address_id='address-1'`).get() }, { address_id: 'address-1', user_id: 'customer' });
    const generated = await readFile(new URL('../deployment/babal/mariadb-schema.sql', import.meta.url), 'utf8');
    const recovery = await readFile(new URL('../deployment/babal/mariadb-reset-empty-import.sql', import.meta.url), 'utf8');
    for (const ddl of [generated, recovery]) {
      assert.match(ddl, /CREATE TABLE IF NOT EXISTS `address_answer_owner_tombstones`/);
      assert.match(ddl, /KEY `idx_address_answer_owner_tombstones_user`/);
    }
  } finally { sqlite.close(); }
});
