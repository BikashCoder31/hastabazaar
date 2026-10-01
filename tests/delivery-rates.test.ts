import assert from 'node:assert/strict';
import { readdir,readFile } from 'node:fs/promises';
import {DatabaseSync,type SQLInputValue,type StatementSync} from 'node:sqlite';
import test from 'node:test';
import {SELLER_AGREEMENT_VERSION} from '../lib/content/legal-policies';
import {getDeliveryEstimate} from '../lib/checkout/validation';
import {getDeliveryRates,saveDeliveryRates} from '../lib/db/repositories/delivery-rates';
import {getCart} from '../lib/db/repositories/cart';
import {prepareSellerParcels,operateParcel,parcelCashRecords} from '../lib/operations/parcels';
const policy = {
  generalRequestWindowDays: 7,
  deliveryDamageEvidenceWindowHours: 48,
  changeOfMindEnabled: true,
  highValueRefundThresholdPaisa: 1_000_000,
  refundInitiationBusinessDays: 2,
  codRefundEstimateBusinessDays: [3, 7],
};


const now=Date.now();
void test('Super Admin rate page explains distinct-store pricing without the superseded single-fee claim',async()=>{
  const source=await readFile(new URL('../app/admin/delivery-rates/page.tsx',import.meta.url),'utf8');
  assert.match(source,/first distinct store/i);
  assert.match(source,/additional distinct store adds 50%/i);
  assert.doesNotMatch(source,/regardless of seller or parcel count/i);
});
async function databaseFixture() {
  const sqlite = new DatabaseSync(':memory:');
  const database = new TestD1Database(sqlite);
  const names = (await readdir(new URL('../drizzle/', import.meta.url)))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const name of names) {
    const sql = await readFile(
      new URL(`../drizzle/${name}`, import.meta.url),
      'utf8',
    );
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((value) => value.trim())
      .filter(Boolean)) {
      sqlite.exec(statement);
    }
  }
  const users = [
    ['seller-user-1', 'seller1@example.test', 'Seller One'],
    ['seller-user-2', 'seller2@example.test', 'Seller Two'],
    ['admin-1', 'admin@example.test', 'Admin One'],
    ['super-1', 'super1@example.test', 'Super One'],
    ['super-2', 'super2@example.test', 'Super Two'],
  ] as const;
  for (const [id, email, name] of users) {
    await database
      .prepare(
        `INSERT INTO users (id, auth_subject, email, display_name, locale, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'en-NP', 'active', ?, ?)`,
      )
      .bind(id, id, email, name, now, now)
      .run();
  }
  for (const [userId, role] of [
    ['seller-user-1', 'seller'],
    ['seller-user-2', 'seller'],
    ['admin-1', 'admin'],
    ['super-1', 'super_admin'],
    ['super-2', 'super_admin'],
  ] as const) {
    await database
      .prepare(
        `INSERT INTO user_roles (user_id, role, assigned_at) VALUES (?, ?, ?)`,
      )
      .bind(userId, role, now)
      .run();
  }
  for (const [id, userId, suffix] of [
    ['seller-1', 'seller-user-1', '1'],
    ['seller-2', 'seller-user-2', '2'],
  ] as const) {
    await database
      .prepare(
        `INSERT INTO seller_profiles (id, user_id, legal_name, trading_name, registration_authority, registration_number, tax_mode, tax_registration_number, representative_name, support_phone, support_email, province, district, municipality, locality, payout_account_reference, status, approved_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'Local', ?, 'PAN', ?, 'Representative', '9800000000', ?, 'Madhesh', 'Dhanusha', 'Janakpur', 'Ward 1', ?, 'approved', ?, ?, ?)`,
      )
      .bind(
        id,
        userId,
        `Maker ${suffix}`,
        `Shop ${suffix}`,
        `REG-${suffix}`,
        `PAN-${suffix}`,
        `shop${suffix}@example.test`,
        `BANK-${suffix}`,
        now - 100 * 86_400_000,
        now,
        now,
      )
      .run();
  }
  await database
    .prepare(
      `UPDATE seller_profiles SET seller_agreement_version = ?, seller_agreement_accepted_at = ? WHERE status = 'approved'`,
    )
    .bind(SELLER_AGREEMENT_VERSION, now)
    .run();
  await database
    .prepare(
      `INSERT INTO categories (id, slug, name_en, is_active, sort_order, created_at, updated_at) VALUES ('cat', 'test', 'Test', 1, 1, ?, ?)`,
    )
    .bind(now, now)
    .run();
  for (const [id, sellerId, price, stock] of [
    ['product-1', 'seller-1', 100_000, 10],
    ['product-2', 'seller-2', 2_000_000, 10],
    ['product-3', 'seller-1', 200_000, 10],
  ] as const) {
    await database
      .prepare(
        `INSERT INTO products (id, seller_id, category_id, slug, sku, name_en, description_en, price_paisa, inventory_quantity, producer, country_of_origin, materials, return_eligible, status, created_at, updated_at) VALUES (?, ?, 'cat', ?, ?, ?, 'Test product', ?, ?, 'Maker', 'NP', 'Natural fibre', 1, 'published', ?, ?)`,
      )
      .bind(id, sellerId, id, id, id, price, stock, now, now)
      .run();
  }
  for (const [
    orderId,
    number,
    token,
    itemId,
    productId,
    sellerId,
    sellerName,
    value,
  ] of [
    [
      'order-1',
      'HK-TEST-1',
      'receipt-hash-1',
      'item-1',
      'product-1',
      'seller-1',
      'Shop 1',
      100_000,
    ],
    [
      'order-2',
      'HK-TEST-2',
      'receipt-hash-2',
      'item-2',
      'product-2',
      'seller-2',
      'Shop 2',
      2_000_000,
    ],
    [
      'order-3',
      'HK-TEST-3',
      'receipt-hash-3',
      'item-3',
      'product-3',
      'seller-1',
      'Shop 1',
      200_000,
    ],
  ] as const) {
    await database
      .prepare(
        `INSERT INTO orders (id, order_number, receipt_token_hash, customer_email, customer_phone, status, locale, currency, policy_version, return_policy_snapshot_json, shipping_address_json, item_subtotal_paisa, seller_discount_paisa, delivery_charge_paisa, buyer_platform_fee_paisa, tax_total_paisa, grand_total_paisa, payment_mode, payment_status, placed_at, delivered_at, created_at, updated_at) VALUES (?, ?, ?, 'customer@example.test', '9811111111', 'delivered', 'en-NP', 'NPR', 'phase-1.0', ?, '{}', ?, 0, 15_000, 0, 0, ?, 'cod', 'paid', ?, ?, ?, ?)`,
      )
      .bind(
        orderId,
        number,
        token,
        JSON.stringify(policy),
        value,
        value + 15_000,
        now - 86_400_000,
        now - 3_600_000,
        now,
        now,
      )
      .run();
    await database
      .prepare(
        `INSERT INTO order_items (id, order_id, product_id, seller_id, seller_name_snapshot, product_name_snapshot, sku_snapshot, unit_price_paisa, quantity, seller_discount_paisa, commission_bps, commission_paisa, tax_paisa, line_total_paisa, return_eligible_snapshot, fulfillment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1200, ?, 0, ?, 1, 'delivered', ?)`,
      )
      .bind(
        itemId,
        orderId,
        productId,
        sellerId,
        sellerName,
        productId,
        productId,
        value,
        Math.round(value * 0.12),
        value,
        now,
      )
      .run();
    await database
      .prepare(
        `INSERT INTO payments (id, order_id, provider, method, status, amount_paisa, currency, idempotency_key, created_at, updated_at) VALUES (?, ?, 'manual_cod', 'cod', 'captured', ?, 'NPR', ?, ?, ?)`,
      )
      .bind(
        `payment-${orderId}`,
        orderId,
        value + 15_000,
        `pay-${orderId}`,
        now,
        now,
      )
      .run();
  }
  return { database, dispose: async () => sqlite.close() };
}

