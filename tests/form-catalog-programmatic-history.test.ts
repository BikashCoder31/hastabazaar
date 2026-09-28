import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { authorizeFormAnswerRead, type FormAnswerViewer } from '../lib/forms/access';
import { availableStaffHistoryKinds, listStaffFormHistory, readStaffFormHistoryAnswer } from '../lib/forms/staff-history';
import { collectFormAnswersForPrivacy } from '../lib/forms/privacy';
import { buildFormAnswerInsert, getFormAnswerById, type StoredFormAnswer } from '../lib/db/repositories/form-answers';
import { createBusinessSettingDraft, publishBusinessSettingDraft } from '../lib/db/repositories/business-settings';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { validateAnswersForDefinition, validateFormDraft } from '../lib/forms/validation';
import type { FormId } from '../lib/forms/types';
import { INITIAL_HOMEPAGE_HERO_SLIDES } from '../lib/homepage/hero-slides';
import { listCustomerCancellationAnswers } from '../lib/forms/cancellation-history';

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { const result = this.statement.run(...this.values); return { success: true, meta: { changes: Number(result.changes) }, results: [] }; }
}
class Database {
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.sqlite.exec('BEGIN');
    try { for (const statement of statements) await statement.run(); this.sqlite.exec('COMMIT'); }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
const staff: FormAnswerViewer = { id: 'reader', role: 'admin' };
const superAdmin: FormAnswerViewer = { id: 'super-reader', role: 'super_admin' };
const customer: FormAnswerViewer = { id: 'customer', role: 'customer' };
const digest = 'a'.repeat(64);
const fields = [{ id: 'context_note', key: 'context_note', label: 'Original context', type: 'short_text', required: true, order: 0, status: 'active' }];
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE user_roles(user_id TEXT,role TEXT);
    CREATE TABLE staff_permission_profiles(user_id TEXT,permissions_json TEXT);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,ip_hash TEXT,created_at INTEGER);
    CREATE TABLE orders(id TEXT PRIMARY KEY,customer_id TEXT);
    CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,seller_id TEXT);
    CREATE TABLE order_cancellation_events(id TEXT PRIMARY KEY,order_id TEXT,actor_id TEXT);
    CREATE TABLE order_cancellation_reviews(id TEXT PRIMARY KEY,order_id TEXT,requested_by TEXT,status TEXT,reviewed_by TEXT);
    CREATE TABLE return_requests(id TEXT PRIMARY KEY,order_item_id TEXT);
    CREATE TABLE return_request_events(id TEXT PRIMARY KEY,return_request_id TEXT,request_id TEXT,actor_id TEXT,actor_type TEXT,action TEXT);
    CREATE TABLE refunds(id TEXT PRIMARY KEY,return_request_id TEXT,approved_by TEXT);
    CREATE TABLE complaints(id TEXT PRIMARY KEY,order_id TEXT,seller_id TEXT);
    CREATE TABLE complaint_events(id TEXT PRIMARY KEY,complaint_id TEXT,request_id TEXT,actor_id TEXT,actor_type TEXT,action TEXT);
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT);
    CREATE TABLE seller_restriction_events(id TEXT PRIMARY KEY,seller_id TEXT,actor_id TEXT,request_id TEXT,to_mode TEXT,obligation_mode TEXT);
    CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT);
    CREATE TABLE product_reviews(id TEXT PRIMARY KEY,customer_id TEXT,product_id TEXT);
    CREATE TABLE review_replies(id TEXT PRIMARY KEY,review_id TEXT,seller_id TEXT,version INTEGER);
    CREATE TABLE addresses(id TEXT PRIMARY KEY,user_id TEXT);
    CREATE TABLE address_answer_owner_tombstones(address_id TEXT,user_id TEXT);
    CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,seller_id TEXT);
    CREATE TABLE shipping_job_events(id TEXT PRIMARY KEY,shipping_job_id TEXT);
    CREATE TABLE payout_requests(id TEXT PRIMARY KEY,seller_id TEXT);
    CREATE TABLE managed_supply_records(id TEXT PRIMARY KEY,seller_id TEXT);
    CREATE TABLE seller_route_transition_applications(id TEXT PRIMARY KEY,seller_id TEXT);
    CREATE TABLE rider_profiles(user_id TEXT PRIMARY KEY);
    CREATE TABLE rider_applications(id TEXT PRIMARY KEY,user_id TEXT);
    CREATE TABLE rider_reports(id TEXT PRIMARY KEY,rider_user_id TEXT);
    CREATE TABLE parcel_cash_records(id TEXT PRIMARY KEY,kind TEXT,rider_user_id TEXT);
    CREATE TABLE rider_events(id TEXT PRIMARY KEY,action TEXT,user_id TEXT);
    CREATE TABLE data_rights_requests(id TEXT PRIMARY KEY,customer_id TEXT);
    CREATE TABLE gift_cards(id TEXT PRIMARY KEY,issued_by TEXT,redeemed_by TEXT);
    INSERT INTO users VALUES('reader','active'),('super-reader','active'),('actor','active'),('customer','active'),('foreign-customer','active'),('seller-user','active'),('rider','active');
    INSERT INTO user_roles VALUES('reader','admin'),('super-reader','super_admin'),('actor','super_admin'),('customer','customer'),('foreign-customer','customer'),('seller-user','seller'),('rider','rider');
    INSERT INTO staff_permission_profiles VALUES('reader','["order.manage","product.review","product.publish","refund.approve.standard","seller.application.review","support.manage"]');
    INSERT INTO orders VALUES('order-one','customer'),('foreign-order','foreign-customer');
    INSERT INTO seller_profiles VALUES('seller-one','seller-user');
    INSERT INTO products VALUES('product-one','seller-one');
    INSERT INTO order_items VALUES('item-one','order-one','seller-one');
    INSERT INTO return_requests VALUES('return-one','item-one');
    INSERT INTO refunds VALUES('refund-one','return-one','reader');
    INSERT INTO complaints VALUES('complaint-one','order-one','seller-one');
    INSERT INTO product_reviews VALUES('review-one','customer','product-one');
    INSERT INTO review_replies VALUES('reply-one','review-one','seller-one',1);`);
  for (const migration of ['0044_business_configuration.sql', '0056_form_catalog.sql']) {
    const sql = await readFile(new URL(`../drizzle/${migration}`, import.meta.url), 'utf8');
    for (const part of sql.split('--> statement-breakpoint')) if (part.trim()) sqlite.exec(part);
  }
  const wrapper = new Database(sqlite);
  return { sqlite, db: wrapper as unknown as D1Database };
}
function publication(sqlite: DatabaseSync, formId: FormId, version = 1, archived = false) {
  const draft = validateFormDraft(formId, { formId, fields: fields.map((field) => ({ ...field, status: archived ? 'archived' : 'active' })) });
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES(?,?,?,1,'published',?,'Fixture publication','actor',1,'actor',1,'actor',1,?)`)
    .run(`${formId}-v${version}`, formId, version, JSON.stringify(draft), `${formId}-publication-${version}`);
  return validateAnswersForDefinition(FORM_REGISTRY[formId], { ...draft, version, publishedAt: 1 }, archived ? [] : [{ fieldId: 'context_note', value: 'Fictional original context' }]);
}
async function store(h: Awaited<ReturnType<typeof fixture>>, formId: FormId, subjectType: string, subjectId: string, requestId: string, actorId: string | null = 'actor', createdAt = 100) {
  if (!h.sqlite.prepare('SELECT 1 FROM form_config_versions WHERE form_id=?').get(formId)) publication(h.sqlite, formId);
  const snapshot = validateAnswersForDefinition(FORM_REGISTRY[formId], { formId, version: 1, publishedAt: 1, fields: validateFormDraft(formId, { formId, fields }).fields }, [{ fieldId: 'context_note', value: 'Fictional original context' }]);
  await buildFormAnswerInsert(h.db, { formId, requestId, versionId: `${formId}-v1`, subjectType, subjectId, actorId, answers: snapshot, now: createdAt }).run();
  const id = String(h.sqlite.prepare('SELECT id FROM form_answer_sets WHERE form_id=? AND request_id=?').get(formId, requestId)?.id);
  const answer = await getFormAnswerById(h.db, id); assert.ok(answer); return answer;
}
function audit(sqlite: DatabaseSync, subjectType: string, subjectId: string, requestId: string, action: string, actorId: string | null = 'actor', next: Record<string, unknown> = { catalogDigest: digest }) {
  sqlite.prepare('INSERT INTO audit_logs VALUES(?,?,?,?,?,NULL,NULL,?,?,NULL,100)')
    .run(`audit-${requestId}`, actorId, action, subjectType, subjectId, JSON.stringify(next), requestId);
}
async function records(h: Awaited<ReturnType<typeof fixture>>) {
  const result: { kind: string; answer: StoredFormAnswer; reader: FormAnswerViewer }[] = [];
  const add = async (kind: string, formId: FormId, type: string, id: string, request: string, reader = staff) => result.push({ kind, answer: await store(h, formId, type, id, request), reader });
  h.sqlite.exec(`INSERT INTO return_request_events VALUES('return-event','return-one','return-attempt','actor','admin','admin_approve');
    INSERT INTO complaint_events VALUES('complaint-event','complaint-one','complaint-attempt','actor','admin','admin_close');
    INSERT INTO order_cancellation_reviews VALUES('original-review','order-one','customer','approved','actor'),('rejected-review','order-one','customer','rejected','actor');
    INSERT INTO order_cancellation_events VALUES('review:original-review','order-one','actor'),('fulfillment-cancel','order-one','actor');
    INSERT INTO order_cancellation_reviews VALUES('fulfillment-review','order-one','actor','pending',NULL);
    INSERT INTO seller_restriction_events VALUES('restriction-event','seller-one','actor','restriction-attempt','suspended','fulfill_existing');`);
  audit(h.sqlite, 'return_request', 'return-one', 'return-attempt', 'return.admin.approve');
  await add('return-case-action', 'staff.return-case-action', 'return_request', 'return-one', 'return-attempt');
  audit(h.sqlite, 'complaint', 'complaint-one', 'complaint-attempt', 'complaint.admin.close');
  await add('complaint-case-action', 'staff.complaint-case-action', 'complaint', 'complaint-one', 'complaint-attempt');
  audit(h.sqlite, 'order', 'order-one', 'review:original-review:catalog', 'cancellation.form_submitted', 'actor', { catalogDigest: digest, formId: 'staff.cancellation-review', action: 'approve' });
  audit(h.sqlite, 'order', 'order-one', 'review:original-review', 'order.parcel_cancelled');
  await add('cancellation-approved', 'staff.cancellation-review', 'order_cancellation_event', 'review:original-review', 'review:original-review');
  audit(h.sqlite, 'order', 'order-one', 'review-reject:rejected-review', 'cancellation.review_rejected');
  await add('cancellation-rejected', 'staff.cancellation-review', 'order_cancellation_review', 'rejected-review', 'review-reject:rejected-review');
  audit(h.sqlite, 'seller', 'seller-one', 'seller-review', 'seller.application.approved_for_activation');
  await add('seller-review-action', 'staff.seller-review-action', 'seller', 'seller-one', 'seller-review');
  for (const [id, kind, key] of [['staff.homepage-hero-manager', 'homepage-hero-settings', 'homepage_hero_slides'], ['staff.homepage-occasion-manager', 'homepage-occasion-settings', 'homepage_occasion_slides'], ['staff.business-settings-manager', 'business-settings', 'independent_seller_commission_bps']] as const) {
    const answers = publication(h.sqlite, id);
    const draft = await createBusinessSettingDraft(h.db, { key, value: key === 'independent_seller_commission_bps' ? 1200 : key === 'homepage_hero_slides' ? INITIAL_HOMEPAGE_HERO_SLIDES : [], actorId: 'actor', requestId: `${id}-draft`, reason: 'Fictional saved setting context', now: 100, form: { formId: id, versionId: `${id}-v1`, answers } });
    const row = h.sqlite.prepare('SELECT id FROM form_answer_sets WHERE request_id=?').get(`${id}-draft`);
    const answer = await getFormAnswerById(h.db, String(row?.id)); assert.ok(answer); result.push({ kind, answer, reader: superAdmin });
    assert.equal(draft.id, answer.subjectId);
  }
  audit(h.sqlite, 'product', 'product-one', 'visibility-attempt', 'homepage.product.hidden');
  await add('homepage-visibility', 'staff.homepage-visibility', 'product', 'product-one', 'visibility-attempt', superAdmin);
  audit(h.sqlite, 'order', 'order-one', 'fulfillment-dispatch', 'order.dispatch');
  await add('order-fulfillment', 'staff.order-fulfillment', 'order', 'order-one', 'fulfillment-dispatch');
  for (const [type, id, kind] of [['order_cancellation_event', 'fulfillment-cancel', 'order-fulfillment-cancellation'], ['order_cancellation_review', 'fulfillment-review', 'order-fulfillment-cancellation-review']] as const) {
    audit(h.sqlite, 'order', 'order-one', `${id}:catalog`, 'cancellation.form_submitted', 'actor', { catalogDigest: digest, formId: 'staff.order-fulfillment', action: 'confirm' });
    if (type === 'order_cancellation_event') audit(h.sqlite, 'order', 'order-one', id, 'order.parcel_cancelled');
    await add(kind, 'staff.order-fulfillment', type, id, id);
  }
  audit(h.sqlite, 'product_review', 'review-one', 'review-moderation', 'review.hide');
  await add('review-moderation', 'staff.review-moderation', 'product_review', 'review-one', 'review-moderation');
  audit(h.sqlite, 'product_review', 'review-one', 'reply-moderation', 'review.reply_publish', 'actor', { catalogDigest: digest, replyId: 'reply-one', replyVersion: 1 });
  await add('reply-moderation', 'staff.review-moderation', 'review_reply', 'reply-one', 'reply-moderation');
  audit(h.sqlite, 'seller', 'seller-one', 'restriction-attempt:audit', 'seller.restriction.changed', 'actor', { catalogDigest: digest, mode: 'suspended', obligationMode: 'fulfill_existing' });
  await add('seller-governance', 'staff.seller-governance', 'seller', 'seller-one', 'restriction-attempt', superAdmin);
  audit(h.sqlite, 'product', 'product-one', 'product-review', 'product.published');
  await add('product-review', 'staff.product-review', 'product', 'product-one', 'product-review');
  return result;
}

