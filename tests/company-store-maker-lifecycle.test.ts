import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { parseProductSubmission } from '../lib/products/submission';
import { createProductSubmission, reviewProduct, listPublishedProducts, countPublishedProducts,
  listHomepageLatestProducts, getPublishedProductBySlug } from '../lib/db/repositories/products';
import { listPublishedProducts as listCatalogue } from '../lib/db/repositories/catalog';
import { reviewSellerApplication } from '../lib/db/repositories/seller-applications';
import { createBusinessSettingDraft, publishBusinessSettingDraft } from '../lib/db/repositories/business-settings';
import { getAcceptedManagedTerms } from '../lib/managed-commerce/accepted-terms';
import { activateManagedMakerForSimulation } from '../lib/managed-commerce/activation';
import { resolveRuntimeEnvironment } from '../lib/staging/environment';
import { addCartItem } from '../lib/db/repositories/cart';
import { createCodOrder } from '../lib/db/repositories/orders';
import { seedCheckoutBuyer } from './helpers/checkout-contact';
import { issueManagedInvoiceGroups } from '../lib/db/repositories/managed-documents';

async function readyMaker() {
  const f = await companyStoreMakerFixture();
  for (const [key, value] of [['managed_maker_program_mode', 'activation_enabled'],
    ['managed_maker_active_model', 'managed_sale_linked_percentage_v1']] as const) {
    const draft = await createBusinessSettingDraft(f.db, { key, value, actorId: 'reviewer', reason: 'Isolated company-store journey', requestId: `draft:${key}`, now: f.now });
    await publishBusinessSettingDraft(f.db, { id: draft.id, actorId: 'reviewer', expectedRevision: 1,
      reason: 'Enable isolated simulated journey', requestId: `publish:${key}`, effectiveFrom: f.now, now: f.now, simulationAllowed: true });
  }
  f.sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('craft','craft','Craft',1,1,1,1);
    INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('gift','gift','Gift',1,1,1,1);`);
  const productForm = new FormData();
  for (const [key, value] of Object.entries({ categoryId: 'craft', nameEn: 'Fictional cup', descriptionEn: 'A fictional handmade cup.',
    price: '1000', inventoryQuantity: '10', preparationDays: '1', occasionIds: 'gift' })) productForm.set(key, value);
  const parsed = parseProductSubmission(productForm); assert.ok(parsed.input, parsed.errors.join('\n'));
  await createProductSubmission(f.db, { productId: 'cup', sellerId: f.sellerId, actorId: f.actorId, slug: 'fictional-cup',
    input: parsed.input, workspaceMode: 'maker', now: f.now, images: Array.from({ length: 4 }, (_, index) => ({ id: `cup-photo-${index}`,
      objectKey: `private/product-media/maker/cup/photo-${index}`, originalName: `SIMULATED-${index}.png`, mimeType: 'image/png',
      sizeBytes: 100, altEn: 'Fictional cup', altNe: null, sortOrder: index })) });
  for (const action of ['start_review', 'approve'] as const) await reviewProduct(f.db, { productId: 'cup', actorId: 'reviewer', action,
    reason: 'Fictional listing reviewed independently', requestId: `review-product:${action}`, now: f.now + 1 });
  for (const action of ['start_review', 'approve_for_activation'] as const) await reviewSellerApplication(f.db, { sellerId: f.sellerId,
    actorId: 'reviewer', action, reason: 'Fictional no-PAN maker evidence reviewed', requestId: `review-maker:${action}`, now: f.now + 2 });
  const accepted = await getAcceptedManagedTerms(f.db, f.sellerId, f.now + 3); assert.ok(accepted);
  const activation = { sellerId: f.sellerId, actorId: 'reviewer', model: 'managed_sale_linked_percentage_v1' as const,
    legalSellerReference: accepted.snapshot.companyAccount.entityReference, invoiceIssuerReference: accepted.snapshot.companyAccount.entityReference,
    payoutBeneficiaryReference: 'SIM-REVIEWED-MAKER-RECEIVING', agreementVersion: accepted.agreementVersion,
    agreementLanguage: accepted.language, agreementAcceptedAt: accepted.acceptedAt, requestId: 'activate-fictional-maker', now: f.now + 3,
    environment: resolveRuntimeEnvironment({ runtimeEnvironment: 'local_staging', nodeEnvironment: 'development', appOrigin: 'http://localhost:3018' }) };
  return { ...f, activation, accepted };
}

test('new no-PAN maker reaches review activation publication and checkout', async () => {
  const f = await readyMaker();
  try {
    await activateManagedMakerForSimulation(f.db, f.activation);
    await reviewProduct(f.db, { productId: 'cup', actorId: 'reviewer', action: 'publish', reason: 'Publish fictional approved cup', requestId: 'publish-cup', now: f.now + 4 });
    assert.equal(f.sqlite.prepare("SELECT status FROM seller_profiles WHERE id='maker'").get()?.status, 'under_review');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id='maker-user' AND role='seller'").get()?.n, 0);
    assert.equal((await listPublishedProducts(f.db)).length, 1, 'shop must include active company-store makers');
    assert.equal(await countPublishedProducts(f.db), 1);
    assert.equal((await listCatalogue(f.db)).length, 1);
    assert.equal((await listHomepageLatestProducts(f.db)).length, 1);
    const product = await getPublishedProductBySlug(f.db, 'fictional-cup'); assert.ok(product);
    assert.equal(product.makerName, 'Fictional Maker Studio');
    assert.equal(product.storeName, f.accepted.snapshot.companyAccount.storeName);
    assert.equal(product.legalSellerName, f.accepted.snapshot.company.legalName);
    assert.equal(product.participationRoute, 'managed_maker');
    const cart = await addCartItem(f.db, 'fictional-cart', 'cup', 1, f.now + 5);
    assert.equal(cart.hasUnavailableItems, false);
    assert.equal(cart.items[0].legalSellerName, f.accepted.snapshot.company.legalName);
    await seedCheckoutBuyer(f.db, 'buyer', 'buyer@local.hastabazaar.test', '9811111111', f.now);
    const order = await createCodOrder(f.db, 'fictional-cart', 'fictional-receipt', {
      customerEmail: 'buyer@local.hastabazaar.test', customerPhone: '9811111111', customerAuthSubject: 'buyer', locale: 'en-NP',
      termsAccepted: true, idempotencyKey: 'fictional-checkout', address: { recipientName: 'Fictional buyer', phone: '9811111111',
        province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional test street' },
    }, f.now + 6, 'buyer');
    assert.ok(order.orderNumber);
    const snapshot = f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots').get();
    assert.equal(snapshot?.platform_retention_bps, 900);
    assert.equal(snapshot?.platform_retained_paisa, 9000);
    assert.equal(snapshot?.maker_entitlement_paisa, 91000);
    assert.equal(snapshot?.accepted_managed_detail_id, f.accepted.detailId);
    assert.equal(snapshot?.maker_name_snapshot, 'Fictional Maker Studio');
    assert.equal(snapshot?.company_store_name_snapshot, f.accepted.snapshot.companyAccount.storeName);
    assert.equal(f.sqlite.prepare('SELECT seller_name_snapshot AS seller FROM order_items').get()?.seller, f.accepted.snapshot.companyAccount.storeName);
    f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid',delivered_at=?").run(f.now + 7);
    assert.equal(await issueManagedInvoiceGroups(f.db, { orderId: String(f.sqlite.prepare('SELECT id FROM orders').get()?.id), requestId: 'fictional-invoice', now: f.now + 8 }), 1);
    const invoice = f.sqlite.prepare('SELECT snapshot_json AS json FROM managed_invoice_groups').get();
    const invoiceJson = JSON.parse(String(invoice?.json));
    assert.equal(invoiceJson.companySellingIdentity.companyAccount.storeName, f.accepted.snapshot.companyAccount.storeName);
    assert.equal(invoiceJson.companySellingIdentity.company.legalName, f.accepted.snapshot.company.legalName);
    const changedCompany = await createBusinessSettingDraft(f.db, { key: 'managed_maker_company_account',
      value: { ...f.accepted.snapshot.companyAccount, storeName: 'Fictional later company store' }, actorId: 'reviewer',
      reason: 'Isolated later company contact change', requestId: 'later-company-draft', now: f.now + 9 });
    await publishBusinessSettingDraft(f.db, { id: changedCompany.id, actorId: 'reviewer', expectedRevision: 1,
      effectiveFrom: f.now + 9, reason: 'Publish isolated later store identity', requestId: 'later-company-publish', now: f.now + 9 });
    assert.equal(await getAcceptedManagedTerms(f.db, f.sellerId, f.now + 10), null, 'new selling terms require renewed acceptance');
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots').get(), snapshot);
    assert.deepEqual(f.sqlite.prepare('SELECT snapshot_json AS json FROM managed_invoice_groups').get(), invoice);
    const publicJson = JSON.stringify({ product, cart });
    assert.ok(!publicJson.includes('government_id') && !publicJson.includes('identityDocument') && !publicJson.includes('personal_pan'));
  } finally { f.dispose(); }
});

test('activation cannot substitute staff company or agreement references for maker acceptance', async () => {
  const f = await readyMaker();
  try {
    await assert.rejects(activateManagedMakerForSimulation(f.db, { ...f.activation,
      legalSellerReference: 'SIM-UNACCEPTED-COMPANY', agreementVersion: 'SIM-UNACCEPTED-AGREEMENT' }), /accepted|agreement|company/i);
    assert.equal(f.sqlite.prepare("SELECT application_stage FROM seller_participation_profiles WHERE seller_id='maker'").get()?.application_stage, 'approved_for_activation');
  } finally { f.dispose(); }
});

test('program closure racing checkout leaves no order, entitlement or commercial snapshot', async () => {
  const f = await readyMaker();
  try {
    await activateManagedMakerForSimulation(f.db, f.activation);
    await reviewProduct(f.db, { productId: 'cup', actorId: 'reviewer', action: 'publish', reason: 'Publish fictional approved cup', requestId: 'race-publish-cup', now: f.now + 4 });
    await addCartItem(f.db, 'race-cart', 'cup', 1, f.now + 5);
    await seedCheckoutBuyer(f.db, 'buyer', 'buyer@local.hastabazaar.test', '9811111111', f.now);
    f.setBeforeBatch(() => { f.sqlite.prepare("UPDATE business_setting_versions SET status='cancelled' WHERE setting_key='managed_maker_program_mode'").run(); });
    await assert.rejects(createCodOrder(f.db, 'race-cart', 'race-receipt', {
      customerEmail: 'buyer@local.hastabazaar.test', customerPhone: '9811111111', customerAuthSubject: 'buyer', locale: 'en-NP',
      termsAccepted: true, idempotencyKey: 'race-checkout', address: { recipientName: 'Fictional buyer', phone: '9811111111',
        province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional test street' },
    }, f.now + 6, 'buyer'));
    for (const table of ['orders', 'managed_entitlements', 'managed_commercial_snapshots'])
      assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n, 0);
  } finally { f.dispose(); }
});
