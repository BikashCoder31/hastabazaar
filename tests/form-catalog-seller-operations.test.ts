import { registerTransitionFixture,registeredTransitionFixtureInput,submitRegisteredTransitionFixture as submitRegisteredSellerTransition } from './helpers/registered-transition-fixture';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';
import { validateFormDraft } from '../lib/forms/validation';
import { buildFormAnswerInsert, listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import { createShippingJob, operateShippingJob } from '../lib/db/repositories/operations';
import { requestSellerPayout } from '../lib/db/repositories/payouts';
import { saveSellerReply } from '../lib/db/repositories/review-extras';
import { createFixedSupplyRecord } from '../lib/managed-commerce/fixed-supply';

import { resolveRuntimeEnvironment } from '../lib/staging/environment';
import { authorizeFormAnswerRead, formAnswerOwnerId } from '../lib/forms/access';
import { collectFormAnswersForPrivacy } from '../lib/forms/privacy';

declare global {
  var sellerOperationDb: D1Database;
  var sellerOperationActor: { sellerId: string; userId: string } | null;
  var sellerOperationCreateElement: typeof createElement;
}
globalThis.sellerOperationCreateElement = createElement;
registerHooks({ resolve(specifier, context, nextResolve) {
  if(specifier==='@/lib/auth/customer')return {url:`data:text/javascript,export class CustomerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireCustomerApi(){if(!globalThis.sellerOperationActor)throw new CustomerAuthorizationError('Sign in.',401);return globalThis.sellerOperationActor}`,shortCircuit:true};
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.sellerOperationDb},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://localhost:3000"}', shortCircuit: true };
  if (specifier === '@/lib/auth/seller') return { url: `data:text/javascript,
    export class SellerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireSellerApi(){if(!globalThis.sellerOperationActor)throw new SellerAuthorizationError('Authentication is required.',401);return globalThis.sellerOperationActor}
    export async function requireSellerPage(){if(!globalThis.sellerOperationActor)throw new SellerAuthorizationError('Authentication is required.',401);return globalThis.sellerOperationActor}`, shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function notFound(){throw new Error("Not found")}', shortCircuit: true };
  if (specifier === 'next/link') return { url: `data:text/javascript,export default function Link(props){return globalThis.sellerOperationCreateElement('a',{href:props.href,className:props.className},props.children)}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });

const operations = [
  ['seller.shipping-request', '/api/seller/shipping', 'operation', ['orderId', 'direction', 'requestId']],
  ['seller.shipping-action', '/api/seller/shipping/:id', 'operation', ['action', 'jobId', 'requestId']],
  ['seller.managed-supply-proposal', '/api/seller/managed-program', 'operation', ['productId', 'quantity', 'agreedUnitPaisa', 'requestId']],
  ['seller.managed-transition-request', '/api/seller-applications/transition', 'operation', ['taxMode', 'evidenceReferences', 'requestId']],
  ['seller.payout-request', '/api/seller/payout-requests', 'transaction', ['amount', 'requestId']],
  ['seller.review-reply', '/api/seller/reviews/:id/reply', 'collection', ['reviewId', 'version', 'idempotencyKey']],
] as const;

const context = { id: 'context_note', key: 'context_note', type: 'short_text', label: 'Context note', required: true, order: 0, status: 'active' } as const;

void test('seller operation sites publish contextual fields while domain controls stay locked', () => {
  for (const [id, route, mode, protectedKeys] of operations) {
    const definition = FORM_REGISTRY[id];
    assert.deepEqual(IMPLEMENTED_FORM_ADAPTERS[id], { formId: id, route, mode });
    assert.equal(definition.adapterId, id);
    assert.equal(definition.capabilities.answerBehavior, 'record');
    assert.deepEqual(validateFormDraft(id, { formId: id, fields: [context] }).fields, [context]);
    for (const key of protectedKeys) {
      assert.equal(definition.baseFields.find((field) => field.key === key)?.capability, 'protected', `${id}.${key}`);
      assert.throws(() => validateFormDraft(id, { formId: id, fields: [{ ...context, id: key, key }] }), `${id}.${key} must not become a custom field`);
    }
  }
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
  failAt: number | null = null;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const [index, statement] of statements.entries()) {
        if (index === this.failAt) throw new Error('Simulated domain batch failure');
        results.push(await statement.run());
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of (await readdir(new URL('../drizzle/', import.meta.url))).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    const source = await readFile(new URL(`../drizzle/${name}`, import.meta.url), 'utf8');
    for (const part of source.split('--> statement-breakpoint')) if (part.trim()) sqlite.exec(part);
  }
  const now = 1_800_000_000_000;
  for (const [id, role] of [['seller-user', 'seller'], ['other-user', 'seller'], ['buyer', 'customer'], ['admin', 'super_admin']] as const) {
    sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'active',?,?)")
      .run(id, `${id}@example.test`, id, now, now);
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,?)').run(id, role, now);
  }
  for (const [id, user] of [['seller-one', 'seller-user'], ['seller-two', 'other-user']] as const) {
    sqlite.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,approved_at,created_at,updated_at)
      VALUES (?,?,?,?,'Local',?,'PAN',?,'Maker','9800000000',?,'Madhesh','Dhanusha','Janakpur','Ward 1',?,'approved',?,?,?)`)
      .run(id, user, id, id, `REG-${id}`, `PAN-${id}`, `${id}@example.test`, `BANK-${id}`, now, now, now);
  }
  sqlite.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','cat','Category',1,1,?,?)").run(now, now);
  for (const [id, seller] of [['product-one', 'seller-one'], ['product-two', 'seller-two']] as const) {
    sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
      VALUES (?,?,'cat',?,?,?,'Fictional description',100000,10,'Maker','NP','Clay',1,'published',?,?)`).run(id, seller, id, id, id, now, now);
  }
  for (const [order, item, product, seller] of [['order-one', 'item-one', 'product-one', 'seller-one'], ['order-two', 'item-two', 'product-two', 'seller-two']] as const) {
    sqlite.prepare(`INSERT INTO orders(id,order_number,receipt_token_hash,customer_email,customer_phone,status,locale,currency,policy_version,return_policy_snapshot_json,shipping_address_json,item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,created_at,updated_at)
      VALUES (?,?,?,'buyer@example.test','9811111111','placed','en-NP','NPR','phase-1.0','{}','{}',100000,0,0,0,0,100000,'cod','pending',?,?,?)`)
      .run(order, order, `${order}-token`, now, now, now);
    sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,seller_discount_paisa,commission_bps,commission_paisa,tax_paisa,line_total_paisa,return_eligible_snapshot,fulfillment_status,created_at)
      VALUES (?,?,?,?,?,?,?,100000,1,0,1200,12000,0,100000,1,'pending',?)`)
      .run(item, order, product, seller, seller, product, product, now);
  }
  const db = new Database(sqlite);
  registerTransitionFixture(db as unknown as D1Database,sqlite);
  globalThis.sellerOperationDb = db as unknown as D1Database;
  globalThis.sellerOperationActor = { sellerId: 'seller-one', userId: 'seller-user' };
  return { sqlite, db, database: db as unknown as D1Database };
}
function publish(sqlite: DatabaseSync, formId: string, fields: unknown[] = [context], version = 1) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?, ?, ?, 1, 'published', ?, 'Test publication', 'admin', 1, 'admin', 1, 'admin', 1, ?)`)
    .run(`${formId}-v${version}`, formId, version, JSON.stringify({ formId, fields }), `seed-${formId}-${version}`);
}
function custom(value = 'Fictional context') { return [{ fieldId: context.id, value }]; }
function request(path: string, body: unknown) {
  return new Request(`http://localhost:3000${path}`, { method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

