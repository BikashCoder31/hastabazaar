import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';

import { saveFormDraft, publishFormDraft, restoreFormVersion } from '../lib/db/repositories/form-catalog';
import { buildFormAnswerInsert, listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import type { FormAnswerSnapshot } from '../lib/forms/types';

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

class Database {
  beforeBatch: (() => void) | null = null;
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    const before = this.beforeBatch;
    this.beforeBatch = null;
    before?.();
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

const formId = 'account.profile';
const emptyConfig = { formId, fields: [] };
const actor = { actorId: 'admin', actorRole: 'super_admin' as const };

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users(id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE user_roles(user_id TEXT NOT NULL, role TEXT NOT NULL);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT,
      subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT, request_id TEXT,
      ip_hash TEXT, created_at INTEGER);
    INSERT INTO users VALUES ('admin','active'),('other','active'),('inactive','disabled'),('customer','active');
    INSERT INTO user_roles VALUES ('admin','super_admin'),('other','admin'),('inactive','super_admin');
  `);
  const migration = await readFile(new URL('../drizzle/0056_form_catalog.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
  const database = new Database(sqlite);
  return { sqlite, db: database as unknown as D1Database, database };
}

function auditCount(sqlite: DatabaseSync) {
  return Number((sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get() as { count: number }).count);
}

function seedPublished(sqlite: DatabaseSync, id: string, version: number, fields: unknown[]) {
  sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
     updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?,?,?,1,'published',?,'Seed history','admin',1,'admin',1,'admin',1,?)`)
    .run(id, formId, version, JSON.stringify({ formId, fields }), `seed-${id}`);
}

function seedDraft(sqlite: DatabaseSync, id: string, version: number, fields: unknown[]) {
  sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
     updated_by,updated_at,last_request_id)
    VALUES (?,?,?,1,'draft',?,'Seed draft','admin',1,'admin',1,?)`)
    .run(id, formId, version, JSON.stringify({ formId, fields }), `seed-${id}`);
}

function seedRawConfig(sqlite: DatabaseSync, id: string, version: number, status: 'draft' | 'published', config: unknown) {
  sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
     updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?,?,?,?,?,?,'Seed config','admin',1,'admin',1,?,?,?)`)
    .run(id, formId, version, 1, status, JSON.stringify(config),
      status === 'published' ? 'admin' : null, status === 'published' ? 1 : null, `seed-${id}`);
}

const storedFailure = (error: unknown) => error instanceof Error && error.name === 'FormCatalogStoredConfigError';

void test('draft creation rejects parseable invalid published history before writing version or audit', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedRawConfig(sqlite, 'wrong-history', 1, 'published', { formId: 'wrong.form', fields: [] });
    await assert.rejects(() => saveFormDraft(db, { formId, ...actor, expectedPublishedVersion: 1,
      config: emptyConfig, reason: 'New draft', requestId: 'wrong-history-draft', now: 10 }), storedFailure);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM form_config_versions').get()?.count, 1);
    assert.equal(auditCount(sqlite), 0);
  } finally { sqlite.close(); }
});

void test('publish rejects a parseable invalid stored draft before changing status or auditing', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedRawConfig(sqlite, 'wrong-draft', 1, 'draft', { formId: 'wrong.form', fields: [] });
    await assert.rejects(() => publishFormDraft(db, { formId, ...actor, draftId: 'wrong-draft',
      expectedDraftRevision: 1, expectedPublishedVersion: 0, reason: 'Publish draft',
      requestId: 'wrong-draft-publish', now: 11 }), storedFailure);
    assert.equal(sqlite.prepare('SELECT status FROM form_config_versions WHERE id = ?').get('wrong-draft')?.status, 'draft');
    assert.equal(auditCount(sqlite), 0);
  } finally { sqlite.close(); }
});

