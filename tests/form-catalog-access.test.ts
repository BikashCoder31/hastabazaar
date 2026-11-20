import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { register, registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { stubFixtureLink } from './helpers/browser-fixture-link';

import { authorizeFormAnswerRead } from '../lib/forms/access';
import { collectFormAnswersForPrivacy, eraseFormAnswersForPrivacy,
  placeDataRightsLegalHold, releaseDataRightsLegalHold } from '../lib/forms/privacy';
import { AnswerDetails } from '../components/forms/answer-details';
import { buildFormAnswerInsert, getFormAnswerById, listFormAnswersForSubject } from '../lib/db/repositories/form-answers';

declare global {
  var answerTestCreateElement: typeof createElement;
  var answerTestDb: D1Database;
  var answerTestSubject: string | null;
  var answerTestStaffPermissions: readonly string[];
  var answerTestStaffActor: { id: string; role: 'admin' | 'super_admin'; permissions: readonly string[] } | null;
}
globalThis.answerTestCreateElement = createElement;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'next/link') return { url: 'data:text/javascript,export default function Link({children,...props}){return globalThis.answerTestCreateElement("a",props,children)}', shortCircuit: true };
  return nextResolve(specifier, context);
} });

register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {get DB(){return globalThis.answerTestDb}}', shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function useRouter(){return {refresh(){}}}', shortCircuit: true };
  if (specifier === '@/app/auth' || specifier.endsWith('/app/auth.ts')) return { url: 'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.answerTestSubject ? {userId:globalThis.answerTestSubject,email:"test@example.invalid"} : null}', shortCircuit: true };
  if (specifier === '@/lib/db/repositories/staff-permissions' || specifier.endsWith('/lib/db/repositories/staff-permissions.ts')) return { url: 'data:text/javascript,export async function getStaffPermissionProfile(){return {permissions:globalThis.answerTestStaffPermissions}};export async function hasStaffPermissionBySubject(){return false}', shortCircuit: true };
  if (specifier === '@/lib/auth/customer' || specifier.endsWith('/lib/auth/customer.ts')) return { url: 'data:text/javascript,export async function requireCustomerPage(){return {userId:"owner",authSubject:"auth-owner",email:"owner@example.invalid",displayName:"Owner",phone:null,locale:"en-NP"}}', shortCircuit: true };
  if (specifier === '@/components/account/account-ui' || specifier.endsWith('/components/account/account-ui.tsx')) return { url: 'data:text/javascript,export function AccountHeading(){return null}', shortCircuit: true };
  if (specifier === '@/components/account/profile-form' || specifier.endsWith('/components/account/profile-form.tsx')) return { url: 'data:text/javascript,export function ProfileForm(){return null}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff' || specifier.endsWith('/lib/auth/staff.ts')) return { url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(){if(!globalThis.answerTestStaffActor)throw new StaffAuthorizationError("Authentication is required.",401);return globalThis.answerTestStaffActor}', shortCircuit: true };
  const resolved = await nextResolve(specifier, context);
  if (resolved.url.endsWith('/app/auth.ts')) return { url: 'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.answerTestSubject ? {userId:globalThis.answerTestSubject,email:"test@example.invalid"} : null}', shortCircuit: true };
  if (resolved.url.endsWith('/lib/db/repositories/staff-permissions.ts')) return { url: 'data:text/javascript,export async function getStaffPermissionProfile(){return {permissions:globalThis.answerTestStaffPermissions}};export async function hasStaffPermissionBySubject(){return false}', shortCircuit: true };
  if (resolved.url.endsWith('/lib/auth/customer.ts')) return { url: 'data:text/javascript,export async function requireCustomerPage(){return {userId:"owner",authSubject:"auth-owner",email:"owner@example.invalid",displayName:"Owner",phone:null,locale:"en-NP"}}', shortCircuit: true };
  if (resolved.url.endsWith('/components/account/account-ui.tsx')) return { url: 'data:text/javascript,export function AccountHeading(){return null}', shortCircuit: true };
  if (resolved.url.endsWith('/components/account/profile-form.tsx')) return { url: 'data:text/javascript,export function ProfileForm(){return null}', shortCircuit: true };
  if (resolved.url.endsWith('/lib/auth/staff.ts')) return { url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(){if(!globalThis.answerTestStaffActor)throw new StaffAuthorizationError("Authentication is required.",401);return globalThis.answerTestStaffActor}', shortCircuit: true };
  return resolved;
}
`)}`, import.meta.url);

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync, private readonly beforeRun: () => void,
    private readonly beforeFirst: () => void) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { this.beforeFirst(); return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() {
    this.beforeRun();
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

class Database {
  failStatement: number | null = null;
  beforeBatch: (() => void | Promise<void>) | null = null;
  beforeRun: ((sql: string) => void) | null = null;
  beforeFirst: ((sql: string) => void) | null = null;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql), () => this.beforeRun?.(sql),
    () => this.beforeFirst?.(sql)); }
  async batch(statements: readonly Statement[]) {
    await this.beforeBatch?.();
    this.beforeBatch = null;
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const [index, statement] of statements.entries()) {
        if (this.failStatement === index) throw new Error('Simulated batch failure');
        results.push(await statement.run());
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE users(id TEXT PRIMARY KEY, auth_subject TEXT, status TEXT NOT NULL);
    CREATE TABLE user_roles(user_id TEXT NOT NULL, role TEXT NOT NULL);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT,
      subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT, request_id TEXT,
      created_at INTEGER);
    CREATE TABLE data_rights_requests(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL,
      request_type TEXT NOT NULL, status TEXT NOT NULL, assigned_to TEXT,
      resolution TEXT,operation_request_id TEXT,updated_at INTEGER,completed_at INTEGER);
    CREATE TABLE data_rights_events(id TEXT PRIMARY KEY,data_rights_request_id TEXT,
      from_status TEXT,to_status TEXT,action TEXT,actor_id TEXT,actor_role TEXT,note TEXT,
      operation_request_id TEXT UNIQUE,created_at INTEGER);
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    CREATE TABLE products(id TEXT PRIMARY KEY, seller_id TEXT NOT NULL);
    CREATE TABLE orders(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL);
    CREATE TABLE order_items(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, seller_id TEXT NOT NULL);
    CREATE TABLE return_requests(id TEXT PRIMARY KEY, order_item_id TEXT NOT NULL);
    CREATE TABLE complaints(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, seller_id TEXT NOT NULL);
    CREATE TABLE gift_cards(id TEXT PRIMARY KEY, issued_by TEXT, redeemed_by TEXT);
    CREATE TABLE order_cancellation_events(id TEXT PRIMARY KEY,order_id TEXT,actor_id TEXT);
    CREATE TABLE order_cancellation_reviews(id TEXT PRIMARY KEY,order_id TEXT,requested_by TEXT);
    -- Empty incentive parents keep this partial fixture compatible with financial privacy exports.
    CREATE TABLE promo_campaigns(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE promo_revisions(campaign_id TEXT,revision INTEGER,label TEXT,kind TEXT,
      fixed_paisa INTEGER,percent_bps INTEGER,max_discount_paisa INTEGER);
    CREATE TABLE promo_redemptions(id TEXT PRIMARY KEY,campaign_id TEXT,revision INTEGER,
      customer_id TEXT,order_id TEXT,request_id TEXT,discount_paisa INTEGER,
      subtotal_paisa INTEGER,created_at INTEGER);
    CREATE TABLE loyalty_revisions(revision INTEGER PRIMARY KEY,points_per_block INTEGER,
      credit_paisa_per_block INTEGER);
    CREATE TABLE loyalty_daily_claims(id TEXT PRIMARY KEY,user_id TEXT,request_id TEXT,
      revision INTEGER,local_date TEXT,awarded_points INTEGER,form_version_id TEXT,created_at INTEGER);
    CREATE TABLE loyalty_points_entries(id TEXT PRIMARY KEY,user_id TEXT,points INTEGER,kind TEXT,
      claim_id TEXT,redemption_id TEXT,created_at INTEGER);
    CREATE TABLE loyalty_redemptions(id TEXT PRIMARY KEY,user_id TEXT,request_id TEXT,
      revision INTEGER,points INTEGER,credit_paisa INTEGER,form_version_id TEXT,created_at INTEGER);
    CREATE TABLE wallet_entries(id TEXT PRIMARY KEY,user_id TEXT,loyalty_redemption_id TEXT,
      amount_paisa INTEGER,kind TEXT,created_at INTEGER);
    CREATE TABLE rider_profiles(user_id TEXT PRIMARY KEY);
    CREATE TABLE rider_applications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL);
    CREATE TABLE rider_reports(id TEXT PRIMARY KEY,rider_user_id TEXT NOT NULL);
    CREATE TABLE parcel_cash_records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,rider_user_id TEXT NOT NULL);
    CREATE TABLE rider_events(id TEXT PRIMARY KEY,action TEXT NOT NULL,user_id TEXT NOT NULL);
    CREATE TABLE addresses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL);
    CREATE TABLE product_reviews(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL,product_id TEXT);
    CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL);
    CREATE TABLE shipping_job_events(id TEXT PRIMARY KEY,shipping_job_id TEXT NOT NULL);
    CREATE TABLE payout_requests(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL);
    CREATE TABLE review_replies(id TEXT PRIMARY KEY,review_id TEXT NOT NULL,seller_id TEXT NOT NULL);
    CREATE TABLE managed_supply_records(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL);
    CREATE TABLE seller_route_transition_applications(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL);
    INSERT INTO users VALUES ('owner','auth-owner','active'),('other','auth-other','active'),
      ('staff','auth-staff','active'),('staff-other','auth-staff-other','active'),
      ('seller','auth-seller','active'),('rider','auth-rider','active'),('inactive','auth-inactive','disabled');
    INSERT INTO user_roles VALUES ('owner','customer'),('other','customer'),('staff','admin'),
      ('staff-other','admin'),('seller','seller'),('rider','rider'),('inactive','super_admin');
    INSERT INTO seller_profiles VALUES ('seller-profile','seller');
    INSERT INTO rider_profiles VALUES ('rider');
    INSERT INTO data_rights_requests(id,customer_id,request_type,status,assigned_to)
      VALUES ('delete-owner','owner','deletion','approved','staff');
    INSERT INTO data_rights_requests(id,customer_id,request_type,status,assigned_to)
      VALUES ('access-owner','owner','access','assigned','staff');
  `);
  for (const path of ['../drizzle/0031_staff_permissions.sql', '../drizzle/0056_form_catalog.sql', '../drizzle/0057_data_rights_legal_holds.sql', '../drizzle/0058_address_answer_owner_tombstones.sql']) {
    const migration = await readFile(new URL(path, import.meta.url), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
  }
  // Current answer writes use these canonical columns; only this owned :memory: fixture changes.
  const healthMigration = await readFile(new URL('../drizzle/0151_form_health_records.sql', import.meta.url), 'utf8');
  for (const statement of healthMigration.split('--> statement-breakpoint').slice(0, 4))
    if (statement.trim()) sqlite.exec(statement);
  const choice = { id: 'color', key: 'color', type: 'single_choice', label: 'Original color',
    required: false, order: 0, status: 'active', choices: [{ value: 'blue', label: 'Original blue' }] };
  const config = JSON.stringify({ formId: 'account.profile', fields: [choice] });
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
    reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES ('v1','account.profile',1,1,'published',?,'Seed','staff',1,'staff',1,'staff',1,'seed-v1')`).run(config);
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
    reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES ('v2','account.profile',2,1,'published',?,'Archive','staff',2,'staff',2,'staff',2,'seed-v2')`)
    .run(JSON.stringify({ formId: 'account.profile', fields: [{ ...choice, status: 'archived' }] }));
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
    reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES ('privacy-v1','staff.privacy-action',1,1,'published',?,
      'Test action form','staff',1,'staff',1,'staff',1,'privacy-seed')`)
    .run(JSON.stringify({ formId: 'staff.privacy-action', fields: [] }));
  const answer = JSON.stringify({ formId: 'account.profile', version: 1, answers: [
    { fieldId: 'color', label: 'Original color', type: 'single_choice', value: 'blue' },
  ] });
  for (const [id, subjectType, subjectId, actorId] of [
    ['a-owner', 'user', 'owner', 'owner'], ['a-other', 'user', 'other', 'other'],
    ['a-seller', 'seller', 'seller-profile', 'seller'], ['a-rider', 'rider', 'rider', 'rider'],
  ]) {
    sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES (?, 'account.profile', ?, 'v1', ?, ?, ?, ?, 1)`)
      .run(id, `request-${id}`, subjectType, subjectId, actorId, answer);
  }
  // Profile rendering reads identity proofs; use canonical table DDL at this partial fixture boundary.
  sqlite.exec('ALTER TABLE users ADD COLUMN email TEXT');
  sqlite.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  sqlite.exec("UPDATE users SET email=id || '@example.invalid'");
  for (const path of ['0028_identity_purchase_security.sql', '0064_checkout_contact_verification.sql']) {
    const migration = await readFile(new URL(`../drizzle/${path}`, import.meta.url), 'utf8');
    sqlite.exec(migration.split('--> statement-breakpoint')[0]);
  }
  const database = new Database(sqlite);
  globalThis.answerTestDb = database as unknown as D1Database;
  globalThis.answerTestSubject = 'auth-owner';
  globalThis.answerTestStaffPermissions = ['support.manage'];
  globalThis.answerTestStaffActor = { id: 'staff', role: 'admin', permissions: ['support.manage'] };
  return { sqlite, database, db: database as unknown as D1Database };
}

function count(sqlite: DatabaseSync) {
  return Number((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count);
}

void test('answer read grants exact owner and denies other customers, sellers, and riders', async () => {
  const { sqlite, db } = await fixture();
  try {
    const own = await getFormAnswerById(db, 'a-owner');
    const other = await getFormAnswerById(db, 'a-other');
    const seller = await getFormAnswerById(db, 'a-seller');
    const rider = await getFormAnswerById(db, 'a-rider');
    assert.ok(own && other && seller && rider);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'owner', role: 'customer' }, own), true);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'owner', role: 'customer' }, other), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'owner', role: 'customer' }, seller), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'seller', role: 'seller' }, seller), true);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'seller', role: 'seller' }, rider), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'rider', role: 'rider' }, rider), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'rider', role: 'rider' }, seller), false);
  } finally { sqlite.close(); }
});

void test('staff needs record assignment as well as support permission', async () => {
  const { sqlite, db } = await fixture();
  try {
    const answer = await getFormAnswerById(db, 'a-owner');
    assert.ok(answer);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'staff', role: 'admin', permissions: ['support.manage'] }, answer), true);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'staff-other', role: 'admin', permissions: ['support.manage'] }, answer), false);
    // A missing persisted profile uses the existing legacy Admin grant, not a caller snapshot.
    assert.equal(await authorizeFormAnswerRead(db, { id: 'staff', role: 'admin', permissions: [] }, answer), true);
    sqlite.prepare(`INSERT INTO staff_permission_profiles
      (user_id,permissions_json,version,updated_by,updated_at) VALUES ('staff','[]',1,'staff-other',1)`).run();
    assert.equal(await authorizeFormAnswerRead(db, { id: 'staff', role: 'admin', permissions: [] }, answer), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'inactive', role: 'super_admin' }, answer), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'staff', role: 'admin', permissions: ['support.manage'] },
      (await getFormAnswerById(db, 'a-seller'))!), false);
  } finally { sqlite.close(); }
});

void test('staff assigned to another case for the same owner cannot read this case answer', async () => {
  const { sqlite, db } = await fixture();
  try {
    sqlite.exec("UPDATE data_rights_requests SET assigned_to='staff-other' WHERE id='access-owner'");
    sqlite.exec(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      SELECT 'a-access-case','account.profile','request-case-answer','v1',
        'data_rights_request','access-owner','owner',answers_json,2
      FROM form_answer_sets WHERE id='a-owner'`);
    const answer = await getFormAnswerById(db, 'a-access-case');
    assert.ok(answer);
    assert.equal(await authorizeFormAnswerRead(db,
      { id: 'staff', role: 'admin', permissions: ['support.manage'] }, answer), false);
    assert.equal(await authorizeFormAnswerRead(db,
      { id: 'staff-other', role: 'admin', permissions: ['support.manage'] }, answer), true);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'owner', role: 'customer' }, answer), true);
  } finally { sqlite.close(); }
});