void test('seller actions bound request bodies and reject unauthenticated abuse before parsing', async () => {
  const { sqlite } = await fixture();
  try {
    const { POST: shipping } = await import('../app/api/seller/shipping/route');
    const { POST: managed } = await import('../app/api/seller/managed-program/route');
    const oversized = (path: string, size: number) => new Request(`http://localhost:3000${path}`, {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json',
        'content-length': String(size) }, body: '{}',
    });
    globalThis.sellerOperationActor = null;
    assert.equal((await shipping(oversized('/api/seller/shipping', 262_145))).status, 401);
    assert.equal((await managed(oversized('/api/seller/managed-program', 262_145))).status, 401);
    globalThis.sellerOperationActor = { sellerId: 'seller-one', userId: 'seller-user' };
    assert.equal((await shipping(oversized('/api/seller/shipping', 262_145))).status, 413);
    assert.equal((await managed(oversized('/api/seller/managed-program', 262_145))).status, 413);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get() as { n: number }).n, 0);
  } finally { sqlite.close(); }
});

void test('shipping request links answers atomically and only replays the same actor, order, and payload', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    publish(sqlite, 'seller.shipping-request');
    const { POST } = await import('../app/api/seller/shipping/route');
    const body = { orderId: 'order-one', direction: 'outbound', note: 'Pickup from studio desk.',
      requestId: 'shipping-one', formVersion: 1, customAnswers: custom() };
    const send = (input: unknown) => POST(request('/api/seller/shipping', input));
    assert.equal((await send({ ...body, requestId: 'missing', customAnswers: [] })).status, 400);
    assert.equal((await send({ ...body, requestId: 'unknown', customAnswers: [{ fieldId: 'unknown', value: 'x' }] })).status, 400);
    assert.equal((await send({ ...body, requestId: 'stale', formVersion: 2 })).status, 409);
    const first = await send(body);
    assert.equal(first.status, 201, JSON.stringify(await first.json()));
    const id = (await listFormAnswersForSubject(database, 'shipping_job',
      (sqlite.prepare("SELECT id FROM shipping_jobs WHERE created_request_id='shipping-one'").get() as { id: string }).id));
    assert.equal(id.length, 1);
    assert.equal(id[0].actorId, 'seller-user');
    assert.deepEqual(id[0].answers.answers.map((answer) => answer.value), ['Fictional context']);
    assert.equal((await send(body)).status, 201);
    assert.equal((await send({ ...body, note: 'Different location for pickup.' })).status, 409);
    assert.equal((await send({ ...body, orderId: 'order-two' })).status, 409);
    globalThis.sellerOperationActor = { sellerId: 'seller-two', userId: 'other-user' };
    assert.equal((await send(body)).status, 409);
    globalThis.sellerOperationActor = { sellerId: 'seller-one', userId: 'seller-user' };
    publish(sqlite, 'seller.shipping-request', [{ ...context, status: 'archived' }], 2);
    assert.equal((await send(body)).status, 201);
    assert.equal((await send({ ...body, requestId: 'new-stale' })).status, 409);
    assert.equal((await listFormAnswersForSubject(database, 'shipping_job', id[0].subjectId))[0].historicalFieldIds[0], context.id);
    db.failAt = 0;
    assert.equal((await send({ ...body, requestId: 'failed-domain', formVersion: 2, customAnswers: [] })).status, 500);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE request_id='failed-domain'").get() as { n: number }).n, 0);
  } finally { sqlite.close(); }
});

