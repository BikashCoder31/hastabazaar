import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { register } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { authorizeFormAnswerRead } from '../lib/forms/access';
import { collectFormAnswersForPrivacy, eraseFormAnswersForPrivacy,
  placeDataRightsLegalHold, releaseDataRightsLegalHold } from '../lib/forms/privacy';
import { AnswerDetails } from '../components/forms/answer-details';
import { getFormAnswerById, listFormAnswersForSubject } from '../lib/db/repositories/form-answers';

declare global {
  var answerTestDb: D1Database;
  var answerTestSubject: string | null;
  var answerTestStaffPermissions: readonly string[];
  var answerTestStaffActor: { id: string; role: 'admin' | 'super_admin'; permissions: readonly string[] } | null;
}

register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {get DB(){return globalThis.answerTestDb}}', shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function useRouter(){return {refresh(){}}}', shortCircuit: true };
  if (specifier === '@/app/auth' || specifier.endsWith('/app/auth.ts')) return { url: 'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.answerTestSubject ? {userId:globalThis.answerTestSubject,email:"test@example.invalid"} : null}', shortCircuit: true };
  if (specifier === '@/lib/db/repositories/staff-permissions' || specifier.endsWith('/lib/db/repositories/staff-permissions.ts')) return { url: 'data:text/javascript,export async function getStaffPermissionProfile(){return {permissions:globalThis.answerTestStaffPermissions}};export async function hasStaffPermissionBySubject(){return false}', shortCircuit: true };
  if (specifier === '@/lib/auth/customer' || specifier.endsWith('/lib/auth/customer.ts')) return { url: 'data:text/javascript,export async function requireCustomerPage(){return {userId:"owner",email:"owner@example.invalid",displayName:"Owner",phone:null,locale:"en-NP"}}', shortCircuit: true };
  if (specifier === '@/components/account/account-ui' || specifier.endsWith('/components/account/account-ui.tsx')) return { url: 'data:text/javascript,export function AccountHeading(){return null}', shortCircuit: true };
  if (specifier === '@/components/account/profile-form' || specifier.endsWith('/components/account/profile-form.tsx')) return { url: 'data:text/javascript,export function ProfileForm(){return null}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff' || specifier.endsWith('/lib/auth/staff.ts')) return { url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(){if(!globalThis.answerTestStaffActor)throw new StaffAuthorizationError("Authentication is required.",401);return globalThis.answerTestStaffActor}', shortCircuit: true };
  const resolved = await nextResolve(specifier, context);
  if (resolved.url.endsWith('/app/auth.ts')) return { url: 'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.answerTestSubject ? {userId:globalThis.answerTestSubject,email:"test@example.invalid"} : null}', shortCircuit: true };
  if (resolved.url.endsWith('/lib/db/repositories/staff-permissions.ts')) return { url: 'data:text/javascript,export async function getStaffPermissionProfile(){return {permissions:globalThis.answerTestStaffPermissions}};export async function hasStaffPermissionBySubject(){return false}', shortCircuit: true };
  if (resolved.url.endsWith('/lib/auth/customer.ts')) return { url: 'data:text/javascript,export async function requireCustomerPage(){return {userId:"owner",email:"owner@example.invalid",displayName:"Owner",phone:null,locale:"en-NP"}}', shortCircuit: true };
  if (resolved.url.endsWith('/components/account/account-ui.tsx')) return { url: 'data:text/javascript,export function AccountHeading(){return null}', shortCircuit: true };
  if (resolved.url.endsWith('/components/account/profile-form.tsx')) return { url: 'data:text/javascript,export function ProfileForm(){return null}', shortCircuit: true };
  if (resolved.url.endsWith('/lib/auth/staff.ts')) return { url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(){if(!globalThis.answerTestStaffActor)throw new StaffAuthorizationError("Authentication is required.",401);return globalThis.answerTestStaffActor}', shortCircuit: true };
  return resolved;
}
`)}`, import.meta.url);

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
  failStatement: number | null = null;
  beforeBatch: (() => void) | null = null;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.beforeBatch?.();
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
      subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT, request_id TEXT UNIQUE,
      created_at INTEGER);
    CREATE TABLE data_rights_requests(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL,
      request_type TEXT NOT NULL, status TEXT NOT NULL, assigned_to TEXT,
      resolution TEXT,operation_request_id TEXT,updated_at INTEGER,completed_at INTEGER);
    CREATE TABLE data_rights_events(id TEXT PRIMARY KEY,data_rights_request_id TEXT,
      from_status TEXT,to_status TEXT,action TEXT,actor_id TEXT,actor_role TEXT,note TEXT,
      operation_request_id TEXT UNIQUE,created_at INTEGER);
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    CREATE TABLE rider_profiles(id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    INSERT INTO users VALUES ('owner','auth-owner','active'),('other','auth-other','active'),
      ('staff','auth-staff','active'),('staff-other','auth-staff-other','active'),
      ('seller','auth-seller','active'),('rider','auth-rider','active'),('inactive','auth-inactive','disabled');
    INSERT INTO user_roles VALUES ('owner','customer'),('other','customer'),('staff','admin'),
      ('staff-other','admin'),('seller','seller'),('rider','rider'),('inactive','super_admin');
    INSERT INTO seller_profiles VALUES ('seller-profile','seller');
    INSERT INTO rider_profiles VALUES ('rider-profile','rider');
    INSERT INTO data_rights_requests(id,customer_id,request_type,status,assigned_to)
      VALUES ('delete-owner','owner','deletion','approved','staff');
    INSERT INTO data_rights_requests(id,customer_id,request_type,status,assigned_to)
      VALUES ('access-owner','owner','access','assigned','staff');
  `);
  for (const path of ['../drizzle/0056_form_catalog.sql', '../drizzle/0057_data_rights_legal_holds.sql']) {
    const migration = await readFile(new URL(path, import.meta.url), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
  }
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
  const answer = JSON.stringify({ formId: 'account.profile', version: 1, answers: [
    { fieldId: 'color', label: 'Original color', type: 'single_choice', value: 'blue' },
  ] });
  for (const [id, subjectType, subjectId, actorId] of [
    ['a-owner', 'user', 'owner', 'owner'], ['a-other', 'user', 'other', 'other'],
    ['a-seller', 'seller', 'seller-profile', 'seller'], ['a-rider', 'rider', 'rider-profile', 'rider'],
  ]) {
    sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES (?, 'account.profile', ?, 'v1', ?, ?, ?, ?, 1)`)
      .run(id, `request-${id}`, subjectType, subjectId, actorId, answer);
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
    assert.equal(await authorizeFormAnswerRead(db, { id: 'rider', role: 'rider' }, rider), true);
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
    assert.equal(await authorizeFormAnswerRead(db, { id: 'staff', role: 'admin', permissions: [] }, answer), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'inactive', role: 'super_admin' }, answer), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'staff', role: 'admin', permissions: ['support.manage'] },
      (await getFormAnswerById(db, 'a-seller'))!), false);
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

void test('profile page shows only the owner historical answers', async () => {
  const { sqlite } = await fixture();
  try {
    const { default: ProfilePage } = await import('../app/account/profile/page');
    const html = renderToStaticMarkup(await ProfilePage());
    assert.match(html, /Original color/);
    assert.match(html, /Original blue/);
    assert.match(html, /Historical/);
    assert.doesNotMatch(html, /a-other|auth-other/);
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
  assert.match(eligibleDeletion, /Linked seller, rider, order, and case records remain/);
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
        body: JSON.stringify({ action: 'complete', note: 'All reviewed work is documented.', requestId: `complete-${id}` }),
      }), { params: Promise.resolve({ id }) });
      assert.equal(response.status, 409, id);
      assert.equal(sqlite.prepare('SELECT status FROM data_rights_requests WHERE id=?').get(id)?.status, 'approved');
    }
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
