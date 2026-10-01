import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { SQLiteD1Database } from './sqlite-d1.mjs';
import { inspectHostedAuthSchema } from './hosted-auth-readiness.mjs';
import { assertDisposableStagingContext, readAndVerifyStagingMarker, resolveDisposableStagingPaths } from './guards.mjs';
import { ensureLocalTestAccount } from '../../lib/auth/local-test-seed.ts';
import { requestContactVerification, verifyContactVerification, getContactVerificationStatus } from '../../lib/auth/contact-verification.ts';
import { deliverContactCode, readLocalContactCaptures } from '../../lib/auth/contact-delivery.ts';
import { saveFormDraft, publishFormDraft } from '../../lib/db/repositories/form-catalog.ts';
import { validateSellerFormSubmission } from '../../lib/forms/submission.ts';
import { updateCustomerProfile } from '../../lib/db/repositories/customers.ts';
import { createProductSubmission, reviewProduct, setProductInventory } from '../../lib/db/repositories/products.ts';
import { addCartItem, getCart } from '../../lib/db/repositories/cart.ts';
import { createCodOrder } from '../../lib/db/repositories/orders.ts';
import { getDeliveryRates } from '../../lib/db/repositories/delivery-rates.ts';
import { cancellationPreview, cancelSelectedParcels } from '../../lib/cancellation/repository.ts';
import { transitionSellerFulfillment } from '../../lib/db/repositories/fulfillment.ts';
import { prepareSellerParcels, listParcels, operateParcel } from '../../lib/operations/parcels.ts';
import { createCustomerReturnRequest, reviewReturnAsAdmin, advanceReturnAsAdmin } from '../../lib/db/repositories/returns.ts';
import { getSellerFinanceSummary } from '../../lib/db/repositories/payouts.ts';
import { SELLER_AGREEMENT_VERSION } from '../../lib/content/legal-policies.ts';
import { validateProductVideo } from '../../lib/media/product-video.ts';
import { parseCheckoutInput } from '../../lib/checkout/validation.ts';

// No hosted providers, shared database handles, synthetic financial history,
// direct contact-verification inserts, or auth bypasses are used here.
// --isolated uses only a full-schema in-memory SQLite database. The separately
// guarded --prepare-preview mode is intended for the coordinator after its
// explicit shared-preview lease. It prepares product data, never purchases.
const prefix = 'batch7-20261001';
const roles = ['customer', 'buyer', 'seller', 'admin', 'super_admin'];
const formIds = ['account.profile', 'seller.product-submission', 'seller.inventory', 'staff.product-review',
  'commerce.checkout', 'commerce.order-cancellation', 'staff.parcel-control',
  'commerce.return-request', 'staff.return-case-action'];
const ids = { buyer: 'local-test-buyer', sellerUser: 'local-test-seller', seller: 'local-test-seller-profile',
  reviewer: 'local-test-admin', publisher: 'local-test-super-admin', product: `${prefix}-product` };
const phone = '+9779800000033';
const note = 'SIMULATED fictional Batch7 acceptance evidence.';
const argument = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const checks = [];
function pass(label, data) { checks.push({ label, ...(data === undefined ? {} : { data }) }); console.log(`PASS ${label}`); }
function input(categoryId, occasionId) {
  return { categoryId, occasionIds: [occasionId], sku: '', nameEn: 'SIMULATED Batch7 Gift Set', nameNe: null,
    descriptionEn: 'A fictional marketplace acceptance item. SIMULATED — NOT VALID FOR PRODUCTION.', descriptionNe: null,
    pricePaisa: 100000, compareAtPricePaisa: null, inventoryQuantity: 6, producer: 'SIMULATED Artisan',
    materials: ['Cotton'], originStory: 'Fictional local acceptance fixture.', dimensions: '10 × 10 cm',
    careInstructions: 'Keep dry.', safetyInformation: 'Fictional item.', returnConditions: 'Fictional item may be returned under the snapshotted policy.',
    returnEligible: true, warranty: null, madeToOrder: false, preparationDays: 0,
    manufacturedAt: null, expiresAt: null, licenceReference: null };
}