void test('pickup confirmation attaches to the exact event and rejects foreign or changed replay', async () => {
  const { sqlite, database } = await fixture();
  try {
    publish(sqlite, 'seller.shipping-action');
    const jobId = await createShippingJob(database, { orderId: 'order-one', sellerId: 'seller-one',
      actorId: 'seller-user', direction: 'outbound', note: 'Initial pickup request.', requestId: 'setup-shipping', now: 10 });
    await operateShippingJob(database, { jobId, actorId: 'admin', actorRole: 'admin',
      action: 'schedule_pickup', note: 'Carrier pickup window confirmed.', requestId: 'setup-schedule', now: 11 });
    const { POST } = await import('../app/api/seller/shipping/[id]/route');
    const body = { action: 'picked_up', note: 'Carrier collected the parcel.',
      requestId: 'pickup-one', formVersion: 1, customAnswers: custom() };
    const send = (id: string, input: unknown) => POST(request(`/api/seller/shipping/${id}`, input), { params: Promise.resolve({ id }) });
    assert.equal((await send(jobId, { ...body, requestId: 'pickup-missing', customAnswers: [] })).status, 400);
    assert.equal((await send(jobId, body)).status, 200);
    const event = sqlite.prepare("SELECT id FROM shipping_job_events WHERE request_id='pickup-one'").get() as { id: string };
    const answers = await listFormAnswersForSubject(database, 'shipping_job_event', event.id);
    assert.equal(answers.length, 1);
    assert.equal(answers[0].actorId, 'seller-user');
    assert.equal((await send(jobId, body)).status, 200);
    assert.equal((await send(jobId, { ...body, note: 'Different carrier pickup note.' })).status, 409);
    globalThis.sellerOperationActor = { sellerId: 'seller-two', userId: 'other-user' };
    assert.equal((await send(jobId, body)).status, 409);
    globalThis.sellerOperationActor = { sellerId: 'seller-one', userId: 'seller-user' };
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM shipping_job_events WHERE request_id='pickup-one'").get() as { n: number }).n, 1);
  } finally { sqlite.close(); }
});

