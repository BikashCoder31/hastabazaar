import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import * as settingsRepository from '../lib/db/repositories/business-settings';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { businessSettingFormId, createBusinessSettingDraft, submitBusinessSettingDraft,
  approveBusinessSettingChange, rejectBusinessSettingChange, publishBusinessSettingDraft,
  createBusinessSettingReversalDraft } from '../lib/db/repositories/business-settings';
import type { BusinessSettingForm } from '../lib/db/repositories/business-settings';
import { INITIAL_HOMEPAGE_HERO_SLIDES } from '../lib/homepage/hero-slides';
import { INITIAL_HOMEPAGE_OCCASION_SLIDES } from '../lib/homepage/occasion-slides';
import { FormRuntimeError } from '../lib/forms/runtime';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { validateAnswersForDefinition, validateFormDraft } from '../lib/forms/validation';

declare global {
  var settingsCatalogConfigs: Record<string, unknown>;
  var settingsRouteDatabase: D1Database;
  var settingsRouteActor: { id: string; role: 'super_admin' } | null;
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,
    export const env={get DB(){return globalThis.settingsRouteDatabase},
      HASTABAZAAR_RUNTIME_ENV:'local_staging',APP_ORIGIN:'http://localhost:3000'}`, shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){if(!globalThis.settingsRouteActor)
      throw new StaffAuthorizationError('Staff access required.',403);return globalThis.settingsRouteActor}`, shortCircuit: true };
  if (specifier === '@/lib/http/request-security') return { url: `data:text/javascript,
    export function isTrustedMutationRequest(){return true}`, shortCircuit: true };
  if (specifier === '@/components/homepage/homepage-occasion-carousel') return { url: `data:text/javascript,
    export function HomepageOccasionCarousel(){return null}`, shortCircuit: true };
  if (specifier === '@/components/admin/homepage-hero-preview') return { url: `data:text/javascript,
    export function HomepageHeroPreview(){return null}`, shortCircuit: true };
  if (specifier === '@/components/forms/form-config-client') return { url: `data:text/javascript,
    export function usePublishedFormConfig(id){return {config:globalThis.settingsCatalogConfigs[id],
      canSubmit:true,status:'ready',message:''}}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { const result = this.statement.run(...this.values); return { success: true, meta: { changes: Number(result.changes) }, results: [] }; }
}
class Database {
  failAt: number | null = null;
  beforeBatch: (() => void) | null = null;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.beforeBatch?.();
    this.beforeBatch = null;
    this.sqlite.exec('BEGIN');
    try {
      for (const [index, statement] of statements.entries()) {
        if (this.failAt === index) throw new Error('Simulated transaction failure');
        await statement.run();
      }
      this.sqlite.exec('COMMIT');
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
async function fixture(withCustomFields = true) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT NOT NULL,display_name TEXT NOT NULL);
    CREATE TABLE user_roles(user_id TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(user_id,role));
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,
      subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,
      ip_hash TEXT,created_at INTEGER);
    INSERT INTO users VALUES('admin-a','active','Admin A'),('admin-b','active','Admin B');
    INSERT INTO user_roles VALUES('admin-a','super_admin'),('admin-b','super_admin');`);
  for (const migration of ['0044_business_configuration.sql', '0055_homepage_hero_carousel.sql', '0056_form_catalog.sql']) {
    const sql = await readFile(new URL(`../drizzle/${migration}`, import.meta.url), 'utf8');
    for (const part of sql.split('--> statement-breakpoint')) if (part.trim()) sqlite.exec(part);
  }
  for (const id of ['staff.homepage-hero-manager', 'staff.homepage-occasion-manager', 'staff.business-settings-manager']) {
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
      created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?,?,1,1,'published',?,'Test publication','admin-a',1,'admin-a',1,'admin-a',1,?)`)
      .run(`${id}-v1`, id, JSON.stringify({ formId: id, fields: withCustomFields ? [{ id: 'review_context', key: 'review_context',
        label: 'Review context', type: 'short_text', required: true, order: 0, status: 'active' }] : [] }), `publish-${id}`);
  }
  const db = new Database(sqlite);
  return { sqlite, db, database: db as unknown as D1Database };
}
const form = (formId: string): BusinessSettingForm => ({ formId, versionId: `${formId}-v1`, answers: {
  formId, version: 1, answers: [{ fieldId: 'review_context', label: 'Review context', type: 'short_text', value: 'Approved fixture context' }],
} });
const count = (sqlite: DatabaseSync, table: string) => (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

const officialLinks = { linkedin: 'https://linkedin.com/company/hastabazaar', x: 'https://x.com/Hastabazaar',
  tiktok: 'https://tiktok.com/@hastabazaar', instagram: 'https://instagram.com/hastabazaar',
  facebook: 'https://www.facebook.com/hastabazaar', youtube: 'https://www.youtube.com/@hastabazaar' };

void test('direct settings save publishes once with stable immediate intent and exact archived-form replay', async () => {
  assert.equal(typeof settingsRepository.saveBusinessSettingChange, 'function', 'A single atomic save operation must exist.');
  const { sqlite, database } = await fixture();
  try {
    const input = { key: 'managed_sale_linked_platform_retention_bps' as const, value: 800,
      actorId: 'admin-a', reason: 'SIMULATED direct controlled save', requestId: 'direct-save-one',
      now: 1000, effectiveFrom: null, expectedVersion: 0, form: form('staff.business-settings-manager') };
    const saved = await settingsRepository.saveBusinessSettingChange(database, input);
    assert.equal(saved.status, 'published');
    assert.equal(saved.effectiveFrom, 1000);
    assert.equal(saved.submittedBy, null);
    assert.equal(saved.approvedBy, null);
    assert.equal(saved.publishedBy, 'admin-a');
    assert.deepEqual(['business_setting_versions', 'form_answer_sets', 'audit_logs'].map((table) => count(sqlite, table)), [1, 1, 1]);
    assert.equal(sqlite.prepare('SELECT action FROM audit_logs').get()?.action, 'business_setting.published');
    publishLaterForm(sqlite);
    assert.equal((await settingsRepository.saveBusinessSettingChange(database, { ...input, now: 2000 })).id, saved.id);
    for (const delta of [{ value: 900 }, { effectiveFrom: 1500 }, { expectedVersion: 1 }, { actorId: 'admin-b' },
      { reason: 'A different valid reason' }, { form: { ...input.form, answers: { ...input.form.answers, answers: [] } } }])
      await assert.rejects(settingsRepository.saveBusinessSettingChange(database, { ...input, ...delta }));
    sqlite.exec("UPDATE users SET status='suspended' WHERE id='admin-a'");
    await assert.rejects(settingsRepository.saveBusinessSettingChange(database, input), /Super Admin authority/);
    assert.deepEqual(['business_setting_versions', 'form_answer_sets', 'audit_logs'].map((table) => count(sqlite, table)), [1, 1, 1]);
  } finally { sqlite.close(); }
});

void test('direct settings save rolls back publication, prior interval, audit and answers at every batch failure', async () => {
  assert.equal(typeof settingsRepository.saveBusinessSettingChange, 'function');
  for (let failAt = 0; failAt < 12; failAt++) {
    const { sqlite, db, database } = await fixture();
    try {
      const input = { key: 'official_social_links' as const, value: officialLinks, actorId: 'admin-a',
        reason: 'SIMULATED direct publication', requestId: 'direct-base', now: 100, effectiveFrom: null,
        expectedVersion: 0, form: form('staff.business-settings-manager') };
      await settingsRepository.saveBusinessSettingChange(database, input);
      const tables = ['business_setting_versions', 'form_answer_sets', 'audit_logs'];
      const before = tables.map((table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
      db.failAt = failAt;
      await assert.rejects(settingsRepository.saveBusinessSettingChange(database, { ...input,
        requestId: 'direct-next', now: 200, expectedVersion: 1 }));
      assert.deepEqual(tables.map((table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()), before);
    } finally { sqlite.close(); }
  }
});

void test('direct settings save retains date, capability, version and authority guards including races', async () => {
  assert.equal(typeof settingsRepository.saveBusinessSettingChange, 'function');
  for (const mode of ['version', 'authority', 'form', 'ordinary', 'commission', 'past', 'unready', 'wrong-form'] as const) {
    const { sqlite, db, database } = await fixture();
    try {
      const input = { key: 'official_social_links' as const, value: officialLinks, actorId: 'admin-a',
        reason: 'SIMULATED guarded direct save', requestId: 'direct-guard', now: 100,
        effectiveFrom: null as number | null, expectedVersion: 0, form: form('staff.business-settings-manager') };
      if (mode === 'version') input.expectedVersion = 1;
      if (mode === 'ordinary') sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='admin-a'");
      if (mode === 'authority') db.beforeBatch = () => sqlite.exec("DELETE FROM user_roles WHERE user_id='admin-a'");
      if (mode === 'form') db.beforeBatch = () => publishLaterForm(sqlite);
      if (mode === 'past') input.effectiveFrom = 99;
      const candidate = mode === 'commission' ? { ...input, key: 'independent_seller_commission_bps' as const, value: 1200 }
        : mode === 'unready' ? { ...input, key: 'managed_maker_active_model' as const, value: 'managed_fixed_supplier_price_v1' }
          : mode === 'wrong-form' ? { ...input, form: form('staff.homepage-hero-manager') } : input;
      await assert.rejects(settingsRepository.saveBusinessSettingChange(database, candidate));
      assert.deepEqual(['business_setting_versions', 'form_answer_sets', 'audit_logs'].map((table) => count(sqlite, table)), [0, 0, 0]);
    } finally { sqlite.close(); }
  }
  const { sqlite, database } = await fixture();
  try {
    const saved = await settingsRepository.saveBusinessSettingChange(database, { key: 'independent_seller_commission_bps',
      value: 1200, actorId: 'admin-a', reason: 'SIMULATED sufficient commission notice', requestId: 'direct-notice',
      now: 100, effectiveFrom: 100 + 15 * 86400000, expectedVersion: 0, form: form('staff.business-settings-manager') });
    assert.equal(saved.status, 'published');
    await assert.rejects(settingsRepository.getEffectiveBusinessSetting(database, saved.key, 100),
      /No effective published commission rate/);
    assert.equal((await settingsRepository.getEffectiveBusinessSetting(database, saved.key, 100 + 15 * 86400000)).value, 1200);
  } finally { sqlite.close(); }
});

void test('actual settings save route returns an authoritative publication rather than a draft', async () => {
  const { sqlite, database } = await fixture();
  try {
    globalThis.settingsRouteDatabase = database;
    globalThis.settingsRouteActor = { id: 'admin-a', role: 'super_admin' };
    const { POST } = await import('../app/api/admin/business-settings/route');
    const response = await POST(new Request('http://localhost/api/admin/business-settings', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save',
        key: 'managed_sale_linked_platform_retention_bps', value: 800, reason: 'SIMULATED single save route',
        expectedVersion: 0, effectiveFrom: null, requestId: 'route-direct-save', sourceFormId: 'staff.business-settings-manager',
        formVersion: 1, customAnswers: [{ fieldId: 'review_context', value: 'Approved fixture context' }] }) }));
    assert.equal(response.status, 201);
    const body = await response.json() as { ok: boolean; action: string; version: { status: string }; draft?: unknown };
    assert.equal(body.ok, true);
    assert.equal(body.action, 'save');
    assert.equal(body.version.status, 'published');
    assert.equal(body.draft, undefined);
  } finally { sqlite.close(); }
});

void test('direct settings save rejects version races and supports later-setting exact replay without a form', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    const input = { key: 'official_social_links' as const, value: officialLinks, actorId: 'admin-a',
      reason: 'SIMULATED no form direct save', requestId: 'noform-direct-save', now: 100,
      effectiveFrom: null, expectedVersion: 0 };
    const first = await settingsRepository.saveBusinessSettingChange(database, input);
    db.beforeBatch = () => sqlite.prepare(`INSERT INTO business_setting_versions
      (id,setting_key,version,value_json,status,revision,change_control,reason,created_by,created_at,last_request_id)
      VALUES ('concurrent-draft','official_social_links',2,?,'draft',1,'simple','Concurrent fixture','admin-a',150,'concurrent-request')`)
      .run(JSON.stringify(officialLinks));
    await assert.rejects(settingsRepository.saveBusinessSettingChange(database, { ...input, now: 200,
      expectedVersion: 1, requestId: 'racing-direct-save' }));
    assert.equal(sqlite.prepare('SELECT effective_until FROM business_setting_versions WHERE id=?').get(first.id)?.effective_until, null);
    assert.equal(count(sqlite, 'audit_logs'), 1);
    const next = await settingsRepository.saveBusinessSettingChange(database, { ...input, now: 200,
      expectedVersion: 2, requestId: 'later-direct-save' });
    assert.equal(next.version, 3);
    assert.equal((await settingsRepository.saveBusinessSettingChange(database, { ...input, now: 300 })).id, first.id);
    assert.equal(count(sqlite, 'audit_logs'), 2);
    sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='admin-a'");
    await assert.rejects(settingsRepository.saveBusinessSettingChange(database, input), /Super Admin authority/);
  } finally { sqlite.close(); }
});
function publishLaterForm(sqlite: DatabaseSync, withCustomFields = true) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
    created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES ('settings-v2','staff.business-settings-manager',2,1,'published',?,'Later publication',
      'admin-a',2,'admin-a',2,'admin-a',2,'settings-publish-v2')`)
    .run(JSON.stringify({ formId: 'staff.business-settings-manager', fields: withCustomFields ? [{
      id: 'review_context', key: 'review_context', label: 'Review context', type: 'short_text',
      required: true, order: 0, status: 'active' }] : [] }));
}

