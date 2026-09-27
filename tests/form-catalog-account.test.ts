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
import { authorizeFormAnswerRead } from '../lib/forms/access';
import { collectFormAnswersForPrivacy } from '../lib/forms/privacy';
import { FormValidationError, validateAnswersForDefinition, validateFormDraft } from '../lib/forms/validation';
import { sharp } from '../lib/reviews/image-processor';
import { deleteCustomerAddress, listCustomerReviewAnswerHistory } from '../lib/db/repositories/customers';

const safeTypes = ['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone'];

declare global {
  var accountCatalogActor: { userId: string } | null;
  var accountCatalogDb: D1Database;
  var accountCatalogMedia: { stored: string[]; deleted: string[]; put(key: string): Promise<void>; delete(key: string): Promise<void> };
  var accountCatalogCreateElement: typeof createElement;
  var accountCatalogStaff: { id: string; role: 'admin' | 'super_admin'; permissions: string[] };
}
globalThis.accountCatalogCreateElement = createElement;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {get DB(){return globalThis.accountCatalogDb},get MEDIA(){return globalThis.accountCatalogMedia}}', shortCircuit: true };
    if (specifier === '@/lib/auth/customer') return { url: `data:text/javascript,
      export class CustomerAuthorizationError extends Error { constructor(message,status){super(message);this.status=status} }
      export async function requireCustomerApi(){const a=globalThis.accountCatalogActor;if(!a)throw new CustomerAuthorizationError('Authentication is required.',401);return a}
      export async function requireCustomerPage(){const a=globalThis.accountCatalogActor;if(!a)throw new CustomerAuthorizationError('Authentication is required.',401);return {...a,email:'customer@example.test',displayName:'Asha Rai',phone:null,locale:'en-NP'}}`, shortCircuit: true };
    if (specifier === '@/lib/http/rate-limit') return { url: `data:text/javascript,
      export async function consumePublicRequestRateLimit(){return {allowed:true}}
      export function rateLimitJson(){return Response.json({error:'Rate limited'},{status:429})}`, shortCircuit: true };
    if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function useRouter(){return {refresh(){}}}', shortCircuit: true };
    if (specifier === 'next/link') return { url: 'data:text/javascript,export default function Link({children,...props}){return globalThis.accountCatalogCreateElement("a",props,children)}', shortCircuit: true };
    if (specifier === 'next/image') return { url: 'data:text/javascript,export default function Image(props){return globalThis.accountCatalogCreateElement("img",props)}', shortCircuit: true };
    if (specifier === '@/lib/auth/staff') return { url: 'data:text/javascript,export async function requireStaffPage(){return globalThis.accountCatalogStaff}', shortCircuit: true };
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
  beforeBatch: (() => void | Promise<void>) | null = null;
  failStatement: number | null = null;
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    const before = this.beforeBatch;
    this.beforeBatch = null;
    await before?.();
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