void test('all sixteen programmatic history pairs require exact committed linkage and current reader authority', async () => {
  const h = await fixture();
  try {
    for (const item of await records(h)) {
      assert.equal(await authorizeFormAnswerRead(h.db, item.reader, item.answer), true, item.kind);
      for (const forged of [{ actorId: 'reader' }, { requestId: 'forged-request' }, { subjectId: 'foreign-parent' }, { id: 'forged-answer' }])
        assert.equal(await authorizeFormAnswerRead(h.db, item.reader, { ...item.answer, ...forged }), false, `${item.kind}: forged linkage`);
      const auditKey = item.kind === 'seller-governance' ? `${item.answer.requestId}:audit` :
        ['cancellation-approved','order-fulfillment-cancellation','order-fulfillment-cancellation-review'].includes(item.kind)
          ? `${item.answer.requestId}:catalog` : item.answer.requestId;
      const originalAudit = h.sqlite.prepare('SELECT action,next_json FROM audit_logs WHERE request_id=?').get(auditKey)!;
      h.sqlite.prepare("UPDATE audit_logs SET action='unrelated.action' WHERE request_id=?").run(auditKey);
      assert.equal(await authorizeFormAnswerRead(h.db, item.reader, item.answer), false, `${item.kind}: exact action`);
      h.sqlite.prepare('UPDATE audit_logs SET action=?,next_json=? WHERE request_id=?').run(String(originalAudit.action), '{malformed', auditKey);
      assert.equal(await authorizeFormAnswerRead(h.db, item.reader, item.answer), false, `${item.kind}: malformed immutable metadata`);
      h.sqlite.prepare('UPDATE audit_logs SET next_json=? WHERE request_id=?').run(String(originalAudit.next_json), auditKey);
      for (const owner of [customer, { id: 'seller-user', role: 'seller' as const }, { id: 'rider', role: 'rider' as const }])
        assert.equal(await authorizeFormAnswerRead(h.db, owner, item.answer), false, `${item.kind}: owner isolation`);
      h.sqlite.prepare("UPDATE users SET status='suspended' WHERE id=?").run(item.reader.id);
      assert.equal(await authorizeFormAnswerRead(h.db, item.reader, item.answer), false, `${item.kind}: current active reader`);
      h.sqlite.prepare("UPDATE users SET status='active' WHERE id=?").run(item.reader.id);
      assert.equal((await listStaffFormHistory(h.db, item.reader, item.kind, { subjectId: item.answer.subjectId })).items.length, 1, `${item.kind}: discovery`);
      assert.equal((await readStaffFormHistoryAnswer(h.db, item.reader, item.kind, item.answer.subjectId, item.answer.id))?.id, item.answer.id);
    }
    h.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='reader'");
    const review = await getFormAnswerById(h.db, String(h.sqlite.prepare("SELECT id FROM form_answer_sets WHERE request_id='product-review'").get()?.id)); assert.ok(review);
    assert.equal(await authorizeFormAnswerRead(h.db, staff, review), false, 'Revoked current grant rejects even a stale caller snapshot.');
    assert.equal(await authorizeFormAnswerRead(h.db, superAdmin, { ...review, formId: 'staff.unknown-future' }), false);
  } finally { h.sqlite.close(); }
});