void test('answer details preserve submission labels and choice labels and mark archived fields historical', async () => {
  const { sqlite, db } = await fixture();
  try {
    const answer = await getFormAnswerById(db, 'a-owner');
    assert.ok(answer);
    const html = renderToStaticMarkup(createElement(AnswerDetails, { answer }));
    assert.match(html, /Original color/);
    assert.match(html, /Original blue/);
    assert.match(html, /Historical/);

    assert.doesNotMatch(html, /password|token|credential/i);
  } finally { sqlite.close(); }
});

void test('answer API hides other records and emits only safe snapshot fields', async () => {
  const { sqlite } = await fixture();
  try {
    const { GET } = await import('../app/api/forms/answers/[id]/route');
    const call = (id: string) => GET(new Request(`http://localhost/api/forms/answers/${id}`), { params: Promise.resolve({ id }) });
    const owned = await call('a-owner');
    assert.equal(owned.status, 200);
    assert.equal(owned.headers.get('cache-control'), 'no-store');
    const body = await owned.json() as { answer: { answers: { answers: { label: string; choiceLabels: string[] }[] } } };
    assert.equal(body.answer.answers.answers[0].label, 'Original color');
    assert.deepEqual(body.answer.answers.answers[0].choiceLabels, ['Original blue']);
    assert.doesNotMatch(JSON.stringify(body), /authSubject|actorId|requestId|password|credential|token/i);
    assert.equal((await call('a-other')).status, 404);
    assert.equal((await call('a-seller')).status, 404);
    globalThis.answerTestSubject = null;
    assert.equal((await call('a-owner')).status, 401);
  } finally { sqlite.close(); }
});

