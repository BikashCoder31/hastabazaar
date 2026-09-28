import type { FixtureBrowser } from './helpers/browser-fixture-types';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';

import { moderateProductReview } from '../lib/db/repositories/customers';
import { transitionAdminFulfillment } from '../lib/db/repositories/fulfillment';
import { moderateSellerReply } from '../lib/db/repositories/review-extras';
import { getFormAnswerById } from '../lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '../lib/forms/access';

declare global {
  var programmaticDb: D1Database;
  var programmaticActor: { id: string; role: 'admin' | 'super_admin' } | null;
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.programmaticDb}}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){if(!globalThis.programmaticActor)throw new StaffAuthorizationError('Staff access required.',403);return globalThis.programmaticActor}`, shortCircuit: true };
  if (specifier === '@/lib/email/send-order-updates') return { url: 'data:text/javascript,export async function sendPendingOrderUpdates(){}', shortCircuit: true };
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
  beforeBatch?: () => void;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    const before = this.beforeBatch; this.beforeBatch = undefined; before?.();
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
const formField = { id: 'context_note', key: 'context_note', label: 'Staff context', type: 'short_text', required: true, order: 0, status: 'active' };
function fixture(fields: unknown[] = [formField]) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter((item) => /^\d{4}_.+\.sql$/.test(item)).sort())
    for (const statement of readFileSync(`drizzle/${name}`, 'utf8').split('--> statement-breakpoint'))
      if (statement.trim()) sqlite.exec(statement);
  for (const [id, role] of [['admin', 'admin'], ['other', 'admin'], ['buyer', 'customer'], ['seller', 'seller']] as const) {
    sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'active',1,1)").run(id, `${id}@example.test`, id);
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').run(id, role);
  }
  sqlite.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at)
    VALUES ('seller-one','seller','Seller','Seller','Local','SIM-1','none','NONE','Seller','9800000000','seller@example.test','Bagmati','Kathmandu','Kathmandu','Local','SIM-PAYOUT','approved',1,1)`).run();
  sqlite.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','cat','Category',1,1,1,1)").run();
  sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
    VALUES ('product-one','seller-one','cat','item','item','Fictional item','Fictional description',1000,10,'Maker','NP','Clay',1,'published',1,1)`).run();
  sqlite.prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,currency,policy_version,shipping_address_json,item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,created_at,updated_at)
    VALUES ('order-one','ORD-ONE','buyer','buyer@example.test','9811111111','ready_for_pickup','en-NP','NPR','test','{}',1000,0,0,0,0,1000,'cod','pending',1,1,1)`).run();
  sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,seller_discount_paisa,commission_bps,commission_paisa,tax_paisa,line_total_paisa,return_eligible_snapshot,fulfillment_status,created_at)
    VALUES ('item-one','order-one','product-one','seller-one','Seller','Fictional item','item',1000,1,0,1000,100,0,1000,1,'ready_for_pickup',1)`).run();
  sqlite.prepare(`INSERT INTO shipments(id,order_id,provider,status,payment_mode,delivery_charge_paisa,estimated_min_days,estimated_max_days,created_at,updated_at)
    VALUES ('ship-one','order-one','manual','ready_for_pickup','cod',0,1,2,1,1)`).run();
  sqlite.prepare(`INSERT INTO product_reviews(id,product_id,customer_id,order_item_id,rating,title,body,status,created_at,updated_at)
    VALUES ('review-one','product-one','buyer','item-one',5,'Fictional review','Fictional review body','pending',1,1)`).run();
  for (const formId of ['staff.order-fulfillment', 'staff.review-moderation'])
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?, ?,1,1,'published',?,'Fixture','admin',1,'admin',1,'admin',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields }), `seed-${formId}`);
  const wrapper = new Database(sqlite);
  globalThis.programmaticDb = wrapper as unknown as D1Database;
  globalThis.programmaticActor = { id: 'admin', role: 'admin' };
  return { sqlite, wrapper, database: wrapper as unknown as D1Database };
}
function form(formId: 'staff.order-fulfillment' | 'staff.review-moderation', requestId: string, value = 'Fictional staff evidence') {
  return { requestId, versionId: `${formId}-v1`, answers: { formId, version: 1, answers: [{ fieldId: 'context_note', label: 'Staff context', type: 'short_text' as const, value }] } };
}
function count(sqlite: DatabaseSync, table: string, where: string) {
  return (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n;
}

async function assertArchivedRouteReplay(sqlite: DatabaseSync, formId: string, actorId: string,
  send: (body: unknown) => Promise<Response>, body: Record<string, unknown>) {
  const counts = () => ['form_answer_sets', 'audit_logs'].map(table => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n);
  const before = counts();
  sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    SELECT ?,form_id,2,2,'published',json_set(config_json,'$.fields[0].status','archived'),'Archived field',?,2,?,2,?,2,?
    FROM form_config_versions WHERE id=?`).run(`${formId}-archived-v2`,actorId,actorId,actorId,`${formId}-archive`,`${formId}-v1`);
  assert.equal((await send(body)).status,200,'Exact replay after the configured field is archived');
  assert.deepEqual(counts(),before);
  sqlite.prepare("UPDATE users SET status='suspended' WHERE id=?").run(actorId);
  assert.notEqual((await send(body)).status,200,'Historical replay must reauthorize the current actor');
  assert.deepEqual(counts(),before);
}

