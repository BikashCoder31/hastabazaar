import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryMediaDb } from './helpers/category-media-db';
import { getPublishedProductBySlug } from '../lib/db/repositories/products';
import { createCodOrder, getOrderDocument, getOrderReceipt } from '../lib/db/repositories/orders';
import { getCart } from '../lib/db/repositories/cart';
import { readyCheckoutSeller } from './helpers/checkout-contact';
import { historicalCommissionFixture } from './helpers/historical-commission-fixture';
import { withReviewedPromoQuote } from './helpers/promo-checkout-fixture';

const importedName = 'Beige & Brown Handmade Crochet Bow Wallet';
const publicName = 'Beige & Brown Crochet Bow Wallet';
const now = 1_000;

async function fixture({ checkout = false } = {}) {
  const f = await categoryMediaDb();
  f.sqlite.exec(`
    INSERT INTO users(id,auth_subject,email,display_name,phone,locale,status,created_at,updated_at)
      VALUES ('buyer','buyer-subject','buyer@example.invalid','Fictional buyer','+9779811111111','en-NP','active',1,1);
    INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES
      ('seller-owner','seller-owner','seller-owner@example.invalid','Fictional seller owner','active',1,1),
      ('reviewer','reviewer','reviewer@example.invalid','Fictional reviewer','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES
      ('buyer','customer',1),('seller-owner','seller',1),('reviewer','super_admin',1);
    INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES ('buyer','buyer@example.invalid',1);
    INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,
      tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,
      payout_account_reference,status,approved_at,created_at,updated_at)
      VALUES ('seller','seller-owner','Fictional seller','Fictional shop','Local','FIX-REG','PAN','FIX-PAN','Seller',
      '9800000000','seller@example.invalid','Bagmati','Kathmandu','Kathmandu','Ward 1','FIX-PAYOUT','approved',1,1,1);
    INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
      VALUES ('category','fixture-category','Fixture',1,1,1,1);
    INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,
      producer,country_of_origin,origin_evidence_status,materials,return_eligible,status,created_at,updated_at)
      VALUES ('product','seller','category','fixture-product','FIX-SKU','Fixture product','Fictional item',
      82400,10,'','','unverified','',1,'published',1,1);
    INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at)
      VALUES ('cart','cart-token','NPR',253402300799999,1,1);
    INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('line','cart','product',2,1,1);
    INSERT INTO wallet_accounts(user_id,referral_code,created_at) VALUES ('buyer','FIX-REFERRAL',1);
  `);
  historicalCommissionFixture(f.sqlite, 'reviewer');
  if (checkout) {
    await readyCheckoutSeller({ database: f.db, sqlite: f.sqlite }, 'seller', 'seller-owner', 'reviewer');
    assert.equal((await getCart(f.db, 'cart-token')).hasUnavailableItems, false);
  }
  const input = await withReviewedPromoQuote(f.db, 'cart', {
    customerEmail: 'buyer@example.invalid', customerPhone: '9811111111', customerAuthSubject: 'buyer-subject',
    locale: 'en-NP' as const, termsAccepted: true, idempotencyKey: crypto.randomUUID(),
    address: {recipientName:'Fictional buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Ward 1'},
  }, now);
  return {...f,input};
}

void test('new checkout snapshots preserve the truthful public title, original source record, quantities and prices', async () => {
  const f = await fixture({ checkout: true });
  try {
    f.sqlite.prepare("UPDATE products SET name_en=? WHERE id='product'").run(importedName);
    const cart = await getCart(f.db,'cart-token');
    assert.equal(cart.items[0]?.nameEn,publicName);
    const placed = await createCodOrder(f.db,'cart-token','receipt-token',f.input,now,'buyer',undefined,'email_only');
    const savedItem = f.sqlite.prepare('SELECT product_name_snapshot,unit_price_paisa,quantity,line_total_paisa FROM order_items').get();
    const document = f.sqlite.prepare("SELECT id,snapshot_json FROM order_documents WHERE kind='order_statement'").get();
    assert.ok(document);
    const statement = JSON.parse(String(document.snapshot_json));
    // Check both storage paths before presentation can mask the regression.
    assert.equal(savedItem?.product_name_snapshot,publicName);
    assert.equal(statement.items[0]?.productName,publicName);
    assert.equal(savedItem?.unit_price_paisa,82400);
    assert.equal(savedItem?.quantity,2);
    assert.equal(savedItem?.line_total_paisa,164800);
    assert.equal(statement.itemSubtotalPaisa,164800);
    assert.equal(statement.grandTotalPaisa,placed.grandTotalPaisa);
    assert.equal(f.sqlite.prepare("SELECT name_en FROM products WHERE id='product'").get()?.name_en,importedName);
    const receipt = await getOrderReceipt(f.db,placed.orderNumber,'receipt-token');
    assert.equal(receipt?.items[0]?.productName,publicName);
    assert.equal((await getOrderDocument(f.db,placed.orderNumber,String(document.id),'receipt-token'))?.snapshot.items[0]?.productName,publicName);
    assert.deepEqual(await createCodOrder(f.db,'cart-token','receipt-token',f.input,now+1,'buyer',undefined,'email_only'),placed);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM orders').get()?.n,1);
  } finally { f.dispose(); }
});

