import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
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
