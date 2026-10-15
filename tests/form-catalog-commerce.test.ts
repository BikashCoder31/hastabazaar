import { seedVerifiedCheckoutContact } from './helpers/checkout-contact';
import type { FixtureBrowser } from './helpers/browser-fixture-types';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';

import { parseCheckoutInput } from '../lib/checkout/validation';
import { issueGiftCard, redeemGiftCard } from '../lib/db/repositories/gift-cards';
import { createCustomerReturnRequest } from '../lib/db/repositories/returns';
import { respondToReturnAsSeller } from '../lib/db/repositories/returns';
import { createCustomerComplaint, respondToComplaintAsSeller } from '../lib/db/repositories/complaints';
import { createCodOrder } from '../lib/db/repositories/orders';
import { getDeliveryRates } from '../lib/db/repositories/delivery-rates';
import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';
import { build } from 'esbuild';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { authorizeFormAnswerRead } from '../lib/forms/access';
import { collectFormAnswersForPrivacy } from '../lib/forms/privacy';
import type { StoredFormAnswer } from '../lib/db/repositories/form-answers';

declare global {
  var commerceCheckoutActor: { userId: string; authSubject: string; email: string } | undefined;
  var commerceCatalogDb: D1Database;
  var commerceCatalogMediaLog: { puts: string[]; deletes: string[] } | undefined;
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {get DB(){return globalThis.commerceCatalogDb},MEDIA:{async put(key){globalThis.commerceCatalogMediaLog?.puts.push(key)},async delete(key){globalThis.commerceCatalogMediaLog?.deletes.push(key)}}}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: 'data:text/javascript,export class StaffAuthorizationError extends Error {constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(){return {id:"sa",role:"super_admin",permissions:[]}}', shortCircuit: true };
  if (specifier === '@/lib/auth/customer') return { url: 'data:text/javascript,export class CustomerAuthorizationError extends Error {constructor(message,status){super(message);this.status=status}};export async function requireCustomerApi(){return {userId:"buyer",email:"buyer@example.test"}};export async function requireExistingCustomerApi(){if(globalThis.commerceCheckoutActor)return globalThis.commerceCheckoutActor;throw new CustomerAuthorizationError("Authentication is required.",401)};export async function getCustomerUser(){return globalThis.commerceCheckoutActor??null}', shortCircuit: true };
  if (specifier === '@/lib/auth/seller') return { url: 'data:text/javascript,export class SellerAuthorizationError extends Error {constructor(message,status){super(message);this.status=status}};export async function requireSellerApi(){return {sellerId:"seller-profile",userId:"seller"}}', shortCircuit: true };
  if (specifier === '@/lib/cart/session') return { url: 'data:text/javascript,export const RECEIPT_COOKIE="hastabazaar_receipt";export const CART_COOKIE="hastabazaar_cart";export function readCookie(request,name){return request.headers.get("cookie")?.match(new RegExp(name+"=([^;]+)"))?.[1]??null};export async function hashOpaqueToken(value){return value};export function receiptCookie(){return "receipt=test"}', shortCircuit: true };
  if (specifier === '@/lib/email/send-order-updates') return { url: 'data:text/javascript,export async function sendPendingOrderUpdates(){}', shortCircuit: true };
  if (specifier === '@/lib/analytics/request') return { url: 'data:text/javascript,export async function recordRequestTrafficEvent(){return {}}', shortCircuit: true };
  return nextResolve(specifier, context);
} });

function checkoutInput() {
  return {
    customerEmail: 'buyer@example.test', customerPhone: '9811111111',
    deliveryFor: 'self', locale: 'en-NP', termsAccepted: true,
    idempotencyKey: 'aa70a0bd-c6df-4367-9891-081bec7e36d2', deliveryRateVersion: 'rate-v1',
    address: { recipientName: 'Maya Buyer', phone: '9811111111',
      province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu',
      locality: 'Test locality' },
  };
}

void test('checkout parser carries a versioned custom answer envelope without changing core facts', () => {
  const customAnswers = [{ fieldId: 'gift_note', value: 'Please wrap it' }];
  const parsed = parseCheckoutInput({ ...checkoutInput(), formVersion: 2, customAnswers });
  assert.ok(parsed.value, parsed.errors.join(' '));
  assert.equal(parsed.value.formVersion, 2);
  assert.deepEqual(parsed.value.customAnswers, customAnswers);
  assert.equal(parsed.value.customerEmail, 'buyer@example.test');
  assert.equal(parsed.value.termsAccepted, true);
});

void test('five commerce adapters expose custom context while protecting domain controls', () => {
  const required = {
    'commerce.checkout': ['customerEmail', 'customerPhone', 'address', 'termsAccepted', 'idempotencyKey'],
    'commerce.return-request': ['orderItemId', 'reason', 'evidence', 'idempotencyKey'],
    'commerce.complaint': ['orderItemId', 'category', 'subject', 'detail', 'idempotencyKey'],
    'commerce.gift-card-issue': ['amount', 'requestId'],
    'commerce.gift-card-redeem': ['code', 'requestId'],
  } as const;
  for (const [id, keys] of Object.entries(required)) {
    const definition = FORM_REGISTRY[id];
    assert.equal(definition.adapterId, id);
    assert.ok(definition.capabilities.customFieldTypes.includes('short_text'));
    for (const key of keys) assert.equal(definition.baseFields.find((field) => field.key === key)?.capability,
      'protected', `${id}:${key}`);
  }
});

void test('seller case response adapters protect decision and case ownership', () => {
  for (const id of ['seller.case-return-response', 'seller.case-complaint-response']) {
    const definition = FORM_REGISTRY[id];
    assert.equal(definition.adapterId, id);
    assert.ok(definition.capabilities.customFieldTypes.includes('short_text'));
    for (const key of ['response', 'idempotencyKey', 'sellerId', 'actorId', 'formVersion'])
      assert.equal(definition.baseFields.find((field) => field.key === key)?.capability, 'protected');
  }
  assert.equal(FORM_REGISTRY['seller.case-return-response'].baseFields.find(
    (field) => field.key === 'recommendation')?.capability, 'protected');
});

function accessAnswer(formId: string, subjectType: string, subjectId: string,
  requestId: string, actorId: string | null): StoredFormAnswer {
  return { formId, subjectType, subjectId, requestId, actorId } as StoredFormAnswer;
}

