import {submitRiderReport,issueRiderOtp,verifyRiderOtp,saveRiderPolicy} from '../lib/riders/repository';
import {prepareSellerParcels,operateParcel,listParcels} from '../lib/operations/parcels';
import mysql from 'mysql2/promise';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {env as runtime} from '../lib/runtime/node-bindings';
const out='outputs/approved-four-2026-09-13T05-17-00-125Z';
const connection=await mysql.createConnection({host:'127.0.0.1',port:13316,user:'root',multipleStatements:true});
const name='rider_verify_'+Date.now();const password=crypto.randomUUID();const checks:string[]=[];
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
 await connection.query('CREATE DATABASE '+name);await connection.query('USE '+name);await connection.query('CREATE USER ?@? IDENTIFIED BY ?',[name,'127.0.0.1',password]);await connection.query('GRANT ALL ON '+name+'.* TO ?@?',[name,'127.0.0.1']);
 const manifest=JSON.parse(await readFile('deployment/babal/release-manifest.json','utf8'));for(const migration of manifest.migrations)await migrate(migration.path);if(!manifest.migrations.some((m:{path:string})=>m.path.includes('rider')))await migrate('deployment/babal/mariadb-verified-riders.sql');
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'13316',DB_NAME:name,DB_USER:name,DB_PASSWORD:password});const db=runtime.DB as unknown as D1Database;await seed(db);
 await db.prepare("UPDATE orders SET status='confirmed' WHERE id='order-1'").run();await db.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id='order-1'").run();await prepareSellerParcels(db,{orderId:'order-1',actorId:'admin-1',requestId:'setup',now});
 await db.prepare("INSERT INTO rider_profiles(user_id,status,application_id,updated_at) VALUES ('seller-user-1','approved','synthetic-application',?)").bind(now).run();let parcel=(await listParcels(db,'order-1'))[0];
 await operateParcel(db,{jobId:parcel.id,actorId:'admin-1',requestId:'assign',version:parcel.version,action:'assign',method:'own_rider',riderEmail:'seller1@example.test',trackingCode:'SYN-NATIVE',note:'Synthetic verified rider assigned.',now});parcel=(await listParcels(db,'order-1'))[0];await operateParcel(db,{jobId:parcel.id,actorId:'admin-1',requestId:'dispatch',version:parcel.version,action:'dispatch',note:'Synthetic parcel dispatch.',now});parcel=(await listParcels(db,'order-1'))[0];
 await db.prepare("UPDATE orders SET status='cancelled' WHERE id='order-1'").run();await assert.rejects(()=>submitRiderReport(db,{riderId:'seller-user-1',jobId:parcel.id,version:parcel.version,kind:'customer_unavailable',note:'Cancelled parent cannot accept rider evidence.',cashPaisa:0,key:null,mime:null,requestId:'cancelled-source',openBox:false,now}));await db.prepare("UPDATE orders SET status='dispatched' WHERE id='order-1'").run();await db.prepare("UPDATE shipping_jobs SET status='dispatched' WHERE id=?").bind(parcel.id).run();await db.prepare("UPDATE shipping_parcels SET method='own_rider',rider_user_id='seller-user-1' WHERE shipping_job_id=?").bind(parcel.id).run();parcel=(await listParcels(db,'order-1'))[0];pass('native cancelled order denies dispatched-job reporting');
 const report=await submitRiderReport(db,{riderId:'seller-user-1',jobId:parcel.id,version:parcel.version,kind:'customer_unavailable',note:'Synthetic customer unavailable report awaiting staff decision.',cashPaisa:0,key:null,mime:null,requestId:'report',openBox:false,now});assert.equal((await listParcels(db,'order-1'))[0].status,'dispatched');
 await operateParcel(db,{jobId:parcel.id,actorId:'admin-1',requestId:'confirm-failure',version:parcel.version,action:'fail',riderReportId:report,note:'Staff reviewed and confirmed failure evidence.',now});assert.equal((await listParcels(db,'order-1'))[0].status,'delivery_failed');const work=await db.prepare("SELECT id,owner_id AS owner FROM exception_work_items WHERE shipping_job_id=?").bind(parcel.id).first<{id:string;owner:string}>();assert.ok(work);assert.equal(work.owner,'admin-1');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM parcel_cash_records').first<{n:number}>())?.n,0);pass('native staff-confirmed failure seeds assigned exception without cash mutation');
 await assert.rejects(()=>db.prepare("UPDATE rider_reports SET note='rewrite' WHERE id=?").bind(report).run());await assert.rejects(()=>db.prepare('DELETE FROM rider_events').run());await assert.rejects(()=>db.prepare("UPDATE rider_reports SET id='mutated' WHERE id=?").bind(report).run());await assert.rejects(()=>db.prepare("UPDATE rider_reports SET status='pending' WHERE id=?").bind(report).run());await assert.rejects(()=>db.prepare("UPDATE rider_reports SET review_note='changed' WHERE id=?").bind(report).run());pass('native rider report identity, terminal decision and event evidence immutable');
 parcel=(await listParcels(db,'order-1'))[0];await operateParcel(db,{jobId:parcel.id,actorId:'admin-1',requestId:'retry',version:parcel.version,action:'retry',note:'Authorized next delivery attempt.',now});parcel=(await listParcels(db,'order-1'))[0];await db.prepare("UPDATE orders SET payment_mode='online' WHERE id='order-1'").run();await db.prepare("UPDATE rider_policy SET otp_scope='prepaid_only'").run();
 const code=await issueRiderOtp(db,{jobId:parcel.id,customerId:null,receiptTokenHash:'receipt-hash-1',now});assert.equal(await verifyRiderOtp(db,{jobId:parcel.id,riderId:'seller-user-1',version:parcel.version,code:code.code,now:now+1}),true);assert.equal(await verifyRiderOtp(db,{jobId:parcel.id,riderId:'seller-user-1',version:parcel.version,code:code.code,now:now+2}),false);pass('native receipt-authorized optional OTP verifies once without delivery');
 
 const later=now+700000;const locked=await issueRiderOtp(db,{jobId:parcel.id,customerId:null,receiptTokenHash:'receipt-hash-1',now:later});const wrong=locked.code==='000000'?'111111':'000000';for(let i=0;i<5;i++)assert.equal(await verifyRiderOtp(db,{jobId:parcel.id,riderId:'seller-user-1',version:parcel.version,code:wrong,now:later+1}),false);assert.equal(await verifyRiderOtp(db,{jobId:parcel.id,riderId:'seller-user-1',version:parcel.version,code:locked.code,now:later+2}),false);await assert.rejects(()=>issueRiderOtp(db,{jobId:parcel.id,customerId:null,receiptTokenHash:'wrong',now:later}));pass('native OTP five-attempt bound and wrong receipt rejection');
 await saveRiderPolicy(db,{actorId:'super-1',version:0,openBox:false,otpScope:'off',now:later});assert.equal((await db.prepare('SELECT otp_scope AS scope FROM rider_policy_versions WHERE version=1').first<{scope:string}>())?.scope,'off');await assert.rejects(()=>db.prepare("UPDATE rider_policy_versions SET open_box=1 WHERE version=1").run());await assert.rejects(()=>db.prepare('DELETE FROM rider_policy_versions WHERE version=1').run());const riderMigration=manifest.migrations.find((m:{path:string})=>m.path.includes('verified-riders'));if(riderMigration)await migrate(riderMigration.path);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM rider_policy_versions').first<{n:number}>())?.n,2);pass('native policy snapshot immutable and repeated migration preserves history');
 await db.prepare("UPDATE orders SET payment_mode='cod' WHERE id='order-1'").run();await assert.rejects(()=>issueRiderOtp(db,{jobId:parcel.id,customerId:null,receiptTokenHash:'receipt-hash-1',now:later}));
 const delivery=await submitRiderReport(db,{riderId:'seller-user-1',jobId:parcel.id,version:parcel.version,kind:'delivered',note:'Synthetic delivery proof and collected cash awaiting independent staff confirmation.',cashPaisa:100,key:'synthetic-proof',mime:'image/jpeg',requestId:'delivery-report',openBox:false,now:later});assert.equal((await listParcels(db,'order-1'))[0].collectedPaisa,0);
 const originalBatch=db.batch.bind(db);let revoked=false;db.batch=async statements=>{if(!revoked){revoked=true;await connection.query("UPDATE rider_profiles SET status='suspended' WHERE user_id='seller-user-1'");}return originalBatch(statements);};await assert.rejects(()=>operateParcel(db,{jobId:parcel.id,actorId:'admin-1',requestId:'revoked-confirm',version:parcel.version,action:'deliver',riderReportId:delivery,note:'Staff attempted verification while approval was revoked.',now:later}));db.batch=originalBatch;assert.equal((await listParcels(db,'order-1'))[0].collectedPaisa,0);assert.equal((await db.prepare('SELECT status FROM rider_reports WHERE id=?').bind(delivery).first<{status:string}>())?.status,'pending');await db.prepare("UPDATE rider_profiles SET status='approved' WHERE user_id='seller-user-1'").run();
 await operateParcel(db,{jobId:parcel.id,actorId:'admin-1',requestId:'confirm-delivery',version:parcel.version,action:'deliver',riderReportId:delivery,note:'Staff confirmed evidence and actual cash receipt.',now:later});const delivered=(await listParcels(db,'order-1'))[0];assert.equal(delivered.status,'delivered');assert.equal(delivered.collectedPaisa,100);assert.equal(delivered.remittedPaisa,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM parcel_cash_records').first<{n:number}>())?.n,1);pass('native suspension race rolls back; independent delivery confirmation posts cash once without remittance');
 await writeFile(out+'/rider-repository-native.json',JSON.stringify({freshSyntheticDatabase:true,noSender:true,checks},null,2));
}catch(error){await writeFile(out+'/rider-repository-native-failure.txt',error instanceof Error?error.stack??error.message:String(error));console.error(error);process.exitCode=1;}finally{await connection.end();setTimeout(()=>process.exit(process.exitCode??0),100).unref();}
