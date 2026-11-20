import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildFormAnswerInsert } from '../lib/db/repositories/form-answers';
import { FORM_REGISTRY } from '../lib/forms/registry';
import type { FormId } from '../lib/forms/types';
import { validateAnswersForDefinition, validateFormDraft } from '../lib/forms/validation';
import { incentiveReportDatabase } from './helpers/incentive-report-database';

declare global {
  var sellerCaseHistoryDb: D1Database;
  var sellerCaseHistoryReact: typeof React;
}
globalThis.sellerCaseHistoryReact = React;
(globalThis as unknown as { React: typeof React }).React = React;
registerHooks({ resolve(specifier, context, nextResolve) {
  const fixture = specifier === 'cloudflare:workers'
    ? 'export const env={get DB(){return globalThis.sellerCaseHistoryDb}}'
    : specifier === '@/app/auth'
      ? 'export async function requireAuthenticatedUser(){return {userId:"seller-auth",email:"seller@example.test"}};export async function getAuthenticatedUser(){return null}'
      : specifier === 'next/navigation'
        ? 'export function notFound(){throw Error("NOT_FOUND")};export function redirect(path){throw Error("REDIRECT:"+path)};export function useRouter(){return {refresh(){}}}'
        : specifier === 'next/link'
          ? 'export default function Link({children,...props}){return globalThis.sellerCaseHistoryReact.createElement("a",props,children)}'
          : null;
  return fixture ? { url: `data:text/javascript,${fixture}`, shortCircuit: true } : nextResolve(specifier, context);
} });

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync, private readonly onRead?: (count: number) => void) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() {
    const results = this.statement.all(...this.values) as T[];
    this.onRead?.(results.length);
    return { results };
  }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

const cases = [
  { kind: 'returns', id: 'return-one', foreignId: 'return-foreign', subjectType: 'return_request',
    formId: 'seller.case-return-response', customerId: 'commerce.return-request', staffId: 'staff.return-case-action', table: 'return_request_events', parentColumn: 'return_request_id' },
  { kind: 'complaints', id: 'complaint-one', foreignId: 'complaint-foreign', subjectType: 'complaint',
    formId: 'seller.case-complaint-response', customerId: 'commerce.complaint', staffId: 'staff.complaint-case-action', table: 'complaint_events', parentColumn: 'complaint_id' },
] as const;
type Case = typeof cases[number];
type Cursor = { historyAt?: string; historyId?: string };
const fields = [{ id: 'context_note', key: 'context_note', label: 'Original seller context', type: 'short_text', required: true, order: 0, status: 'active' }];