void test('commerce answer access follows the exact parent, signed-in owner and gift role', async () => {
  const { sqlite, db, now } = caseDatabase(false);
  try {
    sqlite.prepare("UPDATE orders SET customer_id='buyer' WHERE id='order'").run();
    const customer = { id: 'buyer', role: 'customer' as const };
    const staff = { id: 'sa', role: 'super_admin' as const };
    const checkout = accessAnswer('commerce.checkout', 'order', 'order', 'pay-1', 'buyer');
    assert.equal(await authorizeFormAnswerRead(db, customer, checkout), true);
    assert.equal(await authorizeFormAnswerRead(db, customer,
      { ...checkout, requestId: 'wrong' }), false);
    assert.equal(await authorizeFormAnswerRead(db, customer,
      { ...checkout, subjectType: 'complaint' }), false);
    sqlite.prepare("UPDATE orders SET customer_id=NULL WHERE id='order'").run();
    assert.equal(await authorizeFormAnswerRead(db, customer, checkout), false,
      'receipt-token ownership must never reveal private answers');
    sqlite.prepare("UPDATE orders SET customer_id='buyer' WHERE id='order'").run();
    const returned = await createCustomerReturnRequest(db, { orderNumber: 'HK-TEST',
      receiptTokenHash: 'receipt-hash', customerId: 'buyer', orderItemId: 'item', quantity: 1,
      reason: 'defective', requestedResolution: 'refund', detail: 'The item has a manufacturing defect.',
      locale: 'en-NP', idempotencyKey: 'case-access-return', evidence: [], now });
    const complained = await createCustomerComplaint(db, { orderNumber: 'HK-TEST',
      receiptTokenHash: 'receipt-hash', customerId: 'buyer', orderItemId: 'item',
      category: 'product', subject: 'Damaged box',
      detail: 'The delivered box was damaged when it arrived.', locale: 'en-NP',
      requestId: 'case-access-complaint', now });
    assert.equal(await authorizeFormAnswerRead(db, customer,
      accessAnswer('commerce.return-request', 'return_request', returned.id, 'case-access-return', 'buyer')), true);
    assert.equal(await authorizeFormAnswerRead(db, staff,
      accessAnswer('commerce.complaint', 'complaint', complained.id, 'case-access-complaint', 'buyer')), true);
    assert.equal(await authorizeFormAnswerRead(db, customer,
      accessAnswer('commerce.complaint', 'complaint', complained.id, 'wrong', 'buyer')), false);
    const issued = await issueGiftCard(db, { actorId: 'sa', amountPaisa: 12500,
      requestId: 'issue-access-1', now: now + 1 });
    await redeemGiftCard(db, { userId: 'buyer', code: issued.code!,
      requestId: 'redeem-access-1', now: now + 2 });
    const issue = accessAnswer('commerce.gift-card-issue', 'gift_card_issue', issued.id,
      'issue-access-1', 'sa');
    const redeem = accessAnswer('commerce.gift-card-redeem', 'gift_card_redemption', issued.id,
      'redeem-access-1', 'buyer');
    assert.equal(await authorizeFormAnswerRead(db, staff, issue), true);
    assert.equal(await authorizeFormAnswerRead(db, customer, issue), false);
    assert.equal(await authorizeFormAnswerRead(db, customer, redeem), true);
    assert.equal(await authorizeFormAnswerRead(db, staff, redeem), false);
  } finally { sqlite.close(); }
});

void test('privacy export separates customer aftercare, gift issuance and gift redemption', async () => {
  const { sqlite, db, now } = caseDatabase();
  try {
    sqlite.prepare("UPDATE orders SET customer_id='buyer' WHERE id='order'").run();
    await createCustomerReturnRequest(db, { orderNumber: 'HK-TEST', receiptTokenHash: 'receipt-hash',
      customerId: 'buyer', orderItemId: 'item', quantity: 1, reason: 'defective',
      requestedResolution: 'refund', detail: 'The item has a manufacturing defect.',
      locale: 'en-NP', idempotencyKey: 'privacy-return-1', evidence: [], now,
      form: giftForm('commerce.return-request', 'Customer return context') });
    await createCustomerComplaint(db, { orderNumber: 'HK-TEST', receiptTokenHash: 'receipt-hash',
      customerId: 'buyer', orderItemId: 'item', category: 'product', subject: 'Damaged box',
      detail: 'The delivered box was damaged when it arrived.', locale: 'en-NP',
      requestId: 'privacy-complaint-1', now,
      form: giftForm('commerce.complaint', 'Customer complaint context') });
    const issued = await issueGiftCard(db, { actorId: 'sa', amountPaisa: 12500,
      requestId: 'privacy-issue-1', now: now + 1,
      form: giftForm('commerce.gift-card-issue', 'Private issuer context') });
    await redeemGiftCard(db, { userId: 'buyer', code: issued.code!,
      requestId: 'privacy-redeem-1', now: now + 2,
      form: giftForm('commerce.gift-card-redeem', 'Private redeemer context') });
    const buyer = await collectFormAnswersForPrivacy(db, 'buyer');
    const issuer = await collectFormAnswersForPrivacy(db, 'sa');
    assert.deepEqual(buyer.map((answer) => answer.formId).sort(),
      ['commerce.complaint', 'commerce.gift-card-redeem', 'commerce.return-request']);
    assert.deepEqual(issuer.map((answer) => answer.formId), ['commerce.gift-card-issue']);
  } finally { sqlite.close(); }
});

function giftDatabase(custom = true) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync('drizzle').filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  for (const [id, role] of [['sa', 'super_admin'], ['buyer', 'customer']] as const) {
    sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,?,'en-NP','active',1,1)")
      .run(id, id, `${id}@example.test`, id);
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').run(id, role);
  }
  for (const formId of ['commerce.gift-card-issue', 'commerce.gift-card-redeem']) {
    const field = { id: 'context_note', key: 'context_note', label: 'Context note',
      type: 'short_text', required: true, order: 0, status: 'active' };
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?,?,1,1,'published',?,'test','sa',1,'sa',1,'sa',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: custom ? [field] : [] }), `seed-${formId}`);
  }
  const db = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      const statement = sqlite.prepare(sql);
      return {
        bind(...next: SQLInputValue[]) { values = next; return this; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  return { sqlite, db };
}

function giftForm(formId: string, value: string) {
  return { versionId: `${formId}-v1`, answers: { formId, version: 1,
    answers: [{ fieldId: 'context_note', label: 'Context note', type: 'short_text' as const, value }] } };
}

void test('gift issue and redemption store only their own answer beside the committed financial action', async () => {
  const { sqlite, db } = giftDatabase();
  try {
    const issued = await issueGiftCard(db, { actorId: 'sa', amountPaisa: 12500,
      requestId: 'issue-001', now: 3, form: giftForm('commerce.gift-card-issue', 'Festival gift') });
    assert.ok(issued.code);
    await redeemGiftCard(db, { userId: 'buyer', code: issued.code, requestId: 'redeem-001', now: 4,
      form: giftForm('commerce.gift-card-redeem', 'Thank you') });
    const rows = sqlite.prepare('SELECT form_id,request_id,subject_type,subject_id,actor_id FROM form_answer_sets ORDER BY created_at').all().map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { form_id: 'commerce.gift-card-issue', request_id: 'issue-001', subject_type: 'gift_card_issue', subject_id: issued.id, actor_id: 'sa' },
      { form_id: 'commerce.gift-card-redeem', request_id: 'redeem-001', subject_type: 'gift_card_redemption', subject_id: issued.id, actor_id: 'buyer' },
    ]);
    assert.equal((await issueGiftCard(db, { actorId: 'sa', amountPaisa: 12500, requestId: 'issue-001', now: 3,
      form: giftForm('commerce.gift-card-issue', 'Festival gift') })).duplicate, true);
    await assert.rejects(() => issueGiftCard(db, { actorId: 'sa', amountPaisa: 12500,
      requestId: 'issue-001', now: 3, form: giftForm('commerce.gift-card-issue', 'Changed context') }));
    await assert.rejects(() => redeemGiftCard(db, { userId: 'buyer', code: issued.code!,
      requestId: 'redeem-001', now: 4, form: giftForm('commerce.gift-card-redeem', 'Changed context') }));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 2);
    await assert.rejects(() => issueGiftCard(db, { actorId: 'sa', amountPaisa: 0, requestId: 'issue-bad', now: 5,
      form: giftForm('commerce.gift-card-issue', 'Bad') }));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 2);
  } finally { sqlite.close(); }
});

