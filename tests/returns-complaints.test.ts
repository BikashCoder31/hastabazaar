import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite';
import test from 'node:test';

import { can } from '../lib/marketplace/permissions';
import {
  evaluateReturnEligibility,
  type ReturnPolicySnapshot,
} from '../lib/returns/validation';
import {
  advanceReturnAsAdmin,
  createCustomerReturnRequest,
  decideHighValueRefund,
  respondToReturnAsSeller,
  reviewReturnAsAdmin,
  ReturnConflictError,
} from '../lib/db/repositories/returns';
import {
  addCustomerComplaintReply,
  createCustomerComplaint,
  respondToComplaintAsSeller,
  updateComplaintAsAdmin,
  ComplaintConflictError,
} from '../lib/db/repositories/complaints';
import {
  countPublishedProducts,
  listPublicDiscoveryCategories,
  listPublishedProducts,
} from '../lib/db/repositories/products';
import {
  createProductReview,
  CustomerDataConflictError,
  deleteCustomerAddress,
  listCustomerAddresses,
  listPublishedReviews,
  listWishlist,
  moderateProductReview,
  saveCustomerAddress,
  setWishlistItem,
} from '../lib/db/repositories/customers';
import {
  classifyProduct,
  saveTaxonomy,
} from '../lib/db/repositories/catalog-admin';
import {
  accrueExistingDeliveredEarnings,
  getSellerFinanceSummary,
  listPayoutCandidates,
  listPayoutRequests,
  operatePayout,
  PayoutConflictError,
  prepareSellerPayout,
  processPayoutRequest,
  requestSellerPayout,
} from '../lib/db/repositories/payouts';
import {
  createDataRightsRequest,
  createShippingJob,
  operateDataRightsRequest,
  operateShippingJob,
  OperationsConflictError,
  performGovernanceAction,
} from '../lib/db/repositories/operations';

const now = 1_788_672_000_000;
const policy: ReturnPolicySnapshot = {
  generalRequestWindowDays: 7,
  deliveryDamageEvidenceWindowHours: 48,
  changeOfMindEnabled: true,
  highValueRefundThresholdPaisa: 1_000_000,
  refundInitiationBusinessDays: 2,
  codRefundEstimateBusinessDays: [3, 7],
};

async function databaseFixture() {
  const sqlite = new DatabaseSync(':memory:');
  const database = new TestD1Database(sqlite);
  const names = (await readdir(new URL('../drizzle/', import.meta.url)))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const name of names) {
    const sql = await readFile(
      new URL(`../drizzle/${name}`, import.meta.url),
      'utf8',
    );
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((value) => value.trim())
      .filter(Boolean)) {
      sqlite.exec(statement);
    }
  }
  const users = [
    ['seller-user-1', 'seller1@example.test', 'Seller One'],
    ['seller-user-2', 'seller2@example.test', 'Seller Two'],
    ['admin-1', 'admin@example.test', 'Admin One'],
    ['super-1', 'super1@example.test', 'Super One'],
    ['super-2', 'super2@example.test', 'Super Two'],
  ] as const;
  for (const [id, email, name] of users) {
    await database
      .prepare(
        `INSERT INTO users (id, auth_subject, email, display_name, locale, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'en-NP', 'active', ?, ?)`,
      )
      .bind(id, id, email, name, now, now)
      .run();
  }
  for (const [userId, role] of [
    ['seller-user-1', 'seller'],
    ['seller-user-2', 'seller'],
    ['admin-1', 'admin'],
    ['super-1', 'super_admin'],
    ['super-2', 'super_admin'],
  ] as const) {
    await database
      .prepare(
        `INSERT INTO user_roles (user_id, role, assigned_at) VALUES (?, ?, ?)`,
      )
      .bind(userId, role, now)
      .run();
  }
  for (const [id, userId, suffix] of [
    ['seller-1', 'seller-user-1', '1'],
    ['seller-2', 'seller-user-2', '2'],
  ] as const) {
    await database
      .prepare(
        `INSERT INTO seller_profiles (id, user_id, legal_name, trading_name, registration_authority, registration_number, tax_mode, tax_registration_number, representative_name, support_phone, support_email, province, district, municipality, locality, payout_account_reference, status, approved_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'Local', ?, 'PAN', ?, 'Representative', '9800000000', ?, 'Madhesh', 'Dhanusha', 'Janakpur', 'Ward 1', ?, 'approved', ?, ?, ?)`,
      )
      .bind(
        id,
        userId,
        `Maker ${suffix}`,
        `Shop ${suffix}`,
        `REG-${suffix}`,
        `PAN-${suffix}`,
        `shop${suffix}@example.test`,
        `BANK-${suffix}`,
        now - 100 * 86_400_000,
        now,
        now,
      )
      .run();
  }
  await database
    .prepare(
      `INSERT INTO categories (id, slug, name_en, is_active, sort_order, created_at, updated_at) VALUES ('cat', 'test', 'Test', 1, 1, ?, ?)`,
    )
    .bind(now, now)
    .run();
  for (const [id, sellerId, price, stock] of [
    ['product-1', 'seller-1', 100_000, 10],
    ['product-2', 'seller-2', 2_000_000, 10],
    ['product-3', 'seller-1', 200_000, 10],
  ] as const) {
    await database
      .prepare(
        `INSERT INTO products (id, seller_id, category_id, slug, sku, name_en, description_en, price_paisa, inventory_quantity, producer, country_of_origin, materials, return_eligible, status, created_at, updated_at) VALUES (?, ?, 'cat', ?, ?, ?, 'Test product', ?, ?, 'Maker', 'NP', 'Natural fibre', 1, 'published', ?, ?)`,
      )
      .bind(id, sellerId, id, id, id, price, stock, now, now)
      .run();
  }
  for (const [
    orderId,
    number,
    token,
    itemId,
    productId,
    sellerId,
    sellerName,
    value,
  ] of [
    [
      'order-1',
      'HK-TEST-1',
      'receipt-hash-1',
      'item-1',
      'product-1',
      'seller-1',
      'Shop 1',
      100_000,
    ],
    [
      'order-2',
      'HK-TEST-2',
      'receipt-hash-2',
      'item-2',
      'product-2',
      'seller-2',
      'Shop 2',
      2_000_000,
    ],
    [
      'order-3',
      'HK-TEST-3',
      'receipt-hash-3',
      'item-3',
      'product-3',
      'seller-1',
      'Shop 1',
      200_000,
    ],
  ] as const) {
    await database
      .prepare(
        `INSERT INTO orders (id, order_number, receipt_token_hash, customer_email, customer_phone, status, locale, currency, policy_version, return_policy_snapshot_json, shipping_address_json, item_subtotal_paisa, seller_discount_paisa, delivery_charge_paisa, buyer_platform_fee_paisa, tax_total_paisa, grand_total_paisa, payment_mode, payment_status, placed_at, delivered_at, created_at, updated_at) VALUES (?, ?, ?, 'customer@example.test', '9811111111', 'delivered', 'en-NP', 'NPR', 'phase-1.0', ?, '{}', ?, 0, 15_000, 0, 0, ?, 'cod', 'paid', ?, ?, ?, ?)`,
      )
      .bind(
        orderId,
        number,
        token,
        JSON.stringify(policy),
        value,
        value + 15_000,
        now - 86_400_000,
        now - 3_600_000,
        now,
        now,
      )
      .run();
    await database
      .prepare(
        `INSERT INTO order_items (id, order_id, product_id, seller_id, seller_name_snapshot, product_name_snapshot, sku_snapshot, unit_price_paisa, quantity, seller_discount_paisa, commission_bps, commission_paisa, tax_paisa, line_total_paisa, return_eligible_snapshot, fulfillment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1200, ?, 0, ?, 1, 'delivered', ?)`,
      )
      .bind(
        itemId,
        orderId,
        productId,
        sellerId,
        sellerName,
        productId,
        productId,
        value,
        Math.round(value * 0.12),
        value,
        now,
      )
      .run();
    await database
      .prepare(
        `INSERT INTO payments (id, order_id, provider, method, status, amount_paisa, currency, idempotency_key, created_at, updated_at) VALUES (?, ?, 'manual_cod', 'cod', 'captured', ?, 'NPR', ?, ?, ?)`,
      )
      .bind(
        `payment-${orderId}`,
        orderId,
        value + 15_000,
        `pay-${orderId}`,
        now,
        now,
      )
      .run();
  }
  return { database, dispose: async () => sqlite.close() };
}

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

