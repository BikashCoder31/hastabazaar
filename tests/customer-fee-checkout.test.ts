import {seedLegacyPublishedCampaign,legacyFeeEvidenceInsert} from './helpers/legacy-fee-history-fixture';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCodOrder } from '../lib/db/repositories/orders';
import { getPlatformServiceFee } from '../lib/db/repositories/platform-service-fee';
import { getCheckoutPolicyContext } from '../lib/checkout/policy-context';
import { saveBusinessSettingChange } from '../lib/db/repositories/business-settings';
import * as legacy from '../lib/db/repositories/fee-waivers';
import {
  AT,
  terms,
  customerFeeCheckoutFixture,
  feeWaiverContext as context,
  interleaveFeeWaiverBatch,
  addManaged,
} from './helpers/customer-fee-waiver-fixture';
import * as repository from '../lib/db/repositories/customer-fee-waivers';
import type { CheckoutInput } from '../lib/checkout/validation';
async function campaign(db: D1Database, key = 'launch', schedule = terms) {
  assert.ok(repository, 'Customer fee lifecycle repository is required');
  const revision = (await repository.getCustomerFeeWaiverState(db)).revision;
  const draft = await repository.mutateCustomerFeeWaiver(
    db,
    context(key + '-create', revision, { now: AT }),
    { type: 'create', terms: schedule },
  );
  return repository.mutateCustomerFeeWaiver(
    db,
    context(key + '-publish', revision + 1, { now: AT }),
    { type: 'publish', campaignId: draft.id },
  );
}
type Fixture = Awaited<ReturnType<typeof customerFeeCheckoutFixture>>;
function conserved(f: Fixture) {
  return Object.fromEntries(
    [
      'orders',
      'order_items',
      'payments',
      'order_customer_service_fees',
      'order_item_marketplace_fees',
      'seller_ledger_entries',
      'order_policy_acceptances',
      'order_documents',
      'managed_commercial_snapshots',
      'managed_entitlements',
      'staff_permission_guards',
      'operation_transaction_guards',
      'cart_items',
      'products',
    ].map((table) => [
      table,
      f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
    ]),
  );
}
async function review(f: Fixture, at = AT) {
  const serviceFee = await getPlatformServiceFee(f.database, at);
  return {
    ...f.input,
    reviewedQuote: {
      lines: [
        { id: 'line-a', sellerId: 'seller-a', pricePaisa: 100000, quantity: 1 },
      ],
      deliveryPaisa: 15000,
      walletPaisa: 0,
      referralPaisa: 0,
      promoPaisa: 0,
      payablePaisa: 115000 + serviceFee.chargedPaisa,
      policyContext: await getCheckoutPolicyContext(),
      referralCampaign: null,
      serviceFee,
    },
  };
}
async function place(
  f: Fixture,
  input: CheckoutInput = f.input,
  db = f.database,
  at = AT,
) {
  return createCodOrder(db, 'token', 'receipt', input, at, 'checkout-buyer');
}
for (const mode of [
  'ordinary',
  'waived',
  'legacy-only',
  'multi-seller',
  'mixed',
  'managed-only',
] as const)
  void test(`${mode}: one customer fee fact with unchanged accepted twelve percent seller money`, async (t) => {
    t.mock.method(Date, 'now', () => AT);
    const f = await customerFeeCheckoutFixture();
    try {
      const waived = [
        'waived',
        'multi-seller',
        'mixed',
        'managed-only',
      ].includes(mode);
      const active = waived ? await campaign(f.database) : null;
      if (mode === 'legacy-only') {
        await seedLegacyPublishedCampaign(f.database,'legacy-only',terms,AT);
      }
      if (mode === 'multi-seller')
        f.sqlite.exec(
          `INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES('product-b','seller-b','cat','craft-b','SKU-B','Craft B','Fictional craft',100000,10,'Maker','NP','Wood','published',1,1); INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('line-b','cart','product-b',1,1,1);`,
        );
      if (mode === 'mixed' || mode === 'managed-only')
        await addManaged(f, mode === 'managed-only');
      const result = await place(f);
      const rows = f.sqlite
        .prepare('SELECT * FROM order_customer_service_fees')
        .all();
      assert.equal(rows.length, 1, 'one immutable customer fact per order');
      assert.equal(rows[0].policy_amount_paisa, 1000);
      assert.equal(rows[0].standard_paisa, 1000);
      assert.equal(rows[0].waived_paisa, waived ? 1000 : 0);
      assert.equal(rows[0].net_paisa, waived ? 0 : 1000);
      assert.equal(rows[0].campaign_id, active?.id ?? null);
      assert.equal(rows[0].campaign_revision, active?.revision ?? null);
      assert.equal(rows[0].created_at, AT);
      const order = f.sqlite.prepare('SELECT * FROM orders').get()!;
      assert.equal(order.buyer_platform_fee_paisa, waived ? 0 : 1000);
      assert.equal(order.grand_total_paisa, result.grandTotalPaisa);
      assert.equal(
        f.sqlite.prepare('SELECT amount_paisa FROM payments').get()
          ?.amount_paisa,
        result.grandTotalPaisa,
      );
      const saved = JSON.parse(
        String(
          f.sqlite
            .prepare('SELECT terms_snapshot_json FROM order_policy_acceptances')
            .get()?.terms_snapshot_json,
        ),
      );
      assert.deepEqual(
        saved.serviceFee,
        await getPlatformServiceFee(f.database, AT),
      );
      assert.equal(
        JSON.parse(String(order.return_policy_snapshot_json)).serviceFee
          .chargedPaisa,
        waived ? 0 : 1000,
      );
      assert.equal(
        f.sqlite
          .prepare('SELECT COUNT(*) n FROM order_item_marketplace_fees')
          .get()?.n,
        0,
        'new checkout writes no legacy line evidence',
      );
      for (const line of f.sqlite
        .prepare(
          "SELECT commission_bps,commission_paisa FROM order_items WHERE seller_id='seller-a'",
        )
        .all())
        assert.deepEqual(
          { ...line },
          { commission_bps: 1200, commission_paisa: 12000 },
        );
      if (mode === 'mixed' || mode === 'managed-only')
        assert.deepEqual(
          {
            ...f.sqlite
              .prepare(
                'SELECT platform_retention_bps,platform_retained_paisa,maker_entitlement_paisa FROM managed_commercial_snapshots',
              )
              .get(),
          },
          {
            platform_retention_bps: 1200,
            platform_retained_paisa: 12000,
            maker_entitlement_paisa: 88000,
          },
        );
      for (const document of f.sqlite
        .prepare('SELECT snapshot_json FROM order_documents')
        .all())
        assert.equal(
          JSON.parse(String(document.snapshot_json)).buyerPlatformFeePaisa,
          waived ? 0 : 1000,
        );
      const before = conserved(f);
      if (active)
        await repository!.mutateCustomerFeeWaiver(
          f.database,
          context('pause-retry', 2, { now: AT }),
          { type: 'pause', campaignId: active.id },
        );
      else await campaign(f.database);
      await saveBusinessSettingChange(f.database, {
        key: 'platform_service_fee_policy',
        value: { enabled: false, amountPaisa: 2500 },
        actorId: 'owner',
        reason: 'Policy after original order',
        requestId: 'later-fee',
        now: AT + 1,
        effectiveFrom: null,
        expectedVersion: 0,
      });
      assert.deepEqual(await place(f, f.input, f.database, AT + 2000), result);
      assert.deepEqual(
        conserved(f),
        before,
        'retry conserves original order, evidence and financial facts',
      );
    } finally {
      await f.dispose();
    }
  });