void test('action-specific staff grants, immutable reply versions and older archived snapshots remain exact', async () => {
  const h = await fixture();
  try {
    const items = await records(h);
    const publicationAnswer = items.find((item) => item.kind === 'product-review')!.answer;
    h.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[\"product.publish\"]' WHERE user_id='reader'");
    assert.equal(await authorizeFormAnswerRead(h.db, staff, publicationAnswer), true);
    assert.ok((await availableStaffHistoryKinds(h.db, staff)).some((kind) => kind.kind === 'product-review'));
    audit(h.sqlite, 'product', 'product-one', 'product-unpublished', 'product.unpublished');
    const unpublished = await store(h, 'staff.product-review', 'product', 'product-one', 'product-unpublished');
    assert.equal(await authorizeFormAnswerRead(h.db, staff, unpublished), false);
    assert.equal(await authorizeFormAnswerRead(h.db, superAdmin, unpublished), true);
    h.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[\"refund.approve.standard\",\"product.review\"]' WHERE user_id='reader'");
    h.sqlite.exec("INSERT INTO return_request_events VALUES('high-event','return-one','high-attempt','actor','super_admin','high_value_rejected')");
    audit(h.sqlite, 'refund', 'refund-one', 'high-attempt', 'refund.high_value.rejected');
    const high = await store(h, 'staff.return-case-action', 'return_request', 'return-one', 'high-attempt');
    assert.equal(await authorizeFormAnswerRead(h.db, staff, high), false);
    assert.equal(await authorizeFormAnswerRead(h.db, superAdmin, high), true);
    const reply = items.find((item) => item.kind === 'reply-moderation')!.answer;
    h.sqlite.exec("INSERT INTO review_replies VALUES('new-reply','review-one','seller-one',2)");
    assert.equal(await authorizeFormAnswerRead(h.db, staff, reply), true, 'Older reply IDs/versions survive newer replies.');
    h.sqlite.exec("UPDATE audit_logs SET next_json='{}' WHERE request_id='reply-moderation'");
    assert.equal(await authorizeFormAnswerRead(h.db, staff, reply), false, 'Missing exact reply/version metadata rejects.');
    publication(h.sqlite, 'staff.product-review', 2, true);
    const archived = await readStaffFormHistoryAnswer(h.db, superAdmin, 'product-review', publicationAnswer.subjectId, publicationAnswer.id);
    assert.equal(archived?.answers.answers[0].label, 'Original context');
    assert.deepEqual(archived?.historicalFieldIds, ['context_note']);
  } finally { h.sqlite.close(); }
});