void test('snapshotted eligibility preserves statutory review and rejects late change-of-mind', () => {
  assert.equal(
    evaluateReturnEligibility({
      reason: 'damaged',
      deliveredAt: now - 72 * 3_600_000,
      now,
      productReturnEligible: false,
      policy,
    }).decision,
    'manual_review',
  );
  assert.equal(
    evaluateReturnEligibility({
      reason: 'defective',
      deliveredAt: now - 30 * 86_400_000,
      now,
      productReturnEligible: false,
      policy,
    }).decision,
    'eligible',
  );
  assert.equal(
    evaluateReturnEligibility({
      reason: 'change_of_mind',
      deliveredAt: now - 8 * 86_400_000,
      now,
      productReturnEligible: true,
      policy,
    }).decision,
    'ineligible',
  );
});

void test('catalogue search combines safe text, category, and occasion filters', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await db
      .prepare(
        `INSERT INTO categories (id, slug, name_en, is_active, sort_order, created_at, updated_at) VALUES ('cat-traditional-textiles', 'traditional-textiles', 'Traditional textiles', 1, 10, ?, ?), ('cat-home-decor', 'home-decor', 'Home décor', 1, 20, ?, ?)`,
      )
      .bind(now, now, now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO occasions (id, slug, name_en, is_active, sort_order, created_at, updated_at) VALUES ('occasion-wedding', 'wedding-gifts', 'Wedding gifts', 1, 10, ?, ?), ('occasion-housewarming', 'housewarming', 'Housewarming', 1, 20, ?, ?)`,
      )
      .bind(now, now, now, now)
      .run();
    assert.deepEqual(
      (await listPublicDiscoveryCategories(db)).map(
        (category) => category.slug,
      ),
      ['traditional-textiles', 'home-decor'],
    );
    await db
      .prepare(
        `UPDATE products SET name_en = 'Dhaka Wedding Shawl', category_id = 'cat-traditional-textiles', materials = 'Dhaka cotton' WHERE id = 'product-1'`,
      )
      .run();
    await db
      .prepare(
        `UPDATE products SET name_en = 'Bamboo Reading Lamp', category_id = 'cat-home-decor', materials = 'Bamboo' WHERE id = 'product-2'`,
      )
      .run();
    await db
      .prepare(
        `INSERT INTO product_occasions (product_id, occasion_id, created_at) VALUES ('product-1', 'occasion-wedding', ?)`,
      )
      .bind(now)
      .run();
    await db
      .prepare(
        `INSERT INTO product_occasions (product_id, occasion_id, created_at) VALUES ('product-2', 'occasion-housewarming', ?)`,
      )
      .bind(now)
      .run();

    const weddingTextiles = await listPublishedProducts(db, {
      query: 'Dhaka',
      categorySlugs: ['traditional-textiles'],
      occasionSlugs: ['wedding-gifts'],
    });
    assert.deepEqual(
      weddingTextiles.map((product) => product.id),
      ['product-1'],
    );

    const housewarming = await listPublishedProducts(db, {
      categorySlugs: ['traditional-textiles', 'home-decor'],
      occasionSlugs: ['housewarming'],
    });
    assert.deepEqual(
      housewarming.map((product) => product.id),
      ['product-2'],
    );

    assert.equal((await listPublishedProducts(db, { query: '%' })).length, 0);
  } finally {
    await fixture.dispose();
  }
});

void test('customer accounts keep addresses, wishlist, reviews, and catalogue classification within ownership boundaries', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await db
      .prepare(
        `INSERT INTO users (id, auth_subject, email, display_name, locale, status, created_at, updated_at) VALUES ('customer-1', 'customer-subject-1', 'customer@example.test', 'Customer One', 'en-NP', 'active', ?, ?), ('customer-2', 'customer-subject-2', 'other@example.test', 'Customer Two', 'ne-NP', 'active', ?, ?)`,
      )
      .bind(now, now, now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO user_roles (user_id, role, assigned_at) VALUES ('customer-1', 'customer', ?), ('customer-2', 'customer', ?)`,
      )
      .bind(now, now)
      .run();
    await db
      .prepare(
        `UPDATE orders SET customer_id = 'customer-1' WHERE id = 'order-1'`,
      )
      .run();

    const addressId = await saveCustomerAddress(db, {
      userId: 'customer-1',
      input: {
        label: 'Home',
        recipientName: 'Customer One',
        phone: '9811111111',
        province: 'Madhesh',
        district: 'Dhanusha',
        municipality: 'Janakpur',
        locality: 'Ward 1',
        isDefault: true,
      },
      requestId: 'address-create-1',
      now,
    });
    assert.equal(
      await saveCustomerAddress(db, {
        userId: 'customer-1',
        input: {
          label: 'Home',
          recipientName: 'Customer One',
          phone: '9811111111',
          province: 'Madhesh',
          district: 'Dhanusha',
          municipality: 'Janakpur',
          locality: 'Ward 1',
          isDefault: true,
        },
        requestId: 'address-create-1',
        now,
      }),
      addressId,
    );
    assert.equal((await listCustomerAddresses(db, 'customer-1')).length, 1);
    await assert.rejects(
      () =>
        deleteCustomerAddress(db, {
          userId: 'customer-2',
          addressId,
          requestId: 'address-wrong-owner',
          now,
        }),
      CustomerDataConflictError,
    );

    await setWishlistItem(db, {
      userId: 'customer-1',
      productId: 'product-1',
      saved: true,
      now,
    });
    await setWishlistItem(db, {
      userId: 'customer-1',
      productId: 'product-1',
      saved: true,
      now,
    });
    assert.deepEqual(
      (await listWishlist(db, 'customer-1')).map((item) => item.id),
      ['product-1'],
    );

    const reviewId = await createProductReview(db, {
      userId: 'customer-1',
      productId: 'product-1',
      orderItemId: 'item-1',
      rating: 5,
      title: 'Beautiful work',
      body: 'The piece arrived safely and the craftsmanship is excellent.',
      requestId: 'review-create-1',
      now,
    });
    assert.equal(
      await createProductReview(db, {
        userId: 'customer-1',
        productId: 'product-1',
        orderItemId: 'item-1',
        rating: 5,
        title: 'Beautiful work',
        body: 'The piece arrived safely and the craftsmanship is excellent.',
        requestId: 'review-create-1',
        now,
      }),
      reviewId,
    );
    await assert.rejects(
      () =>
        createProductReview(db, {
          userId: 'customer-2',
          productId: 'product-1',
          orderItemId: 'item-1',
          rating: 5,
          title: '',
          body: 'This customer did not purchase or receive the item.',
          requestId: 'review-wrong-owner',
          now,
        }),
      CustomerDataConflictError,
    );
    await moderateProductReview(db, {
      reviewId,
      actorId: 'admin-1',
      action: 'publish',
      note: 'Verified purchase review contains relevant product feedback.',
      requestId: 'review-publish-1',
      now,
    });
    assert.equal((await listPublishedReviews(db, 'product-1'))[0]?.rating, 5);

    const categoryId = await saveTaxonomy(db, {
      kind: 'category',
      actorId: 'admin-1',
      input: {
        slug: 'ceremonial-gifts',
        nameEn: 'Ceremonial gifts',
        nameNe: 'समारोहका उपहार',
        isActive: true,
        sortOrder: 50,
      },
      requestId: 'catalog-category-1',
      now,
    });
    const occasionId = await saveTaxonomy(db, {
      kind: 'occasion',
      actorId: 'admin-1',
      input: {
        slug: 'new-home',
        nameEn: 'New home',
        nameNe: 'नयाँ घर',
        isActive: true,
        sortOrder: 50,
      },
      requestId: 'catalog-occasion-1',
      now,
    });
    await classifyProduct(db, {
      productId: 'product-1',
      categoryId,
      occasionIds: [occasionId],
      actorId: 'admin-1',
      requestId: 'catalog-classify-1',
      now,
    });
    assert.equal(
      await countPublishedProducts(db, {
        categorySlugs: ['ceremonial-gifts'],
        occasionSlugs: ['new-home'],
      }),
      1,
    );
    assert.deepEqual(
      (await listPublishedProducts(db, { sort: 'price-high', limit: 2 })).map(
        (item) => item.id,
      ),
      ['product-2', 'product-3'],
    );
  } finally {
    await fixture.dispose();
  }
});