const extra = { id: 'delivery_note', key: 'delivery_note', type: 'short_text', label: 'Blue gate instruction', required: true, order: 1, status: 'active' } as const;
const address = { label: 'Home', recipientName: 'Asha Rai', phone: '9812345678', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', ward: '3', locality: 'Lazimpat', landmark: 'Blue gate', postalCode: '44600', isDefault: false };
const answers = [{ fieldId: extra.id, value: 'Near the blue gate' }];
const count = (sqlite: DatabaseSync, table: string) => Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT NOT NULL,display_name TEXT NOT NULL,email TEXT NOT NULL);
    INSERT INTO users VALUES ('admin','active','Admin','admin@example.test'),('customer','active','Asha Rai','customer@example.test'),('other','active','Other','other@example.test');
    CREATE TABLE user_roles(user_id TEXT NOT NULL,role TEXT NOT NULL);
    INSERT INTO user_roles VALUES ('admin','admin'),('customer','customer'),('other','customer');
    CREATE TABLE staff_permission_profiles(user_id TEXT PRIMARY KEY,permissions_json TEXT NOT NULL);
    INSERT INTO staff_permission_profiles VALUES ('admin','["support.manage","product.review"]');
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT,ip_hash TEXT,created_at INTEGER);
    CREATE TABLE addresses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),label TEXT NOT NULL,recipient_name TEXT NOT NULL,phone TEXT NOT NULL,province TEXT NOT NULL,district TEXT NOT NULL,municipality TEXT NOT NULL,ward TEXT,locality TEXT NOT NULL,landmark TEXT,postal_code TEXT,is_default INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE address_locations(address_id TEXT PRIMARY KEY REFERENCES addresses(id) ON DELETE CASCADE,latitude REAL NOT NULL,longitude REAL NOT NULL);
    CREATE TABLE data_rights_requests(id TEXT PRIMARY KEY,reference_number TEXT NOT NULL,customer_id TEXT NOT NULL REFERENCES users(id),request_type TEXT NOT NULL,detail TEXT NOT NULL,status TEXT NOT NULL,assigned_to TEXT,resolution TEXT,created_request_id TEXT NOT NULL UNIQUE,operation_request_id TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,completed_at INTEGER);
    CREATE TABLE data_rights_events(id TEXT PRIMARY KEY,data_rights_request_id TEXT NOT NULL,from_status TEXT,to_status TEXT,action TEXT NOT NULL,actor_id TEXT,actor_role TEXT,note TEXT NOT NULL,operation_request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL);
    CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT NOT NULL,customer_id TEXT,status TEXT NOT NULL,payment_status TEXT NOT NULL,grand_total_paisa INTEGER NOT NULL,current_total_paisa INTEGER,placed_at INTEGER,delivered_at INTEGER,created_at INTEGER NOT NULL);
    CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),product_id TEXT NOT NULL,fulfillment_status TEXT NOT NULL,quantity INTEGER NOT NULL);
    CREATE TABLE product_reviews(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,customer_id TEXT NOT NULL REFERENCES users(id),order_item_id TEXT NOT NULL UNIQUE REFERENCES order_items(id),rating INTEGER NOT NULL,title TEXT,body TEXT NOT NULL,status TEXT NOT NULL,moderation_note TEXT,moderated_by TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE products(id TEXT PRIMARY KEY,name_en TEXT NOT NULL,slug TEXT NOT NULL,seller_id TEXT);
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,trading_name TEXT NOT NULL);
    CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL);
    CREATE TABLE shipping_job_events(id TEXT PRIMARY KEY,shipping_job_id TEXT NOT NULL);
    CREATE TABLE payout_requests(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL);
    CREATE TABLE managed_supply_records(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL);
    CREATE TABLE seller_route_transition_applications(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL);
    CREATE TABLE rider_profiles(user_id TEXT PRIMARY KEY);
    CREATE TABLE rider_applications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL);
    CREATE TABLE rider_reports(id TEXT PRIMARY KEY,rider_user_id TEXT NOT NULL);
    CREATE TABLE parcel_cash_records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,rider_user_id TEXT NOT NULL);
    CREATE TABLE rider_events(id TEXT PRIMARY KEY,action TEXT NOT NULL,user_id TEXT NOT NULL);
    CREATE TABLE review_replies(id TEXT PRIMARY KEY,review_id TEXT NOT NULL,body TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,seller_id TEXT NOT NULL);
    CREATE TABLE review_photos(id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES product_reviews(id),object_key TEXT NOT NULL UNIQUE,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,sort_order INTEGER NOT NULL,created_at INTEGER NOT NULL);
    INSERT INTO orders VALUES ('order-1','HB-1001','customer','delivered','paid',10000,NULL,1,2,1),('order-other','HB-2002','other','delivered','paid',10000,NULL,1,2,1);
    INSERT INTO order_items VALUES ('item-1','order-1','product-1','delivered',1),('item-other','order-other','product-1','delivered',1);`);
  sqlite.exec("INSERT INTO products(id,name_en,slug) VALUES ('product-1','Handmade Item','handmade-item')");
  const migration = await readFile(new URL('../drizzle/0056_form_catalog.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
  const tombstoneMigration = await readFile(new URL('../drizzle/0058_address_answer_owner_tombstones.sql', import.meta.url), 'utf8');
  for (const statement of tombstoneMigration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
  const db = new Database(sqlite);
  globalThis.accountCatalogDb = db as unknown as D1Database;
  globalThis.accountCatalogActor = { userId: 'customer' };
  globalThis.accountCatalogMedia = { stored: [], deleted: [], async put(key) { this.stored.push(key); }, async delete(key) { this.deleted.push(key); } };
  globalThis.accountCatalogStaff = { id: 'admin', role: 'admin', permissions: ['support.manage', 'product.review'] };
  return { sqlite, db };
}

function seed(sqlite: DatabaseSync, formId: string, version: number, fields: unknown[]) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?,?,?,1,'published',?,'Test publication','admin',1,'admin',1,'admin',1,?)`)
    .run(`${formId}-v${version}`, formId, version, JSON.stringify({ formId, fields }), `seed-${formId}-${version}`);
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(`http://localhost:3000${url}`, { method, headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

async function reviewRequest(requestId: string, customAnswers: unknown, options: { body?: string; photo?: 'valid' | 'spoofed'; formVersion?: number } = {}) {
  const form = new FormData();
  form.set('orderItemId', 'item-1');
  form.set('rating', '5');
  form.set('title', 'Lovely work');
  form.set('body', options.body ?? 'The workmanship is beautiful and careful.');
  form.set('idempotencyKey', requestId);
  form.set('formVersion', String(options.formVersion ?? 1));
  form.set('customAnswers', JSON.stringify(customAnswers));
  if (options.photo) {
    const bytes = options.photo === 'valid'
      ? await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ff0000' } }).jpeg().toBuffer()
      : Buffer.from('<svg><script>bad()</script></svg>');
    form.append('photos', new File([new Uint8Array(bytes)], 'photo.jpg', { type: 'image/jpeg' }));
  }
  return new Request('http://localhost:3000/api/products/product-1/reviews', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form });
}

void test('account collection adapters are live and retain protected system fields', () => {
  for (const [formId, route] of [
    ['account.address', '/api/account/addresses'],
    ['account.privacy-request', '/api/account/privacy'],
    ['account.review', '/api/products/:id/reviews'],
  ] as const) {
    assert.equal(IMPLEMENTED_FORM_ADAPTERS[formId]?.route, route);
    assert.equal(FORM_REGISTRY[formId].adapterId, formId);
    assert.deepEqual(FORM_REGISTRY[formId].capabilities.customFieldTypes, safeTypes);
    assert.equal(FORM_REGISTRY[formId].capabilities.answerBehavior, 'record');
  }
  for (const [formId, protectedKeys] of [
    ['account.address', ['userId', 'idempotencyKey', 'location']],
    ['account.privacy-request', ['requestType', 'requestId']],
    ['account.review', ['orderItemId', 'idempotencyKey', 'photos']],
  ] as const) {
    for (const key of protectedKeys) {
      const field = FORM_REGISTRY[formId].baseFields.find((item) => item.key === key);
      assert.equal(field?.capability, 'protected', `${formId}.${key}`);
    }
  }
});

void test('only address landmark can change requiredness among account built-ins', () => {
  const landmark = { id: 'landmark', key: 'landmark', type: 'short_text', label: 'Landmark', required: true, order: 0, status: 'active' };
  assert.deepEqual(validateFormDraft('account.address', { formId: 'account.address', fields: [landmark] }).fields, [landmark]);
  const optional = { ...landmark, required: false };
  assert.deepEqual(validateFormDraft('account.address', { formId: 'account.address', fields: [optional] }).fields, [optional]);
  assert.throws(() => validateFormDraft('account.privacy-request', {
    formId: 'account.privacy-request', fields: [{ ...landmark, id: 'requesttype', key: 'requesttype' }],
  }));
});

void test('known missing or malformed answers expose a safe field ID while unknown payloads do not', () => {
  const config = { formId: 'account.address', version: 1, publishedAt: 1, fields: [extra] } as const;
  for (const raw of [[], [{ fieldId: extra.id, value: 42 }]]) {
    assert.throws(() => validateAnswersForDefinition(FORM_REGISTRY['account.address'], config, raw), (error) =>
      error instanceof FormValidationError && error.fieldId === extra.id);
  }
  assert.throws(() => validateAnswersForDefinition(FORM_REGISTRY['account.address'], config, [{ fieldId: 'not_registered', value: 'x' }]), (error) =>
    error instanceof FormValidationError && error.fieldId === undefined);
});

void test('account collection routes return the published field ID for missing custom answers', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'account.address', 1, [extra]);
    seed(sqlite, 'account.privacy-request', 1, [extra]);
    seed(sqlite, 'account.review', 1, [extra]);
    const { POST: addressPost } = await import('../app/api/account/addresses/route');
    const { POST: privacyPost } = await import('../app/api/account/privacy/route');
    const { POST: reviewPost } = await import('../app/api/products/[id]/reviews/route');
    const responses = [
      await addressPost(jsonRequest('/api/account/addresses', 'POST', { address, idempotencyKey: 'missing-address-field', formVersion: 1, customAnswers: [] })),
      await privacyPost(jsonRequest('/api/account/privacy', 'POST', { requestType: 'access', detail: 'Please provide my account information.', requestId: 'missing-privacy-field', formVersion: 1, customAnswers: [] })),
      await reviewPost(await reviewRequest('missing-review-field', []), { params: Promise.resolve({ id: 'product-1' }) }),
    ];
    for (const response of responses) {
      assert.equal(response.status, 400);
      assert.deepEqual((await response.json() as { fieldId: string }).fieldId, extra.id);
    }
  } finally { sqlite.close(); }
});

