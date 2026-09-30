import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

import { listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';

type Actor = { userId: string } | null;
declare global {
  var profileTestActor: Actor;
  var profileTestDb: D1Database;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {get DB(){return globalThis.profileTestDb}}', shortCircuit: true };
    if (specifier === '@/lib/auth/customer') return { url: `data:text/javascript,
      export class CustomerAuthorizationError extends Error { constructor(message,status){super(message);this.status=status} }
      export async function requireCustomerApi(){const a=globalThis.profileTestActor;if(!a)throw new CustomerAuthorizationError('Authentication is required.',401);return a}`, shortCircuit: true };
    if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function useRouter(){return {refresh(){}}}', shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { const result = this.statement.run(...this.values); return { success: true, meta: { changes: Number(result.changes) }, results: [] }; }
}

class Database {
  failStatement: number | null = null;
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
      for (const [index, statement] of statements.entries()) {
        if (index === this.failStatement) throw new Error('Simulated batch write failure');
        results.push(await statement.run());
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

const requiredNote = { id: 'delivery_note', key: 'delivery_note', type: 'short_text', label: 'Where can we find you?', required: true, order: 0, status: 'active' };
const archivedNote = { ...requiredNote, status: 'archived', required: false };
const input = (requestId: string, formVersion = 1, customAnswers: unknown = [{ fieldId: 'delivery_note', value: 'By the blue gate' }]) => ({
  displayName: 'Asha Rai', phone: '9812345678', locale: 'en-NP', idempotencyKey: requestId, formVersion, customAnswers,
});
const count = (sqlite: DatabaseSync, table: string) => Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
const user = (sqlite: DatabaseSync, id = 'customer') => {
  const row = sqlite.prepare('SELECT display_name AS name, phone FROM users WHERE id = ?').get(id) as { name: string; phone: string | null };
  return { name: row.name, phone: row.phone };
};

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE users(id TEXT PRIMARY KEY, status TEXT NOT NULL, display_name TEXT NOT NULL, phone TEXT, locale TEXT, updated_at INTEGER);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT,
      subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT, request_id TEXT UNIQUE,
      ip_hash TEXT, created_at INTEGER);
    INSERT INTO users VALUES ('admin','active','Admin',NULL,'en-NP',1),('customer','active','Old Name',NULL,'en-NP',1),('other','active','Other Name',NULL,'en-NP',1),('inactive','disabled','Inactive',NULL,'en-NP',1);`);
  const migration = await readFile(new URL('../drizzle/0056_form_catalog.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
  const database = new Database(sqlite);
  globalThis.profileTestDb = database as unknown as D1Database;
  globalThis.profileTestActor = { userId: 'customer' };
  seedVersion(sqlite, 1, [requiredNote]);
  return { sqlite, database };
}

function seedVersion(sqlite: DatabaseSync, version: number, fields: unknown[]) {
  sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
     updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?, 'account.profile', ?, 1, 'published', ?, 'Seed profile', 'admin', 1, 'admin', 1, 'admin', 1, ?)`)
    .run(`profile-v${version}`, version, JSON.stringify({ formId: 'account.profile', fields }), `seed-profile-${version}`);
}

function request(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/account/profile', { method: 'PATCH', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

void test('profile form marks its adapter and blocks a submission until published config loads', async () => {
  const { ProfileForm } = await import('../components/account/profile-form');
  const html = renderToStaticMarkup(createElement(ProfileForm, { displayName: 'Asha Rai', phone: null }));
  assert.match(html, /data-form-id="account\.profile"/);
  assert.match(html, /Form configuration is loading/i);
  assert.match(html, /type="submit"[^>]*disabled/);
});

void test('profile adapter records a required answer and preserves its old label after archival', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    assert.equal(IMPLEMENTED_FORM_ADAPTERS['account.profile']?.route, '/api/account/profile');
    assert.equal(FORM_REGISTRY['account.profile'].capabilities.answerBehavior, 'record');
    assert.equal((await PATCH(request(input('profile-1')))).status, 200);
    assert.deepEqual(user(sqlite), { name: 'Asha Rai', phone: '+9779812345678' });
    assert.equal(count(sqlite, 'audit_logs'), 1);
    const initial = await listFormAnswersForSubject(globalThis.profileTestDb, 'user', 'customer');
    assert.equal(initial.length, 1);
    assert.deepEqual(initial[0].answers.answers, [{ fieldId: 'delivery_note', label: 'Where can we find you?', type: 'short_text', value: 'By the blue gate' }]);
    seedVersion(sqlite, 2, [archivedNote]);
    assert.equal((await PATCH(request(input('profile-2', 2, [])))).status, 200);
    const history = await listFormAnswersForSubject(globalThis.profileTestDb, 'user', 'customer');
    assert.equal(history.length, 2);
    assert.deepEqual(history[0].answers.answers, initial[0].answers.answers);
    assert.deepEqual(history[1].answers.answers, []);
  } finally { sqlite.close(); }
});

