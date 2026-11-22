import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

import { authorizeFormAnswerRead } from '../lib/forms/access';
import { collectFormAnswersForPrivacy } from '../lib/forms/privacy';
import type { StoredFormAnswer } from '../lib/db/repositories/form-answers';
import { listStaffFormHistory, readStaffFormHistoryAnswer, availableStaffHistoryKinds } from '../lib/forms/staff-history';

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
}
class Database {
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
}
const viewer = { id: 'admin-one', role: 'admin' as const };
function answer(formId: string, subjectType: string, subjectId: string, requestId: string,
  actorId = 'actor-one'): StoredFormAnswer {
  return { id: `answer-${requestId}`, formId: formId as StoredFormAnswer['formId'],
    subjectType, subjectId, requestId, actorId, versionId: 'catalog-v1', createdAt: 100,
    answers: { formId: formId as StoredFormAnswer['formId'], version: 1, answers: [] },
    historicalFieldIds: [] };
}
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE user_roles(user_id TEXT,role TEXT);
    CREATE TABLE staff_permission_profiles(user_id TEXT,permissions_json TEXT);
    CREATE TABLE categories(id TEXT PRIMARY KEY);
    CREATE TABLE occasions(id TEXT PRIMARY KEY);
    CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT);
    CREATE TABLE addresses(id TEXT PRIMARY KEY,user_id TEXT);
    CREATE TABLE address_answer_owner_tombstones(address_id TEXT,user_id TEXT);
    CREATE TABLE product_reviews(id TEXT PRIMARY KEY,customer_id TEXT,product_id TEXT);
    CREATE TABLE shipping_job_events(id TEXT PRIMARY KEY,shipping_job_id TEXT);
    CREATE TABLE review_replies(id TEXT PRIMARY KEY,review_id TEXT,seller_id TEXT);
    CREATE TABLE managed_supply_records(id TEXT PRIMARY KEY,seller_id TEXT);
    CREATE TABLE seller_route_transition_applications(id TEXT PRIMARY KEY,seller_id TEXT);
    CREATE TABLE rider_applications(id TEXT PRIMARY KEY,user_id TEXT);
    CREATE TABLE parcel_cash_records(id TEXT PRIMARY KEY,kind TEXT,rider_user_id TEXT);
    CREATE TABLE rider_events(id TEXT PRIMARY KEY,action TEXT,user_id TEXT);
    CREATE TABLE return_requests(id TEXT PRIMARY KEY,order_item_id TEXT);
    CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,seller_id TEXT);
    CREATE TABLE complaints(id TEXT PRIMARY KEY,order_id TEXT,seller_id TEXT);
    CREATE TABLE gift_cards(id TEXT PRIMARY KEY,issued_by TEXT,redeemed_by TEXT);
    CREATE TABLE orders(id TEXT PRIMARY KEY,customer_id TEXT);
    CREATE TABLE exception_work_items(id TEXT PRIMARY KEY,order_id TEXT,kind TEXT);
    CREATE TABLE exception_work_events(id TEXT PRIMARY KEY,work_id TEXT,actor_id TEXT,action TEXT,payload_json TEXT);
    CREATE TABLE managed_invoice_groups(id TEXT PRIMARY KEY);
    CREATE TABLE managed_invoice_adjustments(id TEXT PRIMARY KEY,invoice_group_id TEXT,request_id TEXT,created_by TEXT);
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT);
    CREATE TABLE seller_participation_profiles(seller_id TEXT PRIMARY KEY);
    CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,order_id TEXT,seller_id TEXT);
    CREATE TABLE shipping_parcels(shipping_job_id TEXT,method TEXT,rider_user_id TEXT);
    CREATE TABLE parcel_operation_events(id TEXT PRIMARY KEY,order_id TEXT,shipping_job_id TEXT,actor_id TEXT,action TEXT,payload_json TEXT);
    CREATE TABLE order_cancellation_reviews(id TEXT PRIMARY KEY,order_id TEXT,requested_by TEXT,status TEXT);
    CREATE TABLE order_cancellation_events(id TEXT PRIMARY KEY,order_id TEXT,actor_id TEXT);
    CREATE TABLE payout_requests(id TEXT PRIMARY KEY,operation_request_id TEXT,processed_by TEXT,seller_id TEXT);
    CREATE TABLE data_rights_requests(id TEXT PRIMARY KEY,customer_id TEXT);
    CREATE TABLE data_rights_events(id TEXT PRIMARY KEY,data_rights_request_id TEXT,operation_request_id TEXT,actor_id TEXT,actor_role TEXT,action TEXT);
    CREATE TABLE rider_profiles(user_id TEXT PRIMARY KEY);
    CREATE TABLE rider_reports(id TEXT PRIMARY KEY,shipping_job_id TEXT,status TEXT,reviewed_by TEXT,rider_user_id TEXT);
    CREATE TABLE rider_policy(id TEXT PRIMARY KEY);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,request_id TEXT,next_json TEXT,created_at INTEGER NOT NULL);
    CREATE TABLE form_config_versions(id TEXT PRIMARY KEY,form_id TEXT,version INTEGER,status TEXT,config_json TEXT);
    CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY,form_id TEXT,request_id TEXT,config_version_id TEXT,
      subject_type TEXT,subject_id TEXT,actor_id TEXT,answers_json TEXT,created_at INTEGER);
    INSERT INTO users VALUES ('admin-one','active'),('admin-two','active'),('super-one','active'),('actor-one','active'),('customer-one','active');
    INSERT INTO user_roles VALUES ('admin-one','admin'),('admin-two','admin'),('super-one','super_admin'),('actor-one','admin'),('customer-one','customer');
    INSERT INTO staff_permission_profiles VALUES ('admin-one','["catalog.manage","order.manage","payout.prepare","support.manage"]');
    INSERT INTO categories VALUES ('category-one');
    INSERT INTO orders VALUES ('order-one','customer-one');
    INSERT INTO shipping_jobs(id,order_id) VALUES ('job-one','order-one');
    INSERT INTO parcel_operation_events VALUES ('parcel-one','order-one','job-one','actor-one','dispatch','{}');
    INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,next_json,created_at) VALUES ('audit-parcel','actor-one','parcel.dispatch','order','order-one','parcel-one:audit',NULL,100);
    INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,next_json,created_at) VALUES ('audit-catalog','actor-one','catalog.category.created','category','category-one','catalog-one',NULL,100);
    INSERT INTO payout_requests(id,operation_request_id,processed_by) VALUES ('payout-one','payout-one-attempt','actor-one');
    INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,next_json,created_at) VALUES ('audit-payout','actor-one','payout.request.prepared','payout_request','payout-one','payout-one-attempt',NULL,100);`);
  return { sqlite, db: new Database(sqlite) as unknown as D1Database };
}

void test('staff answers require current grant and an exact committed parent, never parent ownership alone', async () => {
  const { sqlite, db } = fixture();
  try {
    const catalog = answer('staff.catalog', 'category', 'category-one', 'catalog-one');
    assert.equal(await authorizeFormAnswerRead(db, viewer, catalog), true);
    assert.equal(await authorizeFormAnswerRead(db, viewer, { ...catalog, actorId: 'forged' }), false);
    assert.equal(await authorizeFormAnswerRead(db, viewer, { ...catalog, requestId: 'forged' }), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'customer-one', role: 'customer' }, catalog), false);
    assert.equal(await authorizeFormAnswerRead(db, viewer,
      answer('staff.parcel-control', 'shipping_job', 'job-one', 'parcel-one')), true);
    assert.equal(await authorizeFormAnswerRead(db, viewer,
      answer('staff.payout-request-action', 'payout_request', 'payout-one', 'payout-one-attempt')), true);
    assert.equal(await authorizeFormAnswerRead(db, viewer,
      answer('staff.unknown-future', 'order', 'order-one', 'parcel-one')), false);
    sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='admin-one'");
    assert.equal(await authorizeFormAnswerRead(db, viewer, catalog), false);
  } finally { sqlite.close(); }
});

void test('staff parcel cancellation review request remains visible through its exact review and audit parent', async () => {
  const { sqlite, db } = fixture();
  try {
    const requestId = 'review-request-one';
    const formId = 'staff.parcel-control';
    const item = answer(formId, 'shipping_job', 'job-one', requestId);
    const payload = JSON.stringify({ jobId: 'job-one', actorId: 'actor-one', requestId,
      action: 'cancel', version: 1, note: 'Production review', formDigest: 'fictional-digest' });
    sqlite.prepare('INSERT INTO order_cancellation_reviews VALUES (?,?,?,?)')
      .run(requestId, 'order-one', 'actor-one', 'pending');
    sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,next_json,created_at) VALUES (?,?,?,'order','order-one',?,?,101)`)
      .run('review-audit-one', 'actor-one', 'cancellation.review_requested', `${requestId}:parcel-form`,
        JSON.stringify({ jobId: 'job-one', payload }));
    sqlite.prepare('INSERT INTO form_config_versions VALUES (?,?,?,?,?)').run('parcel-v1', formId, 1,
      'archived', JSON.stringify({ formId, fields: [{ id: 'context_note', key: 'context_note',
        label: 'Archived review context', type: 'short_text', status: 'archived' }] }));
    sqlite.prepare('INSERT INTO form_answer_sets VALUES (?,?,?,?,?,?,?,?,?)').run(item.id, formId,
      requestId, 'parcel-v1', 'shipping_job', 'job-one', 'actor-one',
      JSON.stringify({ formId, version: 1, answers: [{ fieldId: 'context_note',
        label: 'Archived review context', type: 'short_text', value: 'Production review evidence' }] }), 101);

    assert.equal(await authorizeFormAnswerRead(db, viewer, item), true);
    const listed = await listStaffFormHistory(db, viewer, 'parcel-control', { subjectId: 'job-one' });
    assert.deepEqual(listed.items.map((row) => row.id), [item.id]);
    const detail = await readStaffFormHistoryAnswer(db, viewer, 'parcel-control', 'job-one', item.id);
    assert.equal(detail?.answers.answers[0].label, 'Archived review context');
    assert.equal(await authorizeFormAnswerRead(db, viewer, { ...item, actorId: 'forged-actor' }), false);
    assert.equal(await authorizeFormAnswerRead(db, viewer, { ...item, requestId: 'forged-request' }), false);
    assert.equal(await authorizeFormAnswerRead(db, viewer, { ...item, subjectId: 'forged-job' }), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'customer-one', role: 'customer' }, item), false);
    sqlite.exec("UPDATE audit_logs SET next_json='{}' WHERE id='review-audit-one'");
    assert.equal(await authorizeFormAnswerRead(db, viewer, item), false, 'missing exact parcel binding is denied');
    sqlite.prepare('UPDATE audit_logs SET next_json=? WHERE id=?').run(JSON.stringify({ jobId: 'job-one', payload }), 'review-audit-one');
    sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='admin-one'");
    assert.equal(await authorizeFormAnswerRead(db, viewer, item), false, 'current grant is required');
  } finally { sqlite.close(); }
});