void test('address publication enforces landmark, saves custom history, and permits later optional landmark', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST } = await import('../app/api/account/addresses/route');
    const landmark = { id: 'landmark', key: 'landmark', type: 'short_text', label: 'Nearby landmark', required: true, order: 0, status: 'active' };
    seed(sqlite, 'account.address', 1, [landmark, extra]);
    const body = { address: { ...address, landmark: '' }, idempotencyKey: 'address-missing', formVersion: 1, customAnswers: answers };
    assert.equal((await POST(jsonRequest('/api/account/addresses', 'POST', body))).status, 400);
    assert.equal(count(sqlite, 'addresses'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    const accepted = { ...body, address, idempotencyKey: 'address-1' };
    const response = await POST(jsonRequest('/api/account/addresses', 'POST', accepted));
    assert.equal(response.status, 201);
    const firstAddressId = (await response.json() as { id: string }).id;
    const saved = await listFormAnswersForSubject(globalThis.accountCatalogDb, 'address', firstAddressId);
    assert.deepEqual(saved[0]?.answers.answers, [{ fieldId: 'delivery_note', label: 'Blue gate instruction', type: 'short_text', value: 'Near the blue gate' }]);
    seed(sqlite, 'account.address', 2, [{ ...landmark, required: false }, { ...extra, required: false, status: 'archived' }]);
    const later = await POST(jsonRequest('/api/account/addresses', 'POST', { ...body, idempotencyKey: 'address-2', formVersion: 2, customAnswers: [] }));
    assert.equal(later.status, 201);
    const history = await listFormAnswersForSubject(globalThis.accountCatalogDb, 'address', firstAddressId);
    assert.deepEqual(history[0].answers.answers, saved[0].answers.answers);
    assert.deepEqual(history[0].historicalFieldIds, ['delivery_note']);
  } finally { sqlite.close(); }
});

void test('address retry is one write, changed request conflicts, and stale or invalid answers save nothing', async () => {
  const { sqlite, db } = await fixture();
  try {
    const { POST } = await import('../app/api/account/addresses/route');
    seed(sqlite, 'account.address', 1, [extra]);
    const body = { address, idempotencyKey: 'address-replay', formVersion: 1, customAnswers: answers };
    assert.equal((await POST(jsonRequest('/api/account/addresses', 'POST', body))).status, 201);
    assert.equal((await POST(jsonRequest('/api/account/addresses', 'POST', body))).status, 201);
    assert.equal((await POST(jsonRequest('/api/account/addresses', 'POST', { ...body, address: { ...address, label: 'Work' } }))).status, 409);
    seed(sqlite, 'account.address', 2, [extra]);
    assert.equal((await POST(jsonRequest('/api/account/addresses', 'POST', { ...body, idempotencyKey: 'stale' }))).status, 409);
    assert.equal((await POST(jsonRequest('/api/account/addresses', 'POST', { ...body, idempotencyKey: 'invalid', formVersion: 2, customAnswers: [{ fieldId: extra.id, value: 42 }] }))).status, 400);
    assert.equal(count(sqlite, 'addresses'), 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 1);
    db.failStatement = 2;
    assert.equal((await POST(jsonRequest('/api/account/addresses', 'POST', { ...body, idempotencyKey: 'batch-failure', formVersion: 2 }))).status, 500);
    assert.equal(count(sqlite, 'addresses'), 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('another customer cannot update an owned address or its answer history', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST } = await import('../app/api/account/addresses/route');
    const { PATCH } = await import('../app/api/account/addresses/[id]/route');
    seed(sqlite, 'account.address', 1, [extra]);
    const body = { address, idempotencyKey: 'owned-address', formVersion: 1, customAnswers: answers };
    const created = await POST(jsonRequest('/api/account/addresses', 'POST', body));
    const id = (await created.json() as { id: string }).id;
    globalThis.accountCatalogActor = { userId: 'other' };
    assert.equal((await PATCH(jsonRequest(`/api/account/addresses/${id}`, 'PATCH', { ...body, idempotencyKey: 'cross-customer' }), { params: Promise.resolve({ id }) })).status, 409);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    assert.equal((sqlite.prepare('SELECT user_id AS owner FROM addresses WHERE id=?').get(id) as { owner: string }).owner, 'customer');
  } finally { sqlite.close(); }
});

void test('one address request ID cannot be reused by another customer', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST } = await import('../app/api/account/addresses/route');
    seed(sqlite, 'account.address', 1, [extra]);
    const body = { address, idempotencyKey: 'shared-address-id', formVersion: 1, customAnswers: answers };
    assert.equal((await POST(jsonRequest('/api/account/addresses', 'POST', body))).status, 201);
    globalThis.accountCatalogActor = { userId: 'other' };
    assert.equal((await POST(jsonRequest('/api/account/addresses', 'POST', body))).status, 409);
    assert.equal(count(sqlite, 'addresses'), 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('privacy export includes owned address and review snapshots, including archived answers', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST: createAddress } = await import('../app/api/account/addresses/route');
    const { POST: createReview } = await import('../app/api/products/[id]/reviews/route');
    seed(sqlite, 'account.address', 1, [extra]);
    seed(sqlite, 'account.review', 1, [extra]);
    const created = await createAddress(jsonRequest('/api/account/addresses', 'POST',
      { address, idempotencyKey: 'export-address', formVersion: 1, customAnswers: answers }));
    assert.equal(created.status, 201);
    assert.equal((await createReview(await reviewRequest('export-review', answers),
      { params: Promise.resolve({ id: 'product-1' }) })).status, 201);
    seed(sqlite, 'account.address', 2, [{ ...extra, status: 'archived', required: false }]);
    seed(sqlite, 'account.review', 2, [{ ...extra, status: 'archived', required: false }]);
    globalThis.accountCatalogActor = { userId: 'other' };
    assert.equal((await createAddress(jsonRequest('/api/account/addresses', 'POST',
      { address, idempotencyKey: 'other-address', formVersion: 2, customAnswers: [] }))).status, 201);
    const exported = await collectFormAnswersForPrivacy(globalThis.accountCatalogDb, 'customer');
    assert.deepEqual(exported.map((row) => row.formId).sort(), ['account.address', 'account.review']);
    assert.ok(exported.every((row) => row.historicalFieldIds.includes('delivery_note')));
    assert.ok(exported.every((row) => row.answers.answers[0]?.value === 'Near the blue gate'));
  } finally { sqlite.close(); }
});

