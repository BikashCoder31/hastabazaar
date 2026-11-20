import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { buildFormAnswerInsert, listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import type { ConfiguredField, FormAnswerSnapshot } from '../lib/forms/types';
import { compatibilityRevocationId } from '../lib/forms/compatibility';

const formId = 'account.profile';

void test('native D1 rolls back a compatible submission when its preceding version is revoked before commit', async () => {
  const { mf, db } = await fixture('compatible-form-answer-test');
  try {
    const selectedForm = 'seller.profile';
    const fields = [{ id: 'packing_note', key: 'packing_note', type: 'short_text', label: 'Packing note', required: false, order: 1, status: 'active' }];
    for (const version of [1, 2]) {
      await db.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES(?,?,?,1,'published',?,'Native fixture','customer',1,'customer',1,'customer',1,?)`)
        .bind(`native-compat-${version}`, selectedForm, version, JSON.stringify({ formId: selectedForm, fields }), `native-compat-publish-${version}`).run();
    }
    const statement = (requestId: string) => buildFormAnswerInsert(db, { formId: selectedForm, requestId, versionId: 'native-compat-2',
      subjectType: 'seller_profile', subjectId: 'fictional-seller', actorId: 'customer', now: 2,
      answers: { formId: selectedForm, version: 2, presentedVersion: 1, answers: [{ fieldId: 'packing_note', type: 'short_text', label: 'Packing note', value: 'Keep upright' }] } });
    await db.batch([db.prepare("UPDATE users SET display_name='Saved compatible' WHERE id='customer'"), statement('native-compatible-committed')]);
    const pending = statement('native-compatible-pending');
    await db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at) VALUES(?,'customer','form.compatibility.revoked','form_configuration','native-compat-2','{}',2)")
      .bind(compatibilityRevocationId(selectedForm, 2)).run();
    await assert.rejects(db.batch([db.prepare("UPDATE users SET display_name='Must roll back' WHERE id='customer'"), pending]));
    assert.equal((await db.prepare("SELECT display_name name FROM users WHERE id='customer'").first<{name:string}>())?.name, 'Saved compatible');
    const history = await listFormAnswersForSubject(db, 'seller_profile', 'fictional-seller');
    assert.equal(history.length, 1);
    assert.equal(history[0].answers.presentedVersion, 1);
  } finally { await mf.dispose(); }
});

void test('native D1 preserves core-only history without configuration writes and rejects a publication race atomically', async () => {
  const { mf, db } = await fixture('core-form-answer-test');
  try {
    const coreInsert = (requestId: string) => buildFormAnswerInsert(db, {
      formId: 'seller.profile', versionId: 'core:seller.profile:1', requestId,
      subjectType: 'seller_profile', subjectId: 'fictional-seller', actorId: 'customer', now: 1,
      answers: { formId: 'seller.profile', version: 1, answers: [] },
    });
    await db.batch([db.prepare("UPDATE users SET display_name='Saved core' WHERE id='customer'"), coreInsert('core-native')]);
    assert.equal((await listFormAnswersForSubject(db, 'seller_profile', 'fictional-seller'))[0].versionId, 'core:seller.profile:1');
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM form_config_versions').first<{n:number}>())?.n, 0);
    await assert.rejects(db.prepare("UPDATE audit_logs SET next_json='{}' WHERE action='form.core_answers'").run(), /core_form_receipt_immutable/);
    await assert.rejects(db.prepare("DELETE FROM audit_logs WHERE action='form.core_answers'").run(), /core_form_receipt_retained/);
    await db.prepare("UPDATE audit_logs SET actor_id=NULL WHERE action='form.core_answers'").run();
    assert.equal((await listFormAnswersForSubject(db, 'seller_profile', 'fictional-seller'))[0].actorId, null);
    const raced = coreInsert('core-native-race');
    await db.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES('seller-config','seller.profile',1,1,'published','{"formId":"seller.profile","fields":[]}','Fixture','customer',1,'customer',1,'customer',1,'native-publish')`).run();
    await assert.rejects(db.batch([db.prepare("UPDATE users SET display_name='Must roll back' WHERE id='customer'"), raced]));
    assert.equal((await db.prepare("SELECT display_name name FROM users WHERE id='customer'").first<{name:string}>())?.name, 'Saved core');
  } finally { await mf.dispose(); }
});
type Snapshot = Omit<FormAnswerSnapshot, 'answers'> & {
  answers: readonly (FormAnswerSnapshot['answers'][number] & { choiceLabels?: readonly string[] })[];
};

async function fixture(id: string) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default {fetch(){return new Response("ok")}}', d1Databases: { DB: id } }));
  try {
    const db = await mf.getD1Database('DB');
    await db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,display_name TEXT);');
    await db.exec('CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT NOT NULL,subject_type TEXT,subject_id TEXT,request_id TEXT,previous_json TEXT,next_json TEXT,created_at INTEGER);');
    for (const sql of readFileSync('drizzle/0081_core_form_receipt_retention.sql', 'utf8').split('--> statement-breakpoint'))
      if (sql.trim()) await db.prepare(sql).run();
    for (const sql of readFileSync('drizzle/0056_form_catalog.sql', 'utf8').split('--> statement-breakpoint'))
      if (sql.trim()) await db.prepare(sql).run();
    // Current answer writes name the canonical health columns. Apply only the
    // answer/load-observation DDL to this allocated disposable D1 database.
    for (const sql of readFileSync('drizzle/0151_form_health_records.sql', 'utf8').split('--> statement-breakpoint').slice(0, 4))
      if (sql.trim()) await db.prepare(sql).run();
    await db.prepare("INSERT INTO users VALUES ('customer','active','Old Name')").run();
    const publish = async (version: number, fields: readonly unknown[]) => db.prepare(`INSERT INTO form_config_versions
      (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,
        updated_at,published_by,published_at,last_request_id)
      VALUES (?,?,?,1,'published',?,'D1 fixture','customer',1,'customer',1,'customer',1,?)`)
      .bind(`profile-v${version}`, formId, version, JSON.stringify({ formId, fields }), `seed-${version}`).run();
    const batch = (requestId: string, answers: Snapshot, name = 'Forbidden') => [
      db.prepare('UPDATE users SET display_name=? WHERE id=?').bind(name, 'customer'),
      buildFormAnswerInsert(db, { formId, requestId, versionId: `profile-v${answers.version}`,
        subjectType: 'user', subjectId: 'customer', actorId: 'customer', answers, now: 10 }),
    ];
    const state = async () => ({
      name: (await db.prepare("SELECT display_name AS name FROM users WHERE id='customer'").first<{ name: string }>())?.name,
      count: (await db.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').first<{ count: number }>())?.count,
    });
    return { mf, db, publish, batch, state };
  } catch (error) { await mf.dispose(); throw error; }
}