for (const [change, permissionsJson] of [
  ['revoked', '[]'], ['malformed', 'not-json'],
] as const) {
  void test(`answer API denies a staff read when its persisted grant becomes ${change} during answer fetch`, async () => {
    const { sqlite, database } = await fixture();
    try {
      sqlite.prepare(`INSERT INTO staff_permission_profiles
        (user_id,permissions_json,version,updated_by,updated_at) VALUES ('staff',?,1,'staff-other',1)`)
        .run(JSON.stringify(['support.manage']));
      globalThis.answerTestSubject = 'auth-staff';
      let injected = false;
      database.beforeFirst = (sql) => {
        if (!sql.includes('a.answers_json AS answersJson') || !sql.includes('WHERE a.id=? LIMIT 1')) return;
        assert.match(sql, /UNION ALL SELECT/);
        database.beforeFirst = null;
        injected = true;
        sqlite.prepare('UPDATE staff_permission_profiles SET permissions_json=?,version=2 WHERE user_id=?')
          .run(permissionsJson, 'staff');
      };
      const { GET } = await import('../app/api/forms/answers/[id]/route');
      const response = await GET(new Request('http://localhost/api/forms/answers/a-owner'),
        { params: Promise.resolve({ id: 'a-owner' }) });
      assert.equal(injected, true, 'permission change must occur at the actual answer read');
      assert.equal(sqlite.prepare('SELECT permissions_json FROM staff_permission_profiles WHERE user_id=?').get('staff')?.permissions_json, permissionsJson);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.doesNotMatch(await response.text(), /Original color|Original blue|a-owner/);
    } finally { sqlite.close(); }
  });
}