void test('restore rejects an invalid source or historical config without publishing or auditing', async () => {
  for (const badVersion of [1, 2]) {
    const { sqlite, db } = await fixture();
    try {
      seedRawConfig(sqlite, 'source', 1, 'published', badVersion === 1 ? { formId: 'wrong.form', fields: [] } : emptyConfig);
      seedRawConfig(sqlite, 'history', 2, 'published', badVersion === 2 ? { formId: 'wrong.form', fields: [] } : emptyConfig);
      await assert.rejects(() => restoreFormVersion(db, { formId, ...actor, sourceVersion: 1,
        expectedPublishedVersion: 2, reason: 'Restore', requestId: `bad-restore-${badVersion}`, now: 12 }), storedFailure);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM form_config_versions').get()?.count, 2);
      assert.equal(auditCount(sqlite), 0);
    } finally { sqlite.close(); }
  }
});

function field(id: string, type = 'single_choice', label = 'Original question', status = 'active') {
  return { id, key: id, type, label, required: false, order: 0, status,
    ...(type === 'single_choice' ? { choices: [{ value: 'yes', label: 'Original yes' }, { value: 'no', label: 'Original no' }] } : {}) };
}

void test('draft edits require the current revision and preserve the winning actor, reason, and request audit', async () => {
  const { sqlite, db } = await fixture();
  try {
    const first = await saveFormDraft(db, { formId, ...actor, expectedPublishedVersion: 0,
      config: emptyConfig, reason: 'Start draft', requestId: 'draft-1', now: 10 });
    assert.equal(first.revision, 1);
    assert.equal(first.version, 1);
    const edit = await saveFormDraft(db, { formId, ...actor, draftId: first.id,
      expectedDraftRevision: 1, expectedPublishedVersion: 0, config: emptyConfig,
      reason: 'Review draft', requestId: 'draft-2', now: 20 });
    assert.equal(edit.revision, 2);
    await assert.rejects(() => saveFormDraft(db, { formId, ...actor, draftId: first.id,
      expectedDraftRevision: 1, expectedPublishedVersion: 0, config: emptyConfig,
      reason: 'Stale edit', requestId: 'draft-stale', now: 21 }));
    assert.equal(auditCount(sqlite), 2);
    const row = sqlite.prepare('SELECT updated_by,reason,last_request_id FROM form_config_versions WHERE id=?').get(first.id);
    assert.deepEqual({ ...row }, { updated_by: 'admin', reason: 'Review draft', last_request_id: 'draft-2' });
    const logs = sqlite.prepare('SELECT actor_id,reason,request_id FROM audit_logs ORDER BY created_at').all();
    assert.deepEqual(logs.map((item) => ({ ...item })), [
      { actor_id: 'admin', reason: 'Start draft', request_id: 'draft-1' },
      { actor_id: 'admin', reason: 'Review draft', request_id: 'draft-2' },
    ]);
  } finally { sqlite.close(); }
});