void test('both moderation receivers bound streamed JSON before parsing and reject malformed object bodies', async () => {
  const {sqlite}=fixture();
  try {
    for(const path of ['../app/api/admin/reviews/[id]/route','../app/api/admin/reviews/[id]/reply/route']) {
      const {POST}=await import(path);
      const send=(body:BodyInit)=>POST(new Request('http://localhost:3000/api/admin/review-test',{
        method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body,duplex:'half',
      } as RequestInit & {duplex:'half'}),{params:Promise.resolve({id:'review-one'})});
      const stream=new ReadableStream<Uint8Array>({start(controller){
        controller.enqueue(new TextEncoder().encode(JSON.stringify({padding:'x'.repeat(262145)})));controller.close();
      }});
      assert.equal((await send(stream)).status,413,`${path}: streamed oversized JSON`);
      for(const malformed of ['{','null','[]'])assert.equal((await send(malformed)).status,400,`${path}:${malformed}`);
    }
  } finally {sqlite.close();}
});

void test('both moderation routes classify a publication racing the real domain batch as stale and roll back', async()=>{
  for(const reply of [false,true]){
    const {sqlite,wrapper}=fixture();
    const requestId=`moderation-route-race-${reply}`;
    try {
      if(reply)sqlite.prepare(`INSERT INTO review_replies(id,review_id,seller_id,body,version,status,created_at)
        VALUES ('reply-one','review-one','seller-one','Fictional reply',1,'pending',1)`).run();
      wrapper.beforeBatch=()=>sqlite.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT 'moderation-v2',form_id,2,2,'published',config_json,'Later publication','admin',2,'admin',2,'admin',2,'moderation-publish' FROM form_config_versions WHERE id='staff.review-moderation-v1'`).run();
      const {POST}=await import(reply?'../app/api/admin/reviews/[id]/reply/route':'../app/api/admin/reviews/[id]/route');
      const response=await POST(new Request('http://localhost:3000/api/admin/review-test',{
        method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({
          action:'publish',note:'Fictional moderation evidence',idempotencyKey:requestId,version:1,formVersion:1,
          customAnswers:[{fieldId:'context_note',value:'Fictional staff evidence'}],
        }),
      }),{params:Promise.resolve({id:'review-one'})});
      assert.equal(response.status,409);
      assert.equal((await response.json() as {code?:string}).code,'stale_version');
      assert.equal((sqlite.prepare(`SELECT status FROM ${reply?'review_replies':'product_reviews'} WHERE id=?`).get(reply?'reply-one':'review-one') as {status:string}).status,'pending');
      assert.equal(count(sqlite,'form_answer_sets',`request_id='${requestId}'`),0);
      assert.equal(count(sqlite,'audit_logs',`request_id='${requestId}'`),0);
    } finally {sqlite.close();}
  }
});

void test('review moderation saves exactly one answer with its decision and binds exact retry', async () => {
  const { sqlite, database } = fixture();
  try {
    const input = { reviewId: 'review-one', actorId: 'admin', action: 'publish' as const, note: 'Fictional checks completed', requestId: 'review-action-one', now: 10,
      form: form('staff.review-moderation', 'review-action-one') };
    await moderateProductReview(database, input);
    assert.equal(count(sqlite, 'form_answer_sets', "form_id='staff.review-moderation' AND subject_type='product_review' AND subject_id='review-one'"), 1);
    await moderateProductReview(database, input);
    assert.equal(count(sqlite, 'audit_logs', "request_id='review-action-one'"), 1);
    await assert.rejects(moderateProductReview(database, { ...input, note: 'Different decision explanation' }));
    await assert.rejects(moderateProductReview(database, { ...input, actorId: 'other' }));
    await assert.rejects(moderateProductReview(database, { ...input, reviewId: 'review-two' }));
  } finally { sqlite.close(); }
});

void test('review moderation rolls back status when answer insert fails and rejects stale state', async () => {
  const { sqlite, database } = fixture();
  try {
    const input = { reviewId: 'review-one', actorId: 'admin', action: 'publish' as const, note: 'Fictional checks completed', requestId: 'review-action-fail', now: 10,
      form: form('staff.review-moderation', 'review-action-fail') };
    await assert.rejects(moderateProductReview(database, { ...input, form: { ...input.form, versionId: 'missing-version' } }));
    assert.equal((sqlite.prepare("SELECT status FROM product_reviews WHERE id='review-one'").get() as { status: string }).status, 'pending');
    assert.equal(count(sqlite, 'audit_logs', "request_id='review-action-fail'"), 0);
    sqlite.exec("UPDATE product_reviews SET status='rejected' WHERE id='review-one'");
    await assert.rejects(moderateProductReview(database, input));
    assert.equal(count(sqlite, 'form_answer_sets', "form_id='staff.review-moderation'"), 0);
  } finally { sqlite.close(); }
});

void test('review moderation cannot attach an answer after a competing same-tick decision', async () => {
  const { sqlite, wrapper, database } = fixture();
  try {
    const input = { reviewId: 'review-one', actorId: 'admin', action: 'publish' as const,
      note: 'Fictional checks completed', requestId: 'review-race', now: 10,
      form: form('staff.review-moderation', 'review-race') };
    wrapper.beforeBatch = () => sqlite.exec("UPDATE product_reviews SET status='published',moderated_by='admin',updated_at=10,moderation_note='Fictional checks completed' WHERE id='review-one'");
    await assert.rejects(moderateProductReview(database, input));
    assert.equal(count(sqlite, 'form_answer_sets', "request_id='review-race'"), 0);
    assert.equal(count(sqlite, 'audit_logs', "request_id='review-race'"), 0);
  } finally { sqlite.close(); }
});

void test('seller reply moderation saves staff-only context on the exact reply version and replay', async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.prepare(`INSERT INTO review_replies(id,review_id,seller_id,body,version,status,created_at)
      VALUES ('reply-one','review-one','seller-one','Fictional reply',1,'pending',1)`).run();
    const input = { reviewId: 'review-one', actorId: 'admin', action: 'publish' as const,
      version: 1, note: 'Fictional reply checked', requestId: 'reply-moderate-one', now: 10,
      form: form('staff.review-moderation', 'reply-moderate-one') };
    await moderateSellerReply(database, input);
    assert.equal(count(sqlite, 'form_answer_sets', "form_id='staff.review-moderation' AND subject_type='review_reply' AND subject_id='reply-one'"), 1);
    await moderateSellerReply(database, input);
    assert.equal(count(sqlite, 'audit_logs', "request_id='reply-moderate-one'"), 1);
    await assert.rejects(moderateSellerReply(database, { ...input, version: 2 }));
    await assert.rejects(moderateSellerReply(database, { ...input, note: 'Changed reply explanation' }));
    await assert.rejects(moderateSellerReply(database, { ...input, actorId: 'other' }));
  } finally { sqlite.close(); }
});

void test('seller reply moderation cannot leave a decision when the form answer fails', async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.prepare(`INSERT INTO review_replies(id,review_id,seller_id,body,version,status,created_at)
      VALUES ('reply-one','review-one','seller-one','Fictional reply',1,'pending',1)`).run();
    const input = { reviewId: 'review-one', actorId: 'admin', action: 'publish' as const,
      version: 1, note: 'Fictional reply checked', requestId: 'reply-moderate-fail', now: 10,
      form: { ...form('staff.review-moderation', 'reply-moderate-fail'), versionId: 'missing-version' } };
    await assert.rejects(moderateSellerReply(database, input));
    assert.equal((sqlite.prepare("SELECT status FROM review_replies WHERE id='reply-one'").get() as { status: string }).status, 'pending');
    assert.equal(count(sqlite, 'audit_logs', "request_id='reply-moderate-fail'"), 0);
  } finally { sqlite.close(); }
});

void test('a revoked moderator cannot replay an old review or reply decision', async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.prepare(`INSERT INTO review_replies(id,review_id,seller_id,body,version,status,created_at)
      VALUES ('reply-one','review-one','seller-one','Fictional reply',1,'pending',1)`).run();
    const review = { reviewId: 'review-one', actorId: 'admin', action: 'publish' as const,
      note: 'Fictional review checked', requestId: 'role-review', now: 10,
      form: form('staff.review-moderation', 'role-review') };
    const reply = { reviewId: 'review-one', actorId: 'admin', action: 'publish' as const,
      version: 1, note: 'Fictional reply checked', requestId: 'role-reply', now: 10,
      form: form('staff.review-moderation', 'role-reply') };
    await moderateProductReview(database, review);
    await moderateSellerReply(database, reply);
    sqlite.exec("UPDATE user_roles SET role='customer' WHERE user_id='admin' AND role='admin'");
    await assert.rejects(moderateProductReview(database, review));
    await assert.rejects(moderateSellerReply(database, reply));
  } finally { sqlite.close(); }
});

void test('fulfillment dispatch commits its answer with order transition and exact retry', async () => {
  const { sqlite, database } = fixture();
  try {
    const input = { orderId: 'order-one', actorId: 'admin', action: 'dispatch' as const, note: 'Fictional consignment verified', trackingCode: 'SIM-TRACK-1', requestId: 'dispatch-one', now: 10,
      form: form('staff.order-fulfillment', 'dispatch-one') };
    await transitionAdminFulfillment(database, input);
    assert.equal(count(sqlite, 'form_answer_sets', "form_id='staff.order-fulfillment' AND subject_type='order' AND subject_id='order-one'"), 1);
    await transitionAdminFulfillment(database, input);
    assert.equal(count(sqlite, 'order_status_events', "request_id='dispatch-one'"), 1);
    await assert.rejects(transitionAdminFulfillment(database, { ...input, trackingCode: 'SIM-TRACK-2' }));
    await assert.rejects(transitionAdminFulfillment(database, { ...input, actorId: 'other' }));
  } finally { sqlite.close(); }
});

void test('fulfillment rolls back the order when answer insert fails', async () => {
  const { sqlite, database } = fixture();
  try {
    const input = { orderId: 'order-one', actorId: 'admin', action: 'dispatch' as const, note: 'Fictional consignment verified', trackingCode: 'SIM-TRACK-1', requestId: 'dispatch-fail', now: 10,
      form: form('staff.order-fulfillment', 'dispatch-fail') };
    await assert.rejects(transitionAdminFulfillment(database, { ...input, form: { ...input.form, versionId: 'missing-version' } }));
    assert.equal((sqlite.prepare("SELECT status FROM orders WHERE id='order-one'").get() as { status: string }).status, 'ready_for_pickup');
    assert.equal(count(sqlite, 'order_status_events', "request_id='dispatch-fail'"), 0);
  } finally { sqlite.close(); }
});

void test('delivery keeps COD receipt and staff context in the same successful order transition', async () => {
  const { sqlite, database } = fixture();
  try {
    await transitionAdminFulfillment(database, { orderId: 'order-one', actorId: 'admin', action: 'dispatch',
      note: 'Fictional consignment checked', trackingCode: 'SIM-TRACK-1', requestId: 'delivery-prep', now: 10,
      form: form('staff.order-fulfillment', 'delivery-prep') });
    const input = { orderId: 'order-one', actorId: 'admin', action: 'deliver' as const,
      note: 'Fictional COD receipt checked', requestId: 'delivery-complete', now: 20,
      form: form('staff.order-fulfillment', 'delivery-complete') };
    await transitionAdminFulfillment(database, input);
    assert.equal((sqlite.prepare("SELECT status FROM orders WHERE id='order-one'").get() as { status: string }).status, 'delivered');
    assert.equal(count(sqlite, 'order_documents', "order_id='order-one' AND kind='payment_receipt'"), 1);
    assert.equal(count(sqlite, 'form_answer_sets', "form_id='staff.order-fulfillment' AND subject_id='order-one'"), 2);
    await transitionAdminFulfillment(database, input);
    assert.equal(count(sqlite, 'order_documents', "order_id='order-one' AND kind='payment_receipt'"), 1);
  } finally { sqlite.close(); }
});

void test('staff operation answers stay private from customer and seller parent owners', async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.prepare(`INSERT INTO review_replies(id,review_id,seller_id,body,version,status,created_at)
      VALUES ('reply-one','review-one','seller-one','Fictional reply',1,'pending',1)`).run();
    await moderateProductReview(database, { reviewId: 'review-one', actorId: 'admin', action: 'publish',
      note: 'Fictional review checked', requestId: 'private-review', now: 10,
      form: form('staff.review-moderation', 'private-review') });
    await moderateSellerReply(database, { reviewId: 'review-one', actorId: 'admin', action: 'publish', version: 1,
      note: 'Fictional reply checked', requestId: 'private-reply', now: 10,
      form: form('staff.review-moderation', 'private-reply') });
    await transitionAdminFulfillment(database, { orderId: 'order-one', actorId: 'admin', action: 'dispatch',
      note: 'Fictional consignment checked', trackingCode: 'SIM-TRACK-1', requestId: 'private-order', now: 10,
      form: form('staff.order-fulfillment', 'private-order') });
    for (const [requestId, viewer] of [['private-review', { id: 'buyer', role: 'customer' as const }],
      ['private-reply', { id: 'seller', role: 'seller' as const }],
      ['private-order', { id: 'buyer', role: 'customer' as const }]] as const) {
      const id = (sqlite.prepare('SELECT id FROM form_answer_sets WHERE request_id=?').get(requestId) as { id: string }).id;
      const answer = await getFormAnswerById(database, id);
      assert.ok(answer);
      assert.equal(await authorizeFormAnswerRead(database, viewer, answer), false, requestId);
    }
  } finally { sqlite.close(); }
});

function request(path: string, body: unknown) {
  return new Request(`http://localhost:3000${path}`, { method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

void test('review route requires current published version and rejects protected custom fields', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/reviews/[id]/route');
    const send = (body: unknown) => POST(request('/api/admin/reviews/review-one', body), { params: Promise.resolve({ id: 'review-one' }) });
    const base = { action: 'publish', note: 'Fictional checks completed', idempotencyKey: 'route-review', formVersion: 1,
      customAnswers: [{ fieldId: 'context_note', value: 'Fictional evidence' }] };
    assert.equal((await send({ ...base, formVersion: undefined })).status, 409);
    assert.equal((await send({ ...base, customAnswers: [{ fieldId: 'note', value: 'Override' }] })).status, 400);
    assert.equal((await send({ ...base, customAnswers: [] })).status, 400);
    assert.equal(count(sqlite, 'form_answer_sets', "form_id='staff.review-moderation'"), 0);
    assert.equal((await send(base)).status, 200);
    assert.equal((await send(base)).status, 200);
    assert.equal((await send({ ...base, note: 'Changed moderation evidence' })).status, 409);
    assert.equal(count(sqlite, 'form_answer_sets', "request_id='route-review'"), 1);
    await assertArchivedRouteReplay(sqlite, 'staff.review-moderation', 'admin', send, base);
  } finally { sqlite.close(); }
});

void test('fulfillment route enforces required publication before dispatch and binds exact replay', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/orders/[id]/fulfillment/route');
    const send = (body: unknown) => POST(request('/api/admin/orders/order-one/fulfillment', body), { params: Promise.resolve({ id: 'order-one' }) });
    const base = { action: 'dispatch', note: 'Fictional consignment verified', trackingCode: 'SIM-TRACK-1',
      requestId: 'route-dispatch', formVersion: 1, customAnswers: [{ fieldId: 'context_note', value: 'Fictional evidence' }] };
    assert.equal((await send({ ...base, requestId: undefined })).status, 400);
    assert.equal((await send({ ...base, formVersion: undefined })).status, 409);
    assert.equal((await send({ ...base, customAnswers: [] })).status, 400);
    assert.equal((sqlite.prepare("SELECT status FROM orders WHERE id='order-one'").get() as { status: string }).status, 'ready_for_pickup');
    assert.equal((await send(base)).status, 200);
    assert.equal((await send(base)).status, 200);
    assert.equal((await send({ ...base, note: 'Changed consignment evidence' })).status, 409);
    assert.equal(count(sqlite,'form_answer_sets',"request_id='route-dispatch'"),1);
    assert.equal((sqlite.prepare("SELECT status FROM orders WHERE id='order-one'").get() as { status: string }).status, 'dispatched');
    await assertArchivedRouteReplay(sqlite, 'staff.order-fulfillment', 'admin', send, base);
  } finally { sqlite.close(); }
});