async function actionFixture(action: 'draft' | 'publish' | 'submit' | 'approve' | 'reject' | 'reverse') {
  const result = await fixture();
  const context = form('staff.business-settings-manager');
  const input = { key: 'independent_seller_commission_bps' as const, value: 1200,
    actorId: 'admin-a', reason: 'Fictional controlled settings change', requestId: 'action-draft', now: 100, form: context };
  if (action === 'draft') return { ...result, actorId: 'admin-a', run: () => createBusinessSettingDraft(result.database, input) };
  const draft = await createBusinessSettingDraft(result.database, action === 'publish'
    ? { ...input, key: 'official_social_links', value: officialLinks } : input);
  const base = { id: draft.id, actorId: 'admin-a', expectedRevision: 1,
    reason: 'Fictional documented settings decision', requestId: 'action-submit', now: 110, form: context };
  if (action === 'publish') return { ...result, actorId: 'admin-a', run: () => publishBusinessSettingDraft(result.database,
    { ...base, requestId: 'action-publish', effectiveFrom: 2_000_000_000 }) };
  if (action === 'submit') return { ...result, actorId: 'admin-a', run: () => submitBusinessSettingDraft(result.database, base) };
  await submitBusinessSettingDraft(result.database, base);
  const review = { ...base, actorId: 'admin-b', expectedRevision: 2, now: 120,
    requestId: `action-${action}`, effectiveFrom: 2_000_000_000 };
  if (action === 'approve') return { ...result, actorId: 'admin-b', run: () => approveBusinessSettingChange(result.database, review) };
  if (action === 'reject') return { ...result, actorId: 'admin-b', run: () => rejectBusinessSettingChange(result.database, review) };
  await approveBusinessSettingChange(result.database, { ...review, requestId: 'action-approve' });
  return { ...result, actorId: 'admin-a', run: () => createBusinessSettingReversalDraft(result.database,
    { sourceVersionId: draft.id, actorId: 'admin-a', reason: base.reason,
      requestId: 'action-reverse', now: 130, form: context }) };
}