void test('all twelve fixed staff form/subject branches bind source events and reserved grants', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec(`INSERT INTO occasions VALUES ('occasion-one');
      INSERT INTO products(id) VALUES ('product-one');
      INSERT INTO exception_work_items VALUES ('exception-one','order-one','incorrect_cash');
      INSERT INTO exception_work_events VALUES ('exception-attempt','exception-one','actor-one','created','{}');
      INSERT INTO managed_invoice_groups VALUES ('invoice-group');
      INSERT INTO managed_invoice_adjustments VALUES ('adjustment-one','invoice-group','invoice-attempt','actor-one');
      INSERT INTO seller_profiles VALUES ('seller-one','customer-one');
      INSERT INTO seller_participation_profiles VALUES ('seller-one');
      INSERT INTO data_rights_requests VALUES ('privacy-one','customer-one');
      INSERT INTO data_rights_events VALUES ('privacy-event','privacy-one','privacy-attempt','actor-one','admin','assign');
      INSERT INTO rider_profiles VALUES ('rider-one');
      INSERT INTO rider_reports(id,shipping_job_id,status,reviewed_by) VALUES ('report-one','job-one','rejected','actor-one');
      INSERT INTO rider_reports(id,shipping_job_id,status,reviewed_by) VALUES ('report-two','job-one','accepted','actor-one');
      INSERT INTO rider_policy VALUES ('current');
      INSERT INTO parcel_operation_events VALUES ('confirm-attempt','order-one','job-one','actor-one','deliver','{"riderReportId":"report-two"}');
      INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,next_json,created_at) VALUES
        ('audit-occasion','actor-one','catalog.occasion.created','occasion','occasion-one','occasion-attempt',NULL,100),
        ('audit-classify','actor-one','catalog.product.classified','product','product-one','classify-attempt',NULL,100),
        ('audit-exception','actor-one','exception.created','order','order-one','exception-attempt:audit',NULL,100),
        ('audit-invoice','actor-one','invoice.adjustment.issued','managed_invoice_adjustment','adjustment-one','invoice-attempt:audit',NULL,100),
        ('audit-activation','actor-one','managed_maker.simulation_activated','seller','seller-one','activation-attempt',NULL,100),
        ('audit-privacy','actor-one','privacy.assign','data_rights_request','privacy-one','privacy-attempt:audit',NULL,100),
        ('audit-rider','actor-one','rider.review.configured','rider','rider-one','staff.rider-control-1:rider-attempt',NULL,100),
        ('audit-rider-report','actor-one','rider.report.rejected.configured','rider_report','report-one','staff.rider-control-1:report-attempt',NULL,100),
        ('audit-rider-confirm','actor-one','parcel.deliver','order','order-one','confirm-attempt:audit',NULL,100),
        ('audit-rider-policy','actor-one','rider.policy.configured','rider_policy','current','staff.rider-control-2:policy-attempt',NULL,100);`);
    const superViewer = { id: 'super-one', role: 'super_admin' as const };
    const cases = [
      ['staff.catalog','category','category-one','catalog-one',viewer],
      ['staff.catalog','occasion','occasion-one','occasion-attempt',viewer],
      ['staff.product-classification','product','product-one','classify-attempt',viewer],
      ['staff.exception-work','exception_work','exception-one','exception-attempt',viewer],
      ['staff.invoice-adjustment','managed_invoice_adjustment','adjustment-one','invoice-attempt',superViewer],
      ['staff.managed-maker-activation','seller','seller-one','activation-attempt',superViewer],
      ['staff.parcel-control','shipping_job','job-one','parcel-one',superViewer],
      ['staff.payout-request-action','payout_request','payout-one','payout-one-attempt',viewer],
      ['staff.privacy-action','data_rights_request','privacy-one','privacy-attempt',viewer],
      ['staff.rider-control-1','rider','rider-one','rider-attempt',superViewer],
      ['staff.rider-control-1','rider_report','report-one','report-attempt',superViewer],
      ['staff.rider-control-1','rider_report','report-two','confirm-attempt',superViewer],
      ['staff.rider-control-2','rider_policy','current','policy-attempt',superViewer],
    ] as const;
    for (const [formId, subjectType, subjectId, requestId, reader] of cases) {
      const item = answer(formId, subjectType, subjectId, requestId);
      assert.equal(await authorizeFormAnswerRead(db, reader, item), true, `${formId}/${subjectType} exact source`);
      assert.equal(await authorizeFormAnswerRead(db, reader, { ...item, subjectId: 'forged-parent' }), false,
        `${formId}/${subjectType} forged parent`);
    }
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin-two', role: 'admin' },
      answer('staff.invoice-adjustment','managed_invoice_adjustment','adjustment-one','invoice-attempt')), false,
      'an Admin without a profile does not gain a reserved tax-policy grant');
    assert.equal(await authorizeFormAnswerRead(db, viewer,
      answer('staff.managed-maker-activation','seller','seller-one','activation-attempt')), false);
    sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[\"order.manage\"]' WHERE user_id='admin-one'");
    assert.equal(await authorizeFormAnswerRead(db, viewer,
      answer('staff.exception-work','exception_work','exception-one','exception-attempt')), false,
      'incorrect cash requires current payout permission as well as order permission');
    sqlite.exec("UPDATE users SET status='disabled' WHERE id='super-one'");
    assert.equal(await authorizeFormAnswerRead(db, superViewer,
      answer('staff.rider-control-2','rider_policy','current','policy-attempt')), false,
      'a former Super Admin has no historical staff answer access');
  } finally { sqlite.close(); }
});