class TestD1PreparedStatement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
  async all<T>() {
    return {
      results: this.statement.all(...this.values) as T[],
      success: true,
      meta: {},
    };
  }
  async run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes) },
      results: [],
    };
  }
}

class TestD1Database {
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    return new TestD1PreparedStatement(this.sqlite.prepare(sql));
  }
  async batch(statements: readonly TestD1PreparedStatement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}


void test('versioned rates retain defaults and district precedence; only Super Admin can save',async()=>{
 const f=await databaseFixture();const db=f.database as unknown as D1Database;try{
 const original=await getDeliveryRates(db);assert.equal(getDeliveryEstimate('Kathmandu',[],original)?.chargePaisa,15000);
 const next={...original,zones:{...original.zones,valley:17000},districts:{Kathmandu:19000}};
 await assert.rejects(()=>saveDeliveryRates(db,{actorId:'admin-1',expectedVersion:original.version,rates:next,reason:'Owner changed tariff',now}));
 await saveDeliveryRates(db,{actorId:'super-1',expectedVersion:original.version,rates:next,reason:'Owner changed tariff',now});
 const saved=await getDeliveryRates(db);assert.notEqual(saved.version,original.version);
 assert.equal(getDeliveryEstimate('Kathmandu',[1,4],saved)?.chargePaisa,19000);assert.equal(getDeliveryEstimate('Lalitpur',[],saved)?.chargePaisa,17000);assert.equal(getDeliveryEstimate('Dhanusha',[],saved)?.chargePaisa,18000);assert.equal(getDeliveryEstimate('Dolpa',[],saved)?.chargePaisa,25000);
 assert.equal(getDeliveryEstimate('Kathmandu',[],original)?.chargePaisa,15000);
 await assert.rejects(()=>saveDeliveryRates(db,{actorId:'super-1',expectedVersion:original.version,rates:next,reason:'Stale tariff update',now}));
 assert.equal((await getDeliveryRates(db)).version,saved.version);
 const audits=await db.prepare("SELECT actor_id AS actor,subject_id AS subject,previous_json AS previous,next_json AS next FROM audit_logs WHERE action='delivery.rates.updated'").all<{actor:string;subject:string;previous:string;next:string}>();
 assert.equal(audits.results.length,1);assert.equal(audits.results[0].actor,'super-1');assert.equal(audits.results[0].subject,saved.version);assert.deepEqual(JSON.parse(audits.results[0].previous),{version:original.version});assert.deepEqual(JSON.parse(audits.results[0].next),{version:saved.version});
 }finally{await f.dispose();}
});
void test('parcel courier costs are separate and leave financial and fulfillment records unchanged',async()=>{
 const f=await databaseFixture();const db=f.database as unknown as D1Database;try{
 await db.prepare("UPDATE orders SET status='confirmed' WHERE id='order-1'").run();
 await prepareSellerParcels(db,{orderId:'order-1',actorId:'admin-1',requestId:'setup-cost',now});
 const parcel=await db.prepare('SELECT shipping_job_id AS id FROM shipping_parcels LIMIT 1').first<{id:string}>();assert.ok(parcel);
 const before=await db.prepare("SELECT * FROM orders WHERE id='order-1'").first();const ledger=await db.prepare('SELECT COUNT(*) AS n FROM seller_ledger_entries').first();
 const operation={jobId:parcel.id,actorId:'admin-1',requestId:'cost-one',version:0,action:'record_cost',note:'Actual courier invoice received',reference:'invoice-cost-1',amountPaisa:22000,now};
 await operateParcel(db,operation);await operateParcel(db,operation);
 assert.deepEqual(await db.prepare("SELECT * FROM orders WHERE id='order-1'").first(),before);assert.deepEqual(await db.prepare('SELECT COUNT(*) AS n FROM seller_ledger_entries').first(),ledger);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM parcel_courier_costs').first<{n:number}>())?.n,1);
 assert.equal((await parcelCashRecords(db,'order-1')).find(r=>r.kind==='courier_cost')?.reference,'invoice-cost-1');
 await assert.rejects(()=>db.prepare("UPDATE parcel_courier_costs SET amount_paisa=1 WHERE id='cost-one'").run());
 await assert.rejects(()=>operateParcel(db,{...operation,requestId:'invalid-negative-cost',version:1,amountPaisa:-1}));
 await assert.rejects(()=>operateParcel(db,{...operation,requestId:'cost-two',reference:'invoice-cost-2'}));
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM parcel_courier_costs').first<{n:number}>())?.n,1);
 }finally{await f.dispose();}
});

