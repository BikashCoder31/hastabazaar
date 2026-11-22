import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { categoryMediaDb } from './helpers/category-media-db';
import { installFixtureCustomerCodSchema } from './helpers/customer-cod-fixture';
async function implementation() {
  assert.ok(
    existsSync(new URL('../lib/orders/first-cod-review.ts', import.meta.url)),
    'Durable first-COD confirmation module exists',
  );
  assert.ok(
    existsSync(
      new URL('../drizzle/0065_first_cod_review.sql', import.meta.url),
    ),
    'Additive first-COD migration exists',
  );
  return import('../lib/orders/first-cod-review');
}
async function fixture(applied = false) {
  const m = await implementation(),
    f = await categoryMediaDb();
  if (applied) installFixtureCustomerCodSchema(f.sqlite);
  for (const [id, role] of [
    ['buyer', 'customer'],
    ['seller', 'seller'],
    ['admin', 'admin'],
    ['super', 'super_admin'],
    ['outsider', 'customer'],
  ]) {
    f.sqlite
      .prepare(
        "INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'Fictional','active',1,1)",
      )
      .run(id, id, id + '@example.test');
    f.sqlite
      .prepare(
        'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)',
      )
      .run(id, role);
  }
  f.sqlite.exec(
    "INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES ('s','seller','Fictional','Fictional','Local','REG','PAN','PAN','Fictional','9800000000','fixture@example.test','Madhesh','Dhanusha','Janakpur','Ward1','approved',1,1)",
  );
  f.sqlite.exec(
    "INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('category','fixture-category','Fixture',1,1,1,1)",
  );
  f.sqlite.exec(
    "INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at) VALUES ('product','s','category','fixture-product','FIX-SKU','Fixture','Fictional',10000,100,'Maker','NP','Fibre',1,'published',1,1)",
  );
  async function place(
    id: string,
    total = 500000,
    status = 'confirmed',
    mode = 'cod',
    customerId = 'buyer',
    tail: D1PreparedStatement[] = [],
    walletPaisa = 0,
    includeReview = true,
  ) {
    const statements = [
      f.db
        .prepare(
          "INSERT INTO orders(id,order_number,receipt_token_hash,customer_id,customer_email,customer_phone,status,locale,currency,policy_version,return_policy_snapshot_json,shipping_address_json,item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,created_at,updated_at,wallet_credit_paisa) VALUES (?,?,?,?,'buyer@example.test','9800000000',?,'en-NP','NPR','fixture','{}','{}',?,0,10000,0,0,?,?,'pending',100,100,100,?)",
        )
        .bind(
          id,
          id,
          'hash-' + id,
          customerId,
          status,
          total - 10000,
          total - walletPaisa,
          mode,
          walletPaisa,
        ),
      ...(includeReview
        ? m.prepareFirstCodReview(f.db, {
            customerId,
            orderId: id,
            totalPaisa: total,
            now: 100,
            customerFlagAvailable: applied,
          })
        : []),
      ...tail,
    ];
    await f.db.batch(statements);
    return id;
  }
  async function item(id: string, orderId: string) {
    await f.db
      .prepare(
        "INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,seller_discount_paisa,commission_bps,commission_paisa,tax_paisa,line_total_paisa,return_eligible_snapshot,fulfillment_status,created_at) VALUES (?,?,'product','s','Fictional','Fictional',?,10000,1,0,900,900,0,10000,1,'confirmed',100)",
      )
      .bind(id, orderId, id)
      .run();
  }
  return { ...f, ...m, place, item };
}
void test('flagged repeat buyers enter the existing COD hold at their exact order total and release on confirmation', async () => {
  const f = await fixture(true);
  try {
    await f.place('previous-delivery', 90000, 'delivered');
    await f.place('flag-off', 90000);
    assert.equal(await f.getFirstCodReview(f.db, 'flag-off'), null);
    f.sqlite.exec("UPDATE users SET cod_confirmation_required=1 WHERE id='buyer'");
    await f.place('online', 90000, 'confirmed', 'bank_transfer');
    assert.equal(await f.getFirstCodReview(f.db, 'online'), null);
    await f.place('awaiting-call', 90000);
    await f.item('call-item', 'awaiting-call');
    const review = await f.getFirstCodReview(f.db, 'awaiting-call');
    assert.equal(review?.status, 'pending');
    assert.equal(review?.totalPaisa, 90000);
    await assert.rejects(() => f.assertFirstCodFulfillmentAllowed(f.db, 'awaiting-call'), /awaiting.*confirmation/);
    await f.confirmFirstCodReview(f.db, {
      orderId: 'awaiting-call', actorId: 'super', reason: 'Customer confirmed the order by phone.',
      requestId: 'fixture-confirm-by-phone', now: 101,
    });
    await f.assertFirstCodFulfillmentAllowed(f.db, 'awaiting-call');
    assert.ok(f.sqlite.prepare("SELECT 1 FROM order_response_items WHERE order_item_id='call-item'").get());
  } finally {
    f.dispose();
  }
});
void test('threshold is inclusive, only COD with no delivered buyer history is held, pending or cancelled history does not waive', async () => {
  const f = await fixture();
  try {
    await f.place('low', 499999);
    assert.equal(await f.getFirstCodReview(f.db, 'low'), null);
    await f.place('boundary');
    assert.equal(
      (await f.getFirstCodReview(f.db, 'boundary'))?.status,
      'pending',
    );
    await f.place('also-pending');
    assert.equal(
      (await f.getFirstCodReview(f.db, 'also-pending'))?.status,
      'pending',
    );
    await f.place('cancelled-history', 90000, 'cancelled');
    await f.place('after-cancel');
    assert.equal(
      (await f.getFirstCodReview(f.db, 'after-cancel'))?.status,
      'pending',
    );
    await f.place('delivered-history', 90000, 'delivered');
    await f.place('repeat-buyer');
    assert.equal(await f.getFirstCodReview(f.db, 'repeat-buyer'), null);
    await f.place('non-cod', 500000, 'confirmed', 'bank_transfer');
    assert.equal(await f.getFirstCodReview(f.db, 'non-cod'), null);
  } finally {
    f.dispose();
  }
});
void test('hold insert is conditional at commit, tied to exact buyer/total and rolls back with the order batch', async () => {
  const f = await fixture();
  try {
    const prepared = f.prepareFirstCodReview(f.db, {
      customerId: 'buyer',
      orderId: 'race',
      totalPaisa: 500000,
      now: 100,
    });
    await f.place('previous-success', 90000, 'delivered');
    await f.place('race');
    await f.db.batch(prepared);
    assert.equal(await f.getFirstCodReview(f.db, 'race'), null);
    const before = f.sqlite
      .prepare('SELECT COUNT(*) AS n FROM orders')
      .get()!.n;
    await assert.rejects(() =>
      f.db.batch([
        f.db.prepare(
          "UPDATE orders SET customer_email='changed' WHERE id='race'",
        ),
        f.db
          .prepare(
            'INSERT INTO operation_transaction_guards(id,valid) VALUES (?,0)',
          )
          .bind('rollback-fixture'),
      ]),
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get()!.n,
      before,
    );
    assert.equal(
      f.sqlite
        .prepare("SELECT customer_email AS e FROM orders WHERE id='race'")
        .get()!.e,
      'buyer@example.test',
    );
  } finally {
    f.dispose();
  }
});
void test('transaction backstops block direct packing/ready/dispatch, shipping setup, rider assignment and pickup; cancellation stays usable', async () => {
  const f = await fixture();
  try {
    await f.place('held');
    await f.item('item', 'held');
    for (const status of [
      'packing',
      'ready_for_pickup',
      'dispatched',
      'delivered',
    ]) {
      await assert.rejects(
        () =>
          f.db
            .prepare('UPDATE order_items SET fulfillment_status=? WHERE id=?')
            .bind(status, 'item')
            .run(),
        /confirmation/i,
      );
      await assert.rejects(
        () =>
          f.db
            .prepare('UPDATE orders SET status=? WHERE id=?')
            .bind(status, 'held')
            .run(),
        /confirmation/i,
      );
    }
    await assert.rejects(
      () =>
        f.db
          .prepare(
            "INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,carrier,reconciliation_status,created_by,created_request_id,created_at,updated_at) VALUES ('new-job','held','s','outbound','pickup_requested','manual','unreconciled','admin','job-request',100,100)",
          )
          .run(),
      /confirmation/i,
    );
    await assert.rejects(
      () =>
        f.db
          .prepare(
            "INSERT INTO delivery_assignments(order_id,method,courier_name,tracking_reference,assigned_by,updated_at) VALUES ('held','courier','Fictional','REF','admin',100)",
          )
          .run(),
      /confirmation/i,
    );
    await f.db
      .prepare(
        "UPDATE order_items SET fulfillment_status='cancelled' WHERE id='item'",
      )
      .run();
    await f.db
      .prepare(
        "UPDATE orders SET status='cancelled',cancelled_at=101 WHERE id='held'",
      )
      .run();
    assert.equal((await f.getFirstCodReview(f.db, 'held'))?.status, 'pending');
    await assert.rejects(
      () =>
        f.confirmFirstCodReview(f.db, {
          orderId: 'held',
          actorId: 'admin',
          reason: 'Contact confirmed by staff.',
          requestId: 'cancelled-confirm',
          now: 102,
        }),
      /cancelled|available/i,
    );
  } finally {
    f.dispose();
  }
});
void test('Admin with current order permission can confirm once with bound replay, immutable audit and no finance/status changes', async () => {
  const f = await fixture();
  try {
    await f.place('held');
    await f.item('item', 'held');
    const before = f.sqlite
      .prepare(
        "SELECT status,grand_total_paisa,payment_status FROM orders WHERE id='held'",
      )
      .get();
    const input = {
      orderId: 'held',
      actorId: 'admin',
      reason: 'Buyer confirmed the order by phone.',
      requestId: 'confirm-1',
      now: 101,
    };
    await assert.rejects(
      () => f.confirmFirstCodReview(f.db, { ...input, actorId: 'outsider' }),
      /permission/i,
    );
    await assert.rejects(
      () => f.confirmFirstCodReview(f.db, { ...input, reason: 'bad' }),
      /reason|characters/i,
    );
    await f.confirmFirstCodReview(f.db, input);
    await f.confirmFirstCodReview(f.db, input);
    assert.equal(
      (await f.getFirstCodReview(f.db, 'held'))?.status,
      'confirmed',
    );
    assert.deepEqual(
      f.sqlite
        .prepare(
          "SELECT status,grand_total_paisa,payment_status FROM orders WHERE id='held'",
        )
        .get(),
      before,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_logs WHERE action='order.first_cod_confirmed'",
        )
        .get()!.n,
      1,
    );
    await assert.rejects(
      () =>
        f.confirmFirstCodReview(f.db, {
          ...input,
          reason: 'A different confirmation note.',
        }),
      /reference|different/i,
    );
    await assert.rejects(
      () => f.confirmFirstCodReview(f.db, { ...input, actorId: 'super' }),
      /reference|different/i,
    );
    await f.db
      .prepare(
        "UPDATE order_items SET fulfillment_status='packing' WHERE id='item'",
      )
      .run();
    await assert.rejects(
      () =>
        f.db
          .prepare(
            "UPDATE first_cod_reviews SET reason='Rewritten confirmation evidence' WHERE order_id='held'",
          )
          .run(),
      /immutable/i,
    );
  } finally {
    f.dispose();
  }
});
void test('permission revocation and competing decisions between read and transaction cannot confirm or append audit', async () => {
  const f = await fixture();
  try {
    await f.place('held');
    const input = {
      orderId: 'held',
      actorId: 'admin',
      reason: 'Buyer confirmed the order by phone.',
      requestId: 'race-confirm',
      now: 101,
    };
    const db = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        f.sqlite
          .prepare("UPDATE users SET status='disabled' WHERE id='admin'")
          .run();
        return f.db.batch(statements);
      },
    } as unknown as D1Database;
    await assert.rejects(() => f.confirmFirstCodReview(db, input));
    assert.equal((await f.getFirstCodReview(f.db, 'held'))?.status, 'pending');
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_logs WHERE action='order.first_cod_confirmed'",
        )
        .get()!.n,
      0,
    );
  } finally {
    f.dispose();
  }
});