void test('publish rejects stale draft and published versions, including competing publishers', async () => {
  const { sqlite, db } = await fixture();
  try {
    const draft = await saveFormDraft(db, { formId, ...actor, expectedPublishedVersion: 0,
      config: emptyConfig, reason: 'Start draft', requestId: 'p-draft', now: 10 });
    await assert.rejects(() => publishFormDraft(db, { formId, ...actor, draftId: draft.id,
      expectedDraftRevision: 2, expectedPublishedVersion: 0, reason: 'Wrong revision', requestId: 'p-stale', now: 20 }));
    const published = await publishFormDraft(db, { formId, ...actor, draftId: draft.id,
      expectedDraftRevision: 1, expectedPublishedVersion: 0, reason: 'Publish first', requestId: 'p-first', now: 21 });
    assert.equal(published.status, 'published');
    assert.equal(published.version, 1);
    assert.equal(published.publishedBy, 'admin');
    await assert.rejects(() => publishFormDraft(db, { formId, ...actor, draftId: draft.id,
      expectedDraftRevision: 1, expectedPublishedVersion: 0, reason: 'Competing publish', requestId: 'p-compete', now: 22 }));
    await assert.rejects(() => saveFormDraft(db, { formId, ...actor, expectedPublishedVersion: 0,
      config: emptyConfig, reason: 'Old published', requestId: 'p-old', now: 23 }));
    assert.equal(auditCount(sqlite), 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM form_config_versions WHERE status='published'").get()?.count, 1);
  } finally { sqlite.close(); }
});

void test('repository rechecks stored active Super Admin role and keeps repeat requests idempotent', async () => {
  const { sqlite, db } = await fixture();
  try {
    for (const actorId of ['other', 'inactive', 'customer']) {
      await assert.rejects(() => saveFormDraft(db, { formId, actorId, actorRole: 'super_admin',
        expectedPublishedVersion: 0, config: emptyConfig, reason: 'Claim privilege',
        requestId: `claim-${actorId}`, now: 10 }));
    }
    const input = { formId, ...actor, expectedPublishedVersion: 0, config: emptyConfig,
      reason: 'Safe draft', requestId: 'retry-draft', now: 11 };
    const first = await saveFormDraft(db, input);
    assert.equal((await saveFormDraft(db, input)).id, first.id);
    assert.equal(auditCount(sqlite), 1);
    await assert.rejects(() => saveFormDraft(db, { ...input, reason: 'Different operation' }));
    sqlite.exec("UPDATE users SET status='disabled' WHERE id='admin'");
    await assert.rejects(() => saveFormDraft(db, input));
    await assert.rejects(() => publishFormDraft(db, { formId, ...actor, draftId: first.id,
      expectedDraftRevision: 1, expectedPublishedVersion: 0, reason: 'Publish disabled',
      requestId: 'disabled-publish', now: 12 }));
    assert.equal(auditCount(sqlite), 1);
  } finally { sqlite.close(); }
});

void test('restore publishes a new version and never edits the source publication', async () => {
  const { sqlite, db } = await fixture();
  try {
    const initial = await saveFormDraft(db, { formId, ...actor, expectedPublishedVersion: 0,
      config: emptyConfig, reason: 'Initial', requestId: 'restore-d1', now: 10 });
    await publishFormDraft(db, { formId, ...actor, draftId: initial.id, expectedDraftRevision: 1,
      expectedPublishedVersion: 0, reason: 'First publish', requestId: 'restore-p1', now: 11 });
    const second = await saveFormDraft(db, { formId, ...actor, expectedPublishedVersion: 1,
      config: emptyConfig, reason: 'Second', requestId: 'restore-d2', now: 12 });
    await publishFormDraft(db, { formId, ...actor, draftId: second.id, expectedDraftRevision: 1,
      expectedPublishedVersion: 1, reason: 'Second publish', requestId: 'restore-p2', now: 13 });
    const restored = await restoreFormVersion(db, { formId, ...actor, sourceVersion: 1,
      expectedPublishedVersion: 2, reason: 'Restore original', requestId: 'restore-r3', now: 14 });
    assert.equal(restored.version, 3);
    assert.notEqual(restored.id, initial.id);
    assert.equal(restored.status, 'published');
    assert.equal(sqlite.prepare('SELECT published_at FROM form_config_versions WHERE id=?').get(initial.id)?.published_at, 11);
    assert.equal((await restoreFormVersion(db, { formId, ...actor, sourceVersion: 1,
      expectedPublishedVersion: 2, reason: 'Restore original', requestId: 'restore-r3', now: 14 })).id, restored.id);
    await assert.rejects(() => restoreFormVersion(db, { formId, ...actor, sourceVersion: 2,
      expectedPublishedVersion: 2, reason: 'Restore original', requestId: 'restore-r3', now: 14 }));
    await assert.rejects(() => restoreFormVersion(db, { formId, ...actor, sourceVersion: 1,
      expectedPublishedVersion: 2, reason: 'Stale restore', requestId: 'restore-stale', now: 15 }));
    assert.equal(auditCount(sqlite), 5);
  } finally { sqlite.close(); }
});

void test('restore makes an older draft stale and later saves allocate above the restoration', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedPublished(sqlite, 'published-1', 1, []);
    seedDraft(sqlite, 'old-draft', 2, []);
    const restored = await restoreFormVersion(db, { formId, ...actor, sourceVersion: 1,
      expectedPublishedVersion: 1, reason: 'Restore baseline', requestId: 'restore-over-draft', now: 30 });
    assert.equal(restored.version, 3);
    const auditBefore = auditCount(sqlite);
    await assert.rejects(() => publishFormDraft(db, { formId, ...actor, draftId: 'old-draft',
      expectedDraftRevision: 1, expectedPublishedVersion: 3, reason: 'Publish old draft',
      requestId: 'publish-obsolete', now: 31 }), /changed|permitted/i);
    await assert.rejects(() => saveFormDraft(db, { formId, ...actor, draftId: 'old-draft',
      expectedDraftRevision: 1, expectedPublishedVersion: 3, config: emptyConfig,
      reason: 'Edit old draft', requestId: 'save-obsolete', now: 32 }), /changed|permitted/i);
    assert.equal(sqlite.prepare('SELECT status FROM form_config_versions WHERE id = ?').get('old-draft')?.status, 'draft');
    assert.equal(auditCount(sqlite), auditBefore);
    const next = await saveFormDraft(db, { formId, ...actor, expectedPublishedVersion: 3,
      config: emptyConfig, reason: 'Edit restored form', requestId: 'save-after-restore', now: 33 });
    assert.equal(next.version, 4);
    assert.equal(next.status, 'draft');
  } finally { sqlite.close(); }
});