function caseDatabase(custom = true) {
  const { sqlite, db } = giftDatabase();
  const now = 1_788_672_000_000;
  sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES ('seller','seller','seller@example.test','Seller','en-NP','active',1,1)").run();
  sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('seller','seller',1)").run();
  sqlite.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,approved_at,created_at,updated_at)
    VALUES ('seller-profile','seller','Seller','Shop','Local','REG-1','PAN','PAN-1','Seller','9800000000','seller@example.test','Madhesh','Dhanusha','Janakpur','Ward 1','BANK','approved',1,1,1)`).run();
  sqlite.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','test','Test',1,1,1,1)").run();
  sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
    VALUES ('product','seller-profile','cat','product','product','Product','Description',100000,10,'Maker','NP','Fibre',1,'published',1,1)`).run();
  const policy = { generalRequestWindowDays: 7, sealedGoodsWindowDays: 15,
    deliveryDamageEvidenceWindowHours: 48, changeOfMindEnabled: true,
    highValueRefundThresholdPaisa: 1_000_000, refundInitiationBusinessDays: 2,
    codRefundEstimateBusinessDays: [3, 7] };
  sqlite.prepare(`INSERT INTO orders(id,order_number,receipt_token_hash,customer_email,customer_phone,status,locale,currency,policy_version,return_policy_snapshot_json,shipping_address_json,item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,delivered_at,created_at,updated_at)
    VALUES ('order','HK-TEST','receipt-hash','buyer@example.test','9811111111','delivered','en-NP','NPR','phase-1.0',?,'{}',100000,0,15000,0,0,115000,'cod','paid',?,?,?,?)`)
    .run(JSON.stringify(policy), now - 86400000, now - 3600000, now, now);
  sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,seller_discount_paisa,commission_bps,commission_paisa,tax_paisa,line_total_paisa,return_eligible_snapshot,fulfillment_status,created_at)
    VALUES ('item','order','product','seller-profile','Shop','Product','product',100000,1,0,1200,12000,0,100000,1,'delivered',?)`).run(now);
  sqlite.prepare("INSERT INTO payments(id,order_id,provider,method,status,amount_paisa,currency,idempotency_key,created_at,updated_at) VALUES ('pay','order','manual_cod','cod','captured',115000,'NPR','pay-1',?,?)").run(now, now);
  for (const formId of ['commerce.return-request', 'commerce.complaint',
    'seller.case-return-response', 'seller.case-complaint-response']) {
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?,?,1,1,'published',?,'test','sa',1,'sa',1,'sa',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: custom ? [{ id: 'context_note', key: 'context_note', label: 'Context note', type: 'short_text', required: true, order: 0, status: 'active' }] : [] }), `seed-${formId}`);
  }
  return { sqlite, db, now };
}

void test('return and complaint answers attach to their exact cases and duplicate attempts do not add answers', async () => {
  const { sqlite, db, now } = caseDatabase();
  try {
    const retOptions = { orderNumber: 'HK-TEST', receiptTokenHash: 'receipt-hash',
      orderItemId: 'item', quantity: 1, reason: 'defective' as const,
      requestedResolution: 'refund' as const, detail: 'The item has a manufacturing defect.',
      locale: 'en-NP' as const, idempotencyKey: 'return-001', evidence: [], now,
      form: giftForm('commerce.return-request', 'Box was torn') };
    const returned = await createCustomerReturnRequest(db, retOptions);
    const complaintOptions = { orderNumber: 'HK-TEST', receiptTokenHash: 'receipt-hash',
      orderItemId: 'item', category: 'product' as const, subject: 'Damaged box',
      detail: 'The delivered box was damaged when it arrived.', locale: 'en-NP' as const,
      requestId: 'complaint-001', now, form: giftForm('commerce.complaint', 'Call after noon') };
    const complained = await createCustomerComplaint(db, complaintOptions);
    const answers = sqlite.prepare('SELECT form_id,request_id,subject_type,subject_id FROM form_answer_sets WHERE subject_type IN (?,?) ORDER BY form_id DESC')
      .all('return_request', 'complaint').map((row) => ({ ...row }));
    assert.deepEqual(answers, [
      { form_id: 'commerce.return-request', request_id: 'return-001', subject_type: 'return_request', subject_id: returned.id },
      { form_id: 'commerce.complaint', request_id: 'complaint-001', subject_type: 'complaint', subject_id: complained.id },
    ]);
    assert.equal((await createCustomerReturnRequest(db, retOptions)).duplicate, true);
    assert.equal((await createCustomerComplaint(db, complaintOptions)).duplicate, true);
    await assert.rejects(() => createCustomerReturnRequest(db, { ...retOptions,
      form: giftForm('commerce.return-request', 'Different explanation') }));
    await assert.rejects(() => createCustomerReturnRequest(db, { ...retOptions,
      reason: 'wrong_item' }));
    await assert.rejects(() => createCustomerComplaint(db, { ...complaintOptions,
      form: giftForm('commerce.complaint', 'Different explanation') }));
    await assert.rejects(() => createCustomerComplaint(db, { ...complaintOptions,
      detail: 'A completely different complaint about this order.' }));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE subject_type IN ('return_request','complaint')").get()?.n, 2);
  } finally { sqlite.close(); }
});

void test('return replay binds evidence bytes and metadata despite fresh private object IDs', async () => {
  const { sqlite, db, now } = caseDatabase(false);
  try {
    const evidence = (id: string, sha256: string, originalName = 'photo.png',
      mimeType = 'image/png', sizeBytes = 4) => ({
      id, objectKey: `private/return-evidence/${id}`, originalName,
      mimeType, sizeBytes, sha256,
    });
    const options = { orderNumber: 'HK-TEST', receiptTokenHash: 'receipt-hash',
      orderItemId: 'item', quantity: 1, reason: 'defective' as const,
      requestedResolution: 'refund' as const, detail: 'The item has a manufacturing defect.',
      locale: 'en-NP' as const, idempotencyKey: 'return-evidence-replay', now,
      evidence: [evidence('first-id', 'a'.repeat(64))] };
    const created = await createCustomerReturnRequest(db, options);
    assert.equal((await createCustomerReturnRequest(db, { ...options,
      evidence: [evidence('retry-id', 'a'.repeat(64))] })).duplicate, true);
    for (const changed of [
      [evidence('retry-id-2', 'b'.repeat(64))],
      [evidence('retry-id-3', 'a'.repeat(64), 'different.png')],
      [evidence('retry-id-4', 'a'.repeat(64), 'photo.png', 'image/jpeg')],
      [evidence('retry-id-5', 'a'.repeat(64), 'photo.png', 'image/png', 5)],
      [],
    ]) await assert.rejects(() => createCustomerReturnRequest(db, { ...options,
      evidence: changed }), /different return details/i);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM return_evidence WHERE return_request_id=?')
      .get(created.id)?.n, 1);
  } finally { sqlite.close(); }
});

void test('seller case responses commit their own answer and reject changed or unauthorized replay', async () => {
  const { sqlite, db, now } = caseDatabase();
  try {
    const returned = await createCustomerReturnRequest(db, { orderNumber: 'HK-TEST',
      receiptTokenHash: 'receipt-hash', orderItemId: 'item', quantity: 1,
      reason: 'defective', requestedResolution: 'refund',
      detail: 'The item has a manufacturing defect.', locale: 'en-NP',
      idempotencyKey: 'seller-case-parent-return', evidence: [], now });
    const complained = await createCustomerComplaint(db, { orderNumber: 'HK-TEST',
      receiptTokenHash: 'receipt-hash', orderItemId: 'item', category: 'product',
      subject: 'Damaged box', detail: 'The delivered box was damaged when it arrived.',
      locale: 'en-NP', requestId: 'seller-case-parent-complaint', now });
    const ret = { returnRequestId: returned.id, sellerId: 'seller-profile', actorId: 'seller',
      recommendation: 'accept' as const, response: 'I inspected the packing record and accept this return.',
      locale: 'en-NP' as const, requestId: 'seller-case-response-return', now: now + 1,
      form: giftForm('seller.case-return-response', 'Seller return context') };
    const complaint = { complaintId: complained.id, sellerId: 'seller-profile', actorId: 'seller',
      response: 'I inspected the packing record and will help resolve this.',
      requestId: 'seller-case-response-complaint', now: now + 1,
      form: giftForm('seller.case-complaint-response', 'Seller complaint context') };
    await respondToReturnAsSeller(db, ret);
    await respondToComplaintAsSeller(db, complaint);
    assert.deepEqual(sqlite.prepare(`SELECT form_id,subject_type,subject_id FROM form_answer_sets
      WHERE form_id LIKE 'seller.case-%' ORDER BY form_id`).all().map((row) => ({ ...row })), [
      { form_id: 'seller.case-complaint-response', subject_type: 'complaint', subject_id: complained.id },
      { form_id: 'seller.case-return-response', subject_type: 'return_request', subject_id: returned.id },
    ]);
    await respondToReturnAsSeller(db, ret);
    await respondToComplaintAsSeller(db, complaint);
    await assert.rejects(() => respondToReturnAsSeller(db, { ...ret,
      recommendation: 'contest' }));
    await assert.rejects(() => respondToComplaintAsSeller(db, { ...complaint,
      form: giftForm('seller.case-complaint-response', 'Changed context') }));
    await assert.rejects(() => respondToReturnAsSeller(db, { ...ret, actorId: 'buyer' }));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id LIKE 'seller.case-%'").get()?.n, 2);
    sqlite.prepare("UPDATE orders SET customer_id='buyer' WHERE id='order'").run();
    const sellerViewer = { id: 'seller', role: 'seller' as const };
    const buyerViewer = { id: 'buyer', role: 'customer' as const };
    const returnAnswer = accessAnswer('seller.case-return-response', 'return_request', returned.id,
      ret.requestId, 'seller');
    const complaintAnswer = accessAnswer('seller.case-complaint-response', 'complaint', complained.id,
      complaint.requestId, 'seller');
    assert.equal(await authorizeFormAnswerRead(db, sellerViewer, returnAnswer), true);
    assert.equal(await authorizeFormAnswerRead(db, sellerViewer, complaintAnswer), true);
    assert.equal(await authorizeFormAnswerRead(db, buyerViewer, returnAnswer), false);
    assert.equal(await authorizeFormAnswerRead(db, buyerViewer, complaintAnswer), false);
    assert.equal(await authorizeFormAnswerRead(db, sellerViewer,
      { ...returnAnswer, requestId: 'unrelated' }), false);
    assert.deepEqual((await collectFormAnswersForPrivacy(db, 'seller')).map((answer) => answer.formId).sort(),
      ['seller.case-complaint-response', 'seller.case-return-response']);
    assert.deepEqual((await collectFormAnswersForPrivacy(db, 'buyer')).map((answer) => answer.formId), []);
  } finally { sqlite.close(); }
});

void test('seller case routes require a published answer before changing either case', async () => {
  const { sqlite, db, now } = caseDatabase(false);
  globalThis.commerceCatalogDb = db;
  try {
    const returned = await createCustomerReturnRequest(db, { orderNumber: 'HK-TEST',
      receiptTokenHash: 'receipt-hash', orderItemId: 'item', quantity: 1,
      reason: 'defective', requestedResolution: 'refund',
      detail: 'The item has a manufacturing defect.', locale: 'en-NP',
      idempotencyKey: 'seller-route-parent-return', evidence: [], now });
    const complained = await createCustomerComplaint(db, { orderNumber: 'HK-TEST',
      receiptTokenHash: 'receipt-hash', orderItemId: 'item', category: 'product',
      subject: 'Damaged box', detail: 'The delivered box was damaged when it arrived.',
      locale: 'en-NP', requestId: 'seller-route-parent-complaint', now });
    const retRoute = await import('../app/api/seller/returns/[id]/response/route');
    const complaintRoute = await import('../app/api/seller/complaints/[id]/response/route');
    const request = (path: string, body: unknown) => new Request(`http://localhost:3000${path}`, {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const ret = await retRoute.POST(request(`/api/seller/returns/${returned.id}/response`, {
      recommendation: 'accept', response: 'I inspected the packing record and accept this return.',
      locale: 'en-NP', idempotencyKey: 'seller-route-return-1',
    }), { params: Promise.resolve({ id: returned.id }) });
    const complaint = await complaintRoute.POST(request(`/api/seller/complaints/${complained.id}/response`, {
      response: 'I inspected the packing record and will help resolve this.',
      idempotencyKey: 'seller-route-complaint-1',
    }), { params: Promise.resolve({ id: complained.id }) });
    assert.equal(ret.status, 400);
    assert.equal(complaint.status, 400);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id LIKE 'seller.case-%'").get()?.n, 0);
    const stale = await retRoute.POST(request(`/api/seller/returns/${returned.id}/response`, {
      recommendation: 'accept', response: 'I inspected the packing record and accept this return.',
      locale: 'en-NP', idempotencyKey: 'seller-route-return-1', formVersion: 2,
      customAnswers: [],
    }), { params: Promise.resolve({ id: returned.id }) });
    assert.equal(stale.status, 409);
    const savedReturn = await retRoute.POST(request(`/api/seller/returns/${returned.id}/response`, {
      recommendation: 'accept', response: 'I inspected the packing record and accept this return.',
      locale: 'en-NP', idempotencyKey: 'seller-route-return-1', formVersion: 1,
      customAnswers: [],
    }), { params: Promise.resolve({ id: returned.id }) });
    const savedComplaint = await complaintRoute.POST(request(`/api/seller/complaints/${complained.id}/response`, {
      response: 'I inspected the packing record and will help resolve this.',
      idempotencyKey: 'seller-route-complaint-1', formVersion: 1, customAnswers: [],
    }), { params: Promise.resolve({ id: complained.id }) });
    assert.equal(savedReturn.status, 200);
    assert.equal(savedComplaint.status, 200);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id LIKE 'seller.case-%'").get()?.n, 2);
  } finally { sqlite.close(); }
});

