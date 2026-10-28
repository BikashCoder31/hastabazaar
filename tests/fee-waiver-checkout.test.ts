import {seedLegacyPublishedCampaign,seedLegacyRevision} from './helpers/legacy-fee-history-fixture';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as policy from '../lib/marketplace/fee-waivers';
import * as repository from '../lib/db/repositories/fee-waivers';
import { createCodOrder } from '../lib/db/repositories/orders';
import {
  feeWaiverCheckoutFixture,
  feeWaiverTerms,
  interleaveFeeWaiverBatch,
} from './helpers/fee-waiver-fixture';

async function campaign(
  db: D1Database,
  key = 'launch',
  startsAt = 10,
  endsAt = 1000,
) {
  return seedLegacyPublishedCampaign(db,key,{...feeWaiverTerms,startsAt,endsAt});
}
function amounts(f: Awaited<ReturnType<typeof feeWaiverCheckoutFixture>>) {
  return {
    orders: f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()?.n,
    payments: f.sqlite.prepare('SELECT COUNT(*) n FROM payments').get()?.n,
    evidence: f.sqlite
      .prepare('SELECT COUNT(*) n FROM order_item_marketplace_fees')
      .get()?.n,
    stock: f.sqlite
      .prepare("SELECT inventory_quantity n FROM products WHERE id='product'")
      .get()?.n,
    cart: f.sqlite.prepare('SELECT COUNT(*) n FROM cart_items').get()?.n,
  };
}

void test('full waiver uses the standard rounded amount once and ordinary fees retain their net amount', () => {
  assert.equal(typeof policy.calculateMarketplaceFee, 'function');
  const active = {
    ...feeWaiverTerms,
    id: 'campaign',
    revision: 2,
    state: 'published' as const,
  };
  assert.deepEqual(policy.calculateMarketplaceFee(10000, 1000, active), {
    standardBps: 1000,
    basePaisa: 10000,
    standardPaisa: 1000,
    waivedPaisa: 1000,
    netPaisa: 0,
    campaignId: 'campaign',
    campaignRevision: 2,
  });
  assert.deepEqual(policy.calculateMarketplaceFee(10000, 1000, null), {
    standardBps: 1000,
    basePaisa: 10000,
    standardPaisa: 1000,
    waivedPaisa: 0,
    netPaisa: 1000,
    campaignId: null,
    campaignRevision: null,
  });
  assert.equal(policy.calculateMarketplaceFee(5, 1000, active).waivedPaisa, 1);
});

for (const waived of [false, true])
  void test(`legacy ${waived ? 'active' : 'absent'} campaign preserves accepted commission and creates no new legacy evidence on retry`, async (t) => {
    t.mock.method(Date, 'now', () => 101);
    const f = await feeWaiverCheckoutFixture();
    try {
      const active = waived ? await campaign(f.database) : null;
      const result = await createCodOrder(
        f.database,
        'token',
        'receipt',
        f.input,
        100,
        'checkout-buyer',
      );
      const row = f.sqlite
        .prepare('SELECT * FROM order_item_marketplace_fees')
        .get();
      assert.equal(
        row,
        undefined,
        'New checkout never writes legacy commission relief',
      );
      const line = f.sqlite
        .prepare('SELECT commission_bps,commission_paisa FROM order_items')
        .get();
      assert.equal(line?.commission_bps, 1000);
      assert.equal(line?.commission_paisa, 1000);
      const terms = JSON.parse(
        String(
          f.sqlite
            .prepare('SELECT terms_snapshot_json FROM order_policy_acceptances')
            .get()?.terms_snapshot_json,
        ),
      );
      assert.equal(terms.sellerCommissionTerms['seller-a'].basisPoints, 1000);
      assert.ok(
        terms.marketplaceFees,
        'the accepted order snapshot must retain the standard amount',
      );
      assert.equal(terms.marketplaceFees[0].standardPaisa, 1000);
      assert.equal(terms.marketplaceFees[0].netPaisa, 1000);
      assert.equal(
        terms.marketplaceFees[0].orderItemId,
        f.sqlite.prepare('SELECT id FROM order_items').get()?.id,
      );
      assert.equal(
        f.sqlite.prepare('SELECT placed_at FROM orders').get()?.placed_at,
        101,
      );
      assert.equal(
        f.sqlite
          .prepare(
            "SELECT commission_bps FROM seller_agreement_acceptance_history WHERE seller_id='seller-a'",
          )
          .get()?.commission_bps,
        1000,
      );
      if (active)
        await seedLegacyRevision(f.database,{...active,revision:3,state:'paused'});
      else await campaign(f.database);
      assert.deepEqual(
        await createCodOrder(
          f.database,
          'token',
          'receipt',
          f.input,
          1200,
          'checkout-buyer',
        ),
        result,
      );
      assert.deepEqual(amounts(f), {
        orders: 1,
        payments: 1,
        evidence: 0,
        stock: 9,
        cart: 0,
      });
      assert.equal(
        f.sqlite
          .prepare('SELECT COUNT(*) n FROM order_customer_service_fees')
          .get()?.n,
        1,
      );
    } finally {
      await f.dispose();
    }
  });