void test('profile page shows only the owner historical answers', async () => {
  const { sqlite } = await fixture();
  try {
    const { default: ProfilePage } = await import('../app/account/profile/page');
    const html = renderToStaticMarkup(await ProfilePage());
    assert.match(html, /Original color/);
    assert.match(html, /Original blue/);
    assert.match(html, /Historical/);
    assert.match(html, /Verify your contact details/);
    assert.doesNotMatch(html, />Verified</);
    assert.doesNotMatch(html, /a-other|auth-other/);
  } finally { sqlite.close(); }
});

void test('profile page offers bounded, navigable history beyond 200 answers', async () => {
  const { sqlite } = await fixture();
  try {
    const insert = sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      SELECT ?,form_id,?,config_version_id,subject_type,subject_id,actor_id,answers_json,?
      FROM form_answer_sets WHERE id='a-owner'`);
    for (let index = 1; index <= 205; index++)
      insert.run(`a-bulk-${String(index).padStart(3, '0')}`, `request-bulk-${index}`, index + 1);
    const { default: ProfilePage } = await import('../app/account/profile/page');
    const first = renderToStaticMarkup(await ProfilePage());
    assert.equal((first.match(/Original color/g) ?? []).length, 50);
    assert.match(first, /historyAt=50/);
    const second = renderToStaticMarkup(await ProfilePage({ searchParams: Promise.resolve({
      historyAt: '50', historyId: 'a-bulk-049',
    }) }));
    assert.equal((second.match(/Original color/g) ?? []).length, 50);
    assert.match(second, /historyAt=100/);
    assert.doesNotMatch(second, /a-other|auth-other/);
  } finally { sqlite.close(); }
});

void test('privacy controls expose explicit actions only for an assigned approved request', async () => {
  const { PrivacyActions } = await import('../components/admin/privacy-actions');
  const eligibleAccess = renderToStaticMarkup(createElement(PrivacyActions, {
    id: 'access-owner', status: 'approved', requestType: 'access',
    assignedToCurrentStaff: true, canDecide: false,
  }));
  assert.match(eligibleAccess, /Export form answers/);
  assert.doesNotMatch(eligibleAccess, /Erase profile answers/);
  const unassigned = renderToStaticMarkup(createElement(PrivacyActions, {
    id: 'access-owner', status: 'approved', requestType: 'access',
    assignedToCurrentStaff: false, canDecide: true,
  }));
  assert.doesNotMatch(unassigned, /Export form answers|Erase profile answers/);
  const eligibleDeletion = renderToStaticMarkup(createElement(PrivacyActions, {
    id: 'delete-owner', status: 'approved', requestType: 'deletion',
    assignedToCurrentStaff: true, canDecide: true,
  }));
  assert.match(eligibleDeletion, /Erase profile answers/);
  assert.match(eligibleDeletion, /Linked seller, delivery, order, and case records remain/);
});

void test('mounted access export can start a fresh attempt after an audited-ID conflict', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright is provided by the external workspace runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'privacy-mounted-fixture.tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { PrivacyActions } from './components/admin/privacy-actions';
    createRoot(document.getElementById('root')!).render(<PrivacyActions id="access-owner"
      status="approved" requestType="access" assignedToCurrentStaff={true} canDecide={false} />);
  `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'privacy-navigation', setup(build) {
    stubFixtureLink(build);
    build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'privacy-fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'privacy-fixture' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
  } }] });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ acceptDownloads: true });
  const requestIds: string[] = [];
  try {
    await page.route('https://privacy.test/**', async (route: {
      request(): { url(): string; postDataJSON(): { requestId: string } | null };
      fulfill(input: { status: number; contentType: string; body: string }): Promise<void>;
    }) => {
      if (new URL(route.request().url()).pathname === '/')
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div>' });
      const payload = route.request().postDataJSON();
      if (!payload) return route.fulfill({ status: 404, contentType: 'text/plain', body: '' });
      requestIds.push(payload.requestId);
      if (requestIds.length === 1 || payload.requestId === requestIds[0])
        return route.fulfill({ status: 409, contentType: 'application/json',
          body: JSON.stringify({ error: 'This export request ID was already used. Start a new export to obtain current data.' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answers: [] }) });
    });
    await page.goto('https://privacy.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const button = page.getByRole('button', { name: 'Export form answers' });
    await button.click();
    await page.getByRole('alert').getByText(/already used/).waitFor();
    const repeatedConflict = page.waitForResponse((response: { url(): string }) => response.url().endsWith('/api/admin/privacy/access-owner'));
    await button.click();
    await repeatedConflict;
    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[1], requestIds[0], 'a generic conflict keeps the uncertain request ID');
    const reset = page.getByRole('button', { name: 'Start a new export attempt' });
    await page.evaluate(() => { window.confirm = () => false; });
    await reset.click();
    assert.equal(requestIds.length, 2, 'canceling the duplicate-risk reset sends no request');
    await page.evaluate(() => { window.confirm = () => true; });
    await reset.click();
    const downloadReady = page.waitForEvent('download');
    await button.click();
    const download = await downloadReady;
    assert.equal(download.suggestedFilename(), 'form-answers-access-owner.json');
    await page.getByText('Form-answer export prepared. Request status is unchanged.').waitFor();
    assert.equal(requestIds.length, 3);
    assert.notEqual(requestIds[0], requestIds[2]);
  } finally { await page.close(); await browser.close(); }
});

void test('privacy access action exports only an assigned approved request and audits once', async () => {
  const { sqlite } = await fixture();
  try {
    sqlite.exec("UPDATE data_rights_requests SET status='approved' WHERE id='access-owner'");
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const call = (id: string, requestId: string) => POST(new Request(`http://localhost:3000/api/admin/privacy/${id}`, {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'export_answers', requestId }),
    }), { params: Promise.resolve({ id }) });
    globalThis.answerTestStaffActor = { id: 'staff-other', role: 'admin', permissions: ['support.manage'] };
    assert.equal((await call('access-owner', 'export-denied')).status, 403);
    globalThis.answerTestStaffActor = { id: 'staff', role: 'admin', permissions: ['support.manage'] };
    const response = await call('access-owner', 'export-once');
    assert.equal(response.status, 200);
    const body = await response.json() as { answers: { id: string; answers: { answers: { label: string }[] } }[] };
    assert.deepEqual(body.answers.map((row) => row.id), ['a-owner']);
    assert.equal(body.answers[0].answers.answers[0].label, 'Original color');
    assert.doesNotMatch(JSON.stringify(body), /authSubject|actorId|password|credential|token/i);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='form.answers.exported'").get()?.count, 1);
    assert.equal((await call('access-owner', 'export-once')).status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='form.answers.exported'").get()?.count, 1);
  } finally { sqlite.close(); }
});