void test('an exact replay still checks transaction-time staff authority and cancellation', async () => {
  const f = await fixture();
  try {
    await f.place('held');
    const input = {
      orderId: 'held',
      actorId: 'admin',
      reason: 'Buyer confirmed by phone.',
      requestId: 'replay-race',
      now: 101,
    };
    await f.confirmFirstCodReview(f.db, input);
    const db = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        f.sqlite
          .prepare("UPDATE users SET status='disabled' WHERE id='admin'")
          .run();
        return f.db.batch(statements);
      },
    } as unknown as D1Database;
    await assert.rejects(() => f.confirmFirstCodReview(db, input));
  } finally {
    f.dispose();
  }
});

void test('wallet credit does not lower the confirmation threshold and failed order batches leave neither order nor hold', async () => {
  const f = await fixture();
  try {
    await f.place(
      'wallet-boundary',
      500000,
      'confirmed',
      'cod',
      'buyer',
      [],
      100000,
    );
    assert.equal(
      (await f.getFirstCodReview(f.db, 'wallet-boundary'))?.totalPaisa,
      500000,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT grand_total_paisa AS n FROM orders WHERE id='wallet-boundary'",
        )
        .get()!.n,
      400000,
    );
    await f.place(
      'wallet-low',
      499999,
      'confirmed',
      'cod',
      'buyer',
      [],
      100000,
    );
    assert.equal(await f.getFirstCodReview(f.db, 'wallet-low'), null);
    await assert.rejects(() =>
      f.place('rolled-back', 500000, 'confirmed', 'cod', 'buyer', [
        f.db.prepare(
          "INSERT INTO operation_transaction_guards(id,valid) VALUES ('fail-order-batch',0)",
        ),
      ]),
    );
    assert.equal(
      f.sqlite
        .prepare("SELECT COUNT(*) AS n FROM orders WHERE id='rolled-back'")
        .get()!.n,
      0,
    );
    assert.equal(await f.getFirstCodReview(f.db, 'rolled-back'), null);
  } finally {
    f.dispose();
  }
});
void test('cancellation winning after read blocks the stale decision without new audit', async () => {
  const f = await fixture();
  try {
    await f.place('held');
    const input = {
      orderId: 'held',
      actorId: 'admin',
      reason: 'Buyer confirmed by phone.',
      requestId: 'cancel-race',
      now: 101,
    };
    const db = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        f.sqlite
          .prepare(
            "UPDATE orders SET status='cancelled',cancelled_at=101 WHERE id='held'",
          )
          .run();
        return f.db.batch(statements);
      },
    } as unknown as D1Database;
    await assert.rejects(() => f.confirmFirstCodReview(db, input));
    assert.equal((await f.getFirstCodReview(f.db, 'held'))?.status, 'pending');
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_logs WHERE action='order.first_cod_confirmed'",
        )
        .get()!.n,
      0,
    );
  } finally {
    f.dispose();
  }
});
void test('explicit order permission is required and one Super Admin can confirm without a second approval', async () => {
  const f = await fixture();
  try {
    await f.place('held');
    f.sqlite
      .prepare(
        "INSERT INTO staff_permission_profiles(user_id,permissions_json,updated_by,updated_at) VALUES ('admin','[]','super',100)",
      )
      .run();
    const input = {
      orderId: 'held',
      actorId: 'admin',
      reason: 'Buyer confirmed by phone.',
      requestId: 'staff-permission',
      now: 101,
    };
    await assert.rejects(
      () => f.confirmFirstCodReview(f.db, input),
      /permission/,
    );
    await f.confirmFirstCodReview(f.db, { ...input, actorId: 'super' });
    assert.equal(
      (await f.getFirstCodReview(f.db, 'held'))?.confirmedBy,
      'super',
    );
  } finally {
    f.dispose();
  }
});

