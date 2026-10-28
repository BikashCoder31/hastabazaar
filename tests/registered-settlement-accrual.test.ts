import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accrueExistingDeliveredEarnings,
  buildEarningsAccrualStatements,
  getSellerFinanceSummary,
} from '../lib/db/repositories/payouts';
import { getRegisteredSettlementTerms } from '../lib/settlements/registered-terms';
import { commissionDatabase } from './helpers/commission-database';

const deliveredAt = 1_800_000_000_000;
const day = 86_400_000;
const terms14 = {
  schemaVersion: 1,
  deliveryHoldDays: 14,
  holdSettingVersionId: null,
  reserveBps: 0,
  reserveSettingVersionId: null,
  reserveAppliesForDays: 0,
  reserveReleaseAfterDays: 0,
};

type LedgerRow = {
  id: string;
  order_item_id: string;
  type: string;
  amount_paisa: number;
  available_at: number;
  created_at: number;
};

async function insertDeliveredOrder(
  database: D1Database,
  id: string,
  options: { sellerId?: string; snapshot?: Record<string, unknown> } = {},
) {
  await database
    .prepare(`INSERT OR IGNORE INTO categories
    (id,slug,name_en,is_active,sort_order,created_at,updated_at)
    VALUES ('settlement-category','settlement-craft','Isolated crafts',1,1,1,1)`)
    .run();
  await database
    .prepare(`INSERT INTO products
    (id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,
     inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
    VALUES (?,?,'settlement-category',?,?,'Isolated craft','Isolated craft',10000,
      1,'Isolated seller','NP','Wood','published',1,1)`)
    .bind(
      `product-${id}`,
      options.sellerId ?? 'seller-a',
      `craft-${id}`,
      `SKU-${id}`,
    )
    .run();
  await database
    .prepare(`INSERT INTO orders
    (id,order_number,customer_email,customer_phone,status,locale,policy_version,
     shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,
     grand_total_paisa,payment_mode,payment_status,placed_at,delivered_at,created_at,updated_at)
    VALUES (?,?,'buyer@example.test','9800000000','delivered','en-NP','isolated-test',
      '{}',10000,0,10000,'cod','paid',?,?,?,?)`)
    .bind(
      id,
      `ISOLATED-${id}`,
      deliveredAt - day,
      deliveredAt,
      deliveredAt - day,
      deliveredAt,
    )
    .run();
  await database
    .prepare(`INSERT INTO order_items
    (id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,
     unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,
     fulfillment_status,created_at)
    VALUES (?,?,?,?,'Isolated seller','Isolated craft','ISOLATED',10000,1,900,900,10000,'delivered',?)`)
    .bind(
      `item-${id}`,
      id,
      `product-${id}`,
      options.sellerId ?? 'seller-a',
      deliveredAt - day,
    )
    .run();
  if (options.snapshot !== undefined) {
    await database
      .prepare(`INSERT INTO order_policy_acceptances
      (id,order_id,policy_version,terms_snapshot_json,acceptance_method,request_id,accepted_at)
      VALUES (?,?,'isolated-test',?,'checkout_checkbox',?,?)`)
      .bind(
        `accept-${id}`,
        id,
        JSON.stringify(options.snapshot),
        `accept-${id}`,
        deliveredAt - day,
      )
      .run();
  }
}

async function insertHoldSetting(
  database: D1Database,
  id: string,
  version: number,
  days: number,
  effectiveAt: number,
) {
  await database
    .prepare(`INSERT INTO business_setting_versions
    (id,setting_key,version,value_json,status,revision,change_control,effective_from,
     reason,created_by,created_at,last_request_id)
    VALUES (?,'seller_delivery_hold_days',?,?,'published',1,'controlled',?,
      'Isolated prospective hold setting','owner',?,?)`)
    .bind(
      id,
      version,
      JSON.stringify(days),
      effectiveAt,
      effectiveAt,
      `setting-${id}`,
    )
    .run();
}

async function ledger(database: D1Database) {
  return (
    await database
      .prepare(`SELECT id,order_item_id,type,amount_paisa,available_at,created_at
    FROM seller_ledger_entries ORDER BY order_item_id,type`)
      .all<LedgerRow>()
  ).results.map((row) => ({ ...row }));
}

async function snapshots(database: D1Database) {
  return (
    await database
      .prepare('SELECT * FROM order_policy_acceptances ORDER BY id')
      .all()
  ).results;
}