void test('missing required and invalid custom answers do not update a profile or audit', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    for (const [id, answers] of [['missing', []], ['unknown', [{ fieldId: 'unknown', value: 'x' }]], ['duplicate', [{ fieldId: 'delivery_note', value: 'one' }, { fieldId: 'delivery_note', value: 'two' }]]] as const) {
      const response = await PATCH(request(input(id, 1, answers)));
      assert.equal(response.status, 400, id);
      assert.match((await response.json() as { error: string }).error, /answer|field|where can we find you/i);
    }
    const invalid = await PATCH(request(input('invalid-type', 1, [{ fieldId: 'delivery_note', value: 42 }])));
    assert.equal(invalid.status, 400);
    const detail = await invalid.json() as { error: string; fieldId: string };
    assert.equal(detail.fieldId, 'delivery_note');
    assert.match(detail.error, /where can we find you/i);
    assert.deepEqual(user(sqlite), { name: 'Old Name', phone: null });
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    assert.equal(count(sqlite, 'audit_logs'), 0);
  } finally { sqlite.close(); }
});

void test('required checkbox false cannot update profile, answers, or audit', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    seedVersion(sqlite, 2, [{ id: 'acknowledged', key: 'acknowledged', type: 'checkbox', label: 'I acknowledge', required: true, order: 0, status: 'active' }]);
    const response = await PATCH(request(input('unchecked-required', 2, [{ fieldId: 'acknowledged', value: false }])));
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { fieldId: string }).fieldId, 'acknowledged');
    assert.deepEqual(user(sqlite), { name: 'Old Name', phone: null });
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    assert.equal(count(sqlite, 'audit_logs'), 0);
  } finally { sqlite.close(); }
});

void test('stale and unavailable configurations fail closed without profile writes', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    seedVersion(sqlite, 2, [requiredNote]);
    const stale = await PATCH(request(input('stale', 1)));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json() as { code: string }).code, 'stale_version');
    sqlite.exec("DROP TABLE form_config_versions");
    assert.equal((await PATCH(request(input('unavailable')))).status, 503);
    assert.deepEqual(user(sqlite), { name: 'Old Name', phone: null });
    assert.equal(count(sqlite, 'audit_logs'), 0);
  } finally { sqlite.close(); }
});

void test('publication between validation and batch returns stale conflict and rolls back', async () => {
  const { sqlite, database } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    database.beforeBatch = () => seedVersion(sqlite, 2, [requiredNote]);
    const response = await PATCH(request(input('publish-race')));
    assert.equal(response.status, 409);
    assert.equal((await response.json() as { code: string }).code, 'stale_version');
    assert.deepEqual(user(sqlite), { name: 'Old Name', phone: null });
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    assert.equal(count(sqlite, 'audit_logs'), 0);
  } finally { sqlite.close(); }
});

void test('failed answer batch rolls back the profile update and audit', async () => {
  const { sqlite, database } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    database.failStatement = 2;
    assert.equal((await PATCH(request(input('failed-batch')))).status, 500);
    assert.deepEqual(user(sqlite), { name: 'Old Name', phone: null });
    assert.equal(count(sqlite, 'audit_logs'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
  } finally { sqlite.close(); }
});

void test('repeating a request ID does not update profile or duplicate its answer and audit', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    assert.equal((await PATCH(request(input('once')))).status, 200);
    assert.equal((await PATCH(request(input('once')))).status, 200);
    const changed = await PATCH(request({ ...input('once'), displayName: 'Changed on retry' }));
    assert.equal(changed.status, 409);
    assert.match((await changed.json() as { error: string }).error, /already used/i);
    assert.deepEqual(user(sqlite), { name: 'Asha Rai', phone: '+9779812345678' });
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 1);
  } finally { sqlite.close(); }
});

void test('exact replay omits optional empty answers even after a later publication', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    const optional = { id: 'favorite_color', key: 'favorite_color', type: 'short_text', label: 'Favorite color', required: false, order: 1, status: 'active' };
    seedVersion(sqlite, 2, [requiredNote, optional]);
    const original = input('optional-empty-replay', 2, [
      { fieldId: 'delivery_note', value: 'By the blue gate' }, { fieldId: 'favorite_color', value: '' },
    ]);
    assert.equal((await PATCH(request(original))).status, 200);
    seedVersion(sqlite, 3, [requiredNote, optional]);
    assert.equal((await PATCH(request(original))).status, 200);
    assert.equal((await PATCH(request({ ...original, customAnswers: [
      { fieldId: 'delivery_note', value: 'Different gate' }, { fieldId: 'favorite_color', value: '' },
    ] }))).status, 409);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 1);
    assert.deepEqual(user(sqlite), { name: 'Asha Rai', phone: '+9779812345678' });
  } finally { sqlite.close(); }
});