void test('seller earnings and payouts enforce immutable ledger and maker-checker settlement', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  const payoutNow = now + 8 * 86_400_000;
  try {
    await db
      .prepare(
        `UPDATE seller_profiles SET approved_at = ? WHERE id = 'seller-2'`,
      )
      .bind(now)
      .run();
    await accrueExistingDeliveredEarnings(db, {
      actorId: 'admin-1',
      requestId: 'earnings-accrual-1',
      now,
    });
    await accrueExistingDeliveredEarnings(db, {
      actorId: 'admin-1',
      requestId: 'earnings-accrual-1',
      now,
    });
    assert.equal(
      (
        await db
          .prepare(
            `SELECT COUNT(*) AS count FROM seller_ledger_entries WHERE seller_id = 'seller-1'`,
          )
          .first<{ count: number }>()
      )?.count,
      4,
    );

    await db
      .prepare(
        `UPDATE orders SET customer_id = 'seller-user-1' WHERE id = 'order-3'`,
      )
      .run();
    await assert.rejects(
      () =>
        createCustomerReturnRequest(db, {
          orderNumber: 'HK-TEST-3',
          receiptTokenHash: null,
          customerId: 'seller-user-2',
          orderItemId: 'item-3',
          quantity: 1,
          reason: 'defective',
          requestedResolution: 'replacement',
          detail:
            'A different signed-in account must not access this delivered item.',
          locale: 'en-NP',
          idempotencyKey: 'account-return-wrong',
          evidence: [],
          now,
        }),
      ReturnConflictError,
    );
    const accountReturn = await createCustomerReturnRequest(db, {
      orderNumber: 'HK-TEST-3',
      receiptTokenHash: null,
      customerId: 'seller-user-1',
      orderItemId: 'item-3',
      quantity: 1,
      reason: 'defective',
      requestedResolution: 'replacement',
      detail:
        'The signed-in account owner can request aftercare without a guest cookie.',
      locale: 'en-NP',
      idempotencyKey: 'account-return-right',
      evidence: [],
      now,
    });
    assert.ok(accountReturn.id);
    const candidates = await listPayoutCandidates(db, payoutNow);
    assert.deepEqual(
      candidates.map((candidate) => [
        candidate.sellerId,
        candidate.amountPaisa,
      ]),
      [
        ['seller-2', 1_672_000],
        ['seller-1', 264_000],
      ],
    );
    assert.equal(
      (await getSellerFinanceSummary(db, 'seller-2', payoutNow)).pendingPaisa,
      88_000,
    );

    const prepared = await prepareSellerPayout(db, {
      sellerId: 'seller-1',
      actorId: 'admin-1',
      actorRole: 'admin',
      note: 'Weekly settlement prepared from all eligible delivered-item entries.',
      requestId: 'payout-prepare-1',
      now: payoutNow,
    });
    const duplicate = await prepareSellerPayout(db, {
      sellerId: 'seller-1',
      actorId: 'admin-1',
      actorRole: 'admin',
      note: 'Weekly settlement prepared from all eligible delivered-item entries.',
      requestId: 'payout-prepare-1',
      now: payoutNow,
    });
    assert.equal(duplicate.id, prepared.id);
    assert.equal(duplicate.duplicate, true);
    await assert.rejects(
      () =>
        operatePayout(db, {
          payoutId: prepared.id,
          actorId: 'admin-1',
          actorRole: 'super_admin',
          action: 'approve',
          note: 'Self approval must remain blocked for every settlement.',
          requestId: 'payout-self-approve',
          now: payoutNow,
        }),
      PayoutConflictError,
    );
    await assert.rejects(
      () =>
        operatePayout(db, {
          payoutId: prepared.id,
          actorId: 'super-1',
          actorRole: 'admin',
          action: 'approve',
          note: 'An ordinary Admin cannot approve a prepared payout.',
          requestId: 'payout-admin-approve',
          now: payoutNow,
        }),
      PayoutConflictError,
    );
    await operatePayout(db, {
      payoutId: prepared.id,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'approve',
      note: 'Independent review confirms the eligible ledger composition.',
      requestId: 'payout-approve-1',
      now: payoutNow,
    });
    await operatePayout(db, {
      payoutId: prepared.id,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'start_processing',
      note: 'Approved settlement entered the verified manual payment queue.',
      requestId: 'payout-processing-1',
      now: payoutNow,
    });
    await operatePayout(db, {
      payoutId: prepared.id,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'mark_paid',
      note: 'Bank confirmation was checked against the approved settlement.',
      providerReference: 'BANK-PAYOUT-001',
      requestId: 'payout-paid-1',
      now: payoutNow,
    });
    await operatePayout(db, {
      payoutId: prepared.id,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'mark_paid',
      note: 'Bank confirmation was checked against the approved settlement.',
      providerReference: 'BANK-PAYOUT-001',
      requestId: 'payout-paid-1',
      now: payoutNow,
    });
    const paid = await db
      .prepare(
        `SELECT status, amount_paisa AS amountPaisa, approved_by AS approvedBy, provider_reference AS providerReference, (SELECT COUNT(*) FROM payout_events WHERE payout_id = payouts.id) AS eventCount, (SELECT COUNT(*) FROM seller_ledger_entries WHERE payout_id = payouts.id) AS paidLedgerCount FROM payouts WHERE id = ?`,
      )
      .bind(prepared.id)
      .first();
    assert.deepEqual(
      { ...paid },
      {
        status: 'paid',
        amountPaisa: 264_000,
        approvedBy: 'super-1',
        providerReference: 'BANK-PAYOUT-001',
        eventCount: 4,
        paidLedgerCount: 1,
      },
    );
    const summary = await getSellerFinanceSummary(db, 'seller-1', payoutNow);
    assert.equal(summary.availablePaisa, 0);
    assert.equal(summary.paidPaisa, 264_000);

    const rejected = await prepareSellerPayout(db, {
      sellerId: 'seller-2',
      actorId: 'admin-1',
      actorRole: 'admin',
      note: 'High-balance seller settlement prepared for independent review.',
      requestId: 'payout-prepare-reject',
      now: payoutNow,
    });
    await operatePayout(db, {
      payoutId: rejected.id,
      actorId: 'super-2',
      actorRole: 'super_admin',
      action: 'reject',
      note: 'Destination ownership evidence requires re-verification before payment.',
      requestId: 'payout-reject-1',
      now: payoutNow,
    });
    assert.equal(
      (await listPayoutCandidates(db, payoutNow)).some(
        (candidate) => candidate.sellerId === 'seller-2',
      ),
      true,
    );
    const retried = await prepareSellerPayout(db, {
      sellerId: 'seller-2',
      actorId: 'admin-1',
      actorRole: 'admin',
      note: 'Destination evidence is now verified and the balance was prepared again.',
      requestId: 'payout-prepare-2',
      now: payoutNow,
    });
    await operatePayout(db, {
      payoutId: retried.id,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'approve',
      note: 'Independent review confirms the corrected destination evidence.',
      requestId: 'payout-approve-2',
      now: payoutNow,
    });
    await operatePayout(db, {
      payoutId: retried.id,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'start_processing',
      note: 'Approved payout entered the verified manual bank queue.',
      requestId: 'payout-processing-2',
      now: payoutNow,
    });
    await operatePayout(db, {
      payoutId: retried.id,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'mark_failed',
      note: 'The bank rejected this attempt because its service was unavailable.',
      requestId: 'payout-failed-2',
      now: payoutNow,
    });
    await operatePayout(db, {
      payoutId: retried.id,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'mark_failed',
      note: 'The bank rejected this attempt because its service was unavailable.',
      requestId: 'payout-failed-2',
      now: payoutNow,
    });
    await operatePayout(db, {
      payoutId: retried.id,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'start_processing',
      note: 'The failed settlement was returned to processing for a controlled retry.',
      requestId: 'payout-reprocessing-2',
      now: payoutNow,
    });
    assert.deepEqual(
      {
        ...(await db
          .prepare(
            `SELECT status, (SELECT COUNT(*) FROM payout_events WHERE payout_id = payouts.id) AS eventCount FROM payouts WHERE id = ?`,
          )
          .bind(retried.id)
          .first()),
      },
      { status: 'processing', eventCount: 5 },
    );
  } finally {
    await fixture.dispose();
  }
});

