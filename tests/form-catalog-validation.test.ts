import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { FormDefinition, ConfiguredField } from '../lib/forms/types';
import { validateFormDraft, validateFormDraftForDefinition, validateAnswersForDefinition, FormValidationError } from '../lib/forms/validation';
import { resolvePublishedForm, validateSubmittedForm, FormRuntimeError } from '../lib/forms/runtime';

const definition: FormDefinition = {
  id: 'test.safe', audience: 'public', mode: 'collection', route: '/test', adapterId: 'test-safe',
  baseFields: [{ key: 'password', type: 'existing', label: 'Password', capability: 'protected', explanation: 'Credential' },
    { key: 'heading', type: 'existing', label: 'Heading', capability: 'display_editable', explanation: 'Display only' }],
  capabilities: { explanation: 'Test adapter records safe answers.', customFieldTypes: ['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone'], answerBehavior: 'record' },
};
const field = (id: string, type: ConfiguredField['type'], extra: Record<string, unknown> = {}) => ({ id, key: id, type, label: id, required: true, order: 0, status: 'active', ...extra });
const draft = (fields: unknown[]) => ({ formId: definition.id, fields });
const answer = (id: string, value: unknown) => [{ fieldId: id, value }];
const errorCode = (code: string) => (error: unknown) => error instanceof FormValidationError && error.code === code;

for (const [type, value] of [
  ['short_text', 'Ada'], ['long_text', 'Long note'], ['number', 3.5], ['date', '2026-09-27'],
  ['single_choice', 'one'], ['multiple_choice', ['one', 'two']], ['checkbox', true],
  ['email', 'ada@example.test'], ['phone', '+9779812345678'],
] as const) {
  void test(`${type} accepts a valid answer and snapshots only the configured value`, () => {
    const config = validateFormDraftForDefinition(definition, draft([field('safe', type, type.includes('choice') ? { choices: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }] } : {})]));
    assert.deepEqual(validateAnswersForDefinition(definition, { ...config, version: 2, publishedAt: 123 }, answer('safe', value)),
      { formId: definition.id, version: 2, answers: [{ fieldId: 'safe', label: 'safe', type, value }] });
  });
}

for (const [name, fields] of [
  ['nonobject', null], ['missing fields', {}], ['unknown property', { formId: 'test.safe', fields: [], extra: true }],
  ['wrong form', { formId: 'other', fields: [] }], ['unknown type', draft([field('x', 'file' as ConfiguredField['type'])])],
  ['duplicate id', draft([field('x', 'short_text'), field('x', 'short_text')])],
  ['duplicate key', draft([field('x', 'short_text'), { ...field('y', 'short_text'), key: 'x' }])],
  ['mutable key', draft([{ ...field('x', 'short_text'), key: 'renamed' }])],
  ['protected name', draft([field('password', 'short_text')])],
  ['credential alias', draft([field('accessToken', 'short_text')])],
  ['credential label', draft([field('public_note', 'short_text', { label: 'Password' })])],
  ['otp alias', draft([field('one_time_code', 'short_text')])],
  ['payment alias', draft([field('cardCvv', 'short_text')])],
  ['anti abuse alias', draft([field('captchaResponse', 'short_text')])],
  ['duplicate choice', draft([field('x', 'single_choice', { choices: [{ value: 'a', label: 'A' }, { value: 'a', label: 'Again' }] })])],
  ['oversized label', draft([field('x', 'short_text', { label: 'x'.repeat(201) })])],
  ['too many fields', draft(Array.from({ length: 65 }, (_, i) => field(`f${i}`, 'short_text')))],
] as const) {
  void test(`draft rejects ${name}`, () => assert.throws(() => validateFormDraftForDefinition(definition, fields), errorCode('invalid_draft')));
}

void test('unknown and pending form IDs fail closed', () => {
  assert.throws(() => validateFormDraft('invented.form', { formId: 'invented.form', fields: [] }), errorCode('unknown_form'));
  assert.throws(() => validateFormDraft('account.profile', { formId: 'account.profile', fields: [field('note', 'short_text')] }), errorCode('adapter_unavailable'));
});

for (const [name, raw] of [
  ['missing required', []], ['unknown field', answer('unknown', 'value')],
  ['duplicate field', [...answer('safe', 'one'), ...answer('safe', 'two')]],
  ['object payload', { safe: 'one' }], ['protected built in', answer('password', 'secret')],
  ['too long', answer('safe', 'x'.repeat(501))], ['wrong type', answer('safe', 4)],
] as const) {
  void test(`answers reject ${name}`, () => {
    const config = { ...validateFormDraftForDefinition(definition, draft([field('safe', 'short_text')])), version: 1, publishedAt: 1 };
    assert.throws(() => validateAnswersForDefinition(definition, config, raw), errorCode('invalid_answer'));
  });
}