async function customerCancellation(h: Awaited<ReturnType<typeof fixture>>, id: string, review = false, actorId: string | null = 'customer', orderId = 'order-one', createdAt = 100) {
  h.sqlite.prepare(review ? "INSERT INTO order_cancellation_reviews VALUES(?,?,?,'rejected','actor')" : 'INSERT INTO order_cancellation_events VALUES(?,?,?)').run(id, orderId, actorId);
  audit(h.sqlite, 'order', orderId, `${id}:catalog`, 'cancellation.form_submitted', actorId, { catalogDigest: digest, formId: 'commerce.order-cancellation', action: 'confirm' });
  if (!review) audit(h.sqlite, 'order', orderId, id, 'order.parcel_cancelled', actorId);
  return store(h, 'commerce.order-cancellation', review ? 'order_cancellation_review' : 'order_cancellation_event', id, id, actorId, createdAt);
}

void test('customer cancellation exports only exact own event/review answers while staff context stays private', async () => {
  const h = await fixture();
  try {
    const staffItems = await records(h);
    const event = await customerCancellation(h, 'customer-event');
    const review = await customerCancellation(h, 'customer-review', true);
    const guest = await customerCancellation(h, 'guest-event', false, null);
    const foreign = await customerCancellation(h, 'foreign-event', false, 'foreign-customer', 'foreign-order');
    const forged = await customerCancellation(h, 'forged-event');
    h.sqlite.exec("UPDATE audit_logs SET next_json='{}' WHERE request_id='forged-event:catalog'");
    for (const answer of [event, review]) assert.equal(await authorizeFormAnswerRead(h.db, customer, answer), true);
    for (const answer of [guest, foreign, forged]) assert.equal(await authorizeFormAnswerRead(h.db, customer, answer), false);
    const exported = await collectFormAnswersForPrivacy(h.db, 'customer');
    assert.deepEqual(exported.map((answer) => answer.id).sort(), [event.id, review.id].sort());
    for (const answer of staffItems) assert.ok(!exported.some((value) => value.id === answer.answer.id));
    h.sqlite.exec("UPDATE orders SET customer_id='foreign-customer' WHERE id='order-one'");
    assert.equal(await authorizeFormAnswerRead(h.db, customer, event), false);
    assert.deepEqual(await collectFormAnswersForPrivacy(h.db, 'customer'), []);
  } finally { h.sqlite.close(); }
});