void test('failed aftercare actions and invalid answer snapshots do not leave cases or answers', async () => {
  const { sqlite, db, now } = caseDatabase();
  try {
    const base = { orderNumber: 'HK-TEST', receiptTokenHash: 'receipt-hash',
      orderItemId: 'item', quantity: 1, reason: 'defective' as const,
      requestedResolution: 'refund' as const, detail: 'The item has a manufacturing defect.',
      locale: 'en-NP' as const, idempotencyKey: 'return-bad-1', evidence: [], now };
    await assert.rejects(() => createCustomerReturnRequest(db, { ...base, quantity: 2,
      form: giftForm('commerce.return-request', 'Context') }));
    await assert.rejects(() => createCustomerReturnRequest(db, { ...base,
      form: { ...giftForm('commerce.return-request', 'Context'), versionId: 'wrong-version' } }));
    await assert.rejects(() => createCustomerComplaint(db, {
      orderNumber: 'OTHER', receiptTokenHash: 'receipt-hash', orderItemId: 'item',
      category: 'product', subject: 'Damaged box', detail: 'The delivered box arrived damaged.',
      locale: 'en-NP', requestId: 'complaint-bad-1', now,
      form: giftForm('commerce.complaint', 'Context') }));
    for (const table of ['return_requests', 'complaints', 'form_answer_sets'])
      assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n, 0);
  } finally { sqlite.close(); }
});

void test('zero-row aftercare inserts roll back their answers instead of reporting success', async () => {
  const { sqlite, db, now } = caseDatabase();
  try {
    sqlite.exec("CREATE TRIGGER ignore_return BEFORE INSERT ON return_requests BEGIN SELECT RAISE(IGNORE); END");
    sqlite.exec("CREATE TRIGGER ignore_complaint BEFORE INSERT ON complaints BEGIN SELECT RAISE(IGNORE); END");
    await assert.rejects(() => createCustomerReturnRequest(db, {
      orderNumber: 'HK-TEST', receiptTokenHash: 'receipt-hash', orderItemId: 'item',
      quantity: 1, reason: 'defective', requestedResolution: 'refund',
      detail: 'The item has a manufacturing defect.', locale: 'en-NP',
      idempotencyKey: 'ignored-return', evidence: [], now,
      form: giftForm('commerce.return-request', 'Box was torn'),
    }));
    await assert.rejects(() => createCustomerComplaint(db, {
      orderNumber: 'HK-TEST', receiptTokenHash: 'receipt-hash', orderItemId: 'item',
      category: 'product', subject: 'Damaged box',
      detail: 'The delivered box was damaged when it arrived.', locale: 'en-NP',
      requestId: 'ignored-complaint', now,
      form: giftForm('commerce.complaint', 'Call after noon'),
    }));
    for (const table of ['return_requests', 'complaints', 'form_answer_sets'])
      assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n, 0);
  } finally { sqlite.close(); }
});