void test('restore retry replays its audited version across draft gaps and rejects changed request inputs', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedPublished(sqlite, 'published-1', 1, []);
    seedDraft(sqlite, 'draft-2', 2, []);
    sqlite.exec("INSERT INTO user_roles VALUES ('other','super_admin')");
    const input = { formId, ...actor, sourceVersion: 1, expectedPublishedVersion: 1,
      reason: 'Restore baseline', requestId: 'restore-gap-retry', now: 30 };
    const restored = await restoreFormVersion(db, input);
    assert.equal(restored.version, 3);
    // A later allocation must not change which immutable result this request returns.
    seedDraft(sqlite, 'draft-4', 4, []);
    assert.deepEqual(await restoreFormVersion(db, { ...input, now: 40 }), restored);
    for (const change of [{ sourceVersion: 3 }, { expectedPublishedVersion: 2 },
      { reason: 'Different reason' }, { formId: 'account.address' }, { actorId: 'other' }]) {
      await assert.rejects(() => restoreFormVersion(db, { ...input, ...change }), /Request ID was already used/);
    }
    await assert.rejects(() => publishFormDraft(db, { ...input, draftId: restored.id,
      expectedDraftRevision: 1 }), /Request ID was already used/, 'a restore ID cannot replay a publish action');
    await assert.rejects(() => saveFormDraft(db, { ...input, config: emptyConfig }), /Request ID was already used/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM form_config_versions').get()?.count, 4);
    assert.equal(auditCount(sqlite), 1);
  } finally { sqlite.close(); }
});

void test('a restore request ID cannot be replayed as a publish action', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedPublished(sqlite, 'published-1', 1, []);
    const input = { formId, ...actor, sourceVersion: 1, expectedPublishedVersion: 1,
      reason: 'Restore baseline', requestId: 'restore-not-publish', now: 30 };
    const restored = await restoreFormVersion(db, input);
    await assert.rejects(() => publishFormDraft(db, { ...input, draftId: restored.id,
      expectedDraftRevision: 1 }), /Request ID was already used/);
    assert.equal(auditCount(sqlite), 1);
  } finally { sqlite.close(); }
});

void test('historical field identity cannot be repurposed by restored publications', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedPublished(sqlite, 'history-1', 1, [field('review_answer', 'short_text')]);
    seedPublished(sqlite, 'history-2', 2, [field('review_answer', 'number')]);
    await assert.rejects(() => restoreFormVersion(db, { formId, ...actor, sourceVersion: 1,
      expectedPublishedVersion: 2, reason: 'Conflicting identity', requestId: 'identity-restore', now: 20 }),
    storedFailure);
    assert.equal(auditCount(sqlite), 0);
  } finally { sqlite.close(); }
});

void test('draft edit rolls back when another draft introduces a historical field during the write', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    const draft = await saveFormDraft(db, { formId, ...actor, expectedPublishedVersion: 0,
      config: emptyConfig, reason: 'Initial empty draft', requestId: 'history-race-1', now: 10 });
    database.beforeBatch = () => seedDraft(sqlite, 'concurrent-draft', 2, [field('review_answer', 'short_text')]);
    await assert.rejects(() => saveFormDraft(db, { formId, ...actor, draftId: draft.id,
      expectedDraftRevision: 1, expectedPublishedVersion: 0, config: emptyConfig,
      reason: 'Stale history', requestId: 'history-race-2', now: 11 }));
    assert.equal(sqlite.prepare('SELECT revision FROM form_config_versions WHERE id=?').get(draft.id)?.revision, 1);
    assert.equal(auditCount(sqlite), 1);
  } finally { sqlite.close(); }
});