void test('reply moderation route enforces required publication and exact reply-version replay', async () => {
  const { sqlite } = fixture();
  try {
    sqlite.prepare(`INSERT INTO review_replies(id,review_id,seller_id,body,version,status,created_at)
      VALUES ('reply-one','review-one','seller-one','Fictional reply',1,'pending',1)`).run();
    const { POST } = await import('../app/api/admin/reviews/[id]/reply/route');
    const send = (body: unknown) => POST(request('/api/admin/reviews/review-one/reply', body), { params: Promise.resolve({ id: 'review-one' }) });
    const base = { action: 'publish', note: 'Fictional reply checked', version: 1,
      idempotencyKey: 'route-reply', formVersion: 1,
      customAnswers: [{ fieldId: 'context_note', value: 'Fictional evidence' }] };
    assert.equal((await send({ ...base, formVersion: undefined })).status, 409);
    assert.equal((await send({ ...base, customAnswers: [] })).status, 400);
    assert.equal((sqlite.prepare("SELECT status FROM review_replies WHERE id='reply-one'").get() as { status: string }).status, 'pending');
    assert.equal((await send(base)).status, 200);
    assert.equal((await send(base)).status, 200);
    assert.equal((await send({ ...base, note: 'Changed reply moderation reason' })).status, 409);
    assert.equal(count(sqlite,'form_answer_sets',"request_id='route-reply'"),1);
    assert.equal((sqlite.prepare("SELECT status FROM review_replies WHERE id='reply-one'").get() as { status: string }).status, 'published');
    await assertArchivedRouteReplay(sqlite, 'staff.review-moderation', 'admin', send, base);
  } finally { sqlite.close(); }
});

