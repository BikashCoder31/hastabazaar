import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';

import {
  SellerGovernanceConflictError,
  applySellerRestriction,
  runSellerDeletionPreflight,
} from '../lib/db/repositories/seller-governance';
import {
  FulfillmentConflictError,
  transitionSellerFulfillment,
} from '../lib/db/repositories/fulfillment';
import { getUnavailablePublishedProductBySlug } from '../lib/db/repositories/products';
import { publicProductEligibility } from '../lib/products/eligibility';
import { can } from '../lib/marketplace/permissions';
import { actionableOrderFixture } from './helpers/order-response-fixture';

const now = 1_800_000_000_000;

class TestD1PreparedStatement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
  async all<T>() {
    return {
      results: this.statement.all(...this.values) as T[],
      success: true,
      meta: {},
    };
  }
  async run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes) },
      results: [],
    };
  }
}

class TestD1Database {
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    return new TestD1PreparedStatement(this.sqlite.prepare(sql));
  }
  async batch(statements: readonly TestD1PreparedStatement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const database = new TestD1Database(sqlite);
  const names = (await readdir(new URL('../drizzle/', import.meta.url)))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const name of names) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), 'utf8');
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((value) => value.trim())
      .filter(Boolean)) {
      sqlite.exec(statement);
    }
  }

  for (const [id, email, displayName] of [
    ['seller-user', 'seller@example.test', 'Seller'],
    ['super-one', 'super-one@example.test', 'Super One'],
    ['super-two', 'super-two@example.test', 'Super Two'],
  ] as const) {
    await database
      .prepare(
        `INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
         VALUES (?,?,?,?,'en-NP','active',?,?)`,
      )
      .bind(id, id, email, displayName, now, now)
      .run();
  }
  for (const [userId, role] of [
    ['seller-user', 'seller'],
    ['super-one', 'super_admin'],
    ['super-two', 'super_admin'],
  ] as const) {
    await database
      .prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,?)')
      .bind(userId, role, now)
      .run();
  }
  await database
    .prepare(
      `INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
        registration_number,tax_mode,tax_registration_number,representative_name,support_phone,
        support_email,province,district,municipality,locality,payout_account_reference,status,
        approved_at,created_at,updated_at)
       VALUES ('seller','seller-user','Seller Legal','Seller Shop','Local','REG-SELLER','PAN',
        'PAN-SELLER','Representative','9800000000','seller@example.test','Bagmati','Kathmandu',
        'Kathmandu','Test address','TEST-PAYOUT','approved',?,?,?)`,
    )
    .bind(now, now, now)
    .run();
  await database
    .prepare(
      `INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
       VALUES ('category','test-category','Test category',1,0,?,?)`,
    )
    .bind(now, now)
    .run();
  await database
    .prepare(
      `INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,
        inventory_quantity,producer,country_of_origin,materials,return_eligible,status,published_at,
        created_at,updated_at)
       VALUES ('product','seller','category','seller-product','SKU-1','Seller product','Test',100000,
        2,'Seller','NP','Clay',1,'published',?,?,?)`,
    )
    .bind(now, now, now)
    .run();
  return {
    database: database as unknown as D1Database,
    sqlite,
    dispose: () => sqlite.close(),
  };
}

async function availableCount(database: D1Database, at = now) {
  return (
    await database
      .prepare(`SELECT COUNT(*) AS count FROM products WHERE ${publicProductEligibility('products', at)}`)
      .first<{ count: number }>()
  )?.count;
}