void test('access export rejects a request ID claimed by another case after its precheck', async () => {
  const { sqlite, database } = await fixture();
  try {
    sqlite.exec("UPDATE data_rights_requests SET status='approved' WHERE id='access-owner'");
    database.beforeRun = (sql) => {
      if (!sql.includes("'form.answers.exported'")) return;
      database.beforeRun = null;
      sqlite.exec(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,
        request_id,created_at) VALUES ('competing-export','staff','form.answers.exported',
        'data_rights_request','other-case','form-answer-export:shared-export',1)`);
    };
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const response = await POST(new Request('http://localhost:3000/api/admin/privacy/access-owner', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'export_answers', requestId: 'shared-export' }),
    }), { params: Promise.resolve({ id: 'access-owner' }) });
    assert.equal(response.status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id='form-answer-export:shared-export'").get()?.count, 1);
    assert.equal(sqlite.prepare("SELECT subject_id FROM audit_logs WHERE request_id='form-answer-export:shared-export'").get()?.subject_id, 'other-case');
  } finally { sqlite.close(); }
});

void test('access export does not return answers when Admin support grant is revoked before final audit', async () => {
  const { sqlite, database } = await fixture();
  try {
    sqlite.exec("UPDATE data_rights_requests SET status='approved' WHERE id='access-owner'");
    sqlite.prepare(`INSERT INTO staff_permission_profiles
      (user_id,permissions_json,version,updated_by,updated_at) VALUES ('staff',?,1,'staff-other',1)`)
      .run(JSON.stringify(['support.manage']));
    database.beforeRun = (sql) => {
      if (!sql.includes("'form.answers.exported'")) return;
      database.beforeRun = null;
      sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]',version=2 WHERE user_id='staff'");
    };
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const response = await POST(new Request('http://localhost:3000/api/admin/privacy/access-owner', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'export_answers', requestId: 'export-revoked' }),
    }), { params: Promise.resolve({ id: 'access-owner' }) });
    assert.equal(response.status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='form.answers.exported'").get()?.count, 0);
    assert.doesNotMatch(await response.text(), /Original color|Original blue|a-owner/);
  } finally { sqlite.close(); }
});

void test('access export treats malformed persisted Admin permissions as revoked', async () => {
  const { sqlite } = await fixture();
  try {
    sqlite.exec("UPDATE data_rights_requests SET status='approved' WHERE id='access-owner'");
    sqlite.exec(`INSERT INTO staff_permission_profiles
      (user_id,permissions_json,version,updated_by,updated_at)
      VALUES ('staff','not-json',1,'staff-other',1)`);
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const response = await POST(new Request('http://localhost:3000/api/admin/privacy/access-owner', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'export_answers', requestId: 'export-malformed-grant' }),
    }), { params: Promise.resolve({ id: 'access-owner' }) });
    assert.equal(response.status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='form.answers.exported'").get()?.count, 0);
    assert.doesNotMatch(await response.text(), /Original color|Original blue|a-owner/);
  } finally { sqlite.close(); }
});

void test('privacy erasure action requires assigned Super Admin and respects stored hold', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const call = (requestId: string) => POST(new Request('http://localhost:3000/api/admin/privacy/delete-owner', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'erase_answers', requestId }),
    }), { params: Promise.resolve({ id: 'delete-owner' }) });
    assert.equal((await call('erase-admin')).status, 403);
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    globalThis.answerTestStaffActor = { id: 'staff', role: 'super_admin', permissions: [] };
    sqlite.exec(`INSERT INTO data_rights_legal_holds(id,user_id,reason,placed_by,placed_at)
      VALUES ('hold-owner','owner','Open dispute','staff',5)`);
    assert.equal((await call('erase-held')).status, 409);
    assert.equal(count(sqlite), 4);
    sqlite.exec("UPDATE data_rights_legal_holds SET released_by='staff',released_at=6 WHERE id='hold-owner'");
    assert.equal((await call('erase-once')).status, 200);
    assert.equal((await call('erase-once')).status, 200);
    assert.equal(count(sqlite), 3);
    assert.equal(sqlite.prepare("SELECT status FROM data_rights_requests WHERE id='delete-owner'").get()?.status, 'approved');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='form.answers.erased'").get()?.count, 1);
  } finally { sqlite.close(); }
});

void test('request completion alone cannot claim an access export or deletion occurred', async () => {
  const { sqlite } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    globalThis.answerTestStaffActor = { id: 'staff', role: 'super_admin', permissions: [] };
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    for (const id of ['access-owner', 'delete-owner']) {
      sqlite.prepare("UPDATE data_rights_requests SET status='approved' WHERE id=?").run(id);
      const response = await POST(new Request(`http://localhost:3000/api/admin/privacy/${id}`, {
        method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'complete', note: 'All reviewed work is documented.', requestId: `complete-${id}`,
          formVersion: 1, customAnswers: [] }),
      }), { params: Promise.resolve({ id }) });
      assert.equal(response.status, 409, id);
      assert.equal(sqlite.prepare('SELECT status FROM data_rights_requests WHERE id=?').get(id)?.status, 'approved');
    }
  } finally { sqlite.close(); }
});

void test('privacy action route rejects a JSON null body as a client error', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const response = await POST(new Request('http://localhost:3000/api/admin/privacy/delete-owner', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: 'null',
    }), { params: Promise.resolve({ id: 'delete-owner' }) });
    assert.equal(response.status, 400);
  } finally { sqlite.close(); }
});