void test('exact replay accepts answer entries in a different order but rejects changed values', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    const color = { id: 'favorite_color', key: 'favorite_color', type: 'short_text', label: 'Favorite color', required: true, order: 1, status: 'active' };
    seedVersion(sqlite, 2, [requiredNote, color]);
    const original = input('reordered-replay', 2, [
      { fieldId: 'delivery_note', value: 'By the blue gate' }, { fieldId: 'favorite_color', value: 'Blue' },
    ]);
    assert.equal((await PATCH(request(original))).status, 200);
    assert.equal((await PATCH(request({ ...original, customAnswers: [
      { fieldId: 'favorite_color', value: 'Blue' }, { fieldId: 'delivery_note', value: 'By the blue gate' },
    ] }))).status, 200);
    assert.equal((await PATCH(request({ ...original, customAnswers: [
      { fieldId: 'delivery_note', value: 'By the blue gate' }, { fieldId: 'favorite_color', value: 'Red' },
    ] }))).status, 409);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 1);
  } finally { sqlite.close(); }
});

void test('guest and cross-origin requests cannot mutate or store answers', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    globalThis.profileTestActor = null;
    assert.equal((await PATCH(request(input('guest')))).status, 401);
    globalThis.profileTestActor = { userId: 'customer' };
    assert.equal((await PATCH(request(input('cross-origin'), 'https://other.example'))).status, 403);
    assert.deepEqual(user(sqlite), { name: 'Old Name', phone: null });
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
  } finally { sqlite.close(); }
});

void test('name and Nepal phone validation still reject bad core values', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    for (const [id, body] of [['short-name', { ...input('short-name'), displayName: 'A' }], ['bad-phone', { ...input('bad-phone'), phone: '123' }]] as const) {
      assert.equal((await PATCH(request(body))).status, 409, id);
    }
    assert.deepEqual(user(sqlite), { name: 'Old Name', phone: null });
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
  } finally { sqlite.close(); }
});

void test('oversized profile JSON is rejected before custom-answer parsing or any write', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    const oversized = input('oversized', 1, [{ fieldId: 'delivery_note', value: 'x'.repeat(262_145) }]);
    assert.equal((await PATCH(request(oversized))).status, 413);
    assert.deepEqual(user(sqlite), { name: 'Old Name', phone: null });
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    assert.equal(count(sqlite, 'audit_logs'), 0);
  } finally { sqlite.close(); }
});

void test('mounted ambiguous retry never reports edited values saved under an old request ID', async () => {
  const { sqlite } = await fixture();
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright is provided by the external workspace runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'profile-mounted-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ProfileForm } from './components/account/profile-form';
      createRoot(document.getElementById('root')!).render(<ProfileForm displayName="Old Name" phone={null} locale="en-NP" />);
    `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'profile-navigation', setup(build) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'profile-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'profile-fixture' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  let patches = 0;
  try {
    const { PATCH } = await import('../app/api/account/profile/route');
    await page.route('https://profile.test/**', async (route: {
      request(): { url(): string; method(): string; postData(): string | null };
      fulfill(input: { status: number; contentType: string; body: string }): Promise<void>;
    }) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div>' });
      if (url.pathname === '/api/forms/account.profile') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        config: { formId: 'account.profile', version: 1, publishedAt: 1, fields: [requiredNote] },
      }) });
      if (url.pathname === '/api/account/profile') {
        patches++;
        const upstream = await PATCH(new Request('http://localhost:3000/api/account/profile', { method: 'PATCH',
          headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: route.request().postData() }));
        return route.fulfill({ status: patches === 1 ? 500 : upstream.status, contentType: 'application/json',
          body: patches === 1 ? JSON.stringify({ error: 'Connection ended after save.' }) : await upstream.text() });
      }
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    });
    await page.goto('https://profile.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => (document.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.disabled === false);
    await page.locator('input[name="displayName"]').fill('Asha Rai');
    await page.locator('input[name="custom.delivery_note"]').fill('By the blue gate');
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(() => document.body.textContent?.includes('Connection ended after save.') === true);
    await page.locator('input[name="displayName"]').fill('Asha Changed');
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(() => document.body.textContent?.includes('already used') === true ||
      document.body.textContent?.includes('Your profile is up to date.') === true);
    assert.equal(patches, 2);
    assert.match(await page.evaluate(() => document.body.textContent ?? ''), /already used/i);
    assert.equal(await page.locator('output').count(), 0);
    assert.deepEqual(user(sqlite), { name: 'Asha Rai', phone: null });
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 1);
  } finally { await page.close(); await browser.close(); sqlite.close(); }
});