void test('deleted address answers retain original ID, owner-only read, paged history, and access export', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST: createAddress } = await import('../app/api/account/addresses/route');
    seed(sqlite, 'account.address', 1, [extra]);
    const created = await createAddress(jsonRequest('/api/account/addresses', 'POST',
      { address, idempotencyKey: 'delete-address', formVersion: 1, customAnswers: answers }));
    const addressId = (await created.json() as { id: string }).id;
    assert.equal(created.status, 201);
    const original = (await listFormAnswersForSubject(globalThis.accountCatalogDb, 'address', addressId))[0];
    await deleteCustomerAddress(globalThis.accountCatalogDb,
      { userId: 'customer', addressId, requestId: 'delete-address-action', now: 100 });
    assert.equal(count(sqlite, 'addresses'), 0);
    assert.equal(original.subjectId, addressId);
    assert.equal(await authorizeFormAnswerRead(globalThis.accountCatalogDb,
      { id: 'customer', role: 'customer' }, original), true);
    assert.equal(await authorizeFormAnswerRead(globalThis.accountCatalogDb,
      { id: 'other', role: 'customer' }, original), false);
    assert.deepEqual((await collectFormAnswersForPrivacy(globalThis.accountCatalogDb, 'customer'))
      .map((row) => row.id), [original.id]);
    const { default: AddressesPage } = await import('../app/account/addresses/page');
    const html = renderToStaticMarkup(await AddressesPage());
    assert.match(html, /previous address answers/);
    assert.match(html, /Near the blue gate/);
    globalThis.accountCatalogActor = { userId: 'other' };
    assert.doesNotMatch(renderToStaticMarkup(await AddressesPage()), /Near the blue gate/);
  } finally { sqlite.close(); }
});

void test('denied, failed, and replayed address deletions do not create a new owner tombstone', async () => {
  const { sqlite, db } = await fixture();
  try {
    const { POST: createAddress } = await import('../app/api/account/addresses/route');
    seed(sqlite, 'account.address', 1, [extra]);
    const create = async (key: string) => {
      const response = await createAddress(jsonRequest('/api/account/addresses', 'POST',
        { address, idempotencyKey: key, formVersion: 1, customAnswers: answers }));
      assert.equal(response.status, 201);
      return (await response.json() as { id: string }).id;
    };
    const firstId = await create('tombstone-first');
    const secondId = await create('tombstone-second');
    await assert.rejects(deleteCustomerAddress(globalThis.accountCatalogDb,
      { userId: 'other', addressId: firstId, requestId: 'denied-delete', now: 10 }));
    assert.equal(count(sqlite, 'address_answer_owner_tombstones'), 0);
    db.failStatement = 1;
    await assert.rejects(deleteCustomerAddress(globalThis.accountCatalogDb,
      { userId: 'customer', addressId: firstId, requestId: 'failed-delete', now: 11 }));
    db.failStatement = null;
    assert.equal(count(sqlite, 'address_answer_owner_tombstones'), 0);
    assert.equal(count(sqlite, 'addresses'), 2);
    await deleteCustomerAddress(globalThis.accountCatalogDb,
      { userId: 'customer', addressId: firstId, requestId: 'successful-delete', now: 12 });
    assert.equal(count(sqlite, 'address_answer_owner_tombstones'), 1);
    await deleteCustomerAddress(globalThis.accountCatalogDb,
      { userId: 'customer', addressId: firstId, requestId: 'successful-delete', now: 13 });
    assert.equal(count(sqlite, 'address_answer_owner_tombstones'), 1);
    await assert.rejects(deleteCustomerAddress(globalThis.accountCatalogDb,
      { userId: 'customer', addressId: secondId, requestId: 'successful-delete', now: 14 }),
    /already used/i);
    assert.equal(count(sqlite, 'address_answer_owner_tombstones'), 1);
    assert.equal((sqlite.prepare('SELECT id FROM addresses WHERE id=?').get(secondId) as { id: string }).id, secondId);
  } finally { sqlite.close(); }
});