async function isolated() {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const db = new SQLiteD1Database();
  const prepare = db.prepare.bind(db);
  db.prepare = sql => {
    let statement;
    try { statement = prepare(sql); }
    catch (error) {
      if (process.argv.includes('--diagnostic')) console.error(`Isolated SQL preparation failure: ${error.message}\n${sql}`);
      throw error;
    }
    const run = statement.run.bind(statement);
    statement.run = async () => {
      try { return await run(); }
      catch (error) {
        if (process.argv.includes('--diagnostic')) console.error(`Isolated SQL failure: ${error.message}\n${sql}`);
        throw new Error(`Isolated statement failed: ${sql}`, { cause: error });
      }
    };
    return statement;
  };
  const now = Date.now();
  const environment = { HASTABAZAAR_RUNTIME_ENV: 'local_staging', APP_ORIGIN: 'http://127.0.0.1:4327' };
  try {
    const names = (await readdir(new URL('../../drizzle/', import.meta.url))).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
    for (const name of names) for (const statement of (await readFile(new URL(`../../drizzle/${name}`, import.meta.url), 'utf8')).split('--> statement-breakpoint')) {
      if (statement.trim()) db.sqlite.exec(statement);
    }
    // Reuse the existing faithful local prerequisite SQL. Its CLI performs a
    // recovery backup in shared .staging, so this memory-only runner applies
    // the three source-owned CREATE templates and verifies the same contract.
    const prerequisite = await readFile(new URL('./hosted-auth-readiness.mjs', import.meta.url), 'utf8');
    const templates = [...prerequisite.matchAll(/sql: `([^`]+)`/g)];
    assert.equal(templates.length, 3);
    for (const template of templates) db.sqlite.exec(template[1]);
    db.sqlite.exec(`CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
      CREATE INDEX idx_user_sessions_expiry ON user_sessions(expires_at);
      CREATE INDEX idx_email_login_challenges_user_created ON email_login_challenges(user_id,created_at);
      CREATE INDEX idx_email_login_challenges_expiry ON email_login_challenges(expires_at);`);
    assert.equal(inspectHostedAuthSchema(db.sqlite).ready, true);
    for (const role of roles) await ensureLocalTestAccount(db, role);
    // Agreement acceptance is fixture infrastructure for the fictional seller,
    // and does not alter a person or live seller account.
    await db.prepare('UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=? WHERE id=?')
      .bind(SELLER_AGREEMENT_VERSION, now, ids.seller).run();
    for (const formId of formIds) {
      const draft = await saveFormDraft(db, { formId, actorId: ids.publisher, actorRole: 'super_admin', expectedPublishedVersion: 0,
        config: { formId, fields: [] }, reason: note, requestId: `${prefix}-draft-${formId}`, now });
      await publishFormDraft(db, { formId, draftId: draft.id, actorId: ids.publisher, actorRole: 'super_admin',
        expectedDraftRevision: draft.revision, expectedPublishedVersion: 0, reason: note, requestId: `${prefix}-publish-${formId}`, now });
    }
    const form = async (formId, requestId, builtInValues = {}) => {
      const validated = await validateSellerFormSubmission(db, formId, 1, [], requestId, builtInValues);
      return { requestId, versionId: validated.versionId, answers: validated.answers };
    };
    pass('full schema and distinct fictional buyer, seller, reviewer and publisher', { migrations: names.length, roles: ids });
    const profile = await form('account.profile', `${prefix}-profile`);
    await updateCustomerProfile(db, { userId: ids.buyer, displayName: 'SIMULATED Batch7 Buyer', phone, locale: 'en-NP',
      requestId: profile.requestId, now, formVersion: 1, versionId: profile.versionId, answers: profile.answers });
    const actor = { userId: ids.buyer, authSubject: ids.buyer, localFixture: true };
    const challenge = await requestContactVerification(db, actor, 'email', message => deliverContactCode(db, environment, message), now);
    const captures = await readLocalContactCaptures(db, environment, actor, now);
    assert.equal(captures.length, 1); assert.equal(captures[0].channel, 'email');
    assert.match(captures[0].label, /NOT VALID FOR PRODUCTION/);
    await verifyContactVerification(db, actor, 'email', challenge.token, captures[0].code, now + 1);
    assert.deepEqual(await getContactVerificationStatus(db, actor), { email: 'buyer@local.hastabazaar.test', phone,
      emailVerified: true, phoneVerified: false });
    assert.equal((await readLocalContactCaptures(db, environment, actor, now + 1)).length, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM account_phone_verifications').first()).n, 0);
    pass('captured fictional email proof consumed; phone remains unverified and shipping phone is retained');
    const category = `${prefix}-category`, occasion = 'hastabazaar-occasion-others';
    await db.prepare('INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES (?,?,?,1,9999,?,?)')
      .bind(category, category, 'SIMULATED isolated category', now, now).run();
    const submission = await form('seller.product-submission', `${prefix}-submit`);
    await createProductSubmission(db, { productId: ids.product, sellerId: ids.seller, actorId: ids.sellerUser,
      slug: ids.product, input: input(category, occasion), images: [], now, form: submission });
    await assert.rejects(reviewProduct(db, { productId: ids.product, actorId: ids.sellerUser, action: 'start_review', reason: note,
      requestId: `${prefix}-self-review`, now, form: await form('staff.product-review', `${prefix}-self-review`) }));
    for (const action of ['start_review', 'approve', 'publish']) {
      const requestId = `${prefix}-${action}`;
      await reviewProduct(db, { productId: ids.product, actorId: action === 'publish' ? ids.publisher : ids.reviewer,
        action, reason: note, requestId, now, form: await form('staff.product-review', requestId) });
    }
    const inventoryForm = await form('seller.inventory', `${prefix}-inventory`);
    const inventory = { productId: ids.product, sellerId: ids.seller, actorId: ids.sellerUser,
      quantity: 8, reason: note, now, form: inventoryForm };
    await setProductInventory(db, inventory); await setProductInventory(db, inventory);
    assert.equal((await db.prepare('SELECT inventory_quantity AS n FROM products WHERE id=?').bind(ids.product).first()).n, 8);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM audit_logs WHERE request_id=?').bind(inventoryForm.requestId).first()).n, 1);
    await assert.rejects(setProductInventory(db, { ...inventory, sellerId: 'another-fictional-seller', form: undefined }));
    pass('seller submission, self-review denial, distinct staff approval/publication, owned inventory and exact replay');
    async function purchase(label) {
      const cartHash = `${prefix}-${label}-cart`, receiptHash = `${prefix}-${label}-receipt`;
      const requestId = label === 'cancel' ? '77000000-0000-4000-8000-000000000001' : '77000000-0000-4000-8000-000000000002';
      await addCartItem(db, cartHash, ids.product, 1, now);
      const before = await getCart(db, cartHash); assert.equal(before.itemCount, 1); assert.equal(before.itemSubtotalPaisa, 100000);
      const rates = await getDeliveryRates(db);
      const checkout = { customerEmail: 'buyer@local.hastabazaar.test', customerPhone: phone, customerAuthSubject: ids.buyer,
        locale: 'en-NP', termsAccepted: true, idempotencyKey: requestId, deliveryRateVersion: rates.version,
        address: { recipientName: 'SIMULATED Batch7 Buyer', phone, province: 'Bagmati', district: 'Kathmandu',
          municipality: 'Kathmandu', ward: '1', locality: 'SIMULATED private acceptance address' }, formVersion: 1, customAnswers: [] };
      assert.equal(parseCheckoutInput({ ...checkout, customerAuthSubject: undefined }).value, undefined,
        'public input must reject even an undefined protected auth subject');
      const { customerAuthSubject: _subject, ...publicInput } = checkout;
      assert.ok(parseCheckoutInput(publicInput).value);
      assert.equal(parseCheckoutInput({ ...publicInput, customerPhone: '', address: { ...publicInput.address, phone: '' } }).value, undefined);
      const configured = await form('commerce.checkout', requestId);
      await assert.rejects(createCodOrder(db, cartHash, receiptHash, checkout, now, ids.buyer,
        configured, 'email_and_phone'), /phone|mobile|contact/i);
      const result = await createCodOrder(db, cartHash, receiptHash, checkout, now, ids.buyer, configured, 'email_only');
      assert.deepEqual(await createCodOrder(db, cartHash, receiptHash, checkout, now, ids.buyer, configured, 'email_only'), result);
      assert.equal((await getCart(db, cartHash)).itemCount, 0);
      const order = await db.prepare('SELECT id,grand_total_paisa AS total,return_policy_snapshot_json AS policy FROM orders WHERE order_number=?')
        .bind(result.orderNumber).first();
      assert.equal(order.total, 115000);
      return { ...result, ...order, receiptHash };
    }
    const cancelled = await purchase('cancel');
    assert.equal((await db.prepare('SELECT inventory_quantity AS n FROM products WHERE id=?').bind(ids.product).first()).n, 7);
    const access = { orderNumber: cancelled.orderNumber, customerId: ids.buyer, receiptTokenHash: cancelled.receiptHash };
    await assert.rejects(cancellationPreview(db, { orderNumber: cancelled.orderNumber, customerId: 'local-test-customer' }, [ids.seller]));
    const preview = await cancellationPreview(db, access, [ids.seller]);
    const cancel = { sellerIds: [ids.seller], fingerprint: preview.fingerprint, requestId: `${prefix}-cancel-confirm`,
      note, now, form: { formId: 'commerce.order-cancellation', ...await form('commerce.order-cancellation', `${prefix}-cancel-confirm`) } };
    await cancelSelectedParcels(db, access, cancel); await cancelSelectedParcels(db, access, cancel);
    assert.deepEqual({ ...(await db.prepare('SELECT status,grand_total_paisa AS original,current_total_paisa AS current FROM orders WHERE id=?')
      .bind(cancelled.id).first()) }, { status: 'cancelled', original: 115000, current: 0 });
    assert.equal((await db.prepare('SELECT inventory_quantity AS n FROM products WHERE id=?').bind(ids.product).first()).n, 8);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM seller_ledger_entries').first()).n, 0);
    pass('real purchase and checkout replay; private cancellation; zero revised COD; stock restored once; original totals preserved',
      { orderNumber: cancelled.orderNumber, originalPaisa: 115000, revisedPaisa: 0 });
    const fulfilled = await purchase('refund');
    await prepareSellerParcels(db, { orderId: fulfilled.id, actorId: ids.reviewer, requestId: `${prefix}-setup`, now });
    let sequence = 0;
    async function parcel(action, extra = {}) {
      const current = (await listParcels(db, fulfilled.id))[0];
      const requestId = `${prefix}-parcel-${action}-${sequence++}`;
      const operation = { jobId: current.id, actorId: ids.reviewer, requestId, action, version: current.version,
        note, now, ...extra, form: await form('staff.parcel-control', requestId) };
      await operateParcel(db, operation); await operateParcel(db, operation);
      return operation;
    }
    await parcel('assign', { method: 'courier', courierName: 'SIMULATED Courier', trackingCode: 'SIM-BATCH7',
      trackingUrl: 'https://example.test/fictional-tracking' });
    for (const action of ['start_packing', 'ready_for_pickup']) await transitionSellerFulfillment(db, { orderId: fulfilled.id,
      sellerId: ids.seller, actorId: ids.sellerUser, action, note, requestId: `${prefix}-seller-${action}`, now });
    await assert.rejects(cancellationPreview(db, { orderNumber: fulfilled.orderNumber, customerId: ids.buyer }, [ids.seller]), /ready for pickup/i);
    await parcel('dispatch'); await parcel('deliver');
    const due = (await listParcels(db, fulfilled.id))[0].codDuePaisa;
    await parcel('collect', { amountPaisa: due, reference: 'SIM-BATCH7-COD-RECEIPT' });
    assert.deepEqual({ ...(await db.prepare('SELECT status,payment_status AS payment FROM orders WHERE id=?').bind(fulfilled.id).first()) },
      { status: 'delivered', payment: 'paid' });
    assert.equal((await getSellerFinanceSummary(db, ids.seller, now)).grossSalesPaisa, 0,
      'delivery and collection cannot accrue seller funds before cash remittance');
    await parcel('propose_remittance', { amountPaisa: due, reference: 'SIM-BATCH7-COURIER-REMITTANCE' });
    const remittance = await db.prepare("SELECT id FROM parcel_cash_records WHERE kind='remittance' AND status='pending'").first();
    const current = (await listParcels(db, fulfilled.id))[0];
    await assert.rejects(operateParcel(db, { jobId: current.id, actorId: ids.reviewer, action: 'approve_remittance',
      version: current.version, cashRecordId: remittance.id, requestId: `${prefix}-self-remittance`, note, now }), /reviewer/i);
    await parcel('approve_remittance', { actorId: ids.publisher, cashRecordId: remittance.id });
    const saleFinance = await getSellerFinanceSummary(db, ids.seller, now);
    const originalLedger = (await db.prepare("SELECT id,type,amount_paisa AS amount FROM seller_ledger_entries WHERE type IN ('sale','commission') ORDER BY type")
      .all()).results.map(row => ({ ...row }));
    assert.equal(saleFinance.grossSalesPaisa, 100000); assert.equal(saleFinance.commissionPaisa, -9000);
    assert.equal(saleFinance.availablePaisa + saleFinance.pendingPaisa, 91000);
    pass('seller readiness cutoff; courier delivery/COD; independent remittance approval; exact replay accrues 91000paisa',
      { orderNumber: fulfilled.orderNumber, duePaisa: due, finance: saleFinance });
    const item = await db.prepare('SELECT id FROM order_items WHERE order_id=?').bind(fulfilled.id).first();
    const create = { orderNumber: fulfilled.orderNumber, receiptTokenHash: fulfilled.receiptHash, customerId: ids.buyer,
      orderItemId: item.id, quantity: 1, reason: 'defective', requestedResolution: 'refund', detail: note,
      locale: 'en-NP', idempotencyKey: `${prefix}-return`, evidence: [], now,
      form: await form('commerce.return-request', `${prefix}-return`) };
    const returned = await createCustomerReturnRequest(db, create);
    assert.equal((await createCustomerReturnRequest(db, create)).id, returned.id);
    await assert.rejects(createCustomerReturnRequest(db, { ...create, receiptTokenHash: null, customerId: 'local-test-customer',
      idempotencyKey: `${prefix}-wrong-buyer-return` }));
    const review = { returnRequestId: returned.id, actorId: ids.reviewer, actorRole: 'admin', action: 'approve', note,
      publicMessageEn: 'SIMULATED refund approved.', publicMessageNe: 'SIMULATED refund approved.', responsibility: 'seller',
      outcome: 'refund', itemRefundPaisa: 100000, deliveryRefundPaisa: 0, requestId: `${prefix}-return-review`, now,
      form: await form('staff.return-case-action', `${prefix}-return-review`) };
    await reviewReturnAsAdmin(db, review); await reviewReturnAsAdmin(db, review);
    const common = { returnRequestId: returned.id, actorId: ids.reviewer, actorRole: 'admin', note,
      publicMessageEn: 'SIMULATED operation recorded.', publicMessageNe: 'SIMULATED operation recorded.', now };
    for (const { action, extra } of [{ action: 'mark_in_transit', extra: { reference: 'SIM-BATCH7-RETURN-SHIPMENT' } },
      { action: 'mark_received', extra: {} }, { action: 'start_refund', extra: {} },
      { action: 'complete_refund', extra: { reference: 'SIM-BATCH7-REFUND-RECEIPT', restockQuantity: 1 } }]) {
      const requestId = `${prefix}-${action}`;
      const operation = { ...common, action, ...extra, requestId, form: await form('staff.return-case-action', requestId) };
      await advanceReturnAsAdmin(db, operation); await advanceReturnAsAdmin(db, operation);
    }
    const finance = await getSellerFinanceSummary(db, ids.seller, now);
    assert.equal(finance.refundPaisa, -100000); assert.equal(finance.commissionReversalPaisa, 9000);
    assert.equal(finance.availablePaisa + finance.pendingPaisa, 0);
    assert.equal((await db.prepare('SELECT inventory_quantity AS n FROM products WHERE id=?').bind(ids.product).first()).n, 8);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM refunds WHERE order_id=?').bind(fulfilled.id).first()).n, 1);
    assert.equal((await db.prepare('SELECT return_policy_snapshot_json AS policy FROM orders WHERE id=?').bind(fulfilled.id).first()).policy,
      fulfilled.policy);
    assert.deepEqual((await db.prepare("SELECT id,type,amount_paisa AS amount FROM seller_ledger_entries WHERE type IN ('sale','commission') ORDER BY type")
      .all()).results.map(row => ({ ...row })), originalLedger, 'refund appends adjustments without rewriting original sale or commission');
    await assert.rejects(db.prepare("UPDATE parcel_cash_records SET amount_paisa=1 WHERE status='posted'").run());
    assert.equal((await getContactVerificationStatus(db, actor)).phoneVerified, false);
    assert.equal(db.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
    pass('owned return/refund/restock; replay produces one refund; original ledger and policy preserved; posted cash immutable; net seller balance zero',
      { returnReference: returned.referenceNumber, finance, finalStock: 8 });
    return { kind: 'isolated-repository-journeys', schema: 'full current SQLite migrations', sharedStateTouched: false,
      authPrerequisite: 'existing hosted-auth-readiness contract; memory only',
      actualBrowserCertified: false, smsPolicy: 'email_only; phone unverified; shipping phone required', checks };
  } finally { db.close(); }
}

async function preview() {
  assert.ok(argument('--preview-lease'), 'Coordinator must supply its explicit preview lease before using this mode.');
  assertDisposableStagingContext(process.env);
  const paths = resolveDisposableStagingPaths(process.cwd(), process.env);
  await readAndVerifyStagingMarker(paths);
  assert.equal(process.env.CHECKOUT_CONTACT_POLICY, 'email_only', 'Prepare dormant SMS fixture with required captured email proof.');
  const origin = new URL(process.env.APP_ORIGIN);
  const cookies = new Map();
  async function request(role, path, method = 'GET', body, expected = 200) {
    const multipart = body instanceof FormData;
    const headers = { Origin: origin.origin, Cookie: cookies.get(role) ?? '', ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }) };
    const response = await fetch(new URL(path, origin), { method, redirect: 'manual', headers,
      ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    const text = await response.text();
    let value; try { value = text ? JSON.parse(text) : {}; } catch { value = { error: text.slice(0, 250) }; }
    assert.equal(response.status, expected, `${method} ${path}: ${value.error ?? text.slice(0, 250)}`);
    return value;
  }
  const health = await fetch(new URL('/health/live', origin), { signal: AbortSignal.timeout(30000) }); assert.equal(health.status, 200);
  for (const role of roles) {
    const response = await fetch(new URL('/api/local-testing/session', origin), { method: 'POST', redirect: 'manual',
      headers: { Origin: origin.origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ role }) });
    assert.equal(response.status, 303, `Fictional ${role} session unavailable.`);
    const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]; assert.ok(cookie); cookies.set(role, cookie);
  }
  await request('seller', '/api/seller/agreements', 'POST', { accepted: true, language: 'en' });
  const formListing = await request('super_admin', '/api/admin/forms');
  for (const formId of formIds) {
    const row = formListing.forms.find(value => value.definition.id === formId);
    if (!row) {
      assert.equal(formId, 'account.profile', `Unexpected catalog omission: ${formId}.`);
      const { config } = await request('buyer', `/api/forms/${formId}`);
      assert.ok(config.version > 0, 'Run guarded feature-managed form readiness before preview preparation.');
      continue;
    }
    if (row.publishedVersion > 0) continue;
    assert.equal(row.draftVersion, 0, `Existing ${formId} draft requires review; fixture will not replace it.`);
    const path = `/api/admin/forms/${formId}`, reason = note;
    const draft = await request('super_admin', `${path}/draft`, 'POST', { requestId: `${prefix}-draft-${formId}`, reason,
      expectedPublishedVersion: 0, config: { formId, fields: [] } });
    await request('super_admin', `${path}/publish`, 'POST', { requestId: `${prefix}-publish-${formId}`, reason,
      expectedPublishedVersion: 0, draftId: draft.draft.id, expectedDraftRevision: draft.draft.revision });
  }
  async function envelope(role, formId) {
    const { config } = await request(role, `/api/forms/${formId}`);
    assert.ok(config.version > 0); return { formVersion: config.version, customAnswers: [] };
  }
  await request('buyer', '/api/account/profile', 'PATCH', { displayName: 'SIMULATED Batch7 Buyer', phone, locale: 'en-NP',
    idempotencyKey: `${prefix}-profile`, ...await envelope('buyer', 'account.profile') });
  const statusBefore = await request('buyer', '/api/account/contact-verification');
  if (!statusBefore.emailVerified) {
    const challenge = await request('buyer', '/api/account/contact-verification', 'POST', { action: 'request', channel: 'email' });
    const { captures } = await request('buyer', '/api/account/contact-verification/capture');
    const capture = captures.find(value => value.channel === 'email'); assert.ok(capture); assert.match(capture.label, /NOT VALID FOR PRODUCTION/);
    await request('buyer', '/api/account/contact-verification', 'POST', { action: 'verify', channel: 'email', token: challenge.token, code: capture.code });
  }
  const status = await request('buyer', '/api/account/contact-verification');
  assert.equal(status.emailVerified, true); assert.equal(status.phoneVerified, false);
  pass('preview fictional buyer captured email verified; phone unverified; no SMS request');
  // Reuse original restored public Gifts and migration-owned Others occasion.
  // No public taxonomy entries or existing products are changed by this setup.
  const categoryId = argument('--category-id') ?? 'b09b75ea-ebea-4a77-909f-929818fa15e8';
  const occasionId = argument('--occasion-id') ?? 'hastabazaar-occasion-others';
  const values = input(categoryId, occasionId);
  const submission = new FormData();
  for (const [key, value] of Object.entries({ categoryId, nameEn: values.nameEn, descriptionEn: values.descriptionEn,
    price: '1000', inventoryQuantity: '8', producer: values.producer, materials: 'Cotton', originStory: values.originStory,
    dimensions: values.dimensions, careInstructions: values.careInstructions, safetyInformation: values.safetyInformation,
    returnConditions: values.returnConditions, returnEligible: 'yes', madeToOrder: 'no', preparationDays: '0',
    requestId: `${prefix}-preview-submit`, formVersion: String((await envelope('seller', 'seller.product-submission')).formVersion) })) submission.set(key, value);
  submission.append('occasionIds', occasionId);
  for (const [index, color] of ['#c47b53', '#649e93', '#bc9f51', '#5670a9'].entries()) {
    const bytes = await sharp({ create: { width: 640, height: 480, channels: 3, background: color } }).png().toBuffer();
    submission.append('images', new File([new Uint8Array(bytes)], `${prefix}-photo-${index + 1}.png`, { type: 'image/png' }));
  }
  const temporary = await mkdtemp(join(tmpdir(), 'hastabazaar-batch7-'));
  try {
    const videoPath = join(temporary, `${prefix}.mp4`);
    const encoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x649e93:s=640x360:r=10',
      '-t', '2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath], { windowsHide: true });
    assert.equal(encoded.status, 0, encoded.stderr?.toString() ?? encoded.error?.message);
    const bytes = await readFile(videoPath);
    const video = new File([new Uint8Array(bytes)], `${prefix}-fictional.mp4`, { type: 'video/mp4' });
    assert.equal(await validateProductVideo(video), null); submission.set('video', video);
  } finally {
    assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep));
    assert.ok(temporary.split(sep).at(-1).startsWith('hastabazaar-batch7-'));
    await rm(temporary, { recursive: true, force: true });
  }
  const product = await request('seller', '/api/seller/products', 'POST', submission, 201);
  const replay = await request('seller', '/api/seller/products', 'POST', submission, 201);
  assert.equal(replay.id, product.id);
  for (const action of ['start_review', 'approve', 'publish']) await request(action === 'publish' ? 'super_admin' : 'admin',
    `/api/admin/products/${product.id}/review`, 'POST', { action, reason: note, requestId: `${prefix}-preview-${action}`,
      ...await envelope(action === 'publish' ? 'super_admin' : 'admin', 'staff.product-review') });
  pass('preview real upload of four PNGs and playable MP4, exact submission replay, independent review and publication', product);
  return { kind: 'shared-preview-fixture-preparation', simulationLabel: 'SIMULATED — NOT VALID FOR PRODUCTION',
    sharedStateTouched: true, purchasesCreated: false, actualBrowserCertified: false, origin: origin.origin,
    roles: ids, product, productUrl: `${origin.origin}/products/${product.slug}`, sellerEditUrl: `${origin.origin}/seller/products/${product.id}/edit`,
    categoryId, occasionId, phoneVerified: false, emailVerified: true, checks };
}

try {
  const mode = process.argv.includes('--isolated') ? 'isolated' : process.argv.includes('--prepare-preview') ? 'preview' : null;
  assert.ok(mode, 'Use --isolated or --prepare-preview --preview-lease=<coordinator-lease>.');
  const result = await (mode === 'isolated' ? isolated() : preview());
  result.completedAt = new Date().toISOString();
  const output = argument('--output'); if (output) await writeFile(resolve(output), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; }