void test('snapshotted 14-day hold makes sale and commission available together without a 5% reserve', async () => {
  const f = await commissionDatabase();
  try {
    await insertDeliveredOrder(f.database, 'fourteen', {
      snapshot: { registeredSettlementTerms: terms14 },
    });
    await f.database.batch(
      buildEarningsAccrualStatements(f.database, {
        orderId: 'fourteen',
        now: deliveredAt + day,
      }),
    );

    assert.deepEqual(
      (await ledger(f.database)).map(
        ({ type, amount_paisa, available_at, created_at }) => ({
          type,
          amount_paisa,
          available_at,
          created_at,
        }),
      ),
      [
        {
          type: 'commission',
          amount_paisa: -900,
          available_at: 1_801_209_600_000,
          created_at: deliveredAt,
        },
        {
          type: 'sale',
          amount_paisa: 10000,
          available_at: 1_801_209_600_000,
          created_at: deliveredAt,
        },
      ],
    );
    for (const at of [deliveredAt + 7 * day, deliveredAt + 14 * day - 1]) {
      const summary = await getSellerFinanceSummary(f.database, 'seller-a', at);
      assert.equal(summary.availablePaisa, 0);
      assert.equal(summary.pendingPaisa, 9100);
    }
    const available = await getSellerFinanceSummary(
      f.database,
      'seller-a',
      deliveredAt + 14 * day,
    );
    assert.equal(available.availablePaisa, 9100);
    assert.equal(available.pendingPaisa, 0);
  } finally {
    await f.dispose();
  }
});

void test('later saved hold settings do not reprice an earlier order snapshot or its accrued entries', async () => {
  const f = await commissionDatabase();
  try {
    await insertHoldSetting(f.database, 'hold14', 1, 14, deliveredAt - 2 * day);
    const acceptedTerms = await getRegisteredSettlementTerms(
      f.database,
      deliveredAt - day,
    );
    assert.equal(acceptedTerms.deliveryHoldDays, 14);
    assert.equal(acceptedTerms.holdSettingVersionId, 'hold14');
    await insertDeliveredOrder(f.database, 'earlier', {
      snapshot: { registeredSettlementTerms: acceptedTerms },
    });
    const acceptedEvidence = await snapshots(f.database);

    // Change the saved policy before this order has any ledger entries.
    await insertHoldSetting(f.database, 'hold21', 2, 21, deliveredAt);
    assert.equal(
      (await getRegisteredSettlementTerms(f.database, deliveredAt + day))
        .deliveryHoldDays,
      21,
    );
    await f.database.batch(
      buildEarningsAccrualStatements(f.database, { now: deliveredAt + day }),
    );
    const accrued = await ledger(f.database);
    assert.deepEqual(
      accrued.map((row) => row.available_at),
      [1_801_209_600_000, 1_801_209_600_000],
    );

    // A subsequent change and a later accrual must preserve every original row.
    await insertHoldSetting(f.database, 'hold28', 3, 28, deliveredAt + 2 * day);
    assert.equal(
      (await getRegisteredSettlementTerms(f.database, deliveredAt + 3 * day))
        .deliveryHoldDays,
      28,
    );
    await f.database.batch(
      buildEarningsAccrualStatements(f.database, {
        now: deliveredAt + 3 * day,
      }),
    );
    assert.deepEqual(await ledger(f.database), accrued);
    assert.deepEqual(await snapshots(f.database), acceptedEvidence);
  } finally {
    await f.dispose();
  }
});

void test('a new settlement snapshot missing any required field aborts the entire accrual transaction', async (t) => {
  for (const missing of Object.keys(terms14)) {
    await t.test(`missing ${missing}`, async () => {
      const f = await commissionDatabase();
      try {
        await insertDeliveredOrder(f.database, 'already-accrued', {
          snapshot: { registeredSettlementTerms: terms14 },
        });
        await f.database.batch(
          buildEarningsAccrualStatements(f.database, {
            orderId: 'already-accrued',
            now: deliveredAt,
          }),
        );
        const before = await ledger(f.database);
        await insertDeliveredOrder(f.database, 'valid-pending', {
          snapshot: { registeredSettlementTerms: terms14 },
        });
        const incomplete: Record<string, unknown> = { ...terms14 };
        delete incomplete[missing];
        await insertDeliveredOrder(f.database, 'malformed', {
          snapshot: { registeredSettlementTerms: incomplete },
        });
        const evidenceBefore = await snapshots(f.database);
        const auditsBefore = (
          await f.database.prepare('SELECT * FROM audit_logs ORDER BY id').all()
        ).results;

        await assert.rejects(
          accrueExistingDeliveredEarnings(f.database, {
            actorId: 'owner',
            requestId: `malformed-${missing}`,
            now: deliveredAt + day,
          }),
        );
        assert.deepEqual(await ledger(f.database), before);
        assert.deepEqual(await snapshots(f.database), evidenceBefore);
        assert.equal(
          (
            await f.database
              .prepare(
                'SELECT COUNT(*) AS count FROM operation_transaction_guards',
              )
              .first<{ count: number }>()
          )?.count,
          0,
        );
        assert.deepEqual(
          (
            await f.database
              .prepare('SELECT * FROM audit_logs ORDER BY id')
              .all()
          ).results,
          auditsBefore,
        );
      } finally {
        await f.dispose();
      }
    });
  }
});

