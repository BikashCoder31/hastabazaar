import type { FixtureBrowser } from './helpers/browser-fixture-types';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { updateComplaintAsAdmin } from '../lib/db/repositories/complaints';
import { advanceReturnAsAdmin, decideHighValueRefund, reviewReturnAsAdmin } from '../lib/db/repositories/returns';
import { getFormAnswerById } from '../lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '../lib/forms/access';

declare global {
  var caseFormDb: D1Database;
  var caseFormActor: { id: string; role: 'admin' | 'super_admin' };
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.caseFormDb}}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){return globalThis.caseFormActor}`, shortCircuit: true };
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
const field = { id: 'case_context', key: 'case_context', label: 'Case context', type: 'short_text', required: true, order: 0, status: 'active' };
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter((item) => /^\d{4}_.+\.sql$/.test(item)).sort())
    for (const statement of readFileSync(`drizzle/${name}`, 'utf8').split('--> statement-breakpoint'))
      if (statement.trim()) sqlite.exec(statement);
  for (const [id, role] of [['admin', 'admin'], ['super', 'super_admin'], ['other', 'admin'], ['buyer', 'customer'], ['seller', 'seller']] as const) {
    sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'active',1,1)").run(id, `${id}@example.test`, id);
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').run(id, role);
  }
  sqlite.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at)
    VALUES ('seller-one','seller','Seller','Seller','Local','SIM-1','none','NONE','Seller','9800000000','seller@example.test','Bagmati','Kathmandu','Kathmandu','Local','SIM-PAYOUT','approved',1,1)`).run();
  sqlite.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','cat','Category',1,1,1,1)").run();
  sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
    VALUES ('product-one','seller-one','cat','item','item','Fictional item','Fictional description',1000,10,'Maker','NP','Clay',1,'published',1,1)`).run();
  sqlite.prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,currency,policy_version,shipping_address_json,item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,created_at,updated_at)
    VALUES ('order-one','ORD-ONE','buyer','buyer@example.test','9811111111','delivered','en-NP','NPR','test','{}',1000,0,0,0,0,1000,'cod','paid',1,1,1)`).run();
  sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,seller_discount_paisa,commission_bps,commission_paisa,tax_paisa,line_total_paisa,return_eligible_snapshot,fulfillment_status,created_at)
    VALUES ('item-one','order-one','product-one','seller-one','Seller','Fictional item','item',1000,1,0,1000,100,0,1000,1,'delivered',1)`).run();
  sqlite.prepare(`INSERT INTO return_requests(id,reference_number,order_item_id,requested_by,reason,detail,status,policy_snapshot_json,requested_at,updated_at)
    VALUES ('return-one','RET-ONE','item-one','buyer','defective','Fictional defect','requested','{}',1,1)`).run();
  sqlite.prepare(`INSERT INTO complaints(id,reference_number,customer_id,order_id,category,subject,detail,status,created_at,updated_at)
    VALUES ('complaint-one','CMP-ONE','buyer','order-one','product','Fictional concern','Fictional detail','open',1,1)`).run();
  for (const formId of ['staff.return-case-action', 'staff.complaint-case-action'])
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?, ?,1,1,'published',?,'Fixture','admin',1,'admin',1,'admin',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [field] }), `seed-${formId}`);
  const wrapper = new Database(sqlite);
  return { sqlite, wrapper, database: wrapper as unknown as D1Database };
}
function form(formId: 'staff.return-case-action' | 'staff.complaint-case-action', value = 'Fictional staff context') {
  return { versionId: `${formId}-v1`, answers: { formId, version: 1, answers: [{ fieldId: 'case_context', label: 'Case context', type: 'short_text' as const, value }] } };
}
const count = (db: DatabaseSync, table: string, where: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n;

void test('all four case receivers bound streamed JSON before custom parsing and reject malformed object bodies', async () => {
  const {sqlite,database}=fixture();
  globalThis.caseFormDb=database;globalThis.caseFormActor={id:'super',role:'super_admin'};
  try {
    for(const path of ['../app/api/admin/returns/[id]/review/route',
      '../app/api/admin/returns/[id]/high-value/route','../app/api/admin/returns/[id]/operations/route',
      '../app/api/admin/complaints/[id]/route']) {
      const {POST}=await import(path);
      const send=(body:BodyInit)=>POST(new Request('http://localhost:3000/api/admin/case-test',{
        method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body,duplex:'half',
      } as RequestInit & {duplex:'half'}),{params:Promise.resolve({id:path.includes('complaints')?'complaint-one':'return-one'})});
      const stream=new ReadableStream<Uint8Array>({start(controller){
        controller.enqueue(new TextEncoder().encode(JSON.stringify({padding:'x'.repeat(262145)})));controller.close();
      }});
      assert.equal((await send(stream)).status,413,`${path}: streamed oversized JSON`);
      for(const malformed of ['{','null','[]'])assert.equal((await send(malformed)).status,400,`${path}:${malformed}`);
    }
  } finally {sqlite.close();}
});

void test('all four case routes classify a publication racing the real domain batch as stale and roll back', async () => {
  const receivers = [
    {route:'../app/api/admin/returns/[id]/review/route',body:{action:'request_changes',note:'Fictional investigation note',publicMessageEn:'Please add more evidence.'}},
    {route:'../app/api/admin/returns/[id]/high-value/route',body:{decision:'approve',note:'Fictional independent review',publicMessageEn:'Your refund is approved.'}},
    {route:'../app/api/admin/returns/[id]/operations/route',body:{action:'mark_in_transit',note:'Fictional return transit',publicMessageEn:'Your return is in transit.',reference:'SIM-TRACK'}},
    {route:'../app/api/admin/complaints/[id]/route',body:{action:'assign_to_me',note:'Fictional complaint triage',publicMessageEn:'A specialist is assigned.'}},
  ];
  for(const [index,receiver] of receivers.entries()) {
    const {sqlite,wrapper,database}=fixture();
    const complaint=receiver.route.includes('complaints');
    const formId=complaint?'staff.complaint-case-action':'staff.return-case-action';
    const requestId=`route-publication-race-${index}`;
    try {
      globalThis.caseFormDb=database;globalThis.caseFormActor={id:'super',role:'super_admin'};
      if(index===1){
        sqlite.prepare("UPDATE return_requests SET status='pending_high_value_approval' WHERE id='return-one'").run();
        sqlite.prepare(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,reason,approved_by,requested_at)
          VALUES ('refund-one','order-one','return-one','pending_high_value_approval',1000,'Fictional review','admin',1)`).run();
      }
      if(index===2)sqlite.prepare("UPDATE return_requests SET status='approved',resolution_outcome='replacement' WHERE id='return-one'").run();
      const table=complaint?'complaints':'return_requests',id=complaint?'complaint-one':'return-one';
      const before=sqlite.prepare(`SELECT status FROM ${table} WHERE id=?`).get(id);
      wrapper.beforeBatch=()=>sqlite.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT ?,form_id,2,2,'published',json_set(config_json,'$.fields[0].status','archived'),'Later publication','super',2,'super',2,'super',2,? FROM form_config_versions WHERE id=?`)
        .run(`race-v2-${index}`,`race-publish-${index}`,`${formId}-v1`);
      const {POST}=await import(receiver.route);
      const response=await POST(new Request('http://localhost:3000/api/admin/case-test',{
        method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({
          ...receiver.body,sourceFormId:formId,formVersion:1,customAnswers:[{fieldId:'case_context',value:'Fictional staff context'}],idempotencyKey:requestId,
        }),
      }),{params:Promise.resolve({id})});
      assert.equal(response.status,409,receiver.route);
      assert.equal((await response.json() as {code?:string}).code,'stale_version',receiver.route);
      assert.deepEqual(sqlite.prepare(`SELECT status FROM ${table} WHERE id=?`).get(id),before);
      assert.equal(count(sqlite,'form_answer_sets',`request_id='${requestId}'`),0);
      assert.equal(count(sqlite,'audit_logs',`request_id='${requestId}'`),0);
    } finally {sqlite.close();}
  }
});

void test('return review commits one answer, exact replay, changed-content conflict, and no answer on failed state', async () => {
  const { sqlite, database } = fixture();
  const input = { returnRequestId: 'return-one', actorId: 'admin', actorRole: 'admin' as const,
    action: 'request_changes' as const, note: 'Further fictional evidence needed',
    publicMessageEn: 'Please add another image.', publicMessageNe: 'Please add another image.',
    requestId: 'return-case-one', now: 2, form: form('staff.return-case-action') };
  await reviewReturnAsAdmin(database, input);
  assert.equal(count(sqlite, 'form_answer_sets', "form_id='staff.return-case-action' AND subject_id='return-one'"), 1);
  await reviewReturnAsAdmin(database, input);
  assert.equal(count(sqlite, 'return_request_events', "request_id='return-case-one'"), 1);
  await assert.rejects(() => reviewReturnAsAdmin(database, { ...input, note: 'Changed fictional evidence' }), /different|used/i);
  sqlite.prepare("UPDATE return_requests SET status='rejected' WHERE id='return-one'").run();
  await assert.rejects(() => reviewReturnAsAdmin(database, { ...input, requestId: 'return-case-two' }), /no longer|changed/i);
  assert.equal(count(sqlite, 'form_answer_sets', "form_id='staff.return-case-action'"), 1);
});

void test('complaint action commits one answer, exact replay, changed-content conflict, and no answer on failed state', async () => {
  const { sqlite, database } = fixture();
  const input = { complaintId: 'complaint-one', actorId: 'admin', actorRole: 'admin' as const,
    action: 'assign_to_me' as const, note: 'Assigned for fictional investigation',
    publicMessageEn: 'A specialist is assigned.', publicMessageNe: 'A specialist is assigned.',
    requestId: 'complaint-case-one', now: 2, form: form('staff.complaint-case-action') };
  await updateComplaintAsAdmin(database, input);
  assert.equal(count(sqlite, 'form_answer_sets', "form_id='staff.complaint-case-action' AND subject_id='complaint-one'"), 1);
  await updateComplaintAsAdmin(database, input);
  assert.equal(count(sqlite, 'complaint_events', "request_id='complaint-case-one'"), 1);
  await assert.rejects(() => updateComplaintAsAdmin(database, { ...input, note: 'Changed fictional evidence' }), /different|used/i);
  sqlite.prepare("UPDATE complaints SET status='closed' WHERE id='complaint-one'").run();
  await assert.rejects(() => updateComplaintAsAdmin(database, { ...input, requestId: 'complaint-case-two' }), /closed|changed/i);
  assert.equal(count(sqlite, 'form_answer_sets', "form_id='staff.complaint-case-action'"), 1);
});

void test('conditional return operations bind protected reference and roll back a missing answer version', async () => {
  const { sqlite, database } = fixture();
  sqlite.prepare("UPDATE return_requests SET status='approved',resolution_outcome='replacement' WHERE id='return-one'").run();
  const input = { returnRequestId: 'return-one', actorId: 'admin', actorRole: 'admin' as const,
    action: 'mark_in_transit' as const, note: 'Fictional shipment was verified',
    publicMessageEn: 'Your return is in transit.', publicMessageNe: 'Your return is in transit.',
    reference: 'SIM-TRACK-ONE', requestId: 'return-operation-one', now: 3,
    form: form('staff.return-case-action') };
  await assert.rejects(advanceReturnAsAdmin(database, { ...input, requestId: 'return-operation-failed',
    form: { ...input.form, versionId: 'missing-version' } }));
  assert.equal((sqlite.prepare("SELECT status FROM return_requests WHERE id='return-one'").get() as { status: string }).status, 'approved');
  assert.equal(count(sqlite, 'form_answer_sets', "request_id='return-operation-failed'"), 0);
  await advanceReturnAsAdmin(database, input);
  assert.equal(count(sqlite, 'form_answer_sets', "request_id='return-operation-one' AND subject_id='return-one'"), 1);
  await advanceReturnAsAdmin(database, input);
  await assert.rejects(() => advanceReturnAsAdmin(database, { ...input, reference: 'SIM-TRACK-TWO' }), /different|used/i);
});

void test('conditional high-value return decision preserves a different Super Admin and exact replay', async () => {
  const { sqlite, database } = fixture();
  sqlite.prepare("UPDATE return_requests SET status='pending_high_value_approval' WHERE id='return-one'").run();
  sqlite.prepare(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,reason,approved_by,requested_at)
    VALUES ('refund-one','order-one','return-one','pending_high_value_approval',1000,'Fictional review','admin',1)`).run();
  const input = { returnRequestId: 'return-one', actorId: 'super', approve: true,
    note: 'Independent fictional refund approval', publicMessageEn: 'Refund is approved.',
    publicMessageNe: 'Refund is approved.', requestId: 'return-high-value-one', now: 3,
    form: form('staff.return-case-action') };
  await assert.rejects(decideHighValueRefund(database, { ...input, actorId: 'admin', requestId: 'same-reviewer' }));
  assert.equal(count(sqlite, 'form_answer_sets', "request_id='same-reviewer'"), 0);
  await decideHighValueRefund(database, input);
  assert.equal(count(sqlite, 'form_answer_sets', "request_id='return-high-value-one' AND subject_id='return-one'"), 1);
  await decideHighValueRefund(database, input);
  await assert.rejects(() => decideHighValueRefund(database, { ...input, approve: false }), /different|used/i);
});