function field(id: string, type: ConfiguredField['type'], extras: Partial<ConfiguredField> = {}): ConfiguredField {
  return { id, key: id, label: `Question ${id}`, type, required: true, order: 0, status: 'active', ...extras };
}

void test('real local D1 commits a valid answer with its parent and rolls both back on stale publication', async () => {
  const { mf, db, publish, batch, state } = await fixture('form-answer-expression-test');
  try {
    const question = field('qa_context', 'short_text');
    await publish(1, [question]);
    const answers: Snapshot = { formId, version: 1, answers: [{ fieldId: question.id,
      label: question.label, type: question.type, value: 'Fictional D1 answer' }] };
    await db.batch(batch('d1-current', answers, 'Updated'));
    assert.deepEqual(await state(), { name: 'Updated', count: 1 });
    await assert.rejects(db.batch(batch('d1-current', answers)));
    assert.deepEqual(await state(), { name: 'Updated', count: 1 });
    // Construct under v1, then publish before the native parent batch executes.
    const stale = batch('d1-stale', answers);
    await publish(2, [{ ...question, status: 'archived' }]);
    await assert.rejects(db.batch(stale));
    assert.deepEqual(await state(), { name: 'Updated', count: 1 });
    const history = await listFormAnswersForSubject(db, 'user', 'customer');
    assert.equal(history.length, 1);
    assert.deepEqual(history[0]?.answers, answers);
    assert.deepEqual(history[0]?.historicalFieldIds, ['qa_context']);
  } finally { await mf.dispose(); }
});

