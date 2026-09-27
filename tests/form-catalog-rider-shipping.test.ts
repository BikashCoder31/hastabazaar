import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire, registerHooks } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharpImport from 'sharp';

const sharp = sharpImport as (input: object) => { png(): { toBuffer(): Promise<Uint8Array> } };

import { issueRiderOtp, submitRiderApplication, submitRiderReport, submitRiderRemittance, verifyRiderOtp } from '../lib/riders/repository';
import { assignDelivery, DeliveryError } from '../lib/delivery/repository';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';
import { validateFormDraft } from '../lib/forms/validation';
import { authorizeFormAnswerRead } from '../lib/forms/access';
import { buildFormAnswerInsert, listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import { createShippingJob, operateShippingJob } from '../lib/db/repositories/operations';
import { collectFormAnswersForPrivacy } from '../lib/forms/privacy';
import { assertNoIdentitySecrets } from '../lib/auth/identity-form-answers';

declare global {
  var riderCatalogDb: D1Database;
  var riderCatalogMedia: { stored: string[]; deleted: string[]; put(key: string, data: unknown): Promise<void>; delete(key: string): Promise<void> };
  var riderCatalogSellerActor: { sellerId: string; userId: string } | null;
  var riderCatalogCustomerId: string;
  var riderCatalogStaffRole: 'admin' | 'super_admin';
  var riderCatalogCreateElement: typeof createElement;
}
globalThis.riderCatalogCreateElement = createElement;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.riderCatalogDb},get MEDIA(){return globalThis.riderCatalogMedia}}', shortCircuit: true };
  if (specifier === '@/lib/auth/customer') return { url: `data:text/javascript,
    export class CustomerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireCustomerApi(){return {userId:globalThis.riderCatalogCustomerId}}
    export async function requireCustomerPage(){return {userId:globalThis.riderCatalogCustomerId}}`, shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){return {id:'admin',role:globalThis.riderCatalogStaffRole}}
    export async function requireStaffPage(){return {id:'admin',role:globalThis.riderCatalogStaffRole}}`, shortCircuit: true };
  if (specifier === '@/lib/auth/seller') return { url: `data:text/javascript,
    export class SellerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireSellerApi(){if(!globalThis.riderCatalogSellerActor)throw new SellerAuthorizationError('Authentication required.',401);return globalThis.riderCatalogSellerActor}
    export async function requireSellerPage(){if(!globalThis.riderCatalogSellerActor)throw new SellerAuthorizationError('Authentication required.',401);return globalThis.riderCatalogSellerActor}`, shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function notFound(){throw new Error("Not found")} export function useRouter(){return {refresh(){}}}', shortCircuit: true };
  if (specifier === 'next/link') return { url: `data:text/javascript,export default function Link(props){return globalThis.riderCatalogCreateElement('a',{href:props.href,className:props.className},props.children)}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { return { meta: { changes: Number(this.statement.run(...this.values).changes) } }; }
}
class Database {
  beforeBatch: (() => void) | null = null;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.beforeBatch?.();
    this.beforeBatch = null;
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,auth_subject TEXT,status TEXT);
    CREATE TABLE user_roles(user_id TEXT,role TEXT);
    CREATE TABLE staff_permission_profiles(user_id TEXT,permissions_json TEXT,version INTEGER,updated_by TEXT,updated_at INTEGER);
    CREATE TABLE staff_permission_guards(id TEXT,valid INTEGER CHECK(valid=1));
    CREATE TABLE operation_transaction_guards(id TEXT,valid INTEGER CHECK(valid=1));
    CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,payment_mode TEXT,customer_id TEXT,receipt_token_hash TEXT,status TEXT,customer_email TEXT,recipient_email TEXT);
    CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT);
    CREATE TABLE managed_commercial_snapshots(id TEXT PRIMARY KEY,order_item_id TEXT);
    CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,order_id TEXT,status TEXT);
    CREATE TABLE shipping_parcels(shipping_job_id TEXT,rider_user_id TEXT,version INTEGER,method TEXT,cod_due_paisa INTEGER,collected_paisa INTEGER,operation_request_id TEXT,open_box_required INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE audit_logs(id TEXT,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,next_json TEXT,request_id TEXT,created_at INTEGER);
    CREATE TABLE notification_messages(id TEXT,recipient_user_id TEXT,audience_role TEXT,channel TEXT,template_key TEXT,subject_en TEXT,subject_ne TEXT,body_en TEXT,body_ne TEXT,related_type TEXT,related_id TEXT,status TEXT,request_id TEXT UNIQUE,created_at INTEGER,business_event_key TEXT,required_permission TEXT,guest_email TEXT,guest_order_id TEXT);
    INSERT INTO users VALUES ('rider','rider','active'),('admin','admin','active'),('customer','customer','active');
    INSERT INTO user_roles VALUES ('admin','admin');
    INSERT INTO orders VALUES ('order','HB-TEST','prepaid','customer','receipt-hash','dispatched','customer@example.test',NULL);
    INSERT INTO shipping_jobs VALUES ('job','order','dispatched');
    INSERT INTO shipping_parcels VALUES ('job','rider',0,'own_rider',0,0,NULL,0);`);
  sqlite.exec(readFileSync('drizzle/0038_verified_riders.sql', 'utf8'));
  sqlite.exec(`ALTER TABLE rider_profiles ADD COLUMN open_box_eligible INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE rider_profiles ADD COLUMN open_box_reviewed_by TEXT;
    ALTER TABLE rider_profiles ADD COLUMN open_box_reviewed_at INTEGER;`);
  sqlite.exec("ALTER TABLE rider_reports ADD COLUMN open_box_outcome TEXT NOT NULL DEFAULT 'not_applicable'");
  sqlite.exec(readFileSync('drizzle/0034_exception_work.sql', 'utf8'));
  for (const statement of readFileSync('drizzle/0056_form_catalog.sql', 'utf8').split('--> statement-breakpoint'))
    if (statement.trim()) sqlite.exec(statement);
  sqlite.exec("INSERT INTO rider_profiles(user_id,status,application_id,updated_at) VALUES ('rider','approved','app',1)");
  sqlite.exec(`CREATE TABLE parcel_cash_records(id TEXT PRIMARY KEY,shipping_job_id TEXT,kind TEXT,
    amount_paisa INTEGER,evidence_reference TEXT,status TEXT,created_by TEXT,created_at INTEGER,rider_user_id TEXT);
    CREATE TABLE rider_cash_obligations(id TEXT PRIMARY KEY,shipping_job_id TEXT,rider_user_id TEXT,
    amount_paisa INTEGER);
    CREATE TABLE rider_remittance_allocations(id TEXT PRIMARY KEY,obligation_id TEXT,amount_paisa INTEGER);
    CREATE TABLE parcel_operation_events(id TEXT PRIMARY KEY,order_id TEXT,shipping_job_id TEXT,actor_id TEXT,
    action TEXT,payload_json TEXT,note TEXT,created_at INTEGER);
    INSERT INTO rider_cash_obligations VALUES ('obligation','job','rider',5000);`);
  sqlite.exec(`CREATE TABLE delivery_assignments(order_id TEXT PRIMARY KEY,method TEXT,rider_user_id TEXT,
    courier_name TEXT,tracking_url TEXT,tracking_reference TEXT,assigned_by TEXT,updated_at INTEGER);
    CREATE TABLE shipments(order_id TEXT,tracking_code TEXT);`);
  sqlite.exec(`CREATE TABLE request_rate_limits(key TEXT PRIMARY KEY,request_count INTEGER,
    window_started_at INTEGER,expires_at INTEGER);`);
  for (const formId of ['rider.report', 'rider.application', 'rider.remittance', 'rider.code-verify', 'staff.delivery-assignment']) {
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?, ?,1,1,'published',?,'Fixture','admin',1,'admin',1,'admin',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [] }), `seed-${formId}`);
  }
  const db = new Database(sqlite);
  globalThis.riderCatalogDb = db as unknown as D1Database;
  globalThis.riderCatalogCustomerId = 'rider';
  globalThis.riderCatalogStaffRole = 'admin';
  globalThis.riderCatalogMedia = { stored: [], deleted: [], async put(key) { this.stored.push(key); },
    async delete(key) { this.deleted.push(key); } };
  return { sqlite, db: db as unknown as D1Database, control: db };
}

function shippingFixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter((item) => /^\d{4}_.+\.sql$/.test(item)).sort()) {
    const source = readFileSync(`drizzle/${name}`, 'utf8');
    for (const part of source.split('--> statement-breakpoint')) if (part.trim()) sqlite.exec(part);
  }
  const now = 1_800_000_000_000;
  for (const [id, role] of [['seller-user', 'seller'], ['other-seller', 'seller'],
    ['buyer', 'customer'], ['admin', 'admin']] as const) {
    sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'active',?,?)")
      .run(id, `${id}@example.test`, id, now, now);
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,?)').run(id, role, now);
  }
  for (const [id, user] of [['seller-one', 'seller-user'], ['seller-two', 'other-seller']] as const) {
    sqlite.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
      registration_number,tax_mode,tax_registration_number,representative_name,support_phone,
      support_email,province,district,municipality,locality,payout_account_reference,status,
      approved_at,created_at,updated_at)
      VALUES (?,?,?,?,'Local',?,'PAN',?,'Maker','9800000000',?,'Madhesh','Dhanusha',
        'Janakpur','Ward 1',?,'approved',?,?,?)`)
      .run(id, user, id, id, `REG-${id}`, `PAN-${id}`, `${id}@example.test`, `BANK-${id}`, now, now, now);
  }
  sqlite.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','cat','Category',1,1,?,?)").run(now, now);
  sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,
    price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
    VALUES ('product','seller-one','cat','product','product','Product','Description',100000,10,
      'Maker','NP','Clay',1,'published',?,?)`).run(now, now);
  sqlite.prepare(`INSERT INTO orders(id,order_number,receipt_token_hash,customer_email,customer_phone,
    status,locale,currency,policy_version,return_policy_snapshot_json,shipping_address_json,
    item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,
    tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,created_at,updated_at)
    VALUES ('order','HB-TEST','receipt','buyer@example.test','9811111111','placed','en-NP',
      'NPR','phase-1.0','{}','{}',100000,0,0,0,0,100000,'cod','pending',?,?,?)`).run(now, now, now);
  sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,
    product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,seller_discount_paisa,
    commission_bps,commission_paisa,tax_paisa,line_total_paisa,return_eligible_snapshot,
    fulfillment_status,created_at) VALUES ('item','order','product','seller-one','Seller',
      'Product','product',100000,1,0,1200,12000,0,100000,1,'pending',?)`).run(now);
  for (const id of ['shipping.console-request', 'shipping.console-action-seller',
    'shipping.console-action-staff']) {
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
      reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?, ?,1,1,'published',?,'Fixture','admin',1,'admin',1,'admin',1,?)`)
      .run(`${id}-v1`, id, JSON.stringify({ formId: id, fields: [] }), `seed-${id}`);
  }
  const db = new Database(sqlite);
  globalThis.riderCatalogDb = db as unknown as D1Database;
  globalThis.riderCatalogSellerActor = { sellerId: 'seller-one', userId: 'seller-user' };
  globalThis.riderCatalogCustomerId = 'buyer';
  globalThis.riderCatalogStaffRole = 'admin';
  return { sqlite, db: db as unknown as D1Database };
}

function publishNextVersion(sqlite: DatabaseSync, formId: string) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
    reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?, ?,2,1,'published',?,'Fixture revision','admin',2,'admin',2,'admin',2,?)`)
    .run(`${formId}-v2`, formId, JSON.stringify({ formId, fields: [] }), `seed-${formId}-v2`);
}
function publishConfiguredVersion(sqlite: DatabaseSync, formId: string, version: number, fields: unknown[]) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
    reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?,?,?,1,'published',?,'Fixture revision','admin',2,'admin',2,'admin',2,?)`)
    .run(`${formId}-v${version}`, formId, version, JSON.stringify({ formId, fields }),
      `seed-${formId}-v${version}`);
}

const report = {
  riderId: 'rider', jobId: 'job', version: 0, kind: 'customer_unavailable',
  note: 'Customer was unavailable at the agreed place.', cashPaisa: 0,
  key: null, mime: null, requestId: 'report-one', now: 100,
};
const form = {
  requestId: 'report-one', versionId: 'rider.report-v1',
  answers: { formId: 'rider.report', version: 1, answers: [] },
  digest: 'exact-report-payload',
};

void test('rider, delivery, and distinct shipping console adapters protect domain controls', () => {
  const specs = [
    ['rider.application', '/api/rider/application', 'collection', ['identityNumber', 'identityPhoto', 'requestId', 'formVersion']],
    ['rider.report', '/api/rider/reports', 'operation', ['photo', 'video', 'cashPaisa', 'jobId']],
    ['rider.remittance', '/api/rider/remittances', 'operation', ['amountPaisa', 'jobId', 'requestId']],
    ['rider.code-verify', '/api/rider/verify-code', 'identity', ['code', 'jobId', 'requestId']],
    ['staff.delivery-assignment', '/api/admin/orders/:id/delivery', 'operation', ['method', 'orderId', 'requestId']],
    ['shipping.console-request', '/api/seller/shipping', 'operation', ['orderId', 'direction', 'sellerId']],
    ['shipping.console-action-seller', '/api/seller/shipping/:id', 'operation', ['action', 'jobId', 'sellerId']],
    ['shipping.console-action-staff', '/api/admin/shipping/:id', 'operation', ['action', 'jobId', 'reconciliationStatus']],
  ] as const;
  for (const [id, route, mode, protectedKeys] of specs) {
    assert.deepEqual(IMPLEMENTED_FORM_ADAPTERS[id], { formId: id, route, mode });
    assert.equal(FORM_REGISTRY[id].adapterId, id);
    assert.equal(FORM_REGISTRY[id].capabilities.answerBehavior, 'record');
    assert.deepEqual(validateFormDraft(id, { formId: id, fields: [] }).fields, []);
    for (const key of protectedKeys) {
      assert.equal(FORM_REGISTRY[id].baseFields.find((field) => field.key === key)?.capability,
        'protected', `${id}.${key}`);
      assert.throws(() => validateFormDraft(id, { formId: id, fields: [{ id: key,
        key, type: 'short_text', label: 'Unsafe override', required: false, order: 0,
        status: 'active' }] }), `${id}.${key}`);
    }
  }
});

void test('rider report commits one versioned answer on the exact report', async () => {
  const { sqlite, db } = fixture();
  try {
    const id = await submitRiderReport(db, { ...report, form });
    const row = sqlite.prepare(`SELECT form_id AS formId,request_id AS requestId,
      subject_type AS subjectType,subject_id AS subjectId,actor_id AS actorId
      FROM form_answer_sets`).get() as Record<string, unknown> | undefined;
    assert.deepEqual(row && { ...row }, { formId: 'rider.report', requestId: 'report-one',
      subjectType: 'rider_report', subjectId: id, actorId: 'rider' });
  } finally { sqlite.close(); }
});

void test('exact rider report retry returns its original report and rejects changed content', async () => {
  const { sqlite, db } = fixture();
  try {
    const id = await submitRiderReport(db, { ...report, form });
    assert.equal(await submitRiderReport(db, { ...report, form, now: 101 }), id);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM rider_reports').get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 1);
    await assert.rejects(submitRiderReport(db, { ...report, note: 'Different delivery details.',
      form: { ...form, digest: 'changed-report-payload' }, now: 102 }));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('rider application links its answer to the immutable application record', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("DELETE FROM rider_profiles WHERE user_id='rider'");
    const requestId = 'rider-application-one';
    const id = await submitRiderApplication(db, {
      userId: 'rider', legalName: 'Fictional Rider', phone: '9800000000',
      district: 'Kathmandu', identityType: 'citizenship', identityNumber: 'TEST-ONLY-1',
      key: 'private/rider-identity/rider/test-only', mime: 'image/jpeg', now: 100,
      form: { requestId, versionId: 'rider.application-v1',
        answers: { formId: 'rider.application', version: 1, answers: [] },
        digest: 'exact-application-payload' },
    });
    const answer = sqlite.prepare(`SELECT subject_type AS type,subject_id AS id,actor_id AS actor
      FROM form_answer_sets WHERE form_id='rider.application'`).get() as Record<string, unknown> | undefined;
    assert.deepEqual(answer && { ...answer }, { type: 'rider_application', id, actor: 'rider' });
  } finally { sqlite.close(); }
});

void test('rider application retry reuses only the same actor and submitted payload', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("DELETE FROM rider_profiles WHERE user_id='rider'");
    const input = { userId: 'rider', legalName: 'Fictional Rider', phone: '9800000000',
      district: 'Kathmandu', identityType: 'citizenship', identityNumber: 'TEST-ONLY-1',
      key: 'private/rider-identity/rider/test-only', mime: 'image/jpeg', now: 100,
      form: { requestId: 'rider-application-retry', versionId: 'rider.application-v1',
        answers: { formId: 'rider.application', version: 1, answers: [] },
        digest: 'exact-application-retry' },
    };
    const id = await submitRiderApplication(db, input);
    assert.equal(await submitRiderApplication(db, { ...input, key: 'new-upload-key', now: 101 }), id);
    await assert.rejects(submitRiderApplication(db, { ...input, form: { ...input.form,
      digest: 'changed-application-retry' }, now: 102 }));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM rider_applications').get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='rider.application'").get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('application history remains available to its applicant; staff-only assignment stays private', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('rider','customer'); INSERT INTO user_roles VALUES ('customer','customer'); INSERT INTO user_roles VALUES ('admin','super_admin'); DELETE FROM rider_profiles WHERE user_id='rider';");
    const applicationId = await submitRiderApplication(db, { userId: 'rider',
      legalName: 'Fictional Rider', phone: '9800000000', district: 'Kathmandu',
      identityType: 'citizenship', identityNumber: 'TEST-ONLY-1',
      key: 'private/rider-identity/rider/test-only', mime: 'image/jpeg', now: 100,
      form: { requestId: 'access-application', versionId: 'rider.application-v1',
        answers: { formId: 'rider.application', version: 1, answers: [] }, digest: 'access-application-digest' } });
    const application = (await listFormAnswersForSubject(db, 'rider_application', applicationId))[0];
    assert.equal(await authorizeFormAnswerRead(db, { id: 'rider', role: 'customer' }, application), true);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'customer', role: 'customer' }, application), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin', role: 'admin' }, application), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin', role: 'super_admin' }, application), true);

    sqlite.exec("DELETE FROM shipping_parcels; INSERT INTO shipments VALUES ('order',NULL)");
    await assignDelivery(db, { orderId: 'order', actorId: 'admin', method: 'courier',
      courierName: 'Fictional Courier', trackingReference: 'TEST-TRACK', now: 100,
      requestId: 'access-delivery', form: { requestId: 'access-delivery',
        versionId: 'staff.delivery-assignment-v1', digest: 'access-delivery-digest',
        answers: { formId: 'staff.delivery-assignment', version: 1, answers: [] } } });
    const assignment = (await listFormAnswersForSubject(db, 'order', 'order'))[0];
    assert.equal(await authorizeFormAnswerRead(db, { id: 'customer', role: 'customer' }, assignment), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin', role: 'admin' }, assignment), true);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin', role: 'admin' },
      { ...assignment, subjectId: 'nonexistent-order' }), false);
    sqlite.exec("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin','[]',1,'admin',1)");
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin', role: 'admin' }, assignment), false);
  } finally { sqlite.close(); }
});

void test('rider remittance answer commits with its pending cash record', async () => {
  const { sqlite, db } = fixture();
  try {
    const requestId = 'remittance-test-one';
    const result = await submitRiderRemittance(db, { riderId: 'rider', jobId: 'job',
      requestId, amountPaisa: 1000, reference: 'TEST-RECEIPT', now: 100,
      form: { requestId, versionId: 'rider.remittance-v1',
        answers: { formId: 'rider.remittance', version: 1, answers: [] },
        digest: 'exact-remittance-payload' } });
    const answer = sqlite.prepare(`SELECT subject_type AS type,subject_id AS id,actor_id AS actor
      FROM form_answer_sets WHERE form_id='rider.remittance'`).get() as Record<string, unknown> | undefined;
    assert.deepEqual(answer && { ...answer }, { type: 'parcel_cash_record', id: result.id, actor: 'rider' });
  } finally { sqlite.close(); }
});

void test('legacy courier assignment links one answer to its order action', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("DELETE FROM shipping_parcels; INSERT INTO shipments VALUES ('order',NULL)");
    await assignDelivery(db, { orderId: 'order', actorId: 'admin', method: 'courier',
      courierName: 'Fictional Courier', trackingReference: 'TEST-TRACK', now: 100,
      requestId: 'delivery-assignment-one',
      form: { requestId: 'delivery-assignment-one', versionId: 'staff.delivery-assignment-v1',
        answers: { formId: 'staff.delivery-assignment', version: 1, answers: [] },
        digest: 'exact-delivery-assignment' } });
    const row = sqlite.prepare(`SELECT subject_type AS type,subject_id AS id,actor_id AS actor
      FROM form_answer_sets WHERE form_id='staff.delivery-assignment'`).get() as Record<string, unknown> | undefined;
    assert.deepEqual(row && { ...row }, { type: 'order', id: 'order', actor: 'admin' });
  } finally { sqlite.close(); }
});

void test('only successful parcel-code verification records a code-free answer', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only'");
    const challenge = await issueRiderOtp(db, { jobId: 'job', customerId: 'customer', now: 100 });
    const form = { requestId: 'verification-one', versionId: 'rider.code-verify-v1',
      answers: { formId: 'rider.code-verify', version: 1, answers: [] } };
    assert.equal(await verifyRiderOtp(db, { jobId: 'job', riderId: 'rider', version: 0,
      code: challenge.code === '000000' ? '111111' : '000000', now: 101, form }), false);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
    assert.equal(await verifyRiderOtp(db, { jobId: 'job', riderId: 'rider', version: 0,
      code: challenge.code, now: 102, form }), true);
    const answer = sqlite.prepare(`SELECT subject_type AS type,subject_id AS id,actor_id AS actor,answers_json AS json
      FROM form_answer_sets WHERE form_id='rider.code-verify'`).get() as Record<string, unknown> | undefined;
    assert.equal(answer?.type, 'rider_event');
    assert.equal(answer?.id, form.requestId);
    assert.equal(answer?.actor, 'rider');
    assert.doesNotMatch(JSON.stringify(answer), new RegExp(challenge.code));
  } finally { sqlite.close(); }
});

async function renderForm(entry: string, exported: string, props: Record<string, unknown>) {
  const compiled = await build({ entryPoints: [entry], bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [{ name: 'rider-form-test-boundaries', setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'rider-test' }));
      b.onLoad({ filter: /^navigation$/, namespace: 'rider-test' }, () => ({ contents: 'exports.useRouter=()=>({refresh(){}});', loader: 'js' }));
      b.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'rider-test' }));
      b.onLoad({ filter: /^config$/, namespace: 'rider-test' }, () => ({ contents: `exports.usePublishedFormConfig=(id)=>({config:{formId:id,version:3,publishedAt:1,fields:[{id:'handover_context',key:'handover_context',type:'short_text',label:'Handover context',required:true,order:0,status:'active'}]},status:'ready',canSubmit:true,message:'',refresh(){},handleSubmissionResponse(){return true}});`, loader: 'js' }));
    } }],
  });
  const module = { exports: {} as Record<string, ComponentType<Record<string, unknown>>> };
  runInNewContext(compiled.outputFiles[0].text, { require: createRequire(import.meta.url), module,
    exports: module.exports, process, crypto });
  return renderToStaticMarkup(createElement(module.exports[exported], props));
}

void test('all five independent rider and delivery forms render their published field and version', async () => {
  const sites = [
    ['components/rider/rider-forms.tsx', 'RiderApplicationForm', 'rider.application', {}],
    ['components/rider/rider-forms.tsx', 'RiderReportForm', 'rider.report',
      { jobId: 'job', version: 0, remaining: 0, openBoxRequired: false }],
    ['components/rider/rider-forms.tsx', 'RiderRemittanceForm', 'rider.remittance',
      { jobId: 'job', orderNumber: 'HB-TEST', outstandingPaisa: 5000 }],
    ['components/rider/rider-code.tsx', 'RiderCodeVerification', 'rider.code-verify',
      { jobId: 'job', version: 0 }],
    ['components/delivery/delivery-assignment.tsx', 'DeliveryAssignment', 'staff.delivery-assignment',
      { orderId: 'order', current: null }],
  ] as const;
  for (const [entry, exported, id, props] of sites) {
    const html = await renderForm(entry, exported, props);
    assert.match(html, new RegExp(`data-form-id="${id.replaceAll('.', '\\.')}"`), id);
    assert.match(html, /name="formVersion" value="3"/, id);
    assert.match(html, /name="custom\.handover_context"/, id);
  }
});

void test('shipping console renders distinct seller request, seller action and staff action forms', async () => {
  const job = { id: 'job', orderNumber: 'HB-TEST', sellerName: 'Fictional Seller',
    direction: 'outbound', status: 'pickup_requested', trackingCode: null,
    labelReference: null, reconciliationStatus: 'unreconciled' };
  const seller = await renderForm('components/shipping-console.tsx', 'ShippingConsole',
    { jobs: [job], orders: [{ id: 'order', orderNumber: 'HB-TEST' }], admin: false });
  assert.match(seller, /data-form-id="shipping\.console-request"/);
  assert.match(seller, /data-form-id="shipping\.console-action-seller"/);
  assert.match(seller, /name="formVersion" value="3"/);
  assert.match(seller, /name="custom\.handover_context"/);
  const staff = await renderForm('components/shipping-console.tsx', 'ShippingConsole',
    { jobs: [job], admin: true });
  assert.match(staff, /data-form-id="shipping\.console-action-staff"/);
  assert.doesNotMatch(staff, /data-form-id="shipping\.console-request"/);
});

void test('rider application route rejects a missing published version before private upload', async () => {
  const { sqlite } = fixture();
  try {
    sqlite.exec("DELETE FROM rider_profiles WHERE user_id='rider'");
    const image = await sharp({ create: { width: 8, height: 8, channels: 3,
      background: '#347856' } }).png().toBuffer();
    const form = new FormData();
    for (const [key, value] of Object.entries({ legalName: 'Fictional Rider', phone: '9800000000',
      district: 'Kathmandu', identityType: 'citizenship', identityNumber: 'TEST-ONLY-1',
      requestId: 'route-application-one' })) form.set(key, value);
    form.set('identityPhoto', new File([image as BlobPart], 'identity.png', { type: 'image/png' }));
    const { POST } = await import('../app/api/rider/application/route');
    const response = await POST(new Request('http://localhost:3000/api/rider/application', {
      method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form,
    }));
    assert.equal(response.status, 409);
    assert.deepEqual(globalThis.riderCatalogMedia.stored, []);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM rider_applications').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('rider remittance route rejects an unversioned cash request without an answer or cash record', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/rider/remittances/route');
    const response = await POST(new Request('http://localhost:3000/api/rider/remittances', {
      method: 'POST', headers: { origin: 'http://localhost:3000',
        'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'job', requestId: 'remittance-route-one',
        amountPaisa: 1000, reference: 'TEST-RECEIPT' }),
    }));
    assert.equal(response.status, 409);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM parcel_cash_records').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('rider report route rejects an unversioned attempt without creating proof history', async () => {
  const { sqlite } = fixture();
  try {
    const form = new FormData();
    for (const [key, value] of Object.entries({ jobId: 'job', version: '0',
      kind: 'customer_unavailable', note: 'Customer was unavailable at the agreed place.',
      cashPaisa: '0', requestId: 'route-report-one', openBoxOutcome: 'not_applicable' }))
      form.set(key, value);
    const { POST } = await import('../app/api/rider/reports/route');
    const response = await POST(new Request('http://localhost:3000/api/rider/reports', {
      method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form,
    }));
    assert.equal(response.status, 409);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM rider_reports').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('rider code route rejects an unversioned valid code without consuming it', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only'");
    const challenge = await issueRiderOtp(db, { jobId: 'job', customerId: 'customer', now: Date.now() });
    const { POST } = await import('../app/api/rider/verify-code/route');
    const response = await POST(new Request('http://localhost:3000/api/rider/verify-code', {
      method: 'POST', headers: { origin: 'http://localhost:3000',
        'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'job', version: 0, code: challenge.code,
        requestId: 'verify-route-one' }),
    }));
    assert.equal(response.status, 409);
    assert.equal(sqlite.prepare('SELECT consumed_at FROM rider_otp_challenges').get()?.consumed_at, null);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('staff delivery route rejects an unversioned assignment before changing the order', async () => {
  const { sqlite } = fixture();
  try {
    sqlite.exec("DELETE FROM shipping_parcels; INSERT INTO shipments VALUES ('order',NULL)");
    const { POST } = await import('../app/api/admin/orders/[id]/delivery/route');
    const response = await POST(new Request('http://localhost:3000/api/admin/orders/order/delivery', {
      method: 'POST', headers: { origin: 'http://localhost:3000',
        'content-type': 'application/json' },
      body: JSON.stringify({ method: 'courier', courierName: 'Fictional Courier',
        trackingReference: 'TEST-TRACK', requestId: 'delivery-route-one' }),
    }), { params: Promise.resolve({ id: 'order' }) });
    assert.equal(response.status, 409);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM delivery_assignments').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('rider application route stores one answer and avoids another private upload on exact retry', async () => {
  const { sqlite } = fixture();
  try {
    sqlite.exec("DELETE FROM rider_profiles WHERE user_id='rider'");
    const image = await sharp({ create: { width: 8, height: 8, channels: 3,
      background: '#347856' } }).png().toBuffer();
    const makeForm = (name = 'Fictional Rider') => {
      const form = new FormData();
      for (const [key, value] of Object.entries({ legalName: name, phone: '9800000000',
        district: 'Kathmandu', identityType: 'citizenship', identityNumber: 'TEST-ONLY-1',
        requestId: 'route-application-replay', formVersion: '1' })) form.set(key, value);
      form.set('identityPhoto', new File([image as BlobPart], 'identity.png', { type: 'image/png' }));
      return form;
    };
    const { POST } = await import('../app/api/rider/application/route');
    const send = (form: FormData) => POST(new Request('http://localhost:3000/api/rider/application', {
      method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form,
    }));
    const first = await send(makeForm());
    assert.equal(first.status, 201, first.status === 201 ? '' : await first.text());
    const id = (await first.json() as { id: string }).id;
    const retry = await send(makeForm());
    assert.equal(retry.status, 201);
    assert.equal((await retry.json() as { id: string }).id, id);
    assert.equal(globalThis.riderCatalogMedia.stored.length, 1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='rider.application'").get() as { count: number }).count, 1);
    publishNextVersion(sqlite, 'rider.application');
    assert.equal((await send(makeForm())).status, 201, 'an exact retry must retain its original published version');
    assert.equal(globalThis.riderCatalogMedia.stored.length, 1);
    assert.equal((await send(makeForm('Changed Rider'))).status, 409);
  } finally { sqlite.close(); }
});

void test('rider report route links one answer and rejects a changed retry', async () => {
  const { sqlite } = fixture();
  try {
    const makeForm = (note = 'Customer was unavailable at the agreed place.') => {
      const form = new FormData();
      for (const [key, value] of Object.entries({ jobId: 'job', version: '0',
        kind: 'customer_unavailable', note, cashPaisa: '0', requestId: 'route-report-retry',
        openBoxOutcome: 'not_applicable', formVersion: '1' })) form.set(key, value);
      return form;
    };
    const { POST } = await import('../app/api/rider/reports/route');
    const send = (form: FormData) => POST(new Request('http://localhost:3000/api/rider/reports', {
      method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form,
    }));
    const first = await send(makeForm());
    assert.equal(first.status, 201, first.status === 201 ? '' : await first.text());
    const id = (await first.json() as { id: string }).id;
    const retry = await send(makeForm());
    assert.equal(retry.status, 201);
    assert.equal((await retry.json() as { id: string }).id, id);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='rider.report'").get() as { count: number }).count, 1);
    assert.equal((await send(makeForm('A changed customer absence note.'))).status, 409);
  } finally { sqlite.close(); }
});

void test('rider remittance route links one answer and keeps the cash amount immutable on retry', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/rider/remittances/route');
    const send = (amountPaisa: number) => POST(new Request('http://localhost:3000/api/rider/remittances', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'job', requestId: 'route-remittance-retry',
        amountPaisa, reference: 'TEST-RECEIPT', formVersion: 1, customAnswers: [] }),
    }));
    const first = await send(1000);
    assert.equal(first.status, 201, first.status === 201 ? '' : await first.text());
    assert.equal((await send(1000)).status, 201);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM parcel_cash_records WHERE kind='remittance'").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='rider.remittance'").get() as { count: number }).count, 1);
    assert.equal((await send(2000)).status, 409);
  } finally { sqlite.close(); }
});

void test('valid code route consumes the challenge with exactly one code-free answer', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only'");
    const challenge = await issueRiderOtp(db, { jobId: 'job', customerId: 'customer', now: Date.now() });
    const { POST } = await import('../app/api/rider/verify-code/route');
    const send = (code: string) => POST(new Request('http://localhost:3000/api/rider/verify-code', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'job', version: 0, code, requestId: 'verify-route-success',
        formVersion: 1, customAnswers: [] }),
    }));
    assert.equal((await send(challenge.code === '000000' ? '111111' : '000000')).status, 409);
    assert.equal((await send(challenge.code)).status, 200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='rider.code-verify'").get() as { count: number }).count, 1);
    assert.doesNotMatch(JSON.stringify(sqlite.prepare("SELECT * FROM form_answer_sets WHERE form_id='rider.code-verify'").get()), new RegExp(challenge.code));
  } finally { sqlite.close(); }
});

void test('lost successful code response replays only its exact actor, job, assignment, code and archived answer', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only'");
    const challenge = await issueRiderOtp(db, { jobId: 'job', customerId: 'customer', now: Date.now() });
    const field = { id: 'handover_context', key: 'handover_context', type: 'short_text',
      label: 'Handover context', required: false, order: 0, status: 'active' };
    publishConfiguredVersion(sqlite, 'rider.code-verify', 2, [field]);
    const { POST } = await import('../app/api/rider/verify-code/route');
    const payload = { jobId: 'job', version: 0, code: challenge.code,
      requestId: 'verified-lost-response', formVersion: 2,
      customAnswers: [{ fieldId: field.id, value: 'Handed to named recipient.' }] };
    const send = (body: unknown) => POST(new Request('http://localhost:3000/api/rider/verify-code', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    assert.equal((await send(payload)).status, 200);
    publishConfiguredVersion(sqlite, 'rider.code-verify', 3, []);
    assert.equal((await send(payload)).status, 200, 'archived exact retry must recover lost 200');
    for (const changed of [
      { ...payload, code: challenge.code === '000000' ? '111111' : '000000' },
      { ...payload, jobId: 'other-job' },
      { ...payload, version: 1 },
      { ...payload, customAnswers: [{ fieldId: field.id, value: 'Different recipient.' }] },
    ]) assert.equal((await send(changed)).status, 409);
    sqlite.exec("INSERT INTO users VALUES ('other-rider','other-rider','active'); INSERT INTO rider_profiles(user_id,status,application_id,updated_at) VALUES ('other-rider','approved','other-app',1)");
    globalThis.riderCatalogCustomerId = 'other-rider';
    assert.equal((await send(payload)).status, 409);
    globalThis.riderCatalogCustomerId = 'rider';
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM rider_events WHERE action='otp_verified'").get() as { count: number }).count, 1);
    sqlite.exec("UPDATE rider_profiles SET status='suspended' WHERE user_id='rider'");
    assert.equal((await send(payload)).status, 403, 'a revoked rider may not recover prior result');
  } finally { sqlite.close(); }
});

void test('one consumed job cannot authorize replay of another job verification request', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only'");
    sqlite.exec(`INSERT INTO orders VALUES ('order-b','HB-TEST-B','prepaid','customer',
      'receipt-b','dispatched','customer@example.test',NULL);
      INSERT INTO shipping_jobs VALUES ('job-b','order-b','dispatched');
      INSERT INTO shipping_parcels VALUES ('job-b','rider',0,'own_rider',0,0,NULL,0);`);
    const codeA = (await issueRiderOtp(db, { jobId: 'job', customerId: 'customer', now: Date.now() })).code;
    const codeB = (await issueRiderOtp(db, { jobId: 'job-b', customerId: 'customer', now: Date.now() })).code;
    const { POST } = await import('../app/api/rider/verify-code/route');
    const send = (jobId: string, code: string, requestId: string) => POST(new Request(
      'http://localhost:3000/api/rider/verify-code', {
        method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ jobId, version: 0, code, requestId,
          formVersion: 1, customAnswers: [] }),
      }));
    assert.equal((await send('job', codeA, 'verify-job-a')).status, 200);
    assert.equal((await send('job-b', codeB, 'verify-job-b')).status, 200);
    const noteA = sqlite.prepare("SELECT note FROM rider_events WHERE id='verify-job-a'")
      .get() as { note: string };
    assert.deepEqual(JSON.parse(noteA.note), {
      message: 'Parcel delivery code verification recorded; no delivery or cash transition.',
      shippingJobId: 'job', assignmentVersion: 0,
    });
    assert.doesNotMatch(noteA.note, new RegExp(codeA));
    assert.equal((await send('job-b', codeB, 'verify-job-a')).status, 409,
      'a valid consumed code for job B cannot replay job A’s request reference');
    assert.equal((await send('job', codeA, 'verify-job-a')).status, 200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM rider_events WHERE action='otp_verified'").get() as { count: number }).count, 2);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='rider.code-verify'").get() as { count: number }).count, 2);
  } finally { sqlite.close(); }
});

void test('submitted parcel code cannot be copied into configured text, choice or six-digit number answers', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only'");
    await issueRiderOtp(db, { jobId: 'job', customerId: 'customer', now: Date.now() });
    const code = '654321';
    sqlite.prepare('UPDATE rider_otp_challenges SET code_hash=? WHERE shipping_job_id=?')
      .run(`fixture-salt:${createHash('sha256').update(`fixture-salt\n${code}`).digest('hex')}`, 'job');
    for (const [fieldId, type, value] of [
      ['context', 'short_text', `Receipt code ${code} was shown`],
      ['selection', 'single_choice', code],
      ['delivery_count', 'number', Number(code)],
    ] as const) {
      const answer = { formId: 'rider.code-verify', version: 1, answers: [
        { fieldId, label: fieldId, type, value },
      ] } as Parameters<typeof assertNoIdentitySecrets>[0];
      assert.throws(() => assertNoIdentitySecrets(answer, [code], undefined,
        { rejectNumericSecrets: true }), /secret|code/i);
    }
    const safe = { formId: 'rider.code-verify', version: 1, answers: [
      { fieldId: 'count', label: 'Count', type: 'number', value: 1 },
      { fieldId: 'checked', label: 'Checked', type: 'checkbox', value: true },
    ] } as Parameters<typeof assertNoIdentitySecrets>[0];
    assert.doesNotThrow(() => assertNoIdentitySecrets(safe, [code], undefined,
      { rejectNumericSecrets: true }));
    for (const [leadingZeroCode, numericAnswer] of [['000123', 123], ['000000', 0]] as const) {
      const copied = { formId: 'rider.code-verify', version: 1, answers: [
        { fieldId: 'delivery_count', label: 'Delivery count', type: 'number', value: numericAnswer },
      ] } as Parameters<typeof assertNoIdentitySecrets>[0];
      assert.throws(() => assertNoIdentitySecrets(copied, [leadingZeroCode], undefined,
        { rejectNumericSecrets: true }), /secret|code/i);
    }
    const field = { id: 'context', key: 'context', type: 'short_text', label: 'Context',
      required: false, order: 0, status: 'active' };
    const selection = { id: 'selection', key: 'selection', type: 'single_choice',
      label: 'Selection', required: false, order: 1, status: 'active',
      choices: [{ value: code, label: 'First option' }, { value: 'other', label: 'Other option' }] };
    const count = { id: 'delivery_count', key: 'delivery_count', type: 'number',
      label: 'Delivery count', required: false, order: 2, status: 'active' };
    publishConfiguredVersion(sqlite, 'rider.code-verify', 2, [field, selection, count]);
    const { POST } = await import('../app/api/rider/verify-code/route');
    const send = (fieldId: string, value: unknown, requestId: string) => POST(new Request('http://localhost:3000/api/rider/verify-code', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'job', version: 0, code,
        requestId, formVersion: 2, customAnswers: [{ fieldId, value }] }),
    }));
    for (const [fieldId, value] of [['context', `Code ${code} accepted`],
      ['selection', code], ['delivery_count', Number(code)]] as const)
      assert.equal((await send(fieldId, value, `verify-secret-${fieldId}`)).status, 400);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
    assert.equal(sqlite.prepare('SELECT consumed_at FROM rider_otp_challenges').get()?.consumed_at, null);
    assert.equal((await send('delivery_count', 1, 'verify-safe-count')).status, 200);
  } finally { sqlite.close(); }
});

void test('staff delivery route accepts exact retry and rejects changed assignment details', async () => {
  const { sqlite } = fixture();
  try {
    sqlite.exec("DELETE FROM shipping_parcels; INSERT INTO shipments VALUES ('order',NULL)");
    const { POST } = await import('../app/api/admin/orders/[id]/delivery/route');
    const send = (reference: string) => POST(new Request('http://localhost:3000/api/admin/orders/order/delivery', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'courier', courierName: 'Fictional Courier',
        trackingReference: reference, requestId: 'delivery-route-retry', formVersion: 1,
        customAnswers: [] }),
    }), { params: Promise.resolve({ id: 'order' }) });
    assert.equal((await send('TEST-TRACK')).status, 200);
    assert.equal((await send('TEST-TRACK')).status, 200);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.delivery-assignment'").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='delivery.assigned'").get() as { count: number }).count, 1);
    assert.equal((await send('CHANGED-TRACK')).status, 409);
    assert.equal(sqlite.prepare('SELECT tracking_reference FROM delivery_assignments').get()?.tracking_reference, 'TEST-TRACK');
  } finally { sqlite.close(); }
});

void test('delivery assignment rolls back the assignment and answer if its configured audit fails', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("DELETE FROM shipping_parcels; INSERT INTO shipments VALUES ('order',NULL)");
    sqlite.exec("CREATE TRIGGER reject_configured_delivery BEFORE INSERT ON audit_logs WHEN NEW.action='delivery.assigned.configured' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
    await assert.rejects(assignDelivery(db, { orderId: 'order', actorId: 'admin', method: 'courier',
      courierName: 'Fictional Courier', trackingReference: 'TEST-TRACK', now: 100,
      requestId: 'delivery-rollback', form: { requestId: 'delivery-rollback',
        versionId: 'staff.delivery-assignment-v1', digest: 'delivery-rollback-digest',
        answers: { formId: 'staff.delivery-assignment', version: 1, answers: [] } } }));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM delivery_assignments').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('delivered report exact retry keeps its original private proof object', async () => {
  const { sqlite } = fixture();
  try {
    const image = await sharp({ create: { width: 8, height: 8, channels: 3,
      background: '#347856' } }).png().toBuffer();
    const makeForm = () => {
      const form = new FormData();
      for (const [key, value] of Object.entries({ jobId: 'job', version: '0', kind: 'delivered',
        note: 'The parcel was handed to the recipient.', cashPaisa: '0',
        requestId: 'delivered-proof-retry', openBoxOutcome: 'not_applicable', formVersion: '1' }))
        form.set(key, value);
      form.set('photo', new File([image as BlobPart], 'proof.png', { type: 'image/png' }));
      return form;
    };
    const { POST } = await import('../app/api/rider/reports/route');
    const send = () => POST(new Request('http://localhost:3000/api/rider/reports', {
      method: 'POST', headers: { origin: 'http://localhost:3000' }, body: makeForm(),
    }));
    const first = await send();
    assert.equal(first.status, 201, first.status === 201 ? '' : await first.text());
    const id = (await first.json() as { id: string }).id;
    const retry = await send();
    assert.equal(retry.status, 201);
    assert.equal((await retry.json() as { id: string }).id, id);
    assert.equal(globalThis.riderCatalogMedia.stored.length, 1);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM rider_reports').get() as { count: number }).count, 1);
    publishNextVersion(sqlite, 'rider.report');
    assert.equal((await send()).status, 201, 'an exact retry must retain its original published version');
    assert.equal(globalThis.riderCatalogMedia.stored.length, 1);
  } finally { sqlite.close(); }
});

void test('application audit failure rolls back its answer and cleans its uploaded identity', async () => {
  const { sqlite } = fixture();
  try {
    sqlite.exec("DELETE FROM rider_profiles WHERE user_id='rider'");
    sqlite.exec("CREATE TRIGGER reject_application_audit BEFORE INSERT ON audit_logs WHEN NEW.action='rider.application.submitted' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
    const image = await sharp({ create: { width: 8, height: 8, channels: 3,
      background: '#347856' } }).png().toBuffer();
    const form = new FormData();
    for (const [key, value] of Object.entries({ legalName: 'Fictional Rider', phone: '9800000000',
      district: 'Kathmandu', identityType: 'citizenship', identityNumber: 'TEST-ONLY-1',
      requestId: 'application-rollback', formVersion: '1' })) form.set(key, value);
    form.set('identityPhoto', new File([image as BlobPart], 'identity.png', { type: 'image/png' }));
    const { POST } = await import('../app/api/rider/application/route');
    const response = await POST(new Request('http://localhost:3000/api/rider/application', {
      method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form,
    }));
    assert.notEqual(response.status, 201);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM rider_applications').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
    assert.equal(globalThis.riderCatalogMedia.stored.length, 1);
    assert.deepEqual(globalThis.riderCatalogMedia.deleted, globalThis.riderCatalogMedia.stored);
  } finally { sqlite.close(); }
});

void test('successful code with answer storage failure remains unconsumed and reports retryable failure', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only'");
    const challenge = await issueRiderOtp(db, { jobId: 'job', customerId: 'customer', now: Date.now() });
    sqlite.exec("CREATE TRIGGER reject_code_answer BEFORE INSERT ON form_answer_sets WHEN NEW.form_id='rider.code-verify' BEGIN SELECT RAISE(ABORT,'test storage failure'); END");
    const { POST } = await import('../app/api/rider/verify-code/route');
    const response = await POST(new Request('http://localhost:3000/api/rider/verify-code', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'job', version: 0, code: challenge.code,
        requestId: 'verify-storage-failure', formVersion: 1, customAnswers: [] }),
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code?: string }).code, 'storage_unavailable');
    assert.equal(sqlite.prepare('SELECT consumed_at FROM rider_otp_challenges').get()?.consumed_at, null);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM rider_events').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('delivery exact replay requires its actor, order, payload, and cleans transaction guards', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("DELETE FROM shipping_parcels; INSERT INTO shipments VALUES ('order',NULL);");
    sqlite.exec("INSERT INTO users VALUES ('admin2','admin2','active'); INSERT INTO user_roles VALUES ('admin2','admin');");
    sqlite.exec("INSERT INTO orders VALUES ('order2','HB-TEST-2','prepaid','customer','receipt-2','dispatched','customer@example.test',NULL); INSERT INTO shipments VALUES ('order2',NULL);");
    const input = { orderId: 'order', actorId: 'admin', method: 'courier',
      courierName: 'Fictional Courier', trackingReference: 'TEST-TRACK', now: 100,
      requestId: 'delivery-domain-replay', form: { requestId: 'delivery-domain-replay',
        versionId: 'staff.delivery-assignment-v1', digest: 'exact-delivery-domain',
        answers: { formId: 'staff.delivery-assignment', version: 1, answers: [] } } };
    await assignDelivery(db, input);
    await assignDelivery(db, input);
    await assert.rejects(assignDelivery(db, { ...input, actorId: 'admin2' }), DeliveryError);
    await assert.rejects(assignDelivery(db, { ...input, orderId: 'order2' }), DeliveryError);
    await assert.rejects(assignDelivery(db, { ...input, form: { ...input.form,
      digest: 'changed-delivery-domain' } }), DeliveryError);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM operation_transaction_guards').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='delivery.assigned'").get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('delivery assignment revocation at batch boundary leaves no assignment, audit, or answer', async () => {
  const { sqlite, db, control } = fixture();
  try {
    sqlite.exec("DELETE FROM shipping_parcels; INSERT INTO shipments VALUES ('order',NULL)");
    control.beforeBatch = () => sqlite.exec("UPDATE users SET status='disabled' WHERE id='admin'");
    await assert.rejects(assignDelivery(db, { orderId: 'order', actorId: 'admin', method: 'courier',
      courierName: 'Fictional Courier', trackingReference: 'TEST-TRACK', now: 100,
      requestId: 'delivery-revoked-authority', form: { requestId: 'delivery-revoked-authority',
        versionId: 'staff.delivery-assignment-v1', digest: 'delivery-revoked',
        answers: { formId: 'staff.delivery-assignment', version: 1, answers: [] } } }));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM delivery_assignments').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action LIKE 'delivery.%'").get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('delivery request collision at batch boundary rolls back this assignment and answer', async () => {
  const { sqlite, db, control } = fixture();
  try {
    sqlite.exec("DELETE FROM shipping_parcels; INSERT INTO shipments VALUES ('order',NULL)");
    control.beforeBatch = () => sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,
      subject_id,reason,next_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run('racing-audit', 'admin2', 'delivery.assigned.configured', 'order', 'order',
        'Concurrent request', JSON.stringify({ catalogDigest: 'other-payload' }),
        'delivery.assignment:delivery-racing-request', 99);
    await assert.rejects(assignDelivery(db, { orderId: 'order', actorId: 'admin', method: 'courier',
      courierName: 'Fictional Courier', trackingReference: 'TEST-TRACK', now: 100,
      requestId: 'delivery-racing-request', form: { requestId: 'delivery-racing-request',
        versionId: 'staff.delivery-assignment-v1', digest: 'our-payload',
        answers: { formId: 'staff.delivery-assignment', version: 1, answers: [] } } }));
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM delivery_assignments').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets').get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='delivery.assigned'").get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM operation_transaction_guards').get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('distinct seller and staff shipping console actions each link one exact event answer', async () => {
  const { sqlite, db } = shippingFixture();
  try {
    const { POST: requestJob } = await import('../app/api/seller/shipping/route');
    const { POST: sellerAct } = await import('../app/api/seller/shipping/[id]/route');
    const { POST: staffAct } = await import('../app/api/admin/shipping/[id]/route');
    const request = (path: string, body: unknown) => new Request(`http://localhost:3000${path}`, {
      method: 'POST', headers: { origin: 'http://localhost:3000',
        'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const create = { orderId: 'order', direction: 'outbound', note: 'Pickup from studio desk.',
      requestId: 'console-request-one', sourceFormId: 'shipping.console-request',
      formVersion: 1, customAnswers: [] };
    const first = await requestJob(request('/api/seller/shipping', create));
    assert.equal(first.status, 201, JSON.stringify(await first.json()));
    const jobId = (sqlite.prepare("SELECT id FROM shipping_jobs WHERE created_request_id='console-request-one'").get() as { id: string }).id;
    assert.equal((await requestJob(request('/api/seller/shipping', create))).status, 201);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='shipping.console-request'").get() as { count: number }).count, 1);
    const changedRequest = await requestJob(request('/api/seller/shipping', { ...create,
      note: 'A different pickup detail.' }));
    assert.equal(changedRequest.status, 409);
    assert.equal((await changedRequest.json() as { code?: string }).code, 'request_id_conflict');
    await operateShippingJob(db, { jobId, actorId: 'admin', actorRole: 'admin',
      action: 'schedule_pickup', note: 'Carrier pickup window confirmed.',
      requestId: 'setup-console-schedule', now: 10 });
    const pickup = { action: 'picked_up', note: 'Carrier collected the parcel.',
      requestId: 'console-pickup-one', sourceFormId: 'shipping.console-action-seller',
      formVersion: 1, customAnswers: [] };
    const sendSeller = (body: unknown) => sellerAct(request(`/api/seller/shipping/${jobId}`, body),
      { params: Promise.resolve({ id: jobId }) });
    assert.equal((await sendSeller(pickup)).status, 200);
    assert.equal((await sendSeller(pickup)).status, 200);
    const changedPickup = await sendSeller({ ...pickup, note: 'Changed pickup detail.' });
    assert.equal(changedPickup.status, 409);
    assert.equal((await changedPickup.json() as { code?: string }).code, 'request_id_conflict');
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='shipping.console-action-seller'").get() as { count: number }).count, 1);
    globalThis.riderCatalogSellerActor = { sellerId: 'seller-two', userId: 'other-seller' };
    assert.equal((await sendSeller(pickup)).status, 409);
    globalThis.riderCatalogSellerActor = { sellerId: 'seller-one', userId: 'seller-user' };
    const transit = { action: 'in_transit', note: 'Carrier scan confirmed transit.',
      requestId: 'console-staff-one', formVersion: 1, customAnswers: [] };
    const sendStaff = (body: unknown) => staffAct(request(`/api/admin/shipping/${jobId}`, body),
      { params: Promise.resolve({ id: jobId }) });
    assert.equal((await sendStaff({ ...transit, formVersion: undefined })).status, 409);
    assert.equal((await sendStaff(transit)).status, 200);
    assert.equal((await sendStaff(transit)).status, 200);
    const changedTransit = await sendStaff({ ...transit, note: 'Different carrier scan.' });
    assert.equal(changedTransit.status, 409);
    assert.equal((await changedTransit.json() as { code?: string }).code, 'request_id_conflict');
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='shipping.console-action-staff'").get() as { count: number }).count, 1);
    const staffEvent = sqlite.prepare("SELECT id FROM shipping_job_events WHERE request_id='console-staff-one'").get() as { id: string };
    const answers = await listFormAnswersForSubject(db, 'shipping_job_event', staffEvent.id);
    assert.equal(answers.length, 1);
    assert.equal(answers[0].actorId, 'admin');
    assert.equal(await authorizeFormAnswerRead(db, { id: 'seller-user', role: 'seller' }, answers[0]), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin', role: 'admin' }, answers[0]), true);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin', role: 'admin' },
      { ...answers[0], subjectId: 'nonexistent-event' }), false);
    const { default: SellerHistory } = await import('../app/seller/form-history/page');
    const requestHistory = renderToStaticMarkup(await SellerHistory({ searchParams: Promise.resolve({
      kind: 'console-request', id: jobId,
    }) }));
    assert.match(requestHistory, /Submitted answers/);
    const pickupEvent = sqlite.prepare("SELECT id FROM shipping_job_events WHERE request_id='console-pickup-one'").get() as { id: string };
    const actionHistory = renderToStaticMarkup(await SellerHistory({ searchParams: Promise.resolve({
      kind: 'console-action', id: pickupEvent.id,
    }) }));
    assert.match(actionHistory, /Submitted answers/);
  } finally { sqlite.close(); }
});