for (const policy of [
  { enabled: false, amountPaisa: 2500 },
  { enabled: true, amountPaisa: 0 },
])
  void test(`active campaign never invents relief for ${JSON.stringify(policy)}`, async (t) => {
    t.mock.method(Date, 'now', () => AT);
    const f = await customerFeeCheckoutFixture();
    try {
      await campaign(f.database);
      await saveBusinessSettingChange(f.database, {
        key: 'platform_service_fee_policy',
        value: policy,
        actorId: 'owner',
        reason: 'Disposable zero policy',
        requestId: 'zero-policy',
        now: AT - 1,
        effectiveFrom: null,
        expectedVersion: 0,
      });
      await place(f);
      assert.deepEqual(
        {
          ...f.sqlite
            .prepare(
              'SELECT policy_enabled,policy_amount_paisa,standard_paisa,waived_paisa,net_paisa,campaign_id,campaign_revision FROM order_customer_service_fees',
            )
            .get(),
        },
        {
          policy_enabled: policy.enabled ? 1 : 0,
          policy_amount_paisa: policy.amountPaisa,
          standard_paisa: 0,
          waived_paisa: 0,
          net_paisa: 0,
          campaign_id: null,
          campaign_revision: null,
        },
      );
    } finally {
      await f.dispose();
    }
  });
