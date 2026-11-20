import assert from 'node:assert/strict';
import test from 'node:test';
import { addOfferCartLine } from '../lib/cart/offer-cart';
import { createCodOrder, getOrderReceipt } from '../lib/db/repositories/orders';
import { getSellerOrderDetail, transitionSellerFulfillment } from '../lib/db/repositories/fulfillment';
import { confirmFirstCodReview, getFirstCodReview } from '../lib/orders/first-cod-review';
import { verifyPassword } from '../lib/auth/hosted-session';
import { getPublicOfferSet } from '../lib/products/public-offers';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { assertCommerceRuntime, commerceRuntime, prepareCommerceBrowser, waitForPackagedStaffEnrollment } from '../scripts/testing/commerce-browser-fixture.mjs';
import type { Page } from 'playwright-core';

void test('staff enrollment wait accepts both auth continuation outcomes and rejects unrelated URLs', async () => {
  const origin = 'http://127.0.0.1:43210';
  let matches: ((url: URL) => boolean) | undefined;
  const page = { waitForURL: async (predicate: (url: URL) => boolean) => { matches = predicate; } } as unknown as Page;
  await waitForPackagedStaffEnrollment(page, origin);
  assert.ok(matches);
  for (const path of ['/security', '/security?return_to=%2Fsecurity']) {
    assert.equal(matches(new URL(path, origin)), true, path);
  }
  for (const address of [
    'http://127.0.0.1:43211/security', 'https://127.0.0.1:43210/security',
    'http://example.test/security', '/security/other', '/security/', '/admin',
    '/security?return_to=', '/security?return_to=%2Fadmin',
    '/security?return_to=https%3A%2F%2Fexample.test', '/security?return_to=%2F%2Fexample.test',
    '/security?return_to=%252Fsecurity', '/security?return_to=%2Fsecurity&return_to=%2Fadmin',
    '/security?return_to=%2Fsecurity&return_to=%2Fsecurity', '/security?unexpected=1',
    '/security?return_to=%2Fsecurity&unexpected=1', '/security#unexpected',
  ]) assert.equal(matches(new URL(address, origin)), false, address);
});

void test('commerce fixture rejects an incorrect transport before invoking ownership or writing', async () => {
  let consulted = false;
  await assert.rejects(prepareCommerceBrowser({
    db: {} as D1Database,
    runtime: { ...commerceRuntime, HASTABAZAAR_MAIL_MODE: 'send' },
    assertOwned: async () => { consulted = true; },
  }, 'unused'), /HASTABAZAAR_MAIL_MODE/);
  assert.equal(consulted, false);
  assert.throws(() => assertCommerceRuntime({ ...commerceRuntime, HASTABAZAAR_PAYMENT_MODE: 'live' }), /HASTABAZAAR_PAYMENT_MODE/);
  await assert.rejects(prepareCommerceBrowser({
    db: {} as D1Database, runtime: commerceRuntime,
    assertOwned: async () => { throw new Error('Wrong database epoch'); },
  }, 'unused'), /Wrong database epoch/);
});