void test('privacy export follows rider parents and excludes staff shipping answers from seller export', async () => {
  const { sqlite, db } = shippingFixture();
  try {
    const now = 1_800_000_000_000;
    sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES ('rider-user','rider@example.test','Rider','active',?,?)").run(now, now);
    sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('rider-user','customer',?)").run(now);
    sqlite.prepare(`INSERT INTO rider_applications(id,user_id,legal_name,phone,district,identity_type,
      identity_number,object_key,mime_type,created_at) VALUES ('app','rider-user','Fictional Rider',
      '9800000000','Kathmandu','citizenship','TEST-ONLY-1','private/test','image/png',?)`).run(now);
    const jobId = await createShippingJob(db, { orderId: 'order', sellerId: 'seller-one',
      actorId: 'seller-user', direction: 'outbound', note: 'Pickup from studio desk.',
      requestId: 'privacy-setup-job', now });
    sqlite.prepare(`INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,method,
      rider_user_id,created_at) VALUES (?,1000,'own_rider','rider-user',?)`).run(jobId, now);
    sqlite.prepare(`INSERT INTO rider_reports(id,shipping_job_id,rider_user_id,assignment_version,kind,
      note,created_at,request_id,policy_version) VALUES ('report',?,'rider-user',0,
      'customer_unavailable','Customer unavailable.',?,'privacy-report',0)`).run(jobId, now);
    sqlite.prepare(`INSERT INTO parcel_cash_records(id,shipping_job_id,kind,amount_paisa,
      evidence_reference,status,created_by,created_at,rider_user_id) VALUES ('cash',?,'remittance',
      100,'TEST-PRIVACY','pending','rider-user',?,'rider-user')`).run(jobId, now);
    sqlite.prepare(`INSERT INTO rider_events(id,user_id,actor_id,action,note,created_at)
      VALUES ('event','rider-user','rider-user','otp_verified','Verification recorded.',?)`).run(now);
    const subjects = [
      ['rider.application', 'rider_application', 'app'],
      ['rider.report', 'rider_report', 'report'],
      ['rider.remittance', 'parcel_cash_record', 'cash'],
      ['rider.code-verify', 'rider_event', 'event'],
    ] as const;
    for (const [formId, subjectType, subjectId] of subjects) {
      sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
        reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES (?, ?,1,1,'published',?,'Fixture','admin',1,'admin',1,'admin',1,?)`)
        .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [] }), `seed-${formId}`);
      await buildFormAnswerInsert(db, { formId, requestId: `privacy-${formId}`,
        versionId: `${formId}-v1`, subjectType, subjectId, actorId: 'rider-user', now,
        answers: { formId, version: 1, answers: [] } }).run();
    }
    const riderExport = await collectFormAnswersForPrivacy(db, 'rider-user');
    assert.deepEqual(new Set(riderExport.map((answer) => answer.formId)),
      new Set(subjects.map(([formId]) => formId)));
    for (const answer of riderExport) {
      assert.equal(await authorizeFormAnswerRead(db, { id: 'rider-user', role: 'customer' }, answer), true);
      assert.equal(await authorizeFormAnswerRead(db, { id: 'buyer', role: 'customer' }, answer), false);
    }
    assert.equal((await collectFormAnswersForPrivacy(db, 'buyer')).length, 0);

    sqlite.prepare(`INSERT INTO shipping_job_events(id,shipping_job_id,from_status,to_status,action,
      actor_id,actor_role,note,request_id,created_at) VALUES ('staff-event',?,NULL,'pickup_requested',
      'record_label','admin','admin','Label recorded.','privacy-staff-event',?)`).run(jobId, now);
    await buildFormAnswerInsert(db, { formId: 'shipping.console-action-staff',
      requestId: 'privacy-staff-answer', versionId: 'shipping.console-action-staff-v1',
      subjectType: 'shipping_job_event', subjectId: 'staff-event', actorId: 'admin', now,
      answers: { formId: 'shipping.console-action-staff', version: 1, answers: [] } }).run();
    assert.equal((await collectFormAnswersForPrivacy(db, 'seller-user')).some((answer) =>
      answer.formId === 'shipping.console-action-staff'), false);
  } finally { sqlite.close(); }
});

void test('rider and staff history page beyond fifty applications without revealing foreign records', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("INSERT INTO user_roles VALUES ('rider','customer'); INSERT INTO user_roles VALUES ('customer','customer'); INSERT INTO user_roles VALUES ('admin','super_admin');");
    for (let index = 1; index <= 52; index++) {
      sqlite.prepare(`INSERT INTO rider_applications(id,user_id,legal_name,phone,district,identity_type,
        identity_number,object_key,mime_type,created_at) VALUES (?,'rider','Fictional Rider',
        '9800000000','Kathmandu','citizenship','TEST-ONLY','private/test','image/png',?)`)
        .run(`app-${index}`, index);
      await buildFormAnswerInsert(db, { formId: 'rider.application', requestId: `history-${index}`,
        versionId: 'rider.application-v1', subjectType: 'rider_application',
        subjectId: `app-${index}`, actorId: 'rider', now: index,
        answers: { formId: 'rider.application', version: 1, answers: [] } }).run();
    }
    sqlite.prepare(`INSERT INTO rider_applications(id,user_id,legal_name,phone,district,identity_type,
      identity_number,object_key,mime_type,created_at) VALUES ('foreign-app','customer','Foreign',
      '9800000000','Kathmandu','citizenship','FOREIGN','private/foreign','image/png',100)`).run();
    await buildFormAnswerInsert(db, { formId: 'rider.application', requestId: 'foreign-history',
      versionId: 'rider.application-v1', subjectType: 'rider_application',
      subjectId: 'foreign-app', actorId: 'customer', now: 100,
      answers: { formId: 'rider.application', version: 1, answers: [] } }).run();
    const { default: RiderHistory } = await import('../app/rider/form-history/page');
    const list = renderToStaticMarkup(await RiderHistory({ searchParams: Promise.resolve({ kind: 'application' }) }));
    assert.match(list, /app-52/);
    assert.doesNotMatch(list, /app-1(?:\D|$)|foreign-app/);
    assert.match(list, /Next older records/);
    const older = renderToStaticMarkup(await RiderHistory({ searchParams: Promise.resolve({
      kind: 'application', beforeAt: '3', beforeId: 'app-3',
    }) }));
    assert.match(older, /app-1/);
    const detail = renderToStaticMarkup(await RiderHistory({ searchParams: Promise.resolve({
      kind: 'application', id: 'app-1',
    }) }));
    assert.match(detail, /Submitted answers/);
    await assert.rejects(RiderHistory({ searchParams: Promise.resolve({
      kind: 'application', id: 'foreign-app',
    }) }), /Not found/);

    const { default: StaffHistory } = await import('../app/admin/riders/form-history/page');
    globalThis.riderCatalogStaffRole = 'admin';
    await assert.rejects(StaffHistory({ searchParams: Promise.resolve({
      kind: 'application', id: 'app-1',
    }) }), /Not found/);
    globalThis.riderCatalogStaffRole = 'super_admin';
    const staffDetail = renderToStaticMarkup(await StaffHistory({ searchParams: Promise.resolve({
      kind: 'application', id: 'app-1',
    }) }));
    assert.match(staffDetail, /Submitted answers/);
  } finally { sqlite.close(); }
});

void test('staff shipping page discovers older console answers and opens their exact event', async () => {
  const { sqlite, db } = shippingFixture();
  try {
    const jobId = await createShippingJob(db, { orderId: 'order', sellerId: 'seller-one',
      actorId: 'seller-user', direction: 'outbound', note: 'Pickup from studio desk.',
      requestId: 'staff-history-job', now: 1 });
    for (let index = 1; index <= 52; index++) {
      sqlite.prepare(`INSERT INTO shipping_job_events(id,shipping_job_id,from_status,to_status,
        action,actor_id,actor_role,note,request_id,created_at) VALUES (?,?,'pickup_requested',
        'pickup_requested','reconcile','admin','admin','Recorded staff note.',?,?)`)
        .run(`staff-event-${index}`, jobId, `staff-history-${index}`, index);
      await buildFormAnswerInsert(db, { formId: 'shipping.console-action-staff',
        requestId: `staff-history-${index}`,
        versionId: 'shipping.console-action-staff-v1', subjectType: 'shipping_job_event',
        subjectId: `staff-event-${index}`, actorId: 'admin', now: index,
        answers: { formId: 'shipping.console-action-staff', version: 1, answers: [] } }).run();
    }
    const { default: AdminShipping } = await import('../app/admin/shipping/page');
    const list = renderToStaticMarkup(await AdminShipping({ searchParams: Promise.resolve({}) }));
    assert.match(list, /staff-event-52/);
    assert.doesNotMatch(list, /staff-event-1(?:\D|$)/);
    assert.match(list, /Next older records/);
    const older = renderToStaticMarkup(await AdminShipping({ searchParams: Promise.resolve({
      beforeAt: '3', beforeId: 'staff-event-3',
    }) }));
    assert.match(older, /staff-event-1/);
    const detail = renderToStaticMarkup(await AdminShipping({ searchParams: Promise.resolve({
      historyEvent: 'staff-event-1',
    }) }));
    assert.match(detail, /Submitted answers/);
  } finally { sqlite.close(); }
});

void test('mounted shipping console preserves lost action ID and requires confirmed reset after changed replay', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- The bundled browser supplies this type.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'shipping-console-mounted-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ShippingConsole } from './components/shipping-console';
      const job = {id:'job-one',orderNumber:'HB-TEST',sellerId:'seller-one',sellerName:'Seller',
        direction:'outbound',status:'requested',labelReference:null,trackingCode:null,
        pickupWindowStart:null,pickupWindowEnd:null,claimReference:null,
        reconciliationStatus:'pending',reconciliationNote:null,updatedAt:1};
      createRoot(document.getElementById('root')!).render(<ShippingConsole jobs={[job]} admin />);
    `, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'console-navigation-fixture', setup(bundler) {
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
      bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js',
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const attempts: { requestId: string; content: string }[] = [];
  let saved: { requestId: string; content: string } | null = null;
  let loseNext = true;
  const key = 'hastabazaar:profile-attempt:shipping.console-action-staff:job-one';
  const mount = async () => {
    await page.goto('https://shipping-console.test/admin');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => document.querySelector<HTMLButtonElement>(
      '[data-form-id="shipping.console-action-staff"] button[type="submit"], [data-form-id="shipping.console-action-staff"] button:not([type])')?.disabled === false);
  };
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Playwright's route type comes from the bundled runtime.
    await page.route('https://shipping-console.test/**', async (route: any) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ status: 200,
        contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname.startsWith('/api/forms/')) return route.fulfill({ status: 200,
        contentType: 'application/json', body: JSON.stringify({ config: {
          formId: decodeURIComponent(url.pathname.slice('/api/forms/'.length)),
          version: 1, publishedAt: 1, fields: [],
        } }) });
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      const attempt = { requestId: String(body.requestId),
        content: JSON.stringify(Object.fromEntries(Object.entries(body).filter(([name]) => name !== 'requestId'))) };
      attempts.push(attempt);
      if (loseNext) { saved = attempt; loseNext = false; return route.abort('failed'); }
      if (saved?.requestId === attempt.requestId && saved.content !== attempt.content)
        return route.fulfill({ status: 409, contentType: 'application/json',
          body: '{"code":"request_id_conflict","error":"Request reference belongs to different content."}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await mount();
    const form = page.locator('[data-form-id="shipping.console-action-staff"]');
    await form.locator('[name="note"]').fill('Fictional carrier action.');
    await form.getByRole('button', { name: 'Apply action' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('may already have succeeded'));
    const first = attempts[0].requestId;
    assert.equal(await page.evaluate((value: string) => sessionStorage.getItem(value), key), first);
    await mount();
    await form.locator('[name="note"]').fill('Fictional carrier action.');
    await form.getByRole('button', { name: 'Apply action' }).click();
    await page.waitForFunction((value: string) => sessionStorage.getItem(value) === null, key);
    assert.equal(attempts[1].requestId, first);

    saved = null; loseNext = true;
    await mount();
    await form.locator('[name="note"]').fill('Another fictional carrier action.');
    await form.getByRole('button', { name: 'Apply action' }).click();
    await page.waitForFunction((value: string) => sessionStorage.getItem(value) !== null, key);
    const original = attempts[2].requestId;
    await form.locator('[name="note"]').fill('Changed fictional carrier action.');
    await form.getByRole('button', { name: 'Apply action' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('different content'));
    assert.equal(attempts[3].requestId, original);
    const reset = page.getByRole('button', { name: 'Start a new shipping action attempt' });
    page.once('dialog', async (dialog: { message(): string; dismiss(): Promise<void> }) => {
      assert.match(dialog.message(), /duplicate/i); await dialog.dismiss();
    });
    await reset.click();
    assert.equal(await page.evaluate((value: string) => sessionStorage.getItem(value), key), original);
    page.once('dialog', async (dialog: { message(): string; accept(): Promise<void> }) => {
      assert.match(dialog.message(), /duplicate/i); await dialog.accept();
    });
    await reset.click();
    assert.equal(await page.evaluate((value: string) => sessionStorage.getItem(value), key), null);
    await form.getByRole('button', { name: 'Apply action' }).click();
    await page.waitForFunction((value: string) => sessionStorage.getItem(value) === null, key);
    assert.notEqual(attempts[4].requestId, original);
  } finally { await page.close(); await browser.close(); }
});