void test('shipping, privacy, promotion and user operations enforce ownership, idempotency and maker-checker', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const jobId = await createShippingJob(db, {
      orderId: 'order-1',
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      direction: 'outbound',
      note: 'Please coordinate a pickup from the verified seller address.',
      requestId: 'shipping-create-1',
      now,
    });
    assert.equal(
      await createShippingJob(db, {
        orderId: 'order-1',
        sellerId: 'seller-1',
        actorId: 'seller-user-1',
        direction: 'outbound',
        note: 'Please coordinate a pickup from the verified seller address.',
        requestId: 'shipping-create-1',
        now,
      }),
      jobId,
    );
    await assert.rejects(
      () =>
        operateShippingJob(db, {
          jobId,
          actorId: 'seller-user-2',
          actorRole: 'seller',
          sellerId: 'seller-2',
          action: 'picked_up',
          note: 'Wrong seller must not update this job.',
          requestId: 'shipping-wrong-seller',
          now,
        }),
      OperationsConflictError,
    );
    await operateShippingJob(db, {
      jobId,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'record_label',
      labelReference: 'LBL-1',
      trackingCode: 'TRK-1',
      note: 'Manual carrier label and tracking code were verified.',
      requestId: 'shipping-label-1',
      now,
    });
    await operateShippingJob(db, {
      jobId,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'schedule_pickup',
      note: 'Carrier pickup window was confirmed by operations.',
      requestId: 'shipping-schedule-1',
      now,
    });
    await operateShippingJob(db, {
      jobId,
      actorId: 'seller-user-1',
      actorRole: 'seller',
      sellerId: 'seller-1',
      action: 'picked_up',
      note: 'The parcel was handed to the verified carrier rider.',
      requestId: 'shipping-picked-1',
      now,
    });
    await operateShippingJob(db, {
      jobId,
      actorId: 'seller-user-1',
      actorRole: 'seller',
      sellerId: 'seller-1',
      action: 'picked_up',
      note: 'The parcel was handed to the verified carrier rider.',
      requestId: 'shipping-picked-1',
      now,
    });
    assert.equal(
      (
        await db
          .prepare(
            `SELECT COUNT(*) AS count FROM shipping_job_events WHERE shipping_job_id = ?`,
          )
          .bind(jobId)
          .first<{ count: number }>()
      )?.count,
      4,
    );

    const rightsId = await createDataRightsRequest(db, {
      customerId: 'seller-user-1',
      requestType: 'correction',
      detail: 'Please correct the spelling of my account display name.',
      requestId: 'rights-create-1',
      now,
    });
    assert.equal(
      await createDataRightsRequest(db, {
        customerId: 'seller-user-1',
        requestType: 'correction',
        detail: 'Please correct the spelling of my account display name.',
        requestId: 'rights-create-1',
        now,
      }),
      rightsId,
    );
    await operateDataRightsRequest(db, {
      id: rightsId,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'assign',
      note: 'Assigned for identity and retention review.',
      requestId: 'rights-assign-1',
      now,
    });
    await assert.rejects(
      () =>
        operateDataRightsRequest(db, {
          id: rightsId,
          actorId: 'admin-1',
          actorRole: 'admin',
          action: 'approve',
          note: 'An Admin cannot make the final privacy decision.',
          requestId: 'rights-admin-approve',
          now,
        }),
      OperationsConflictError,
    );
    await operateDataRightsRequest(db, {
      id: rightsId,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'approve',
      note: 'Identity evidence supports the requested correction.',
      requestId: 'rights-super-approve',
      now,
    });
    assert.equal(
      (
        await db
          .prepare(`SELECT status FROM data_rights_requests WHERE id = ?`)
          .bind(rightsId)
          .first<{ status: string }>()
      )?.status,
      'approved',
    );

    await performGovernanceAction(db, {
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'promotion.create',
      requestId: 'promo-create-1',
      data: {
        nameEn: 'Festival makers',
        nameNe: 'चाडपर्वका निर्माता',
        placement: 'homepage',
        startsAt: now + 1000,
        endsAt: now + 86_400_000,
        note: 'Feature verified products during the festival campaign.',
        productIds: ['product-1'],
      },
      now,
    });
    await performGovernanceAction(db, {
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'promotion.create',
      requestId: 'promo-create-1',
      data: {
        nameEn: 'Festival makers',
        nameNe: 'चाडपर्वका निर्माता',
        placement: 'homepage',
        startsAt: now + 1000,
        endsAt: now + 86_400_000,
        note: 'Feature verified products during the festival campaign.',
        productIds: ['product-1'],
      },
      now,
    });
    const promotion = await db
      .prepare(
        `SELECT id FROM promotions WHERE created_request_id = 'promo-create-1'`,
      )
      .first<{ id: string }>();
    assert.ok(promotion);
    await assert.rejects(
      () =>
        performGovernanceAction(db, {
          actorId: 'admin-1',
          actorRole: 'admin',
          action: 'promotion.approve',
          requestId: 'promo-admin-approve',
          data: { id: promotion.id },
          now,
        }),
      OperationsConflictError,
    );
    await performGovernanceAction(db, {
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'promotion.approve',
      requestId: 'promo-super-approve',
      data: { id: promotion.id },
      now,
    });
    await assert.rejects(
      () =>
        performGovernanceAction(db, {
          actorId: 'super-1',
          actorRole: 'super_admin',
          action: 'user.status',
          requestId: 'user-self-suspend',
          data: { id: 'super-1', status: 'disabled' },
          now,
        }),
      OperationsConflictError,
    );
    assert.equal(
      (
        await db
          .prepare(`SELECT status FROM promotions WHERE id = ?`)
          .bind(promotion.id)
          .first<{ status: string }>()
      )?.status,
      'active',
    );
  } finally {
    await fixture.dispose();
  }
});

