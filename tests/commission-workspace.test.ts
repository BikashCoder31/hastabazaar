import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as rates from '../lib/db/repositories/commission-rates';
import { commissionDatabase, historicalCommissionDatabase } from './helpers/commission-database';
import * as reporting from '../lib/db/repositories/commission-reporting';
import { createCodOrder } from '../lib/db/repositories/orders';
import { seedCheckoutBuyer } from './helpers/checkout-contact';
import {
  parseNepalDateTime,
  percentToBasisPoints,
} from '../lib/commission/rates';

const now = Date.UTC(2026, 9, 14);
const day = 86_400_000;
const schedule = (overrides = {}) => ({
  actorId: 'owner',
  requestId: 'rate-1',
  expectedRevision: 0,
  basisPoints: 1200,
  effectiveAt: now + 16 * day,
  reason: 'Update the marketplace fee schedule.',
  now,
  ...overrides,
});

void test('recovering Commission preserves the existing configured and accepted seller rate', async () => {
  const f = await commissionDatabase();
  try {
    await f.database.prepare(`INSERT INTO business_setting_versions
      (id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES ('legacy-12','independent_seller_commission_bps',1,'1200','published',1,'controlled',1,'Existing accepted commission','owner',1,'legacy-config')`).run();
    await f.database.prepare(`INSERT INTO seller_agreement_acceptance_history
      (id,seller_id,agreement_version,language_presented,commission_setting_version_id,commission_bps,acceptance_request_id,accepted_by,accepted_at)
      SELECT 'legacy-accept',id,seller_agreement_version,'en','legacy-12',1200,'legacy-accept','user-a',2
      FROM seller_profiles WHERE id='seller-a'`).run();
    const before = await f.database.prepare('SELECT * FROM seller_agreement_acceptance_history').all();
    assert.equal((await rates.getSellerCommissionTerms(f.database, 'seller-a', now)).basisPoints, 1200);
    assert.equal((await rates.getCommissionRateState(f.database, now)).current.basisPoints, 1200);
    const change = await rates.scheduleCommissionRate(f.database, schedule({ basisPoints: 1400 }));
    assert.equal((await rates.getSellerCommissionTerms(f.database, 'seller-a', now + 17 * day)).basisPoints, 1200);
    await rates.acceptCommissionRate(f.database, {sellerId:'seller-a',userId:'user-a',rateId:change.id,now:now+day});
    assert.equal((await rates.getSellerCommissionTerms(f.database, 'seller-a', now + 15 * day)).basisPoints, 1200);
    assert.equal((await rates.getSellerCommissionTerms(f.database, 'seller-a', now + 17 * day)).basisPoints, 1400);
    assert.deepEqual(await f.database.prepare('SELECT * FROM seller_agreement_acceptance_history').all(), before);
  } finally { await f.dispose(); }
});

void test('schedules apply only after the effective date and explicit seller acceptance', async () => {
  const f = await historicalCommissionDatabase(true);
  try {
    const created = await rates.scheduleCommissionRate(f.database, schedule());
    assert.equal(
      (await rates.getSellerCommissionTerms(f.database, 'seller-a', now))
        .basisPoints,
      900,
    );
    await rates.acceptCommissionRate(f.database, {
      sellerId: 'seller-a',
      userId: 'user-a',
      rateId: created.id,
      now: now + day,
    });
    assert.equal(
      (
        await rates.getSellerCommissionTerms(
          f.database,
          'seller-a',
          now + 15 * day,
        )
      ).basisPoints,
      900,
    );
    const applied = await rates.getSellerCommissionTerms(
      f.database,
      'seller-a',
      now + 16 * day,
    );
    assert.equal(applied.basisPoints, 1200);
    assert.equal(applied.version, created.id);
    assert.equal(applied.acceptedAt, now + day);
    assert.equal(
      (
        await rates.getSellerCommissionTerms(
          f.database,
          'seller-b',
          now + 17 * day,
        )
      ).basisPoints,
      900,
    );
    const state = await rates.getCommissionRateState(
      f.database,
      now + 17 * day,
    );
    assert.equal(state.current.basisPoints, 1200);
    assert.equal(state.history[0].acceptedSellers, 1);
  } finally {
    await f.dispose();
  }
});