void test('seller suspension removes public sale availability without disabling buyer access', async () => {
  const f = await fixture();
  try {
    assert.equal(await availableCount(f.database), 1);
    const options = {
      sellerId: 'seller',
      actorId: 'super-one',
      mode: 'suspended' as const,
      suspendedUntil: now + 86_400_000,
      obligationMode: 'admin_review' as const,
      reasonCode: 'performance_review',
      reason: 'Recorded staging performance review.',
      expectedVersion: 0,
      requestId: 'suspend-once',
      now,
    };
    const saved = await applySellerRestriction(f.database, options);
    assert.equal(saved.version, 1);
    assert.equal(await availableCount(f.database), 0);
    await assert.rejects(
      () =>
        f.database
          .prepare(
            `INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,
              product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,seller_discount_paisa,
              commission_bps,commission_paisa,tax_paisa,line_total_paisa,
              return_eligible_snapshot,fulfillment_status,created_at)
             VALUES ('blocked-item','future-order','product','seller','Seller Shop','Seller product',
              'SKU-1',100000,1,0,900,9000,0,100000,1,'confirmed',?)`,
          )
          .bind(now)
          .run(),
      /product_unavailable/i,
    );
    assert.equal(
      (
        await f.database
          .prepare("SELECT inventory_quantity AS quantity FROM products WHERE id='product'")
          .first<{ quantity: number }>()
      )?.quantity,
      2,
      'a rejected restricted-seller reservation must roll back inventory',
    );
    assert.equal(await availableCount(f.database, now + 2 * 86_400_000), 1);
    assert.equal(
      (
        await f.database
          .prepare("SELECT status FROM users WHERE id='seller-user'")
          .first<{ status: string }>()
      )?.status,
      'active',
    );
    assert.equal(can('seller', 'order.self.manage'), true);
    assert.equal((await applySellerRestriction(f.database, options)).version, 1);
    assert.equal(
      (
        await f.database
          .prepare('SELECT COUNT(*) AS count FROM seller_restriction_events')
          .first<{ count: number }>()
      )?.count,
      1,
    );
    assert.equal(
      (
        await f.database
          .prepare("SELECT COUNT(*) AS count FROM notification_messages WHERE template_key='business.seller.restriction'")
          .first<{ count: number }>()
      )?.count,
      2,
    );
    await assert.rejects(() =>
      f.database
        .prepare("UPDATE seller_restriction_events SET private_reason='tampered'")
        .run(),
    );
    const unavailable = await getUnavailablePublishedProductBySlug(
      f.database,
      'seller-product',
    );
    assert.equal(unavailable?.nameEn, 'Seller product');
  } finally {
    f.dispose();
  }
});

void test('seller governance rejects unsafe automatic fulfillment, self restriction and stale changes', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      () =>
        applySellerRestriction(f.database, {
          sellerId: 'seller',
          actorId: 'seller-user',
          mode: 'disabled',
          obligationMode: 'admin_review',
          reasonCode: 'owner_request',
          reason: 'A seller cannot restrict their own role.',
          expectedVersion: 0,
          requestId: 'unauthorized-seller',
          now,
        }),
      /current staff permission/i,
    );
    await assert.rejects(
      () =>
        applySellerRestriction(f.database, {
          sellerId: 'seller',
          actorId: 'super-one',
          mode: 'disabled',
          obligationMode: 'allow_existing',
          reasonCode: 'unsafe_goods',
          reason: 'Unsafe product investigation is active.',
          expectedVersion: 0,
          requestId: 'unsafe-auto',
          now,
        }),
      SellerGovernanceConflictError,
    );
    await applySellerRestriction(f.database, {
      sellerId: 'seller',
      actorId: 'super-one',
      mode: 'disabled',
      obligationMode: 'stop_fulfillment',
      reasonCode: 'unsafe_goods',
      reason: 'Unsafe product investigation is active.',
      expectedVersion: 0,
      requestId: 'unsafe-stop',
      now,
    });
    await assert.rejects(
      () =>
        applySellerRestriction(f.database, {
          sellerId: 'seller',
          actorId: 'super-two',
          mode: 'active',
          obligationMode: 'admin_review',
          reasonCode: 'performance_review',
          reason: 'Attempted stale reactivation record.',
          expectedVersion: 0,
          requestId: 'stale-reactivation',
          now: now + 1,
        }),
      SellerGovernanceConflictError,
    );
    await f.database
      .prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super-one','seller',?)")
      .bind(now)
      .run();
    await f.database
      .prepare(
        `INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
          registration_number,tax_mode,tax_registration_number,representative_name,support_phone,
          support_email,province,district,municipality,locality,status,created_at,updated_at)
         VALUES ('self-seller','super-one','Self','Self','Local','REG-SELF','PAN','PAN-SELF','Self',
          '9800000001','self@example.test','Bagmati','Kathmandu','Kathmandu','Test','approved',?,?)`,
      )
      .bind(now, now)
      .run();
    await assert.rejects(
      () =>
        applySellerRestriction(f.database, {
          sellerId: 'self-seller',
          actorId: 'super-one',
          mode: 'disabled',
          obligationMode: 'admin_review',
          reasonCode: 'owner_request',
          reason: 'Self restriction must not be allowed.',
          expectedVersion: 0,
          requestId: 'self-change',
          now,
        }),
      /cannot restrict their own seller role/i,
    );
  } finally {
    f.dispose();
  }
});