void test('partial profile erasure cannot complete deletion while owned seller answers remain', async () => {
  const { sqlite, db } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    sqlite.exec("INSERT INTO seller_profiles VALUES ('owner-seller-profile','owner')");
    sqlite.exec(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      SELECT 'owner-seller-answer',form_id,'owner-seller-answer-request',config_version_id,
        'seller','owner-seller-profile',actor_id,answers_json,3
      FROM form_answer_sets WHERE id='a-owner'`);
    await eraseFormAnswersForPrivacy(db, { userId: 'owner', requestId: 'erase-partial',
      dataRightsRequestId: 'delete-owner', actorId: 'staff' });
    globalThis.answerTestStaffActor = { id: 'staff', role: 'super_admin', permissions: ['support.manage'] };
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const response = await POST(new Request('http://localhost:3000/api/admin/privacy/delete-owner', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'complete', note: 'Profile history erased; seller answers remain.',
        requestId: 'complete-partial', formVersion: 1, customAnswers: [] }),
    }), { params: Promise.resolve({ id: 'delete-owner' }) });
    assert.equal(response.status, 409);
    assert.equal(sqlite.prepare("SELECT status FROM data_rights_requests WHERE id='delete-owner'").get()?.status, 'approved');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE id='owner-seller-answer'").get()?.count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM data_rights_events WHERE action='complete'").get()?.count, 0);
  } finally { sqlite.close(); }
});

void test('deletion completion rechecks surviving answers inside the status batch', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    await eraseFormAnswersForPrivacy(db, { userId: 'owner', requestId: 'erase-before-race',
      dataRightsRequestId: 'delete-owner', actorId: 'staff' });
    let injected = false;
    database.beforeRun = (sql) => {
      if (!sql.startsWith('UPDATE data_rights_requests SET status')) return;
      database.beforeRun = null;
      injected = true;
    };
    database.beforeBatch = () => sqlite.exec(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      SELECT 'late-answer',form_id,'late-answer-request',config_version_id,
        'user','owner',actor_id,answers_json,4
      FROM form_answer_sets WHERE id='a-other'`);
    globalThis.answerTestStaffActor = { id: 'staff', role: 'super_admin', permissions: ['support.manage'] };
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const response = await POST(new Request('http://localhost:3000/api/admin/privacy/delete-owner', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'complete', note: 'History was erased earlier.',
        requestId: 'complete-race', formVersion: 1, customAnswers: [] }),
    }), { params: Promise.resolve({ id: 'delete-owner' }) });
    assert.equal(injected, true, 'the surviving answer must be checked by the actual status batch');
    assert.equal(response.status, 409);
    assert.equal(sqlite.prepare("SELECT status FROM data_rights_requests WHERE id='delete-owner'").get()?.status, 'approved');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE id='late-answer'").get()?.count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM data_rights_events WHERE action='complete'").get()?.count, 0);
  } finally { sqlite.close(); }
});

void test('privacy export contains owned historical snapshots without other users answers', async () => {
  const { sqlite, db } = await fixture();
  try {
    const rows = await collectFormAnswersForPrivacy(db, 'owner');
    assert.deepEqual(rows.map((row) => row.id), ['a-owner']);
    assert.deepEqual(rows[0].answers.answers[0], {
      fieldId: 'color', label: 'Original color', type: 'single_choice', value: 'blue', choiceLabels: ['Original blue'],
    });
    assert.deepEqual((await listFormAnswersForSubject(db, 'user', 'owner')).map((row) => row.id), ['a-owner']);
    assert.deepEqual((await collectFormAnswersForPrivacy(db, 'seller')).map((row) => row.id), ['a-seller']);
    assert.deepEqual((await collectFormAnswersForPrivacy(db, 'rider')).map((row) => row.id), ['a-rider']);
  } finally { sqlite.close(); }
});

void test('privacy export API projects native core receipts without internal source or owner identifiers', async () => {
  const { sqlite, db } = await fixture();
  try {
    sqlite.exec("UPDATE data_rights_requests SET status='approved' WHERE id='access-owner'");
    sqlite.exec("INSERT INTO orders VALUES ('private-core-order','owner'),('foreign-core-order','other')");
    for (const [subjectId, actorId, requestId] of [
      ['private-core-order', 'owner', 'private-core-source-request'],
      ['foreign-core-order', 'other', 'foreign-core-source-request'],
    ]) await buildFormAnswerInsert(db, { formId: 'commerce.checkout', requestId,
      versionId: 'core:commerce.checkout:1', subjectType: 'order', subjectId, actorId,
      answers: { formId: 'commerce.checkout', version: 1, answers: [] }, now: 4 }).run();
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const response = await POST(new Request('http://localhost:3000/api/admin/privacy/access-owner', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'export_answers', requestId: 'native-safe-export' }),
    }), { params: Promise.resolve({ id: 'access-owner' }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const text = await response.text();
    assert.doesNotMatch(text, /private-core-order|foreign-core-order|private-core-source-request|foreign-core-source-request|actorId|requestId|subjectId|versionId|healthScope/);
    const body = JSON.parse(text) as { answers: Record<string, unknown>[] };
    const core = body.answers.filter(answer => answer.formId === 'commerce.checkout');
    assert.equal(core.length, 1);
    assert.deepEqual(Object.keys(core[0]).sort(), ['answers', 'createdAt', 'formId', 'historicalFieldIds', 'id']);
    assert.deepEqual(core[0].answers, { formId: 'commerce.checkout', version: 1, answers: [] });
  } finally { sqlite.close(); }
});

for (const timing of ['before completion', 'at status batch'] as const) {
  for (const formId of ['commerce.checkout', 'account.privacy-request'] as const) {
  void test(`deletion completion retains owned core audit receipts for ${formId} ${timing} without false completion`, async () => {
    const { sqlite, db, database } = await fixture();
    try {
      sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
      sqlite.exec("INSERT INTO orders VALUES ('core-owner-order','owner'),('core-other-order','other')");
      await eraseFormAnswersForPrivacy(db, { userId: 'owner', requestId: 'erase-before-core',
        dataRightsRequestId: 'delete-owner', actorId: 'staff' });
      const insert = buildFormAnswerInsert(db, { formId, requestId: 'core-owner-request',
        versionId: `core:${formId}:1`, subjectType: formId === 'commerce.checkout' ? 'order' : 'data_rights_request',
        subjectId: formId === 'commerce.checkout' ? 'core-owner-order' : 'delete-owner',
        actorId: 'owner', answers: { formId, version: 1, answers: [] }, now: 4 });
      let injected = false;
      if (timing === 'before completion') await insert.run();
      else database.beforeBatch = async () => {
        injected = true;
        await insert.run();
      };
      globalThis.answerTestStaffActor = { id: 'staff', role: 'super_admin', permissions: ['support.manage'] };
      const { POST } = await import('../app/api/admin/privacy/[id]/route');
      const response = await POST(new Request('http://localhost:3000/api/admin/privacy/delete-owner', {
        method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'complete', note: 'Profile answers were erased; original native proof remains.',
          requestId: 'complete-with-core', formVersion: 1, customAnswers: [] }),
      }), { params: Promise.resolve({ id: 'delete-owner' }) });
      if (timing === 'at status batch') assert.equal(injected, true);
      assert.equal(response.status, 409);
      assert.match((await response.json() as { error: string }).error, /retained native proof/);
      assert.equal(sqlite.prepare("SELECT status FROM data_rights_requests WHERE id='delete-owner'").get()?.status, 'approved');
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM data_rights_events WHERE action='complete'").get()?.count, 0);
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='form.core_answers'").get()?.count, 1);
      assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { sqlite.close(); }
  });
  }
}