void test('a confirmed hold requires complete durable staff evidence, including non-null time, reason and request reference', async () => {
  const f = await fixture();
  try {
    await f.place('held');
    await assert.rejects(() =>
      f.db
        .prepare(
          "UPDATE first_cod_reviews SET status='confirmed',confirmed_by='admin' WHERE order_id='held'",
        )
        .run(),
    );
  } finally {
    f.dispose();
  }
});

void test('stale outbound job and parcel writes cannot assign riders, schedule pickup or dispatch while held, and cancellation cleanup remains allowed', async () => {
  const f = await fixture();
  try {
    // The fixture deliberately creates stale operational rows before the review to exercise transaction backstops independently of normal setup's early gate.
    await f.place('stale', 500000, 'confirmed', 'cod', 'buyer', [], 0, false);
    await f.db
      .prepare(
        "INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,carrier,reconciliation_status,created_by,created_request_id,created_at,updated_at) VALUES ('stale-job','stale','s','outbound','pickup_requested','manual','unreconciled','admin','stale-job-request',100,100)",
      )
      .run();
    await f.db
      .prepare(
        "INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,created_at) VALUES ('stale-job',500000,100)",
      )
      .run();
    await f.db
      .prepare(
        "INSERT INTO delivery_assignments(order_id,method,courier_name,assigned_by,updated_at) VALUES ('stale','courier','Fictional','admin',100)",
      )
      .run();
    await f.db.batch(
      f.prepareFirstCodReview(f.db, {
        customerId: 'buyer',
        orderId: 'stale',
        totalPaisa: 500000,
        now: 100,
      }),
    );
    for (const status of [
      'pickup_scheduled',
      'picked_up',
      'dispatched',
      'delivered',
    ])
      await assert.rejects(
        () =>
          f.db
            .prepare('UPDATE shipping_jobs SET status=? WHERE id=?')
            .bind(status, 'stale-job')
            .run(),
        /confirmation/i,
      );
    await assert.rejects(
      () =>
        f.db
          .prepare(
            "UPDATE shipping_parcels SET method='own_rider',rider_user_id='buyer' WHERE shipping_job_id='stale-job'",
          )
          .run(),
      /confirmation/i,
    );
    await assert.rejects(
      () =>
        f.db
          .prepare(
            "UPDATE delivery_assignments SET rider_user_id='buyer',method='own_rider' WHERE order_id='stale'",
          )
          .run(),
      /confirmation/i,
    );
    await f.db
      .prepare(
        "UPDATE orders SET status='cancelled',cancelled_at=101 WHERE id='stale'",
      )
      .run();
    assert.equal(
      f.sqlite
        .prepare("SELECT status FROM shipping_jobs WHERE id='stale-job'")
        .get()!.status,
      'cancelled',
    );
  } finally {
    f.dispose();
  }
});

void test('MariaDB additive guard source preserves holds and character-count evidence parity', () => {
  const source = readFileSync(
    new URL(
      '../deployment/babal/mariadb-first-cod-evidence-guards.sql',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(source, /BEFORE DELETE ON first_cod_reviews/);
  assert.match(source, /CHAR_LENGTH\(TRIM\(NEW\.reason\)\)/);
  assert.match(source, /CHAR_LENGTH\(NEW\.request_id\)/);
  assert.doesNotMatch(source, /(?<!CHAR_)LENGTH\(TRIM\(NEW\.reason\)\)/i);
});
