import {inspectReadiness} from '../lib/operations/readiness';
import mysql from 'mysql2/promise';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { env as runtime } from '../lib/runtime/node-bindings';
import {
  businessNotificationStatements,
  caseBusinessNotificationStatements,
  deliverBusinessEmails,
} from '../lib/operations/business-notifications';
const output =
  'outputs/consolidated-local-20260913-042936/native-business-notifications-guest.json';
const root = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13316,
  user: 'root',
  multipleStatements: true,
});
const name = 'business_notifications_' + Date.now();
const password = crypto.randomUUID();
const checks: string[] = [];
function pass(label: string) {
  checks.push(label);
  console.log('PASS ' + label);
}
async function migrate(path: string) {
  let delimiter = ';',
    buffer = '';
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    if (line.startsWith('DELIMITER ')) {
      delimiter = line.slice(10).trim();
      continue;
    }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length);
      buffer = '';
      if (statement.trim()) await root.query(statement);
    }
  }
  if (buffer.trim()) await root.query(buffer);
}
try {
  await root.query('CREATE DATABASE ' + name);
  await root.query('USE ' + name);
  await root.query('CREATE USER ?@? IDENTIFIED BY ?', [
    name,
    '127.0.0.1',
    password,
  ]);
  await root.query('GRANT ALL ON ' + name + '.* TO ?@?', [name, '127.0.0.1']);
  const manifest = JSON.parse(
    await readFile('deployment/babal/release-manifest.json', 'utf8'),
  );
  for (const migration of manifest.migrations) await migrate(migration.path);
  await migrate('deployment/babal/mariadb-business-notifications.sql');
  await migrate('deployment/babal/mariadb-guest-business-notifications.sql');
  pass('fresh synthetic schema and repeatable business notification migration');
  Object.assign(process.env, {
    DB_HOST: '127.0.0.1',
    DB_PORT: '13316',
    DB_NAME: name,
    DB_USER: name,
    DB_PASSWORD: password,
  });
  const db = runtime.DB as unknown as D1Database;
  const now = Date.now();
  for (const [id, role] of [
    ['sa', 'super_admin'],
    ['admin', 'admin'],
    ['owner', 'seller'],
    ['unrelated', 'customer'],
  ]) {
    await root.execute(
      "INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,?,'en-NP','active',?,?)",
      [id, id, id + '@example.test', 'Synthetic ' + id, now, now],
    );
    await root.execute(
      'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,?)',
      [id, role, now],
    );
  }
  await root.execute(
    "INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,approved_at,created_at,updated_at) VALUES ('seller-1','owner','Synthetic','Synthetic','Local','TEST','PAN','TEST','Synthetic','9800000000','owner@example.test','Bagmati','Kathmandu','Kathmandu','Test','approved',?,?,?)",
    [now, now, now],
  );
  await root.execute(
    "INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('test-category','test-category','Test',1,1,?,?)",
    [now, now],
  );
  await root.execute(
    "INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,review_request_id,created_at,updated_at) VALUES ('product-1','seller-1','test-category','synthetic-product','SYNTHETIC-BN','Synthetic product','Synthetic only',10000,5,'Maker','NP','Natural',1,'submitted','event-1',?,?)",
    [now, now],
  );
  const event = {
    eventId: 'event-1',
    sourceType: 'product',
    sourceId: 'product-1',
    status: 'submitted',
    reviewRequestId: 'event-1',
    actorId: 'owner',
    now,
    kind: 'submitted',
  } as const;
  await db.batch(await businessNotificationStatements(db, event));
  await db.batch(await businessNotificationStatements(db, event));
  assert.equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM notification_messages')
        .first<{ n: number }>()
    )?.n,
    6,
  );
  pass(
    'native event idempotency creates only owner and permitted staff, one row per channel',
  );
  await root.execute(
    "INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,status,request_id,created_at) VALUES ('legacy-order','owner','customer','email','order.confirmed','Legacy','Legacy','Legacy','Legacy','queued','legacy-order',?)",
    [now],
  );
  const legacyBefore = (await root.execute("SELECT * FROM notification_messages WHERE id='legacy-order'"))[0];
  await migrate('deployment/babal/mariadb-guest-business-notifications.sql');
  await migrate('deployment/babal/mariadb-guest-business-notifications.sql');
  assert.deepEqual((await root.execute("SELECT * FROM notification_messages WHERE id='legacy-order'"))[0], legacyBefore);
  await assert.rejects(()=>root.execute("UPDATE notification_messages SET recipient_user_id='unknown-user' WHERE id='legacy-order'"));
  await assert.rejects(()=>root.execute("UPDATE notification_messages SET request_id='legacy-order' WHERE id<>(SELECT id FROM (SELECT id FROM notification_messages WHERE id='legacy-order') n)"));
  pass('native repeat guest extension preserves legacy message values, user foreign key and request uniqueness');
  await root.execute(
    "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin','[]',1,'sa',?)",
    [now],
  );
  const sends: string[] = [];
  const fake = {
    send: async (m: { to: string }) => {
      sends.push(m.to);
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
  };
  const raced = await Promise.all([
    deliverBusinessEmails(db, fake, 'https://example.test', { now: now + 1 }),
    deliverBusinessEmails(db, fake, 'https://example.test', { now: now + 1 }),
  ]);
  assert.equal(
    raced.reduce((n, r) => n + r.accepted, 0),
    2,
  );
  assert.equal(
    raced.reduce((n, r) => n + r.cancelled, 0),
    1,
  );
  assert.deepEqual(
    sends.sort((a, b) => a.localeCompare(b)),
    ['owner@example.test', 'sa@example.test'],
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT status FROM notification_messages WHERE id='legacy-order'",
        )
        .first<{ status: string }>()
    )?.status,
    'queued',
  );
  pass(
    'native concurrent workers send each live claim once; revoked reviewer cancelled; legacy order email remains untouched',
  );
  await db.batch(
    await businessNotificationStatements(db, {
      ...event,
      eventId: 'event-retry',
    }),
  );
  let failedCalls = 0;
  const broken = {
    send: async () => {
      failedCalls++;
      throw new Error('private provider detail must never be recorded');
    },
  };
  const failed = await deliverBusinessEmails(
    db,
    broken,
    'https://example.test',
    { now: now + 2 },
  );
  assert.equal(failed.failed, 2);
  assert.equal(failedCalls, 2);
  await deliverBusinessEmails(db, broken, 'https://example.test', {
    now: now + 3,
  });
  assert.equal(failedCalls, 2);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE channel='email' AND status='failed' AND failure_reason='delivery_failed'",
        )
        .first<{ n: number }>()
    )?.n,
    2,
  );
  const retried = await deliverBusinessEmails(
    db,
    fake,
    'https://example.test',
    { now: now + 300003 },
  );
  assert.equal(retried.accepted, 2);
  pass(
    'native fake failures are redacted, retry is delayed, and eligible retry succeeds',
  );
  const before = (
    await db
      .prepare('SELECT COUNT(*) AS n FROM notification_messages')
      .first<{ n: number }>()
  )?.n;
  const statements = await businessNotificationStatements(db, {
    ...event,
    eventId: 'rollback',
  });
  await assert.rejects(() =>
    db.batch([
      ...statements,
      db.prepare("INSERT INTO products(id) VALUES ('product-1')"),
    ]),
  );
  assert.equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM notification_messages')
        .first<{ n: number }>()
    )?.n,
    before,
  );
  pass('native source batch failure rolls back notification rows');
  await root.execute("INSERT INTO orders(id,order_number,receipt_token_hash,customer_email,customer_phone,status,locale,currency,policy_version,return_policy_snapshot_json,shipping_address_json,item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,created_at,updated_at) VALUES ('guest-order','GUEST-TEST','synthetic-private-hash','guest@example.test','9811111111','delivered','en-NP','NPR','phase-1.0','{}','{}',10000,0,15000,0,0,25000,'cod','paid',?,?,?)",[now,now,now]);
  await root.execute("INSERT INTO complaints(id,reference_number,order_id,category,subject,detail,status,operation_request_id,created_at,updated_at) VALUES ('guest-case','GUEST-CASE','guest-order','delivery','Synthetic guest case','Synthetic evidence only','resolved','guest-result',?,?)",[now,now]);
  const usersBefore=(await db.prepare('SELECT COUNT(*) AS n FROM users').first<{n:number}>())?.n;
  const guestEvent={sourceType:'complaint',sourceId:'guest-case',eventId:'guest-result',actorId:'sa',action:'resolve',now} as const;
  await db.batch(await caseBusinessNotificationStatements(db,guestEvent));await db.batch(await caseBusinessNotificationStatements(db,guestEvent));
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM notification_messages WHERE guest_order_id='guest-order'").first<{n:number}>())?.n,1);
  const guestMessages:{to:string;text?:string;html?:string}[]=[];
  const guestResult=await deliverBusinessEmails(db,{send:async(m:{to:string;text?:string;html?:string})=>{guestMessages.push(m);}},'https://example.test',{now:now+10});
  assert.equal(guestResult.accepted,1);assert.equal(guestMessages[0]?.to,'guest@example.test');
  assert.match(JSON.stringify(guestMessages[0]),/track\?order=GUEST-TEST/);assert.doesNotMatch(JSON.stringify(guestMessages[0]),/synthetic-private-hash/);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').first<{n:number}>())?.n,usersBefore);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM notification_messages WHERE guest_order_id='guest-order' AND channel='in_app'").first<{n:number}>())?.n,0);
  await assert.rejects(()=>root.execute("UPDATE notification_messages SET channel='in_app' WHERE guest_order_id='guest-order'"));
  pass('native guest case sends one fake email with protected tracking destination, no account or in-app fabrication, guest shape enforced');
  await root.execute("UPDATE complaints SET operation_request_id='guest-next' WHERE id='guest-case'");await db.batch(await caseBusinessNotificationStatements(db,{...guestEvent,eventId:'guest-next'}));
  await root.execute("UPDATE orders SET customer_email='changed@example.test' WHERE id='guest-order'");
  const revoked=await deliverBusinessEmails(db,{send:async()=>{throw new Error('Unexpected stale guest transport');}},'https://example.test',{now:now+11});assert.equal(revoked.cancelled,1);assert.equal(revoked.failed,0);
  pass('native guest contact change suppresses stale queued recipient before transport');
  await root.execute('ALTER TABLE notification_messages DROP CONSTRAINT chk_notification_guest_shape');
  assert.equal((await inspectReadiness(db)).ready,false,'Missing guest integrity check must fail native readiness');
  await migrate('deployment/babal/mariadb-guest-business-notifications.sql');assert.equal((await inspectReadiness(db)).ready,true);
  pass('native readiness rejects a partially installed guest migration until its integrity constraint is restored');

  await writeFile(
    output,
    JSON.stringify(
      {
        localOnly: true,
        freshDatabase: true,
        fakeTransportOnly: true,
        noSmtpInvoked: true,
        checks,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    output,
    JSON.stringify(
      {
        localOnly: true,
        fakeTransportOnly: true,
        checks,
        failed: true,
        errorName: error instanceof Error ? error.name : 'Unknown',
        code: (error as { code?: string })?.code ?? null,
      },
      null,
      2,
    ),
  );
  console.error(
    'Native business notification verification failed; sanitized report saved.',
  );
  process.exitCode = 1;
} finally {
  if (/^business_notifications_\d+$/.test(name)) {
    await root.query('DROP DATABASE IF EXISTS ' + name);
    await root.query('DROP USER IF EXISTS ?@?', [name, '127.0.0.1']);
  } else {
    process.exitCode = 1;
  }
  await root.end();
  setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
}
