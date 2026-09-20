import assert from 'node:assert/strict';
import {deliverOrderEmails} from '../lib/email/order-updates';
import {findOrderTracking} from '../lib/db/repositories/order-tracking';
import { readFile, writeFile } from 'node:fs/promises';
import { createHostedSession } from '../lib/auth/hosted-session';
import mysql from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import {
  ensureWallet,
  getWallet,
  releaseReferralRewards,
} from '../lib/db/repositories/wallet';
import { createCodOrder } from '../lib/db/repositories/orders';
import { transitionAdminFulfillment, transitionSellerFulfillment } from '../lib/db/repositories/fulfillment';

// Intentionally fixed to a disposable localhost database. Never accepts production connection settings.
const connection = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13316,
  user: 'root',
  multipleStatements: true,
});
const name = 'wallet_test_' + Date.now();
await connection.query(`CREATE DATABASE ${name}`);
await connection.query(`USE ${name}`);
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '13316';
process.env.DB_NAME = name;
process.env.DB_USER = 'root';
// The local test instance has no password; the runtime requires a nonempty value, so create an isolated test user.
const password = crypto.randomUUID();
await connection.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [
  name,
  '127.0.0.1',
  password,
]);
await connection.query(`GRANT ALL ON ${name}.* TO ?@?`, [name, '127.0.0.1']);
process.env.DB_USER = name;
process.env.DB_PASSWORD = password;