for (const mutation of [
  'publish',
  'pause',
  'revise',
  'no-campaign',
  'takeover',
  'policy',
  'zero-policy',
] as const)
  void test(`real competing ${mutation} transaction rejects checkout and conserves financial rows`, async (t) => {
    t.mock.method(Date, 'now', () => AT);
    const f = await customerFeeCheckoutFixture();
    try {
      const active =
        mutation === 'no-campaign' || mutation === 'publish'
          ? null
          : await campaign(f.database);
      const draft =
        mutation === 'publish'
          ? await repository!.mutateCustomerFeeWaiver(
              f.database,
              context('draft', 0, { now: AT }),
              { type: 'create', terms },
            )
          : null;
      if (mutation === 'takeover')
        await campaign(f.database, 'overlap', { ...terms, startsAt: AT - 5 });
      if (mutation === 'zero-policy')
        await saveBusinessSettingChange(f.database, {
          key: 'platform_service_fee_policy',
          value: { enabled: false, amountPaisa: 1000 },
          actorId: 'owner',
          reason: 'Initial zero charge',
          requestId: 'zero-start',
          now: AT - 2,
          effectiveFrom: null,
          expectedVersion: 0,
        });
      const before = conserved(f);
      const db = interleaveFeeWaiverBatch(f.database, async () => {
        if (mutation === 'no-campaign') await campaign(f.database);
        else if (mutation === 'policy' || mutation === 'zero-policy')
          await saveBusinessSettingChange(f.database, {
            key: 'platform_service_fee_policy',
            value: { enabled: false, amountPaisa: 2000 },
            actorId: 'owner',
            reason: 'Competing fee publication',
            requestId: 'race-policy',
            now: AT,
            effectiveFrom: null,
            expectedVersion: mutation === 'zero-policy' ? 1 : 0,
          });
        else {
          const revision = (
            await repository!.getCustomerFeeWaiverState(f.database)
          ).revision;
          await repository!.mutateCustomerFeeWaiver(
            f.database,
            context('race', revision, { now: AT }),
            mutation === 'revise'
              ? {
                  type: 'revise',
                  campaignId: active!.id,
                  terms: { ...terms, name: 'New attribution' },
                }
              : {
                  type: mutation === 'publish' ? 'publish' : 'pause',
                  campaignId: (draft ?? active)!.id,
                },
          );
        }
      });
      await assert.rejects(place(f, f.input, db), /changed|review/i);
      assert.deepEqual(conserved(f), before);
    } finally {
      await f.dispose();
    }
  });
