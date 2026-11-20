import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { validateFormDraft } from '../lib/forms/validation';

type RouteCall = { kind: string; formId?: string; input?: unknown; access?: unknown };
declare global {
  var cancellationRouteDatabase: D1Database;
  var cancellationRouteCalls: RouteCall[];
  var cancellationRouteCustomer: { userId: string } | null;
  var cancellationRouteReviewStatus: string;
}
globalThis.cancellationRouteCalls = [];
globalThis.cancellationRouteCustomer = null;
globalThis.cancellationRouteReviewStatus = 'pending';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.cancellationRouteDatabase}}', shortCircuit: true };
  if (specifier === '@/lib/http/request-security') return { url: 'data:text/javascript,export function isTrustedMutationRequest(){return true}', shortCircuit: true };
  if (specifier === '@/lib/auth/customer') return { url: 'data:text/javascript,export class CustomerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function getCustomerUser(){return globalThis.cancellationRouteCustomer};export const requireExistingCustomerApi=getCustomerUser', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(){return {id:"admin-one"}}', shortCircuit: true };
  if (specifier === '@/lib/email/send-order-updates') return { url: 'data:text/javascript,export async function sendPendingOrderUpdates(){}', shortCircuit: true };
  if (specifier === '@/lib/db/repositories/fulfillment') return { url: 'data:text/javascript,export class FulfillmentConflictError extends Error{};export async function transitionAdminFulfillment(db,input){globalThis.cancellationRouteCalls.push({kind:"fulfillment",input})};export async function transitionCompanyPreparation(){throw Error("Cancellation must not prepare company items")}', shortCircuit: true };
  if (specifier === '@/lib/cart/session') return { url: 'data:text/javascript,export const RECEIPT_COOKIE="receipt";export function readCookie(){return "raw-receipt"};export async function hashOpaqueToken(){return "hashed-receipt"}', shortCircuit: true };
  if (specifier === '@/lib/cancellation/repository') return { url: `data:text/javascript,
    export class CancellationConflictError extends Error{}
    export async function cancellationOutcome(){return null}
    export async function continueCancellationSettlement(){throw Error("Continuation is covered by the native settlement fixture") }
    export async function cancellationChoices(){return [{id:'seller-one',eligible:true}]}
    export async function cancellationPreview(db,access,sellerIds){globalThis.cancellationRouteCalls.push({kind:'preview',access,input:sellerIds});return {fingerprint:'current-fingerprint',reviewRequired:false,walletRestored:0,discountRemoved:0,next:{delivery:0,total:1000},deliveryPricingPolicy:null,parcels:[]}}
    export async function cancelSelectedParcels(db,access,input){globalThis.cancellationRouteCalls.push({kind:'confirm',access,input});return {status:'cancelled',id:input.requestId}}
    export async function rejectCancellationReview(db,input){globalThis.cancellationRouteCalls.push({kind:'reject',input})}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
}
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY);
    INSERT INTO users VALUES('admin-one');
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,next_json TEXT,request_id TEXT,command_key TEXT,command_digest TEXT,command_result_json TEXT);
    CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT);
    CREATE TABLE order_cancellation_reviews(id TEXT PRIMARY KEY,order_id TEXT,seller_ids_json TEXT,status TEXT);
    INSERT INTO orders VALUES('order-1','ORDER-1');
    INSERT INTO order_cancellation_reviews VALUES('review-one','order-1','["seller-one"]','pending');`);
  for (const statement of readFileSync('drizzle/0056_form_catalog.sql','utf8').split('--> statement-breakpoint')) if(statement.trim()) sqlite.exec(statement);
  for (const formId of ['commerce.order-cancellation','staff.cancellation-review','staff.order-fulfillment']) {
    const config = validateFormDraft(formId, {formId, fields:[{id:'context_note',key:'context_note',label:'Context',type:'short_text',required:true,order:0,status:'active'}]});
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES(?,?,1,1,'published',?,'Fixture','admin-one',1,'admin-one',1,'admin-one',1,?)`).run(`${formId}:v1`,formId,JSON.stringify(config),`seed-${formId}`);
  }
  globalThis.cancellationRouteDatabase = {prepare: (sql:string) => new Statement(sqlite.prepare(sql))} as unknown as D1Database;
  globalThis.cancellationRouteCalls = [];
  return sqlite;
}

void test('customer cancellation route validates the configured envelope and keeps receipt authority hashed', async () => {
  const sqlite = fixture();
  const { POST } = await import('../app/orders/[orderNumber]/cancel/route');
  const send = (body: unknown) => POST(new Request('http://localhost:3000/orders/ORDER-1/cancel', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ orderNumber: 'ORDER-1' }) });
  globalThis.cancellationRouteCalls = [];
  const base = { action: 'confirm', sellerIds: ['seller-one'], fingerprint: 'current-fingerprint',
    requestId: 'customer-attempt', reason: 'Cancel this maker parcel.', formVersion: 1,
    customAnswers: [{ fieldId: 'context_note', value: 'Fictional context' }] };
  assert.equal((await send({ ...base, receiptToken: 'raw-receipt' })).status, 400);
  assert.equal((await send({...base,customAnswers:[]})).status,400);
  assert.equal((await send({...base,formVersion:0})).status,409);
  assert.equal(globalThis.cancellationRouteCalls.length,0);
  const success = await send(base);
  assert.equal(success.status, 200);
  const committed = globalThis.cancellationRouteCalls.find((call) => call.kind === 'confirm');
  assert.ok(committed);
  assert.equal((committed.input as {form:{answers:{formId:string}}}).form.answers.formId,'commerce.order-cancellation');
  assert.deepEqual(committed?.access, { orderNumber: 'ORDER-1', receiptTokenHash: 'hashed-receipt', customerId: null });
  assert.equal((committed.input as { form: { versionId: string } }).form.versionId,
    'commerce.order-cancellation:v1');
  assert.doesNotMatch(JSON.stringify(committed), /raw-receipt/);
  sqlite.close();
});

void test('staff cancellation route keeps approval and rejection request identity on the server', async () => {
  const sqlite = fixture();
  const { POST } = await import('../app/api/admin/cancellations/route');
  const send = (body: unknown) => POST(new Request('http://localhost:3000/api/admin/cancellations', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  globalThis.cancellationRouteCalls = [];
  const base = { reviewId: 'review-one', note: 'Production has been reviewed.',
    formVersion: 1, customAnswers: [{ fieldId: 'context_note', value: 'Fictional review context' }] };
  assert.equal((await send({ ...base, action: 'approve', fingerprint: 'current-fingerprint',
    requestId: 'client-override' })).status, 400);
  for(const action of ['approve','reject']) {
    assert.equal((await send({...base,action,fingerprint:'current-fingerprint',customAnswers:[]})).status,400);
    assert.equal((await send({...base,action,fingerprint:'current-fingerprint',formVersion:0})).status,409);
  }
  assert.equal(globalThis.cancellationRouteCalls.length,0);
  assert.equal((await send({ ...base, action: 'approve', fingerprint: 'current-fingerprint' })).status, 200);
  const confirmed = globalThis.cancellationRouteCalls.find((call) => call.kind === 'confirm');
  assert.ok(confirmed);
  assert.equal((confirmed.input as { requestId: string }).requestId,
    'review:review-one');
  assert.equal((await send({ ...base, action: 'reject' })).status, 200);
  const rejected = globalThis.cancellationRouteCalls.find((call) => call.kind === 'reject');
  assert.ok(rejected);
  assert.equal((rejected.input as { form: { requestId: string } }).form.requestId,
    'review-reject:review-one');
  assert.equal((confirmed.input as {form:{answers:{formId:string}}}).form.answers.formId,'staff.cancellation-review');
  sqlite.close();
});

void test('staff fulfillment cancellation bounds JSON and rejects unsupported protected keys', async () => {
  const sqlite = fixture();
  const { POST } = await import('../app/api/admin/orders/[id]/fulfillment/route');
  const send = (body: string) => POST(new Request('http://localhost:3000/api/admin/orders/order-1/fulfillment', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  }), { params: Promise.resolve({ id: 'order-1' }) });
  const base = { action: 'cancel', note: 'Cancel this order now.', requestId: 'fulfillment-cancel-1',
    formVersion: 1, customAnswers: [{ fieldId: 'context_note', value: 'Fictional context' }] };
  assert.equal((await send('{ invalid')).status, 400);
  assert.equal((await send(JSON.stringify({ ...base, 'custom.discount': 100 }))).status, 400);
  assert.equal((await send(JSON.stringify({ ...base, customAnswers: Array(70000).fill('x') }))).status, 413);
  assert.equal((await send(JSON.stringify({...base,customAnswers:[]}))).status,400);
  assert.equal((await send(JSON.stringify({...base,formVersion:0}))).status,409);
  assert.equal(globalThis.cancellationRouteCalls.length,0);
  assert.equal((await send(JSON.stringify(base))).status, 200);
  const action = globalThis.cancellationRouteCalls.find((call) => call.kind === 'fulfillment')?.input as {
    form: { requestId: string; versionId: string };
  };
  assert.equal(action.form.requestId, base.requestId);
  assert.equal(action.form.versionId, 'staff.order-fulfillment:v1');
  sqlite.close();
});