void test('settings draft history follows immutable creation audit after later publication', async () => {
  const h = await fixture();
  try {
    const item = (await records(h)).find((value) => value.kind === 'homepage-hero-settings')!;
    const formId = 'staff.homepage-hero-manager';
    const answers = validateAnswersForDefinition(FORM_REGISTRY[formId], { formId, version: 1, publishedAt: 1, fields: validateFormDraft(formId, { formId, fields }).fields }, [{ fieldId: 'context_note', value: 'Fictional original context' }]);
    await publishBusinessSettingDraft(h.db, { id: item.answer.subjectId, actorId: 'actor', expectedRevision: 1, effectiveFrom: 200, reason: 'Fictional publication reason', requestId: 'hero-publish', now: 200, form: { formId, versionId: `${formId}-v1`, answers } });
    assert.notEqual(h.sqlite.prepare('SELECT last_request_id FROM business_setting_versions WHERE id=?').get(item.answer.subjectId)?.last_request_id, item.answer.requestId);
    publication(h.sqlite, formId, 2, true);
    assert.equal((await readStaffFormHistoryAnswer(h.db, superAdmin, item.kind, item.answer.subjectId, item.answer.id))?.id, item.answer.id);
    for (const context of [{ formId: 'staff.business-settings-manager' }, { configVersionId: `${formId}-v2` }, { requestDigest: 'invalid' }]) {
      const original = String(h.sqlite.prepare('SELECT next_json FROM audit_logs WHERE request_id=?').get(item.answer.requestId)?.next_json);
      h.sqlite.prepare('UPDATE audit_logs SET next_json=? WHERE request_id=?').run(JSON.stringify({ ...JSON.parse(original), ...context }), item.answer.requestId);
      assert.equal(await authorizeFormAnswerRead(h.db, superAdmin, item.answer), false);
      h.sqlite.prepare('UPDATE audit_logs SET next_json=? WHERE request_id=?').run(original, item.answer.requestId);
    }
  } finally { h.sqlite.close(); }
});