for (const boundary of ['start', 'end', 'takeover', 'policy'] as const)
  void test(`placement at exact ${boundary} boundary rechecks the selected quote`, async (t) => {
    t.mock.method(Date, 'now', () => AT + 10);
    const f = await customerFeeCheckoutFixture();
    try {
      if (boundary === 'policy')
        await saveBusinessSettingChange(f.database, {
          key: 'platform_service_fee_policy',
          value: { enabled: false, amountPaisa: 1000 },
          actorId: 'owner',
          reason: 'Scheduled policy boundary',
          requestId: 'future-policy',
          now: AT,
          effectiveFrom: AT + 10,
          expectedVersion: 0,
        });
      else
        await campaign(f.database, 'boundary', {
          ...terms,
          startsAt: boundary === 'start' ? AT + 10 : AT - 10,
          endsAt: boundary === 'start' ? AT + 1000 : AT + 10,
        });
      if (boundary === 'takeover')
        await campaign(f.database, 'next', { ...terms, startsAt: AT - 5 });
      const before = conserved(f);
      await assert.rejects(place(f), /changed|review/i);
      assert.deepEqual(conserved(f), before);
    } finally {
      await f.dispose();
    }
  });
for (const mutation of ['pause', 'revise', 'takeover', 'policy'] as const)
  void test(`saved reviewed ${mutation} quote is stale even when both net charges are zero`, async (t) => {
    t.mock.method(Date, 'now', () => AT);
    const f = await customerFeeCheckoutFixture();
    try {
      const active = await campaign(f.database);
      const input = await review(f);
      if (mutation === 'takeover')
        await campaign(f.database, 'earlier', { ...terms, startsAt: AT - 20 });
      else if (mutation === 'policy')
        await saveBusinessSettingChange(f.database, {
          key: 'platform_service_fee_policy',
          value: { enabled: true, amountPaisa: 2000 },
          actorId: 'owner',
          reason: 'Waived policy change',
          requestId: 'review-policy',
          now: AT,
          effectiveFrom: null,
          expectedVersion: 0,
        });
      else {
        await repository!.mutateCustomerFeeWaiver(
          f.database,
          context('review-change', 2, { now: AT }),
          mutation === 'revise'
            ? {
                type: 'revise',
                campaignId: active.id,
                terms: { ...terms, name: 'Revised' },
              }
            : { type: 'pause', campaignId: active.id },
        );
        if (mutation === 'pause') await campaign(f.database, 'replacement');
      }
      assert.equal(
        (await getPlatformServiceFee(f.database, AT)).chargedPaisa,
        0,
      );
      const before = conserved(f);
      await assert.rejects(place(f, input), /review/i);
      assert.deepEqual(conserved(f), before);
    } finally {
      await f.dispose();
    }
  });
for (const table of ['order_customer_service_fees', 'payments'])
  void test(`${table} failure rolls back the actual order transaction`, async (t) => {
    t.mock.method(Date, 'now', () => AT);
    const f = await customerFeeCheckoutFixture();
    try {
      await campaign(f.database);
      const before = conserved(f);
      f.sqlite.exec(
        `CREATE TRIGGER reject_customer_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'fixture_insert_failure'); END;`,
      );
      await assert.rejects(place(f), /fixture_insert_failure/);
      assert.deepEqual(conserved(f), before);
    } finally {
      await f.dispose();
    }
  });
void test('customer campaign cannot activate an ineligible managed product', async (t) => {
  t.mock.method(Date, 'now', () => AT);
  const f = await customerFeeCheckoutFixture();
  try {
    await addManaged(f, true);
    await campaign(f.database);
    f.sqlite.exec(
      "UPDATE seller_participation_profiles SET application_stage='submitted' WHERE seller_id='seller-b'",
    );
    const before = conserved(f);
    await assert.rejects(place(f));
    assert.deepEqual(conserved(f), before);
  } finally {
    await f.dispose();
  }
});