void test('the privacy request own published receipt remains a deletion blocker consistently with its core receipt', async () => {
  const { sqlite, db } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    await eraseFormAnswersForPrivacy(db, { userId: 'owner', requestId: 'erase-own-request',
      dataRightsRequestId: 'delete-owner', actorId: 'staff' });
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
      reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('own-privacy-config','account.privacy-request',1,1,'published',?,
        'Original fixture','staff',1,'staff',1,'staff',1,'own-privacy-config')`)
      .run(JSON.stringify({ formId: 'account.privacy-request', fields: [] }));
    await buildFormAnswerInsert(db, { formId: 'account.privacy-request', requestId: 'original-own-request',
      versionId: 'own-privacy-config', subjectType: 'data_rights_request', subjectId: 'delete-owner',
      actorId: 'owner', answers: { formId: 'account.privacy-request', version: 1, answers: [] }, now: 4 }).run();
    globalThis.answerTestStaffActor = { id: 'staff', role: 'super_admin', permissions: ['support.manage'] };
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const response = await POST(new Request('http://localhost:3000/api/admin/privacy/delete-owner', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'complete', note: 'Original request proof remains retained.',
        requestId: 'complete-own-published', formVersion: 1, customAnswers: [] }),
    }), { params: Promise.resolve({ id: 'delete-owner' }) });
    assert.equal(response.status, 409);
    assert.equal(sqlite.prepare("SELECT status FROM data_rights_requests WHERE id='delete-owner'").get()?.status, 'approved');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='original-own-request'").get()?.count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM data_rights_events WHERE action='complete'").get()?.count, 0);
  } finally { sqlite.close(); }
});

void test('deletion completion ignores another customer core receipt and preserves it unchanged', async () => {
  const { sqlite, db } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    sqlite.exec("INSERT INTO orders VALUES ('unrelated-core-order','other')");
    await buildFormAnswerInsert(db, { formId: 'commerce.checkout', requestId: 'unrelated-core-request',
      versionId: 'core:commerce.checkout:1', subjectType: 'order', subjectId: 'unrelated-core-order',
      actorId: 'other', answers: { formId: 'commerce.checkout', version: 1, answers: [] }, now: 4 }).run();
    const before = sqlite.prepare("SELECT * FROM audit_logs WHERE action='form.core_answers'").all();
    await eraseFormAnswersForPrivacy(db, { userId: 'owner', requestId: 'erase-unrelated-core',
      dataRightsRequestId: 'delete-owner', actorId: 'staff' });
    globalThis.answerTestStaffActor = { id: 'staff', role: 'super_admin', permissions: ['support.manage'] };
    const { POST } = await import('../app/api/admin/privacy/[id]/route');
    const response = await POST(new Request('http://localhost:3000/api/admin/privacy/delete-owner', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'complete', note: 'Own profile answers erased; unrelated proof retained.',
        requestId: 'complete-unrelated-core', formVersion: 1, customAnswers: [] }),
    }), { params: Promise.resolve({ id: 'delete-owner' }) });
    assert.equal(response.status, 200);
    assert.equal(sqlite.prepare("SELECT status FROM data_rights_requests WHERE id='delete-owner'").get()?.status, 'completed');
    assert.deepEqual(sqlite.prepare("SELECT * FROM audit_logs WHERE action='form.core_answers'").all(), before);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { sqlite.close(); }
});

void test('customer privacy export excludes staff decision answers on their request', async () => {
  const { sqlite, db } = await fixture();
  try {
    sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES ('staff-private','staff.privacy-action','staff-private-request','privacy-v1',
        'data_rights_request','access-owner','staff',?,4)`)
      .run(JSON.stringify({ formId: 'staff.privacy-action', version: 1, answers: [] }));
    const staffAnswer = await getFormAnswerById(db, 'staff-private');
    assert.ok(staffAnswer);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'owner', role: 'customer' }, staffAnswer), false);
    await buildFormAnswerInsert(db, { formId: 'staff.exception-work', requestId: 'staff-core-private',
      versionId: 'core:staff.exception-work:1', subjectType: 'data_rights_request', subjectId: 'access-owner',
      actorId: 'staff', answers: { formId: 'staff.exception-work', version: 1, answers: [] }, now: 5 }).run();
    assert.deepEqual((await collectFormAnswersForPrivacy(db, 'owner')).map((row) => row.id),
      ['a-owner']);
  } finally { sqlite.close(); }
});

void test('privacy export includes owned answer sets beyond the first 200', async () => {
  const { sqlite, db } = await fixture();
  try {
    const insert = sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      SELECT ?,form_id,?,config_version_id,subject_type,subject_id,actor_id,answers_json,?
      FROM form_answer_sets WHERE id='a-owner'`);
    for (let index = 1; index <= 205; index++)
      insert.run(`a-bulk-${String(index).padStart(3, '0')}`, `request-bulk-${index}`, index + 1);
    const exported = await collectFormAnswersForPrivacy(db, 'owner');
    assert.equal(exported.length, 206);
    assert.equal(exported.at(-1)?.id, 'a-bulk-205');
    assert.equal(exported.some((answer) => answer.id === 'a-other'), false);
  } finally { sqlite.close(); }
});

void test('subject history includes answer sets beyond the first 200', async () => {
  const { sqlite, db } = await fixture();
  try {
    const insert = sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      SELECT ?,form_id,?,config_version_id,subject_type,subject_id,actor_id,answers_json,?
      FROM form_answer_sets WHERE id='a-owner'`);
    for (let index = 1; index <= 205; index++)
      insert.run(`a-bulk-${String(index).padStart(3, '0')}`, `request-bulk-${index}`, index + 1);
    const history = await listFormAnswersForSubject(db, 'user', 'owner');
    assert.equal(history.length, 206);
    assert.equal(history.at(-1)?.id, 'a-bulk-205');
  } finally { sqlite.close(); }
});

void test('stored active legal hold blocks deletion despite any caller claim', async () => {
  const { sqlite, db } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    sqlite.exec(`INSERT INTO data_rights_legal_holds(id,user_id,reason,placed_by,placed_at,released_by,released_at)
      VALUES ('hold-owner','owner','Open dispute','staff',5,NULL,NULL)`);
    await assert.rejects(() => eraseFormAnswersForPrivacy(db, { userId: 'owner', requestId: 'delete-owner', actorId: 'staff' }), /hold/i);
    assert.equal(count(sqlite), 4);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='form.answers.erased'").get()?.count, 0);
  } finally { sqlite.close(); }
});

void test('legal hold placed after precheck still aborts the atomic deletion batch', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    database.beforeBatch = () => sqlite.exec(`INSERT INTO data_rights_legal_holds
      (id,user_id,reason,placed_by,placed_at) VALUES ('late-hold','owner','Fresh legal hold','staff',8)`);
    await assert.rejects(() => eraseFormAnswersForPrivacy(db,
      { userId: 'owner', requestId: 'delete-owner', actorId: 'staff' }), /hold/i);
    assert.equal(count(sqlite), 4);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='form.answers.erased'").get()?.count, 0);
  } finally { sqlite.close(); }
});