void test('historical accepted item and statement snapshots are returned and replayed exactly as stored', async () => {
  const f = await fixture({ checkout: true });
  try {
    const placed = await createCodOrder(f.db,'cart-token','receipt-token',f.input,now,'buyer',undefined,'email_only');
    const document = f.sqlite.prepare("SELECT id,snapshot_json FROM order_documents WHERE kind='order_statement'").get();
    assert.ok(document);
    // Seed the historical accepted state in this disposable fixture only.
    const historical = JSON.parse(String(document.snapshot_json));
    historical.items[0].productName = importedName;
    const historicalJson = JSON.stringify(historical,null,2);
    f.sqlite.prepare('UPDATE order_items SET product_name_snapshot=?').run(importedName);
    f.sqlite.prepare('UPDATE order_documents SET snapshot_json=? WHERE id=?').run(historicalJson,document.id);
    f.sqlite.prepare("UPDATE products SET name_en=? WHERE id='product'").run(importedName);
    const beforeItems = f.sqlite.prepare('SELECT * FROM order_items').all();
    const beforeDocuments = f.sqlite.prepare('SELECT * FROM order_documents').all();
    const receipt = await getOrderReceipt(f.db,placed.orderNumber,'receipt-token');
    assert.equal(receipt?.items[0]?.productName,importedName);
    const accepted = await getOrderDocument(f.db,placed.orderNumber,String(document.id),'receipt-token');
    assert.deepEqual(accepted?.snapshot,historical);
    assert.equal(accepted?.snapshot.items[0]?.productName,importedName);
    assert.deepEqual(await createCodOrder(f.db,'cart-token','receipt-token',f.input,now+1,'buyer',undefined,'email_only'),placed);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM order_items').all(),beforeItems);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM order_documents').all(),beforeDocuments);
    assert.equal(f.sqlite.prepare('SELECT snapshot_json FROM order_documents WHERE id=?').get(document.id)?.snapshot_json,historicalJson);
  } finally { f.dispose(); }
});

for (const [label,country,specifications] of [
  ['blank origin','',null],
  ['legacy implicit Nepal','NP',null],
  ['unrecognized ASIN','','Model: ASIN B000000000'],
] as const) {
  void test(`same-title unrelated seller with ${label} cannot inherit imported source-country evidence`,async () => {
    const f = await fixture();
    try {
      f.sqlite.prepare("UPDATE products SET name_en='Handmade Crochet Rose Earrings',country_of_origin=?,specifications=? WHERE id='product'")
        .run(country,specifications);
      const product = await getPublishedProductBySlug(f.db,'fixture-product');
      assert.ok(product);
      assert.equal(product.originDisclosure,'Not yet confirmed');
      assert.equal(product.countryOfOrigin,'');
      assert.equal(product.originEvidenceStatus,'unverified');
      const source = f.sqlite.prepare("SELECT country_of_origin,specifications FROM products WHERE id='product'").get();
      assert.equal(source?.country_of_origin,country);
      assert.equal(source?.specifications,specifications);
    } finally { f.dispose(); }
  });
}

void test('explicit saved import ASIN preserves qualified source country without upgrading verification',async () => {
  const f = await fixture();
  try {
    f.sqlite.prepare("UPDATE products SET name_en='Handmade Crochet Rose Earrings',country_of_origin='NP',specifications='Model: ASIN B0GSKYMM3L' WHERE id='product'").run();
    const product = await getPublishedProductBySlug(f.db,'fixture-product');
    assert.ok(product);
    assert.equal(product.originDisclosure,'India (source listing; unverified)');
    assert.equal(product.countryOfOrigin,'India');
    assert.equal(product.originEvidenceStatus,'unverified');
    assert.equal(f.sqlite.prepare("SELECT country_of_origin FROM products WHERE id='product'").get()?.country_of_origin,'NP');
  } finally { f.dispose(); }
});

void test('same-title seller explicit origin declaration retains its own country and qualification',async () => {
  const f = await fixture();
  try {
    f.sqlite.prepare("UPDATE products SET name_en='Handmade Crochet Rose Earrings',country_of_origin='NP',origin_evidence_status='seller_declared' WHERE id='product'").run();
    const product = await getPublishedProductBySlug(f.db,'fixture-product');
    assert.ok(product);
    assert.equal(product.originDisclosure,'Nepal (seller declared)');
    assert.equal(product.countryOfOrigin,'NP');
    assert.equal(product.originEvidenceStatus,'seller_declared');
  } finally { f.dispose(); }
});