void test('mounted operation controls render a required field and send versioned answers', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {AdminOrderFulfillmentActions} from './components/admin/order-fulfillment-actions';
    import {ReviewModerationActions} from './components/admin/review-moderation-actions';
    createRoot(document.getElementById('root')).render(<>
      <AdminOrderFulfillmentActions orderId="order-one" status="ready_for_pickup" />
      <ReviewModerationActions id="review-one" status="pending" />
      <ReviewModerationActions id="review-one" status="pending" replyVersion={1} />
    </>);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
    platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'programmatic-client-stubs', setup(bundler) {
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'form-config', namespace: 'ops-stub' }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'ops-stub' }));
      bundler.onResolve({ filter: /^@\/components\/ui\/alert-dialog$/ }, () => ({ path: 'dialog', namespace: 'ops-stub' }));
      bundler.onLoad({ filter: /^form-config$/, namespace: 'ops-stub' }, () => ({ contents: `
        const config=(formId)=>({formId,version:1,publishedAt:1,fields:[{id:'context_note',key:'context_note',label:'Staff context',type:'short_text',required:true,order:0,status:'active'}]});
        export function usePublishedFormConfig(formId){return {config:config(formId),canSubmit:true,status:'ready',message:'',refresh(){},handleSubmissionResponse(){return true}}}
      `, loader: 'js' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'ops-stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
      bundler.onLoad({ filter: /^dialog$/, namespace: 'ops-stub' }, () => ({ resolveDir: process.cwd(), contents: `
        import React from 'react';
        export function AlertDialog({open,children}){return open?<div role="dialog">{children}</div>:null}
        export function AlertDialogContent({children}){return <div>{children}</div>}
        export function AlertDialogHeader({children}){return <div>{children}</div>}
        export function AlertDialogTitle({children}){return <h2>{children}</h2>}
        export function AlertDialogDescription({children}){return <p>{children}</p>}
        export function AlertDialogFooter({children}){return <div>{children}</div>}
        export function AlertDialogAction({children,onClick,disabled}){return <button type="button" disabled={disabled} onClick={onClick}>{children}</button>}
        export function AlertDialogCancel({children,disabled}){return <button type="button" disabled={disabled}>{children}</button>}
      `, loader: 'tsx' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const bodies: { path: string; body: Record<string, unknown> }[] = [];
  try {
    await page.route('https://operations.test/**', (route) => {
      if (route.request().method() === 'POST') {
        const path = new URL(route.request().url()).pathname;
        bodies.push({ path, body: JSON.parse(route.request().postData() ?? '{}') });
        if (path.endsWith('/fulfillment') && bodies.filter((item) => item.path === path).length === 1)
          return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Temporary fixture failure"}' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://operations.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('button', { name: 'Mark dispatched' }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.locator('[data-configured-field="context_note"]').count(), 1);
    await dialog.getByLabel('Tracking or consignment reference').fill('SIM-TRACK-1');
    await dialog.getByLabel('Operations note').fill('Fictional consignment verified');
    await dialog.getByLabel('Staff context').fill('Reviewed fictional courier reference');
    await dialog.getByRole('button', { name: 'Mark dispatched' }).click();
    await dialog.getByText('Temporary fixture failure').waitFor();
    await dialog.getByRole('button', { name: 'Mark dispatched' }).click();
    const reviews = page.locator('form[data-form-id="staff.review-moderation"]');
    const review = reviews.first();
    await review.getByLabel('Moderation note').fill('Fictional review checks completed');
    assert.equal(await review.locator('[data-configured-field="context_note"]').count(), 1);
    await review.getByLabel('Staff context').fill('Reviewed fictional listing');
    await review.getByRole('button', { name: 'Publish review' }).click();
    const reply = reviews.nth(1);
    await reply.getByLabel('Moderation note').fill('Fictional seller reply checked');
    await reply.getByLabel('Staff context').fill('Reviewed fictional seller reply');
    await reply.getByRole('button', { name: 'Publish reply' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-configured-field="context_note"]').length >= 1);
    assert.equal(bodies.length, 4);
    for (const { body } of bodies) {
      assert.equal(body.formVersion, 1);
      assert.equal((body.customAnswers as unknown[]).length, 1);
    }
    assert.equal(bodies[0].path, '/api/admin/orders/order-one/fulfillment');
    assert.equal(bodies[0].body.requestId, bodies[1].body.requestId);
    assert.equal(bodies[2].path, '/api/admin/reviews/review-one');
    assert.equal(bodies[3].path, '/api/admin/reviews/review-one/reply');
    assert.equal(bodies[3].body.version, 1);
  } finally { await page.close(); await browser.close(); }
});
