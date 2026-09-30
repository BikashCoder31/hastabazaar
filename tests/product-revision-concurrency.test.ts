import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {DatabaseSync,type SQLInputValue,type StatementSync} from 'node:sqlite';
import test from 'node:test';
import {createProductSubmission,getSellerProductForRevision,reviseAndResubmitProduct,ProductRevisionConflictError} from '../lib/db/repositories/products';
import type {ProductSubmissionInput,ProductImageUpload} from '../lib/products/submission';
const policy = {
  generalRequestWindowDays: 7,
  deliveryDamageEvidenceWindowHours: 48,
  changeOfMindEnabled: true,
  highValueRefundThresholdPaisa: 1_000_000,
  refundInitiationBusinessDays: 2,
  codRefundEstimateBusinessDays: [3, 7],
};


const now=Date.now();
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



const media=(id:string,mimeType='image/jpeg'):ProductImageUpload=>({id,objectKey:'test/'+id,originalName:id,mimeType,sizeBytes:100,altEn:'Test',altNe:null,sortOrder:4});
async function insertMedia(db:D1Database,id:string,type='image/jpeg'){await db.prepare("INSERT INTO product_media(id,product_id,object_key,original_name,mime_type,size_bytes,alt_en,sort_order,created_at) VALUES (?,'product-1',?,?,?,100,'Test',0,?)").bind(id,'test/'+id,id,type,now).run();}
async function options(db:D1Database){await db.prepare("UPDATE products SET status='needs_changes',review_request_id='review-first',warranty='Existing workmanship guarantee' WHERE id='product-1'").run();const current=await getSellerProductForRevision(db,'seller-1','product-1');assert.ok(current);assert.equal(current.reviewRequestId,'review-first');return {productId:'product-1',sellerId:'seller-1',actorId:'seller-user-1',input:{...current,returnEligible:!!current.returnEligible,madeToOrder:!!current.madeToOrder,sku:'UNTRUSTED-SKU',producer:'Untrusted maker',materials:['Untrusted material']} as ProductSubmissionInput,images:[media('new-photo')],previousInventory:current.inventoryQuantity,expectedReviewRequestId:'review-first',now};}
void test('revision accepts more than five photos and keeps the complete media set',async()=>{const f=await databaseFixture();const db=f.database as unknown as D1Database;try{
 const o=await options(db);for(let i=0;i<5;i++)await insertMedia(db,'photo-'+i);
 await reviseAndResubmitProduct(db,o);
 assert.equal((await db.prepare("SELECT status FROM products WHERE id='product-1'").first<{status:string}>())?.status,'submitted');
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM product_media WHERE product_id='product-1'").first<{n:number}>())?.n,6);
 }finally{await f.dispose();}});
void test('revision rejects a second video and stale review token after admin re-review',async()=>{const f=await databaseFixture();const db=f.database as unknown as D1Database;try{
 const o=await options(db);await insertMedia(db,'old-video','video/mp4');await assert.rejects(()=>reviseAndResubmitProduct(db,{...o,images:[media('second-video','video/mp4')]}),ProductRevisionConflictError);
 await db.prepare("UPDATE products SET review_request_id='new-review' WHERE id='product-1'").run();await assert.rejects(()=>reviseAndResubmitProduct(db,{...o,images:[]}),ProductRevisionConflictError);
 }finally{await f.dispose();}});
void test('valid revision preserves seller identity, SKU, warranty and photos while allowing product materials to change',async()=>{const f=await databaseFixture();const db=f.database as unknown as D1Database;try{
 const o=await options(db);for(let i=0;i<4;i++)await insertMedia(db,'old-photo-'+i);const before=await db.prepare("SELECT sku,producer,materials,warranty FROM products WHERE id='product-1'").first();
 await reviseAndResubmitProduct(db,{...o,images:[]});const after=await db.prepare("SELECT sku,producer,materials,warranty FROM products WHERE id='product-1'").first<{sku:string;producer:string;materials:string;warranty:string}>();assert.equal(after?.sku,(before as {sku:string}).sku);assert.equal(after?.producer,(before as {producer:string}).producer);assert.equal(after?.warranty,(before as {warranty:string}).warranty);assert.equal(after?.materials,'Untrusted material');assert.equal((await db.prepare("SELECT status FROM products WHERE id='product-1'").first<{status:string}>())?.status,'submitted');assert.ok(await db.prepare("SELECT id FROM product_media WHERE id='old-photo-0'").first());
 }finally{await f.dispose();}});

void test('generated SKU collision retries atomically without changing an existing claim or accepting a supplied SKU',async(t)=>{const f=await databaseFixture();const db=f.database as unknown as D1Database;try{
 const o=await options(db);const collision='11111111-1111-4111-8111-111111111111';const claimed='HB-'+collision.replaceAll('-','').toUpperCase();await db.prepare('INSERT INTO product_sku_claims(sku,product_id) VALUES (?,?)').bind(claimed,'historical-owner').run();
 const original=crypto.randomUUID.bind(crypto);let first=true;t.mock.method(crypto,'randomUUID',()=>{if(first){first=false;return collision;}return original();});
 await createProductSubmission(db,{productId:'new-generated-product',sellerId:o.sellerId,actorId:o.actorId,slug:'new-generated-product',input:o.input,images:Array.from({length:4},(_,i)=>media('new-generated-photo-'+i)),now});
 const created=await db.prepare("SELECT sku FROM products WHERE id='new-generated-product'").first<{sku:string}>();assert.ok(created);assert.match(created.sku,/^HB-[A-F0-9]{32}$/);assert.notEqual(created.sku,claimed);assert.notEqual(created.sku,o.input.sku);
 assert.equal((await db.prepare('SELECT product_id AS owner FROM product_sku_claims WHERE sku=?').bind(claimed).first<{owner:string}>())?.owner,'historical-owner');assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='product.submitted' AND subject_id='new-generated-product'").first<{n:number}>())?.n,1);assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM product_media WHERE product_id='new-generated-product'").first<{n:number}>())?.n,4);
 }finally{await f.dispose();}});

void test('an unrelated revision retains omitted translations while explicit empty translations clear them', async () => {
 const f=await databaseFixture(); const db=f.database as unknown as D1Database;
 try {
  const o=await options(db); for(let i=0;i<4;i++)await insertMedia(db,'translation-photo-'+i);
  await db.prepare("UPDATE products SET name_ne='Nepali name', description_ne='Nepali description' WHERE id='product-1'").run();
  const input={...o.input}; delete input.nameNe; delete input.descriptionNe;
  await reviseAndResubmitProduct(db,{...o,input,images:[]});
  const row=await db.prepare("SELECT name_ne, description_ne FROM products WHERE id='product-1'").first();
  assert.deepEqual({...row},{name_ne:'Nepali name',description_ne:'Nepali description'});
  const next=await getSellerProductForRevision(db,'seller-1','product-1');assert.ok(next);
  await db.prepare("UPDATE products SET status='needs_changes' WHERE id='product-1'").run();
  await reviseAndResubmitProduct(db,{...o,input:{...input,nameNe:null,descriptionNe:null},images:[],expectedReviewRequestId:next.reviewRequestId});
  assert.deepEqual({...await db.prepare("SELECT name_ne, description_ne FROM products WHERE id='product-1'").first()},{name_ne:null,description_ne:null});
 } finally {await f.dispose();}
});