void test('answer insert is deferred, atomic with parent write, unique per form/request, and subject scoped', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedPublished(sqlite, 'answers-v1', 1, [field('review_answer')]);
    sqlite.exec('CREATE TABLE parent_actions(id TEXT PRIMARY KEY)');
    const answers = { formId, version: 1, answers: [{ fieldId: 'review_answer', label: 'Original question',
      type: 'single_choice' as const, value: 'yes', choiceLabels: ['Original yes'] }] };
    const insert = buildFormAnswerInsert(db, { formId, requestId: 'answer-1', versionId: 'answers-v1',
      subjectType: 'customer_profile', subjectId: 'profile-1', actorId: 'customer', answers, now: 30 });
    assert.equal(typeof (insert as unknown as { then?: unknown }).then, 'undefined');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get()?.count, 0);
    await db.batch([db.prepare('INSERT INTO parent_actions(id) VALUES (?)').bind('parent-1'), insert]);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get()?.count, 1);
    const duplicate = buildFormAnswerInsert(db, { formId, requestId: 'answer-1', versionId: 'answers-v1',
      subjectType: 'customer_profile', subjectId: 'profile-1', actorId: 'customer', answers, now: 31 });
    await assert.rejects(() => db.batch([db.prepare('INSERT INTO parent_actions(id) VALUES (?)').bind('parent-2'), duplicate]));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM parent_actions WHERE id='parent-2'").get()?.count, 0);
    const other = buildFormAnswerInsert(db, { formId, requestId: 'answer-2', versionId: 'answers-v1',
      subjectType: 'customer_profile', subjectId: 'profile-2', actorId: 'customer', answers, now: 31 });
    await db.batch([other]);
    const another = buildFormAnswerInsert(db, { formId, requestId: 'answer-3', versionId: 'answers-v1',
      subjectType: 'customer_profile', subjectId: 'profile-1', actorId: 'customer', answers, now: 32 });
    await db.batch([another]);
    seedPublished(sqlite, 'answers-v2', 2, [field('review_answer', 'single_choice', 'Edited question', 'archived')]);
    const listed = await listFormAnswersForSubject(db, 'customer_profile', 'profile-1');
    assert.deepEqual(listed.map((item) => item.requestId), ['answer-1', 'answer-3']);
    assert.equal(listed[0].answers.answers[0].label, 'Original question');
    assert.equal(listed[0].answers.answers[0].type, 'single_choice');
    assert.deepEqual(listed[0].answers.answers[0].choiceLabels, ['Original yes']);
    assert.equal((await listFormAnswersForSubject(db, 'customer_profile', 'profile-2')).length, 1);
  } finally { sqlite.close(); }
});

void test('required built-in fields stay in the parent record and need no answer snapshot entry', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedPublished(sqlite, 'built-in-v1', 1, [{ ...field('name', 'short_text', 'Your name'), required: true }]);
    sqlite.exec('CREATE TABLE parent_actions(id TEXT PRIMARY KEY)');
    const insert = buildFormAnswerInsert(db, { formId, requestId: 'built-in-answer', versionId: 'built-in-v1',
      subjectType: 'customer_profile', subjectId: 'profile-1', actorId: 'customer',
      answers: { formId, version: 1, answers: [] }, now: 40 });
    await db.batch([db.prepare('INSERT INTO parent_actions(id) VALUES (?)').bind('profile-1'), insert]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM parent_actions WHERE id='profile-1'").get()?.count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='built-in-answer'").get()?.count, 1);
  } finally { sqlite.close(); }
});