void test('seller payout requests enter Admin preparation before independent approval', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  const payoutNow = now + 8 * 86_400_000;
  try {
    await accrueExistingDeliveredEarnings(db, {
      actorId: 'admin-1',
      requestId: 'request-accrual',
      now,
    });
    const requestId = await requestSellerPayout(db, {
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      note: 'Please include every currently available eligible ledger entry.',
      requestId: 'seller-payout-request-1',
      now: payoutNow,
    });
    assert.equal(
      await requestSellerPayout(db, {
        sellerId: 'seller-1',
        actorId: 'seller-user-1',
        note: 'Please include every currently available eligible ledger entry.',
        requestId: 'seller-payout-request-1',
        now: payoutNow,
      }),
      requestId,
    );
    await processPayoutRequest(db, {
      id: requestId,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'prepare',
      note: 'Available entries and destination were verified for preparation.',
      requestId: 'admin-process-request-1',
      now: payoutNow,
    });
    const request = (await listPayoutRequests(db, 'seller-1'))[0];
    assert.equal(request.status, 'prepared');
    assert.ok(request.payoutId);
    await assert.rejects(
      () =>
        operatePayout(db, {
          payoutId: request.payoutId!,
          actorId: 'admin-1',
          actorRole: 'admin',
          action: 'approve',
          note: 'Ordinary Admin approval must remain denied.',
          requestId: 'request-admin-approve',
          now: payoutNow,
        }),
      PayoutConflictError,
    );
    await operatePayout(db, {
      payoutId: request.payoutId!,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'approve',
      note: 'Independent review confirms the seller-requested payout.',
      requestId: 'request-super-approve',
      now: payoutNow,
    });
  } finally {
    await fixture.dispose();
  }
});

