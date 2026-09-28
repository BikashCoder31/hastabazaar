import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildFormAnswerInsert } from '../lib/db/repositories/form-answers';
import { FORM_REGISTRY } from '../lib/forms/registry';
import type { FormId } from '../lib/forms/types';
import { validateAnswersForDefinition, validateFormDraft } from '../lib/forms/validation';

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

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,auth_subject TEXT,email TEXT,display_name TEXT,status TEXT);
    CREATE TABLE user_roles(user_id TEXT,role TEXT);
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT,status TEXT,trading_name TEXT,seller_agreement_version TEXT,seller_agreement_accepted_at INTEGER);
    CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT);
    CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,seller_id TEXT,product_name_snapshot TEXT,seller_name_snapshot TEXT);
    CREATE TABLE return_requests(id TEXT PRIMARY KEY,reference_number TEXT,order_item_id TEXT,quantity INTEGER,reason TEXT,detail TEXT,locale TEXT,requested_resolution TEXT,original_seal_intact INTEGER,status TEXT,responsibility TEXT,eligibility_decision TEXT,eligibility_reason_en TEXT,eligibility_reason_ne TEXT,seller_recommendation TEXT,seller_response TEXT,investigation_summary TEXT,resolution_outcome TEXT,return_shipment_reference TEXT,requested_at INTEGER,updated_at INTEGER,resolved_at INTEGER);
    CREATE TABLE refunds(id TEXT,return_request_id TEXT,status TEXT,amount_paisa INTEGER,wallet_credit_paisa INTEGER,referral_discount_paisa INTEGER,promo_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(promo_discount_paisa)='integer' AND promo_discount_paisa BETWEEN 0 AND 9007199254740991),provider_reference TEXT);
    CREATE TABLE complaints(id TEXT PRIMARY KEY,reference_number TEXT,order_id TEXT,order_item_id TEXT,seller_id TEXT,category TEXT,subject TEXT,detail TEXT,locale TEXT,priority TEXT,status TEXT,assigned_to TEXT,resolution TEXT,resolution_ne TEXT,seller_response TEXT,escalation_reason TEXT,created_at INTEGER,updated_at INTEGER,resolved_at INTEGER);
    CREATE TABLE return_request_events(id TEXT PRIMARY KEY,return_request_id TEXT,request_id TEXT,actor_id TEXT,actor_type TEXT,action TEXT,from_status TEXT,to_status TEXT,public_message_en TEXT,public_message_ne TEXT,internal_note TEXT,created_at INTEGER);
    CREATE TABLE complaint_events(id TEXT PRIMARY KEY,complaint_id TEXT,request_id TEXT,actor_id TEXT,actor_type TEXT,action TEXT,from_status TEXT,to_status TEXT,public_message_en TEXT,public_message_ne TEXT,internal_note TEXT,created_at INTEGER);
    CREATE TABLE return_evidence(id TEXT,return_request_id TEXT,original_name TEXT,mime_type TEXT,size_bytes INTEGER,uploaded_by_type TEXT,created_at INTEGER);
    INSERT INTO users VALUES('seller-user','seller-auth','seller@example.test','Fictional seller','active'),('other-seller','other-auth','other@example.test','Other seller','active'),('buyer',NULL,'buyer@example.test','Buyer','active'),('staff',NULL,'staff@example.test','Staff','active');
    INSERT INTO user_roles VALUES('seller-user','seller'),('other-seller','seller'),('buyer','customer'),('staff','admin');
    INSERT INTO seller_profiles VALUES('seller-one','seller-user','approved','Fictional seller',NULL,NULL),('seller-other','other-seller','approved','Other seller',NULL,NULL);
    INSERT INTO orders VALUES('order-one','HK-FICTIONAL');
    INSERT INTO order_items VALUES('item-one','order-one','seller-one','Fictional item','Fictional seller'),('item-other','order-one','seller-other','Other item','Other seller');
    INSERT INTO return_requests(id,reference_number,order_item_id,quantity,reason,detail,requested_resolution,status,eligibility_decision,eligibility_reason_en,seller_response) VALUES('return-one','RET-FICTIONAL','item-one',1,'defective','Fictional case detail','refund','resolved','eligible','Reviewed','Recorded seller response'),('return-foreign','RET-OTHER','item-other',1,'defective','Other case','refund','resolved','eligible','Reviewed',NULL);
    INSERT INTO complaints(id,reference_number,order_id,order_item_id,seller_id,category,subject,detail,status,seller_response) VALUES('complaint-one','CMP-FICTIONAL','order-one','item-one','seller-one','product','Fictional complaint','Fictional case detail','closed','Recorded seller response'),('complaint-foreign','CMP-OTHER','order-one','item-other','seller-other','product','Other complaint','Other case','closed',NULL);`);
  for (const part of readFileSync(new URL('../drizzle/0056_form_catalog.sql', import.meta.url), 'utf8').split('--> statement-breakpoint'))
    if (part.trim()) sqlite.exec(part);
  const historyReads: number[] = [];
  const db = { prepare(sql: string) {
    return new Statement(sqlite.prepare(sql), sql.includes('FROM form_answer_sets a') && sql.includes('LIMIT 51')
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

async function store(h: ReturnType<typeof fixture>, item: Case, index: number, options: {
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
  if (formId === item.formId) h.sqlite.prepare(`INSERT INTO ${item.table}(id,${item.parentColumn},request_id,actor_id,actor_type,action,created_at)
    VALUES(?,?,?,?,'seller','seller_responded',?)`).run(`event-${index}`, subjectId, requestId, actorId, 100 + index);
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
    const h = fixture();
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
    const h = fixture();
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
    const h = fixture();
    try {
      for (let index = 0; index < 53; index++) await store(h, item, index);
      h.sqlite.prepare(`UPDATE ${item.table} SET actor_id='other-seller' WHERE created_at<150`).run();
      const first = await page(item);
      assert.doesNotMatch(first, /Seller historical value|aria-label="Submitted form answers"/);
      assert.match(first, /historyAt=149&amp;historyId=answer-49%2Fencoded%3Fvalue/);
      const second = await page(item, { historyAt: '149', historyId: 'answer-49/encoded?value' });
      assert.match(second, /Seller historical value 52/);
      h.sqlite.prepare(`UPDATE ${item.table} SET request_id='forged-request' WHERE created_at>=150`).run();
      assert.doesNotMatch(await page(item, { historyAt: '149', historyId: 'answer-49/encoded?value' }), /Seller historical value/);
    } finally { h.sqlite.close(); }
});

void test(`${item.kind}: seller ownership and malformed cursors fail before any answer query`, async () => {
    const h = fixture();
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