void test('overlapping exact shipping requests and pickup actions commit one domain record and answer', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    publish(sqlite, 'seller.shipping-request');
    publish(sqlite, 'seller.shipping-action');
    const originalBatch = db.batch.bind(db);
    let batchTail: Promise<unknown> = Promise.resolve();
    db.batch = async (statements) => {
      const result = batchTail.then(() => originalBatch(statements));
      batchTail = result.then(() => undefined, () => undefined);
      return result;
    };
    const originalPrepare = db.prepare.bind(db);
    let target = 'SELECT id FROM shipping_jobs WHERE created_request_id';
    let arrived = 0;
    let release: () => void = () => undefined;
    let gate = new Promise<void>((resolve) => { release = resolve; });
    db.prepare = (sql) => {
      const statement = originalPrepare(sql);
      if (sql.includes(target)) {
        const first = statement.first.bind(statement);
        statement.first = async <T>() => {
          const result = await first<T>();
          arrived++;
          if (arrived === 2) release();
          await gate;
          return result;
        };
      }
      return statement;
    };
    const snapshot = (formId: 'seller.shipping-request' | 'seller.shipping-action') => ({ formId, version: 1,
      answers: [{ fieldId: context.id, label: context.label, type: context.type, value: 'Fictional context' }] });
    const jobOptions = { orderId: 'order-one', sellerId: 'seller-one', actorId: 'seller-user',
      direction: 'outbound' as const, note: 'Pickup from the workshop.', requestId: 'racing-job', now: 100,
      form: { requestId: 'racing-job', versionId: 'seller.shipping-request-v1', answers: snapshot('seller.shipping-request') } };
    const jobs = await Promise.all([createShippingJob(database, jobOptions), createShippingJob(database, jobOptions)]);
    assert.equal(arrived, 2, 'both calls must pass the same stale duplicate precheck');
    assert.equal(jobs[0], jobs[1]);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM shipping_jobs WHERE created_request_id='racing-job'").get() as { n: number }).n, 1);
    assert.equal((await listFormAnswersForSubject(database, 'shipping_job', jobs[0])).length, 1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id='racing-job' AND action='seller.shipping.requested'").get() as { n: number }).n, 1);
    await operateShippingJob(database, { jobId: jobs[0], actorId: 'admin', actorRole: 'admin',
      action: 'schedule_pickup', note: 'Carrier pickup window confirmed.', requestId: 'racing-schedule', now: 101 });
    target = 'SELECT id FROM shipping_job_events WHERE request_id';
    arrived = 0;
    gate = new Promise<void>((resolve) => { release = resolve; });
    const pickupOptions = { jobId: jobs[0], actorId: 'seller-user', actorRole: 'seller' as const,
      sellerId: 'seller-one', action: 'picked_up' as const, note: 'Carrier collected the parcel.',
      requestId: 'racing-pickup', now: 102,
      form: { requestId: 'racing-pickup', versionId: 'seller.shipping-action-v1', answers: snapshot('seller.shipping-action') } };
    await Promise.all([operateShippingJob(database, pickupOptions), operateShippingJob(database, pickupOptions)]);
    assert.equal(arrived, 2, 'both pickup calls must pass the same stale duplicate precheck');
    const event = sqlite.prepare("SELECT id FROM shipping_job_events WHERE request_id='racing-pickup'").get() as { id: string };
    assert.ok(event);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM shipping_job_events WHERE request_id='racing-pickup'").get() as { n: number }).n, 1);
    assert.equal((await listFormAnswersForSubject(database, 'shipping_job_event', event.id)).length, 1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id='racing-pickup' AND action='seller.shipping.picked_up'").get() as { n: number }).n, 1);
  } finally { sqlite.close(); }
});

