import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBusinessEmail } from '../lib/operations/business-notifications';
void test('business email rejects untrusted link origins and header injection', () => {
  const message = {
    email: 'test@example.test',
    subject: 'Review needed',
    body: 'Open the authorized record.',
    audience: 'staff',
    relatedType: 'product',
    relatedId: 'product-1',
  };
  for (const origin of [
    'http://example.test',
    'https://user:secret@example.test',
    'https://example.test/path',
    'https://example.test?redirect=evil',
  ])
    assert.throws(() => buildBusinessEmail(message, origin));
  assert.throws(() =>
    buildBusinessEmail(
      { ...message, email: 'bad\r\nBcc:other@example.test' },
      'https://example.test',
    ),
  );
  assert.match(
    buildBusinessEmail(message, 'https://example.test').text,
    /https:\/\/example.test\/admin\/products\/product-1/,
  );
});
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  businessNotificationStatements,
  deliverBusinessEmails,
} from '../lib/operations/business-notifications';
import { emailRetryDelayMs } from '../lib/email/retry-policy';

void test('email retry backoff grows and remains bounded', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 99].map(emailRetryDelayMs),
    [300_000, 600_000, 1_200_000, 2_400_000, 3_600_000, 3_600_000],
  );
});
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE users(id TEXT PRIMARY KEY,auth_subject TEXT,email TEXT,status TEXT);CREATE TABLE user_roles(user_id TEXT,role TEXT);CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT,status TEXT,review_request_id TEXT);CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT,status TEXT,review_request_id TEXT);CREATE TABLE audit_logs(id TEXT)',
  );
  sqlite.exec(
    'CREATE TABLE notification_messages(id TEXT PRIMARY KEY,recipient_user_id TEXT,audience_role TEXT,channel TEXT,template_key TEXT,subject_en TEXT,subject_ne TEXT,body_en TEXT,body_ne TEXT,related_type TEXT,related_id TEXT,status TEXT,provider_reference TEXT,failure_reason TEXT,request_id TEXT UNIQUE,created_at INTEGER,sent_at INTEGER,read_at INTEGER)',
  );
  sqlite.exec(readFileSync('drizzle/0031_staff_permissions.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0033_business_notifications.sql', 'utf8'));
  sqlite.exec(
    readFileSync('drizzle/0035_guest_business_notifications.sql', 'utf8'),
  );
  for (const [id, role] of [
    ['sa', 'super_admin'],
    ['admin', 'admin'],
    ['restricted', 'admin'],
    ['owner', 'seller'],
    ['other', 'customer'],
  ]) {
    sqlite
      .prepare("INSERT INTO users VALUES (?,?,?,'active')")
      .run(id, id, id + '@example.test');
    sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run(id, role);
  }
  sqlite
    .prepare(
      "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('restricted','[]',1,'sa',1)",
    )
    .run();
  sqlite.exec(
    "INSERT INTO seller_profiles VALUES ('seller-1','owner','approved',NULL);INSERT INTO products VALUES ('product-1','seller-1','submitted','mutation-1')",
  );
  const db = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      const statement = sqlite.prepare(sql);
      return {
        bind(...v: SQLInputValue[]) {
          values = v;
          return this;
        },
        async first() {
          return statement.get(...values) ?? null;
        },
        async all() {
          return { results: statement.all(...values) };
        },
        async run() {
          return {
            meta: { changes: Number(statement.run(...values).changes) },
          };
        },
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { sqlite, db };
}
const event = {
  eventId: 'mutation-1',
  sourceType: 'product',
  sourceId: 'product-1',
  status: 'submitted',
  reviewRequestId: 'mutation-1',
  actorId: 'owner',
  now: 100,
  kind: 'submitted',
} as const;
void test('transactional event reaches only owner and effective reviewers, once per channel', async () => {
  const { sqlite, db } = fixture();
  try {
    await db.batch(await businessNotificationStatements(db, event));
    await db.batch(await businessNotificationStatements(db, event));
    const rows = sqlite
      .prepare(
        'SELECT recipient_user_id AS id,channel FROM notification_messages ORDER BY id,channel',
      )
      .all();
    assert.equal(rows.length, 6);
    assert.deepEqual(
      [...new Set(rows.map((r) => r.id))],
      ['admin', 'owner', 'sa'],
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE channel='sms'",
        )
        .get()?.n,
      0,
    );
    const before = rows.length;
    await db.batch(
      await businessNotificationStatements(db, {
        ...event,
        eventId: 'stale',
        reviewRequestId: 'stale',
      }),
    );
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM notification_messages').get()
        ?.n,
      before,
    );
  } finally {
    sqlite.close();
  }
});
void test('rollback removes event rows when business transaction fails; changed profile before commit suppresses stale staff recipient', async () => {
  const { sqlite, db } = fixture();
  try {
    const statements = await businessNotificationStatements(db, event);
    sqlite.exec(
      "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin','[]',1,'sa',1)",
    );
    await db.batch(statements);
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE recipient_user_id='admin'",
        )
        .get()?.n,
      0,
    );
    const rows = sqlite
      .prepare('SELECT COUNT(*) AS n FROM notification_messages')
      .get()?.n;
    await assert.rejects(() =>
      db.batch([
        ...statements,
        db.prepare("INSERT INTO products(id) VALUES ('product-1')"),
      ]),
    );
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM notification_messages').get()
        ?.n,
      rows,
    );
  } finally {
    sqlite.close();
  }
});
void test('concurrent fake consumers claim once and never process legacy order rows', async () => {
  const { sqlite, db } = fixture();
  try {
    await db.batch(await businessNotificationStatements(db, event));
    sqlite.exec(
      "INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,status,request_id,created_at) VALUES ('legacy','owner','customer','email','order.confirmed','Legacy','Legacy','Legacy','Legacy','queued','legacy',0)",
    );
    const sent: string[] = [];
    const mail = {
      send: async (m: { to: string }) => {
        sent.push(m.to);
        await Promise.resolve();
      },
    };
    const result = await Promise.all([
      deliverBusinessEmails(db, mail, 'https://example.test', { now: 1000 }),
      deliverBusinessEmails(db, mail, 'https://example.test', { now: 1000 }),
    ]);
    assert.equal(
      result.reduce((n, r) => n + r.accepted, 0),
      3,
    );
    assert.equal(sent.length, 3);
    assert.equal(new Set(sent).size, 3);
    assert.equal(
      sqlite
        .prepare("SELECT status FROM notification_messages WHERE id='legacy'")
        .get()?.status,
      'queued',
    );
    assert.equal(
      (
        await deliverBusinessEmails(db, mail, 'https://example.test', {
          now: 1001,
        })
      ).accepted,
      0,
    );
  } finally {
    sqlite.close();
  }
});
void test('fake delivery retries with redacted failure, bounded attempts, and revokes staff before email', async () => {
  const { sqlite, db } = fixture();
  try {
    await db.batch(await businessNotificationStatements(db, event));
    sqlite.exec(
      "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin','[]',1,'sa',1)",
    );
    let attempts = 0;
    const broken = {
      send: async () => {
        attempts++;
        throw new Error('password=secret smtp detailed response');
      },
    };
    const first = await deliverBusinessEmails(
      db,
      broken,
      'https://example.test',
      { now: 1000 },
    );
    assert.deepEqual(first, { accepted: 0, failed: 2, cancelled: 1 });
    assert.equal(attempts, 2);
    assert.equal(
      sqlite
        .prepare(
          "SELECT failure_reason FROM notification_messages WHERE recipient_user_id='owner' AND channel='email'",
        )
        .get()?.failure_reason,
      'delivery_failed',
    );
    await deliverBusinessEmails(db, broken, 'https://example.test', {
      now: 1001,
    });
    assert.equal(attempts, 2);
    for (let i = 1; i < 6; i++)
      await deliverBusinessEmails(db, broken, 'https://example.test', {
        now: 1000 + i * 4_000_000,
      });
    assert.equal(attempts, 10);
    assert.equal(
      sqlite
        .prepare(
          'SELECT MAX(delivery_attempts) AS n FROM notification_messages',
        )
        .get()?.n,
      5,
    );
  } finally {
    sqlite.close();
  }
});

