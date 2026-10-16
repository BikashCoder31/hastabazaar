import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePromoDiscount } from '../lib/incentives/promo-policy';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import {
  createIncentiveDb,
  seedIncentiveCustomer,
  incentiveOrder,
  seedIncentiveInventory,
  incentiveItem,
} from './helpers/incentive-db';

void test('migration preserves referral totals and ledger while making historical promo amounts zero', async () => {
  const f = await createIncentiveDb({
    beforePromo: async (db) => {
      await seedIncentiveCustomer(db);
      await seedIncentiveInventory(db);
      await incentiveOrder(db, 'historical', 1200, 800).run();
      await db
        .prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,
      sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,created_at,platform_discount_paisa)
      VALUES ('historical-item','historical','product','seller','Fixture','Fixture','SKU',10000,1,900,900,10000,1,1200)`)
        .run();
      await db
        .prepare(`INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,
      redeemed_by,redeemed_at,redemption_request_id) VALUES ('historical-gift',?,500,'customer','gift-issue',1,'customer',1,'gift-redeem')`)
        .bind('b'.repeat(64))
        .run();
      await db
        .prepare(
          "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) VALUES ('gift-credit','customer',NULL,500,-500,'gift_card','historical-gift',1)",
        )
        .run();
      await db
        .prepare(`INSERT INTO refunds(id,order_id,status,amount_paisa,item_amount_paisa,delivery_amount_paisa,
      reason,requested_at,referral_discount_paisa) VALUES ('historical-refund','historical','approved',2000,2000,0,'Fixture',1,100)`)
        .run();
      await db
        .prepare(
          "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) VALUES ('award','customer','historical',2000,-2000,'referral_reward',NULL,1)",
        )
        .run();
      await db
        .prepare(
          "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) VALUES ('spend','customer','historical',-800,800,'order_spend',NULL,1)",
        )
        .run();
      await db
        .prepare(
          "UPDATE orders SET current_subtotal_paisa=10000,current_delivery_paisa=500,current_wallet_paisa=800,current_discount_paisa=1200,current_total_paisa=8500 WHERE id='historical'",
        )
        .run();
    },
  });
  try {
    const row = await f.db
      .prepare("SELECT * FROM orders WHERE id='historical'")
      .first<Record<string, unknown>>();
    assert.equal(row?.grand_total_paisa, 8500);
    assert.equal(row?.current_total_paisa, 8500);
    assert.equal(row?.referral_discount_paisa, 1200);
    assert.equal(row?.discount_source, 'referral');
    assert.equal(row?.promo_discount_paisa, 0);
    assert.equal(row?.current_promo_discount_paisa, 0);
    assert.equal(row?.refunded_promo_discount_paisa, 0);
    assert.equal(row?.current_referral_discount_paisa, 1200);
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT balance_paisa AS n FROM wallet_accounts WHERE user_id='customer'",
          )
          .first<{ n: number }>()
      )?.n,
      1700,
    );
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM wallet_entries')
          .first<{ n: number }>()
      )?.n,
      3,
    );
    await assert.rejects(
      f.db
        .prepare(
          "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) VALUES ('bad','customer',NULL,100,-100,'referral_reward',NULL,1)",
        )
        .run(),
    );
    await assert.rejects(
      f.db.prepare('UPDATE wallet_entries SET amount_paisa=2').run(),
    );
    assert.deepEqual(
      await f.db
        .prepare(
          "SELECT promo_discount_paisa,current_promo_discount_paisa,refunded_promo_discount_paisa,discount_source,referral_discount_paisa FROM order_items WHERE id='historical-item'",
        )
        .first(),
      {
        promo_discount_paisa: 0,
        current_promo_discount_paisa: 0,
        refunded_promo_discount_paisa: 0,
        discount_source: 'referral',
        referral_discount_paisa: 1200,
      },
    );
    assert.deepEqual(
      await f.db
        .prepare(
          "SELECT amount_paisa,referral_discount_paisa,promo_discount_paisa FROM refunds WHERE id='historical-refund'",
        )
        .first(),
      {
        amount_paisa: 2000,
        referral_discount_paisa: 100,
        promo_discount_paisa: 0,
      },
    );
    await f.db
      .prepare(
        "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) VALUES ('partial-restore','customer','historical',300,-300,'cancellation',NULL,2)",
      )
      .run();
    await f.db
      .prepare(
        "UPDATE orders SET status='cancelled',updated_at=3 WHERE id='historical'",
      )
      .run();
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT balance_paisa AS n FROM wallet_accounts WHERE user_id='customer'",
          )
          .first<{ n: number }>()
      )?.n,
      2500,
    );
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT amount_paisa AS n FROM wallet_entries WHERE id='cancel:historical'",
          )
          .first<{ n: number }>()
      )?.n,
      500,
    );
    await assert.rejects(
      f.db
        .prepare(
          "UPDATE orders SET current_total_paisa=8499 WHERE id='historical'",
        )
        .run(),
    );
  } finally {
    await f.dispose();
  }
});

void test('invalid source-less gift credits still reject after applying the promo migration', async () => {
  const f = await createIncentiveDb();
  try {
    await seedIncentiveCustomer(f.db);
    await assert.rejects(
      f.db
        .prepare(
          "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) VALUES ('bad','customer',NULL,100,-100,'gift_card',NULL,1)",
        )
        .run(),
    );
    const rows = await f.db
      .prepare('SELECT COUNT(*) AS n FROM promo_campaigns')
      .first<{ n: number }>();
    assert.equal(rows?.n, 0);
  } finally {
    await f.dispose();
  }
});

async function campaign(
  db: D1Database,
  id: string,
  code: string,
  limit = 2,
  perCustomer = 2,
  budget = 2000,
  label = 'Fictional promo',
) {
  await db
    .prepare(
      "INSERT INTO promo_campaigns(id,code,status,created_at,updated_at) VALUES (?,?,'draft',1,1)",
    )
    .bind(id, code)
    .run();
  await db
    .prepare(`INSERT INTO promo_revisions(campaign_id,revision,label,kind,fixed_paisa,
    minimum_subtotal_paisa,starts_at,ends_at,total_use_limit,per_customer_use_limit,budget_paisa,
    created_by,request_id,reason,form_version_id,created_at)
    VALUES (?,1,?,'fixed',1000,0,1,100,?,?,?,'customer',?,'Fixture','fixture',1)`)
    .bind(id, label, limit, perCustomer, budget, `revision-${id}`)
    .run();
  await db
    .prepare(
      "UPDATE promo_campaigns SET current_revision=1,status='published' WHERE id=?",
    )
    .bind(id)
    .run();
}
function promoOrder(
  db: D1Database,
  id: string,
  campaignId: string,
  code: string,
  revision = 1,
  label = 'Fictional promo',
) {
  return db
    .prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,
    policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,
    payment_mode,payment_status,created_at,updated_at,promo_discount_paisa,promo_campaign_id,promo_revision,promo_code,promo_label)
    VALUES (?,?,'customer','customer@example.test','9811111111','placed','en-NP','fixture','{}',10000,500,9500,
    'cod','unpaid',1,1,1000,?,?,?,?)`)
    .bind(id, `FIX-${id}`, campaignId, revision, code, label);
}
function redemption(
  db: D1Database,
  id: string,
  orderId: string,
  campaignId: string,
  requestId = id,
  revision = 1,
) {
  return db
    .prepare(`INSERT INTO promo_redemptions(id,campaign_id,revision,customer_id,order_id,actor_id,request_id,
    payload_digest,response_json,discount_paisa,subtotal_paisa,created_at)
    VALUES (?,?,?,'customer',?,'customer',?,?,'{"order":"original"}',1000,10000,10)`)
    .bind(id, campaignId, revision, orderId, requestId, 'a'.repeat(64));
}

void test('native D1 enforces promo lifetime counters, immutable revisions, snapshots and rollback', async (t) => {
  const f = await createIncentiveDb();
  const db = f.db;
  try {
    await seedIncentiveCustomer(db);
    await seedIncentiveInventory(db);
    await campaign(db, 'limited', 'LIMITED', 1, 1, 1000);
    await t.test(
      'normalized code is unique and rejects unnormalized/non-ASCII spelling',
      async () => {
        for (const code of ['LIMITED', 'limited', ' LIMITED', 'LİMITED', 'AB'])
          await assert.rejects(
            db
              .prepare(
                'INSERT INTO promo_campaigns(id,code,created_at,updated_at) VALUES (?,?,1,1)',
              )
              .bind(`bad-${code}`, code)
              .run(),
          );
      },
    );
    await t.test(
      'campaign counters cannot be negative, over budget or reset, and revisions cannot change',
      async () => {
        await assert.rejects(
          db
            .prepare(
              "UPDATE promo_campaigns SET used_count=-1 WHERE id='limited'",
            )
            .run(),
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE promo_campaigns SET spent_paisa=1001 WHERE id='limited'",
            )
            .run(),
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE promo_revisions SET fixed_paisa=1 WHERE campaign_id='limited'",
            )
            .run(),
        );
        await assert.rejects(
          db
            .prepare("DELETE FROM promo_revisions WHERE campaign_id='limited'")
            .run(),
        );
      },
    );
    await t.test(
      'simultaneous last-use batches have one winner and failed order insert rolls back',
      async () => {
        const results = await Promise.allSettled(
          ['race1', 'race2'].map((id) =>
            db.batch([
              promoOrder(db, id, 'limited', 'LIMITED'),
              incentiveItem(db, `item-${id}`, id, 1000),
              redemption(db, id, id, 'limited'),
            ]),
          ),
        );
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(
          (
            await db
              .prepare(
                "SELECT COUNT(*) AS n FROM orders WHERE id IN ('race1','race2')",
              )
              .first<{ n: number }>()
          )?.n,
          1,
        );
        assert.deepEqual(
          await db
            .prepare(
              "SELECT used_count,spent_paisa FROM promo_campaigns WHERE id='limited'",
            )
            .first(),
          { used_count: 1, spent_paisa: 1000 },
        );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT used_count AS n FROM promo_customer_usage WHERE campaign_id='limited' AND customer_id='customer'",
              )
              .first<{ n: number }>()
          )?.n,
          1,
        );
        const winner = (await db
          .prepare(
            "SELECT order_id FROM promo_redemptions WHERE campaign_id='limited'",
          )
          .first<{ order_id: string }>())!.order_id;
        await assert.rejects(
          redemption(db, 'duplicate-order', winner, 'limited').run(),
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE promo_campaigns SET used_count=0,spent_paisa=0 WHERE id='limited'",
            )
            .run(),
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE promo_customer_usage SET used_count=0 WHERE campaign_id='limited'",
            )
            .run(),
        );
        await assert.rejects(
          db.prepare("UPDATE promo_redemptions SET response_json='{}'").run(),
        );
        await assert.rejects(db.prepare('DELETE FROM promo_redemptions').run());
        await db
          .prepare("UPDATE orders SET status='cancelled' WHERE id=?")
          .bind(winner)
          .run();
        assert.deepEqual(
          await db
            .prepare(
              "SELECT used_count,spent_paisa FROM promo_campaigns WHERE id='limited'",
            )
            .first(),
          { used_count: 1, spent_paisa: 1000 },
        );
      },
    );
    await t.test(
      'draft terms preserve the published financial revision and administrative version',
      async () => {
        await campaign(db, 'draftterms', 'DRAFTTERMS', 5, 5, 5000);
        await db
          .prepare(`INSERT INTO promo_revisions(campaign_id,revision,label,kind,fixed_paisa,minimum_subtotal_paisa,
        starts_at,ends_at,total_use_limit,per_customer_use_limit,budget_paisa,created_by,request_id,reason,form_version_id,created_at)
        SELECT campaign_id,2,label,kind,fixed_paisa,minimum_subtotal_paisa,starts_at,ends_at,total_use_limit,
        per_customer_use_limit,budget_paisa,created_by,'draftterms-v2',reason,form_version_id,2 FROM promo_revisions WHERE campaign_id='draftterms' AND revision=1`)
          .run();
        await assert.rejects(
          db.batch([
            promoOrder(db, 'draft-unpublished', 'draftterms', 'DRAFTTERMS', 2),
            incentiveItem(
              db,
              'draft-unpublished-item',
              'draft-unpublished',
              1000,
            ),
            redemption(
              db,
              'draft-unpublished-use',
              'draft-unpublished',
              'draftterms',
              'draft-unpublished-request',
              2,
            ),
          ]),
        );
        await db.batch([
          promoOrder(db, 'live-v1', 'draftterms', 'DRAFTTERMS'),
          incentiveItem(db, 'live-v1-item', 'live-v1', 1000),
          redemption(db, 'live-v1-use', 'live-v1', 'draftterms'),
        ]);
        assert.equal(
          (
            await db
              .prepare("SELECT * FROM promo_campaigns WHERE id='draftterms'")
              .first<Record<string, unknown>>()
          )?.version,
          1,
        );
        await db
          .prepare(
            "UPDATE promo_campaigns SET draft_revision=2,version=2 WHERE id='draftterms'",
          )
          .run();
        assert.deepEqual(
          await db
            .prepare(
              "SELECT current_revision,draft_revision,version,used_count FROM promo_campaigns WHERE id='draftterms'",
            )
            .first(),
          { current_revision: 1, draft_revision: 2, version: 2, used_count: 1 },
        );
        await db
          .prepare(
            "UPDATE promo_campaigns SET current_revision=draft_revision,draft_revision=NULL,version=3 WHERE id='draftterms'",
          )
          .run();
        await assert.rejects(
          db.batch([
            promoOrder(db, 'obsolete-v1', 'draftterms', 'DRAFTTERMS'),
            incentiveItem(db, 'obsolete-v1-item', 'obsolete-v1', 1000),
            redemption(db, 'obsolete-v1-use', 'obsolete-v1', 'draftterms'),
          ]),
        );
        await db.batch([
          promoOrder(db, 'live-v2', 'draftterms', 'DRAFTTERMS', 2),
          incentiveItem(db, 'live-v2-item', 'live-v2', 1000),
          redemption(
            db,
            'live-v2-use',
            'live-v2',
            'draftterms',
            'live-v2-request',
            2,
          ),
        ]);
        assert.equal(
          (
            await db
              .prepare(
                "SELECT version FROM promo_campaigns WHERE id='draftterms'",
              )
              .first<{ version: number }>()
          )?.version,
          3,
        );
      },
    );
    await t.test(
      'unique order and actor request preserve the original authorized response',
      async () => {
        await campaign(db, 'requestkeys', 'REQUESTKEYS', 5, 5, 5000);
        await db.batch([
          promoOrder(db, 'request-order', 'requestkeys', 'REQUESTKEYS'),
          incentiveItem(db, 'request-item', 'request-order', 1000),
          redemption(
            db,
            'request-use',
            'request-order',
            'requestkeys',
            'same-request',
          ),
        ]);
        await assert.rejects(
          redemption(
            db,
            'duplicate-order-live',
            'request-order',
            'requestkeys',
            'other-request',
          ).run(),
        );
        await assert.rejects(
          db.batch([
            promoOrder(
              db,
              'request-order-duplicate',
              'requestkeys',
              'REQUESTKEYS',
            ),
            incentiveItem(
              db,
              'request-item-duplicate',
              'request-order-duplicate',
              1000,
            ),
            redemption(
              db,
              'request-use-duplicate',
              'request-order-duplicate',
              'requestkeys',
              'same-request',
            ),
          ]),
        );
        assert.equal(
          await db
            .prepare("SELECT id FROM orders WHERE id='request-order-duplicate'")
            .first(),
          null,
        );
        assert.deepEqual(
          await db
            .prepare(
              "SELECT response_json,payload_digest FROM promo_redemptions WHERE id='request-use'",
            )
            .first(),
          {
            response_json: '{"order":"original"}',
            payload_digest: 'a'.repeat(64),
          },
        );
      },
    );
    await t.test(
      'revision numeric and kind constraints reject incomplete or unsafe terms',
      async () => {
        await db
          .prepare(
            "INSERT INTO promo_campaigns(id,code,created_at,updated_at) VALUES ('invalidterms','INVALIDTERMS',1,1)",
          )
          .run();
        const terms = (
          kind: string,
          fixed: number | null,
          bps: number | null,
          cap: number | null,
          budget: number,
          end = 253402300799999,
        ) =>
          db
            .prepare(`INSERT INTO promo_revisions(campaign_id,revision,label,kind,fixed_paisa,percent_bps,max_discount_paisa,
        minimum_subtotal_paisa,starts_at,ends_at,total_use_limit,per_customer_use_limit,budget_paisa,created_by,request_id,reason,form_version_id,created_at)
        VALUES ('invalidterms',1,'Fixture',?,?,?,?,0,1727489700000,?,2,1,?,'customer','invalidterms-request','Fixture','fixture',1727489700000)`)
            .bind(kind, fixed, bps, cap, end, budget);
        for (const [kind, fixed, bps, cap, budget, end] of [
          ['fixed', null, null, null, 1000, 253402300799999],
          ['percentage', null, 10001, 1000, 1000, 253402300799999],
          ['percentage', 1, 1000, 1000, 1000, 253402300799999],
          ['fixed', 1.5, null, null, 1000, 253402300799999],
          ['fixed', 1000, null, null, 9007199254740992, 253402300799999],
          ['fixed', 1000, null, null, 1000, 253402300800000],
        ] as const)
          await assert.rejects(terms(kind, fixed, bps, cap, budget, end).run());
        await terms('percentage', null, 1000, 1000, 1000).run();
      },
    );
    await t.test(
      'forced mid-batch failure undoes order, redemption and consumption',
      async () => {
        await campaign(db, 'rollback', 'ROLLBACK');
        const stockBefore = (await db
          .prepare(
            "SELECT inventory_quantity AS n FROM products WHERE id='product'",
          )
          .first<{ n: number }>())!.n;
        await assert.rejects(
          db.batch([
            promoOrder(db, 'rollback-order', 'rollback', 'ROLLBACK'),
            incentiveItem(db, 'rollback-item', 'rollback-order', 1000),
            redemption(db, 'rollback-use', 'rollback-order', 'rollback'),
            db.prepare(
              "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) VALUES ('invalid','customer',NULL,1,-1,'refund',NULL,1)",
            ),
          ]),
        );
        assert.equal(
          await db
            .prepare("SELECT id FROM orders WHERE id='rollback-order'")
            .first(),
          null,
        );
        assert.equal(
          await db
            .prepare("SELECT id FROM promo_redemptions WHERE id='rollback-use'")
            .first(),
          null,
        );
        assert.equal(
          await db
            .prepare("SELECT id FROM order_items WHERE id='rollback-item'")
            .first(),
          null,
        );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT inventory_quantity AS n FROM products WHERE id='product'",
              )
              .first<{ n: number }>()
          )?.n,
          stockBefore,
        );
        assert.deepEqual(
          await db
            .prepare(
              "SELECT used_count,spent_paisa FROM promo_campaigns WHERE id='rollback'",
            )
            .first(),
          { used_count: 0, spent_paisa: 0 },
        );
      },
    );
    await t.test(
      'current aggregate distinguishes promo from referral and preserves legacy NULL fallback',
      async () => {
        await promoOrder(db, 'snapshot', 'rollback', 'ROLLBACK').run();
        await incentiveItem(db, 'snapshot-item', 'snapshot', 1000).run();
        await assert.rejects(
          db
            .prepare(
              "UPDATE order_items SET promo_discount_paisa=900 WHERE id='snapshot-item'",
            )
            .run(),
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE order_items SET current_promo_discount_paisa=1001 WHERE id='snapshot-item'",
            )
            .run(),
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE order_items SET refunded_promo_discount_paisa=1001 WHERE id='snapshot-item'",
            )
            .run(),
        );
        await db
          .prepare(
            "UPDATE order_items SET current_promo_discount_paisa=600 WHERE id='snapshot-item'",
          )
          .run();
        await assert.rejects(
          db
            .prepare(
              "UPDATE order_items SET refunded_promo_discount_paisa=401 WHERE id='snapshot-item'",
            )
            .run(),
        );
        await db
          .prepare(
            "UPDATE order_items SET refunded_promo_discount_paisa=400 WHERE id='snapshot-item'",
          )
          .run();
        const original = await db
          .prepare(
            "SELECT discount_source,current_referral_discount_paisa,current_total_paisa FROM orders WHERE id='snapshot'",
          )
          .first();
        assert.deepEqual(original, {
          discount_source: 'promo',
          current_referral_discount_paisa: 0,
          current_total_paisa: null,
        });
        await db
          .prepare(`UPDATE orders SET current_subtotal_paisa=6000,current_delivery_paisa=500,current_wallet_paisa=0,
        current_discount_paisa=600,current_promo_discount_paisa=600,current_total_paisa=5900 WHERE id='snapshot'`)
          .run();
        assert.deepEqual(
          await db
            .prepare(
              "SELECT current_discount_paisa,current_promo_discount_paisa,current_referral_discount_paisa,current_total_paisa FROM orders WHERE id='snapshot'",
            )
            .first(),
          {
            current_discount_paisa: 600,
            current_promo_discount_paisa: 600,
            current_referral_discount_paisa: 0,
            current_total_paisa: 5900,
          },
        );
        for (const sql of [
          "UPDATE orders SET promo_discount_paisa=900 WHERE id='snapshot'",
          "UPDATE orders SET current_promo_discount_paisa=601 WHERE id='snapshot'",
          "UPDATE orders SET refunded_promo_discount_paisa=1001 WHERE id='snapshot'",
          "UPDATE orders SET refunded_promo_discount_paisa=401 WHERE id='snapshot'",
        ])
          await assert.rejects(db.prepare(sql).run());
      },
    );
    await t.test(
      'per-customer and budget races remain cumulative across revised terms',
      async () => {
        const revise = (
          id: string,
          total: number,
          per: number,
          budget: number,
        ) =>
          db
            .prepare(`INSERT INTO promo_revisions(campaign_id,revision,label,kind,fixed_paisa,
        minimum_subtotal_paisa,starts_at,ends_at,total_use_limit,per_customer_use_limit,budget_paisa,created_by,request_id,reason,form_version_id,created_at)
        VALUES (?,2,'Fictional promo','fixed',1000,0,1,100,?,?,?,'customer',?,'Fixture','fixture',2)`)
            .bind(id, total, per, budget, `revision-2-${id}`);
        for (const [id, code, total, per, budget] of [
          ['peruser', 'PERUSER', 3, 1, 3000],
          ['budget', 'BUDGET', 3, 3, 1500],
        ] as const) {
          await campaign(db, id, code, total, per, budget);
          const results = await Promise.allSettled(
            [1, 2].map((n) =>
              db.batch([
                promoOrder(db, `${id}-${n}`, id, code),
                incentiveItem(db, `${id}-item-${n}`, `${id}-${n}`, 1000),
                redemption(db, `${id}-use-${n}`, `${id}-${n}`, id),
              ]),
            ),
          );
          assert.equal(
            results.filter((r) => r.status === 'fulfilled').length,
            1,
          );
          assert.deepEqual(
            await db
              .prepare(
                'SELECT used_count,spent_paisa FROM promo_campaigns WHERE id=?',
              )
              .bind(id)
              .first(),
            { used_count: 1, spent_paisa: 1000 },
          );
        }
        await assert.rejects(revise('budget', 3, 3, 999).run());
        await revise('peruser', 4, 1, 4000).run();
        await db
          .prepare(
            "UPDATE promo_campaigns SET current_revision=2 WHERE id='peruser'",
          )
          .run();
        await assert.rejects(
          db.batch([
            promoOrder(db, 'peruser-revised', 'peruser', 'PERUSER', 2),
            incentiveItem(db, 'peruser-revised-item', 'peruser-revised', 1000),
            redemption(
              db,
              'peruser-revised-use',
              'peruser-revised',
              'peruser',
              'peruser-revised-use',
              2,
            ),
          ]),
        );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT used_count AS n FROM promo_customer_usage WHERE campaign_id='peruser'",
              )
              .first<{ n: number }>()
          )?.n,
          1,
        );
        await campaign(db, 'twouses', 'TWOUSES', 3, 3, 3000);
        for (const id of ['twouses-1', 'twouses-2'])
          await db.batch([
            promoOrder(db, id, 'twouses', 'TWOUSES'),
            incentiveItem(db, `item-${id}`, id, 1000),
            redemption(db, `use-${id}`, id, 'twouses'),
          ]);
        assert.equal(
          (
            await db
              .prepare(
                "SELECT used_count AS n FROM promo_customer_usage WHERE campaign_id='twouses' AND customer_id='customer'",
              )
              .first<{ n: number }>()
          )?.n,
          2,
        );
        assert.deepEqual(
          await db
            .prepare(
              "SELECT used_count,spent_paisa FROM promo_campaigns WHERE id='twouses'",
            )
            .first(),
          { used_count: 2, spent_paisa: 2000 },
        );
        await assert.rejects(revise('twouses', 1, 1, 3000).run());
        await assert.rejects(revise('twouses', 3, 1, 3000).run());
      },
    );
    await t.test(
      'redemption rejects missing original line allocations',
      async () => {
        await campaign(db, 'allocation', 'ALLOCATION');
        await assert.rejects(
          db.batch([
            promoOrder(db, 'no-lines', 'allocation', 'ALLOCATION'),
            redemption(db, 'no-lines-use', 'no-lines', 'allocation'),
          ]),
        );
      },
    );
    await t.test(
      'source-less promo refund rejects on a plain historical order',
      async () => {
        await incentiveOrder(db, 'plain').run();
        await assert.rejects(
          db
            .prepare(`INSERT INTO refunds(id,order_id,status,amount_paisa,item_amount_paisa,delivery_amount_paisa,reason,requested_at,promo_discount_paisa)
        VALUES ('source-less','plain','approved',100,100,0,'Fixture',1,1)`)
            .run(),
        );
      },
    );
    await t.test(
      'campaign begins with zero ledger-backed counters',
      async () => {
        await assert.rejects(
          db
            .prepare(
              "INSERT INTO promo_campaigns(id,code,used_count,created_at,updated_at) VALUES ('counter-forged','COUNTERFORGED',1,1,1)",
            )
            .run(),
        );
      },
    );
    await t.test(
      'refund guards include promo offset, cumulative baseline and source conservation',
      async () => {
        const refund = (id: string, promo: number, wallet = 0, base = 0) =>
          db
            .prepare(`INSERT INTO refunds(id,order_id,status,amount_paisa,item_amount_paisa,delivery_amount_paisa,
        reason,requested_at,credit_base_paisa,promo_discount_paisa,wallet_credit_paisa) VALUES (?,'snapshot','approved',5000,5000,0,'Fixture',1,?,?,?)`)
            .bind(id, base, promo, wallet);
        await assert.rejects(refund('over-item', 1000, 4500).run());
        await assert.rejects(refund('over-original', 1001).run());
        await refund('valid', 400).run();
        await assert.rejects(refund('stale', 1).run());
        await assert.rejects(refund('over-cumulative', 601, 0, 5000).run());
        await refund('second', 200, 0, 5000).run();
        await db
          .prepare(
            "UPDATE refunds SET status='paid',processed_at=10 WHERE id='valid'",
          )
          .run();
        assert.equal(
          (
            await db
              .prepare(
                "SELECT balance_paisa AS n FROM wallet_accounts WHERE user_id='customer'",
              )
              .first<{ n: number }>()
          )?.n,
          0,
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE refunds SET promo_discount_paisa=0 WHERE id='valid'",
            )
            .run(),
        );
      },
    );
  } finally {
    await f.dispose();
  }
});