void test('gift issuance route rejects an unversioned request before issuing credit', async () => {
  const { sqlite, db } = giftDatabase();
  globalThis.commerceCatalogDb = db;
  try {
    const route = await import('../app/api/admin/gift-cards/route');
    const response = await route.POST(new Request('http://localhost:3000/api/admin/gift-cards', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'issue-route-1', amount: '125.00' }),
    }));
    assert.equal(response.status, 400);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM gift_cards').get()?.n, 0);
  } finally { sqlite.close(); }
});

void test('gift issuance route links a versioned answer to the issued card', async () => {
  const { sqlite, db } = giftDatabase(false);
  globalThis.commerceCatalogDb = db;
  try {
    const route = await import('../app/api/admin/gift-cards/route');
    const response = await route.POST(new Request('http://localhost:3000/api/admin/gift-cards', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'issue-route-2', amount: '125.00',
        formVersion: 1, customAnswers: [] }),
    }));
    assert.equal(response.status, 201);
    const issued = await response.json() as { id: string };
    const answer = sqlite.prepare("SELECT subject_id,form_id,request_id FROM form_answer_sets WHERE request_id='issue-route-2'").get();
    assert.equal(answer?.subject_id, issued.id);
    assert.equal(answer?.form_id, 'commerce.gift-card-issue');
  } finally { sqlite.close(); }
});

void test('gift redemption route requires a version and links only redeemer answers', async () => {
  const { sqlite, db } = giftDatabase(false);
  globalThis.commerceCatalogDb = db;
  try {
    const issued = await issueGiftCard(db, { actorId: 'sa', amountPaisa: 12500,
      requestId: 'issue-route-3', now: 1 });
    const route = await import('../app/api/account/gift-cards/route');
    const makeRequest = (body: unknown) => new Request('http://localhost:3000/api/account/gift-cards', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const missing = await route.POST(makeRequest({ requestId: 'redeem-route-1', code: issued.code }));
    assert.equal(missing.status, 400);
    assert.equal(sqlite.prepare("SELECT redeemed_by FROM gift_cards WHERE id=?").get(issued.id)?.redeemed_by, null);
    const response = await route.POST(makeRequest({ requestId: 'redeem-route-1', code: issued.code,
      formVersion: 1, customAnswers: [] }));
    assert.equal(response.status, 200);
    const answer = sqlite.prepare("SELECT subject_type,subject_id,actor_id FROM form_answer_sets WHERE form_id='commerce.gift-card-redeem'").get();
    assert.equal(answer?.subject_type, 'gift_card_redemption');
    assert.equal(answer?.subject_id, issued.id);
    assert.equal(answer?.actor_id, 'buyer');
  } finally { sqlite.close(); }
});

void test('aftercare routes require a versioned form before creating cases', async () => {
  const { sqlite, db } = caseDatabase(false);
  globalThis.commerceCatalogDb = db;
  try {
    const returns = await import('../app/orders/[orderNumber]/returns/route');
    const complaints = await import('../app/orders/[orderNumber]/complaints/route');
    const context = { params: Promise.resolve({ orderNumber: 'HK-TEST' }) };
    const form = new FormData();
    for (const [key, value] of Object.entries({ orderItemId: 'item', quantity: '1', reason: 'defective',
      requestedResolution: 'refund', detail: 'The item has a manufacturing defect.',
      locale: 'en-NP', idempotencyKey: 'return-route-1' })) form.set(key, value);
    const returned = await returns.POST(new Request('http://localhost:3000/orders/HK-TEST/returns', {
      method: 'POST', headers: { origin: 'http://localhost:3000', cookie: 'hastabazaar_receipt=receipt-hash' },
      body: form,
    }), context);
    assert.equal(returned.status, 400);
    const complained = await complaints.POST(new Request('http://localhost:3000/orders/HK-TEST/complaints', {
      method: 'POST', headers: { origin: 'http://localhost:3000', cookie: 'hastabazaar_receipt=receipt-hash',
        'content-type': 'application/json' },
      body: JSON.stringify({ orderItemId: 'item', category: 'product', subject: 'Damaged box',
        detail: 'The delivered box arrived damaged.', locale: 'en-NP', idempotencyKey: 'complaint-route-1' }),
    }), context);
    assert.equal(complained.status, 400);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM return_requests').get()?.n, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM complaints').get()?.n, 0);
  } finally { sqlite.close(); }
});

void test('versioned aftercare routes persist one answer set per authorized case', async () => {
  const { sqlite, db } = caseDatabase(false);
  globalThis.commerceCatalogDb = db;
  try {
    const returns = await import('../app/orders/[orderNumber]/returns/route');
    const complaints = await import('../app/orders/[orderNumber]/complaints/route');
    const context = { params: Promise.resolve({ orderNumber: 'HK-TEST' }) };
    const form = new FormData();
    for (const [key, value] of Object.entries({ orderItemId: 'item', quantity: '1', reason: 'defective',
      requestedResolution: 'refund', detail: 'The item has a manufacturing defect.',
      locale: 'en-NP', idempotencyKey: 'return-route-2', formVersion: '1', customAnswers: '[]' })) form.set(key, value);
    const returned = await returns.POST(new Request('http://localhost:3000/orders/HK-TEST/returns', {
      method: 'POST', headers: { origin: 'http://localhost:3000', cookie: 'hastabazaar_receipt=receipt-hash' },
      body: form,
    }), context);
    assert.equal(returned.status, 201);
    const returnCase = await returned.json() as { id: string };
    const complained = await complaints.POST(new Request('http://localhost:3000/orders/HK-TEST/complaints', {
      method: 'POST', headers: { origin: 'http://localhost:3000', cookie: 'hastabazaar_receipt=receipt-hash',
        'content-type': 'application/json' },
      body: JSON.stringify({ orderItemId: 'item', category: 'product', subject: 'Damaged box',
        detail: 'The delivered box arrived damaged.', locale: 'en-NP', idempotencyKey: 'complaint-route-2',
        formVersion: 1, customAnswers: [] }),
    }), context);
    assert.equal(complained.status, 201);
    const complaintCase = await complained.json() as { id: string };
    assert.equal(sqlite.prepare("SELECT subject_id FROM form_answer_sets WHERE form_id='commerce.return-request'").get()?.subject_id, returnCase.id);
    assert.equal(sqlite.prepare("SELECT subject_id FROM form_answer_sets WHERE form_id='commerce.complaint'").get()?.subject_id, complaintCase.id);
  } finally { sqlite.close(); }
});