for (const boundary of ['start', 'end'] as const)
  void test(`a fresh quote at the exact ${boundary} charges the inclusive/exclusive amount`, async (t) => {
    t.mock.method(Date, 'now', () => AT + 10);
    const f = await customerFeeCheckoutFixture();
    try {
      await campaign(f.database, 'exact', {
        ...terms,
        startsAt: boundary === 'start' ? AT + 10 : AT - 10,
        endsAt: boundary === 'end' ? AT + 10 : AT + 1000,
      });
      await place(f, await review(f, AT + 10), f.database, AT + 10);
      assert.equal(
        f.sqlite
          .prepare('SELECT net_paisa FROM order_customer_service_fees')
          .get()?.net_paisa,
        boundary === 'start' ? 0 : 1000,
      );
    } finally {
      await f.dispose();
    }
  });
void test('a saved legacy fee quote cannot place a corrected order even for the same payable amount', async (t) => {
  t.mock.method(Date, 'now', () => AT);
  const f = await customerFeeCheckoutFixture();
  try {
    const input = await review(f);
    const current = input.reviewedQuote.serviceFee;
    const {
      schemaVersion: _schema,
      standardPaisa: _standard,
      waivedPaisa: _waived,
      campaign: _campaign,
      ...legacyFee
    } = current;
    const before = conserved(f);
    await assert.rejects(
      place(f, {
        ...input,
        reviewedQuote: { ...input.reviewedQuote, serviceFee: legacyFee },
      }),
      /review/i,
    );
    assert.deepEqual(conserved(f), before);
  } finally {
    await f.dispose();
  }
});
void test('new checkout and customer campaign changes retain an original waived legacy line byte for byte', async (t) => {
  t.mock.method(Date, 'now', () => AT);
  const f = await customerFeeCheckoutFixture();
  try {
    const old = await seedLegacyPublishedCampaign(f.database,'old-history',terms,AT);
    f.sqlite
      .exec(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
    VALUES('historical','FIX-HISTORICAL','checkout-buyer','buyer@example.test','9811111111','placed','en-NP','historical','{}',10000,500,10500,'cod','unpaid',1,1);
    INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,created_at)
    VALUES('historical-line','historical','product','seller-a','Historical Shop','Historical craft','OLD',10000,1,0,0,10000,1);`);
    await legacyFeeEvidenceInsert(
        f.database,
        'historical-line',
        {
          standardBps: 1000,
          basePaisa: 10000,
          standardPaisa: 1000,
          waivedPaisa: 1000,
          netPaisa: 0,
          campaignId: old.id,
          campaignRevision: old.revision,
        },
        1,
      )
      .run();
    const saved = f.sqlite
      .prepare("SELECT * FROM order_items WHERE id='historical-line'")
      .get();
    const evidence = f.sqlite
      .prepare('SELECT * FROM order_item_marketplace_fees')
      .all();
    const view = await legacy.readOrderMarketplaceFees(f.database, [
      'historical-line',
    ]);
    await campaign(f.database);
    await place(f);
    assert.deepEqual(
      f.sqlite
        .prepare("SELECT * FROM order_items WHERE id='historical-line'")
        .get(),
      saved,
    );
    assert.deepEqual(
      f.sqlite.prepare('SELECT * FROM order_item_marketplace_fees').all(),
      evidence,
    );
    assert.deepEqual(
      await legacy.readOrderMarketplaceFees(f.database, ['historical-line']),
      view,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM order_customer_service_fees WHERE order_id='historical'",
        )
        .get()?.n,
      0,
    );
  } finally {
    await f.dispose();
  }
});

void test('equal-start customer campaigns attribute only the immutable ID winner', async (t) => {
  t.mock.method(Date, 'now', () => AT);
  const f = await customerFeeCheckoutFixture();
  try {
    const a = await campaign(f.database, 'tie-a');
    const b = await campaign(f.database, 'tie-b');
    await place(f);
    assert.deepEqual(
      {
        ...f.sqlite
          .prepare(
            'SELECT campaign_id,standard_paisa,waived_paisa,net_paisa FROM order_customer_service_fees',
          )
          .get(),
      },
      {
        campaign_id: [a.id, b.id].sort()[0],
        standard_paisa: 1000,
        waived_paisa: 1000,
        net_paisa: 0,
      },
    );
  } finally {
    await f.dispose();
  }
});