void test('legacy orders retain the 7-day hold, 5% reserve, 90-day eligibility window and 30-day release', async () => {
  const f = await commissionDatabase();
  try {
    await insertHoldSetting(f.database, 'current14', 1, 14, deliveredAt - day);
    await f.database
      .prepare('UPDATE seller_profiles SET approved_at=? WHERE id=?')
      .bind(deliveredAt - 89 * day, 'seller-a')
      .run();
    await f.database
      .prepare('UPDATE seller_profiles SET approved_at=? WHERE id=?')
      .bind(deliveredAt - 90 * day, 'seller-b')
      .run();
    await insertDeliveredOrder(f.database, 'legacy-no-acceptance');
    await insertDeliveredOrder(f.database, 'legacy-no-terms', {
      sellerId: 'seller-b',
      snapshot: { existingCustomerPolicy: 'unchanged' },
    });
    const evidenceBefore = await snapshots(f.database);
    await f.database.batch(
      buildEarningsAccrualStatements(f.database, { now: deliveredAt + day }),
    );

    assert.deepEqual(
      (await ledger(f.database)).map(
        ({ order_item_id, type, amount_paisa, available_at }) => ({
          order_item_id,
          type,
          amount_paisa,
          available_at,
        }),
      ),
      [
        {
          order_item_id: 'item-legacy-no-acceptance',
          type: 'commission',
          amount_paisa: -900,
          available_at: 1_800_604_800_000,
        },
        {
          order_item_id: 'item-legacy-no-acceptance',
          type: 'reserve_hold',
          amount_paisa: -455,
          available_at: 1_800_604_800_000,
        },
        {
          order_item_id: 'item-legacy-no-acceptance',
          type: 'reserve_release',
          amount_paisa: 455,
          available_at: 1_802_592_000_000,
        },
        {
          order_item_id: 'item-legacy-no-acceptance',
          type: 'sale',
          amount_paisa: 10000,
          available_at: 1_800_604_800_000,
        },
        {
          order_item_id: 'item-legacy-no-terms',
          type: 'commission',
          amount_paisa: -900,
          available_at: 1_800_604_800_000,
        },
        {
          order_item_id: 'item-legacy-no-terms',
          type: 'sale',
          amount_paisa: 10000,
          available_at: 1_800_604_800_000,
        },
      ],
    );
    const seventhDay = await getSellerFinanceSummary(
      f.database,
      'seller-a',
      deliveredAt + 7 * day,
    );
    assert.equal(seventhDay.availablePaisa, 8645);
    assert.equal(seventhDay.pendingPaisa, 455);
    assert.equal(
      (
        await getSellerFinanceSummary(
          f.database,
          'seller-a',
          deliveredAt + 30 * day - 1,
        )
      ).availablePaisa,
      8645,
    );
    assert.equal(
      (
        await getSellerFinanceSummary(
          f.database,
          'seller-a',
          deliveredAt + 30 * day,
        )
      ).availablePaisa,
      9100,
    );
    assert.equal(
      (
        await getSellerFinanceSummary(
          f.database,
          'seller-b',
          deliveredAt + 7 * day,
        )
      ).availablePaisa,
      9100,
    );
    assert.deepEqual(await snapshots(f.database), evidenceBefore);
  } finally {
    await f.dispose();
  }
});

void test('same-request and new-request accrual replays preserve ledger IDs, values and accepted evidence', async () => {
  const f = await commissionDatabase();
  try {
    await insertDeliveredOrder(f.database, 'replay', {
      snapshot: { registeredSettlementTerms: terms14 },
    });
    await accrueExistingDeliveredEarnings(f.database, {
      actorId: 'owner',
      requestId: 'first-accrual',
      now: deliveredAt,
    });
    const first = await ledger(f.database);
    const evidence = await snapshots(f.database);
    assert.equal(first.length, 2);

    await accrueExistingDeliveredEarnings(f.database, {
      actorId: 'owner',
      requestId: 'first-accrual',
      now: deliveredAt + day,
    });
    await accrueExistingDeliveredEarnings(f.database, {
      actorId: 'owner',
      requestId: 'second-accrual',
      now: deliveredAt + 40 * day,
    });
    assert.deepEqual(await ledger(f.database), first);
    assert.deepEqual(await snapshots(f.database), evidence);
    assert.equal(
      (
        await f.database
          .prepare(
            "SELECT COUNT(*) AS count FROM audit_logs WHERE action='seller.earnings.accrued'",
          )
          .first<{ count: number }>()
      )?.count,
      2,
    );
  } finally {
    await f.dispose();
  }
});