import {createCodOrder,CheckoutConflictError,getOrderReceipt} from '../lib/db/repositories/orders';
import {getOperationsOrderDetail} from '../lib/db/repositories/fulfillment';
async function checkoutCart(db:D1Database){
 await db.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('rate-cart','rate-token','NPR',?,?)").bind(now,now).run();
 for(const id of ['product-1','product-2'])await db.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES (?,'rate-cart',?,2,?,?)").bind('rate-'+id,id,now,now).run();
}
void test('checkout cart exposes stable seller identity for distinct-store pricing',async()=>{const f=await databaseFixture();try{const db=f.database as unknown as D1Database;await checkoutCart(db);assert.deepEqual((await getCart(db,'rate-token')).items.map((item)=>item.sellerId).sort(),['seller-1','seller-2']);}finally{await f.dispose();}});
function checkoutInput(version:string){return {deliveryRateVersion:version,customerEmail:'buyer@example.test',customerPhone:'9811111111',locale:'en-NP' as const,termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Local QA'}};}
void test('checkout snapshots the two-store surcharge; later changes and idempotent retry preserve totals',async()=>{
 const f=await databaseFixture();const db=f.database as unknown as D1Database;try{
 await checkoutCart(db);const initial=await getDeliveryRates(db);const input=checkoutInput(initial.version);
 const order=await createCodOrder(db,'rate-token','rate-receipt',input,now);
 const row=await db.prepare('SELECT delivery_charge_paisa AS charge,delivery_rate_snapshot_json AS snapshot FROM orders WHERE order_number=?').bind(order.orderNumber).first<{charge:number;snapshot:string}>();assert.equal(row?.charge,22500);assert.deepEqual(JSON.parse(row!.snapshot),{version:initial.version,district:'Kathmandu',band:'valley',zone:'valley',pricingPolicy:'base_plus_half_per_additional_store_v1',baseChargePaisa:15000,storeCount:2,chargePaisa:22500});
 const receipt=await getOrderReceipt(db,order.orderNumber,'rate-receipt');const operations=await getOperationsOrderDetail(db,(await db.prepare('SELECT id FROM orders WHERE order_number=?').bind(order.orderNumber).first<{id:string}>())!.id);const expectedPricing={pricingPolicy:'base_plus_half_per_additional_store_v1',baseChargePaisa:15000,originalStoreCount:2,currentStoreCount:2};assert.deepEqual((receipt as unknown as {deliveryPricing:unknown})?.deliveryPricing,expectedPricing);assert.deepEqual((operations as unknown as {deliveryPricing:unknown})?.deliveryPricing,expectedPricing);
 await saveDeliveryRates(db,{actorId:'super-1',expectedVersion:initial.version,rates:{...initial,zones:{...initial.zones,valley:24000}},reason:'Changed future delivery tariff',now:now+1});
 assert.deepEqual({...await createCodOrder(db,'rate-token','rate-receipt',input,now+2)},order);
 assert.deepEqual(await db.prepare('SELECT delivery_charge_paisa AS charge,delivery_rate_snapshot_json AS snapshot FROM orders WHERE order_number=?').bind(order.orderNumber).first(),row);
 for(const id of ['product-1','product-2'])await db.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES (?,'rate-cart',?,1,?,?)").bind('new-rate-'+id,id,now,now).run();
 await assert.rejects(()=>createCodOrder(db,'rate-token','new-receipt',checkoutInput(initial.version),now),CheckoutConflictError);
 const changed=await createCodOrder(db,'rate-token','new-receipt',checkoutInput((await getDeliveryRates(db)).version),now);
 assert.equal((await db.prepare('SELECT delivery_charge_paisa AS charge FROM orders WHERE order_number=?').bind(changed.orderNumber).first<{charge:number}>())?.charge,36000);
 await assert.rejects(()=>db.prepare('UPDATE delivery_rate_versions SET reason=? WHERE id=?').bind('Tamper',initial.version).run());
 }finally{await f.dispose();}
});
void test('receipt store count uses seller identity when two stores share a display name',async()=>{const f=await databaseFixture();try{const db=f.database as unknown as D1Database;await db.prepare("UPDATE seller_profiles SET trading_name='Shared display name' WHERE id IN ('seller-1','seller-2')").run();await checkoutCart(db);const rates=await getDeliveryRates(db);const order=await createCodOrder(db,'rate-token','same-name-receipt',checkoutInput(rates.version),now);const receipt=await getOrderReceipt(db,order.orderNumber,'same-name-receipt');assert.equal(receipt?.deliveryPricing?.currentStoreCount,2);}finally{await f.dispose();}});
void test('rate change between quote and checkout batch rolls back order, inventory and cart changes',async()=>{
 const f=await databaseFixture();const db=f.database as unknown as D1Database;try{
 await checkoutCart(db);const initial=await getDeliveryRates(db);const inventory=await db.prepare('SELECT id,inventory_quantity FROM products ORDER BY id').all();const orders=await db.prepare('SELECT COUNT(*) AS n FROM orders').first();
 const originalBatch=f.database.batch.bind(f.database);let injected=false;
 f.database.batch=async statements=>{if(!injected){injected=true;await saveDeliveryRates({prepare:db.prepare.bind(db),batch:originalBatch} as unknown as D1Database,{actorId:'super-1',expectedVersion:initial.version,rates:{...initial,zones:{...initial.zones,valley:26000}},reason:'Concurrent tariff change',now});}return originalBatch(statements);};
 await assert.rejects(()=>createCodOrder(db,'rate-token','rate-receipt',checkoutInput(initial.version),now),CheckoutConflictError);
 assert.deepEqual(await db.prepare('SELECT COUNT(*) AS n FROM orders').first(),orders);assert.deepEqual((await db.prepare('SELECT id,inventory_quantity FROM products ORDER BY id').all()).results,inventory.results);assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM cart_items WHERE cart_id='rate-cart'").first<{n:number}>())?.n,2);
 }finally{await f.dispose();}
});

void test('invalid rates and revoked Super Admin authority cannot create a tariff version',async()=>{
 const f=await databaseFixture();const db=f.database as unknown as D1Database;try{
 const initial=await getDeliveryRates(db);const options={actorId:'super-1',expectedVersion:initial.version,rates:initial,reason:'Reviewed tariff update',now};
 for(const rates of [{...initial,zones:{...initial.zones,valley:-1}},{...initial,zones:{...initial.zones,valley:1.5}},{...initial,districts:{Unknown:100}},{...initial,districts:{Kathmandu:NaN}}])await assert.rejects(()=>saveDeliveryRates(db,{...options,rates}));
 await db.prepare("UPDATE users SET status='suspended' WHERE id='super-1'").run();await assert.rejects(()=>saveDeliveryRates(db,options));
 assert.equal((await getDeliveryRates(db)).version,initial.version);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM delivery_rate_versions').first<{n:number}>())?.n,1);
 }finally{await f.dispose();}
});
