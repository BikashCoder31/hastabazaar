import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import {getRecordedProgress} from '../lib/db/repositories/business-activity';
import mysql from 'mysql2/promise';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {env as runtime} from '../lib/runtime/node-bindings';
import {inspectReadiness} from '../lib/operations/readiness';
import {prepareSellerParcels,operateParcel,listParcels} from '../lib/operations/parcels';
import {createExceptionWork,updateExceptionWork,listExceptionWork} from '../lib/operations/exception-work';
const out='outputs/consolidated-local-20260913-042936';
const connection=await mysql.createConnection({host:'127.0.0.1',port:13316,user:'root',multipleStatements:true});
const name='exception_verify_'+Date.now();const password=crypto.randomUUID();const checks:string[]=[];
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
 const manifest=JSON.parse(await readFile('deployment/babal/release-manifest.json','utf8'));for(const migration of manifest.migrations)await migrate(migration.path);await migrate('deployment/babal/mariadb-exception-work.sql');
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'13316',DB_NAME:name,DB_USER:name,DB_PASSWORD:password});const db=runtime.DB as unknown as D1Database;
 assert.equal((await inspectReadiness(db)).ready,true);await seed(db);pass('fresh isolated MariaDB full manifest plus repeatable R022 migration and readiness');
 await db.prepare("UPDATE orders SET status='confirmed' WHERE id='order-1'").run();await prepareSellerParcels(db,{orderId:'order-1',actorId:'admin-1',requestId:'setup-native',now});
 const job=await db.prepare("SELECT id FROM shipping_jobs WHERE order_id='order-1' LIMIT 1").first<{id:string}>();assert.ok(job);await db.prepare("UPDATE shipping_jobs SET status='delivery_failed' WHERE id=?").bind(job.id).run();
 const base={actorId:'admin-1',jobId:job.id,kind:'failed_delivery',nextAction:'Review source and arrange the authorized next attempt.',note:'Synthetic failed-delivery report references the existing parcel state.',requestId:'native-create',now};
 const id=await createExceptionWork(db,base);assert.equal(await createExceptionWork(db,{...base,now:now+1}),id);
 await assert.rejects(()=>createExceptionWork(db,{...base,actorId:'seller-user-1',requestId:'wrong-actor'}));
 await assert.rejects(()=>updateExceptionWork(db,{id,actorId:'admin-1',version:0,ownerId:'seller-user-1',nextAction:base.nextAction,note:'Invalid owner denied.',requestId:'wrong-owner',now}));pass('native reporter/owner permissions and timestamp-independent replay');
 const update={id,actorId:'admin-1',version:0,ownerId:'super-1',nextAction:base.nextAction,note:'Assigned reviewer owns follow-up.',requestId:'native-assign',now};
 const race=await Promise.allSettled([update,{...update,requestId:'native-assign-other',ownerId:'super-2'}].map(o=>updateExceptionWork(db,o)));
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);const current=(await listExceptionWork(db,'admin-1'))[0];assert.equal(current.version,1);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM exception_work_events WHERE work_id=?').bind(id).first<{n:number}>())?.n,2);
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM notification_messages WHERE template_key='business.exception.assigned'").first<{n:number}>())?.n,2);pass('native concurrent assignment commits one version/history and two queued channels only');
 await assert.rejects(()=>db.prepare('UPDATE exception_work_events SET note=? WHERE work_id=?').bind('Synthetic rewrite',id).run());await assert.rejects(()=>db.prepare('DELETE FROM exception_work_events WHERE work_id=?').bind(id).run());pass('native exception history rejects update and delete');
 const resolution={id,actorId:current.ownerId!,version:1,ownerId:current.ownerId,nextAction:'Document completed follow-up without changing settlement.',note:'Synthetic evidence reviewed by assigned owner.',requestId:'native-resolve',now,resolve:true,evidence:'Synthetic evidence demonstrates the order workflow completed independently.',checks:{sourceReviewed:true,obligationsReviewed:true,followupComplete:true}};
 await assert.rejects(()=>updateExceptionWork(db,resolution));await db.prepare("UPDATE shipping_jobs SET status='delivered' WHERE id=?").bind(job.id).run();await updateExceptionWork(db,resolution);assert.equal((await listExceptionWork(db,'admin-1'))[0].status,'resolved');pass('native source progression and explicit resolution evidence guard');
 await db.prepare("INSERT INTO parcel_cash_records(id,shipping_job_id,kind,amount_paisa,evidence_reference,status,created_by,created_at) VALUES ('native-cash',?,'collection',100,'native-cash-ref','posted','admin-1',?)").bind(job.id,now).run();
 const cashId=await createExceptionWork(db,{...base,kind:'incorrect_cash',cashRecordId:'native-cash',ownerId:'super-1',requestId:'native-cash-case'});
 const cashBefore=await db.prepare("SELECT * FROM parcel_cash_records WHERE id='native-cash'").first();
 await assert.rejects(()=>updateExceptionWork(db,{...resolution,id:cashId,version:0,actorId:'super-1',ownerId:'super-1',requestId:'native-cash-resolve'}));assert.deepEqual(await db.prepare("SELECT * FROM parcel_cash_records WHERE id='native-cash'").first(),cashBefore);pass('native incorrect-cash resolution blocked and posted record unchanged');
 const parcelBefore=(await listParcels(db,'order-1'))[0];const originalBatch=db.batch.bind(db);let revoked=false;db.batch=async statements=>{if(!revoked){revoked=true;await connection.execute("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin-1','[]',1,'super-1',?)",[now]);}return originalBatch(statements);};
 await assert.rejects(()=>operateParcel(db,{jobId:parcelBefore.id,actorId:'admin-1',version:parcelBefore.version,action:'record_cost',amountPaisa:100,reference:'revoked-native-cost',note:'Profile revoked after initial repository read.',requestId:'native-profile-race',now}));db.batch=originalBatch;
 assert.equal((await listParcels(db,'order-1'))[0].version,parcelBefore.version);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM parcel_courier_costs').first<{n:number}>())?.n,0);
 await assert.rejects(()=>prepareSellerPayout(db,{sellerId:'seller-2',actorId:'admin-1',actorRole:'admin',note:'Revoked repository permission.',requestId:'native-payout-revoked',now}));
 pass('native parcel permission revocation before commit rolls back and revoked payout preparation rejects');
 await connection.execute("DELETE FROM staff_permission_profiles WHERE user_id='admin-1'");
 await db.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin-1','[]',1,'super-1',?)").bind(now).run();await assert.rejects(()=>listExceptionWork(db,'admin-1'));await assert.rejects(()=>createExceptionWork(db,{...base,requestId:'native-revoked'}));pass('native revoked operations permissions block reads and writes');
 const progress=await getRecordedProgress(db,{id:'super-1',role:'super_admin'},{},now);assert.equal(progress.groups.find(g=>g.action==='exception.resolved')?.count,1);assert.ok(!progress.groups.some(g=>g.action==='exception.assigned'));pass('native per-person progress counts only explicit completed recorded steps');
 await writeFile(out+'/exception-native-current.json',JSON.stringify({localOnly:true,freshSyntheticDatabase:true,emailSenderInvoked:false,checks},null,2));
}catch(error){await writeFile(out+'/exception-native-failure.txt',error instanceof Error?error.stack??error.message:String(error));console.error('Native exception verification failed; synthetic diagnostic saved.');process.exitCode=1;}finally{await connection.end();setTimeout(()=>process.exit(process.exitCode??0),100).unref();}