void test('payout request records context with the protected balance snapshot and exact replay', async () => {
  const { sqlite, database } = await fixture();
  try {
    publish(sqlite, 'seller.payout-request');
    sqlite.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,type,amount_paisa,available_at,description,created_at)
      VALUES ('earned-one','seller-one','item-one','sale',50000,1,'Fictional earned balance',1)`).run();
    const { POST } = await import('../app/api/seller/payout-requests/route');
    const body = { note: 'Please review this payout.', requestId: 'payout-one', formVersion: 1, customAnswers: custom() };
    const send = (input: unknown) => POST(request('/api/seller/payout-requests', input));
    assert.equal((await send({ ...body, requestId: 'missing-payout', customAnswers: [] })).status, 400);
    assert.equal((await send({ ...body, amount: 1 })).status, 400);
    assert.equal((await send(body)).status, 201);
    const record = sqlite.prepare("SELECT id,available_amount_snapshot_paisa AS amount FROM payout_requests WHERE created_request_id='payout-one'")
      .get() as { id: string; amount: number };
    assert.equal(record.amount, 50000);
    const answers = await listFormAnswersForSubject(database, 'payout_request', record.id);
    assert.equal(answers.length, 1);
    assert.equal(answers[0].actorId, 'seller-user');
    assert.equal((await send(body)).status, 201);
    assert.equal((await send({ ...body, note: 'Please review a changed payout.' })).status, 409);
    globalThis.sellerOperationActor = { sellerId: 'seller-two', userId: 'other-user' };
    assert.equal((await send(body)).status, 409);
  } finally { sqlite.close(); }
});

void test('seller reply links context to one pending reply and cannot replay onto a foreign review', async () => {
  const { sqlite, database } = await fixture();
  try {
    publish(sqlite, 'seller.review-reply');
    for (const [id, product, item] of [['review-one', 'product-one', 'item-one'], ['review-two', 'product-two', 'item-two']] as const) {
      sqlite.prepare(`INSERT INTO product_reviews(id,product_id,customer_id,order_item_id,rating,title,body,status,created_at,updated_at)
        VALUES (?,?,?,?,5,'Fictional review','A fictional customer review.','published',1,1)`)
        .run(id, product, 'buyer', item);
    }
    const { POST } = await import('../app/api/seller/reviews/[id]/reply/route');
    const body = { body: 'Thank you for the thoughtful review.', idempotencyKey: 'reply-one', version: 0,
      formVersion: 1, customAnswers: custom() };
    const send = (id: string, input: unknown) => POST(request(`/api/seller/reviews/${id}/reply`, input), { params: Promise.resolve({ id }) });
    const missing = await send('review-one', { ...body, idempotencyKey: 'reply-missing', customAnswers: [] });
    assert.equal(missing.status, 400);
    assert.deepEqual(await missing.json(), { error: 'Required answer missing', fieldId: context.id });
    const invalid = await send('review-one', { ...body, idempotencyKey: 'reply-invalid',
      customAnswers: [{ fieldId: context.id, value: 123 }] });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'Invalid answer value', fieldId: context.id });
    const stale = await send('review-one', { ...body, idempotencyKey: 'reply-stale', formVersion: 2 });
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), { error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' });
    assert.equal((await send('review-one', body)).status, 200);
    const reply = sqlite.prepare("SELECT id FROM review_replies WHERE review_id='review-one'").get() as { id: string };
    const answers = await listFormAnswersForSubject(database, 'review_reply', reply.id);
    assert.equal(answers.length, 1);
    assert.equal(answers[0].actorId, 'seller-user');
    assert.equal((await send('review-one', body)).status, 200);
    assert.equal((await send('review-one', { ...body, body: 'Thank you, different reply text.' })).status, 409);
    assert.equal((await send('review-two', body)).status, 409);
    globalThis.sellerOperationActor = { sellerId: 'seller-two', userId: 'other-user' };
    assert.equal((await send('review-one', body)).status, 409);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM review_replies WHERE review_id='review-one'").get() as { n: number }).n, 1);
    const absent = await fixture();
    try {
      const unavailable = await send('review-one', { ...body, idempotencyKey: 'reply-unavailable' });
      assert.equal(unavailable.status, 503);
      const unavailableJson = await unavailable.json() as { error: string; code: string };
      assert.equal(unavailableJson.code, 'config_unavailable');
      assert.match(unavailableJson.error, /unavailable/i);
    } finally { absent.sqlite.close(); }
  } finally { sqlite.close(); }
});

void test('managed supply and route-transition actions each keep context on their exact staged record', async () => {
  const { sqlite, database } = await fixture();
  try {
    sqlite.prepare(`INSERT INTO seller_participation_profiles(seller_id,participation_route,application_stage,public_name,public_city,commercial_model,payout_beneficiary_reference,created_at,updated_at)
      VALUES ('seller-one','managed_maker','active','Fictional Maker','Janakpur','managed_fixed_supplier_price_v1','SIM-MAKER-ACCOUNT',1,1)`).run();
    for (const id of ['seller.managed-supply-proposal', 'seller.managed-transition-request']) publish(sqlite, id);
    const { POST } = await import('../app/api/seller/managed-program/route');
    const send = (body: unknown) => POST(request('/api/seller/managed-program', body));
    const proposal = { action: 'propose_fixed_supply', productId: 'product-one', quantity: 2,
      agreedUnitPaisa: 50000, agreementVersion: 'SIM-FIXED-V1', agreementLanguage: 'ne',
      payoutBeneficiaryReference: 'SIM-MAKER-ACCOUNT', requestId: 'supply-one', formVersion: 1,
      customAnswers: custom() };
    assert.equal((await send({ ...proposal, requestId: 'supply-missing', customAnswers: [] })).status, 400);
    assert.equal((await send(proposal)).status, 200);
    const supply = sqlite.prepare("SELECT id,agreed_unit_paisa AS amount FROM managed_supply_records WHERE proposal_request_id='supply-one'")
      .get() as { id: string; amount: number };
    assert.equal(supply.amount, 50000);
    assert.equal((await listFormAnswersForSubject(database, 'managed_supply', supply.id)).length, 1);
    assert.equal((await send(proposal)).status, 200);
    assert.equal((await send({ ...proposal, quantity: 3 })).status, 409);
    const transition = { action: 'request_registered_transition', legalName: 'Registered Fictional Maker',
      registrationAuthority: 'Cottage Office', registrationNumber: 'REG-TEST', taxMode: 'PAN',
      taxRegistrationNumber: 'PAN-TEST', evidenceReferences: ['private-document-one'],
      agreementVersion: 'SIM-REGISTERED-V1', agreementLanguage: 'ne', requestId: 'transition-one',
      formVersion: 1, customAnswers: custom() };
    assert.equal((await send({ ...transition, requestId: 'transition-missing', customAnswers: [] })).status, 400);
    assert.equal((await send(transition)).status,400,'The old free-text route must direct makers to private certificates and current terms');
    const prepared=await registeredTransitionFixtureInput(database,{...transition,sellerId:'seller-one',actorId:'seller-user',taxMode:'PAN',agreementLanguage:'en',agreementAcceptedAt:100,
      now:100,environment:resolveRuntimeEnvironment({runtimeEnvironment:'local_staging',appOrigin:'http://localhost:3000'})});
    const {POST:transitionPost}=await import('../app/api/seller-applications/transition/route');
    const transitionSend=(contextValue:string,requestId='transition-one')=>{
      const data=new FormData();for(const [key,value] of Object.entries({action:'submit',legalName:prepared.legalName,registrationAuthority:prepared.registrationAuthority,registrationNumber:prepared.registrationNumber,
        taxMode:prepared.taxMode,taxRegistrationNumber:prepared.taxRegistrationNumber,registeredTermsContext:prepared.registeredTermsContext!,agreementVersion:prepared.agreementVersion,agreementLanguage:'en',acceptedTerms:'yes',
        businessRegistrationId:prepared.evidenceReferences[0],panCertificateId:prepared.evidenceReferences[1],requestId,formVersion:'1','custom.context_note':contextValue}))data.set(key,value);
      return transitionPost(new Request('http://localhost:3000/api/seller-applications/transition',{method:'POST',headers:{origin:'http://localhost:3000'},body:data}));
    };
    assert.equal((await transitionSend('')).status,400);
    assert.equal((await transitionSend('Fictional context')).status,201);
    const application = sqlite.prepare("SELECT id FROM seller_route_transition_applications WHERE request_id='transition-one'").get() as { id: string };
    assert.equal((await listFormAnswersForSubject(database, 'seller_route_transition', application.id)).length, 1);
    assert.equal((await transitionSend('Fictional context')).status,200);
    assert.equal((await transitionSend('Changed context')).status,409);
    globalThis.sellerOperationActor = { sellerId: 'seller-two', userId: 'other-user' };
    assert.equal((await send(proposal)).status, 409);
    assert.equal((await transitionSend('Fictional context')).status,403);
  } finally { sqlite.close(); }
});

async function renderSellerOperation(entry: string, exported: string, props: Record<string, unknown>) {
  const compiled = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'], plugins: [{ name: 'seller-operation-client-boundaries', setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'seller-operation' }));
      b.onLoad({ filter: /^navigation$/, namespace: 'seller-operation' }, () => ({ contents: 'exports.useRouter=()=>({refresh(){}});', loader: 'js' }));
      b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'seller-operation'}));
      b.onLoad({filter:/^link$/,namespace:'seller-operation'},()=>({contents:'const React=require("react");module.exports=(props)=>React.createElement("a",props,props.children)',loader:'js'}));
      b.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'seller-operation' }));
      b.onLoad({ filter: /^config$/, namespace: 'seller-operation' }, () => ({ contents: `exports.usePublishedFormConfig=(id)=>({config:{formId:id,version:3,publishedAt:1,fields:${JSON.stringify([context])}},status:'ready',canSubmit:true,message:'',refresh(){},handleSubmissionResponse(){return true}});`, loader: 'js' }));
    } }],
  });
  const rendered = { exports: {} as Record<string, ComponentType<Record<string, unknown>>> };
  runInNewContext(compiled.outputFiles[0].text, { require: createRequire(import.meta.url), module: rendered,
    exports: rendered.exports, process, crypto });
  return renderToStaticMarkup(createElement(rendered.exports[exported], props));
}

void test('five synchronous seller operation forms render context and link to the owned transition workspace', async () => {
  const shipping = await renderSellerOperation('components/seller/shipping-workspace.tsx', 'SellerShippingWorkspace', {
    sellerId: 'seller-one',
    orders: [{ id: 'order-one', orderNumber: 'Fictional Order' }], jobs: [{ id: 'job-one', orderNumber: 'Fictional Order',
      status: 'pickup_scheduled', direction: 'outbound', trackingCode: null, labelReference: null,
      pickupWindowStart: null, pickupWindowEnd: null }],
  });
  const managed = await renderSellerOperation('components/seller/managed-program-workspace.tsx', 'SellerManagedProgramWorkspace', {
    sellerId: 'seller-one',
    workspace: { participationRoute: 'managed_maker', applicationStage: 'active',
      commercialModel: 'managed_fixed_supplier_price_v1', products: [{ id: 'product-one', name: 'Fictional item', sku: 'SKU-1' }],
      supplies: [], transitions: [] },
  });
  const payout = await renderSellerOperation('components/seller/payout-request-form.tsx', 'PayoutRequestForm', {
    availablePaisa: 50000, hasOpenRequest: false, sellerId: 'seller-one',
  });
  const reply = await renderSellerOperation('components/seller/review-reply-form.tsx', 'ReviewReplyForm', {
    reviewId: 'review-one', version: 0, initialBody: '', status: undefined, sellerId: 'seller-one',
  });
  for (const [formId, html] of [
    ['seller.shipping-request', shipping], ['seller.shipping-action', shipping],
    ['seller.managed-supply-proposal', managed],
    ['seller.payout-request', payout], ['seller.review-reply', reply],
  ]) {
    const form = (html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) ?? []).find((part) => part.includes(`data-form-id="${formId}"`));
    assert.ok(form, `${formId}: form identity missing`);
    assert.match(form, /data-configured-field="context_note"/, `${formId}: configured context missing`);
    assert.match(form, /name="formVersion" value="3"/, `${formId}: version missing`);
    const control = (form.match(/<input\b[^>]*>/g) ?? []).find((tag) => tag.includes('name="custom.context_note"'));
    assert.match(control ?? '', /\brequired(?:=|\s|>)/, `${formId}: required answer missing`);
  }
  assert.match(managed,/href="\/sell\/application#registered-transition"/);
});

void test('seller action answers resolve ownership from six parent records and enter privacy export', async () => {
  const { sqlite, database } = await fixture();
  try {
    const environment = resolveRuntimeEnvironment({ runtimeEnvironment: 'local_staging', appOrigin: 'http://localhost:3000' });
    const shipping = await createShippingJob(database, { orderId: 'order-one', sellerId: 'seller-one',
      actorId: 'seller-user', direction: 'outbound', note: 'Pickup from maker studio.', requestId: 'owner-shipping', now: 10 });
    await operateShippingJob(database, { jobId: shipping, actorId: 'admin', actorRole: 'admin', action: 'schedule_pickup',
      note: 'Carrier scheduling was completed.', requestId: 'owner-schedule', now: 11 });
    await operateShippingJob(database, { jobId: shipping, actorId: 'seller-user', actorRole: 'seller', sellerId: 'seller-one',
      action: 'picked_up', note: 'Carrier collected the parcel.', requestId: 'owner-pickup', now: 12 });
    const pickup = sqlite.prepare("SELECT id FROM shipping_job_events WHERE request_id='owner-pickup'").get() as { id: string };
    sqlite.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,type,amount_paisa,available_at,description,created_at)
      VALUES ('owner-earned','seller-one','item-one','sale',50000,1,'Fictional earned balance',1)`).run();
    const payout = await requestSellerPayout(database, { sellerId: 'seller-one', actorId: 'seller-user',
      note: 'Please review this payout.', requestId: 'owner-payout', now: 20 });
    sqlite.prepare(`INSERT INTO product_reviews(id,product_id,customer_id,order_item_id,rating,title,body,status,created_at,updated_at)
      VALUES ('owner-review','product-one','buyer','item-one',5,'Fictional review','A fictional customer review.','published',1,1)`).run();
    await saveSellerReply(database, { reviewId: 'owner-review', sellerId: 'seller-one', actorId: 'seller-user',
      body: 'Thank you for the helpful review.', version: 0, requestId: 'owner-reply', now: 30 });
    const reply = sqlite.prepare("SELECT id FROM review_replies WHERE review_id='owner-review'").get() as { id: string };
    sqlite.prepare(`INSERT INTO seller_participation_profiles(seller_id,participation_route,application_stage,public_name,public_city,commercial_model,payout_beneficiary_reference,created_at,updated_at)
      VALUES ('seller-one','managed_maker','active','Fictional Maker','Janakpur','managed_fixed_supplier_price_v1','SIM-MAKER-ACCOUNT',1,1)`).run();
    const supply = await createFixedSupplyRecord(database, { sellerId: 'seller-one', productId: 'product-one', quantity: 2,
      agreedUnitPaisa: 50000, createdBy: 'seller-user', agreementVersion: 'SIM-FIXED-V1', agreementLanguage: 'ne',
      payoutBeneficiaryReference: 'SIM-MAKER-ACCOUNT', requestId: 'owner-supply', now: 40, environment });
    const transition = await submitRegisteredSellerTransition(database, { sellerId: 'seller-one', actorId: 'seller-user',
      legalName: 'Registered Fictional Maker', registrationAuthority: 'Cottage Office', registrationNumber: 'REG-TEST',
      taxMode: 'PAN', taxRegistrationNumber: 'PAN-TEST', evidenceReferences: ['private-document-one'],
      agreementVersion: 'SIM-REGISTERED-V1', agreementLanguage: 'ne', agreementAcceptedAt: 50,
      requestId: 'owner-transition', now: 50, environment });
    const subjects = [
      ['seller.shipping-request', 'shipping_job', shipping],
      ['seller.shipping-action', 'shipping_job_event', pickup.id],
      ['seller.payout-request', 'payout_request', payout],
      ['seller.review-reply', 'review_reply', reply.id],
      ['seller.managed-supply-proposal', 'managed_supply', supply],
      ['seller.managed-transition-request', 'seller_route_transition', transition],
    ] as const;
    for (const [formId, subjectType, subjectId] of subjects) {
      publish(sqlite, formId);
      await buildFormAnswerInsert(database, { formId, requestId: `answer-${formId}`, versionId: `${formId}-v1`,
        subjectType, subjectId, actorId: 'seller-user', now: 100,
        answers: { formId, version: 1, answers: [{ fieldId: context.id, label: context.label,
          type: context.type, value: 'Fictional context' }] } }).run();
      const answer = (await listFormAnswersForSubject(database, subjectType, subjectId))[0];
      assert.equal(await formAnswerOwnerId(database, answer), 'seller-user', `${subjectType}: owner`);
      assert.equal(await authorizeFormAnswerRead(database, { id: 'seller-user', role: 'seller' }, answer), true,
        `${subjectType}: own answer`);
      assert.equal(await authorizeFormAnswerRead(database, { id: 'other-user', role: 'seller' }, answer), false,
        `${subjectType}: foreign seller`);
    }
    const exported = await collectFormAnswersForPrivacy(database, 'seller-user');
    assert.deepEqual(new Set(exported.map((answer) => answer.subjectType)),
      new Set(subjects.map(([, subjectType]) => subjectType)));
    assert.equal((await collectFormAnswersForPrivacy(database, 'other-user')).length, 0);
  } finally { sqlite.close(); }
});