void test('staff record history advances bounded pages across denied actions and reauthorizes each detail', async () => {
  const h = await fixture();
  try {
    h.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[\"product.publish\"]' WHERE user_id='reader'");
    audit(h.sqlite, 'product', 'product-one', 'older-published', 'product.published');
    const oldest = await store(h, 'staff.product-review', 'product', 'product-one', 'older-published', 'actor', 1);
    for (let index = 0; index < 50; index++) {
      audit(h.sqlite, 'product', 'product-one', `review-started-${index}`, 'product.review.started');
      await store(h, 'staff.product-review', 'product', 'product-one', `review-started-${index}`, 'actor', 100 + index);
    }
    const first = await listStaffFormHistory(h.db, staff, 'product-review');
    assert.deepEqual(first.items, []); assert.ok(first.nextCursor);
    const second = await listStaffFormHistory(h.db, staff, 'product-review', { cursor: first.nextCursor });
    assert.deepEqual(second.items.map((item) => item.id), [oldest.id]); assert.equal(second.nextCursor, null);
    assert.deepEqual(await listStaffFormHistory(h.db, customer, 'product-review'), { items: [], nextCursor: null });
    await assert.rejects(() => listStaffFormHistory(h.db, staff, 'product-review', { cursor: '!malformed' }), /cursor/);
    await assert.rejects(() => listStaffFormHistory(h.db, staff, 'product-review', { subjectId: ' x' }), /reference/);
    h.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='reader'");
    assert.equal(await readStaffFormHistoryAnswer(h.db, staff, 'product-review', 'product-one', oldest.id), null);
    assert.deepEqual(await listStaffFormHistory(h.db, staff, 'product-review'), { items: [], nextCursor: null });
  } finally { h.sqlite.close(); }
});