void test('invalid schedules, insufficient notice, unauthorized staff and stale revisions are rejected', async () => {
  const f = await historicalCommissionDatabase(true);
  try {
    for (const overrides of [
      { basisPoints: -1 },
      { basisPoints: 10001 },
      { basisPoints: 900.5 },
      { effectiveAt: now + day },
      { effectiveAt: NaN },
      { reason: 'short' },
      { actorId: 'staff' },
      { expectedRevision: 4 },
    ]) {
      await assert.rejects(() =>
        rates.scheduleCommissionRate(f.database, schedule(overrides)),
      );
    }
    assert.equal(
      (await rates.getCommissionRateState(f.database, now)).revision,
      0,
    );
    await rates.scheduleCommissionRate(f.database, schedule());
    await assert.rejects(() =>
      rates.scheduleCommissionRate(
        f.database,
        schedule({ requestId: 'conflict', expectedRevision: 1 }),
      ),
    );
    assert.equal(
      (await rates.getCommissionRateState(f.database, now)).history.length,
      1,
    );
  } finally {
    await f.dispose();
  }
});

void test('schedule retry is idempotent; cancellation is audited and keeps accepted sellers on their previous rate', async () => {
  const f = await historicalCommissionDatabase(true);
  try {
    const created = await rates.scheduleCommissionRate(f.database, schedule());
    assert.equal(
      (await rates.scheduleCommissionRate(f.database, schedule())).id,
      created.id,
    );
    await assert.rejects(() =>
      rates.scheduleCommissionRate(f.database, schedule({ basisPoints: 1100 })),
    );
    await rates.acceptCommissionRate(f.database, {
      sellerId: 'seller-a',
      userId: 'user-a',
      rateId: created.id,
      now: now + day,
    });
    await assert.rejects(() =>
      rates.acceptCommissionRate(f.database, {
        sellerId: 'seller-b',
        userId: 'user-a',
        rateId: created.id,
        now: now + day,
      }),
    );
    await rates.cancelCommissionRate(f.database, {
      actorId: 'owner',
      rateId: created.id,
      expectedRevision: 1,
      requestId: 'cancel-1',
      reason: 'Hold the current fee schedule.',
      now: now + day,
    });
    const state = await rates.getCommissionRateState(
      f.database,
      now + 20 * day,
    );
    assert.equal(state.revision, 2);
    assert.equal(state.history[0].status, 'cancelled');
    assert.equal(
      state.history[0].cancellationReason,
      'Hold the current fee schedule.',
    );
    assert.equal(
      (
        await rates.getSellerCommissionTerms(
          f.database,
          'seller-a',
          now + 20 * day,
        )
      ).basisPoints,
      900,
    );
    assert.equal(
      (
        await f.database
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'commission.rate.%'",
          )
          .first()
      )?.n,
      2,
    );
    await assert.rejects(() =>
      rates.acceptCommissionRate(f.database, {
        sellerId: 'seller-b',
        userId: 'user-b',
        rateId: created.id,
        now: now + day,
      }),
    );
  } finally {
    await f.dispose();
  }
});

void test('a later unaccepted schedule preserves the earlier accepted effective rate and effective schedules cannot be cancelled', async () => {
  const f = await historicalCommissionDatabase(true);
  try {
    const created = await rates.scheduleCommissionRate(f.database, schedule());
    await rates.acceptCommissionRate(f.database, {
      sellerId: 'seller-a',
      userId: 'user-a',
      rateId: created.id,
      now: now + day,
    });
    const later = now + 20 * day;
    await rates.scheduleCommissionRate(
      f.database,
      schedule({
        requestId: 'rate-2',
        expectedRevision: 1,
        basisPoints: 800,
        effectiveAt: later + 16 * day,
        now: later,
      }),
    );
    assert.equal(
      (
        await rates.getSellerCommissionTerms(
          f.database,
          'seller-a',
          later + 20 * day,
        )
      ).basisPoints,
      1200,
    );
    await assert.rejects(() =>
      rates.cancelCommissionRate(f.database, {
        actorId: 'owner',
        rateId: created.id,
        expectedRevision: 2,
        requestId: 'too-late',
        reason: 'Cancel an effective fee schedule.',
        now: later,
      }),
    );
  } finally {
    await f.dispose();
  }
});