void test('staff history has fixed kinds, keyset discovery past 50, exact-subject detail and excluded owner export', async () => {
  const { sqlite, db } = fixture();
  try {
    const formId = 'staff.catalog';
    sqlite.prepare(`INSERT INTO form_config_versions VALUES (?,?,?,?,?)`).run('catalog-v1', formId, 1, 'published',
      JSON.stringify({ formId, fields: [{ id: 'context_note', key: 'context_note', label: 'Historical staff label',
        type: 'short_text', required: false, order: 0, status: 'archived' }] }));
    for (let i = 0; i < 55; i++) {
      const id = `catalog-${String(i).padStart(3, '0')}`;
      sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,next_json,created_at) VALUES (?,?,?,'category','category-one',?,NULL,100)`)
        .run(`audit-${id}`, 'actor-one', 'catalog.category.updated', id);
      sqlite.prepare(`INSERT INTO form_answer_sets VALUES (?,?,?,?,?,?,?,?,?)`).run(`answer-${id}`, formId,
        id, 'catalog-v1', 'category', 'category-one', 'actor-one', JSON.stringify({ formId, version: 1,
          answers: [{ fieldId: 'context_note', label: 'Historical staff label', type: 'short_text', value: 'Fictional context' }] }), i + 1);
    }
    const kinds = await availableStaffHistoryKinds(db, viewer);
    assert.ok(kinds.some((item) => item.kind === 'catalog-category'));
    const first = await listStaffFormHistory(db, viewer, 'catalog-category');
    assert.equal(first.items.length, 50);
    assert.ok(first.nextCursor);
    const second = await listStaffFormHistory(db, viewer, 'catalog-category', { cursor: first.nextCursor });
    assert.equal(second.items.length, 5);
    const record = await readStaffFormHistoryAnswer(db, viewer, 'catalog-category', 'category-one', second.items[0].id);
    assert.equal(record?.answers.answers[0].label, 'Historical staff label');
    assert.deepEqual(record?.historicalFieldIds, ['context_note']);
    assert.equal(await readStaffFormHistoryAnswer(db, viewer, 'catalog-category', 'wrong-parent', second.items[0].id), null);
    assert.equal((await collectFormAnswersForPrivacy(db, 'customer-one')).length, 0);
    for (let i = 0; i < 50; i++) {
      const id = `unlinked-${i}`;
      sqlite.prepare(`INSERT INTO form_answer_sets VALUES (?,?,?,?,?,?,?,?,?)`).run(id, formId,
        id, 'catalog-v1', 'category', 'category-one', 'actor-one',
        JSON.stringify({ formId, version: 1, answers: [] }), 1000 + i);
    }
    const deniedPage = await listStaffFormHistory(db, viewer, 'catalog-category');
    assert.equal(deniedPage.items.length, 0);
    assert.ok(deniedPage.nextCursor, 'denied candidates must not hide older authorized answers');
    const discovered = await listStaffFormHistory(db, viewer, 'catalog-category', { cursor: deniedPage.nextCursor });
    assert.equal(discovered.items.length, 50);
    await assert.rejects(() => listStaffFormHistory(db, viewer, 'catalog-category', { cursor: 'not a cursor' }));
  } finally { sqlite.close(); }
});

void test('courier history cannot expose earlier rider assignment context after reassignment',async()=>{
 const {sqlite,db}=fixture();try{
  const item=answer('staff.parcel-control','shipping_job','job-one','parcel-one');
  assert.equal(await authorizeFormAnswerRead(db,viewer,item),true);
  sqlite.exec("INSERT INTO shipping_parcels VALUES ('job-one','own_rider','private-rider')");
  assert.equal(await authorizeFormAnswerRead(db,viewer,item),false);
  sqlite.exec("UPDATE shipping_parcels SET method='courier',rider_user_id=NULL;INSERT INTO parcel_operation_events VALUES ('old-assignment','order-one','job-one','super-one','assign','{\"method\":\"own_rider\",\"riderEmail\":\"private@example.invalid\"}')");
  assert.equal(await authorizeFormAnswerRead(db,viewer,item),false);
  assert.equal(await authorizeFormAnswerRead(db,{id:'super-one',role:'super_admin'},item),true);
 }finally{sqlite.close();}
});