void test('all six settings exact replays reauthorize current Super Admin and retain archived-version replay', async (t) => {
  for (const action of ['draft', 'publish', 'submit', 'approve', 'reject', 'reverse'] as const) await t.test(action, async () => {
    const { sqlite, actorId, run } = await actionFixture(action);
    try {
      await run();
      const before = ['business_setting_versions', 'form_answer_sets', 'audit_logs'].map((table) => count(sqlite, table));
      sqlite.prepare("UPDATE users SET status='suspended' WHERE id=?").run(actorId);
      await assert.rejects(run());
      sqlite.prepare("UPDATE users SET status='active' WHERE id=?").run(actorId);
      sqlite.prepare("DELETE FROM user_roles WHERE user_id=? AND role='super_admin'").run(actorId);
      await assert.rejects(run());
      sqlite.prepare("INSERT INTO user_roles VALUES(?,'super_admin')").run(actorId);
      publishLaterForm(sqlite);
      await run();
      assert.deepEqual(['business_setting_versions', 'form_answer_sets', 'audit_logs'].map((table) => count(sqlite, table)), before);
    } finally { sqlite.close(); }
  });
});

void test('publication racing each settings action returns stale_version and rolls back all writes', async (t) => {
  for (const action of ['draft', 'publish', 'submit', 'approve', 'reject', 'reverse'] as const) await t.test(action, async () => {
    const { sqlite, db, run } = await actionFixture(action);
    try {
      const before = ['business_setting_versions', 'form_answer_sets', 'audit_logs'].map((table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
      db.beforeBatch = () => publishLaterForm(sqlite);
      await assert.rejects(run(), (error: unknown) => error instanceof FormRuntimeError && error.code === 'stale_version');
      assert.deepEqual(['business_setting_versions', 'form_answer_sets', 'audit_logs'].map((table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()), before);
    } finally { sqlite.close(); }
  });
});

void test('both actual settings routes expose preflight and transaction-time stale codes', async (t) => {
  for (const endpoint of ['draft', 'change'] as const) for (const race of [false, true]) await t.test(`${endpoint} race=${race}`, async () => {
    const { sqlite, db, database } = await fixture();
    try {
      globalThis.settingsRouteDatabase = database;
      globalThis.settingsRouteActor = { id: 'admin-a', role: 'super_admin' };
      const version = endpoint === 'change' ? await createBusinessSettingDraft(database, {
        key: 'official_social_links', value: officialLinks, actorId: 'admin-a',
        reason: 'Fictional route setup settings', requestId: 'setup-route-draft', now: 100 }) : null;
      const body = { key: 'official_social_links', value: officialLinks, action: version ? 'publish' : 'draft', expectedRevision: 1,
        effectiveFrom: Date.now() + 60_000, reason: 'Fictional documented route change', requestId: 'route-stale-proof',
        sourceFormId: 'staff.business-settings-manager', formVersion: 1, customAnswers: [{ fieldId: 'review_context', value: 'Approved fixture context' }] };
      if (race) db.beforeBatch = () => publishLaterForm(sqlite);
      else publishLaterForm(sqlite);
      const request = new Request('http://localhost/api/admin/business-settings', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const response = version
        ? await (await import('../app/api/admin/business-settings/changes/[id]/route')).POST(request, { params: Promise.resolve({ id: version.id }) })
        : await (await import('../app/api/admin/business-settings/route')).POST(request);
      assert.equal(response.status, 409);
      assert.equal((await response.json() as { code?: string }).code, 'stale_version');
      assert.equal(count(sqlite, 'form_answer_sets'), 0);
      assert.equal(count(sqlite, 'audit_logs'), 0);
      assert.equal(count(sqlite, 'business_setting_versions'), version ? 1 : 0);
    } finally { sqlite.close(); globalThis.settingsRouteActor = null; }
  });
});

void test('settings source ID is bound to its actual key', () => {
  assert.equal(businessSettingFormId('homepage_hero_slides', 'staff.homepage-hero-manager'), 'staff.homepage-hero-manager');
  assert.equal(businessSettingFormId('homepage_occasion_slides', 'staff.homepage-occasion-manager'), 'staff.homepage-occasion-manager');
  assert.equal(businessSettingFormId('official_social_links', 'staff.business-settings-manager'), 'staff.business-settings-manager');
  assert.throws(() => businessSettingFormId('homepage_hero_slides', 'staff.business-settings-manager'));
  assert.throws(() => businessSettingFormId('official_social_links', 'staff.homepage-hero-manager'));
});

void test('settings route checks current auth, matching source and version before drafting', async () => {
  const { sqlite, database } = await fixture();
  try {
    globalThis.settingsRouteDatabase = database;
    globalThis.settingsRouteActor = null;
    const { POST } = await import('../app/api/admin/business-settings/route');
    const submit = (body: Record<string, unknown>) => POST(new Request('http://localhost/api/admin/business-settings', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    const body = { key: 'official_social_links', value: { linkedin: 'https://linkedin.com/company/hastabazaar',
      x: 'https://x.com/Hastabazaar', tiktok: 'https://tiktok.com/@hastabazaar',
      instagram: 'https://instagram.com/hastabazaar', facebook: 'https://www.facebook.com/hastabazaar',
      youtube: 'https://www.youtube.com/@hastabazaar' }, reason: 'Owner confirmed these official social URLs',
      requestId: 'route-settings-one', sourceFormId: 'staff.business-settings-manager', formVersion: 1,
      customAnswers: [{ fieldId: 'review_context', value: 'Approved fixture context' }] };
    assert.equal((await submit(body)).status, 403);
    globalThis.settingsRouteActor = { id: 'admin-a', role: 'super_admin' };
    assert.equal((await submit({ ...body, sourceFormId: 'staff.homepage-hero-manager' })).status, 400);
    assert.equal((await submit({ ...body, formVersion: 0 })).status, 409);
    assert.equal((await submit({ ...body, customAnswers: [] })).status, 400);
    assert.equal(count(sqlite, 'business_setting_versions'), 0);
    assert.equal((await submit(body)).status, 201);
    assert.equal(count(sqlite, 'business_setting_versions'), 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    const id = (sqlite.prepare('SELECT id FROM business_setting_versions').get() as { id: string }).id;
    const { POST: change } = await import('../app/api/admin/business-settings/changes/[id]/route');
    const changeRequest = (payload: Record<string, unknown>) => change(new Request(`http://localhost/api/admin/business-settings/changes/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    }), { params: Promise.resolve({ id }) });
    const action = { action: 'publish', expectedRevision: 1, effectiveFrom: Date.now() + 60_000,
      reason: 'Publish the official social URLs', requestId: 'route-settings-publish',
      sourceFormId: 'staff.business-settings-manager', formVersion: 1, customAnswers: [{ fieldId: 'review_context', value: 'Approved fixture context' }] };
    assert.equal((await changeRequest({ ...action, sourceFormId: 'staff.homepage-hero-manager' })).status, 400);
    assert.equal((await changeRequest(action)).status, 200);
    assert.equal((await changeRequest(action)).status, 200);
    assert.equal((await changeRequest({ ...action, reason: 'Changed publication reason' })).status, 409);
    assert.equal(count(sqlite, 'form_answer_sets'), 2);
  } finally { sqlite.close(); globalThis.settingsRouteActor = null; }
});

void test('all settings source IDs and conditional actions enforce live required context, replay and archival', async (t) => {
  const sources = [
    { key: 'homepage_hero_slides', formId: 'staff.homepage-hero-manager', value: INITIAL_HOMEPAGE_HERO_SLIDES, actions: ['draft', 'publish', 'reverse'] },
    { key: 'homepage_occasion_slides', formId: 'staff.homepage-occasion-manager', value: INITIAL_HOMEPAGE_OCCASION_SLIDES, actions: ['draft', 'publish', 'reverse'] },
    { key: 'official_social_links', formId: 'staff.business-settings-manager', value: officialLinks, actions: ['draft', 'publish', 'reverse'] },
    { key: 'independent_seller_commission_bps', formId: 'staff.business-settings-manager', value: 1200, actions: ['submit', 'approve', 'reject'] },
  ] as const;
  for (const source of sources) for (const action of source.actions) await t.test(`${source.formId}:${action}`, async () => {
    const { sqlite, database } = await fixture();
    globalThis.settingsRouteDatabase = database;
    globalThis.settingsRouteActor = { id: 'admin-a', role: 'super_admin' };
    try {
      const now = Date.now(), effectiveFrom = now + 30 * 24 * 60 * 60 * 1000;
      const setup = { key: source.key, value: source.value, actorId: 'admin-a', reason: 'Fictional route setup', requestId: 'setup-draft', now };
      const parent = action === 'draft' ? null : await createBusinessSettingDraft(database, setup);
      if (parent && (action === 'approve' || action === 'reject')) {
        await submitBusinessSettingDraft(database, { id: parent.id, actorId: 'admin-a', expectedRevision: 1,
          reason: 'Fictional independent review setup', requestId: 'setup-submit', now });
        globalThis.settingsRouteActor = { id: 'admin-b', role: 'super_admin' };
      }
      if (parent && action === 'reverse') await publishBusinessSettingDraft(database, {
        id: parent.id, actorId: 'admin-a', expectedRevision: 1, effectiveFrom,
        reason: 'Fictional publication setup', requestId: 'setup-publish', now });
      const base = { key: source.key, value: source.value, action, expectedRevision: action === 'approve' || action === 'reject' ? 2 : 1,
        effectiveFrom, reason: 'Fictional route acceptance evidence', requestId: 'route-required-action', sourceFormId: source.formId,
        formVersion: 1, customAnswers: [{ fieldId: 'review_context', value: 'Approved fixture context' }] };
      const send = async (body: Record<string, unknown>) => {
        const request = new Request('http://localhost/api/admin/business-settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        return parent ? (await import('../app/api/admin/business-settings/changes/[id]/route')).POST(request, { params: Promise.resolve({ id: parent.id }) })
          : (await import('../app/api/admin/business-settings/route')).POST(request);
      };
      const before = ['business_setting_versions', 'audit_logs', 'form_answer_sets'].map(table => count(sqlite, table));
      assert.equal((await send({ ...base, sourceFormId: source.formId === 'staff.business-settings-manager' ? 'staff.homepage-hero-manager' : 'staff.business-settings-manager' })).status, 400);
      assert.equal((await send({ ...base, customAnswers: [] })).status, 400);
      assert.deepEqual(['business_setting_versions', 'audit_logs', 'form_answer_sets'].map(table => count(sqlite, table)), before);
      const expected = action === 'draft' || action === 'reverse' ? 201 : 200;
      const response = await send(base);
      assert.equal(response.status, expected, JSON.stringify(await response.json()));
      assert.equal((await send(base)).status, expected, 'Exact replay');
      assert.equal((await send({ ...base, reason: 'Different action evidence' })).status, 409);
      const after = ['business_setting_versions', 'audit_logs', 'form_answer_sets'].map(table => count(sqlite, table));
      assert.equal(after[2], before[2] + 1);
      sqlite.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT ?,form_id,2,2,'published',json_set(config_json,'$.fields[0].status','archived'),'Later publication','admin-a',2,'admin-a',2,'admin-a',2,? FROM form_config_versions WHERE id=?`)
        .run(`${source.formId}-v2`, 'later-form-publication', `${source.formId}-v1`);
      assert.equal((await send(base)).status, expected, 'Historical exact replay');
      const stale = await send({ ...base, requestId: 'new-stale-attempt' });
      assert.equal(stale.status, 409);assert.equal((await stale.json() as {code?:string}).code, 'stale_version');
      sqlite.prepare("UPDATE users SET status='suspended' WHERE id=?").run(globalThis.settingsRouteActor.id);
      assert.notEqual((await send(base)).status, expected, 'Revoked replay');
      assert.deepEqual(['business_setting_versions', 'audit_logs', 'form_answer_sets'].map(table => count(sqlite, table)), after);
    } finally { sqlite.close(); globalThis.settingsRouteActor = null; }
  });
});

void test('all three settings managers render their own published custom controls', async () => {
  const ids = ['staff.homepage-hero-manager', 'staff.homepage-occasion-manager',
    'staff.business-settings-manager'];
  globalThis.settingsCatalogConfigs = Object.fromEntries(ids.map((formId) => [formId, {
    formId, version: 2, publishedAt: 1, fields: [{ id: 'review_context', key: 'review_context',
      label: 'Review context', type: 'short_text', required: true, order: 0, status: 'active' }],
  }]));
  const { HomepageHeroManager } = await import('../components/admin/homepage-hero-manager');
  const { HomepageOccasionManager } = await import('../components/admin/homepage-occasion-manager');
  const { BusinessSettingsManager } = await import('../components/admin/business-settings-manager');
  const html = [
    renderToStaticMarkup(createElement(HomepageHeroManager, { initialSlides: [], initialMedia: [], history: [], asOf: 1 })),
    renderToStaticMarkup(createElement(HomepageOccasionManager, { initialSlides: [], history: [], asOf: 1 })),
    renderToStaticMarkup(createElement(BusinessSettingsManager, { initialSettings: [{
      key: 'official_social_links', label: 'Social links', description: 'Official links', sensitivity: 'public_content',
      changeControl: 'simple', effectiveMode: 'immediate', snapshotOnTransaction: false,
      affectedSurfaces: [], requiredCapability: null, effective: { key: 'official_social_links',
        value: officialLinks, source: 'default', version: null, versionId: null, effectiveFrom: null, approvedBy: null },
      history: [],
    }], asOf: 1 })),
  ];
  for (const [index, id] of ids.entries()) {
    const markup = html[index].match(new RegExp(`<form[^>]*data-form-id="${id}"[\\s\\S]*?<\\/form>`))?.[0];
    assert.ok(markup, `${id} identifies its live form`);
    assert.match(markup, /name="custom\.review_context"/);
    assert.match(markup, /name="formVersion" value="2"/);
  }
});

void test('hero draft and publication atomically keep exact, bounded form context on the version', async () => {
  const { sqlite, database, db } = await fixture();
  try {
    const input = { key: 'homepage_hero_slides' as const, value: [], actorId: 'admin-a',
      reason: 'Publish updated hero presentation', requestId: 'hero-draft-1', now: 100,
      form: form('staff.homepage-hero-manager') };
    db.failAt = 2;
    await assert.rejects(createBusinessSettingDraft(database, input));
    assert.equal(count(sqlite, 'business_setting_versions'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    db.failAt = null;
    const draft = await createBusinessSettingDraft(database, input);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    const answer = sqlite.prepare('SELECT form_id AS formId,subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId FROM form_answer_sets').get() as Record<string, string>;
    assert.deepEqual({ ...answer }, { formId: 'staff.homepage-hero-manager', subjectType: 'business_setting', subjectId: draft.id, actorId: 'admin-a' });
    assert.equal((await createBusinessSettingDraft(database, input)).id, draft.id);
    await assert.rejects(createBusinessSettingDraft(database, { ...input, actorId: 'admin-b' }));
    await assert.rejects(createBusinessSettingDraft(database, { ...input, form: {
      ...input.form, answers: { ...input.form.answers, answers: [] } } }));
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('controlled setting submission, rejection, approval and reversal each bind exact action context', async () => {
  const { sqlite, database } = await fixture();
  try {
    const context = form('staff.business-settings-manager');
    const draft = await createBusinessSettingDraft(database, { key: 'independent_seller_commission_bps',
      value: 1200, actorId: 'admin-a', reason: 'Controlled commission change', requestId: 'controlled-draft',
      now: 100, form: context });
    const submission = { id: draft.id, actorId: 'admin-a', expectedRevision: 1,
      reason: 'Submit controlled change', requestId: 'controlled-submit', now: 110, form: context };
    await submitBusinessSettingDraft(database, submission);
    assert.equal(count(sqlite, 'form_answer_sets'), 2);

    const rejection = { id: draft.id, actorId: 'admin-a', expectedRevision: 2,
      reason: 'Needs supporting evidence', requestId: 'controlled-reject', now: 130, form: context };
    await rejectBusinessSettingChange(database, rejection);
    assert.equal(count(sqlite, 'form_answer_sets'), 3);
    await submitBusinessSettingDraft(database, submission);
    await rejectBusinessSettingChange(database, rejection);
    await assert.rejects(submitBusinessSettingDraft(database, { ...submission, actorId: 'admin-b' }));
    await assert.rejects(rejectBusinessSettingChange(database, { ...rejection, reason: 'Changed rejection reason' }));
    await assert.rejects(createBusinessSettingReversalDraft(database, { sourceVersionId: draft.id,
      actorId: 'admin-a', reason: 'Reverse prior version', requestId: 'reverse-unpublished', now: 140,
      form: context }), /Only a published business setting/);
    assert.equal(count(sqlite, 'form_answer_sets'), 3);
    const audit = sqlite.prepare('SELECT previous_json AS previousJson,next_json AS nextJson FROM audit_logs WHERE request_id=?')
      .get('controlled-reject') as { previousJson: string; nextJson: string };
    assert.doesNotMatch(JSON.stringify(audit), /Approved fixture context|Review context/);
  } finally { sqlite.close(); }
});

void test('simple publish and controlled approval/reversal retain exact action answers', async () => {
  const { sqlite, database } = await fixture();
  try {
    const links = { linkedin: 'https://linkedin.com/company/hastabazaar', x: 'https://x.com/Hastabazaar',
      tiktok: 'https://tiktok.com/@hastabazaar', instagram: 'https://instagram.com/hastabazaar',
      facebook: 'https://www.facebook.com/hastabazaar', youtube: 'https://www.youtube.com/@hastabazaar' };
    const context = form('staff.business-settings-manager');
    const simple = await createBusinessSettingDraft(database, { key: 'official_social_links', value: links,
      actorId: 'admin-a', reason: 'Owner confirmed official social URLs', requestId: 'simple-draft',
      now: 100, form: context });
    const publication = { id: simple.id, actorId: 'admin-a', expectedRevision: 1,
      effectiveFrom: 200, reason: 'Publish approved social URLs', requestId: 'simple-publish', now: 150,
      form: context };
    await publishBusinessSettingDraft(database, publication);
    await publishBusinessSettingDraft(database, publication);
    await assert.rejects(publishBusinessSettingDraft(database, { ...publication, effectiveFrom: 201 }));
    const controlled = await createBusinessSettingDraft(database, { key: 'independent_seller_commission_bps',
      value: 1200, actorId: 'admin-a', reason: 'Controlled commission change', requestId: 'approve-draft',
      now: 300, form: context });
    await submitBusinessSettingDraft(database, { id: controlled.id, actorId: 'admin-a', expectedRevision: 1,
      reason: 'Submit controlled change', requestId: 'approve-submit', now: 310, form: context });
    const approval = { id: controlled.id, actorId: 'admin-a', expectedRevision: 2,
      effectiveFrom: 2_000_000_000, reason: 'Independent review approved', requestId: 'approve-action',
      now: 320, form: context };
    await approveBusinessSettingChange(database, approval);
    await approveBusinessSettingChange(database, approval);
    const reverse = { sourceVersionId: controlled.id, actorId: 'admin-a',
      reason: 'Restore previous commercial terms', requestId: 'approved-reverse', now: 330,
      form: context };
    const reversal = await createBusinessSettingReversalDraft(database, reverse);
    assert.equal((await createBusinessSettingReversalDraft(database, reverse)).id, reversal.id);
    assert.equal(count(sqlite, 'form_answer_sets'), 6);
    assert.equal(count(sqlite, 'business_setting_versions'), 3);
  } finally { sqlite.close(); }
});

void test('revoked actor and newer publication abort setting and answer atomically', async () => {
  const { sqlite, database } = await fixture();
  try {
    const input = { key: 'independent_seller_commission_bps' as const, value: 1200,
      actorId: 'admin-a', reason: 'Controlled commission change', requestId: 'revoked-attempt', now: 100,
      form: form('staff.business-settings-manager') };
    sqlite.exec("UPDATE users SET status='suspended' WHERE id='admin-a'");
    await assert.rejects(createBusinessSettingDraft(database, input));
    assert.equal(count(sqlite, 'business_setting_versions'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    sqlite.exec("UPDATE users SET status='active' WHERE id='admin-a'");
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
      created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('settings-v2','staff.business-settings-manager',2,1,'published',?,'New form','admin-a',2,'admin-a',2,'admin-a',2,'settings-v2')`)
      .run(JSON.stringify({ formId: 'staff.business-settings-manager', fields: [] }));
    await assert.rejects(createBusinessSettingDraft(database, input));
    assert.equal(count(sqlite, 'business_setting_versions'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
  } finally { sqlite.close(); }
});

void test('approval rechecks submission provenance inside the transaction', async () => {
  const { sqlite, database, db } = await fixture();
  try {
    const context = form('staff.business-settings-manager');
    const draft = await createBusinessSettingDraft(database, { key: 'independent_seller_commission_bps',
      value: 1200, actorId: 'admin-a', reason: 'Controlled commission change', requestId: 'race-draft',
      now: 100, form: context });
    await submitBusinessSettingDraft(database, { id: draft.id, actorId: 'admin-a', expectedRevision: 1,
      reason: 'Submit controlled change', requestId: 'race-submit', now: 110, form: context });
    db.beforeBatch = () => sqlite.prepare('UPDATE business_setting_versions SET submitted_by=? WHERE id=?')
      .run(null, draft.id);
    await assert.rejects(approveBusinessSettingChange(database, { id: draft.id, actorId: 'admin-b',
      expectedRevision: 2, effectiveFrom: 2_000_000_000, reason: 'Independent review approved',
      requestId: 'race-approve', now: 120, form: context }));
    assert.equal((sqlite.prepare('SELECT status FROM business_setting_versions WHERE id=?')
      .get(draft.id) as { status: string }).status, 'pending_approval');
    assert.equal(count(sqlite, 'form_answer_sets'), 2);
  } finally { sqlite.close(); }
});

void test('draft provenance remains bound to its original request after publication and archival', async () => {
  const { sqlite, database } = await fixture();
  try {
    const context = form('staff.business-settings-manager');
    const input = { key: 'official_social_links' as const, value: officialLinks, actorId: 'admin-a',
      reason: 'Fictional original draft provenance', requestId: 'immutable-draft-request', now: 100, form: context };
    const draft = await createBusinessSettingDraft(database, input);
    await publishBusinessSettingDraft(database, { id: draft.id, actorId: 'admin-a', expectedRevision: 1,
      effectiveFrom: 200, reason: 'Fictional later publication', requestId: 'immutable-publish-request', now: 150, form: context });
    publishLaterForm(sqlite);
    assert.equal((sqlite.prepare('SELECT last_request_id AS requestId FROM business_setting_versions WHERE id=?').get(draft.id) as {requestId:string}).requestId,
      'immutable-publish-request');
    const provenance = sqlite.prepare(`SELECT audit.next_json AS nextJson FROM form_answer_sets answer
      JOIN business_setting_versions parent ON parent.id=answer.subject_id AND parent.created_by=answer.actor_id
      JOIN audit_logs audit ON audit.subject_type=answer.subject_type AND audit.subject_id=parent.id
        AND audit.actor_id=answer.actor_id AND audit.request_id=answer.request_id
        AND audit.action='business_setting.draft_created'
      WHERE answer.form_id=? AND answer.request_id=? AND parent.id=?`).get(context.formId, input.requestId, draft.id) as {nextJson:string}|undefined;
    assert.ok(provenance, 'Original draft answer requires immutable parent/request/audit linkage.');
    const next = JSON.parse(provenance.nextJson) as Record<string,unknown>;
    assert.equal(next.key, input.key);assert.equal(next.formId, context.formId);
    assert.equal(next.configVersionId, context.versionId);assert.match(String(next.requestDigest), /^[a-f0-9]{64}$/);
    assert.doesNotMatch(provenance.nextJson,/Review context|Approved fixture context/);
    assert.equal((await createBusinessSettingDraft(database, input)).id,draft.id);
    assert.equal(count(sqlite,'business_setting_versions'),1);assert.equal(count(sqlite,'form_answer_sets'),2);assert.equal(count(sqlite,'audit_logs'),2);
    sqlite.prepare('UPDATE audit_logs SET next_json=? WHERE request_id=?').run(JSON.stringify({...next,requestDigest:'f'.repeat(64)}),input.requestId);
    await assert.rejects(createBusinessSettingDraft(database,input));
    assert.equal(count(sqlite,'audit_logs'),2);assert.equal(count(sqlite,'form_answer_sets'),2);
  } finally {sqlite.close();}
});

void test('draft audit and answer failures roll back the parent and both immutable records',async(t)=>{
  for(const failAt of [3,4])await t.test(`batch position ${failAt}`,async()=>{
    const {sqlite,database,db}=await fixture();
    try{
      db.failAt=failAt;
      await assert.rejects(createBusinessSettingDraft(database,{key:'homepage_hero_slides',value:[],actorId:'admin-a',
        reason:'Fictional atomic draft evidence',requestId:'draft-audit-rollback',now:100,form:form('staff.homepage-hero-manager')}));
      for(const table of ['business_setting_versions','audit_logs','form_answer_sets'])assert.equal(count(sqlite,table),0);
    }finally{sqlite.close();}
  });
});

void test('draft replay rejects forged or missing original audit authority and subject',async(t)=>{
  for(const corruption of ['missing','actor','request','subject','config'] as const)await t.test(corruption,async()=>{
    const {sqlite,database}=await fixture();
    try{
      const input={key:'homepage_hero_slides' as const,value:[],actorId:'admin-a',reason:'Fictional draft request binding',
        requestId:'draft-bound-audit',now:100,form:form('staff.homepage-hero-manager')};
      await createBusinessSettingDraft(database,input);
      if(corruption==='missing')sqlite.prepare('DELETE FROM audit_logs WHERE request_id=?').run(input.requestId);
      else if(corruption==='config')sqlite.prepare("UPDATE audit_logs SET next_json=json_set(next_json,'$.configVersionId','wrong-version') WHERE request_id=?").run(input.requestId);
      else sqlite.prepare(`UPDATE audit_logs SET ${corruption==='actor'?'actor_id':corruption==='request'?'request_id':'subject_id'}=? WHERE request_id=?`)
        .run('different-reference',input.requestId);
      await assert.rejects(createBusinessSettingDraft(database,input));
      assert.equal(count(sqlite,'business_setting_versions'),1);assert.equal(count(sqlite,'form_answer_sets'),1);
    }finally{sqlite.close();}
  });
});

void test('both settings routes accept a validated large custom snapshot while retaining finite envelope and domain limits', async(t)=>{
  for(const endpoint of ['draft','change'] as const)await t.test(endpoint,async()=>{
    const {sqlite,database}=await fixture(false);
    try{
      globalThis.settingsRouteDatabase=database;globalThis.settingsRouteActor={id:'admin-a',role:'super_admin'};
      const formId='staff.business-settings-manager';
      const fields=Array.from({length:8},(_,order)=>({id:`review_detail_${order}`,key:`review_detail_${order}`,
        label:`Review detail ${order}`,type:'long_text',required:true,order,status:'active'}));
      sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
        created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES('large-settings-v2',?,2,1,'published',?,'Large fixture','admin-a',2,'admin-a',2,'admin-a',2,'large-settings-publish')`)
        .run(formId,JSON.stringify({formId,fields}));
      const parent=endpoint==='change'?await createBusinessSettingDraft(database,{key:'independent_seller_commission_bps',
        value:1200,actorId:'admin-a',reason:'Fictional controlled setting',requestId:'large-fixture-draft',now:100}):null;
      const body={key:'official_social_links',value:officialLinks,action:parent?'submit':'draft',expectedRevision:1,
        reason:'Fictional large-context setting',requestId:'large-custom-context',sourceFormId:formId,formVersion:2,
        customAnswers:fields.map(field=>({fieldId:field.id,value:'Fictional detail'.repeat(300)}))};
      const definition=FORM_REGISTRY[formId];
      const draft=validateFormDraft(formId,{formId,fields});
      const answers=validateAnswersForDefinition(definition,{...draft,version:2,publishedAt:2},body.customAnswers);
      const validated={formId,versionId:'large-settings-v2',answers};
      const snapshotBytes=new TextEncoder().encode(JSON.stringify(validated.answers)).length;
      assert.ok(snapshotBytes>32768&&snapshotBytes<131072,'The real answer validator accepts this snapshot.');
      const submit=async(payload:Record<string,unknown>)=>{
        const request=new Request('http://localhost/api/admin/business-settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
        return parent? (await import('../app/api/admin/business-settings/changes/[id]/route')).POST(request,{params:Promise.resolve({id:parent.id})})
          :(await import('../app/api/admin/business-settings/route')).POST(request);
      };
      const domainBudget=endpoint==='draft'?32768:16384;
      assert.equal((await submit({...body,extra:'x'.repeat(domainBudget)})).status,413,'Existing non-custom domain budget is preserved.');
      assert.equal((await submit({...body,customAnswers:[{fieldId:fields[0].id,value:'x'.repeat(256*1024)}]})).status,413,'Streaming body stays finitely bounded.');
      assert.equal(count(sqlite,'form_answer_sets'),0);assert.equal(count(sqlite,'audit_logs'),0);
      assert.equal((await submit(body)).status,parent?200:201);
      assert.equal(count(sqlite,'form_answer_sets'),1);assert.equal(count(sqlite,'audit_logs'),1);
      const answer=sqlite.prepare('SELECT answers_json AS json FROM form_answer_sets').get() as {json:string};
      assert.deepEqual(JSON.parse(answer.json),validated.answers);
    }finally{sqlite.close();globalThis.settingsRouteActor=null;}
  });
});

void test('same-Super-Admin decisions deny revoked authority and stale transaction revisions atomically', async (t) => {
  for (const action of ['approve', 'reject'] as const) {
    for (const mutation of ['ordinary_admin', 'suspended', 'revision', 'draft', 'missing_submitter'] as const) await t.test(action + ':' + mutation, async () => {
      const { sqlite, database, db } = await fixture();
      try {
        const context = form('staff.business-settings-manager');
        const draft = await createBusinessSettingDraft(database, { key: 'independent_seller_commission_bps', value: 1200, actorId: 'admin-a', reason: 'Controlled commission change', requestId: 'denial-draft', now: 100, form: context });
        await submitBusinessSettingDraft(database, { id: draft.id, actorId: 'admin-a', expectedRevision: 1, reason: 'Submit controlled change', requestId: 'denial-submit', now: 110, form: context });
        db.beforeBatch = () => {
          if (mutation === 'ordinary_admin') sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='admin-a'");
          if (mutation === 'suspended') sqlite.exec("UPDATE users SET status='suspended' WHERE id='admin-a'");
          if (mutation === 'revision') sqlite.prepare('UPDATE business_setting_versions SET revision=revision+1 WHERE id=?').run(draft.id);
          if (mutation === 'draft') sqlite.prepare("UPDATE business_setting_versions SET status='draft' WHERE id=?").run(draft.id);
          if (mutation === 'missing_submitter') sqlite.prepare('UPDATE business_setting_versions SET submitted_by=NULL WHERE id=?').run(draft.id);
        };
        const input = { id: draft.id, actorId: 'admin-a', expectedRevision: 2, effectiveFrom: 2_000_000_000, reason: 'Review controlled change', requestId: 'denial-action', now: 120, form: context };
        await assert.rejects(action === 'approve' ? approveBusinessSettingChange(database, input) : rejectBusinessSettingChange(database, input));
        const record = sqlite.prepare('SELECT status, approved_by FROM business_setting_versions WHERE id=?').get(draft.id);
        assert.equal(record?.status, mutation === 'draft' ? 'draft' : 'pending_approval');
        assert.equal(record?.approved_by, null);
        assert.equal(count(sqlite, 'form_answer_sets'), 2);
        assert.equal((sqlite.prepare("SELECT count(*) AS n FROM audit_logs WHERE request_id='denial-action'").get())?.n, 0);
      } finally { sqlite.close(); }
    });
  }
});