void test('customer cancellation history is bounded, archived, current-owner only and progresses over denied candidates', async () => {
  const h = await fixture();
  try {
    const older = await customerCancellation(h, 'older-customer-event', false, 'customer', 'order-one', 1);
    for (let index = 0; index < 50; index++) {
      const id = `denied-customer-${index}`;
      await customerCancellation(h, id, true, 'customer', 'order-one', 100 + index);
      h.sqlite.prepare("UPDATE audit_logs SET next_json='{}' WHERE request_id=?").run(`${id}:catalog`);
    }
    // Staff entries share the order but must not affect this form-specific candidate page.
    h.sqlite.exec("INSERT INTO order_cancellation_events VALUES('staff-event','order-one','actor')");
    audit(h.sqlite, 'order', 'order-one', 'staff-event:catalog', 'cancellation.form_submitted', 'actor', { catalogDigest: digest, formId: 'staff.order-fulfillment', action: 'confirm' });
    audit(h.sqlite, 'order', 'order-one', 'staff-event', 'order.parcel_cancelled');
    await store(h, 'staff.order-fulfillment', 'order_cancellation_event', 'staff-event', 'staff-event', 'actor', 1000);
    publication(h.sqlite, 'commerce.order-cancellation', 2, true);
    const first = await listCustomerCancellationAnswers(h.db, { customerId: 'customer', orderId: 'order-one' });
    assert.deepEqual(first.items, []); assert.ok(first.nextCursor);
    const second = await listCustomerCancellationAnswers(h.db, { customerId: 'customer', orderId: 'order-one', after: first.nextCursor });
    assert.deepEqual(second.items.map((item) => item.id), [older.id]); assert.equal(second.nextCursor, null);
    assert.equal(second.items[0].answers.answers[0].label, 'Original context');
    assert.deepEqual(second.items[0].historicalFieldIds, ['context_note']);
    await assert.rejects(() => listCustomerCancellationAnswers(h.db, { customerId: 'customer', orderId: 'order-one', after: '!invalid' }), /cursor/);
    for (const input of [{ customerId: 'foreign-customer', orderId: 'order-one' }, { customerId: 'seller-user', orderId: 'order-one' }, { customerId: 'customer', orderId: 'foreign-order' }])
      assert.deepEqual(await listCustomerCancellationAnswers(h.db, input), { items: [], nextCursor: null });
    h.sqlite.exec("UPDATE users SET status='suspended' WHERE id='customer'");
    assert.deepEqual(await listCustomerCancellationAnswers(h.db, { customerId: 'customer', orderId: 'order-one' }), { items: [], nextCursor: null });
    h.sqlite.exec("UPDATE users SET status='active' WHERE id='customer'; UPDATE orders SET customer_id='foreign-customer' WHERE id='order-one'");
    assert.deepEqual(await listCustomerCancellationAnswers(h.db, { customerId: 'customer', orderId: 'order-one' }), { items: [], nextCursor: null });
  } finally { h.sqlite.close(); }
});