void test('Nepal datetime and percentage parsing reject invalid or ambiguous inputs', () => {
  assert.equal(
    parseNepalDateTime('2026-10-30T09:00'),
    Date.UTC(2026, 9, 30, 3, 15),
  );
  for (const value of [
    '2026-02-30T09:00',
    '2026-13-01T12:00',
    '2026-10-30',
    'bad',
  ])
    assert.throws(() => parseNepalDateTime(value));
  assert.equal(percentToBasisPoints('9.25'), 925);
  assert.equal(percentToBasisPoints('0'), 0);
  assert.equal(percentToBasisPoints(100), 10000);
  for (const value of ['', null, true, '9.251', -1, Infinity, '100.01'])
    assert.throws(() => percentToBasisPoints(value));
});

void test('earnings use ledger snapshots, sum split reversals once, and exclude cancelled items from pending totals', async () => {
  const f = await historicalCommissionDatabase(true);
  try {
    await seedReport(f.database);
    const report = await reporting.getCommissionReport(f.database, {});
    assert.equal(report.totals.earnedPaisa, 21000);
    assert.equal(report.totals.reversedPaisa, 3500);
    assert.equal(report.totals.netPaisa, 17500);
    assert.equal(report.totals.pendingPaisa, 4500);
    assert.equal(report.totalRows, 4);
    assert.equal(
      report.rows.find(
        (r) => r.sellerId === 'seller-b' && r.orderId === 'order-1',
      )?.earnedPaisa,
      12000,
    );
    assert.equal(
      report.rows.find(
        (r) => r.sellerId === 'seller-a' && r.orderId === 'order-1',
      )?.reversedPaisa,
      3500,
    );
    const paged = await reporting.getCommissionReport(f.database, {
      pageSize: 1,
      page: 2,
    });
    assert.equal(paged.rows.length, 1);
    assert.deepEqual(paged.totals, report.totals);
    const seller = await reporting.getCommissionReport(f.database, {
      sellerId: 'seller-a',
    });
    assert.equal(seller.totals.earnedPaisa, 9000);
    assert.equal(seller.totals.pendingPaisa, 4500);
    const dated = await reporting.getCommissionReport(f.database, {
      from: '2026-10-14',
      to: '2026-10-14',
      status: 'earned',
    });
    assert.equal(dated.totalRows, 2);
    assert.equal(dated.totals.netPaisa, 17500);
    assert.equal(
      (await reporting.getCommissionReport(f.database, { query: 'HK-1' }))
        .totalRows,
      2,
    );
    assert.equal(
      (await reporting.getCommissionReport(f.database, { query: '%' }))
        .totalRows,
      0,
    );
    assert.equal(
      (await reporting.getCommissionReport(f.database, { query: 'missing' }))
        .totals.netPaisa,
      0,
    );
    await assert.rejects(() =>
      reporting.getCommissionReport(f.database, { from: '2026-02-30' }),
    );
    await assert.rejects(() =>
      reporting.getCommissionReport(f.database, {
        from: '2026-11-01',
        to: '2026-10-01',
      }),
    );
  } finally {
    await f.dispose();
  }
});