void test('case and answer both roll back when current staff permission is revoked before the batch', async () => {
  const { sqlite, wrapper, database } = fixture();
  wrapper.beforeBatch = () => sqlite.prepare("UPDATE user_roles SET role='customer' WHERE user_id='admin' AND role='admin'").run();
  await assert.rejects(updateComplaintAsAdmin(database, { complaintId: 'complaint-one',
    actorId: 'admin', actorRole: 'admin', action: 'assign_to_me',
    note: 'Fictional assignment after revocation', publicMessageEn: 'A specialist is assigned.',
    publicMessageNe: 'A specialist is assigned.', requestId: 'complaint-revoked', now: 4,
    form: form('staff.complaint-case-action') }));
  assert.equal((sqlite.prepare("SELECT status FROM complaints WHERE id='complaint-one'").get() as { status: string }).status, 'open');
  assert.equal(count(sqlite, 'form_answer_sets', "request_id='complaint-revoked'"), 0);
  assert.equal(count(sqlite, 'complaint_events', "request_id='complaint-revoked'"), 0);
});

void test('high-value maker race aborts case, refund, and answer together', async () => {
  const { sqlite, wrapper, database } = fixture();
  sqlite.prepare("UPDATE return_requests SET status='pending_high_value_approval' WHERE id='return-one'").run();
  sqlite.prepare(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,reason,approved_by,requested_at)
    VALUES ('refund-one','order-one','return-one','pending_high_value_approval',1000,'Fictional review','admin',1)`).run();
  wrapper.beforeBatch = () => sqlite.prepare("UPDATE refunds SET approved_by='super' WHERE id='refund-one'").run();
  await assert.rejects(decideHighValueRefund(database, { returnRequestId: 'return-one',
    actorId: 'super', approve: true, note: 'Fictional independent decision',
    publicMessageEn: 'Refund was approved.', publicMessageNe: 'Refund was approved.',
    requestId: 'return-maker-race', now: 4, form: form('staff.return-case-action') }));
  assert.equal((sqlite.prepare("SELECT status FROM return_requests WHERE id='return-one'").get() as { status: string }).status, 'pending_high_value_approval');
  assert.equal((sqlite.prepare("SELECT status FROM refunds WHERE id='refund-one'").get() as { status: string }).status, 'pending_high_value_approval');
  assert.equal(count(sqlite, 'form_answer_sets', "request_id='return-maker-race'"), 0);
});

void test('new publication before the case batch rejects stale answers without changing the case', async () => {
  const { sqlite, wrapper, database } = fixture();
  wrapper.beforeBatch = () => sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    SELECT 'staff.complaint-case-action-v2',form_id,2,1,'published',config_json,'New fixture','admin',2,'admin',2,'admin',2,'seed-v2'
    FROM form_config_versions WHERE id='staff.complaint-case-action-v1'`).run();
  await assert.rejects(updateComplaintAsAdmin(database, { complaintId: 'complaint-one',
    actorId: 'admin', actorRole: 'admin', action: 'assign_to_me', note: 'Fictional stale publication',
    publicMessageEn: 'A specialist is assigned.', publicMessageNe: 'A specialist is assigned.',
    requestId: 'complaint-stale-publication', now: 4, form: form('staff.complaint-case-action') }));
  assert.equal((sqlite.prepare("SELECT status FROM complaints WHERE id='complaint-one'").get() as { status: string }).status, 'open');
  assert.equal(count(sqlite, 'form_answer_sets', "request_id='complaint-stale-publication'"), 0);
});