void test('seller action history pages beyond fifty records and keeps foreign answers private', async () => {
  const { sqlite, database } = await fixture();
  try {
    publish(sqlite, 'seller.review-reply', [{ ...context, label: 'Original context label' }]);
    sqlite.prepare(`INSERT INTO product_reviews(id,product_id,customer_id,order_item_id,rating,title,body,status,created_at,updated_at)
      VALUES ('history-review','product-one','buyer','item-one',5,'Fictional review','A fictional customer review.','published',1,1)`).run();
    sqlite.prepare(`INSERT INTO product_reviews(id,product_id,customer_id,order_item_id,rating,title,body,status,created_at,updated_at)
      VALUES ('foreign-history-review','product-two','buyer','item-two',5,'Foreign review','A private foreign review.','published',1,1)`).run();
    for (let index = 1; index <= 52; index++) {
      sqlite.prepare(`INSERT INTO review_replies(id,review_id,seller_id,body,version,status,created_at)
        VALUES (?,'history-review','seller-one','Fictional reply text.',?,'pending',?)`)
        .run(`history-reply-${index}`, index, index);
      await buildFormAnswerInsert(database, { formId: 'seller.review-reply', requestId: `history-answer-${index}`,
        versionId: 'seller.review-reply-v1', subjectType: 'review_reply', subjectId: `history-reply-${index}`,
        actorId: 'seller-user', now: index, answers: { formId: 'seller.review-reply', version: 1,
          answers: [{ fieldId: context.id, label: 'Original context label', type: context.type,
            value: `Fictional context ${index}` }] } }).run();
    }
    sqlite.prepare(`INSERT INTO review_replies(id,review_id,seller_id,body,version,status,created_at)
      VALUES ('foreign-history-reply','foreign-history-review','seller-two','Private foreign reply.',1,'pending',100)`).run();
    await buildFormAnswerInsert(database, { formId: 'seller.review-reply', requestId: 'foreign-history-answer',
      versionId: 'seller.review-reply-v1', subjectType: 'review_reply', subjectId: 'foreign-history-reply',
      actorId: 'other-user', now: 100, answers: { formId: 'seller.review-reply', version: 1,
        answers: [{ fieldId: context.id, label: 'Original context label', type: context.type, value: 'Private foreign context' }] } }).run();
    publish(sqlite, 'seller.review-reply', [{ ...context, status: 'archived' }], 2);
    const { default: Page } = await import('../app/seller/form-history/page');
    const list = await Page({ searchParams: Promise.resolve({ kind: 'review-reply' }) });
    const html = renderToStaticMarkup(list);
    assert.match(html, /history-reply-52/);
    assert.doesNotMatch(html, /history-reply-1(?:\D|$)/);
    assert.doesNotMatch(html, /foreign-history-reply|Private foreign context/);
    assert.match(html, /Next older records/);
    const older = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({
      kind: 'review-reply', beforeAt: '3', beforeId: 'history-reply-3',
    }) }));
    assert.match(older, /history-reply-1/);
    const detail = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({
      kind: 'review-reply', id: 'history-reply-1',
    }) }));
    assert.match(detail, /Original context label/);
    assert.match(detail, /Historical/);
    await assert.rejects(Page({ searchParams: Promise.resolve({ kind: 'review-reply', id: 'foreign-history-reply' }) }), /Not found/);
    await assert.rejects(Page({ searchParams: Promise.resolve({ kind: 'unknown-kind', id: 'history-reply-1' }) }), /Not found/);
  } finally { sqlite.close(); }
});