void test('concurrent identical address DELETE requests both return idempotent success', async () => {
  const { sqlite, db } = await fixture();
  try {
    const { POST: createAddress } = await import('../app/api/account/addresses/route');
    const { DELETE: removeAddress } = await import('../app/api/account/addresses/[id]/route');
    seed(sqlite, 'account.address', 1, [extra]);
    const created = await createAddress(jsonRequest('/api/account/addresses', 'POST',
      { address, idempotencyKey: 'race-created', formVersion: 1, customAnswers: answers }));
    assert.equal(created.status, 201);
    const addressId = (await created.json() as { id: string }).id;
    let reachedBatch!: () => void;
    let releaseBatch!: () => void;
    const pausedAtBatch = new Promise<void>((resolve) => { reachedBatch = resolve; });
    const firstMayCommit = new Promise<void>((resolve) => { releaseBatch = resolve; });
    db.beforeBatch = () => { reachedBatch(); return firstMayCommit; };
    const target = { params: Promise.resolve({ id: addressId }) };
    const request = () => jsonRequest(`/api/account/addresses/${addressId}`, 'DELETE', { idempotencyKey: 'race-delete' });
    const first = removeAddress(request(), target);
    await pausedAtBatch;
    const second = await removeAddress(request(), target);
    assert.equal(second.status, 200);
    releaseBatch();
    assert.equal((await first).status, 200);
    assert.equal(count(sqlite, 'addresses'), 0);
    assert.equal(count(sqlite, 'address_answer_owner_tombstones'), 1);
    assert.equal(Number((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id='race-delete'").get() as { count: number }).count), 1);
  } finally { sqlite.close(); }
});

void test('raced address DELETE rejects a request ID committed for another actor, action, or target', async () => {
  for (const [actorId, action, subjectId] of [
    ['other', 'account.address.deleted', 'owned-address'],
    ['customer', 'account.address.updated', 'owned-address'],
    ['customer', 'account.address.deleted', 'different-address'],
  ]) {
    const { sqlite, db } = await fixture();
    try {
      const { POST: createAddress } = await import('../app/api/account/addresses/route');
      const { DELETE: removeAddress } = await import('../app/api/account/addresses/[id]/route');
      seed(sqlite, 'account.address', 1, [extra]);
      const created = await createAddress(jsonRequest('/api/account/addresses', 'POST',
        { address, idempotencyKey: `create-${actorId}-${action}-${subjectId}`, formVersion: 1, customAnswers: answers }));
      assert.equal(created.status, 201);
      const addressId = (await created.json() as { id: string }).id;
      db.beforeBatch = () => {
        sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,created_at)
          VALUES (?,?,?,?,?,'raced-key',1)`).run(crypto.randomUUID(), actorId, action, 'address',
          subjectId === 'owned-address' ? addressId : subjectId);
      };
      const result = await removeAddress(jsonRequest(`/api/account/addresses/${addressId}`, 'DELETE',
        { idempotencyKey: 'raced-key' }), { params: Promise.resolve({ id: addressId }) });
      assert.equal(result.status, 409);
      assert.equal(count(sqlite, 'addresses'), 1);
      assert.equal(count(sqlite, 'address_answer_owner_tombstones'), 0);
    } finally { sqlite.close(); }
  }
});

void test('unrelated address DELETE batch failure remains a server error without tombstone', async () => {
  const { sqlite, db } = await fixture();
  try {
    const { POST: createAddress } = await import('../app/api/account/addresses/route');
    const { DELETE: removeAddress } = await import('../app/api/account/addresses/[id]/route');
    seed(sqlite, 'account.address', 1, [extra]);
    const created = await createAddress(jsonRequest('/api/account/addresses', 'POST',
      { address, idempotencyKey: 'create-failed-delete', formVersion: 1, customAnswers: answers }));
    assert.equal(created.status, 201);
    const addressId = (await created.json() as { id: string }).id;
    db.failStatement = 1;
    const result = await removeAddress(jsonRequest(`/api/account/addresses/${addressId}`, 'DELETE',
      { idempotencyKey: 'failed-delete-route' }), { params: Promise.resolve({ id: addressId }) });
    assert.equal(result.status, 500);
    assert.equal(count(sqlite, 'addresses'), 1);
    assert.equal(count(sqlite, 'address_answer_owner_tombstones'), 0);
  } finally { sqlite.close(); }
});

void test('address DELETE rejects malformed or oversized idempotency submissions before mutation', async () => {
  const { sqlite } = await fixture();
  try {
    const { DELETE: removeAddress } = await import('../app/api/account/addresses/[id]/route');
    const target = { params: Promise.resolve({ id: 'missing-address' }) };
    for (const key of [42, 'x'.repeat(101)]) {
      const response = await removeAddress(jsonRequest('/api/account/addresses/missing-address', 'DELETE',
        { idempotencyKey: key }), target);
      assert.equal(response.status, 400);
    }
    const oversized = await removeAddress(jsonRequest('/api/account/addresses/missing-address', 'DELETE',
      { idempotencyKey: 'bounded-key', padding: 'x'.repeat(131_072) }), target);
    assert.equal(oversized.status, 413);
    assert.equal(count(sqlite, 'audit_logs'), 0);
    assert.equal(count(sqlite, 'address_answer_owner_tombstones'), 0);
  } finally { sqlite.close(); }
});

void test('deleted address owner history uses a bounded 50-row keyset page', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'account.address', 1, [extra]);
    const tombstones = sqlite.prepare(`INSERT INTO address_answer_owner_tombstones
      (address_id,user_id,deletion_request_id,deleted_at) VALUES (?,?,?,1)`);
    const insert = sqlite.prepare(`INSERT INTO form_answer_sets
      (id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES (?,'account.address',?,'account.address-v1','address',?,'customer',?,1)`);
    const snapshot = JSON.stringify({ formId: 'account.address', version: 1, answers: [
      { fieldId: 'delivery_note', label: 'Blue gate instruction', type: 'short_text', value: 'Near the blue gate' },
    ] });
    for (let index = 1; index <= 51; index++) {
      const id = `removed-${String(index).padStart(3, '0')}`;
      tombstones.run(id, 'customer', `remove-${index}`);
      insert.run(`answer-${index}`, `submit-${index}`, id, snapshot);
    }
    const { default: AddressesPage } = await import('../app/account/addresses/page');
    const first = renderToStaticMarkup(await AddressesPage());
    assert.equal((first.match(/Near the blue gate/g) ?? []).length, 50);
    assert.match(first, /Next 50 deleted addresses/);
    const next = renderToStaticMarkup(await AddressesPage({ searchParams: Promise.resolve({ deletedAt: '1', deletedId: 'removed-050' }) }));
    assert.equal((next.match(/Near the blue gate/g) ?? []).length, 1);
    assert.doesNotMatch(next, /Next 50 deleted addresses/);
    globalThis.accountCatalogActor = { userId: 'other' };
    assert.doesNotMatch(renderToStaticMarkup(await AddressesPage()), /Near the blue gate/);
  } finally { sqlite.close(); }
});

void test('privacy request validates published custom answers and retains archived history', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST } = await import('../app/api/account/privacy/route');
    seed(sqlite, 'account.privacy-request', 1, [extra]);
    const body = { requestType: 'access', detail: 'Please provide a copy of my information.', requestId: 'privacy-1', formVersion: 1, customAnswers: answers };
    assert.equal((await POST(jsonRequest('/api/account/privacy', 'POST', { ...body, customAnswers: [] }))).status, 400);
    assert.equal((await POST(jsonRequest('/api/account/privacy', 'POST', { ...body, requestType: 'secret_type' }))).status, 409);
    assert.equal(count(sqlite, 'data_rights_requests'), 0);
    const response = await POST(jsonRequest('/api/account/privacy', 'POST', body));
    assert.equal(response.status, 201);
    const id = (await response.json() as { id: string }).id;
    assert.equal(count(sqlite, 'data_rights_requests'), 1);
    const stored = await listFormAnswersForSubject(globalThis.accountCatalogDb, 'data_rights_request', id);
    assert.deepEqual(stored[0]?.answers.answers, [{ fieldId: 'delivery_note', label: 'Blue gate instruction', type: 'short_text', value: 'Near the blue gate' }]);
    seed(sqlite, 'account.privacy-request', 2, [{ ...extra, required: false, status: 'archived' }]);
    const historical = await listFormAnswersForSubject(globalThis.accountCatalogDb, 'data_rights_request', id);
    assert.deepEqual(historical[0].historicalFieldIds, ['delivery_note']);
  } finally { sqlite.close(); }
});

void test('privacy request exact replay is one workflow event and changed body conflicts', async () => {
  const { sqlite, db } = await fixture();
  try {
    const { POST } = await import('../app/api/account/privacy/route');
    seed(sqlite, 'account.privacy-request', 1, [extra]);
    const body = { requestType: 'correction', detail: 'My account details need a careful correction.', requestId: 'privacy-repeat', formVersion: 1, customAnswers: answers };
    assert.equal((await POST(jsonRequest('/api/account/privacy', 'POST', body))).status, 201);
    assert.equal((await POST(jsonRequest('/api/account/privacy', 'POST', body))).status, 201);
    assert.equal((await POST(jsonRequest('/api/account/privacy', 'POST', { ...body, detail: 'A different requested correction detail.' }))).status, 409);
    assert.equal(count(sqlite, 'data_rights_requests'), 1);
    assert.equal(count(sqlite, 'data_rights_events'), 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 1);
    seed(sqlite, 'account.privacy-request', 2, [extra]);
    assert.equal((await POST(jsonRequest('/api/account/privacy', 'POST', { ...body, requestId: 'privacy-stale' }))).status, 409);
    db.failStatement = 2;
    assert.equal((await POST(jsonRequest('/api/account/privacy', 'POST', { ...body, requestId: 'privacy-fail', formVersion: 2 }))).status, 500);
    assert.equal(count(sqlite, 'data_rights_requests'), 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('review adapter validates custom answers and preserves delivered-purchase eligibility', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST } = await import('../app/api/products/[id]/reviews/route');
    const context = { params: Promise.resolve({ id: 'product-1' }) };
    seed(sqlite, 'account.review', 1, [extra]);
    assert.equal((await POST(await reviewRequest('review-missing', []), context)).status, 400);
    assert.equal((await POST(await reviewRequest('review-invalid', [{ fieldId: extra.id, value: 42 }]), context)).status, 400);
    assert.equal((await POST(await reviewRequest('review-spoofed', answers, { photo: 'spoofed' }), context)).status, 400);
    globalThis.accountCatalogActor = { userId: 'other' };
    assert.equal((await POST(await reviewRequest('review-other', answers), context)).status, 409);
    globalThis.accountCatalogActor = { userId: 'customer' };
    assert.equal(count(sqlite, 'product_reviews'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    assert.deepEqual(globalThis.accountCatalogMedia.stored, []);
    const created = await POST(await reviewRequest('review-1', answers), context);
    assert.equal(created.status, 201);
    const id = (await created.json() as { id: string }).id;
    const saved = await listFormAnswersForSubject(globalThis.accountCatalogDb, 'product_review', id);
    assert.deepEqual(saved[0]?.answers.answers, [{ fieldId: 'delivery_note', label: 'Blue gate instruction', type: 'short_text', value: 'Near the blue gate' }]);
    assert.equal(count(sqlite, 'audit_logs'), 1);
  } finally { sqlite.close(); }
});

void test('a delivered item cannot receive a second review under a new request ID', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST } = await import('../app/api/products/[id]/reviews/route');
    const context = { params: Promise.resolve({ id: 'product-1' }) };
    seed(sqlite, 'account.review', 1, [extra]);
    assert.equal((await POST(await reviewRequest('first-review', answers), context)).status, 201);
    assert.equal((await POST(await reviewRequest('second-review', answers), context)).status, 409);
    assert.equal(count(sqlite, 'product_reviews'), 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('account collection endpoints fail closed when published configuration cannot be read', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST: addressPost } = await import('../app/api/account/addresses/route');
    const { POST: privacyPost } = await import('../app/api/account/privacy/route');
    const { POST: reviewPost } = await import('../app/api/products/[id]/reviews/route');
    assert.equal((await addressPost(jsonRequest('/api/account/addresses', 'POST', { address, idempotencyKey: 'no-config-address', formVersion: 1, customAnswers: [] }))).status, 503);
    assert.equal((await privacyPost(jsonRequest('/api/account/privacy', 'POST', { requestType: 'access', detail: 'Please provide my account information.', requestId: 'no-config-privacy', formVersion: 1, customAnswers: [] }))).status, 503);
    assert.equal((await reviewPost(await reviewRequest('no-config-review', []), { params: Promise.resolve({ id: 'product-1' }) })).status, 503);
    assert.equal(count(sqlite, 'addresses'), 0);
    assert.equal(count(sqlite, 'data_rights_requests'), 0);
    assert.equal(count(sqlite, 'product_reviews'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
  } finally { sqlite.close(); }
});

void test('multipart review exact retry skips uploads and changed request conflicts', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST } = await import('../app/api/products/[id]/reviews/route');
    const context = { params: Promise.resolve({ id: 'product-1' }) };
    seed(sqlite, 'account.review', 1, [extra]);
    assert.equal((await POST(await reviewRequest('review-photo', answers, { photo: 'valid' }), context)).status, 201);
    assert.equal(globalThis.accountCatalogMedia.stored.length, 1);
    seed(sqlite, 'account.review', 2, [{ ...extra, required: false, status: 'archived' }]);
    assert.equal((await POST(await reviewRequest('review-photo', answers, { photo: 'valid' }), context)).status, 201);
    assert.equal((await POST(await reviewRequest('review-photo', answers, { photo: 'valid', body: 'A changed review body after success.' }), context)).status, 409);
    assert.equal(globalThis.accountCatalogMedia.stored.length, 1);
    assert.equal(count(sqlite, 'product_reviews'), 1);
    assert.equal(count(sqlite, 'review_photos'), 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 1);
  } finally { sqlite.close(); }
});

void test('review upload is deleted if publication changes before the atomic database batch', async () => {
  const { sqlite, db } = await fixture();
  try {
    const { POST } = await import('../app/api/products/[id]/reviews/route');
    seed(sqlite, 'account.review', 1, [extra]);
    db.beforeBatch = () => seed(sqlite, 'account.review', 2, [extra]);
    const response = await POST(await reviewRequest('review-failed', answers, { photo: 'valid' }), { params: Promise.resolve({ id: 'product-1' }) });
    assert.equal(response.status, 409);
    assert.equal(globalThis.accountCatalogMedia.stored.length, 1);
    assert.deepEqual(globalThis.accountCatalogMedia.deleted, globalThis.accountCatalogMedia.stored);
    assert.equal(count(sqlite, 'product_reviews'), 0);
    assert.equal(count(sqlite, 'review_photos'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    assert.equal(count(sqlite, 'audit_logs'), 0);
  } finally { sqlite.close(); }
});

void test('account forms identify their live adapters and block submission until configuration loads', async () => {
  const { PrivacyRequestForm } = await import('../components/account/privacy-request-form');
  const { ReviewForm } = await import('../components/account/review-form');
  const { AddressManager } = await import('../components/account/address-manager');
  const privacy = renderToStaticMarkup(createElement(PrivacyRequestForm));
  const review = renderToStaticMarkup(createElement(ReviewForm, { productId: 'product-1', orderItemId: 'item-1', orderNumber: 'ORD-1' }));
  const addresses = renderToStaticMarkup(createElement(AddressManager, { addresses: [] }));
  assert.match(privacy, /data-form-id="account\.privacy-request"/);
  assert.match(review, /data-form-id="account\.review"/);
  assert.match(privacy, /Form configuration is loading/i);
  assert.match(review, /Form configuration is loading/i);
  assert.match(privacy, /<button[^>]*disabled[^>]*>Submit request/);
  assert.match(review, /<button[^>]*disabled[^>]*>Submit review/);
  assert.match(addresses, /Form configuration is loading/i);
  assert.match(addresses, /<button[^>]*disabled[^>]*>.*Add address/);
});

void test('address and review answers follow parent ownership and current staff review grants', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST: createAddress } = await import('../app/api/account/addresses/route');
    const { POST: createReview } = await import('../app/api/products/[id]/reviews/route');
    seed(sqlite, 'account.address', 1, [extra]);
    seed(sqlite, 'account.review', 1, [extra]);
    const addressResult = await createAddress(jsonRequest('/api/account/addresses', 'POST', { address, idempotencyKey: 'access-address', formVersion: 1, customAnswers: answers }));
    const addressId = (await addressResult.json() as { id: string }).id;
    const reviewResult = await createReview(await reviewRequest('access-review', answers), { params: Promise.resolve({ id: 'product-1' }) });
    const reviewId = (await reviewResult.json() as { id: string }).id;
    const addressAnswer = (await listFormAnswersForSubject(globalThis.accountCatalogDb, 'address', addressId))[0];
    const reviewAnswer = (await listFormAnswersForSubject(globalThis.accountCatalogDb, 'product_review', reviewId))[0];
    assert.equal(await authorizeFormAnswerRead(globalThis.accountCatalogDb, { id: 'customer', role: 'customer' }, addressAnswer), true);
    assert.equal(await authorizeFormAnswerRead(globalThis.accountCatalogDb, { id: 'other', role: 'customer' }, addressAnswer), false);
    assert.equal(await authorizeFormAnswerRead(globalThis.accountCatalogDb, { id: 'admin', role: 'admin' }, addressAnswer), false);
    assert.equal(await authorizeFormAnswerRead(globalThis.accountCatalogDb, { id: 'customer', role: 'customer' }, reviewAnswer), true);
    assert.equal(await authorizeFormAnswerRead(globalThis.accountCatalogDb, { id: 'other', role: 'customer' }, reviewAnswer), false);
    assert.equal(await authorizeFormAnswerRead(globalThis.accountCatalogDb, { id: 'admin', role: 'admin' }, reviewAnswer), true);
    sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='admin'");
    assert.equal(await authorizeFormAnswerRead(globalThis.accountCatalogDb, { id: 'admin', role: 'admin', permissions: ['product.review'] }, reviewAnswer), false);
  } finally { sqlite.close(); }
});

void test('owner account pages render private address, privacy and review answer snapshots only for that customer', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST: createAddress } = await import('../app/api/account/addresses/route');
    const { POST: createPrivacy } = await import('../app/api/account/privacy/route');
    const { POST: createReview } = await import('../app/api/products/[id]/reviews/route');
    seed(sqlite, 'account.address', 1, [extra]);
    seed(sqlite, 'account.privacy-request', 1, [extra]);
    seed(sqlite, 'account.review', 1, [extra]);
    assert.equal((await createAddress(jsonRequest('/api/account/addresses', 'POST', { address, idempotencyKey: 'view-address', formVersion: 1, customAnswers: answers }))).status, 201);
    assert.equal((await createPrivacy(jsonRequest('/api/account/privacy', 'POST', { requestType: 'access', detail: 'Please provide my account information.', requestId: 'view-privacy', formVersion: 1, customAnswers: answers }))).status, 201);
    assert.equal((await createReview(await reviewRequest('view-review', answers), { params: Promise.resolve({ id: 'product-1' }) })).status, 201);
    const { default: AddressesPage } = await import('../app/account/addresses/page');
    const { default: PrivacyPage } = await import('../app/account/privacy/page');
    const { default: OrdersPage } = await import('../app/account/orders/page');
    for (const render of [AddressesPage, PrivacyPage, OrdersPage]) {
      const html = renderToStaticMarkup(await render());
      assert.match(html, /Blue gate instruction/);
      assert.match(html, /Near the blue gate/);
    }
    globalThis.accountCatalogActor = { userId: 'other' };
    for (const render of [AddressesPage, PrivacyPage, OrdersPage]) {
      const html = renderToStaticMarkup(await render());
      assert.doesNotMatch(html, /Blue gate instruction|Near the blue gate/);
    }
  } finally { sqlite.close(); }
});

void test('staff record views reveal custom answers only inside assigned privacy and current review grants', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST: createPrivacy } = await import('../app/api/account/privacy/route');
    const { POST: createReview } = await import('../app/api/products/[id]/reviews/route');
    seed(sqlite, 'account.privacy-request', 1, [extra]);
    seed(sqlite, 'account.review', 1, [extra]);
    assert.equal((await createPrivacy(jsonRequest('/api/account/privacy', 'POST', { requestType: 'access', detail: 'Please provide my account information.', requestId: 'staff-view-privacy', formVersion: 1, customAnswers: answers }))).status, 201);
    assert.equal((await createReview(await reviewRequest('staff-view-review', answers), { params: Promise.resolve({ id: 'product-1' }) })).status, 201);
    const { default: AdminPrivacyPage } = await import('../app/admin/privacy/page');
    const { default: AdminReviewsPage } = await import('../app/admin/reviews/page');
    sqlite.exec("UPDATE data_rights_requests SET assigned_to='admin',status='assigned'");
    assert.match(renderToStaticMarkup(await AdminPrivacyPage()), /Blue gate instruction/);
    assert.match(renderToStaticMarkup(await AdminReviewsPage()), /Blue gate instruction/);
    sqlite.exec("UPDATE data_rights_requests SET assigned_to=NULL");
    sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='admin'");
    assert.doesNotMatch(renderToStaticMarkup(await AdminPrivacyPage()), /Blue gate instruction/);
    assert.doesNotMatch(renderToStaticMarkup(await AdminReviewsPage()), /Blue gate instruction/);
  } finally { sqlite.close(); }
});

void test('review answer history pages all 51 owned snapshots without including another customer', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'account.review', 1, [extra]);
    const item = sqlite.prepare('INSERT INTO order_items VALUES (?,?,?,?,?)');
    const review = sqlite.prepare(`INSERT INTO product_reviews(id,product_id,customer_id,order_item_id,rating,title,body,status,moderation_note,moderated_by,created_at,updated_at)
      VALUES (?,?,?,?,5,NULL,'A verified purchase review.','pending',NULL,NULL,?,?)`);
    const answer = sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES (?,'account.review',?,'account.review-v1','product_review',?,?,?,?)`);
    for (let index = 0; index < 51; index++) {
      item.run(`item-page-${index}`, 'order-1', 'product-1', 'delivered', 1);
      review.run(`review-page-${index}`, 'product-1', 'customer', `item-page-${index}`, index + 10, index + 10);
      answer.run(`answer-page-${index}`, `request-page-${index}`, `review-page-${index}`, 'customer',
        JSON.stringify({ formId: 'account.review', version: 1, answers: [{ fieldId: extra.id, label: extra.label, type: extra.type, value: `Note ${index}` }] }), index + 10);
    }
    item.run('item-page-other', 'order-other', 'product-1', 'delivered', 1);
    review.run('review-page-other', 'product-1', 'other', 'item-page-other', 100, 100);
    answer.run('answer-page-other', 'request-page-other', 'review-page-other', 'other',
      JSON.stringify({ formId: 'account.review', version: 1, answers: [{ fieldId: extra.id, label: extra.label, type: extra.type, value: 'Other private note' }] }), 100);
    const first = await listCustomerReviewAnswerHistory(globalThis.accountCatalogDb, 'customer');
    assert.equal(first.entries.length, 50);
    assert.ok(first.nextCursor);
    assert.ok(first.entries.every((entry) => entry.answer.actorId === 'customer'));
    const second = await listCustomerReviewAnswerHistory(globalThis.accountCatalogDb, 'customer', first.nextCursor!);
    assert.equal(second.entries.length, 1);
    assert.equal(second.nextCursor, null);
    assert.equal(second.entries[0].answer.answers.answers[0].value, 'Note 0');
  } finally { sqlite.close(); }
});

void test('mounted privacy form focuses a published custom field after server field error', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright is provided by the workspace runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'account-mounted-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { PrivacyRequestForm } from './components/account/privacy-request-form';
      createRoot(document.getElementById('root')!).render(<><PrivacyRequestForm /><PrivacyRequestForm /></>);
    `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'account-navigation', setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'account-fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'account-fixture' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  try {
    await page.route('https://account.test/**', async (route: {
      request(): { url(): string };
      fulfill(input: { status: number; contentType: string; body: string }): Promise<void>;
    }) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div>' });
      if (path === '/api/forms/account.privacy-request') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        config: { formId: 'account.privacy-request', version: 1, publishedAt: 1, fields: [extra] },
      }) });
      if (path === '/api/account/privacy') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({
        error: 'Blue gate instruction has an invalid answer.', fieldId: extra.id,
      }) });
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    });
    await page.goto('https://account.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const secondForm = page.locator('form[data-form-id="account.privacy-request"]').nth(1);
    await secondForm.locator('input[name="custom.delivery_note"]').fill('Near the blue gate');
    await secondForm.locator('textarea[name="detail"]').fill('Please provide my account information.');
    await secondForm.getByRole('button', { name: 'Submit request' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('has an invalid answer.') === true);
    assert.equal(await secondForm.locator('input[name="custom.delivery_note"]').evaluate((node: Element) => node === document.activeElement), true);
    assert.match(await secondForm.locator('[data-configured-field="delivery_note"] [role="alert"]').innerText(), /invalid answer/i);
  } finally { await page.close(); await browser.close(); }
});

void test('mounted profile and address forms retain final focus in the submitted instance', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright is provided by the workspace runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'account-focus-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ProfileForm } from './components/account/profile-form';
      import { AddressManager } from './components/account/address-manager';
      createRoot(document.getElementById('root')!).render(<>
        <section data-instance="first-profile"><ProfileForm displayName="First Person" phone={null} /></section>
        <section data-instance="second-profile"><ProfileForm displayName="Second Person" phone={null} /></section>
        <section data-instance="first-address"><AddressManager addresses={[]} /></section>
        <section data-instance="second-address"><AddressManager addresses={[]} /></section>
      </>);
    `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'account-focus-stubs', setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'account-focus' }));
      builder.onResolve({ filter: /^@\/components\/delivery\/location-picker$/ }, () => ({ path: 'location', namespace: 'account-focus' }));
      builder.onLoad({ filter: /.*/, namespace: 'account-focus' }, (args) => ({ contents: args.path === 'location'
        ? 'export function LocationPicker(){return null}'
        : 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  let addressAttempts = 0;
  try {
    await page.route('https://account.test/**', async (route: {
      request(): { url(): string };
      fulfill(input: { status: number; contentType: string; body: string }): Promise<void>;
    }) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div>' });
      if (path === '/api/forms/account.profile' || path === '/api/forms/account.address') return route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ config: {
          formId: path.endsWith('account.profile') ? 'account.profile' : 'account.address',
          version: 1, publishedAt: 1, fields: path.endsWith('account.address') ? [extra] : [],
        } }),
      });
      if (path === '/api/account/profile') return route.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: 'Name rejected', fieldId: 'displayName' }) });
      if (path === '/api/account/addresses') {
        addressAttempts++;
        const fieldId = addressAttempts === 1 ? 'landmark' : addressAttempts === 2 ? extra.id : undefined;
        return route.fulfill({ status: fieldId ? 400 : 500, contentType: 'application/json',
          body: JSON.stringify({ error: fieldId ? 'Address field rejected' : 'Service unavailable', fieldId }) });
      }
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    });
    await page.goto('https://account.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const secondProfile = page.locator('[data-instance="second-profile"] form');
    await secondProfile.getByRole('button', { name: 'Save changes' }).click();
    await secondProfile.getByRole('alert').waitFor();
    await page.waitForTimeout(75);
    assert.equal(await secondProfile.locator('input[name="displayName"]').evaluate((node: Element) => node === document.activeElement), true);

    const firstAddress = page.locator('[data-instance="first-address"]');
    const secondAddress = page.locator('[data-instance="second-address"]');
    await firstAddress.getByRole('button', { name: 'Add address' }).click();
    await secondAddress.getByRole('button', { name: 'Add address' }).click();
    const secondForm = secondAddress.locator('form[data-form-id="account.address"]');
    for (const [name, value] of Object.entries({ label: 'Home', recipientName: 'Second Person', phone: '9812345678',
      district: 'Dhanusha', municipality: 'Janakpurdham', locality: 'Main Road', landmark: 'Blue gate',
      'custom.delivery_note': 'Near the blue gate' })) await secondForm.locator(`[name="${name}"]`).fill(value);
    for (const [fieldId, selector] of [
      ['landmark', 'input[name="landmark"]'],
      [extra.id, 'input[name="custom.delivery_note"]'],
    ]) {
      await secondForm.getByRole('button', { name: 'Save address' }).click();
      await secondAddress.getByRole('alert').first().waitFor();
      await page.waitForTimeout(75);
      assert.equal(await secondForm.locator(selector).evaluate((node: Element) => node === document.activeElement), true,
        `field-specific ${fieldId} error must keep focus in second address form after effects`);
    }
    await secondForm.getByRole('button', { name: 'Save address' }).click();
    await secondAddress.getByRole('alert').first().getByText('Service unavailable').waitFor();
    await page.waitForTimeout(75);
    assert.equal(await secondAddress.locator('p[role="alert"][tabindex="-1"]').evaluate((node: Element) => node === document.activeElement), true,
      'generic address error should focus its summary');
  } finally { await page.close(); await browser.close(); }
});