void test('required custom fields still need a snapshot entry', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedPublished(sqlite, 'custom-required-v1', 1, [{ ...field('public_note', 'short_text'), required: true }]);
    sqlite.exec('CREATE TABLE parent_actions(id TEXT PRIMARY KEY)');
    const insert = buildFormAnswerInsert(db, { formId, requestId: 'custom-required-answer', versionId: 'custom-required-v1',
      subjectType: 'customer_profile', subjectId: 'profile-1', actorId: 'customer',
      answers: { formId, version: 1, answers: [] }, now: 40 });
    await assert.rejects(() => db.batch([db.prepare('INSERT INTO parent_actions(id) VALUES (?)').bind('profile-1'), insert]));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM parent_actions').get()?.count, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get()?.count, 0);
  } finally { sqlite.close(); }
});

void test('non-choice answers reject choice-label metadata', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedPublished(sqlite, 'text-v1', 1, [field('public_note', 'short_text')]);
    const answers = { formId, version: 1, answers: [{ fieldId: 'public_note', label: 'Original question',
      type: 'short_text' as const, value: 'A note', choiceLabels: ['Not a choice'] }] };
    assert.throws(() => buildFormAnswerInsert(db, { formId, requestId: 'text-with-choice-labels', versionId: 'text-v1',
      subjectType: 'customer_profile', subjectId: 'profile-1', actorId: 'customer',
      answers, now: 40 }));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get()?.count, 0);
  } finally { sqlite.close(); }
});

void test('answer boundary rejects cross-form, unpublished, mismatched and sensitive snapshots', async () => {
  const { sqlite, db } = await fixture();
  try {
    seedPublished(sqlite, 'safe-v1', 1, [field('review_answer')]);
    sqlite.prepare(`INSERT INTO form_config_versions
      (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,last_request_id)
      VALUES ('pending','account.review',1,1,'draft','{"formId":"account.review","fields":[]}',
        'Pending','admin',1,'admin',1,'pending-request')`).run();
    const base = { formId, requestId: 'unsafe', versionId: 'safe-v1', subjectType: 'customer_profile',
      subjectId: 'profile-1', actorId: 'customer', now: 40 };
    const safe = { formId, version: 1, answers: [{ fieldId: 'review_answer', label: 'Original question',
      type: 'single_choice' as const, value: 'yes', choiceLabels: ['Original yes'] }] };
    for (const answers of [
      { ...safe, answers: [{ ...safe.answers[0], fieldId: 'password' }] },
      { ...safe, answers: [{ ...safe.answers[0], label: 'Payment token' }] },
      { ...safe, answers: [{ ...safe.answers[0], type: 'short_text' }] },
      { ...safe, answers: [{ ...safe.answers[0], value: 'unlisted' }] },
      { ...safe, answers: [{ ...safe.answers[0], choiceLabels: ['Altered yes'] }] },
      { ...safe, answers: [{ ...safe.answers[0], paymentCredential: 'secret' }] },
    ]) await assert.rejects(async () => db.batch([buildFormAnswerInsert(db, { ...base, answers: answers as FormAnswerSnapshot })]));
    await assert.rejects(async () => db.batch([buildFormAnswerInsert(db, { ...base, formId: 'account.review', answers: { ...safe, formId: 'account.review' } })]));
    await assert.rejects(async () => db.batch([buildFormAnswerInsert(db, { ...base, versionId: 'pending', answers: { formId: 'account.review', version: 1, answers: [] } })]));
    seedPublished(sqlite, 'unsafe-choices-v2', 2, [
      { ...field('review_answer'), choices: [{ value: 'yes', label: 'Payment token' }, { value: 'no', label: 'No' }] },
    ]);
    await assert.rejects(async () => db.batch([buildFormAnswerInsert(db, { ...base, versionId: 'unsafe-choices-v2',
      answers: { formId, version: 2, answers: [{ fieldId: 'review_answer', label: 'Original question',
        type: 'single_choice', value: 'yes' }] } })]));
    seedPublished(sqlite, 'email-v3', 3, [field('contact_email', 'email')]);
    await assert.rejects(async () => db.batch([buildFormAnswerInsert(db, { ...base,
      versionId: 'email-v3', answers: { formId, version: 3, answers: [{ fieldId: 'contact_email',
        label: 'Original question', type: 'email', value: 'invalid-email' }] } })]));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get()?.count, 0);
  } finally { sqlite.close(); }
});