void test('legacy campaigns leave mixed cart commission and Managed Maker snapshots unchanged', async (t) => {
  t.mock.method(Date, 'now', () => 100);
  const f = await feeWaiverCheckoutFixture();
  try {
    f.sqlite
      .exec(`INSERT INTO seller_participation_profiles(seller_id,participation_route,application_stage,public_name,public_city,commercial_model,legal_seller_reference,invoice_issuer_reference,payout_beneficiary_reference,managed_agreement_version,managed_agreement_language,managed_agreement_accepted_at,created_at,updated_at)
      VALUES('seller-b','managed_maker','active','Fictional maker','Kathmandu','managed_fixed_supplier_price_v1','SIM-COMPANY','SIM-INVOICE','SIM-MAKER','SIM-FIXED','en',1,1,1);
      INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
      VALUES('managed-product','seller-b','cat','managed-craft','MAKER-SKU','Maker craft','Fictional managed craft',20000,10,'Maker','NP','Wood','published',1,1);
      INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('line-b','cart','managed-product',1,1,1);`);
    for (const [key, value] of [
      ['managed_maker_program_mode', 'activation_enabled'],
      ['managed_maker_active_model', 'managed_fixed_supplier_price_v1'],
    ] as const)
      await f.database
        .prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
        VALUES(?,?,1,?,'published',1,'controlled',1,'Fictional fixed supplier checkout','owner',1,?)`)
        .bind(key, key, JSON.stringify(value), key)
        .run();
    await campaign(f.database);
    await createCodOrder(
      f.database,
      'token',
      'receipt',
      f.input,
      100,
      'checkout-buyer',
    );
    const rows = f.sqlite
      .prepare(
        'SELECT oi.seller_id,f.net_paisa,f.waived_paisa FROM order_items oi LEFT JOIN order_item_marketplace_fees f ON f.order_item_id=oi.id ORDER BY oi.seller_id',
      )
      .all();
    assert.deepEqual(
      rows.map((row) => ({ ...row })),
      [
        { seller_id: 'seller-a', net_paisa: null, waived_paisa: null },
        { seller_id: 'seller-b', net_paisa: null, waived_paisa: null },
      ],
    );
    const managed = f.sqlite
      .prepare(
        'SELECT product_value_paisa,platform_retention_bps,platform_retained_paisa,maker_entitlement_paisa FROM managed_commercial_snapshots',
      )
      .get();
    assert.deepEqual(
      { ...managed },
      {
        product_value_paisa: 20000,
        platform_retention_bps: 0,
        platform_retained_paisa: 0,
        maker_entitlement_paisa: 0,
      },
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM managed_entitlements').get()?.n,
      0,
    );
  } finally {
    await f.dispose();
  }
});

void test('overlapping legacy campaigns never write new commission waiver evidence', async (t) => {
  t.mock.method(Date, 'now', () => 100);
  const f = await feeWaiverCheckoutFixture();
  try {
    const a = await campaign(f.database, 'a');
    const b = await campaign(f.database, 'b');
    await createCodOrder(
      f.database,
      'token',
      'receipt',
      f.input,
      100,
      'checkout-buyer',
    );
    const row = f.sqlite
      .prepare(
        'SELECT campaign_id,waived_paisa,net_paisa FROM order_item_marketplace_fees',
      )
      .get();
    assert.equal(row, undefined);
    assert.equal(
      policy.selectFeeWaiver(
        (await repository.getAuthorizedFeeWaiverState(f.database,{actorId:'owner',authSubject:'owner'})).campaigns,
        100,
      )?.id,
      [a.id, b.id].sort()[0],
    );
    assert.equal(
      f.sqlite.prepare('SELECT commission_paisa FROM order_items').get()
        ?.commission_paisa,
      1000,
    );
  } finally {
    await f.dispose();
  }
});

for (const mutation of ['pause', 'new-campaign'] as const)
  void test(`a concurrent legacy ${mutation} leaves new checkout unchanged`, async (t) => {
    t.mock.method(Date, 'now', () => 100);
    const f = await feeWaiverCheckoutFixture();
    try {
      const active = mutation === 'pause' ? await campaign(f.database) : null;
      const db = interleaveFeeWaiverBatch(f.database, async () => {
        if (active)
          await seedLegacyRevision(f.database,{...active,revision:3,state:'paused'});
        else await campaign(f.database);
      });
      await createCodOrder(
        db,
        'token',
        'receipt',
        f.input,
        100,
        'checkout-buyer',
      );
      assert.deepEqual(amounts(f), {
        orders: 1,
        payments: 1,
        evidence: 0,
        stock: 9,
        cart: 0,
      });
    } finally {
      await f.dispose();
    }
  });

for (const boundary of ['start', 'end'] as const)
  void test(`legacy campaign exact ${boundary} boundary leaves accepted commission unchanged`, async (t) => {
    t.mock.method(Date, 'now', () => (boundary === 'end' ? 1000 : 200));
    const f = await feeWaiverCheckoutFixture();
    try {
      await campaign(f.database, 'boundary', boundary === 'start' ? 200 : 10);
      await createCodOrder(
        f.database,
        'token',
        'receipt',
        f.input,
        100,
        'checkout-buyer',
      );
      assert.deepEqual(amounts(f), {
        orders: 1,
        payments: 1,
        evidence: 0,
        stock: 9,
        cart: 0,
      });
    } finally {
      await f.dispose();
    }
  });

for (const table of ['payments'])
  void test(`a failed ${table} insert rolls back evidence, order, payment and stock together`, async (t) => {
    t.mock.method(Date, 'now', () => 100);
    const f = await feeWaiverCheckoutFixture();
    try {
      await campaign(f.database);
      f.sqlite.exec(
        `CREATE TRIGGER reject_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'fixture_insert_failure'); END;`,
      );
      await assert.rejects(
        createCodOrder(
          f.database,
          'token',
          'receipt',
          f.input,
          100,
          'checkout-buyer',
        ),
        /fixture_insert_failure/,
      );
      assert.deepEqual(amounts(f), {
        orders: 0,
        payments: 0,
        evidence: 0,
        stock: 10,
        cart: 1,
      });
    } finally {
      await f.dispose();
    }
  });

void test('a legacy evidence insert guard cannot fail a new order', async (t) => {
  t.mock.method(Date, 'now', () => 100);
  const f = await feeWaiverCheckoutFixture();
  try {
    f.sqlite.exec(
      "CREATE TRIGGER reject_legacy_insert BEFORE INSERT ON order_item_marketplace_fees BEGIN SELECT RAISE(ABORT,'legacy evidence must not be inserted'); END",
    );
    await campaign(f.database);
    await createCodOrder(
      f.database,
      'token',
      'receipt',
      f.input,
      100,
      'checkout-buyer',
    );
    assert.deepEqual(amounts(f), {
      orders: 1,
      payments: 1,
      evidence: 0,
      stock: 9,
      cart: 0,
    });
  } finally {
    await f.dispose();
  }
});