for (const [type, value] of [
  ['number', Number.POSITIVE_INFINITY], ['date', '2026-02-30'], ['single_choice', 'three'],
  ['multiple_choice', ['one', 'one']], ['multiple_choice', []], ['checkbox', 'yes'],
  ['email', 'invalid'], ['phone', 'not-a-phone'],
] as const) {
  void test(`${type} rejects invalid value`, () => {
    const options = type.includes('choice') ? { choices: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }] } : {};
    const config = { ...validateFormDraftForDefinition(definition, draft([field('safe', type, options)])), version: 1, publishedAt: 1 };
    assert.throws(() => validateAnswersForDefinition(definition, config, answer('safe', value)), errorCode('invalid_answer'));
  });
}

void test('optional empty values stay out of the snapshot', () => {
  const config = { ...validateFormDraftForDefinition(definition, draft([field('safe', 'short_text', { required: false })])), version: 1, publishedAt: 1 };
  assert.deepEqual(validateAnswersForDefinition(definition, config, answer('safe', '')), { formId: 'test.safe', version: 1, answers: [] });
});

void test('display edits need an adapter and cannot change protected fields', () => {
  const edit = draft([field('heading', 'short_text')]);
  assert.throws(() => validateFormDraftForDefinition(definition, edit), errorCode('invalid_draft'));
  assert.throws(() => validateFormDraftForDefinition(definition, draft([field('password', 'short_text')])), errorCode('invalid_draft'));
});

void test('an adapter grant permits a display edit but never snapshots its value', () => {
  const config = { ...validateFormDraftForDefinition(definition, draft([field('heading', 'short_text')]), true), version: 1, publishedAt: 1 };
  assert.deepEqual(validateAnswersForDefinition(definition, config, answer('heading', 'Visible')), { formId: 'test.safe', version: 1, answers: [] });
});

function database(rows: { version: number; config_json: string; published_at: number }[]) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE form_config_versions(form_id TEXT,status TEXT,version INTEGER,config_json TEXT,published_at INTEGER)');
  for (const row of rows) sqlite.prepare('INSERT INTO form_config_versions VALUES (?,?,?,?,?)').run('account.profile', 'published', row.version, row.config_json, row.published_at);
  const db = { prepare(sql: string) { const stmt = sqlite.prepare(sql); return { bind(...params: string[]) { return { async first<T>() { return (stmt.get(...params) as T | undefined) ?? null; } }; } }; } } as unknown as D1Database;
  return { db, sqlite };
}

void test('resolution selects the highest published version', async () => {
  const { db, sqlite } = database([{ version: 1, config_json: '{"formId":"account.profile","fields":[]}', published_at: 1 }, { version: 2, config_json: '{"formId":"account.profile","fields":[]}', published_at: 2 }]);
  try { assert.equal((await resolvePublishedForm(db, 'account.profile')).version, 2); } finally { sqlite.close(); }
});

for (const [name, db] of [
  ['missing store', undefined], ['read failure', { prepare() { throw new Error('db down'); } }],
] as const) {
  void test(`${name} is retryable and fails closed`, async () => {
    await assert.rejects(resolvePublishedForm(db as unknown as D1Database, 'account.profile'), (error: unknown) => error instanceof FormRuntimeError && error.code === 'config_unavailable' && error.retryable);
  });
}

void test('malformed published JSON is retryable and cannot bypass validation', async () => {
  const { db, sqlite } = database([{ version: 1, config_json: '{"fields":42}', published_at: 1 }]);
  try { await assert.rejects(resolvePublishedForm(db, 'account.profile'), (error: unknown) => error instanceof FormRuntimeError && error.code === 'config_unavailable'); } finally { sqlite.close(); }
});

void test('stale submitted version is a typed conflict', async () => {
  const { db, sqlite } = database([{ version: 2, config_json: '{"formId":"account.profile","fields":[]}', published_at: 2 }]);
  try { await assert.rejects(validateSubmittedForm(db, 'account.profile', 1, []), (error: unknown) => error instanceof FormRuntimeError && error.code === 'stale_version' && !error.retryable); } finally { sqlite.close(); }
});