void test('return route hashes validated evidence bytes and cleans retry uploads', async () => {
  const { sqlite, db } = caseDatabase(false);
  globalThis.commerceCatalogDb = db;
  globalThis.commerceCatalogMediaLog = { puts: [], deletes: [] };
  try {
    const route = await import('../app/orders/[orderNumber]/returns/route');
    const context = { params: Promise.resolve({ orderNumber: 'HK-TEST' }) };
    const post = (lastByte: number, name = 'proof.png') => {
      const form = new FormData();
      for (const [key, value] of Object.entries({ orderItemId: 'item', quantity: '1',
        reason: 'defective', requestedResolution: 'refund',
        detail: 'The item has a manufacturing defect.', locale: 'en-NP',
        idempotencyKey: 'return-route-evidence-1', formVersion: '1', customAnswers: '[]' }))
        form.set(key, value);
      form.set('evidence', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, lastByte])],
        name, { type: 'image/png' }));
      return route.POST(new Request('http://localhost:3000/orders/HK-TEST/returns', {
        method: 'POST', headers: { origin: 'http://localhost:3000',
          cookie: 'hastabazaar_receipt=receipt-hash' }, body: form,
      }), context);
    };
    assert.equal((await post(1)).status, 201);
    assert.equal((await post(1)).status, 200, 'exact bytes replay across fresh R2 IDs');
    assert.equal((await post(2)).status, 409, 'same filename and size with changed bytes');
    assert.equal((await post(1, 'different.png')).status, 409, 'name is bound too');
    assert.equal(globalThis.commerceCatalogMediaLog.puts.length, 4);
    assert.equal(globalThis.commerceCatalogMediaLog.deletes.length, 3);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM return_evidence').get()?.n, 1);
  } finally { globalThis.commerceCatalogMediaLog = undefined; sqlite.close(); }
});

void test('checkout answer joins the committed order and cannot be added by a duplicate attempt', async () => {
  const { sqlite, db, now } = caseDatabase(false);
  try {
    await seedVerifiedCheckoutContact(db, 'buyer');
    sqlite.prepare("UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=1 WHERE id='seller-profile'").run(SELLER_AGREEMENT_VERSION);
    sqlite.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','cart-hash','NPR',?,?)").run(now, now);
    sqlite.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('cart-item','cart','product',1,?,?)").run(now, now);
    const formId = 'commerce.checkout';
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?,?,1,1,'published',?,'test','sa',1,'sa',1,'sa',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [{ id: 'context_note', key: 'context_note', label: 'Context note', type: 'short_text', required: true, order: 0, status: 'active' }] }), `seed-${formId}`);
    const rates = await getDeliveryRates(db);
    const parsed = parseCheckoutInput({ ...checkoutInput(), deliveryRateVersion: rates.version,
      formVersion: 1, customAnswers: [{ fieldId: 'context_note', value: 'Call first' }] });
    assert.ok(parsed.value, parsed.errors.join(' '));
    parsed.value.customerAuthSubject = 'buyer';
    const ordered = await createCodOrder(db, 'cart-hash', 'receipt-hash-new', parsed.value, now, 'buyer',
      giftForm('commerce.checkout', 'Call first'));
    const order = sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(ordered.orderNumber);
    assert.equal(sqlite.prepare("SELECT subject_id FROM form_answer_sets WHERE form_id='commerce.checkout'").get()?.subject_id, order?.id);
    assert.equal((await createCodOrder(db, 'cart-hash', 'receipt-hash-new', parsed.value, now, 'buyer',
      giftForm('commerce.checkout', 'Call first'))).orderNumber, ordered.orderNumber);
    await assert.rejects(() => createCodOrder(db, 'cart-hash', 'receipt-hash-new',
      { ...parsed.value!, customerPhone: '9822222222' }, now, 'buyer',
      giftForm('commerce.checkout', 'Call first')));
    sqlite.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('new-cart-item','cart','product',1,?,?)").run(now + 1, now + 1);
    await assert.rejects(() => createCodOrder(db, 'cart-hash', 'receipt-hash-new',
      parsed.value!, now + 1, 'buyer', giftForm('commerce.checkout', 'Call first')));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='commerce.checkout'").get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('checkout route rejects an unversioned cart before placing an order', async () => {
  const { sqlite, db, now } = caseDatabase(false);
  globalThis.commerceCatalogDb = db;
  try {
    await seedVerifiedCheckoutContact(db, 'buyer');
    globalThis.commerceCheckoutActor = { userId: 'buyer', authSubject: 'buyer', email: 'buyer@example.test' };
    sqlite.prepare('UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=1 WHERE id=?').run(SELLER_AGREEMENT_VERSION, 'seller-profile');
    sqlite.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','cart-hash','NPR',?,?)").run(now, now);
    sqlite.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('cart-item','cart','product',1,?,?)").run(now, now);
    const rates = await getDeliveryRates(db);
    const route = await import('../app/api/checkout/route');
    const response = await route.POST(new Request('http://localhost:3000/api/checkout', {
      method: 'POST', headers: { origin: 'http://localhost:3000', cookie: 'hastabazaar_cart=cart-hash',
        'content-type': 'application/json' },
      body: JSON.stringify({ ...checkoutInput(), deliveryRateVersion: rates.version }),
    }));
    assert.equal(response.status, 400);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM orders WHERE id <> 'order'").get()?.n, 0);
  } finally { globalThis.commerceCheckoutActor = undefined; sqlite.close(); }
});

void test('versioned checkout route links its answer to the created order', async () => {
  const { sqlite, db, now } = caseDatabase(false);
  globalThis.commerceCatalogDb = db;
  try {
    await seedVerifiedCheckoutContact(db, 'buyer');
    globalThis.commerceCheckoutActor = { userId: 'buyer', authSubject: 'buyer', email: 'buyer@example.test' };
    sqlite.prepare('UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=1 WHERE id=?').run(SELLER_AGREEMENT_VERSION, 'seller-profile');
    sqlite.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','cart-hash','NPR',?,?)").run(now, now);
    sqlite.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('cart-item','cart','product',1,?,?)").run(now, now);
    const formId = 'commerce.checkout';
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?,?,1,1,'published',?,'test','sa',1,'sa',1,'sa',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [] }), `seed-${formId}`);
    const rates = await getDeliveryRates(db);
    const route = await import('../app/api/checkout/route');
    const response = await route.POST(new Request('http://localhost:3000/api/checkout', {
      method: 'POST', headers: { origin: 'http://localhost:3000', cookie: 'hastabazaar_cart=cart-hash',
        'content-type': 'application/json' },
      body: JSON.stringify({ ...checkoutInput(), deliveryRateVersion: rates.version,
        formVersion: 1, customAnswers: [] }),
    }));
    assert.equal(response.status, 201);
    const result = await response.json() as { orderNumber: string };
    const order = sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(result.orderNumber);
    assert.equal(sqlite.prepare("SELECT subject_id FROM form_answer_sets WHERE form_id='commerce.checkout'").get()?.subject_id, order?.id);
  } finally { globalThis.commerceCheckoutActor = undefined; sqlite.close(); }
});