async function fixture() {
  // Retained terminal cases existed before offer/handling/native-answer storage.
  // Insert their complete historical facts before later migrations retain them.
  const { sqlite } = await incentiveReportDatabase(async (name, legacy) => {
    if (name !== '0056_form_catalog.sql') return;
    legacy.exec(`
      INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES
        ('seller-user','seller-auth','seller@example.test','Fictional seller','active',1,1),
        ('other-seller','other-auth','other@example.test','Other seller','active',1,1),
        ('buyer',NULL,'buyer@example.test','Buyer','active',1,1),
        ('staff',NULL,'staff@example.test','Staff','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES
        ('seller-user','seller',1),('other-seller','seller',1),('buyer','customer',1),('staff','admin',1);
      INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,
        tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,
        municipality,locality,status,created_at,updated_at) VALUES
        ('seller-one','seller-user','Fictional seller','Fictional seller','Local','FIX-ONE','NONE','','Maker',
        '9800000000','seller@example.test','Madhesh','Dhanusha','Janakpur','Ward 1','approved',1,1),
        ('seller-other','other-seller','Other seller','Other seller','Local','FIX-OTHER','NONE','','Other maker',
        '9800000001','other@example.test','Madhesh','Dhanusha','Janakpur','Ward 2','approved',1,1);
      INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
        VALUES('category','fixture-category','Fixture',1,1,1,1);
      INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,
        producer,country_of_origin,materials,return_eligible,status,created_at,updated_at) VALUES
        ('product-one','seller-one','category','fixture-one','FIX-ONE','Fictional item','Fictional',100,5,'Maker','NP','Fibre',1,'published',1,1),
        ('product-other','seller-other','category','fixture-other','FIX-OTHER','Other item','Fictional',100,5,'Other maker','NP','Fibre',1,'published',1,1);
      INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,
        shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
        VALUES('order-one','HK-FICTIONAL','buyer','buyer@example.test','9811111111','delivered','en-NP','fixture','{}',200,0,200,'cod','paid',1,1);
      INSERT INTO order_items(id,order_id,product_id,seller_id,product_name_snapshot,seller_name_snapshot,sku_snapshot,
        unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,created_at) VALUES
        ('item-one','order-one','product-one','seller-one','Fictional item','Fictional seller','FIX-ONE',100,1,0,0,100,1),
        ('item-other','order-one','product-other','seller-other','Other item','Other seller','FIX-OTHER',100,1,0,0,100,1);
      INSERT INTO return_requests(id,reference_number,order_item_id,quantity,reason,detail,requested_resolution,
        status,eligibility_decision,eligibility_reason_en,seller_response,requested_at,updated_at,resolved_at) VALUES
        ('return-one','RET-FICTIONAL','item-one',1,'defective','Fictional case detail','refund','resolved','eligible','Reviewed','Recorded seller response',1,2,2),
        ('return-foreign','RET-OTHER','item-other',1,'defective','Other case','refund','resolved','eligible','Reviewed',NULL,1,2,2);
      INSERT INTO complaints(id,reference_number,order_id,order_item_id,seller_id,category,subject,detail,status,
        seller_response,created_at,updated_at,resolved_at) VALUES
        ('complaint-one','CMP-FICTIONAL','order-one','item-one','seller-one','product','Fictional complaint','Fictional case detail','closed','Recorded seller response',1,2,2),
        ('complaint-foreign','CMP-OTHER','order-one','item-other','seller-other','product','Other complaint','Other case','closed',NULL,1,2,2);
    `);
  });
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  const historyReads: number[] = [];
  const db = { prepare(sql: string) {
    return new Statement(sqlite.prepare(sql), sql.includes('a.subject_type=? AND a.subject_id=? AND a.form_id=?') && sql.includes('LIMIT 51')
      ? (count) => historyReads.push(count) : undefined);
  } } as unknown as D1Database;
  globalThis.sellerCaseHistoryDb = db;
  return { sqlite, db, historyReads };
}