void test('erasure request ID collision after precheck cannot erase another customer', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    database.beforeBatch = () => sqlite.exec(`INSERT INTO audit_logs(id,actor_id,action,subject_type,
      subject_id,next_json,request_id,created_at) VALUES ('competing-erasure','staff',
      'form.answers.erased','user','other','{"deletedCount":0,"dataRightsRequestId":"other-request"}',
      'form-answer-erasure:shared-erase',1)`);
    await assert.rejects(() => eraseFormAnswersForPrivacy(db, { userId: 'owner',
      requestId: 'shared-erase', dataRightsRequestId: 'delete-owner', actorId: 'staff' }));
    assert.equal(count(sqlite), 4);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id='form-answer-erasure:shared-erase'").get()?.count, 1);
    assert.equal(sqlite.prepare("SELECT subject_id FROM audit_logs WHERE request_id='form-answer-erasure:shared-erase'").get()?.subject_id, 'other');
  } finally { sqlite.close(); }
});

void test('approved erasure is atomic, auditable, and exact replay does not delete later answers', async () => {
  const { sqlite, db } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    const input = { userId: 'owner', requestId: 'delete-owner', actorId: 'staff' };
    const first = await eraseFormAnswersForPrivacy(db, input);
    assert.equal(first.deletedCount, 1);
    assert.equal(count(sqlite), 3);
    const audit = sqlite.prepare("SELECT subject_id AS subjectId,next_json AS nextJson FROM audit_logs WHERE action='form.answers.erased'").get() as { subjectId: string; nextJson: string };
    assert.equal(audit.subjectId, 'owner');
    assert.equal(JSON.parse(audit.nextJson).deletedCount, 1);
    assert.deepEqual(await eraseFormAnswersForPrivacy(db, input), first);
    assert.equal(count(sqlite), 3);
    await assert.rejects(() => eraseFormAnswersForPrivacy(db,
      { ...input, requestId: 'another-erase-attempt', dataRightsRequestId: 'delete-owner' }), /already|recorded/i);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='form.answers.erased'").get()?.count, 1);
    await assert.rejects(() => eraseFormAnswersForPrivacy(db, { ...input, userId: 'other' }), /request|owner|different/i);
  } finally { sqlite.close(); }
});

void test('generic erasure retains seller-linked evidence until its own retention adapter exists', async () => {
  const { sqlite, db } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    sqlite.exec("INSERT INTO data_rights_requests(id,customer_id,request_type,status,assigned_to) VALUES ('delete-seller','seller','deletion','approved','staff')");
    const result = await eraseFormAnswersForPrivacy(db, { userId: 'seller', requestId: 'delete-seller', actorId: 'staff' });
    assert.equal(result.deletedCount, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE id='a-seller'").get()?.count, 1);
  } finally { sqlite.close(); }
});

void test('failed erasure batch rolls back all answers and audit', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    database.failStatement = 1;
    await assert.rejects(() => eraseFormAnswersForPrivacy(db, { userId: 'owner', requestId: 'delete-owner', actorId: 'staff' }));
    assert.equal(count(sqlite), 4);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='form.answers.erased'").get()?.count, 0);
  } finally { sqlite.close(); }
});

void test('only active Super Admin can place or release an audited stored legal hold', async () => {
  const { sqlite, db } = await fixture();
  try {
    await assert.rejects(() => placeDataRightsLegalHold(db, { userId: 'owner', actorId: 'staff',
      reason: 'Open dispute', requestId: 'hold-1', now: 10 }), /Super Admin/i);
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    const hold = await placeDataRightsLegalHold(db, { userId: 'owner', actorId: 'staff',
      reason: 'Open dispute', requestId: 'hold-1', now: 10 });
    assert.equal((await placeDataRightsLegalHold(db, { userId: 'owner', actorId: 'staff',
      reason: 'Open dispute', requestId: 'hold-1', now: 10 })).id, hold.id);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='privacy.legal_hold.placed'").get()?.count, 1);
    await assert.rejects(() => placeDataRightsLegalHold(db, { userId: 'owner', actorId: 'staff',
      reason: 'Another hold', requestId: 'hold-2', now: 11 }));
    await releaseDataRightsLegalHold(db, { holdId: hold.id, actorId: 'staff',
      reason: 'Dispute closed', requestId: 'release-1', now: 12 });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='privacy.legal_hold.released'").get()?.count, 1);
    assert.equal(sqlite.prepare('SELECT released_at FROM data_rights_legal_holds WHERE id=?').get(hold.id)?.released_at, 12);
  } finally { sqlite.close(); }
});

void test('hold placement request ID collision after precheck leaves no orphan hold', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    database.beforeBatch = () => sqlite.exec(`INSERT INTO audit_logs(id,actor_id,action,subject_type,
      subject_id,request_id,created_at) VALUES ('competing-placement','staff',
      'privacy.legal_hold.placed','data_rights_legal_hold','other-hold',
      'legal-hold-place:shared-place',1)`);
    await assert.rejects(() => placeDataRightsLegalHold(db, { userId: 'owner', actorId: 'staff',
      reason: 'Open dispute', requestId: 'shared-place', now: 10 }));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM data_rights_legal_holds WHERE user_id='owner'").get()?.count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id='legal-hold-place:shared-place'").get()?.count, 1);
  } finally { sqlite.close(); }
});

void test('hold release request ID collision after precheck keeps the original hold active', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('staff','super_admin')");
    sqlite.exec(`INSERT INTO data_rights_legal_holds(id,user_id,reason,placed_by,placed_at)
      VALUES ('owner-hold','owner','Open dispute','staff',5)`);
    database.beforeBatch = () => sqlite.exec(`INSERT INTO audit_logs(id,actor_id,action,subject_type,
      subject_id,request_id,created_at) VALUES ('competing-release','staff',
      'privacy.legal_hold.released','data_rights_legal_hold','other-hold',
      'legal-hold-release:shared-release',1)`);
    await assert.rejects(() => releaseDataRightsLegalHold(db, { holdId: 'owner-hold', actorId: 'staff',
      reason: 'Dispute closed', requestId: 'shared-release', now: 10 }));
    assert.equal(sqlite.prepare("SELECT released_at FROM data_rights_legal_holds WHERE id='owner-hold'").get()?.released_at, null);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id='legal-hold-release:shared-release'").get()?.count, 1);
  } finally { sqlite.close(); }
});