void test('item return, refund liability, maker-checker, idempotency, and ownership boundaries', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const created = await createCustomerReturnRequest(db, {
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      orderItemId: 'item-1',
      quantity: 1,
      reason: 'defective',
      requestedResolution: 'refund',
      detail: 'The clasp broke immediately during normal use.',
      locale: 'en-NP',
      idempotencyKey: 'return-create-1',
      evidence: [],
      now,
    });
    const repeated = await createCustomerReturnRequest(db, {
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      orderItemId: 'item-1',
      quantity: 1,
      reason: 'defective',
      requestedResolution: 'refund',
      detail: 'The clasp broke immediately during normal use.',
      locale: 'en-NP',
      idempotencyKey: 'return-create-1',
      evidence: [],
      now,
    });
    assert.equal(created.id, repeated.id);
    assert.equal(repeated.duplicate, true);
    await assert.rejects(
      () =>
        respondToReturnAsSeller(db, {
          returnRequestId: created.id,
          sellerId: 'seller-2',
          actorId: 'seller-user-2',
          recommendation: 'accept',
          response:
            'This response must not be accepted for another seller item.',
          locale: 'en-NP',
          requestId: 'seller-wrong-1',
          now,
        }),
      ReturnConflictError,
    );
    await respondToReturnAsSeller(db, {
      returnRequestId: created.id,
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      recommendation: 'accept',
      response: 'We confirmed the clasp batch issue and accept responsibility.',
      locale: 'en-NP',
      requestId: 'seller-right-1',
      now,
    });
    await respondToReturnAsSeller(db, {
      returnRequestId: created.id,
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      recommendation: 'accept',
      response: 'We confirmed the clasp batch issue and accept responsibility.',
      locale: 'en-NP',
      requestId: 'seller-right-1',
      now,
    });
    await reviewReturnAsAdmin(db, {
      returnRequestId: created.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'approve',
      note: 'Evidence and seller admission support a full item refund.',
      publicMessageEn: 'Your item refund is approved.',
      publicMessageNe: 'तपाईंको सामान फिर्ता रकम स्वीकृत भयो।',
      responsibility: 'seller',
      outcome: 'refund',
      itemRefundPaisa: 100_000,
      deliveryRefundPaisa: 0,
      requestId: 'admin-review-1',
      now,
    });
    await advanceReturnAsAdmin(db, {
      returnRequestId: created.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'start_refund',
      note: 'COD refund entered in the verified manual payment queue.',
      publicMessageEn: 'Your refund is being processed.',
      publicMessageNe: 'तपाईंको फिर्ता रकम प्रक्रिया हुँदैछ।',
      requestId: 'refund-start-1',
      now,
    });
    await advanceReturnAsAdmin(db, {
      returnRequestId: created.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'complete_refund',
      note: 'Verified COD refund transfer completed successfully.',
      publicMessageEn: 'Your refund has been paid.',
      publicMessageNe: 'तपाईंको फिर्ता रकम भुक्तानी भयो।',
      reference: 'BANK-REF-1',
      restockQuantity: 1,
      requestId: 'refund-paid-1',
      now,
    });
    await advanceReturnAsAdmin(db, {
      returnRequestId: created.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'complete_refund',
      note: 'Verified COD refund transfer completed successfully.',
      publicMessageEn: 'Your refund has been paid.',
      publicMessageNe: 'तपाईंको फिर्ता रकम भुक्तानी भयो।',
      reference: 'BANK-REF-1',
      restockQuantity: 1,
      requestId: 'refund-paid-1',
      now,
    });
    const result = await db
      .prepare(
        `SELECT return_requests.status, refunds.status AS refundStatus, orders.payment_status AS paymentStatus, products.inventory_quantity AS inventory, (SELECT COUNT(*) FROM seller_ledger_entries WHERE refund_id = refunds.id) AS ledgerCount, (SELECT fulfillment_status FROM order_items WHERE id = 'item-2') AS otherItemStatus FROM return_requests INNER JOIN refunds ON refunds.return_request_id = return_requests.id INNER JOIN order_items ON order_items.id = return_requests.order_item_id INNER JOIN orders ON orders.id = order_items.order_id INNER JOIN products ON products.id = order_items.product_id WHERE return_requests.id = ?`,
      )
      .bind(created.id)
      .first<{
        status: string;
        refundStatus: string;
        paymentStatus: string;
        inventory: number;
        ledgerCount: number;
        otherItemStatus: string;
      }>();
    assert.deepEqual(
      { ...result },
      {
        status: 'resolved',
        refundStatus: 'paid',
        paymentStatus: 'part_refunded',
        inventory: 10,
        ledgerCount: 1,
        otherItemStatus: 'delivered',
      },
    );

    const high = await createCustomerReturnRequest(db, {
      orderNumber: 'HK-TEST-2',
      receiptTokenHash: 'receipt-hash-2',
      orderItemId: 'item-2',
      quantity: 1,
      reason: 'wrong_item',
      requestedResolution: 'refund',
      detail: 'A completely different commissioned piece was delivered.',
      locale: 'en-NP',
      idempotencyKey: 'return-create-high',
      evidence: [],
      now,
    });
    await reviewReturnAsAdmin(db, {
      returnRequestId: high.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'approve',
      note: 'The wrong item is documented and qualifies for a full refund.',
      publicMessageEn: 'Your refund is approved pending high-value review.',
      publicMessageNe: 'उच्च-मूल्य समीक्षापछि फिर्ता रकम स्वीकृत हुनेछ।',
      responsibility: 'seller',
      outcome: 'refund',
      itemRefundPaisa: 2_000_000,
      deliveryRefundPaisa: 0,
      requestId: 'admin-review-high',
      now,
    });
    await assert.rejects(
      () =>
        decideHighValueRefund(db, {
          returnRequestId: high.id,
          actorId: 'admin-1',
          approve: true,
          note: 'Self approval must be blocked by maker-checker.',
          publicMessageEn: 'Approval attempted.',
          publicMessageNe: 'स्वीकृति प्रयास गरियो।',
          requestId: 'high-self',
          now,
        }),
      ReturnConflictError,
    );
    await decideHighValueRefund(db, {
      returnRequestId: high.id,
      actorId: 'super-1',
      approve: true,
      note: 'Independent high-value review confirms the documented loss.',
      publicMessageEn: 'Independent high-value review approved your refund.',
      publicMessageNe: 'स्वतन्त्र उच्च-मूल्य समीक्षाले रकम स्वीकृत गर्‍यो।',
      requestId: 'high-checker',
      now,
    });
    const highStatus = await db
      .prepare(
        `SELECT return_requests.status, refunds.status AS refundStatus, refunds.approved_by AS maker, refunds.high_value_approved_by AS checker FROM return_requests INNER JOIN refunds ON refunds.return_request_id = return_requests.id WHERE return_requests.id = ?`,
      )
      .bind(high.id)
      .first();
    assert.deepEqual(
      { ...highStatus },
      {
        status: 'approved',
        refundStatus: 'approved',
        maker: 'admin-1',
        checker: 'super-1',
      },
    );

    const rejected = await createCustomerReturnRequest(db, {
      orderNumber: 'HK-TEST-3',
      receiptTokenHash: 'receipt-hash-3',
      orderItemId: 'item-3',
      quantity: 1,
      reason: 'other',
      requestedResolution: 'replacement',
      detail: 'The request needs an administrative decision and documentation.',
      locale: 'en-NP',
      idempotencyKey: 'return-create-reject',
      evidence: [],
      now,
    });
    await reviewReturnAsAdmin(db, {
      returnRequestId: rejected.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'reject',
      note: 'The supplied information does not establish an eligible return reason.',
      publicMessageEn: 'This return request was not approved.',
      publicMessageNe: 'यो फिर्ता अनुरोध स्वीकृत भएन।',
      requestId: 'admin-reject-1',
      now,
    });
    assert.equal(
      (
        await db
          .prepare(`SELECT status FROM return_requests WHERE id = ?`)
          .bind(rejected.id)
          .first<{ status: string }>()
      )?.status,
      'rejected',
    );
    assert.equal(can('admin', 'refund.approve.high_value'), false);
    assert.equal(can('super_admin', 'refund.approve.high_value'), true);
  } finally {
    await fixture.dispose();
  }
});