async function migrate(sql: string) {
  let delimiter = ';',
    buffer = '';
  for (const line of sql.split('\n')) {
    if (line.startsWith('DELIMITER ')) {
      delimiter = line.slice(10).trim();
      continue;
    }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length);
      buffer = '';
      if (statement.trim()) await connection.query(statement);
    }
  }
  if (buffer.trim()) await connection.query(buffer);
}
try {
  await connection.query(
    await readFile('deployment/babal/mariadb-schema.sql', 'utf8'),
  );
  await migrate(
    await readFile('deployment/babal/mariadb-referrals-wallet.sql', 'utf8'),
  );
  await migrate(
    await readFile('deployment/babal/mariadb-referrals-wallet.sql', 'utf8'),
  );
  await migrate(await readFile('deployment/babal/mariadb-order-updates.sql','utf8'));
  await migrate(await readFile('deployment/babal/mariadb-order-updates.sql','utf8'));
  await connection.query(await readFile('deployment/babal/mariadb-review-photos-replies.sql','utf8'));
  await connection.query(await readFile('deployment/babal/mariadb-review-photos-replies.sql','utf8'));
  await migrate(await readFile('deployment/babal/mariadb-product-deletions.sql','utf8'));
  await migrate(await readFile('deployment/babal/mariadb-identity-purchase-security.sql','utf8'));
  await migrate(await readFile('deployment/babal/mariadb-identity-purchase-security.sql','utf8'));
  await migrate(await readFile('deployment/babal/mariadb-parcel-operations.sql','utf8'));
  await migrate(await readFile('deployment/babal/mariadb-parcel-operations.sql','utf8'));
  const db = env.DB;
  const now = Date.now();
  await connection.query(
    `INSERT INTO users(id,email,display_name,locale,status,created_at,updated_at) VALUES ('referrer','referrer@example.test','Referrer','en-NP','active',?,?),('friend','friend@example.test','Friend','en-NP','active',?,?)`,
    [now, now, now, now],
  );
  await ensureWallet(db, 'referrer', now);
  await ensureWallet(db, 'friend', now);
  await connection.query(
    `INSERT INTO orders(id,order_number,receipt_token_hash,customer_id,customer_email,customer_phone,status,locale,currency,policy_version,shipping_address_json,item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,delivered_at,created_at,updated_at)
  VALUES ('o','HK-WALLET-TEST','test','friend','friend@example.test','9812345678','delivered','en-NP','NPR','phase-1.0','{}',150000,0,15000,0,0,155000,'cod','paid',?,?,?,?)`,
    [now, now - 8 * 86400000, now, now],
  );
  await connection.query(
    `INSERT INTO payments(id,order_id,provider,method,status,amount_paisa,currency,idempotency_key,created_at,updated_at) VALUES ('p','o','manual_cod','cod','captured',155000,'NPR','pt',?,?)`,
    [now, now],
  );
  await connection.query(
    `INSERT INTO referral_redemptions(customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at) VALUES ('friend','referrer','o','9812345678',10000,7,?)`,
    [now],
  );
  await Promise.all([
    releaseReferralRewards(db, 'referrer', now),
    releaseReferralRewards(db, 'referrer', now),
  ]);
  assert.equal((await getWallet(db, 'referrer', now)).balancePaisa, 10000);
  const spend = (id: string) =>
    db.batch([
      db
        .prepare(
          `INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES (?,'referrer','o',-8000,8000,'order_spend',?)`,
        )
        .bind(id, now),
    ]);
  const attempts = await Promise.allSettled([spend('s1'), spend('s2')]);
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await getWallet(db, 'referrer', now)).balancePaisa, 2000);
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT SUM(amount_paisa) AS total FROM wallet_entries',
  );
  assert.equal(Number(rows[0].total), 2000);
  await assert.rejects(
    connection.query("DELETE FROM wallet_entries WHERE id='s1' OR id='s2'"),
    /immutable/,
  );
  await connection.query(
    `INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,approved_at,created_at,updated_at)
  VALUES ('seller','friend','Test maker','Test shop','Local','REG-TEST','PAN','TEST-PAN','Test','9812345678','friend@example.test','Madhesh','Dhanusha','Janakpur','Ward 1','TEST','approved',?,?,?)`,
    [now, now, now],
  );
  await connection.query(
    `INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','wallet-test','Test',1,0,?,?)`,
    [now, now],
  );
  await connection.query(
    `INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
  VALUES ('product','seller','cat','wallet-product','TEST-SKU','Test','Test',100000,10,'Maker','NP','Cotton',1,'published',?,?)`,
    [now, now],
  );
  await connection.query(
    `INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','ct','NPR',?,?)`,
    [now, now],
  );
  await connection.query(
    `INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('ci','cart','product',1,?,?)`,
    [now, now],
  );
  const input = {
    customerEmail: 'referrer@example.test',
    customerPhone: '9898765432',
    locale: 'en-NP' as const,
    termsAccepted: true,
    idempotencyKey: crypto.randomUUID(),
    useWallet: true,
    address: {
      recipientName: 'Referrer',
      phone: '9898765432',
      province: 'Madhesh',
      district: 'Dhanusha',
      municipality: 'Janakpur',
      locality: 'Ward 1',
    },
  };
  await connection.query("UPDATE products SET preparation_days=5, made_to_order=1, return_conditions='Unused and undamaged in original packaging. Custom engraving excluded.' WHERE id='product'");
  const order = await createCodOrder(db, 'ct', 'rt', input, now, 'referrer');
  assert.equal(order.estimatedMinDays, 7);
  assert.equal(order.estimatedMaxDays, 10);
  assert.equal(order.grandTotalPaisa, 116000);
  const stored = await db
    .prepare('SELECT id FROM orders WHERE order_number=?')
    .bind(order.orderNumber)
    .first<{ id: string }>();
  const stock = () =>
    db
      .prepare(
        "SELECT inventory_quantity AS stock FROM products WHERE id='product'",
      )
      .first<{ stock: number }>();
  assert.equal((await stock())?.stock, 9);
  assert.equal((await getWallet(db, 'referrer', now)).balancePaisa, 0);
  await transitionAdminFulfillment(db, {
    orderId: stored!.id,
    action: 'cancel',
    actorId: 'friend',
    note: 'Test cancellation',
    requestId: crypto.randomUUID(),
    now,
  });
  assert.equal((await stock())?.stock, 10);
  assert.equal((await getWallet(db, 'referrer', now)).balancePaisa, 2000);
  const tracking=await findOrderTracking(db,order.orderNumber,input.customerEmail);
  assert.equal(tracking?.status,'cancelled');
  assert.equal(await findOrderTracking(db,order.orderNumber,'wrong@example.test'),null);
  const queued=await db.prepare('SELECT COUNT(*) AS n FROM order_email_jobs WHERE order_id=?').bind(stored!.id).first<{n:number}>();
  assert.equal(queued?.n,2,'confirmation and cancellation queued atomically');
  let sent=0;
  const mail={send:async()=>{sent++;}};
  await Promise.all([deliverOrderEmails(db,mail,'https://hastabazaar.com',{orderId:stored!.id}),deliverOrderEmails(db,mail,'https://hastabazaar.com',{orderId:stored!.id})]);
  assert.equal(sent,2,'concurrent processors must not duplicate emails');
  await deliverOrderEmails(db,mail,'https://hastabazaar.com',{orderId:stored!.id});
  assert.equal(sent,2);
  console.log('MariaDB: repeatable order email migration, atomic status queue, concurrent delivery claims and private tracking passed.');
  await connection.query("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart-active','ct-active','NPR',?,?)",[now,now]);
  await connection.query("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('ci-active','cart-active','product',1,?,?)",[now,now]);
  const activeOrder=await createCodOrder(db,'ct-active','rt-active',{...input,idempotencyKey:crypto.randomUUID(),useWallet:false},now,'referrer');
  const active=await db.prepare('SELECT id FROM orders WHERE order_number=?').bind(activeOrder.orderNumber).first<{id:string}>();
  for(const action of ['start_packing','ready_for_pickup'] as const){
    await transitionSellerFulfillment(db,{orderId:active!.id,sellerId:'seller',actorId:'friend',action,note:'Local fulfillment test',requestId:crypto.randomUUID(),now:now+1000});
  }
  await transitionAdminFulfillment(db,{orderId:active!.id,actorId:'friend',action:'dispatch',note:'Local dispatch test',trackingCode:'HB-LOCAL-TRACKING',requestId:crypto.randomUUID(),now:now+2000});
  const activeTracking=await findOrderTracking(db,activeOrder.orderNumber,input.customerEmail);
  assert.equal(activeTracking?.status,'dispatched');
  assert.equal(activeTracking?.trackingCode,'HB-LOCAL-TRACKING');
  const activeJobs=await db.prepare('SELECT order_status AS status FROM order_email_jobs WHERE order_id=?').bind(active!.id).all<{status:string}>();
  assert.deepEqual(activeJobs.results.map(j=>j.status).sort(),['confirmed','packing','ready_for_pickup','dispatched'].sort());
  console.log('MariaDB: actual packing, pickup and dispatch transitions queue the correct emails and tracking history.');
  const fiftyMigration = await readFile('deployment/babal/mariadb-referral-offer-fifty.sql','utf8');
  await migrate(fiftyMigration);
  const {getReferralCampaign} = await import('../lib/db/repositories/wallet');
  assert.equal((await getReferralCampaign(db)).friendDiscountPaisa,5000);
  assert.equal((await getReferralCampaign(db)).rewardPaisa,5000);
  assert.equal((await db.prepare("SELECT reward_paisa AS amount FROM referral_redemptions WHERE order_id='o'").first<{amount:number}>())?.amount,10000);
  await connection.query("UPDATE referral_campaign SET reward_paisa=7000,enabled=0 WHERE id='default'");
  await migrate(fiftyMigration);
  assert.equal((await getReferralCampaign(db)).rewardPaisa,7000);
  assert.equal((await getReferralCampaign(db)).enabled,0);
  await connection.query("UPDATE referral_campaign SET reward_paisa=5000,enabled=1 WHERE id='default'");
  await connection.query("INSERT INTO users(id,email,display_name,locale,status,created_at,updated_at) VALUES ('invitee50','invitee50@example.test','Local invited customer','en-NP','active',?,?)",[now,now]);
  await connection.query("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart-fifty','ct-fifty','NPR',?,?)",[now,now]);
  await connection.query("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('ci-fifty','cart-fifty','product',2,?,?)",[now,now]);
  const referralCode = (await getWallet(db,'referrer',now)).referralCode;
  const fiftyOrder=await createCodOrder(db,'ct-fifty','rt-fifty',{...input,customerEmail:'invitee50@example.test',customerPhone:'9876543210',idempotencyKey:crypto.randomUUID(),useWallet:false,referralCode},now,'invitee50');
  assert.equal(fiftyOrder.grandTotalPaisa,213000);
  assert.equal((await db.prepare("SELECT reward_paisa AS amount FROM referral_redemptions WHERE customer_id='invitee50'").first<{amount:number}>())?.amount,5000);
  console.log('MariaDB: NPR 50 discount and reward applied to a new COD referral; original NPR 100 snapshot preserved; repeat migration preserves later campaign settings.');
  if (process.argv.includes('--preview')) {
    await transitionAdminFulfillment(db,{orderId:active!.id,actorId:'friend',action:'deliver',note:'Local delivered review fixture',requestId:crypto.randomUUID(),now:now+3000});
    const reviewItem=await db.prepare('SELECT id FROM order_items WHERE order_id=? LIMIT 1').bind(active!.id).first<{id:string}>();
    await connection.query("UPDATE users SET auth_subject=id WHERE id='friend'");
    await connection.query("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('friend','seller',?)",[now]);
    const sellerToken=await createHostedSession(db,'friend');
    await connection.query(
      "UPDATE users SET auth_subject=id WHERE id='referrer'",
    );
    await connection.query(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('referrer','customer',?),('referrer','super_admin',?)",
      [now, now],
    );
    const token = await createHostedSession(db, 'referrer');
    await writeFile(
      'outputs/wallet-test-runtime/preview.json',
      JSON.stringify({ database: name, user: name, password, token, sellerToken, reviewItemId:reviewItem!.id, orderNumber:order.orderNumber,activeOrderNumber:activeOrder.orderNumber }),
    );
  }
  console.log(
    'MariaDB: additive migration and repeat import, reward idempotency, concurrent overspend rejection, ledger reconciliation and immutability passed.',
  );
  console.log(
    'MariaDB: actual COD checkout, stock reservation, reduced cash collection, cancellation and credit restoration passed.',
  );
} catch (error) {
  // Never print mysql connection options or credentials.
  console.error(
    error instanceof Error ? error.message : 'MariaDB wallet test failed',
  );
  if (error instanceof Error) console.error(error.stack?.split('\n').filter(line=>line.trim().startsWith('at ') && /Hatskala|test-wallet/.test(line)).join('\n'));
  process.exitCode = 1;
} finally {
  await connection.end();
  // Keep only this disposable test database for manual inspection until the local server is stopped.
  process.exit(process.exitCode || 0);
}