void test('gift form renders a required custom field and submits its versioned answer', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: {
    headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'gift-client-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { GiftCardForm } from './components/commerce/gift-card-form';
      createRoot(document.getElementById('root')!).render(<GiftCardForm issue />);
    `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'navigation-stub', setup(bundler) {
      bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'gift-link-shim' }));
      bundler.onLoad({ filter: /.*/, namespace: 'gift-link-shim' }, () => ({
        contents: 'import React from "react"; export default function Link(props){return React.createElement("a", {href:props.href}, props.children)}',
        loader: 'js', resolveDir: process.cwd(),
      }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'next/navigation', namespace: 'next-shim' }));
      bundler.onLoad({ filter: /.*/, namespace: 'next-shim' }, () => ({
        contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js',
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const payloads: Record<string, unknown>[] = [];
  try {
    await page.route('https://gift.test/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname.startsWith('/api/forms/')) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ config: { formId: 'commerce.gift-card-issue', version: 1, publishedAt: 1,
          fields: [{ id: 'context_note', key: 'context_note', label: 'Gift purpose', type: 'short_text',
            required: true, order: 0, status: 'active' }] } }) });
      if (url.pathname === '/api/admin/gift-cards') {
        payloads.push(JSON.parse(route.request().postData() ?? '{}'));
        if (payloads.length === 1) return route.abort();
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ id: 'gift-1', amountPaisa: 12500, code: null, duplicate: true }) });
      }
      return route.abort();
    });
    await page.goto('https://gift.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByLabel(/Gift purpose/).fill('Festival gift', { timeout: 3000 });
    await page.getByLabel(/Amount in NPR/).fill('125.00');
    await page.getByRole('button', { name: 'Issue gift card' }).click();
    await page.getByText(/Connection interrupted/).waitFor();
    await page.reload();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByLabel(/Gift purpose/).fill('Festival gift', { timeout: 3000 });
    await page.getByLabel(/Amount in NPR/).fill('125.00');
    await page.getByRole('button', { name: 'Issue gift card' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('Gift card issued.'));
    assert.equal(payloads[0].requestId, payloads[1].requestId,
      'reload after a lost issuance response must preserve the same opaque request ID');
    assert.equal(payloads[1].formVersion, 1);
    assert.deepEqual(payloads[1].customAnswers,
      [{ fieldId: 'context_note', value: 'Festival gift' }]);
    assert.equal(await page.evaluate(() => sessionStorage.getItem(
      'hastabazaar:profile-attempt:commerce.gift-card-issue:current-staff')), null);
  } finally { await page.close(); await browser.close(); }
});

void test('invalid gift code stays correctable after a domain 409', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: {
    headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'gift-retry-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { GiftCardForm } from './components/commerce/gift-card-form';
      createRoot(document.getElementById('root')!).render(<GiftCardForm />);
    `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'navigation-stub', setup(bundler) {
      bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'gift-link-shim' }));
      bundler.onLoad({ filter: /.*/, namespace: 'gift-link-shim' }, () => ({
        contents: 'import React from "react"; export default function Link(props){return React.createElement("a", {href:props.href}, props.children)}',
        loader: 'js', resolveDir: process.cwd(),
      }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'next/navigation', namespace: 'next-shim' }));
      bundler.onLoad({ filter: /.*/, namespace: 'next-shim' }, () => ({
        contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js',
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const requests: { code: string; requestId: string }[] = [];
  try {
    await page.route('https://gift-retry.test/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname === '/api/forms/commerce.gift-card-redeem')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          config: { formId: 'commerce.gift-card-redeem', version: 1, publishedAt: 1, fields: [] },
        }) });
      if (url.pathname === '/api/account/gift-cards') {
        requests.push(JSON.parse(route.request().postData() ?? '{}'));
        return route.fulfill({ status: requests.length === 2 ? 200 : 409,
          contentType: 'application/json', body: requests.length === 1
            ? JSON.stringify({ error: 'Gift code is invalid.' })
            : requests.length === 2
              ? JSON.stringify({ id: 'gift-1', amountPaisa: 12500, duplicate: false })
              : JSON.stringify({ error: 'Form changed.', code: 'stale_version' }) });
      }
      return route.abort();
    });
    await page.goto('https://gift-retry.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const input = page.getByLabel(/Gift card code/);
    await input.fill('INVALID-CODE');
    await page.getByRole('button', { name: 'Redeem into wallet' }).click();
    await page.getByText('Gift code is invalid.').waitFor();
    await input.fill('VALID-CODE');
    await page.getByRole('button', { name: 'Redeem into wallet' }).click({ timeout: 3000 });
    await page.getByText('Gift card redeemed. Shopping credit added.').waitFor();
    assert.deepEqual(requests.map((value) => value.code), ['INVALID-CODE', 'VALID-CODE']);
    assert.equal(requests[0].requestId, requests[1].requestId,
      'known invalid code can be corrected under the same unclaimed attempt');
    await page.getByRole('button', { name: 'Redeem another code' }).click();
    await input.fill('ANOTHER-CODE');
    await page.getByRole('button', { name: 'Redeem into wallet' }).click();
    await page.getByText('Form changed.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Redeem into wallet' }).isDisabled(), true,
      'a genuine stale-version response requires a form refresh');
  } finally { await page.close(); await browser.close(); }
});