void test('real local D1 checks all safe types and rejects altered or incomplete snapshots atomically', async () => {
  const { mf, db, publish, batch, state } = await fixture('form-answer-types-test');
  try {
    const fields = [field('short_answer', 'short_text'), field('long_answer', 'long_text'),
      field('quantity', 'number', { min: 1, max: 10, integerOnly: true }), field('event_date', 'date'),
      field('single_answer', 'single_choice', { choices: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] }),
      field('multi_answer', 'multiple_choice', { choices: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] }),
      field('acknowledged', 'checkbox'), field('contact_email', 'email'), field('contact_phone', 'phone')];
    const values = ['Short answer', 'Long fictional answer', 4, '2026-09-28', 'yes', ['red', 'blue'], true,
      'fictional@example.test', '+9779800000000'];
    const answers: Snapshot = { formId, version: 1, answers: fields.map((question, index) => ({
      fieldId: question.id, label: question.label, type: question.type, value: values[index],
      ...(question.type === 'single_choice' ? { choiceLabels: ['Yes'] } :
        question.type === 'multiple_choice' ? { choiceLabels: ['Red', 'Blue'] } : {}),
    })) };
    await publish(1, fields);
    await db.batch(batch('all-types-current', answers, 'All types accepted'));
    assert.deepEqual(await state(), { name: 'All types accepted', count: 1 });
    const change = (fieldId: string, patch: Partial<Snapshot['answers'][number]>): Snapshot => ({ ...answers,
      answers: answers.answers.map((answer) => answer.fieldId === fieldId ? { ...answer, ...patch } : answer) });
    const invalid: [string, Snapshot][] = [
      ['label', change('short_answer', { label: 'Altered question' })],
      ['type', change('short_answer', { type: 'long_text' })],
      ['field', change('short_answer', { fieldId: 'unknown_answer' })],
      ['choice', change('single_answer', { value: 'unlisted' })],
      ['choice-label', change('single_answer', { choiceLabels: ['Altered yes'] })],
      ['choice-count', change('multi_answer', { choiceLabels: ['Red'] })],
      ['choice-order', change('multi_answer', { choiceLabels: ['Blue', 'Red'] })],
      ['minimum', change('quantity', { value: 0 })], ['maximum', change('quantity', { value: 11 })],
      ['integer', change('quantity', { value: 4.5 })], ['required-checkbox', change('acknowledged', { value: false })],
      ['missing-required', { ...answers, answers: answers.answers.filter((answer) => answer.fieldId !== 'short_answer') }],
    ];
    for (const [name, snapshot] of invalid) {
      await assert.rejects(db.batch(batch(`invalid-${name}`, snapshot)), name);
      assert.deepEqual(await state(), { name: 'All types accepted', count: 1 }, name);
    }
    await assert.rejects(async () => db.batch(batch('sensitive-answer', change('short_answer', { label: 'Password' }))));
    assert.deepEqual(await state(), { name: 'All types accepted', count: 1 });
  } finally { await mf.dispose(); }
});

void test('real local D1 preserves built-in exemptions and fails closed for unavailable or unsafe configured fields', async () => {
  const { mf, db, publish, batch, state } = await fixture('form-answer-builtins-test');
  try {
    const question = field('public_note', 'short_text');
    const answers: Snapshot = { formId, version: 1, answers: [{ fieldId: question.id,
      label: question.label, type: question.type, value: 'A fictional note' }] };
    await publish(1, [field('display_name', 'short_text', { key: 'displayName' }), question,
      field('optional_check', 'checkbox', { required: false })]);
    await db.batch(batch('built-in-exemption', { ...answers, answers: [...answers.answers,
      { fieldId: 'optional_check', label: 'Question optional_check', type: 'checkbox', value: false }] }, 'Built-in accepted'));
    assert.deepEqual(await state(), { name: 'Built-in accepted', count: 1 });
    for (const [index, altered] of [
      { ...question, label: null }, { ...question, type: null }, { ...question, status: null },
      { ...question, status: 'archived' },
    ].entries()) {
      const version = index + 2;
      await publish(version, [altered]);
      await assert.rejects(db.batch(batch(`invalid-config-${version}`, { ...answers, version })));
      assert.deepEqual(await state(), { name: 'Built-in accepted', count: 1 });
    }
    await publish(6, [field('choice_answer', 'single_choice', { choices: [{ value: 'yes', label: 'Payment token' }] })]);
    await assert.rejects(db.batch(batch('unsafe-choice', { formId, version: 6, answers: [{ fieldId: 'choice_answer',
      label: 'Question choice_answer', type: 'single_choice', value: 'yes' }] })));
    assert.deepEqual(await state(), { name: 'Built-in accepted', count: 1 });
    await publish(7, [{ ...field('acknowledged', 'checkbox'), required: null }]);
    await assert.rejects(db.batch(batch('unavailable-checkbox-required', { formId, version: 7, answers: [{
      fieldId: 'acknowledged', label: 'Question acknowledged', type: 'checkbox', value: false }] })));
    assert.deepEqual(await state(), { name: 'Built-in accepted', count: 1 });
  } finally { await mf.dispose(); }
});