void test('isolated preparation creates credentialed actors and two orderable physical variants', async () => {
  const f = await completeVersionFixture();
  try {
    const scope = { db: f.db, runtime: commerceRuntime, assertOwned: async () => {
      assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    } };
    f.sqlite.exec('CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY REFERENCES users(id), password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, password_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    const originalOrders = f.sqlite.prepare('SELECT * FROM orders ORDER BY id').all();
    const prepared = await prepareCommerceBrowser(scope, 'reviewer');
    const actors = [prepared.buyer, prepared.foreignBuyer, prepared.seller, prepared.foreignSeller];
    assert.equal(new Set(actors.map(actor => actor.id)).size, 4);
    for (const actor of actors) {
      assert.match(actor.email, /@local\.hastabazaar\.test$/);
      const credential = f.sqlite.prepare('SELECT password_hash,password_salt FROM user_credentials WHERE user_id=?').get(actor.id);
      assert.ok(credential);
      assert.equal(await verifyPassword(actor.password, String(credential.password_hash), String(credential.password_salt)), true);
    }
    const offers = await getPublicOfferSet(f.db, prepared.productId);
    assert.ok(offers?.orderable);
    assert.ok(offers.offers.every(offer => offer.orderable));
    assert.deepEqual(offers.offers.map(offer => offer.id).sort(), prepared.variants.map(offer => offer.id).sort());
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM orders ORDER BY id').all(), originalOrders);
    const now = Date.now(), cart = 'fictional-isolated-variant-cart';
    for (const offer of offers.offers) await addOfferCartLine(f.db, cart, {
      productId: prepared.productId, offerId: offer.id, versionId: offers.versionId,
      publicVersionId: offers.publicVersionId, pricePaisa: offer.pricePaisa, quantity: 1,
      requestId: 'cart-' + offer.id,
    }, now);
    const placed = await createCodOrder(f.db, cart, 'fictional-isolated-variant-receipt', {
      customerAuthSubject: prepared.buyer.id, customerEmail: prepared.buyer.email, customerPhone: '9811111111',
      locale: 'en-NP', termsAccepted: true, idempotencyKey: 'isolated-variant-order',
      address: { recipientName: 'Fictional Commerce Recipient', phone: '9811111111', province: 'Bagmati',
        district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional Commerce Ward' },
    }, now, prepared.buyer.id);
    const order = f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(placed.orderNumber);
    assert.ok(order);
    const orderId = String(order.id);
    assert.ok(await getOrderReceipt(f.db, placed.orderNumber, null, prepared.buyer.id));
    assert.equal(await getOrderReceipt(f.db, placed.orderNumber, null, prepared.foreignBuyer.id), null);
    assert.equal(await getSellerOrderDetail(f.db, orderId, prepared.foreignSeller.sellerId), null);
    const before = await getSellerOrderDetail(f.db, orderId, prepared.seller.sellerId);
    assert.equal(before?.items.length, 2);
    const itemIds = before.items.map(item => item.id);
    const sql = 'SELECT s.* FROM order_item_offer_snapshots s JOIN order_items i ON i.id=s.order_item_id WHERE i.order_id=? ORDER BY s.offer_id';
    const snapshots = f.sqlite.prepare(sql).all(orderId);
    assert.deepEqual(snapshots.map(row => row.offer_id), prepared.variants.map(variant => variant.id).sort());
    assert.equal((await getFirstCodReview(f.db, orderId))?.status, 'pending');
    await confirmFirstCodReview(f.db, { orderId, actorId: 'reviewer', reason: 'Verified fictional buyer and order.',
      requestId: 'isolated-first-cod', now });
    for (const action of ['start_packing', 'ready_for_pickup'] as const) {
      await transitionSellerFulfillment(f.db, { orderId, sellerId: prepared.seller.sellerId, actorId: prepared.seller.id,
        action, itemIds, note: 'Prepare only the two exact fictional selected items.', requestId: 'isolated-' + action, now });
    }
    const after = await getSellerOrderDetail(f.db, orderId, prepared.seller.sellerId);
    assert.deepEqual(after?.items.map(item => item.fulfillmentStatus), ['ready_for_pickup', 'ready_for_pickup']);
    assert.deepEqual(after?.items.map(item => item.lineTotalPaisa), before.items.map(item => item.lineTotalPaisa));
    assert.deepEqual(f.sqlite.prepare(sql).all(orderId), snapshots);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM orders WHERE id<>? ORDER BY id').all(orderId), originalOrders);
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    f.dispose();
  }
});


void test('J5 source contract rejects missing original references and invalid money', async()=>{
  const {assertFinanceSourceIdentity}=await import('../scripts/testing/commerce-browser-fixture.mjs');
  const original={orderId:'o',orderNumber:'HB-FICTIONAL',sellerId:'s',buyerId:'c',parcelId:'p',remittanceClaimId:'r',duePaisa:100};
  assert.doesNotThrow(()=>assertFinanceSourceIdentity(original));
  for(const duePaisa of [0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>assertFinanceSourceIdentity({...original,duePaisa}));
  for(const key of ['orderId','orderNumber','sellerId','buyerId','parcelId','remittanceClaimId'])assert.throws(()=>assertFinanceSourceIdentity({...original,[key]:''}));
});