void test('checkout snapshots per-seller accepted rates and later changes leave historical amounts intact', async context => {
  context.mock.method(Date, 'now', () => now + 17 * day);
  const f = await historicalCommissionDatabase(true);
  try {
    await seedCheckoutBuyer(f.database);
    const change = await rates.scheduleCommissionRate(f.database, schedule());
    await rates.acceptCommissionRate(f.database, {
      sellerId: 'seller-a',
      userId: 'user-a',
      rateId: change.id,
      now: now + day,
    });
    await executeStatements(
      f.database,
      `INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','craft','Craft',1,1,1,1);
      INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','token','NPR',1,1);`,
    );
    for (const suffix of ['a', 'b']) {
      await f.database
        .prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
        VALUES (?,?,'cat',?,?,?,'Craft',100000,10,'Maker','NP','Wood','published',1,1)`)
        .bind(
          `product-${suffix}`,
          `seller-${suffix}`,
          `craft-${suffix}`,
          `SKU-${suffix}`,
          `Craft ${suffix}`,
        )
        .run();
      await f.database
        .prepare(
          "INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES (?,'cart',?,1,1,1)",
        )
        .bind(`cart-${suffix}`, `product-${suffix}`)
        .run();
    }
    const input = {
      customerAuthSubject: 'checkout-buyer',
      customerEmail: 'buyer@example.test',
      customerPhone: '9811111111',
      locale: 'en-NP' as const,
      termsAccepted: true,
      idempotencyKey: 'checkout-commission',
      address: {
        recipientName: 'Buyer',
        phone: '9811111111',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu',
        locality: 'Ward 1',
      },
    };
    await createCodOrder(f.database, 'token', 'receipt', input, now + 17 * day, 'checkout-buyer');
    const items = (
      await f.database
        .prepare(
          'SELECT seller_id, commission_bps, commission_paisa, commission_rule_version FROM order_items ORDER BY seller_id',
        )
        .all()
    ).results;
    assert.equal(items[0].commission_bps, 1200);
    assert.equal(items[0].commission_paisa, 12000);
    assert.equal(items[0].commission_rule_version, change.id);
    assert.equal(items[1].commission_bps, 900);
    const terms = JSON.parse(
      String(
        (
          await f.database
            .prepare('SELECT terms_snapshot_json FROM order_policy_acceptances')
            .first()
        )?.terms_snapshot_json,
      ),
    );
    assert.equal(terms.sellerCommissionTerms['seller-a'].version, change.id);
    assert.equal(terms.sellerCommissionTerms['seller-a'].acceptedAt, now + day);
    await rates.scheduleCommissionRate(
      f.database,
      schedule({
        requestId: 'rate-zero',
        expectedRevision: 1,
        basisPoints: 0,
        now: now + 18 * day,
        effectiveAt: now + 34 * day,
      }),
    );
    assert.deepEqual(
      (
        await f.database
          .prepare(
            'SELECT seller_id, commission_bps, commission_paisa, commission_rule_version FROM order_items ORDER BY seller_id',
          )
          .all()
      ).results,
      items,
    );
  } finally {
    await f.dispose();
  }
});

async function seedReport(sqlite: D1Database) {
  await executeStatements(
    sqlite,
    "INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('report-cat','report','Report',1,1,1,1)",
  );
  for (const suffix of ['a', 'b'])
    await sqlite
      .prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
    VALUES (?,?,'report-cat',?,?,?,'Craft',100000,10,'Maker','NP','Wood','published',1,1)`)
      .bind(
        `report-${suffix}`,
        `seller-${suffix}`,
        `report-${suffix}`,
        `REPORT-${suffix}`,
        `Report ${suffix}`,
      )
      .run();
  for (const [id, status, payment, placedAt] of [
    ['order-1', 'delivered', 'paid', now],
    ['order-2', 'confirmed', 'pending', now + day],
    ['order-3', 'cancelled', 'cancelled', now + day],
  ] as const) {
    await sqlite
      .prepare(`INSERT INTO orders(id,order_number,customer_email,customer_phone,status,locale,currency,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,created_at,updated_at)
      VALUES (?,?,'buyer@example.test','9811111111',?,'en-NP','NPR','test','{}',200000,15000,215000,'cod',?,?,?,?)`)
      .bind(
        id,
        id.replace('order', 'HK'),
        status,
        payment,
        placedAt,
        placedAt,
        placedAt,
      )
      .run();
  }
  for (const [id, orderId, seller, bps, value, status] of [
    ['item-a', 'order-1', 'a', 900, 100000, 'delivered'],
    ['item-b', 'order-1', 'b', 1200, 100000, 'delivered'],
    ['item-p', 'order-2', 'a', 900, 50000, 'confirmed'],
    ['item-c', 'order-3', 'a', 900, 50000, 'cancelled'],
  ] as const) {
    await sqlite
      .prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,commission_base_paisa,commission_bps,commission_paisa,line_total_paisa,fulfillment_status,created_at)
      VALUES (?,?,?,?,?,'Craft','SKU',?,1,?,?,?,?,?,?)`)
      .bind(
        id,
        orderId,
        `report-${seller}`,
        `seller-${seller}`,
        `Shop ${seller}`,
        value,
        value,
        bps,
        (value * bps) / 10000,
        value,
        status,
        now,
      )
      .run();
  }
  for (const [id, item, seller, type, amount] of [
    ['ledger-a', 'item-a', 'a', 'commission', -9000],
    ['ledger-b', 'item-b', 'b', 'commission', -12000],
    ['reverse-1', 'item-a', 'a', 'commission_reversal', 2000],
    ['reverse-2', 'item-a', 'a', 'commission_reversal', 1500],
  ] as const) {
    await sqlite
      .prepare(
        "INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,type,amount_paisa,description,created_at) VALUES (?,?,?,?,?,'Commission',?)",
      )
      .bind(id, `seller-${seller}`, item, type, amount, now)
      .run();
  }
}

void test('release manifest includes the commission workspace migration after the launch policy and all required tables', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../deployment/babal/release-manifest.json', import.meta.url),
      'utf8',
    ),
  ) as {
    migrations: { path: string; sha256: string; usage: string }[];
    requiredTables: Record<string, string[]>;
  };
  const migrationPath = 'deployment/babal/mariadb-commission-workspace.sql';
  const index = manifest.migrations.findIndex((m) => m.path === migrationPath);
  assert.ok(
    index >
      manifest.migrations.findIndex((m) =>
        m.path.endsWith('mariadb-policy-commission-9-percent.sql'),
      ),
  );
  assert.equal(
    manifest.migrations[index].sha256,
    createHash('sha256')
      .update(await readFile(new URL(`../${migrationPath}`, import.meta.url)))
      .digest('hex'),
  );
  for (const table of [
    'commission_control',
    'commission_rate_changes',
    'commission_rate_acceptances',
    'commission_rate_cancellations',
  ])
    assert.ok(manifest.requiredTables[table]?.length);
});

void test('returned-to-origin seller parcels do not remain pending commission', async () => {
  const f = await historicalCommissionDatabase(true);
  try {
    await seedReport(f.database);
    await executeStatements(
      f.database,
      "UPDATE orders SET status = 'dispatched' WHERE id = 'order-2'; UPDATE order_items SET fulfillment_status = 'dispatched' WHERE id = 'item-p'",
    );
    await f.database
      .prepare(`INSERT INTO shipping_jobs(id, order_id, seller_id, direction, status, carrier, reconciliation_status, created_by, created_request_id, created_at, updated_at)
      VALUES ('rto','order-2','seller-a','outbound','returned','manual','unreconciled','owner','rto-test',?,?)`)
      .bind(now, now)
      .run();
    const report = await reporting.getCommissionReport(f.database, {});
    assert.equal(report.totals.pendingPaisa, 0);
    assert.equal(
      report.rows.find((row) => row.orderId === 'order-2')?.status,
      'cancelled',
    );
    assert.equal(report.totals.netPaisa, 17500);
  } finally {
    await f.dispose();
  }
});

void test('completed Managed Maker items do not require independent commission ledger entries', async () => {
  const f = await historicalCommissionDatabase(true);
  try {
    await seedReport(f.database);
    await f.database.prepare("UPDATE orders SET status='delivered',payment_status='paid' WHERE id='order-2'").run();
    await f.database.prepare("UPDATE order_items SET fulfillment_status='delivered',commission_rule_version='managed-fixed_supply',commission_bps=0,commission_paisa=0 WHERE id='item-p'").run();
    const report = await reporting.getCommissionReport(f.database, {});
    assert.equal(report.totals.missingEntries, 0);
    assert.equal(report.totals.pendingPaisa, 0);
    assert.equal(report.rows.some(row => row.orderId === 'order-2'), false);
    assert.equal(report.totals.netPaisa, 17500);
  } finally { await f.dispose(); }
});

void test('seller fee notices can cross the server-to-client component boundary as plain objects', async () => {
  const f = await historicalCommissionDatabase(true);
  try {
    await rates.scheduleCommissionRate(f.database, schedule());
    const notices = await rates.getSellerCommissionNotices(
      f.database,
      'seller-a',
    );
    assert.equal(notices.length, 1);
    assert.equal(Object.getPrototypeOf(notices[0]), Object.prototype);
    assert.equal(notices[0].basisPoints, 1200);
    assert.match(notices[0].termsText, /Seller Commission Fee Schedule/);
  } finally {
    await f.dispose();
  }
});

async function executeStatements(database: D1Database, sql: string) {
  for (const statement of sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await database.prepare(statement).run();
}