void test('legacy high-value approval and rejection roll back both records and events when maker or parent state races',async()=>{
  for(const approve of [true,false])for(const race of ['maker','parent'] as const){
    const {sqlite,wrapper,database}=fixture();
    try{
      sqlite.exec("UPDATE return_requests SET status='pending_high_value_approval' WHERE id='return-one'");
      sqlite.exec(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,reason,approved_by,requested_at)
        VALUES('legacy-refund','order-one','return-one','pending_high_value_approval',1000,'Fictional review','admin',1)`);
      wrapper.beforeBatch=()=>sqlite.exec(race==='maker'
        ?"UPDATE refunds SET approved_by='super' WHERE id='legacy-refund'"
        :"UPDATE return_requests SET status='under_investigation' WHERE id='return-one'");
      const requestId=`legacy-highvalue-${approve}-${race}`;
      await assert.rejects(decideHighValueRefund(database,{returnRequestId:'return-one',actorId:'super',approve,
        note:'Fictional high-value decision',publicMessageEn:'Refund decision recorded.',publicMessageNe:'Refund decision recorded.',requestId,now:4}));
      assert.equal((sqlite.prepare("SELECT status FROM return_requests WHERE id='return-one'").get() as {status:string}).status,
        race==='maker'?'pending_high_value_approval':'under_investigation');
      assert.equal((sqlite.prepare("SELECT status FROM refunds WHERE id='legacy-refund'").get() as {status:string}).status,'pending_high_value_approval');
      assert.equal(count(sqlite,'return_request_events',`request_id='${requestId}'`),0);
      assert.equal(count(sqlite,'audit_logs',`request_id='${requestId}'`),0);
      assert.equal(count(sqlite,'form_answer_sets',`request_id='${requestId}'`),0);
    }finally{sqlite.close();}
  }
});

void test('case owners and sellers cannot read private staff decision answers through parent ownership', async () => {
  const { sqlite, database } = fixture();
  await reviewReturnAsAdmin(database, { returnRequestId: 'return-one', actorId: 'admin',
    actorRole: 'admin', action: 'request_changes', note: 'Fictional private staff evidence',
    publicMessageEn: 'Please provide a close-up image.', publicMessageNe: 'Please provide a close-up image.',
    requestId: 'private-return-case', now: 2, form: form('staff.return-case-action') });
  await updateComplaintAsAdmin(database, { complaintId: 'complaint-one', actorId: 'admin',
    actorRole: 'admin', action: 'assign_to_me', note: 'Fictional private staff triage',
    publicMessageEn: 'A specialist is assigned.', publicMessageNe: 'A specialist is assigned.',
    requestId: 'private-complaint-case', now: 2, form: form('staff.complaint-case-action') });
  for (const requestId of ['private-return-case', 'private-complaint-case']) {
    const row = sqlite.prepare('SELECT id FROM form_answer_sets WHERE request_id=?').get(requestId) as { id: string };
    const answer = await getFormAnswerById(database, row.id);
    assert.ok(answer);
    assert.equal(await authorizeFormAnswerRead(database, { id: 'buyer', role: 'customer' }, answer), false);
    assert.equal(await authorizeFormAnswerRead(database, { id: 'seller', role: 'seller' }, answer), false);
  }
});

void test('all four staff case receivers enforce real required publication, exact replay and archived retry', async () => {
  const receivers = [
    { path: '/api/admin/returns/return-one/review', route: '../app/api/admin/returns/[id]/review/route',
      body: { action: 'request_changes', note: 'Fictional investigation note', publicMessageEn: 'Please add more evidence.' }, formId: 'staff.return-case-action' },
    { path: '/api/admin/returns/return-one/high-value', route: '../app/api/admin/returns/[id]/high-value/route',
      body: { decision: 'approve', note: 'Fictional independent review', publicMessageEn: 'Your refund is approved.' }, formId: 'staff.return-case-action' },
    { path: '/api/admin/returns/return-one/operations', route: '../app/api/admin/returns/[id]/operations/route',
      body: { action: 'mark_in_transit', note: 'Fictional return transit', publicMessageEn: 'Your return is in transit.', reference: 'SIM-TRACK' }, formId: 'staff.return-case-action' },
    { path: '/api/admin/complaints/complaint-one', route: '../app/api/admin/complaints/[id]/route',
      body: { action: 'assign_to_me', note: 'Fictional complaint triage', publicMessageEn: 'A specialist is assigned.' }, formId: 'staff.complaint-case-action' },
  ];
  for (const [index, receiver] of receivers.entries()) {
    const { sqlite, database } = fixture();
    globalThis.caseFormDb = database;
    globalThis.caseFormActor = { id: 'super', role: 'super_admin' };
    try {
      if (index === 1) {
        sqlite.prepare("UPDATE return_requests SET status='pending_high_value_approval' WHERE id='return-one'").run();
        sqlite.prepare(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,reason,approved_by,requested_at)
          VALUES ('refund-one','order-one','return-one','pending_high_value_approval',1000,'Fictional review','admin',1)`).run();
      }
      if (index === 2) sqlite.prepare("UPDATE return_requests SET status='approved',resolution_outcome='replacement' WHERE id='return-one'").run();
      const { POST } = await import(receiver.route);
      const id = receiver.path.includes('complaints') ? 'complaint-one' : 'return-one';
      const base = { ...receiver.body, sourceFormId: receiver.formId, formVersion: 1,
        customAnswers: [{ fieldId: 'case_context', value: 'Fictional context' }], idempotencyKey: `case-route-${index}` };
      const send = (body: unknown) => POST(new Request(`http://localhost:3000${receiver.path}`, {
        method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }), { params: Promise.resolve({ id }) });
      assert.equal((await send({ ...base, sourceFormId: 'staff.review-moderation' })).status, 400, receiver.path);
      assert.equal((await send({ ...base, customAnswers: [] })).status, 400, receiver.path);
      assert.equal(count(sqlite, 'form_answer_sets', '1=1'), 0);
      assert.equal((await send(base)).status, 200, receiver.path);
      assert.equal((await send(base)).status, 200, `${receiver.path}: exact replay`);
      assert.equal((await send({ ...base, note: 'Changed investigation context' })).status, 409, receiver.path);
      const before = ['form_answer_sets', 'audit_logs'].map(table => count(sqlite, table, '1=1'));
      assert.equal(before[0], 1);
      sqlite.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT ?,form_id,2,2,'published',json_set(config_json,'$.fields[0].status','archived'),'Later publication','super',2,'super',2,'super',2,? FROM form_config_versions WHERE id=?`)
        .run(`accepted-v2-${index}`, `accepted-publish-${index}`, `${receiver.formId}-v1`);
      assert.equal((await send(base)).status, 200, `${receiver.path}: historical exact replay`);
      assert.deepEqual(['form_answer_sets', 'audit_logs'].map(table => count(sqlite, table, '1=1')), before);
      const stale = await send({ ...base, idempotencyKey: `new-case-route-${index}` });
      assert.equal(stale.status, 409);
      assert.equal((await stale.json() as { code?: string }).code, 'stale_version');
      sqlite.prepare("UPDATE users SET status='suspended' WHERE id='super'").run();
      assert.notEqual((await send(base)).status, 200, `${receiver.path}: revoked replay`);
      assert.deepEqual(['form_answer_sets', 'audit_logs'].map(table => count(sqlite, table, '1=1')), before);
    } finally { sqlite.close(); }
  }
});

void test('all conditional staff case controls mount published fields and retain opaque retries', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {ReturnCaseActions} from './components/admin/return-case-actions';
    import {ComplaintCaseActions} from './components/admin/complaint-case-actions';
    const mode=new URLSearchParams(location.search).get('mode');
    createRoot(document.getElementById('root')).render(mode==='complaint'
      ? <ComplaintCaseActions id="complaint-one" status="open"/>
      : <ReturnCaseActions id="return-one" quantity={1} role={mode==='high-value'?'super_admin':'admin'}
        canApproveStandard={mode!=='high-value'} status={mode==='review'?'requested':mode==='high-value'?'pending_high_value_approval':'approved'}
        outcome={mode==='operations'?'replacement':null} refundStatus={null}/>);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
    platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'case-form-browser-stubs', setup(bundler) {
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'case-stub' }));
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'case-stub' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'case-stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
      bundler.onLoad({ filter: /^config$/, namespace: 'case-stub' }, () => ({ contents: `
        export function usePublishedFormConfig(formId){return {config:{formId,version:1,publishedAt:1,
          fields:[{id:'case_context',key:'case_context',label:'Case context',type:'short_text',required:true,order:0,status:'active'}]},
          canSubmit:true,status:'ready',message:'',handleSubmissionResponse(){}}}
      `, loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const mode of ['review', 'high-value', 'operations', 'complaint']) {
      const page = await browser.newPage();
      const bodies: Record<string, unknown>[] = [];
      try {
        await page.route('https://case-form.test/**', (route) => {
          if (route.request().method() === 'POST') {
            bodies.push(JSON.parse(route.request().postData() ?? '{}'));
            return route.fulfill({ status: bodies.length === 3 ? 200 : 503,
              contentType: 'application/json',
              body: JSON.stringify(bodies.length === 3 ? { ok:true } : { error:'Response unavailable' }) });
          }
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
        });
        const mount = async () => page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.goto(`https://case-form.test/?mode=${mode}`);
        await mount();
        let form = page.locator(`form[data-form-id="${mode==='complaint'?'staff.complaint-case-action':'staff.return-case-action'}"]`);
        await form.getByLabel('Case context').fill('Fictional case evidence');
        await form.locator('textarea').nth(0).fill('Fictional investigation note');
        await form.locator('textarea').nth(1).fill('Fictional customer message');
        const button = mode==='review'?'Save decision':mode==='high-value'?'Approve high-value refund':
          mode==='operations'?'Mark return in transit':'Apply action';
        if (mode === 'operations') await form.locator('input').nth(0).fill('SIM-TRACK-1');
        await form.getByRole('button', { name: button }).click();
        await form.getByText('Response unavailable').waitFor();
        assert.equal(bodies.length, 1, mode);
        assert.equal(bodies[0].sourceFormId, mode==='complaint'?'staff.complaint-case-action':'staff.return-case-action');
        assert.equal(bodies[0].formVersion, 1);
        assert.deepEqual(bodies[0].customAnswers, [{ fieldId: 'case_context', value: 'Fictional case evidence' }]);
        const requestId = String(bodies[0].idempotencyKey);
        assert.match(requestId, /^[0-9a-f-]{36}$/i);
        assert.ok(await page.evaluate((id: string) => Object.values(sessionStorage).includes(id), requestId));
        await page.reload();
        await mount();
        form = page.locator(`form[data-form-id="${mode==='complaint'?'staff.complaint-case-action':'staff.return-case-action'}"]`);
        await form.getByLabel('Case context').fill('Changed fictional evidence');
        await form.locator('textarea').nth(0).fill('Changed fictional investigation');
        await form.locator('textarea').nth(1).fill('Fictional customer message');
        if (mode === 'operations') await form.locator('input').nth(0).fill('SIM-TRACK-1');
        await form.getByRole('button', { name: button }).click();
        await form.getByText('Response unavailable').waitFor();
        assert.equal(bodies[1].idempotencyKey, requestId, `${mode}: changed input reuses original ID`);
        page.once('dialog', (dialog) => dialog.dismiss());
        await form.getByRole('button', { name: /Start a new attempt/i }).click();
        assert.ok(await page.evaluate((id: string) => Object.values(sessionStorage).includes(id), requestId));
        page.once('dialog', (dialog) => dialog.accept());
        await form.getByRole('button', { name: /Start a new attempt/i }).click();
        const success = page.waitForResponse((response) => response.request().method() === 'POST' && response.status() === 200);
        await form.getByRole('button', { name: button }).click();
        await success;
        assert.notEqual(bodies[2].idempotencyKey, requestId, `${mode}: confirmed reset starts a new attempt`);
        assert.equal(await page.evaluate((id: string) => Object.values(sessionStorage).includes(id), String(bodies[2].idempotencyKey)), false,
          `${mode}: confirmed success clears the attempt`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
});

void test('direct high-value refund review approves for SuperAdmin and awaits decision for Admin', async () => {
  for (const actorRole of ['super_admin','admin'] as const) for (const configured of [false,true]) {
    const {sqlite,database}=fixture();
    try {
      sqlite.prepare("UPDATE return_requests SET policy_snapshot_json=? WHERE id='return-one'").run(JSON.stringify({generalRequestWindowDays:7,deliveryDamageEvidenceWindowHours:48,changeOfMindEnabled:false,highValueRefundThresholdPaisa:100,refundInitiationBusinessDays:3,codRefundEstimateBusinessDays:[3,7]}));
      const actorId=actorRole==='super_admin'?'super':'admin',requestId=`initial-${actorRole}-${configured}`;
      const input={returnRequestId:'return-one',actorId,actorRole,action:'approve' as const,
        note:'Verified fictional return liability',publicMessageEn:'Refund review recorded.',publicMessageNe:'Refund review recorded.',
        outcome:'refund' as const,responsibility:'seller' as const,itemRefundPaisa:1000,deliveryRefundPaisa:0,requestId,now:2,
        ...(configured?{form:form('staff.return-case-action')}:{})};
      await reviewReturnAsAdmin(database,input);
      const status=actorRole==='super_admin'?'approved':'pending_high_value_approval';
      assert.deepEqual({...sqlite.prepare("SELECT r.status,f.status AS refundStatus,f.is_high_value AS highValue,f.approved_by AS maker,f.high_value_approved_by AS approver,f.approved_at AS approvedAt,f.processed_at AS processedAt FROM return_requests r JOIN refunds f ON f.return_request_id=r.id WHERE r.id='return-one'").get() as object},
        {status,refundStatus:status,highValue:1,maker:actorId,approver:actorRole==='super_admin'?actorId:null,approvedAt:actorRole==='super_admin'?2:null,processedAt:null});
      await reviewReturnAsAdmin(database,input);
      assert.equal(count(sqlite,'refunds',"return_request_id='return-one'"),1);
      sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(actorId);
      await assert.rejects(reviewReturnAsAdmin(database,input),/permission/i);
    } finally {sqlite.close();}
  }
});

void test('initial SuperAdmin high-value review rolls back every effect on actor or parent races',async()=>{
  for(const configured of [false,true])for(const race of ['role','parent','own-request'] as const){
    const {sqlite,wrapper,database}=fixture();try{
      sqlite.prepare("UPDATE return_requests SET policy_snapshot_json=? WHERE id='return-one'").run(JSON.stringify({generalRequestWindowDays:7,deliveryDamageEvidenceWindowHours:48,changeOfMindEnabled:false,highValueRefundThresholdPaisa:100,refundInitiationBusinessDays:3,codRefundEstimateBusinessDays:[3,7]}));
      const prior=Object.fromEntries(['refunds','refund_liability_entries','return_request_events','audit_logs','form_answer_sets','notification_messages'].map(table=>[table,count(sqlite,table,'1=1')]));
      if(race==='own-request')sqlite.exec("UPDATE return_requests SET requested_by='super' WHERE id='return-one'");
      else wrapper.beforeBatch=()=>sqlite.exec(race==='role'?"DELETE FROM user_roles WHERE user_id='super'":"UPDATE return_requests SET status='rejected' WHERE id='return-one'");
      await assert.rejects(reviewReturnAsAdmin(database,{returnRequestId:'return-one',actorId:'super',actorRole:'super_admin',action:'approve',note:'Verified fictional return liability',publicMessageEn:'Refund review recorded.',publicMessageNe:'Refund review recorded.',outcome:'refund',responsibility:'seller',itemRefundPaisa:1000,deliveryRefundPaisa:0,requestId:`initial-race-${configured}-${race}`,now:2,...(configured?{form:form('staff.return-case-action')}:{})}));
      for(const [table,n] of Object.entries(prior))assert.equal(count(sqlite,table,'1=1'),n,`${race}:${table}`);
    }finally{sqlite.close();}
  }
});