function publish(sqlite: DatabaseSync, formId: FormId, version = 1, archived = false) {
  const config = validateFormDraft(formId, { formId, fields: fields.map((field) => ({ ...field, status: archived ? 'archived' : 'active' })) });
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES(?,?,?,'published',?,'Fictional publication','staff',1,'staff',1,'staff',1,?)`)
    .run(`${formId}-v${version}`, formId, version, JSON.stringify(config), `${formId}-published-${version}`);
  return { ...config, version, publishedAt: 1 };
}

async function store(h: Awaited<ReturnType<typeof fixture>>, item: Case, index: number, options: {
  formId?: FormId; parent?: string; actor?: string; value?: string;
} = {}) {
  const formId = options.formId ?? item.formId;
  if (!h.sqlite.prepare('SELECT 1 FROM form_config_versions WHERE form_id=?').get(formId)) publish(h.sqlite, formId);
  const answers = validateAnswersForDefinition(FORM_REGISTRY[formId], { ...validateFormDraft(formId, { formId, fields }), version: 1, publishedAt: 1 },
    [{ fieldId: 'context_note', value: options.value ?? `Seller historical value ${index}` }]);
  const requestId = `${formId}-request-${index}`;
  const actorId = options.actor ?? 'seller-user';
  const subjectId = options.parent ?? item.id;
  await buildFormAnswerInsert(h.db, { formId, requestId, versionId: `${formId}-v1`, subjectType: item.subjectType,
    subjectId, actorId, answers, now: 100 + index }).run();
  h.sqlite.prepare('UPDATE form_answer_sets SET id=? WHERE form_id=? AND request_id=?')
    .run(formId === item.formId ? `answer-${index}/encoded?value` : `${formId}-answer-${index}`, formId, requestId);
  if (formId === item.formId) h.sqlite.prepare(`INSERT INTO ${item.table}(id,${item.parentColumn},request_id,actor_id,actor_type,action,to_status,public_message_en,public_message_ne,created_at)
    VALUES(?,?,?,?,'seller','seller_responded',?,'Recorded seller response','Recorded seller response',?)`)
    .run(`event-${index}`, subjectId, requestId, actorId, item.kind === 'returns' ? 'resolved' : 'closed', 100 + index);
}

async function page(item: Case, cursor: Cursor = {}, id: string = item.id) {
  const Page = item.kind === 'returns'
    ? (await import('../app/seller/cases/returns/[id]/page')).default
    : (await import('../app/seller/cases/complaints/[id]/page')).default;
  const props = { params: Promise.resolve({ id }), searchParams: Promise.resolve(cursor) };
  return renderToStaticMarkup(await Page(props));
}

for (const item of cases) {
void test(`${item.kind}: terminal page shows archived seller answers without customer or staff context`, async () => {
    const h = await fixture();
    try {
      await store(h, item, 0);
      await store(h, item, 1, { formId: item.customerId, actor: 'buyer', value: 'CUSTOMER PRIVATE CONTEXT' });
      await store(h, item, 2, { formId: item.staffId, actor: 'staff', value: 'STAFF PRIVATE CONTEXT' });
      await store(h, item, 3, { parent: item.foreignId, actor: 'other-seller', value: 'OTHER CASE CONTEXT' });
      publish(h.sqlite, item.formId, 2, true);
      const html = await page(item);
      assert.match(html, /Original seller context/);
      assert.match(html, /Seller historical value 0/);
      assert.match(html, /Historical/);
      assert.match(html, /No further response is requested/);
      assert.doesNotMatch(html, /CUSTOMER PRIVATE|STAFF PRIVATE|OTHER CASE CONTEXT/);
      assert.deepEqual(h.historyReads, [1]);
    } finally { h.sqlite.close(); }
});

void test(`${item.kind}: history filters before its bounded cursor and encodes the next link`, async () => {
    const h = await fixture();
    try {
      for (let index = 0; index < 53; index++) await store(h, item, index);
      for (let index = 0; index < 60; index++) await store(h, item, index,
        { formId: index % 2 ? item.customerId : item.staffId, actor: index % 2 ? 'buyer' : 'staff', value: 'PRIVATE NEIGHBOR' });
      publish(h.sqlite, item.formId, 2, true);
      const first = await page(item);
      assert.equal((first.match(/aria-label="Submitted form answers"/g) ?? []).length, 50);
      assert.match(first, /historyAt=149&amp;historyId=answer-49%2Fencoded%3Fvalue/);
      assert.doesNotMatch(first, /Seller historical value 50|PRIVATE NEIGHBOR/);
      const second = await page(item, { historyAt: '149', historyId: 'answer-49/encoded?value' });
      assert.equal((second.match(/aria-label="Submitted form answers"/g) ?? []).length, 3);
      assert.match(second, /Seller historical value 52/);
      assert.doesNotMatch(second, /Next 50 answers|PRIVATE NEIGHBOR/);
      assert.deepEqual(h.historyReads, [51, 3]);
    } finally { h.sqlite.close(); }
});

void test(`${item.kind}: per-answer event authorization preserves a next page after fifty denials`, async () => {
    const h = await fixture();
    try {
      for (let index = 0; index < 53; index++) await store(h, item, index);
      h.sqlite.prepare(`UPDATE ${item.table} SET actor_id='other-seller' WHERE created_at<150`).run();
      const first = await page(item);
      assert.doesNotMatch(first, /Seller historical value|aria-label="Submitted form answers"/);
      assert.match(first, /historyAt=149&amp;historyId=answer-49%2Fencoded%3Fvalue/);
      const second = await page(item, { historyAt: '149', historyId: 'answer-49/encoded?value' });
      assert.match(second, /Seller historical value 52/);
      h.sqlite.prepare(`UPDATE ${item.table} SET request_id='forged-request-'||id WHERE created_at>=150`).run();
      assert.doesNotMatch(await page(item, { historyAt: '149', historyId: 'answer-49/encoded?value' }), /Seller historical value/);
    } finally { h.sqlite.close(); }
});

void test(`${item.kind}: seller ownership and malformed cursors fail before any answer query`, async () => {
    const h = await fixture();
    try {
      await store(h, item, 0);
      await assert.rejects(() => page(item, {}, item.foreignId), /NOT_FOUND/);
      for (const cursor of [{ historyAt: '100' }, { historyId: 'answer-zero' },
        { historyAt: 'abc', historyId: 'answer-zero' }, { historyAt: '-1', historyId: 'answer-zero' },
        { historyAt: '9007199254740992', historyId: 'answer-zero' },
        { historyAt: '100', historyId: ' ' }, { historyAt: '100', historyId: 'x'.repeat(192) }])
        await assert.rejects(() => page(item, cursor), /NOT_FOUND/, JSON.stringify(cursor));
      assert.deepEqual(h.historyReads, []);
      h.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='seller-user'").run();
      await assert.rejects(() => page(item), /REDIRECT:\/seller-access-denied/);
      assert.deepEqual(h.historyReads, []);
    } finally { h.sqlite.close(); }
});
}
