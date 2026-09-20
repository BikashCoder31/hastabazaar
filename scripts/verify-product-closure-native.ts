import {archiveSellerProduct,deleteSellerProduct} from '../lib/db/repositories/products';
import {productClosureBlockers} from '../lib/db/repositories/product-closure';
import mysql from 'mysql2/promise';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {env as runtime} from '../lib/runtime/node-bindings';
const out='outputs/approved-four-2026-09-13T05-17-00-125Z';
const connection=await mysql.createConnection({host:'127.0.0.1',port:13316,user:'root',multipleStatements:true});
const name='closure_verify_'+Date.now();const password=crypto.randomUUID();const checks:string[]=[];
function pass(label:string){checks.push(label);console.log('PASS '+label);}
async function migrate(path:string){let delimiter=';',buffer='';for(const line of (await readFile(path,'utf8')).split('\n')){if(line.startsWith('DELIMITER ')){delimiter=line.slice(10).trim();continue;}buffer+=line+'\n';if(buffer.trimEnd().endsWith(delimiter)){const statement=buffer.trimEnd().slice(0,-delimiter.length);buffer='';if(statement.trim())await connection.query(statement);}}if(buffer.trim())await connection.query(buffer);}
const policy = {
  generalRequestWindowDays: 7,
  deliveryDamageEvidenceWindowHours: 48,
  changeOfMindEnabled: true,
  highValueRefundThresholdPaisa: 1_000_000,
  refundInitiationBusinessDays: 2,
  codRefundEstimateBusinessDays: [3, 7],
};



const now=Date.now();
async function seed(database:D1Database){
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
        `INSERT INTO orders (id, order_number, receipt_token_hash, customer_email, customer_phone, status, locale, currency, policy_version, return_policy_snapshot_json, shipping_address_json, item_subtotal_paisa, seller_discount_paisa, delivery_charge_paisa, buyer_platform_fee_paisa, tax_total_paisa, grand_total_paisa, payment_mode, payment_status, placed_at, delivered_at, created_at, updated_at) VALUES (?, ?, ?, 'customer@example.test', '9811111111', 'delivered', 'en-NP', 'NPR', 'phase-1.0', ?, '{}', ?, 0, 15000, 0, 0, ?, 'cod', 'paid', ?, ?, ?, ?)`,
      )
      .bind(
        orderId,
        number,
        token,
        JSON.stringify(policy),
        value,
        value + 15000,
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
        value + 15000,
        `pay-${orderId}`,
        now,
        now,
      )
      .run();
  }
}
try{
 await connection.query('CREATE DATABASE '+name);await connection.query('USE '+name);
 await connection.query('CREATE USER ?@? IDENTIFIED BY ?',[name,'127.0.0.1',password]);await connection.query('GRANT ALL ON '+name+'.* TO ?@?',[name,'127.0.0.1']);
 const manifest=JSON.parse(await readFile('deployment/babal/release-manifest.json','utf8'));for(const migration of manifest.migrations)await migrate(migration.path);
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'13316',DB_NAME:name,DB_USER:name,DB_PASSWORD:password});const db=runtime.DB as unknown as D1Database;await seed(db);
 const options={productId:'product-1',sellerId:'seller-1',actorId:'seller-user-1',now};
 assert.ok((await productClosureBlockers(db,options.productId,options.sellerId)).some(b=>b.kind==='earnings_review'));
 await assert.rejects(()=>archiveSellerProduct(db,options));pass('native missing earnings prevents closure');
 await db.prepare("UPDATE order_items SET fulfillment_status='cancelled' WHERE product_id='product-1'").run();assert.equal((await productClosureBlockers(db,options.productId,options.sellerId)).length,0);
 const batch=db.batch.bind(db);let injected=false;db.batch=async statements=>{if(!injected){injected=true;await connection.query("UPDATE order_items SET fulfillment_status='packing' WHERE product_id='product-1'");}return batch(statements);};
 await assert.rejects(()=>archiveSellerProduct(db,options));db.batch=batch;assert.equal((await db.prepare("SELECT status FROM products WHERE id='product-1'").first<{status:string}>())?.status,'published');pass('native concurrent obligation before mutation denies closure and audit');
 await db.prepare("UPDATE order_items SET fulfillment_status='cancelled' WHERE product_id='product-1'").run();await archiveSellerProduct(db,options);await deleteSellerProduct(db,options);
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM order_items WHERE product_id='product-1'").first<{n:number}>())?.n,1);pass('native cancellation-settled archive/delete retain history');
 await writeFile(out+'/product-closure-native.json',JSON.stringify({freshSyntheticDatabase:true,noSender:true,checks},null,2));
}catch(error){await writeFile(out+'/product-closure-native-failure.txt',error instanceof Error?error.stack??error.message:String(error));console.error(error);process.exitCode=1;}finally{await connection.end();setTimeout(()=>process.exit(process.exitCode??0),100).unref();}