void test('delivery authorization is prioritized and an expired code is suppressed with a reason', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec(
      "CREATE TABLE orders(id TEXT PRIMARY KEY,customer_id TEXT,recipient_email TEXT,order_number TEXT);CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,order_id TEXT,status TEXT);CREATE TABLE shipping_parcels(shipping_job_id TEXT PRIMARY KEY,rider_user_id TEXT,version INTEGER,method TEXT);CREATE TABLE rider_otp_challenges(shipping_job_id TEXT,rider_user_id TEXT,assignment_version INTEGER,expires_at INTEGER,consumed_at INTEGER);INSERT INTO orders VALUES ('order-otp','other',NULL,'HB-OTP');INSERT INTO shipping_jobs VALUES ('job-otp','order-otp','dispatched');INSERT INTO shipping_parcels VALUES ('job-otp','owner',1,'own_rider');INSERT INTO rider_otp_challenges VALUES ('job-otp','owner',1,500,NULL)",
    );
    await db.batch(await businessNotificationStatements(db, event));
    sqlite
      .prepare(
        "INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,guest_order_id) VALUES ('otp-live','other','customer','email','delivery.authorization','Live delivery code','Live delivery code','Code','Code','order','order-otp','queued','delivery-otp:job-otp:500',200,'delivery.authorization','order-otp')",
      )
      .run();
    const sent: string[] = [];
    const prioritized = await deliverBusinessEmails(
      db,
      { send: async (message) => void sent.push(message.subject) },
      'https://example.test',
      { now: 300, limit: 1 },
    );
    assert.equal(prioritized.accepted, 1);
    assert.deepEqual(sent, ['HastaBazaar · Live delivery code']);
    sqlite
      .prepare(
        "INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,guest_order_id) VALUES ('otp-expired','other','customer','email','delivery.authorization','Expired delivery code','Expired delivery code','Code','Code','order','order-otp','queued','delivery-otp:job-otp:250',201,'delivery.authorization','order-otp')",
      )
      .run();
    const expired = await deliverBusinessEmails(
      db,
      { send: async () => assert.fail('expired OTP must not be sent') },
      'https://example.test',
      { now: 300, limit: 1 },
    );
    assert.equal(expired.cancelled, 1);
    assert.equal(
      sqlite
        .prepare(
          "SELECT failure_reason AS reason FROM notification_messages WHERE id='otp-expired'",
        )
        .get()?.reason,
      'expired_or_obsolete_otp',
    );
  } finally {
    sqlite.close();
  }
});
import { operationalBusinessNotificationStatements } from '../lib/operations/business-notifications';
void test('payout events notify affected seller and independent authorized staff without financial payloads', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec(
      "CREATE TABLE payouts(id TEXT PRIMARY KEY,seller_id TEXT,status TEXT,created_request_id TEXT,operation_request_id TEXT);INSERT INTO payouts VALUES('payout-1','seller-1','prepared','prepare-1',NULL)",
    );
    await db.batch(
      await operationalBusinessNotificationStatements(db, {
        kind: 'payout.prepared',
        sourceId: 'payout-1',
        eventId: 'prepare-1',
        actorId: 'admin',
        now: 100,
      }),
    );
    const recipients = sqlite
      .prepare(
        'SELECT DISTINCT recipient_user_id AS id FROM notification_messages',
      )
      .all()
      .map((r) => r.id)
      .sort((a, b) => String(a).localeCompare(String(b)));
    assert.deepEqual(recipients, ['owner', 'sa']);
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE body_en LIKE '%account%' OR body_en LIKE '%1000%'",
        )
        .get()?.n,
      0,
    );
    const fake = { send: async () => {} };
    assert.equal(
      (
        await deliverBusinessEmails(db, fake, 'https://example.test', {
          now: 1000,
        })
      ).accepted,
      2,
    );
  } finally {
    sqlite.close();
  }
});
void test('effective permission change informs its subject even after all operational access is removed', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec(
      "UPDATE staff_permission_profiles SET last_request_id='decision-1' WHERE user_id='restricted'",
    );
    await db.batch(
      await operationalBusinessNotificationStatements(db, {
        kind: 'permissions.changed',
        sourceId: 'restricted',
        eventId: 'decision-1',
        actorId: 'sa',
        now: 100,
      }),
    );
    const recipients = sqlite
      .prepare(
        'SELECT DISTINCT recipient_user_id AS id FROM notification_messages',
      )
      .all();
    assert.deepEqual(
      recipients.map((r) => r.id),
      ['restricted'],
    );
    assert.equal(
      (
        await deliverBusinessEmails(
          db,
          { send: async () => {} },
          'https://example.test',
          { now: 1000 },
        )
      ).accepted,
      1,
    );
  } finally {
    sqlite.close();
  }
});
void test('review-needed email is cancelled if the source no longer needs review', async () => {
  const { sqlite, db } = fixture();
  try {
    await db.batch(await businessNotificationStatements(db, event));
    sqlite.exec("UPDATE products SET status='approved' WHERE id='product-1'");
    const sent: string[] = [];
    const result = await deliverBusinessEmails(
      db,
      {
        send: async (m) => {
          sent.push(m.to);
        },
      },
      'https://example.test',
      { now: 1000 },
    );
    assert.equal(result.cancelled, 2);
    assert.deepEqual(sent, ['owner@example.test']);
  } finally {
    sqlite.close();
  }
});
void test('invalid global email origin does not consume queue attempts', async () => {
  const { sqlite, db } = fixture();
  try {
    await db.batch(await businessNotificationStatements(db, event));
    await assert.rejects(() =>
      deliverBusinessEmails(
        db,
        {
          send: async () => {
            throw new Error('must not send');
          },
        },
        'http://example.test',
        { now: 1000 },
      ),
    );
    assert.equal(
      sqlite
        .prepare(
          'SELECT SUM(delivery_attempts) AS n FROM notification_messages',
        )
        .get()?.n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
import { caseBusinessNotificationStatements } from '../lib/operations/business-notifications';
function caseFixture() {
  const f = fixture();
  f.sqlite.exec(
    "CREATE TABLE orders(id TEXT PRIMARY KEY,customer_id TEXT,customer_email TEXT,order_number TEXT);CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,seller_id TEXT,fulfillment_status TEXT,fulfillment_request_id TEXT);CREATE TABLE complaints(id TEXT PRIMARY KEY,order_id TEXT,seller_id TEXT,assigned_to TEXT,escalated_to TEXT,status TEXT,operation_request_id TEXT);CREATE TABLE return_requests(id TEXT PRIMARY KEY,order_item_id TEXT,reviewed_by TEXT,status TEXT,operation_request_id TEXT);CREATE TABLE refunds(return_request_id TEXT,status TEXT,approved_by TEXT);INSERT INTO orders VALUES ('order-1',NULL,'guest@example.test','HB-123');INSERT INTO order_items VALUES ('item-1','order-1','seller-1','ready_for_pickup','ready-1');INSERT INTO complaints VALUES ('case-1','order-1','seller-1',NULL,NULL,'open','case-created');INSERT INTO return_requests VALUES ('return-1','item-1','admin','pending_high_value_approval','return-approved');INSERT INTO refunds VALUES ('return-1','pending_high_value_approval','admin')",
  );
  return f;
}
void test('case events are idempotent, guest email only, assigned staff scoped, and missing mutation markers suppress rows', async () => {
  const { sqlite, db } = caseFixture();
  try {
    const e = {
      sourceType: 'complaint',
      sourceId: 'case-1',
      eventId: 'case-created',
      action: 'created',
      now: 100,
    } as const;
    await db.batch(await caseBusinessNotificationStatements(db, e));
    await db.batch(await caseBusinessNotificationStatements(db, e));
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM notification_messages').get()
        ?.n,
      7,
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE recipient_user_id IS NULL AND channel='email' AND guest_order_id='order-1'",
        )
        .get()?.n,
      1,
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE recipient_user_id='restricted'",
        )
        .get()?.n,
      0,
    );
    await db.batch(
      await caseBusinessNotificationStatements(db, { ...e, eventId: 'stale' }),
    );
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM notification_messages').get()
        ?.n,
      7,
    );
    sqlite.exec("UPDATE complaints SET assigned_to='admin' WHERE id='case-1'");
    const sent: string[] = [];
    const outcome = await deliverBusinessEmails(
      db,
      {
        send: async (m) => {
          sent.push(m.to);
          if (m.to === 'guest@example.test') {
            assert.match(m.text, /\/track\?order=HB-123/);
            assert.match(m.text, /checkout email/);
            assert.doesNotMatch(m.text, /receipt_token|token=/);
          }
        },
      },
      'https://example.test',
      { now: 200 },
    );
    assert.equal(outcome.accepted, 3);
    assert.equal(outcome.cancelled, 1);
    assert.deepEqual(sent.sort(), [
      'admin@example.test',
      'guest@example.test',
      'owner@example.test',
    ]);
  } finally {
    sqlite.close();
  }
});
void test('guest identity changes and resolved/reassigned cases suppress delivery; high value approval reaches an independent Super Admin', async () => {
  const { sqlite, db } = caseFixture();
  try {
    await db.batch(
      await caseBusinessNotificationStatements(db, {
        sourceType: 'complaint',
        sourceId: 'case-1',
        eventId: 'case-created',
        action: 'created',
        now: 100,
      }),
    );
    sqlite.exec(
      "UPDATE orders SET customer_email='new@example.test';UPDATE complaints SET status='resolved'",
    );
    let sends = 0;
    const r = await deliverBusinessEmails(
      db,
      {
        send: async () => {
          sends++;
        },
      },
      'https://example.test',
      { now: 200 },
    );
    assert.deepEqual(r, { accepted: 1, failed: 0, cancelled: 3 });
    assert.equal(sends, 1);
    sqlite.exec('DELETE FROM notification_messages');
    await db.batch(
      await caseBusinessNotificationStatements(db, {
        sourceType: 'return_request',
        sourceId: 'return-1',
        eventId: 'return-approved',
        actorId: 'admin',
        action: 'approve',
        now: 300,
      }),
    );
    assert.deepEqual(
      sqlite
        .prepare(
          "SELECT recipient_user_id AS id FROM notification_messages WHERE audience_role='staff' AND channel='email'",
        )
        .all()
        .map((r) => r.id),
      ['sa'],
    );
    const messages: string[] = [];
    await deliverBusinessEmails(
      db,
      {
        send: async (m) => {
          messages.push(m.to);
        },
      },
      'https://example.test',
      { now: 400 },
    );
    assert.ok(messages.includes('sa@example.test'));
  } finally {
    sqlite.close();
  }
});
void test('pickup-ready events notify operations only and a later fulfillment transition suppresses stale email', async () => {
  const { sqlite, db } = caseFixture();
  try {
    await db.batch(
      await operationalBusinessNotificationStatements(db, {
        kind: 'order.pickup_ready',
        sourceId: 'order-1',
        eventId: 'ready-1',
        actorId: 'owner',
        now: 100,
      }),
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE audience_role<>'staff'",
        )
        .get()?.n,
      0,
    );
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM notification_messages').get()
        ?.n,
      4,
    );
    sqlite.exec("UPDATE order_items SET fulfillment_status='dispatched'");
    assert.deepEqual(
      await deliverBusinessEmails(
        db,
        {
          send: async () => {
            throw Error('must not send');
          },
        },
        'https://example.test',
        { now: 200 },
      ),
      { accepted: 0, failed: 0, cancelled: 2 },
    );
  } finally {
    sqlite.close();
  }
});
void test('permission rejection notifies the proposer, while pending approval notifications expire', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec(
      "INSERT INTO users VALUES ('sa2','sa2','sa2@example.test','active');INSERT INTO user_roles VALUES ('sa2','super_admin');INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,reason,proposed_by,proposed_at,status) VALUES ('req','admin','[]',0,'A sufficiently clear reason','sa',1,'pending')",
    );
    await db.batch(
      await operationalBusinessNotificationStatements(db, {
        kind: 'permissions.proposed',
        sourceId: 'req',
        eventId: 'req',
        actorId: 'sa',
        now: 100,
      }),
    );
    sqlite.exec(
      "UPDATE staff_permission_requests SET status='rejected',decided_by='sa2',decided_at=150,decision_note='Rejected' WHERE id='req'",
    );
    await db.batch(
      await operationalBusinessNotificationStatements(db, {
        kind: 'permissions.rejected',
        sourceId: 'req',
        eventId: 'req',
        actorId: 'sa2',
        now: 150,
      }),
    );
    const sent: string[] = [];
    assert.deepEqual(
      await deliverBusinessEmails(
        db,
        {
          send: async (m) => {
            sent.push(m.to);
          },
        },
        'https://example.test',
        { now: 200 },
      ),
      { accepted: 1, failed: 0, cancelled: 1 },
    );
    assert.deepEqual(sent, ['sa@example.test']);
  } finally {
    sqlite.close();
  }
});
void test('disabled accounts receive only their explicit factual account-status email and stale status emails cancel', async () => {
  const { sqlite, db } = fixture();
  try {
    await db.batch(await businessNotificationStatements(db, event));
    sqlite.exec(
      "ALTER TABLE audit_logs ADD COLUMN subject_id TEXT;ALTER TABLE audit_logs ADD COLUMN request_id TEXT;ALTER TABLE audit_logs ADD COLUMN action TEXT;UPDATE users SET status='disabled' WHERE id='owner';INSERT INTO audit_logs VALUES ('a','owner','disable-1','user.status')",
    );
    await db.batch(
      await operationalBusinessNotificationStatements(db, {
        kind: 'account.status',
        sourceId: 'owner',
        eventId: 'disable-1',
        actorId: 'sa',
        status: 'disabled',
        now: 100,
      }),
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE template_key='business.account.status' AND channel='in_app'",
        )
        .get()?.n,
      0,
    );
    const sent: { to: string; text: string }[] = [];
    const result = await deliverBusinessEmails(
      db,
      {
        send: async (m) => {
          sent.push(m);
        },
      },
      'https://example.test',
      { now: 200 },
    );
    assert.equal(result.cancelled, 1);
    assert.equal(result.failed, 0);
    const owner = sent.filter((m) => m.to === 'owner@example.test');
    assert.equal(owner.length, 1);
    assert.match(owner[0].text, /account is now disabled/);
    assert.match(owner[0].text, /\/help/);
    sqlite.exec(
      "INSERT INTO audit_logs VALUES ('b','owner','disable-2','user.status')",
    );
    await db.batch(
      await operationalBusinessNotificationStatements(db, {
        kind: 'account.status',
        sourceId: 'owner',
        eventId: 'disable-2',
        actorId: 'sa',
        status: 'disabled',
        now: 300,
      }),
    );
    sqlite.exec("UPDATE users SET status='active' WHERE id='owner'");
    assert.equal(
      (
        await deliverBusinessEmails(
          db,
          {
            send: async () => {
              throw Error('stale');
            },
          },
          'https://example.test',
          { now: 400 },
        )
      ).cancelled,
      1,
    );
  } finally {
    sqlite.close();
  }
});
void test('promotion decisions notify their actual maker and pending requests exclude that maker', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec(
      "CREATE TABLE promotions(id TEXT PRIMARY KEY,created_by TEXT,status TEXT,created_request_id TEXT,operation_request_id TEXT);INSERT INTO promotions VALUES ('promo','admin','pending_approval','propose-1',NULL)",
    );
    await db.batch(
      await operationalBusinessNotificationStatements(db, {
        kind: 'promotion.proposed',
        sourceId: 'promo',
        eventId: 'propose-1',
        actorId: 'admin',
        now: 100,
      }),
    );
    assert.deepEqual(
      sqlite
        .prepare(
          "SELECT recipient_user_id AS id FROM notification_messages WHERE channel='email'",
        )
        .all()
        .map((r) => r.id),
      ['sa'],
    );
    sqlite.exec(
      "UPDATE promotions SET status='rejected',operation_request_id='reject-1'",
    );
    await db.batch(
      await operationalBusinessNotificationStatements(db, {
        kind: 'promotion.result',
        sourceId: 'promo',
        eventId: 'reject-1',
        actorId: 'sa',
        now: 150,
      }),
    );
    const sent: string[] = [];
    assert.deepEqual(
      await deliverBusinessEmails(
        db,
        {
          send: async (m) => {
            sent.push(m.to);
          },
        },
        'https://example.test',
        { now: 200 },
      ),
      { accepted: 1, failed: 0, cancelled: 1 },
    );
    assert.deepEqual(sent, ['admin@example.test']);
  } finally {
    sqlite.close();
  }
});
void test('empty or malformed permission snapshots never regain legacy notification recipients', async () => {
  const { sqlite, db } = caseFixture();
  try {
    sqlite.exec(
      "UPDATE staff_permission_profiles SET permissions_json='' WHERE user_id='restricted';INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin','garbage',1,'sa',1)",
    );
    await db.batch(
      await caseBusinessNotificationStatements(db, {
        sourceType: 'complaint',
        sourceId: 'case-1',
        eventId: 'case-created',
        action: 'created',
        now: 100,
      }),
    );
    await db.batch(
      await operationalBusinessNotificationStatements(db, {
        kind: 'order.pickup_ready',
        sourceId: 'order-1',
        eventId: 'ready-1',
        actorId: 'owner',
        now: 100,
      }),
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE recipient_user_id IN ('restricted','admin')",
        )
        .get()?.n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
void test('every independent high-value approver has a distinct idempotency key', async () => {
  const { sqlite, db } = caseFixture();
  try {
    sqlite.exec(
      "INSERT INTO users VALUES ('sa2','sa2','sa2@example.test','active');INSERT INTO user_roles VALUES ('sa2','super_admin')",
    );
    const e = {
      sourceType: 'return_request',
      sourceId: 'return-1',
      eventId: 'return-approved',
      actorId: 'admin',
      action: 'approve',
      now: 100,
    } as const;
    await db.batch(await caseBusinessNotificationStatements(db, e));
    await db.batch(await caseBusinessNotificationStatements(db, e));
    assert.deepEqual(
      sqlite
        .prepare(
          "SELECT recipient_user_id AS id FROM notification_messages WHERE audience_role='staff' AND channel='email' ORDER BY recipient_user_id",
        )
        .all()
        .map((r) => r.id),
      ['sa', 'sa2'],
    );
  } finally {
    sqlite.close();
  }
});
import {
  listNotifications,
  markNotificationRead,
} from '../lib/db/repositories/operations';
function riderNotificationFixture() {
  const f = caseFixture();
  f.sqlite.exec(
    "CREATE TABLE rider_profiles(user_id TEXT PRIMARY KEY,status TEXT);CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,status TEXT);CREATE TABLE shipping_parcels(shipping_job_id TEXT PRIMARY KEY,rider_user_id TEXT,method TEXT,version INTEGER);CREATE TABLE rider_reports(id TEXT PRIMARY KEY,shipping_job_id TEXT,rider_user_id TEXT,assignment_version INTEGER,status TEXT);CREATE TABLE exception_work_items(id TEXT,owner_id TEXT,status TEXT);INSERT INTO rider_profiles VALUES ('owner','approved');INSERT INTO shipping_jobs VALUES ('job-1','dispatched');INSERT INTO shipping_parcels VALUES ('job-1','owner','own_rider',1);INSERT INTO rider_reports VALUES ('report-1','job-1','owner',1,'pending')",
  );
  return f;
}
function riderMessage(
  sqlite: DatabaseSync,
  id: string,
  user: string,
  type: string,
  relatedId: string,
  staff = false,
) {
  sqlite
    .prepare(
      "INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,required_permission) VALUES (?,?,?,'email','business.rider.update','Rider update','Rider update','Open authorized record','Open authorized record',?,?,'queued',?,1,'business.rider.update',?)",
    )
    .run(
      id,
      user,
      staff ? 'staff' : 'customer',
      type,
      relatedId,
      id,
      staff
        ? type === 'rider_profile'
          ? 'admin.invite'
          : 'order.manage'
        : null,
    );
}
void test('rider emails and notification reads suppress revoked approval and changed assignments', async () => {
  const { sqlite, db } = riderNotificationFixture();
  try {
    riderMessage(sqlite, 'assignment', 'owner', 'rider_assignment', 'job-1');
    riderMessage(sqlite, 'report-owner', 'owner', 'rider_report', 'report-1');
    riderMessage(
      sqlite,
      'report-staff',
      'admin',
      'rider_report',
      'report-1',
      true,
    );
    sqlite.exec("UPDATE shipping_parcels SET rider_user_id='other',version=2");
    const r = await deliverBusinessEmails(
      db,
      {
        send: async () => {
          throw Error('must suppress');
        },
      },
      'https://example.test',
      { now: 2 },
    );
    assert.deepEqual(r, { accepted: 0, failed: 0, cancelled: 3 });
    sqlite.exec("UPDATE notification_messages SET channel='in_app'");
    assert.equal(
      (await listNotifications(db, 'owner', 100, 'customer')).length,
      0,
    );
    await assert.rejects(() =>
      markNotificationRead(db, 'owner', 'assignment', 3),
    );
    sqlite.exec(
      "UPDATE shipping_parcels SET rider_user_id='owner',version=1;UPDATE rider_profiles SET status='suspended'",
    );
    assert.equal(
      (await listNotifications(db, 'owner', 100, 'customer')).length,
      0,
    );
  } finally {
    sqlite.close();
  }
});
void test('current rider owner receives authorized links, staff permission revocation suppresses pending action, profile decision remains visible to owner', async () => {
  const { sqlite, db } = riderNotificationFixture();
  try {
    riderMessage(sqlite, 'owner-report', 'owner', 'rider_report', 'report-1');
    riderMessage(
      sqlite,
      'staff-report',
      'admin',
      'rider_report',
      'report-1',
      true,
    );
    riderMessage(sqlite, 'profile-owner', 'owner', 'rider_profile', 'owner');
    sqlite.exec(
      "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin','[]',1,'sa',1)",
    );
    const messages: string[] = [];
    const r = await deliverBusinessEmails(
      db,
      {
        send: async (m) => {
          messages.push(m.text);
        },
      },
      'https://example.test',
      { now: 2 },
    );
    assert.deepEqual(r, { accepted: 2, failed: 0, cancelled: 1 });
    assert.ok(messages.every((m) => m.includes('https://example.test/rider')));
    sqlite.exec(
      "UPDATE notification_messages SET channel='in_app';UPDATE rider_profiles SET status='rejected'",
    );
    const visible = await listNotifications(db, 'owner', 100, 'customer');
    assert.deepEqual(
      visible.map((n) => n.id),
      ['profile-owner'],
    );
    await markNotificationRead(db, 'owner', 'profile-owner', 3);
  } finally {
    sqlite.close();
  }
});