void test('MariaDB generator ships promo tables after canonical prerequisites and preserves FK collation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hastabazaar-promo-schema-'));
  const run = promisify(execFile);
  try {
    await mkdir(join(root, 'scripts'), { recursive: true });
    await mkdir(join(root, 'drizzle', 'meta'), { recursive: true });
    await cp(
      new URL('../deployment/babal/', import.meta.url),
      join(root, 'deployment', 'babal'),
      { recursive: true },
    );
    await cp(
      new URL('../drizzle/meta/0020_snapshot.json', import.meta.url),
      join(root, 'drizzle', 'meta', '0020_snapshot.json'),
    );
    for (const script of [
      'generate-mariadb-schema.mjs',
      'generate-release-manifest.mjs',
    ])
      await cp(
        new URL(`../scripts/${script}`, import.meta.url),
        join(root, 'scripts', script),
      );
    await run(
      process.execPath,
      [join(root, 'scripts', 'generate-mariadb-schema.mjs')],
      { cwd: root },
    );
    const schema = await readFile(
      join(root, 'deployment', 'babal', 'mariadb-schema.sql'),
      'utf8',
    );
    const promoStart = schema.indexOf(
      'CREATE TABLE IF NOT EXISTS promo_campaigns',
    );
    assert.ok(promoStart > 0);
    for (const column of [
      'orders.wallet_credit_paisa',
      'orders.referral_discount_paisa',
      'orders.current_total_paisa',
      'orders.current_subtotal_paisa',
      'orders.current_delivery_paisa',
      'orders.current_wallet_paisa',
      'orders.current_discount_paisa',
      'refunds.wallet_credit_paisa',
      'refunds.referral_discount_paisa',
      'refunds.credit_base_paisa',
      'order_items.platform_discount_paisa',
    ]) {
      const [table, name] = column.split('.');
      const at = schema.indexOf(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} `,
      );
      assert.ok(at >= 0 && at < promoStart, column);
    }
    const promoSql = await readFile(
      join(root, 'deployment', 'babal', 'mariadb-promo-codes.sql'),
      'utf8',
    );
    const tables = promoSql.match(
      /CREATE TABLE IF NOT EXISTS[\s\S]*?ENGINE=[^;]+;/g,
    )!;
    assert.equal(tables.length, 4);
    for (const table of tables)
      assert.match(
        table,
        /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/,
      );
    // Shipping contract only; MariaDB runtime character/collation behavior remains Task12.
    assert.match(
      schema,
      /CHECK\(CHAR_LENGTH\(trim\(label\)\) BETWEEN 1 AND 200\)/i,
    );
    // Artifact parity only: actual case/accent behavior in MariaDB is a separate runtime gate.
    for (const clause of [
      'BINARY NEW.promo_campaign_id <=> BINARY OLD.promo_campaign_id',
      'BINARY NEW.promo_code <=> BINARY OLD.promo_code',
      'BINARY NEW.promo_label <=> BINARY OLD.promo_label',
      'BINARY c.code=BINARY NEW.promo_code AND BINARY r.label=BINARY NEW.promo_label',
    ]) {
      assert.ok(
        schema.includes(clause),
        `Generated MariaDB snapshot must preserve exact comparisons: ${clause}`,
      );
    }
    const reset = await readFile(
      join(root, 'deployment', 'babal', 'mariadb-reset-empty-import.sql'),
      'utf8',
    );
    const dropNames = [
      'promo_redemptions',
      'promo_customer_usage',
      'promo_revisions',
      'promo_campaigns',
    ];
    const dropOffsets = dropNames.map((name) =>
      reset.indexOf(`DROP TABLE IF EXISTS \`${name}\`;`),
    );
    assert.ok(
      dropOffsets.every(
        (at, i) => at >= 0 && (i === 0 || at > dropOffsets[i - 1]!),
      ),
    );
    await run(
      process.execPath,
      [join(root, 'scripts', 'generate-release-manifest.mjs')],
      { cwd: root },
    );
    const manifest = JSON.parse(
      await readFile(
        join(root, 'deployment', 'babal', 'release-manifest.json'),
        'utf8',
      ),
    );
    assert.ok(
      manifest.migrations.some(
        (m: { path: string }) =>
          m.path === 'deployment/babal/mariadb-promo-codes.sql',
      ),
    );
    assert.ok(manifest.requiredTables.promo_campaigns.includes('spent_paisa'));
    assert.ok(manifest.requiredTables.orders.includes('promo_discount_paisa'));
    assert.ok('promo_redemption_consume' in manifest.requiredTriggers);
    await t.test('additive loyalty migration follows promo once with canonical source hashes', async () => {
      const names = ['mariadb-promo-codes.sql', 'mariadb-loyalty-points.sql'];
      const offsets = names.map((name) => manifest.migrations.findIndex(
        (m: { path: string }) => m.path === `deployment/babal/${name}`,
      ));
      assert.ok(offsets[0] >= 0);
      assert.equal(offsets[1], offsets[0] + 1);
      for (const name of names) {
        const entries = manifest.migrations.filter((m: { path: string }) => m.path === `deployment/babal/${name}`);
        assert.equal(entries.length, 1, name);
        assert.equal(entries[0].usage, 'additive-maintenance');
        const sql = await readFile(join(root, 'deployment', 'babal', name));
        assert.equal(entries[0].sha256, createHash('sha256').update(sql).digest('hex'));
      }
      for (const table of ['loyalty_config', 'loyalty_revisions', 'loyalty_accounts', 'loyalty_daily_claims', 'loyalty_redemptions', 'loyalty_points_entries', 'loyalty_day_issuance']) {
        assert.ok(table in manifest.requiredTables, table);
      }
      assert.ok(manifest.requiredTables.wallet_entries.includes('loyalty_redemption_id'));
      for (const trigger of ['wallet_loyalty_source_guard', 'wallet_entry_safe_balance', 'loyalty_redemption_post']) {
        assert.ok(trigger in manifest.requiredTriggers, trigger);
      }
    });
    // Execute the actual readiness module against its generated manifest. Only the
    // read-only information-schema boundary is replaced with controlled metadata.
    const checkSources = [
      ['orders', 'chk_cancellation_totals', 'mariadb-partial-cancellation.sql'],
      ['notification_messages', 'chk_notification_guest_shape', 'mariadb-guest-business-notifications.sql'],
      ['wallet_entries', 'chk_wallet_kind', 'mariadb-loyalty-points.sql'],
      ['wallet_entries', 'chk_wallet_gift_source', 'mariadb-loyalty-points.sql'],
      ['wallet_entries', 'chk_wallet_safe_amount', 'mariadb-loyalty-points.sql'],
    ];
    const baseChecks = await Promise.all(checkSources.map(async ([tableName, name, file]) => {
      const sql = await readFile(join(root, 'deployment', 'babal', file), 'utf8');
      const match = sql.match(new RegExp(`CONSTRAINT IF NOT EXISTS ${name} CHECK\\s*(\\([^;]+\\));`, 'i'));
      assert.ok(match, `${file}: ${name}`);
      return { tableName, name, definition: match[1] };
    }));
    const categorySql = await readFile(join(root, 'deployment', 'babal', 'mariadb-category-images.sql'), 'utf8');
    const categoryChecks = ['category_media_size', 'category_media_dimensions', 'category_media_mime', 'category_media_hash'].map((name) => {
      const line = categorySql.split('\n').find((item) => item.includes(`CONSTRAINT \`${name}\` CHECK`));
      const match = line?.match(/CHECK\s*(\(.*\)),?\s*$/);
      assert.ok(match, name);
      return { tableName: 'category_media', name, definition: match[1] };
    });
    // This fixture isolates wallet CHECK versions. Supply the remaining release
    // metadata too; real generated-column/index/other CHECK behavior is covered
    // by readiness-runtime and the required native MariaDB job.
    const suppliedChecks = new Set([...baseChecks, ...categoryChecks].map(check => `${check.tableName}.${check.name}`));
    const otherChecks = Object.entries(manifest.requiredChecks).filter(([key]) => !suppliedChecks.has(key))
      .map(([key, fragments]) => ({tableName:key.split('.')[0],name:key.split('.')[1],definition:(fragments as string[]).join(' ')}));
    const checks = [...baseChecks, ...categoryChecks, ...otherChecks];
    const columns = Object.entries(manifest.requiredTables).flatMap(([tableName, names]) =>
      (names as string[]).map((columnName) => ({ tableName, columnName,
        generationExpression:manifest.requiredGeneratedColumns[`${tableName}.${columnName}`]?.[0]??null,
        collation:manifest.requiredColumnCollations[`${tableName}.${columnName}`]??null,
      })),
    );
    const indexes = Object.entries(manifest.requiredUniqueIndexes).flatMap(([key,names]) =>
      (names as string[]).map((columnName,i)=>({tableName:key.split('.')[0],name:key.split('.')[1],nonUnique:0,position:i+1,columnName,prefixLength:null})));
    const migrationSql = (await Promise.all(manifest.migrations.map((m: { path: string }) => readFile(join(root, m.path), 'utf8')))).join('\n');
    const triggers = Object.keys(manifest.requiredTriggers).map((name) => {
      const match = migrationSql.match(new RegExp('CREATE TRIGGER(?: IF NOT EXISTS)? `?' + name + '`?[\\s\\S]*?END(?:\\$\\$|;)', 'i'));
      assert.ok(match, name);
      return { name, definition: match[0] };
    });
    const legacySql = await readFile(join(root, 'deployment', 'babal', 'mariadb-gift-cards.sql'), 'utf8');
    const cases = [
      { name: 'canonical', checks },
      ...['chk_wallet_kind', 'chk_wallet_gift_source'].map((name) => {
        const match = legacySql.match(new RegExp(`CONSTRAINT IF NOT EXISTS ${name} CHECK\\s*(\\([^;]+\\));`, 'i'));
        assert.ok(match, name);
        return { name, checks: checks.map((check) => check.name === name ? { ...check, definition: match[1] } : check) };
      }),
      { name: 'chk_wallet_safe_amount', checks: checks.filter((check) => check.name !== 'chk_wallet_safe_amount') },
    ];
    await mkdir(join(root, 'lib', 'operations'), { recursive: true });
    await cp(new URL('../lib/operations/readiness.ts', import.meta.url), join(root, 'lib', 'operations', 'readiness.ts'));
    await writeFile(join(root, 'readiness-fixtures.json'), JSON.stringify({ columns, indexes, triggers, cases }));
    await writeFile(join(root, 'inspect-readiness.mjs'), [
      "import { readFile } from 'node:fs/promises';",
      "import { inspectReadiness } from './lib/operations/readiness.ts';",
      "const fixture = JSON.parse(await readFile(new URL('./readiness-fixtures.json', import.meta.url), 'utf8'));",
      'const results = {};',
      'for (const scenario of fixture.cases) {',
      '  const db = { prepare(sql) {',
      '    let rows;',
      "    if (sql.includes('FROM information_schema.COLUMNS ')) rows = fixture.columns;",
      "    else if (sql.includes('FROM information_schema.TRIGGERS ')) rows = fixture.triggers;",
      "    else if (sql.includes('FROM information_schema.CHECK_CONSTRAINTS ')) rows = scenario.checks;",
      "    else if (sql.includes('FROM information_schema.STATISTICS ')) rows = fixture.indexes;",
      "    else throw new Error('Unexpected readiness query: ' + sql);",
      '    return { async all() { return { results: rows }; } };',
      '  } };',
      "  results[scenario.name] = await inspectReadiness(db, 'mariadb');",
      '}',
      'console.log(JSON.stringify(results));',
    ].join('\n'));
    const readinessRun = await run(process.execPath, ['--import', import.meta.resolve('tsx'), join(root, 'inspect-readiness.mjs')], { cwd: root });
    const readiness = JSON.parse(readinessRun.stdout);
    await t.test('readiness accepts canonical named wallet checks', () => {
      assert.deepEqual(readiness.canonical, { ready: true, missing: [] });
    });
    for (const name of ['chk_wallet_kind', 'chk_wallet_gift_source', 'chk_wallet_safe_amount']) {
      await t.test(`readiness rejects legacy or absent ${name}`, () => {
        assert.deepEqual(readiness[name], {
          ready: false,
          missing: [`${name === 'chk_wallet_safe_amount' ? 'check' : 'check-version'}:wallet_entries.${name}`],
        });
      });
    }
    // Refuse an ambiguous source instead of guessing a financial column definition.
    const canonicalPath = join(
      root,
      'deployment',
      'babal',
      'mariadb-referrals-wallet.sql',
    );
    const canonical = await readFile(canonicalPath, 'utf8');
    const statement = canonical.match(
      /ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_credit_paisa[^;]+;/,
    )![0];
    await writeFile(canonicalPath, canonical + '\n' + statement);
    await assert.rejects(
      run(
        process.execPath,
        [join(root, 'scripts', 'generate-mariadb-schema.mjs')],
        { cwd: root },
      ),
      /Expected exactly one canonical promo prerequisite/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('native D1 retains committed original promo line identities and allocations', async (t) => {
  const f = await createIncentiveDb();
  const db = f.db;
  try {
    await seedIncentiveCustomer(db);
    await seedIncentiveInventory(db);
    await campaign(db, 'retained', 'RETAINED', 10, 10, 10000);
    for (const id of [
      'delete-line',
      'reparent-line',
      'rename-line',
      'append-line',
    ])
      await db.batch([
        promoOrder(db, id, 'retained', 'RETAINED'),
        incentiveItem(db, `item-${id}`, id, 1000),
        redemption(db, `use-${id}`, id, 'retained'),
      ]);
    await promoOrder(db, 'new-parent', 'retained', 'RETAINED').run();
    const retained = async (orderId: string) => {
      assert.equal(
        (
          await db
            .prepare(
              'SELECT SUM(promo_discount_paisa) AS n FROM order_items WHERE order_id=?',
            )
            .bind(orderId)
            .first<{ n: number }>()
        )?.n,
        1000,
      );
      assert.equal(
        (
          await db
            .prepare(
              'SELECT COUNT(*) AS n FROM promo_redemptions WHERE order_id=?',
            )
            .bind(orderId)
            .first<{ n: number }>()
        )?.n,
        1,
      );
      assert.deepEqual(
        await db
          .prepare(
            "SELECT used_count,spent_paisa FROM promo_campaigns WHERE id='retained'",
          )
          .first(),
        { used_count: 4, spent_paisa: 4000 },
      );
    };
    await t.test('original promo allocation cannot be deleted', async () => {
      await assert.rejects(
        db.prepare("DELETE FROM order_items WHERE id='item-delete-line'").run(),
      );
      await retained('delete-line');
    });
    await t.test(
      'original promo allocation cannot move to a compatible order',
      async () => {
        await assert.rejects(
          db
            .prepare(
              "UPDATE order_items SET order_id='new-parent' WHERE id='item-reparent-line'",
            )
            .run(),
        );
        await retained('reparent-line');
        assert.equal(
          (
            await db
              .prepare(
                "SELECT COUNT(*) AS n FROM order_items WHERE order_id='new-parent'",
              )
              .first<{ n: number }>()
          )?.n,
          0,
        );
      },
    );
    await t.test('original promo line identity cannot change', async () => {
      await assert.rejects(
        db
          .prepare(
            "UPDATE order_items SET id='replacement-identity' WHERE id='item-rename-line'",
          )
          .run(),
      );
      assert.equal(
        (
          await db
            .prepare("SELECT id FROM order_items WHERE id='item-rename-line'")
            .first<{ id: string }>()
        )?.id,
        'item-rename-line',
      );
      await retained('rename-line');
    });
    await t.test(
      'redemption seals the positive original promo allocation set',
      async () => {
        const stock = (await db
          .prepare(
            "SELECT inventory_quantity AS n FROM products WHERE id='product'",
          )
          .first<{ n: number }>())!.n;
        await assert.rejects(
          incentiveItem(db, 'extra-positive', 'append-line', 1000).run(),
        );
        await retained('append-line');
        assert.equal(
          (
            await db
              .prepare(
                "SELECT inventory_quantity AS n FROM products WHERE id='product'",
              )
              .first<{ n: number }>()
          )?.n,
          stock,
        );
      },
    );
    await t.test(
      'sealed lines still permit current/refunded accounting and cancellation status',
      async () => {
        await db
          .prepare(
            "UPDATE order_items SET current_promo_discount_paisa=600,refunded_promo_discount_paisa=400,fulfillment_status='cancelled' WHERE id='item-append-line'",
          )
          .run();
        await retained('append-line');
      },
    );
    await t.test(
      'customer usage insert must match the retained redemption count',
      async () => {
        await seedIncentiveCustomer(db, 'unused-customer');
        await assert.rejects(
          db
            .prepare(
              "INSERT INTO promo_customer_usage(campaign_id,customer_id,used_count) VALUES ('retained','unused-customer',1)",
            )
            .run(),
        );
        await db
          .prepare(
            "INSERT INTO promo_customer_usage(campaign_id,customer_id,used_count) VALUES ('retained','unused-customer',0)",
          )
          .run();
        assert.equal(
          (
            await db
              .prepare(
                "SELECT used_count AS n FROM promo_customer_usage WHERE campaign_id='retained' AND customer_id='unused-customer'",
              )
              .first<{ n: number }>()
          )?.n,
          0,
        );
      },
    );
    await t.test(
      'a valid non-ASCII label persists through native promo snapshots',
      async () => {
        const label = 'क'.repeat(100);
        assert.equal(
          calculatePromoDiscount(
            {
              code: 'NEPALILABEL',
              label,
              kind: 'fixed',
              fixedPaisa: 1000,
              minimumSubtotalPaisa: 0,
              startsAt: 1,
              endsAt: 100,
              totalUseLimit: 2,
              perCustomerUseLimit: 2,
              budgetPaisa: 2000,
            },
            10000,
          ),
          1000,
        );
        await campaign(db, 'nepali-label', 'NEPALILABEL', 2, 2, 2000, label);
        await db.batch([
          promoOrder(
            db,
            'nepali-order',
            'nepali-label',
            'NEPALILABEL',
            1,
            label,
          ),
          incentiveItem(db, 'nepali-item', 'nepali-order', 1000),
          redemption(db, 'nepali-use', 'nepali-order', 'nepali-label'),
        ]);
        assert.equal(
          (
            await db
              .prepare(
                "SELECT promo_label AS label FROM orders WHERE id='nepali-order'",
              )
              .first<{ label: string }>()
          )?.label,
          label,
        );
      },
    );
    await t.test(
      'original labels reject case-only and accent-equivalent edits in native D1',
      async () => {
        for (const label of ['fictional promo', 'Fictional prómo'])
          await assert.rejects(
            db
              .prepare("UPDATE orders SET promo_label=? WHERE id='append-line'")
              .bind(label)
              .run(),
          );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT promo_label AS label FROM orders WHERE id='append-line'",
              )
              .first<{ label: string }>()
          )?.label,
          'Fictional promo',
        );
      },
    );
  } finally {
    await f.dispose();
  }
});