void test('aftercare client posts published answers with each authorized case request', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: {
    headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'aftercare-client-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { CustomerAftercare } from './components/commerce/customer-aftercare';
      createRoot(document.getElementById('root')!).render(<CustomerAftercare
        orderNumber="HK-TEST" orderStatus="delivered"
        items={[{id:'item',productName:'Product',sellerName:'Shop',quantity:1,
          returnEligible:true,fulfillmentStatus:'delivered'}]}
        returns={[]} complaints={[]} />);
    `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'navigation-stub', setup(bundler) {
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'next/navigation', namespace: 'next-shim' }));
      bundler.onLoad({ filter: /.*/, namespace: 'next-shim' }, () => ({
        contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js',
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const bodies: string[] = [];
  const attempts = { returns: 0, complaints: 0 };
  try {
    await page.route('https://aftercare.test/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname.startsWith('/api/forms/')) {
        const formId = decodeURIComponent(url.pathname.slice('/api/forms/'.length));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          config: { formId, version: 1, publishedAt: 1, fields: [
            { id: 'context_note', key: 'context_note', label: 'Case context', type: 'short_text',
              required: true, order: 0, status: 'active' },
          ] },
        }) });
      }
      if (url.pathname.endsWith('/returns') || url.pathname.endsWith('/complaints')) {
        bodies.push(route.request().postData() ?? '');
        const kind = url.pathname.endsWith('/returns') ? 'returns' : 'complaints';
        attempts[kind]++;
        if (attempts[kind] === 1) return route.fulfill({ status: 409,
          contentType: 'application/json', body: JSON.stringify({ error: 'Correct the case details.' }) });
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
          id: 'case-1', referenceNumber: 'HK-C-1', duplicate: false, message: 'Case received.' }) });
      }
      return route.abort();
    });
    await page.goto('https://aftercare.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByText('Return or replace an item').click();
    const returnForm = page.locator('form[data-form-id="commerce.return-request"]');
    await returnForm.getByPlaceholder(/Describe the issue/).fill('The item arrived damaged and cannot be used.');
    await returnForm.getByLabel(/Case context/).fill('Outer box torn');
    await returnForm.getByRole('button', { name: 'Send return request' }).click();
    await returnForm.getByText('Correct the case details.').waitFor();
    await returnForm.getByPlaceholder(/Describe the issue/).fill('The item arrived damaged and its clasp cannot close.');
    await returnForm.getByRole('button', { name: 'Send return request' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('Case received.'));
    assert.match(bodies[0], /name="formVersion"[\s\S]*?1/);
    assert.match(bodies[0], /"fieldId":"context_note","value":"Outer box torn"/);
    assert.doesNotMatch(bodies[0], /name="custom\.context_note"/);
    assert.equal(bodies[0].match(/name="idempotencyKey"[\s\S]*?\r\n\r\n([^\r\n]+)/)?.[1],
      bodies[1].match(/name="idempotencyKey"[\s\S]*?\r\n\r\n([^\r\n]+)/)?.[1]);
    await page.getByText('Get help or raise a complaint').click();
    const complaintForm = page.locator('form[data-form-id="commerce.complaint"]');
    assert.equal(await complaintForm.count(), 1);
    assert.equal(await complaintForm.locator('[name="custom.context_note"]').count(), 1);
    await complaintForm.getByLabel('Subject').fill('Damaged delivery');
    await complaintForm.getByPlaceholder(/Explain what happened/).fill('The package arrived damaged and the product is unusable.');
    await complaintForm.locator('[name="custom.context_note"]').fill('Call in afternoon', { timeout: 3000 });
    await complaintForm.getByRole('button', { name: 'Send complaint' }).click();
    await complaintForm.getByText('Correct the case details.').waitFor();
    await complaintForm.getByLabel('Subject').fill('Damaged delivery package');
    await complaintForm.getByRole('button', { name: 'Send complaint' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('Case received.'));
    assert.deepEqual(JSON.parse(bodies[3]).customAnswers,
      [{ fieldId: 'context_note', value: 'Call in afternoon' }]);
    assert.equal(JSON.parse(bodies[3]).formVersion, 1);
    assert.equal(JSON.parse(bodies[2]).idempotencyKey, JSON.parse(bodies[3]).idempotencyKey);
  } finally { await page.close(); await browser.close(); }
});

void test('checkout client submits the published answer with the core order payload', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: {
    headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'checkout-client-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { CheckoutForm } from './components/commerce/checkout-form';
      createRoot(document.getElementById('root')!).render(<CheckoutForm customerId="customer-fixture" />);
    `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'checkout-stubs', setup(bundler) {
      bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'checkout-shim' }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'checkout-shim' }));
      bundler.onResolve({ filter: /^@\/components\/delivery\/location-picker$/ },
        () => ({ path: 'location', namespace: 'checkout-shim' }));
      bundler.onLoad({ filter: /^link$/, namespace: 'checkout-shim' }, () => ({
        contents: 'import React from "react"; export default function Link(p){return React.createElement("a",{href:p.href,...p},p.children)}', loader: 'js', resolveDir: process.cwd(),
      }));
      bundler.onLoad({ filter: /^location$/, namespace: 'checkout-shim' }, () => ({
        contents: 'export function LocationPicker(){return null}', loader: 'js',
      }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'checkout-shim' }, () => ({
        contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js',
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const payloads: Record<string, unknown>[] = [];
  try {
    await page.route('https://checkout.test/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname === '/api/account/contact-verification') return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ email: 'buyer@example.test', phone: '+9779811111111', emailVerified: true, phoneVerified: true }) });
      if (url.pathname === '/api/cart') return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ items: [{ id: 'item', sellerId: 'seller', nameEn: 'Product',
          tradingName: 'Shop', pricePaisa: 100000, quantity: 1, preparationDays: 1 }],
          itemSubtotalPaisa: 100000, itemCount: 1, hasUnavailableItems: false }) });
      if (url.pathname === '/api/forms/commerce.checkout') return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ config: { formId: 'commerce.checkout', version: 1, publishedAt: 1,
          fields: [{ id: 'context_note', key: 'context_note', label: 'Delivery note', type: 'short_text',
            required: true, order: 0, status: 'active' }] } }) });
      if (url.pathname === '/api/checkout') {
        payloads.push(JSON.parse(route.request().postData() ?? '{}'));
        if (payloads.length === 1) return route.fulfill({ status: 409,
          contentType: 'application/json', body: JSON.stringify({ error: 'Correct the delivery details.' }) });
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ orderNumber: 'HK-NEW' }) });
      }
      return route.abort();
    });
    await page.goto('https://checkout.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const form = page.locator('form[data-form-id="commerce.checkout"]');
    await form.getByLabel('Recipient name').fill('Maya Buyer');
    await form.getByLabel('Recipient phone').fill('9811111111');
    await form.getByLabel('Order email').fill('buyer@example.test');
    await form.getByLabel('Contact phone').fill('9811111111');
    await form.getByLabel('District').fill('Dhanusha');
    await form.getByLabel('Municipality / rural municipality').fill('Janakpur');
    await form.getByLabel('Street, tole or locality').fill('Ward 1');
    await form.getByLabel('Delivery note').fill('Call before delivery');
    await form.locator('label[for="checkout-terms"]').click({ timeout: 3000 });
    await form.getByRole('button', { name: 'Place COD order' }).click();
    await page.getByText('Correct the delivery details.').waitFor();
    await form.getByLabel('Contact phone').fill('9822222222');
    await form.getByRole('button', { name: 'Place COD order' }).click();
    await form.getByText(/differs from the prior attempt/).waitFor();
    assert.equal(payloads.length, 1, 'changed intent must not reuse an uncertain order attempt');
    page.once('dialog', (dialog) => dialog.dismiss());
    await form.getByRole('button', { name: 'Start a new order attempt' }).click();
    await form.getByRole('button', { name: 'Place COD order' }).click();
    await form.getByText(/differs from the prior attempt/).waitFor();
    assert.equal(payloads.length, 1, 'cancelled reset retains the original attempt');
    page.once('dialog', (dialog) => dialog.accept());
    await form.getByRole('button', { name: 'Start a new order attempt' }).click();
    await form.getByRole('button', { name: 'Place COD order' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('Correct the delivery details.') === false);
    assert.equal(payloads.length, 2, 'explicit new attempt remains submittable after a domain conflict');
    assert.notEqual(payloads[0].idempotencyKey, payloads[1].idempotencyKey);
    assert.equal(payloads[1].formVersion, 1);
    assert.deepEqual(payloads[1].customAnswers,
      [{ fieldId: 'context_note', value: 'Call before delivery' }]);
  } finally { await page.close(); await browser.close(); }
});

void test('seller case response client posts distinct published form answers', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: {
    headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'seller-case-client-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { SellerCaseResponseForm } from './components/seller/case-response-form';
      createRoot(document.getElementById('root')!).render(<><SellerCaseResponseForm kind="return" id="return-1" disabled={false}/>
        <SellerCaseResponseForm kind="complaint" id="complaint-1" disabled={false}/></>);
    `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'navigation-stub', setup(bundler) {
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'next/navigation', namespace: 'next-shim' }));
      bundler.onLoad({ filter: /.*/, namespace: 'next-shim' }, () => ({
        contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js',
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const bodies: Record<string, unknown>[] = [];
  const attempts: Record<string, number> = {};
  try {
    await page.route('https://seller-case.test/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname.startsWith('/api/forms/')) {
        const formId = decodeURIComponent(url.pathname.slice('/api/forms/'.length));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          config: { formId, version: 1, publishedAt: 1, fields: [{ id: 'context_note', key: 'context_note',
            label: 'Seller context', type: 'short_text', required: true, order: 0, status: 'active' }] },
        }) });
      }
      if (url.pathname.endsWith('/response')) {
        bodies.push(JSON.parse(route.request().postData() ?? '{}'));
        attempts[url.pathname] = (attempts[url.pathname] ?? 0) + 1;
        if (attempts[url.pathname] === 1) return route.fulfill({ status: 409,
          contentType: 'application/json', body: JSON.stringify({ error: 'Correct the response.' }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      }
      return route.abort();
    });
    await page.goto('https://seller-case.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    for (const [id, note] of [['seller.case-return-response', 'Return context'],
      ['seller.case-complaint-response', 'Complaint context']]) {
      const form = page.locator(`form[data-form-id="${id}"]`);
      await form.getByLabel('Response for the investigation').fill('I inspected the packing record and will resolve this case.');
      await form.getByLabel('Seller context').fill(note);
      await form.getByRole('button', { name: 'Submit response' }).click();
      await form.getByText('Correct the response.').waitFor();
      await form.getByLabel('Response for the investigation').fill('I rechecked the packing record and will resolve this case.');
      await form.getByRole('button', { name: 'Submit response' }).click();
    }
    await page.waitForFunction(() => document.querySelectorAll('form[data-form-id]').length === 2);
    assert.deepEqual(bodies.map((body) => body.customAnswers), [
      [{ fieldId: 'context_note', value: 'Return context' }],
      [{ fieldId: 'context_note', value: 'Return context' }],
      [{ fieldId: 'context_note', value: 'Complaint context' }],
      [{ fieldId: 'context_note', value: 'Complaint context' }],
    ]);
    assert.deepEqual(bodies.map((body) => body.formVersion), [1, 1, 1, 1]);
    assert.equal(bodies[0].idempotencyKey, bodies[1].idempotencyKey);
    assert.equal(bodies[2].idempotencyKey, bodies[3].idempotencyKey);
  } finally { await page.close(); await browser.close(); }
});