void test('complaint assignment, customer reply, seller isolation, escalation, and resolution', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const created = await createCustomerComplaint(db, {
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      orderItemId: 'item-1',
      category: 'product',
      subject: 'Clasp safety concern',
      detail: 'The broken clasp has a sharp edge and may cause injury.',
      locale: 'en-NP',
      requestId: 'complaint-create-1',
      now,
    });
    const repeated = await createCustomerComplaint(db, {
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      orderItemId: 'item-1',
      category: 'product',
      subject: 'Clasp safety concern',
      detail: 'The broken clasp has a sharp edge and may cause injury.',
      locale: 'en-NP',
      requestId: 'complaint-create-1',
      now,
    });
    assert.equal(repeated.id, created.id);
    assert.equal(repeated.duplicate, true);
    await assert.rejects(
      () =>
        respondToComplaintAsSeller(db, {
          complaintId: created.id,
          sellerId: 'seller-2',
          actorId: 'seller-user-2',
          response:
            'Another seller must not access or respond to this complaint.',
          requestId: 'complaint-wrong-seller',
          now,
        }),
      ComplaintConflictError,
    );
    await updateComplaintAsAdmin(db, {
      complaintId: created.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'assign_to_me',
      note: 'Assigned for investigation of the reported product concern.',
      publicMessageEn: 'A support specialist is assigned.',
      publicMessageNe: 'सहायता विशेषज्ञ तोकिएको छ।',
      requestId: 'complaint-assign',
      now,
    });
    await updateComplaintAsAdmin(db, {
      complaintId: created.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'request_customer',
      note: 'A close-up photo description and injury status are needed.',
      publicMessageEn: 'Please provide the requested safety details.',
      publicMessageNe: 'कृपया मागिएको सुरक्षा विवरण दिनुहोस्।',
      requestId: 'complaint-request-customer',
      now,
    });
    await addCustomerComplaintReply(db, {
      complaintId: created.id,
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      message:
        'No injury occurred; the edge appeared after the clasp separated.',
      locale: 'en-NP',
      requestId: 'complaint-customer-reply',
      now,
    });
    await respondToComplaintAsSeller(db, {
      complaintId: created.id,
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      response:
        'We isolated the batch and provided the production record to Hathkriti.',
      requestId: 'complaint-seller-response',
      now,
    });
    await updateComplaintAsAdmin(db, {
      complaintId: created.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'escalate',
      note: 'Safety-category complaint requires Super Admin visibility.',
      publicMessageEn: 'Your safety concern has been escalated.',
      publicMessageNe: 'तपाईंको सुरक्षा गुनासो उच्च तहमा पठाइएको छ।',
      requestId: 'complaint-escalate',
      now,
    });
    await updateComplaintAsAdmin(db, {
      complaintId: created.id,
      actorId: 'super-1',
      actorRole: 'super_admin',
      action: 'resolve',
      note: 'Batch isolated, seller corrective action recorded, and customer remedy offered.',
      publicMessageEn: 'The complaint is resolved with corrective action.',
      publicMessageNe: 'सुधारात्मक कारबाहीसहित गुनासो समाधान भयो।',
      resolutionEn:
        'Affected batch isolated and customer offered a replacement or refund.',
      resolutionNe:
        'प्रभावित ब्याच अलग गरी ग्राहकलाई सट्टा वा रकम फिर्ता प्रस्ताव गरियो।',
      requestId: 'complaint-resolve',
      now,
    });
    const result = await db
      .prepare(
        `SELECT status, assigned_to AS assignedTo, escalated_to AS escalatedTo, resolution, (SELECT COUNT(*) FROM complaint_events WHERE complaint_id = complaints.id) AS eventCount FROM complaints WHERE id = ?`,
      )
      .bind(created.id)
      .first();
    assert.deepEqual(
      { ...result },
      {
        status: 'resolved',
        assignedTo: 'admin-1',
        escalatedTo: 'super-1',
        resolution:
          'Affected batch isolated and customer offered a replacement or refund.',
        eventCount: 7,
      },
    );
  } finally {
    await fixture.dispose();
  }
});