void test('existing fulfillment obeys the recorded obligation mode', async () => {
  const f = await actionableOrderFixture();
  try {
    assert.equal(f.rows.length, 1);
    const [row] = f.rows;
    const itemId = String(row.id);
    const sellerId = String(row.sellerId);
    const now = f.releasedAt + 1;
    const command = {
      orderId: f.orderId,
      sellerId,
      actorId: 'registered-owner',
      action: 'start_packing' as const,
      itemIds: [itemId],
      note: '',
    };
    const currentItem = () => f.sqlite.prepare(`SELECT i.fulfillment_status AS status,
      r.released_at AS releasedAt,r.progress_at AS progressAt
      FROM order_items i JOIN order_response_items r ON r.order_item_id=i.id
      JOIN order_response_portions p ON p.id=r.portion_id
      WHERE i.id=? AND i.order_id=? AND i.seller_id=? AND p.operator_mode='seller'`)
      .get(itemId, f.orderId, sellerId);
    assert.deepEqual({ ...currentItem() }, {
      status: 'confirmed', releasedAt: f.releasedAt, progressAt: null,
    });
    await applySellerRestriction(f.db, {
      sellerId,
      actorId: 'reviewer',
      mode: 'disabled',
      obligationMode: 'admin_review',
      reasonCode: 'performance_review',
      reason: 'Existing obligations require review.',
      expectedVersion: 0,
      requestId: 'fulfillment-review',
      now,
    });
    const before = currentItem();
    await assert.rejects(
      transitionSellerFulfillment(f.db, { ...command, requestId: 'blocked-fulfillment', now }),
      (error: unknown) => error instanceof FulfillmentConflictError &&
        /requires an administrative fulfillment decision/i.test(error.message),
    );
    assert.deepEqual(currentItem(), before);
    assert.equal(f.sqlite.prepare('SELECT id FROM order_item_status_events WHERE request_id=?')
      .get('blocked-fulfillment'), undefined);

    const allowed = await applySellerRestriction(f.db, {
      sellerId,
      actorId: 'reviewer',
      mode: 'disabled',
      obligationMode: 'allow_existing',
      reasonCode: 'performance_review',
      reason: 'Existing safe obligations may continue.',
      expectedVersion: 1,
      requestId: 'fulfillment-allowed',
      now: now + 1,
    });
    assert.equal(allowed.mode, 'disabled');
    assert.equal(allowed.obligationMode, 'allow_existing');
    f.setClock(now + 1);
    await transitionSellerFulfillment(f.db, {
      ...command, requestId: 'allowed-through-governance', now: now + 1,
    });
    assert.deepEqual({ ...currentItem() }, {
      status: 'packing', releasedAt: f.releasedAt, progressAt: now + 1,
    });
    assert.equal(f.sqlite.prepare('SELECT actor_id FROM order_item_status_events WHERE request_id=? AND order_item_id=?')
      .get('allowed-through-governance', itemId)?.actor_id, command.actorId);
  } finally {
    f.dispose();
  }
});

void test('deletion preflight is non-destructive and retains category-specific pending gates', async () => {
  const f = await fixture();
  try {
    await f.database
      .prepare(
        `INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,description,created_at)
         VALUES ('ledger','seller','sale',10000,'Historical seller balance',?)`,
      )
      .bind(now)
      .run();
    const blocked = await runSellerDeletionPreflight(f.database, {
      sellerId: 'seller',
      actorId: 'super-one',
      requestId: 'preflight-blocked',
      now,
    });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.outstanding.ledgerBalancePaisa, 10_000);
    assert.equal(
      (
        await f.database
          .prepare("SELECT COUNT(*) AS count FROM seller_profiles WHERE id='seller'")
          .first<{ count: number }>()
      )?.count,
      1,
    );
    await f.database
      .prepare(
        `INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,description,created_at)
         VALUES ('ledger-offset','seller','adjustment',-10000,'Balance correction',?)`,
      )
      .bind(now + 1)
      .run();
    const pendingPolicy = await runSellerDeletionPreflight(f.database, {
      sellerId: 'seller',
      actorId: 'super-two',
      requestId: 'preflight-clean',
      now: now + 2,
    });
    assert.equal(pendingPolicy.status, 'awaiting_retention_policy');
    assert.equal(pendingPolicy.retentionCategories.length, 6);
    assert.ok(
      pendingPolicy.retentionCategories.every(
        (category: { period: unknown }) => category.period === null,
      ),
    );
    await assert.rejects(() =>
      f.database
        .prepare("DELETE FROM seller_deletion_preflights WHERE request_id='preflight-clean'")
        .run(),
    );
  } finally {
    f.dispose();
  }
});
