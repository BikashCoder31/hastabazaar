import assert from 'node:assert/strict';
import test from 'node:test';
import { readyMaker } from './helpers/company-store-lifecycle-fixture';

import { reviewProduct, listPublishedProducts, countPublishedProducts,
  listHomepageLatestProducts, getPublishedProductBySlug } from '../lib/db/repositories/products';
import { listPublishedProducts as listCatalogue } from '../lib/db/repositories/catalog';

import { createBusinessSettingDraft, publishBusinessSettingDraft } from '../lib/db/repositories/business-settings';
import { getAcceptedManagedTerms, getManagedTermsOffers, acceptManagedTerms, managedTermsFormId } from '../lib/managed-commerce/accepted-terms';
import { activateManagedMakerForSimulation } from '../lib/managed-commerce/activation';

import { addCartItem, getCart } from '../lib/db/repositories/cart';
import { createCodOrder } from '../lib/db/repositories/orders';
import { seedCheckoutBuyer } from './helpers/checkout-contact';
import { issueManagedInvoiceGroups } from '../lib/db/repositories/managed-documents';
import {applyReadinessUpgrade,readReadinessManifest} from '../scripts/staging/company-store-readiness-upgrade.mjs';

void test('current accepted terms agree across discovery detail and an existing cart after a rate change',async()=>{
 const f=await readyMaker();
 try {
  await activateManagedMakerForSimulation(f.db,f.activation);
  await reviewProduct(f.db,{productId:'cup',actorId:'reviewer',action:'publish',reason:'Publish fictional terms renewal product',requestId:'renewal-product',now:f.now+4});
  await addCartItem(f.db,'renewal-cart','cup',1,f.now+5);
  const draft=await createBusinessSettingDraft(f.db,{key:'managed_sale_linked_platform_retention_bps',value:1200,actorId:'reviewer',reason:'Fictional retention renewal',requestId:'renewal-rate',now:f.now});
  await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:f.now+1000,reason:'Fictional new effective retention',requestId:'renewal-publish',now:f.now});
  assert.equal(await getAcceptedManagedTerms(f.db,f.sellerId,Date.now()),null);
  assert.equal(await countPublishedProducts(f.db),0);assert.deepEqual(await listPublishedProducts(f.db),[]);
  assert.deepEqual(await listCatalogue(f.db),[]);assert.deepEqual(await listHomepageLatestProducts(f.db),[]);
  assert.equal(await getPublishedProductBySlug(f.db,'fictional-cup'),null);
  assert.equal((await getCart(f.db,'renewal-cart')).hasUnavailableItems,true);
  applyReadinessUpgrade(f.sqlite,await readReadinessManifest(process.cwd()),'reviewer',f.now);
  const offer=(await getManagedTermsOffers(f.db,f.sellerId,Date.now())).current;
  const form=f.sqlite.prepare('SELECT id FROM form_config_versions WHERE form_id=?').get(managedTermsFormId);
  await acceptManagedTerms(f.db,{sellerId:f.sellerId,actorId:f.actorId,offerId:offer.id,context:offer.context,language:'en',requestId:'renewed-acceptance',now:Date.now(),
   form:{versionId:String(form?.id),answers:{formId:managedTermsFormId,version:1,answers:[]}}});
  assert.equal(await countPublishedProducts(f.db),1);assert.equal((await getCart(f.db,'renewal-cart')).hasUnavailableItems,false);
  assert.equal((await getPublishedProductBySlug(f.db,'fictional-cup'))?.storeName,offer.snapshot.companyAccount.storeName);
 }finally{f.dispose();}
});

void test('new no-PAN maker reaches review activation publication and checkout', async () => {
  const f = await readyMaker();
  try {
    const privateMarker=String(f.sqlite.prepare('SELECT government_id_description FROM managed_maker_application_details WHERE seller_id=?').get(f.sellerId)?.government_id_description);
    assert.equal(privateMarker,'PRIVATE-GOVERNMENT-IDENTITY-QA-ONLY');
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
    assert.ok(!publicJson.includes(privateMarker)&&!publicJson.includes(f.activation.payoutBeneficiaryReference),'Private values must not leak under other public keys');
  } finally { f.dispose(); }
});

void test('activation cannot substitute staff company or agreement references for maker acceptance', async () => {
  const f = await readyMaker();
  try {
    await assert.rejects(activateManagedMakerForSimulation(f.db, { ...f.activation,
      legalSellerReference: 'SIM-UNACCEPTED-COMPANY', agreementVersion: 'SIM-UNACCEPTED-AGREEMENT' }), /accepted|agreement|company/i);
    assert.equal(f.sqlite.prepare("SELECT application_stage FROM seller_participation_profiles WHERE seller_id='maker'").get()?.application_stage, 'approved_for_activation');
  } finally { f.dispose(); }
});

void test('program closure racing checkout leaves no order, entitlement or commercial snapshot', async () => {
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
