import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite';
import test from 'node:test';
import {
  CUSTOMER_POLICY_VERSION,
  SELLER_AGREEMENT_VERSION,
  publicLegalPolicies,
} from '../lib/content/legal-policies';
import { resetPassword } from '../lib/auth/password-reset';
import { PasswordResetStore } from '../lib/auth/password-reset-store';
import { createEmailOtpChallenge } from '../lib/auth/email-otp';
import { verifyPassword } from '../lib/auth/hosted-session';

async function resetAuthFixture(db: D1Database) {
  await db
    .prepare(
      'CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY,password_hash TEXT,password_salt TEXT,password_version INTEGER,created_at INTEGER,updated_at INTEGER)',
    )
    .run();
  await db
    .prepare(
      'CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER,created_at INTEGER,last_seen_at INTEGER)',
    )
    .run();
  await db
    .prepare(
      'CREATE TABLE email_login_challenges(token_hash TEXT PRIMARY KEY,code_hash TEXT,user_id TEXT,attempts INTEGER,expires_at INTEGER,created_at INTEGER,consumed_at INTEGER)',
    )
    .run();
}

void test('password reset consumes a distinct challenge, replaces credentials and revokes sessions atomically', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await resetAuthFixture(db);
    const now = Date.now();
    const c = createEmailOtpChallenge({ userId: 'admin-1', now });
    await new PasswordResetStore(db).replaceChallenge(c.record);
    await db
      .prepare(
        "INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES ('old-session','admin-1',?,?,?)",
      )
      .bind(now + 10000, now, now)
      .run();
    assert.equal(await resetPassword(db, c.token, c.code, 'short', now), false);
    assert.equal(
      await resetPassword(db, c.token, 'notcode', 'A new secure password', now),
      false,
    );
    assert.equal(
      await resetPassword(db, c.token, c.code, 'A new secure password', now),
      true,
    );
    const row = await db
      .prepare(
        "SELECT password_hash AS hash,password_salt AS salt FROM user_credentials WHERE user_id='admin-1'",
      )
      .first<{ hash: string; salt: string }>();
    assert.ok(row);
    assert.equal(
      await verifyPassword('A new secure password', row.hash, row.salt),
      true,
    );
    assert.equal(
      await db
        .prepare("SELECT * FROM user_sessions WHERE user_id='admin-1'")
        .first(),
      null,
    );
    assert.equal(
      await resetPassword(db, c.token, c.code, 'Another secure password', now),
      false,
    );
    assert.equal(
      await verifyPassword('Another secure password', row.hash, row.salt),
      false,
    );
  } finally {
    await fixture.dispose();
  }
});

void test('password reset rejects expired, exhausted, disabled-account and sign-in-only challenges', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await resetAuthFixture(db);
    const now = Date.now();
    const store = new PasswordResetStore(db);
    const c = createEmailOtpChallenge({ userId: 'admin-1', now });
    await store.replaceChallenge(c.record);
    assert.equal(
      await resetPassword(
        db,
        c.token,
        c.code,
        'A new secure password',
        now + 600000,
      ),
      false,
    );
    for (let i = 0; i < 5; i++)
      assert.equal(
        await resetPassword(
          db,
          c.token,
          c.code === '000000' ? '111111' : '000000',
          'A new secure password',
          now,
        ),
        false,
      );
    assert.equal(
      await resetPassword(db, c.token, c.code, 'A new secure password', now),
      false,
    );
    const fresh = createEmailOtpChallenge({ userId: 'admin-1', now });
    await store.replaceChallenge(fresh.record);
    await db
      .prepare("UPDATE users SET status='suspended' WHERE id='admin-1'")
      .run();
    assert.equal(
      await resetPassword(
        db,
        fresh.token,
        fresh.code,
        'A new secure password',
        now,
      ),
      false,
    );
    assert.equal(
      await db
        .prepare("SELECT * FROM user_credentials WHERE user_id='admin-1'")
        .first(),
      null,
    );
    await db
      .prepare("UPDATE users SET status='active' WHERE id='admin-1'")
      .run();
    const loginOnly = createEmailOtpChallenge({ userId: 'admin-1', now });
    await db
      .prepare(
        'INSERT INTO email_login_challenges(token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at) VALUES (?,?,?,?,?,?,NULL)',
      )
      .bind(
        loginOnly.record.tokenHash,
        loginOnly.record.codeHash,
        'admin-1',
        0,
        now + 600000,
        now,
      )
      .run();
    assert.equal(
      await resetPassword(
        db,
        loginOnly.token,
        loginOnly.code,
        'A new secure password',
        now,
      ),
      false,
    );
  } finally {
    await fixture.dispose();
  }
});
import {
  getReviewExtras,
  saveSellerReply,
  moderateSellerReply,
  getReviewPhotoAccess,
} from '../lib/db/repositories/review-extras';

void test('review photos and seller replies respect purchase ownership and moderation', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  const now = Date.now();
  try {
    await db
      .prepare("UPDATE orders SET customer_id='admin-1' WHERE id='order-1'")
      .run();
    await db
      .prepare(
        "UPDATE order_items SET fulfillment_status='delivered' WHERE id='item-1'",
      )
      .run();
    const options = {
      userId: 'admin-1',
      productId: 'product-1',
      orderItemId: 'item-1',
      rating: 2,
      title: 'Could be better',
      body: 'The finish was rougher than expected.',
      requestId: 'photo-review-test',
      now,
      photos: [
        {
          id: 'photo-test',
          objectKey: 'private/review-photos/test',
          mimeType: 'image/jpeg',
          sizeBytes: 200,
          sortOrder: 0,
        },
      ],
    };
    const reviewId = await createProductReview(db, options);
    assert.equal(await createProductReview(db, options), reviewId);
    assert.equal(
      (await getReviewPhotoAccess(db, 'photo-test'))?.isPublic,
      false,
    );
    assert.equal((await getReviewExtras(db, [reviewId])).photos.length, 0);
    await assert.rejects(
      () =>
        saveSellerReply(db, {
          reviewId,
          sellerId: 'seller-2',
          actorId: 'seller-user-2',
          body: 'Thank you for the honest feedback.',
          version: 0,
          requestId: 'wrong-seller',
          now,
        }),
      CustomerDataConflictError,
    );
    await moderateProductReview(db, {
      reviewId,
      actorId: 'admin-1',
      action: 'publish',
      note: 'Genuine purchase experience; publish irrespective of rating.',
      requestId: 'publish-photo',
      now,
    });
    assert.equal(
      (await getReviewPhotoAccess(db, 'photo-test'))?.isPublic,
      true,
    );
    assert.equal((await getReviewExtras(db, [reviewId])).photos.length, 1);
    await saveSellerReply(db, {
      reviewId,
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      body: 'Thank you for explaining. We will improve the finish.',
      version: 0,
      requestId: 'reply-good',
      now,
    });
    assert.equal((await getReviewExtras(db, [reviewId])).replies.length, 0);
    await moderateSellerReply(db, {
      reviewId,
      actorId: 'admin-1',
      action: 'publish',
      version: 1,
      note: 'Helpful response with no private details.',
      requestId: 'reply-publish',
      now,
    });
    assert.equal((await getReviewExtras(db, [reviewId])).replies.length, 1);
    await saveSellerReply(db, {
      reviewId,
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      body: 'Thank you. Our maker has now improved the finishing.',
      version: 1,
      requestId: 'reply-edit',
      now: now + 1,
    });
    assert.equal((await getReviewExtras(db, [reviewId])).replies.length, 0);
    await assert.rejects(
      () =>
        moderateSellerReply(db, {
          reviewId,
          actorId: 'admin-1',
          action: 'publish',
          version: 1,
          note: 'Stale decision must fail safely.',
          requestId: 'reply-stale',
          now,
        }),
      CustomerDataConflictError,
    );
    await moderateProductReview(db, {
      reviewId,
      actorId: 'admin-1',
      action: 'hide',
      note: 'Photo includes private information.',
      requestId: 'hide-photo',
      now,
    });
    assert.equal(
      (await getReviewPhotoAccess(db, 'photo-test'))?.isPublic,
      false,
    );
    assert.equal((await getReviewExtras(db, [reviewId])).photos.length, 0);
  } finally {
    await fixture.dispose();
  }
});
import {
  deliverOrderEmails,
  buildOrderEmail,
} from '../lib/email/order-updates';
import { findOrderTracking } from '../lib/db/repositories/order-tracking';

void test('order emails queue once per status, retry failures and claim concurrent sends', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await db.prepare('DELETE FROM order_email_jobs').run();
    await db
      .prepare(
        "UPDATE orders SET status='packing',updated_at=? WHERE id='order-1'",
      )
      .bind(Date.now())
      .run();
    await db
      .prepare("UPDATE orders SET status='packing' WHERE id='order-1'")
      .run();
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM order_email_jobs')
          .first<{ n: number }>()
      )?.n,
      1,
    );
    let attempts = 0;
    const broken = {
      send: async () => {
        attempts++;
        throw new Error('sensitive SMTP response');
      },
    };
    assert.deepEqual(
      await deliverOrderEmails(db, broken, 'https://hastabazaar.com'),
      { sent: 0, failed: 1 },
    );
    assert.equal(
      (
        await db
          .prepare('SELECT failure_code AS code FROM order_email_jobs')
          .first<{ code: string }>()
      )?.code,
      'delivery_failed',
    );
    await deliverOrderEmails(db, broken, 'https://hastabazaar.com');
    assert.equal(attempts, 1);
    await db.prepare('UPDATE order_email_jobs SET next_attempt_at=0').run();
    const messages: {
      subject: string;
      text: string;
      html: string;
      to: string;
    }[] = [];
    const mail = {
      send: async (m: (typeof messages)[number]) => {
        messages.push(m);
        await new Promise((r) => setTimeout(r, 10));
      },
    };
    await Promise.all([
      deliverOrderEmails(db, mail, 'https://hastabazaar.com'),
      deliverOrderEmails(db, mail, 'https://hastabazaar.com'),
    ]);
    assert.equal(messages.length, 1);
    assert.match(messages[0].text, /Track your order/);
    await deliverOrderEmails(db, mail, 'https://hastabazaar.com');
    assert.equal(messages.length, 1);
    assert.equal(
      (
        await db
          .prepare("SELECT status FROM orders WHERE id='order-1'")
          .first<{ status: string }>()
      )?.status,
      'packing',
    );
  } finally {
    await fixture.dispose();
  }
});

void test('order email template escapes customer-controlled content and contains no access credential', () => {
  const message = buildOrderEmail(
    {
      orderNumber: 'HK-123',
      eventStatus: 'dispatched',
      currentStatus: 'dispatched',
      email: 'customer@example.test',
      cashPaisa: 90000,
      walletPaisa: 10000,
      discountPaisa: 10000,
      trackingCode: '<script>alert(1)</script>',
      occurredAt: Date.now(),
    },
    'https://hastabazaar.com',
  );
  assert.ok(!message.html.includes('<script>'));
  assert.ok(message.html.includes('&lt;script&gt;'));
  assert.match(message.text, /https:\/\/hastabazaar.com\/track\?order=HK-123/);
  assert.ok(!message.text.includes('customer@example.test'));
  assert.match(message.text, /900/);
  assert.throws(() =>
    buildOrderEmail({ orderNumber: 'HK-1' } as never, 'http://hastabazaar.com'),
  );
});

void test('tracking requires both matching details and excludes private fields and internal notes', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await db
      .prepare(`INSERT INTO shipments(id,order_id,provider,status,payment_mode,delivery_charge_paisa,estimated_min_days,estimated_max_days,created_at,updated_at)
   VALUES ('track-shipment','order-1','manual','delivered','cod',0,3,5,?,?)`)
      .bind(Date.now(), Date.now())
      .run();
    const actual = await db
      .prepare("SELECT customer_email AS email FROM orders WHERE id='order-1'")
      .first<{ email: string }>();
    assert.equal(
      await findOrderTracking(db, 'HK-TEST-1', 'wrong@example.test'),
      null,
    );
    assert.equal(await findOrderTracking(db, 'WRONG', actual!.email), null);
    const result = await findOrderTracking(
      db,
      ' hk-test-1 ',
      actual!.email.toUpperCase(),
    );
    assert.equal(result?.orderNumber, 'HK-TEST-1');
    assert.equal(result?.status, 'delivered');
    assert.deepEqual(
      Object.keys(result!).sort(),
      [
        'orderNumber',
        'status',
        'paymentStatus',
        'trackingCode',
        'placedAt',
        'deliveredAt',
        'updatedAt',
        'estimatedMinDays',
        'estimatedMaxDays',
        'events',
      ].sort(),
    );
    for (const event of result!.events)
      assert.deepEqual(
        Object.keys(event).sort(),
        ['status', 'occurredAt'].sort(),
      );
  } finally {
    await fixture.dispose();
  }
});

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
  createProductSubmission,
  getSellerProductForRevision,
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
import { ensureConfiguredStaffBootstrap } from '../lib/auth/staff-bootstrap';
import {
  createCodOrder,
  getOrderDocument,
  getOrderReceipt,
} from '../lib/db/repositories/orders';
import { transitionAdminFulfillment } from '../lib/db/repositories/fulfillment';
import { consumeRequestRateLimit } from '../lib/http/rate-limit';
import { parseProductSubmission } from '../lib/products/submission';
import { getSellerWorkSummary } from '../lib/db/repositories/seller-workspace';
import { listOrdersForSeller } from '../lib/db/repositories/orders';
import { getSellerAnalytics } from '../lib/db/repositories/operations';
import { getGovernanceOverview } from '../lib/db/repositories/operations';
import { getAdminWorkSummary } from '../lib/db/repositories/admin-workspace';
import {
  ensureWallet,
  getWallet,
  quoteOrderCredit,
  releaseReferralRewards,
  splitCreditRefund,
} from '../lib/db/repositories/wallet';

const now = 1_788_672_000_000;
const policy: ReturnPolicySnapshot = {
  generalRequestWindowDays: 7,
  sealedGoodsWindowDays: 15,
  deliveryDamageEvidenceWindowHours: 48,
  changeOfMindEnabled: true,
  highValueRefundThresholdPaisa: 1_000_000,
  refundInitiationBusinessDays: 2,
  codRefundEstimateBusinessDays: [3, 7],
};

void test('referral offer is fifty each and repeat migration preserves later settings and existing rewards', async () => {
  const f = await databaseFixture();
  const db = f.database as unknown as D1Database;
  try {
    const { getReferralCampaign } =
      await import('../lib/db/repositories/wallet');
    const current = await getReferralCampaign(db);
    assert.equal(current.friendDiscountPaisa, 5000);
    assert.equal(current.rewardPaisa, 5000);
    assert.equal(current.minimumSubtotalPaisa, 150000);
    await ensureWallet(db, 'seller-user-1', now);
    await db
      .prepare(
        "INSERT INTO referral_redemptions(customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at) VALUES ('admin-1','seller-user-1','order-1','9899999999',10000,7,?)",
      )
      .bind(now)
      .run();
    await db
      .prepare(
        "UPDATE referral_campaign SET reward_paisa=7000, enabled=0 WHERE id='default'",
      )
      .run();
    const sql = await readFile(
      new URL('../drizzle/0024_referral_offer_fifty.sql', import.meta.url),
      'utf8',
    );
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
    assert.equal((await getReferralCampaign(db)).rewardPaisa, 7000);
    assert.equal((await getReferralCampaign(db)).enabled, 0);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT reward_paisa AS amount FROM referral_redemptions WHERE order_id='order-1'",
          )
          .first<{ amount: number }>()
      )?.amount,
      10000,
    );
  } finally {
    await f.dispose();
  }
});

void test('referral checkout rewards only collected, delivered orders after the window; spending and cancellation are atomic', async () => {
  const f = await databaseFixture();
  const db = f.database as unknown as D1Database;
  try {
    await ensureWallet(db, 'seller-user-1', now);
    await ensureWallet(db, 'admin-1', now);
    const wallet = await getWallet(db, 'seller-user-1', now);
    await db
      .prepare(
        `INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('wc','wt','NPR',?,?)`,
      )
      .bind(now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('wi','wc','product-1',2,?,?)`,
      )
      .bind(now, now)
      .run();
    const input = {
      customerEmail: 'admin@example.test',
      customerPhone: '9822222222',
      locale: 'en-NP' as const,
      termsAccepted: true,
      idempotencyKey: crypto.randomUUID(),
      referralCode: wallet.referralCode,
      address: {
        recipientName: 'Buyer',
        phone: '9822222222',
        province: 'Madhesh',
        district: 'Dhanusha',
        municipality: 'Janakpur',
        locality: 'Ward 1',
      },
    };
    const order = await createCodOrder(db, 'wt', 'wr', input, now, 'admin-1');
    assert.equal(order.grandTotalPaisa, 213000);
    const stored = await db
      .prepare(
        'SELECT id,referral_discount_paisa AS discount FROM orders WHERE order_number=?',
      )
      .bind(order.orderNumber)
      .first<{ id: string; discount: number }>();
    assert.equal(stored?.discount, 5000);
    assert.equal(
      (await createCodOrder(db, 'wt', 'wr', input, now, 'admin-1')).orderNumber,
      order.orderNumber,
    );
    assert.equal((await getWallet(db, 'seller-user-1', now)).balancePaisa, 0);
    await db
      .prepare(
        "UPDATE orders SET status='delivered',payment_status='paid',delivered_at=? WHERE id=?",
      )
      .bind(now, stored!.id)
      .run();
    await releaseReferralRewards(db, 'seller-user-1', now + 8 * 86400000);
    assert.equal(
      (await getWallet(db, 'seller-user-1', now)).balancePaisa,
      0,
      'uncaptured COD never earns a reward',
    );
    await db
      .prepare("UPDATE payments SET status='captured' WHERE order_id=?")
      .bind(stored!.id)
      .run();
    await releaseReferralRewards(db, 'seller-user-1', now + 7 * 86400000);
    assert.equal(
      (await getWallet(db, 'seller-user-1', now)).balancePaisa,
      0,
      'full return window stays open',
    );
    await releaseReferralRewards(db, 'seller-user-1', now + 8 * 86400000);
    await releaseReferralRewards(db, 'seller-user-1', now + 9 * 86400000);
    assert.equal(
      (await getWallet(db, 'seller-user-1', now)).balancePaisa,
      5000,
    );
    await assert.rejects(
      quoteOrderCredit(db, {
        userId: 'seller-user-1',
        subtotalPaisa: 200000,
        referralCode: wallet.referralCode,
        phone: '9833333333',
        now,
      }),
      /cannot be used/,
    );
    await assert.rejects(
      quoteOrderCredit(db, {
        userId: 'admin-1',
        subtotalPaisa: 200000,
        referralCode: wallet.referralCode,
        phone: '9822222222',
        now,
      }),
      /first order/,
    );
    await db
      .prepare(
        `INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('wc2','wt2','NPR',?,?)`,
      )
      .bind(now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('wi2','wc2','product-1',1,?,?)`,
      )
      .bind(now, now)
      .run();
    const spendInput = {
      ...input,
      customerEmail: 'seller1@example.test',
      customerPhone: '9833333333',
      idempotencyKey: crypto.randomUUID(),
      referralCode: '',
      useWallet: true,
    };
    const spend = await createCodOrder(
      db,
      'wt2',
      'wr2',
      spendInput,
      now,
      'seller-user-1',
    );
    assert.equal(spend.grandTotalPaisa, 113000);
    assert.equal((await getWallet(db, 'seller-user-1', now)).balancePaisa, 0);
    await assert.rejects(
      db
        .prepare(`INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
      VALUES ('double-spend','seller-user-1',?,-1,1,'order_spend',?)`)
        .bind(stored!.id, now)
        .run(),
      /CHECK/,
    );
    assert.equal(
      await db
        .prepare("SELECT id FROM wallet_entries WHERE id='double-spend'")
        .first(),
      null,
    );
    const spendOrder = await db
      .prepare('SELECT id FROM orders WHERE order_number=?')
      .bind(spend.orderNumber)
      .first<{ id: string }>();
    await transitionAdminFulfillment(db, {
      orderId: spendOrder!.id,
      action: 'cancel',
      actorId: 'admin-1',
      note: 'Customer cancelled',
      requestId: crypto.randomUUID(),
      now,
    });
    assert.equal(
      (await getWallet(db, 'seller-user-1', now)).balancePaisa,
      5000,
    );
    await db
      .prepare("UPDATE orders SET status='cancelled' WHERE id=?")
      .bind(spendOrder!.id)
      .run();
    assert.equal(
      (await getWallet(db, 'seller-user-1', now)).balancePaisa,
      5000,
      'repeated cancellation never credits twice',
    );
    await assert.rejects(
      db
        .prepare('DELETE FROM wallet_entries WHERE user_id=?')
        .bind('seller-user-1')
        .run(),
      /immutable/,
    );
    const entries = (await getWallet(db, 'seller-user-1', now)).entries;
    assert.equal(
      entries.reduce((sum, e) => sum + e.amountPaisa, 0),
      5000,
    );
  } finally {
    await f.dispose();
  }
});

void test('partial refunds allocate original shopping credit and discounts, and restore credit once', async () => {
  const f = await databaseFixture();
  const db = f.database as unknown as D1Database;
  try {
    await ensureWallet(db, 'admin-1', now);
    await db
      .prepare(
        "UPDATE orders SET customer_id='admin-1',wallet_credit_paisa=10000,referral_discount_paisa=10000,grand_total_paisa=95000 WHERE id='order-1'",
      )
      .run();
    const split = await splitCreditRefund(db, 'order-1', 50000);
    assert.equal(split.walletPaisa, 5000);
    assert.equal(split.discountPaisa, 5000);
    await db
      .prepare(`INSERT INTO refunds(id,order_id,status,amount_paisa,item_amount_paisa,delivery_amount_paisa,reason,requested_at,wallet_credit_paisa,referral_discount_paisa,credit_base_paisa)
      VALUES ('wf','order-1','processing',50000,50000,0,'test',?,5000,5000,0)`)
      .bind(now)
      .run();
    await db
      .prepare("UPDATE refunds SET status='paid',processed_at=? WHERE id='wf'")
      .bind(now)
      .run();
    await db
      .prepare("UPDATE refunds SET status='paid',processed_at=? WHERE id='wf'")
      .bind(now)
      .run();
    assert.equal((await getWallet(db, 'admin-1', now)).balancePaisa, 5000);
    const remainder = await splitCreditRefund(db, 'order-1', 50000);
    assert.equal(remainder.walletPaisa, 5000);
    assert.equal(remainder.discountPaisa, 5000);
    assert.equal(remainder.basePaisa, 50000);
    await assert.rejects(
      db
        .prepare(`INSERT INTO refunds(id,order_id,status,amount_paisa,item_amount_paisa,delivery_amount_paisa,reason,requested_at,wallet_credit_paisa,referral_discount_paisa,credit_base_paisa)
      VALUES ('stale','order-1','processing',50000,50000,0,'test',?,5000,5000,0)`)
        .bind(now)
        .run(),
      /wallet_refund_changed_retry/,
    );
  } finally {
    await f.dispose();
  }
});

void test('open returns and complaints hold referral rewards, and a cleared investigation releases the snapshotted amount', async () => {
  const f = await databaseFixture();
  const db = f.database as unknown as D1Database;
  try {
    await ensureWallet(db, 'seller-user-1', now);
    await db
      .prepare(
        "UPDATE orders SET customer_id='admin-1',customer_phone='9899999999' WHERE id='order-1'",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO referral_redemptions(customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at) VALUES ('admin-1','seller-user-1','order-1','9899999999',10000,7,?)",
      )
      .bind(now)
      .run();
    const complaint = await createCustomerComplaint(db, {
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      orderItemId: 'item-1',
      category: 'product',
      subject: 'Product condition issue',
      detail: 'Please investigate the condition of this delivered product.',
      locale: 'en-NP',
      requestId: 'referral-complaint',
      now,
    });
    await releaseReferralRewards(db, 'seller-user-1', now + 8 * 86400000);
    assert.equal(
      (await getWallet(db, 'seller-user-1', now + 8 * 86400000)).referrals[0]
        .status,
      'on_hold',
    );
    await db
      .prepare("UPDATE complaints SET status='resolved' WHERE id=?")
      .bind(complaint.id)
      .run();
    const returned = await createCustomerReturnRequest(db, {
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      orderItemId: 'item-1',
      quantity: 1,
      reason: 'defective',
      requestedResolution: 'refund',
      detail: 'The product has a manufacturing defect.',
      locale: 'en-NP',
      idempotencyKey: 'referral-return',
      evidence: [],
      now,
    });
    await releaseReferralRewards(db, 'seller-user-1', now + 8 * 86400000);
    assert.equal((await getWallet(db, 'seller-user-1', now)).balancePaisa, 0);
    await db
      .prepare("UPDATE return_requests SET status='rejected' WHERE id=?")
      .bind(returned.id)
      .run();
    await db
      .prepare(
        "UPDATE referral_campaign SET enabled=0,reward_paisa=20000 WHERE id='default'",
      )
      .run();
    await releaseReferralRewards(db, 'seller-user-1', now + 8 * 86400000);
    assert.equal(
      (await getWallet(db, 'seller-user-1', now)).balancePaisa,
      10000,
      'pausing/changing future offers does not alter an accepted reward',
    );
  } finally {
    await f.dispose();
  }
});

void test('staging staff bootstrap is identity-bound, idempotent, and maker-checker safe', async () => {
  const fixture = await databaseFixture();
  try {
    const db = fixture.database;
    const database = db as unknown as D1Database;
    await db
      .prepare(`DELETE FROM user_roles WHERE role IN ('admin', 'super_admin')`)
      .run();

    const configuration = {
      superAdminEmail: 'owner@example.test',
      adminEmail: 'reviewer@example.test',
    };
    assert.deepEqual(
      await ensureConfiguredStaffBootstrap(
        database,
        'reviewer@example.test',
        configuration,
        now,
      ),
      [],
    );
    assert.deepEqual(
      await ensureConfiguredStaffBootstrap(
        database,
        'OWNER@example.test',
        configuration,
        now,
      ),
      ['super_admin', 'admin'],
    );
    assert.deepEqual(
      await ensureConfiguredStaffBootstrap(
        database,
        'owner@example.test',
        configuration,
        now,
      ),
      [],
    );

    const invitations = await db
      .prepare(`SELECT email, role FROM staff_invitations ORDER BY role DESC`)
      .all<{ email: string; role: string }>();
    assert.deepEqual(
      invitations.results.map((row) => ({ ...row })),
      [
        { email: 'owner@example.test', role: 'super_admin' },
        { email: 'reviewer@example.test', role: 'admin' },
      ],
    );
    const audit = await db
      .prepare(
        `SELECT COUNT(*) AS count FROM audit_logs
         WHERE action = 'staff.bootstrap.invitation.created'`,
      )
      .first<{ count: number }>();
    assert.equal(audit?.count, 2);
  } finally {
    await fixture.dispose();
  }
});

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
      `UPDATE seller_profiles SET seller_agreement_version = ?, seller_agreement_accepted_at = ? WHERE status = 'approved'`,
    )
    .bind(SELLER_AGREEMENT_VERSION, now)
    .run();
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

void test('seller overview counts distinct owned orders and keeps list data private', async () => {
  const fixture = await databaseFixture();
  try {
    const db = fixture.database as unknown as D1Database;
    await db
      .prepare(
        "UPDATE order_items SET fulfillment_status = 'confirmed' WHERE seller_id = 'seller-1'",
      )
      .run();
    await db
      .prepare(
        "UPDATE order_items SET order_id = 'order-1' WHERE id = 'item-3'",
      )
      .run();
    await db
      .prepare(
        "UPDATE order_items SET order_id = 'order-1', fulfillment_status = 'packing' WHERE id = 'item-2'",
      )
      .run();
    await db
      .prepare("UPDATE orders SET status = 'packing' WHERE id = 'order-1'")
      .run();
    await db
      .prepare(
        "UPDATE products SET status = 'needs_changes' WHERE id = 'product-3'",
      )
      .run();
    assert.deepEqual(await getSellerWorkSummary(db, 'seller-1'), {
      toPack: 1,
      packing: 0,
      ready: 0,
      needsChanges: 1,
    });
    assert.deepEqual(await getSellerWorkSummary(db, 'seller-2'), {
      toPack: 0,
      packing: 1,
      ready: 0,
      needsChanges: 0,
    });
    assert.deepEqual(await getSellerWorkSummary(db, 'missing-seller'), {
      toPack: 0,
      packing: 0,
      ready: 0,
      needsChanges: 0,
    });
    const list = await listOrdersForSeller(db, 'seller-1');
    assert.equal(list.length, 1);
    assert.equal(list[0].itemCount, 2);
    assert.equal(list[0].sellerSubtotalPaisa, 300000);
    assert.equal(list[0].sellerCommissionPaisa, 36000);
    assert.equal(list[0].sellerStatus, 'confirmed');
    assert.equal(list[0].status, 'packing');
    assert.equal('customerEmail' in list[0], false);
    assert.equal('customerPhone' in list[0], false);
    assert.equal('grandTotalPaisa' in list[0], false);
    assert.deepEqual(await listOrdersForSeller(db, 'missing-seller'), []);
    await db
      .prepare(
        "UPDATE order_items SET fulfillment_status = 'ready_for_pickup' WHERE id = 'item-3'",
      )
      .run();
    assert.equal(
      (await listOrdersForSeller(db, 'seller-1'))[0].sellerStatus,
      'mixed',
    );
  } finally {
    await fixture.dispose();
  }
});

void test('seller sales analytics do not multiply money or units when an item has repeated return cases', async () => {
  const fixture = await databaseFixture();
  try {
    const db = fixture.database as unknown as D1Database;
    const options = {
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      orderItemId: 'item-1',
      quantity: 1,
      reason: 'defective' as const,
      requestedResolution: 'refund' as const,
      detail: 'The clasp broke during normal use and requires investigation.',
      locale: 'en-NP' as const,
      evidence: [],
      now,
    };
    const first = await createCustomerReturnRequest(db, {
      ...options,
      idempotencyKey: 'analytics-return-1',
    });
    await reviewReturnAsAdmin(db, {
      returnRequestId: first.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'reject',
      note: 'The first case was reviewed and rejected.',
      publicMessageEn: 'The first case was reviewed and rejected.',
      publicMessageNe: '',
      requestId: 'analytics-reject-1',
      now: now + 1,
    });
    await createCustomerReturnRequest(db, {
      ...options,
      idempotencyKey: 'analytics-return-2',
      now: now + 2,
    });
    const data = await getSellerAnalytics(db, 'seller-1');
    assert.equal(data.summary.deliveredSalesPaisa, 300000);
    assert.equal(data.summary.unitsDelivered, 2);
    assert.equal(data.summary.returnCount, 2);
    assert.equal(
      data.monthly.reduce((sum, row) => sum + row.salesPaisa, 0),
      300000,
    );
    const other = await getSellerAnalytics(db, 'seller-2');
    assert.equal(other.summary.deliveredSalesPaisa, 2000000);
    assert.equal(other.summary.returnCount, 0);
  } finally {
    await fixture.dispose();
  }
});

void test('Admin queue counts include assigned and escalated complaints and count ready orders once', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    assert.deepEqual(await getAdminWorkSummary(db, 'admin'), {
      sellers: 0,
      products: 0,
      readyOrders: 0,
      returns: 0,
      complaints: 0,
      payoutRequests: 0,
      approvals: null,
    });
    const complaint = await createCustomerComplaint(db, {
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      orderItemId: 'item-1',
      category: 'product',
      subject: 'Test support case',
      detail: 'A fixture complaint to check operations queue totals.',
      locale: 'en-NP',
      requestId: 'queue-complaint',
      now,
    });
    for (const status of [
      'open',
      'assigned',
      'investigating',
      'waiting_customer',
      'escalated',
    ]) {
      await db
        .prepare('UPDATE complaints SET status = ? WHERE id = ?')
        .bind(status, complaint.id)
        .run();
      assert.equal((await getAdminWorkSummary(db, 'admin')).complaints, 1);
    }
    for (const status of ['resolved', 'closed']) {
      await db
        .prepare('UPDATE complaints SET status = ? WHERE id = ?')
        .bind(status, complaint.id)
        .run();
      assert.equal((await getAdminWorkSummary(db, 'admin')).complaints, 0);
    }
    await db
      .prepare(
        "UPDATE order_items SET order_id = 'order-1', fulfillment_status = 'ready_for_pickup'",
      )
      .run();
    await db
      .prepare(
        "UPDATE seller_profiles SET status = 'submitted' WHERE id = 'seller-1'",
      )
      .run();
    await db
      .prepare(
        "UPDATE products SET status = 'under_review' WHERE id = 'product-1'",
      )
      .run();
    const summary = await getAdminWorkSummary(db, 'super_admin');
    assert.equal(summary.readyOrders, 1);
    assert.equal(summary.sellers, 1);
    assert.equal(summary.products, 1);
    assert.deepEqual(
      { ...summary.approvals },
      { payouts: 0, highValueRefunds: 0, promotions: 0 },
    );
    await assert.rejects(
      () => getAdminWorkSummary(db, 'customer' as 'admin'),
      /Staff access required/,
    );
  } finally {
    await fixture.dispose();
  }
});

void test('governance reads exclude restricted datasets for Admin and preserve independent promotion decisions', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const base = { actorId: 'super-1', actorRole: 'super_admin' as const, now };
    await performGovernanceAction(db, {
      ...base,
      action: 'incident.create',
      requestId: 'gov-incident',
      data: {
        title: 'Fixture incident',
        severity: 'low',
        detail: 'A test-only incident for verifying restricted staff data.',
      },
    });
    await performGovernanceAction(db, {
      ...base,
      action: 'backup.verify',
      requestId: 'gov-backup',
      data: {
        scope: 'd1',
        status: 'verified',
        evidenceReference: 'FIXTURE-ONLY',
        note: 'Fixture verification record, not a provider backup.',
      },
    });
    await performGovernanceAction(db, {
      ...base,
      action: 'promotion.create',
      requestId: 'gov-promo',
      data: {
        nameEn: 'Fixture placement',
        placement: 'homepage',
        startsAt: now,
        endsAt: now + 86400000,
        note: 'A test-only placement proposal.',
        productIds: ['product-1'],
      },
    });
    const admin = await getGovernanceOverview(db, 'admin');
    assert.deepEqual(admin.users, []);
    assert.deepEqual(admin.incidents, []);
    assert.deepEqual(admin.backups, []);
    assert.equal(admin.products.length, 3);
    assert.equal(admin.promotions[0].createdBy, 'super-1');
    const superAdmin = await getGovernanceOverview(db, 'super_admin');
    assert.equal(superAdmin.users.length, 5);
    assert.equal(superAdmin.incidents.length, 1);
    assert.equal(superAdmin.backups.length, 1);
    const promotionId = admin.promotions[0].id;
    assert.equal(
      (await getAdminWorkSummary(db, 'super_admin')).approvals?.promotions,
      1,
    );
    for (const action of ['promotion.approve', 'promotion.reject'])
      await assert.rejects(
        () =>
          performGovernanceAction(db, {
            ...base,
            action,
            requestId: action + '-self',
            data: { id: promotionId },
          }),
        /maker cannot/,
      );
    const decision = {
      ...base,
      actorId: 'super-2',
      action: 'promotion.approve',
      requestId: 'gov-independent-approve',
      data: { id: promotionId },
    };
    await performGovernanceAction(db, decision);
    await performGovernanceAction(db, decision);
    assert.equal(
      (await getAdminWorkSummary(db, 'super_admin')).approvals?.promotions,
      0,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM audit_logs WHERE request_id = 'gov-independent-approve'",
          )
          .first<{ count: number }>()
      )?.count,
      1,
    );
    await assert.rejects(
      () => getGovernanceOverview(db, 'seller' as 'admin'),
      /Staff access required/,
    );
  } finally {
    await fixture.dispose();
  }
});

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
  assert.equal(
    evaluateReturnEligibility({
      reason: 'change_of_mind',
      deliveredAt: Date.parse('2026-08-31T18:16:00.000Z'),
      now: Date.parse('2026-09-08T18:14:00.000Z'),
      productReturnEligible: true,
      policy,
    }).decision,
    'eligible',
  );
  assert.equal(
    evaluateReturnEligibility({
      reason: 'change_of_mind',
      deliveredAt: now - 10 * 86_400_000,
      now,
      productReturnEligible: true,
      originalSealIntact: true,
      policy,
    }).decision,
    'manual_review',
  );
  assert.equal(
    evaluateReturnEligibility({
      reason: 'change_of_mind',
      deliveredAt: now - 16 * 86_400_000,
      now,
      productReturnEligible: true,
      originalSealIntact: true,
      policy,
    }).decision,
    'ineligible',
  );
});

void test('product compliance validation requires return terms and valid preparation dates', () => {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    categoryId: 'cat',
    sku: 'HK-TEST-NEW',
    nameEn: 'Handmade test piece',
    descriptionEn: 'A sufficiently detailed handmade product description.',
    price: '1500.00',
    inventoryQuantity: '3',
    producer: 'Maker One',
    materials: 'Natural fibre',
    preparationDays: '4',
    manufacturedAt: '2026-09-01',
    expiresAt: '2027-09-01',
    returnEligible: 'yes',
  }))
    form.set(name, value);
  form.append('occasionIds', 'occasion-wedding');
  assert.match(
    parseProductSubmission(form).errors.join(' '),
    /return conditions/i,
  );
  form.set(
    'returnConditions',
    'Unused and undamaged in the original packaging.',
  );
  const parsed = parseProductSubmission(form);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.input?.preparationDays, 4);
  assert.equal(parsed.input?.madeToOrder, false);
  assert.ok(parsed.input?.manufacturedAt);
  assert.ok(parsed.input?.expiresAt);
});

void test('seller product compliance disclosures persist for moderation', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await db
      .prepare(
        `INSERT INTO occasions (id, slug, name_en, is_active, sort_order, created_at, updated_at)
       VALUES ('occasion-compliance', 'compliance-gift', 'Compliance gift', 1, 1, ?, ?)`,
      )
      .bind(now, now)
      .run();
    await createProductSubmission(db, {
      productId: 'product-compliance',
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      slug: 'compliance-product',
      input: {
        categoryId: 'cat',
        occasionIds: ['occasion-compliance'],
        sku: 'COMPLIANCE-1',
        nameEn: 'Compliance product',
        nameNe: null,
        descriptionEn:
          'A product containing the complete applicable disclosure set.',
        descriptionNe: null,
        pricePaisa: 150_000,
        compareAtPricePaisa: null,
        inventoryQuantity: 3,
        producer: 'Maker One',
        materials: ['Natural fibre'],
        originStory: null,
        dimensions: '20 × 10 cm',
        careInstructions: 'Wipe with a dry cloth.',
        safetyInformation: 'Keep away from open flame.',
        returnConditions: 'Unused and undamaged in the original packaging.',
        returnEligible: true,
        warranty: '30-day workmanship guarantee.',
        madeToOrder: true,
        preparationDays: 5,
        manufacturedAt: now - 86_400_000,
        expiresAt: null,
        licenceReference: null,
      },
      images: [],
      now,
    });
    const stored = await getSellerProductForRevision(
      db,
      'seller-1',
      'product-compliance',
    );
    assert.equal(
      stored?.returnConditions,
      'Unused and undamaged in the original packaging.',
    );
    assert.equal(stored?.madeToOrder, 1);
    assert.equal(stored?.preparationDays, 5);
    assert.equal(stored?.manufacturedAt, now - 86_400_000);
  } finally {
    await fixture.dispose();
  }
});

void test('mixed-seller checkout includes preparation, adds half the base and preserves historical snapshots', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const before = await db
      .prepare('SELECT id, return_policy_snapshot_json FROM orders ORDER BY id')
      .all();
    await db
      .prepare(
        "UPDATE products SET preparation_days = 5, made_to_order = 1 WHERE id = 'product-2'",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO carts (id, anonymous_token_hash, currency, created_at, updated_at) VALUES ('delivery-cart', 'delivery-token', 'NPR', ?, ?)",
      )
      .bind(now, now)
      .run();
    for (const id of ['product-1', 'product-2']) {
      await db
        .prepare(
          "INSERT INTO cart_items (id, cart_id, product_id, quantity, created_at, updated_at) VALUES (?, 'delivery-cart', ?, 2, ?, ?)",
        )
        .bind(`delivery-${id}`, id, now, now)
        .run();
    }
    const { getCart } = await import('../lib/db/repositories/cart');
    const cart = await getCart(db, 'delivery-token');
    assert.equal(
      Math.max(...cart.items.map((item) => item.preparationDays)),
      5,
    );
    const input = {
      customerEmail: 'buyer@example.test',
      customerPhone: '9811111111',
      locale: 'en-NP' as const,
      termsAccepted: true,
      idempotencyKey: crypto.randomUUID(),
      address: {
        recipientName: 'Buyer',
        phone: '9811111111',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu',
        locality: 'Local QA',
      },
    };
    const order = await createCodOrder(
      db,
      'delivery-token',
      'delivery-receipt',
      input,
      now,
    );
    assert.equal(order.grandTotalPaisa, cart.itemSubtotalPaisa + 22500);
    assert.equal(order.estimatedMinDays, 6);
    assert.equal(order.estimatedMaxDays, 8);
    const stored = await db
      .prepare(
        'SELECT return_policy_snapshot_json AS policy FROM orders WHERE order_number = ?',
      )
      .bind(order.orderNumber)
      .first<{ policy: string }>();
    await db
      .prepare(
        "UPDATE products SET preparation_days = 20, return_eligible = 0, return_conditions = 'New conditions' WHERE id = 'product-2'",
      )
      .run();
    assert.deepEqual(
      {
        ...(await createCodOrder(
          db,
          'delivery-token',
          'delivery-receipt',
          input,
          now,
        )),
      },
      order,
    );
    assert.deepEqual(
      (
        await db
          .prepare(
            'SELECT id, return_policy_snapshot_json FROM orders WHERE order_number <> ? ORDER BY id',
          )
          .bind(order.orderNumber)
          .all()
      ).results,
      before.results,
    );
    assert.equal(
      (
        await db
          .prepare(
            'SELECT return_policy_snapshot_json AS policy FROM orders WHERE order_number = ?',
          )
          .bind(order.orderNumber)
          .first<{ policy: string }>()
      )?.policy,
      stored?.policy,
    );
    const receipt = await getOrderReceipt(
      db,
      order.orderNumber,
      'delivery-receipt',
    );
    assert.ok(receipt?.items.every((item) => item.returnEligible));
    assert.deepEqual(receipt?.deliveryPricing, {
      pricingPolicy: 'base_plus_half_per_additional_store_v1',
      baseChargePaisa: 15000,
      originalStoreCount: 2,
      currentStoreCount: 2,
    });
  } finally {
    await fixture.dispose();
  }
});

void test('checkout retains accepted terms and issues immutable order and COD documents', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await db
      .prepare(
        `INSERT INTO carts (id, anonymous_token_hash, currency, created_at, updated_at)
       VALUES ('cart-docs', 'cart-token-docs', 'NPR', ?, ?)`,
      )
      .bind(now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO cart_items (id, cart_id, product_id, quantity, created_at, updated_at)
       VALUES ('cart-item-docs', 'cart-docs', 'product-1', 2, ?, ?)`,
      )
      .bind(now, now)
      .run();
    const order = await createCodOrder(
      db,
      'cart-token-docs',
      'receipt-token-docs',
      {
        customerEmail: 'buyer@example.test',
        customerPhone: '9811111111',
        locale: 'en-NP',
        termsAccepted: true,
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        address: {
          recipientName: 'Buyer One',
          phone: '9811111111',
          province: 'Madhesh',
          district: 'Dhanusha',
          municipality: 'Janakpur',
          locality: 'Ward 1',
        },
      },
      now,
    );
    const repeated = await createCodOrder(
      db,
      'cart-token-docs',
      'receipt-token-docs',
      {
        customerEmail: 'buyer@example.test',
        customerPhone: '9811111111',
        locale: 'en-NP',
        termsAccepted: true,
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        address: {
          recipientName: 'Buyer One',
          phone: '9811111111',
          province: 'Madhesh',
          district: 'Dhanusha',
          municipality: 'Janakpur',
          locality: 'Ward 1',
        },
      },
      now,
    );
    assert.equal(repeated.orderNumber, order.orderNumber);
    const receipt = await getOrderReceipt(
      db,
      order.orderNumber,
      'receipt-token-docs',
    );
    assert.equal(receipt?.policyVersion, CUSTOMER_POLICY_VERSION);
    const acceptedTerms = await db
      .prepare(
        `SELECT order_policy_acceptances.terms_snapshot_json AS termsSnapshot
         FROM order_policy_acceptances
         INNER JOIN orders ON orders.id = order_policy_acceptances.order_id
         WHERE orders.order_number = ?`,
      )
      .bind(order.orderNumber)
      .first<{ termsSnapshot: string }>();
    const acceptedPolicySnapshot = JSON.parse(
      acceptedTerms?.termsSnapshot ?? '{}',
    ) as { documents?: Record<string, string> };
    assert.deepEqual(acceptedPolicySnapshot.documents, {
      terms: publicLegalPolicies.terms.sha256,
      returns: publicLegalPolicies.returns.sha256,
      shipping: publicLegalPolicies.shipping.sha256,
      privacy: publicLegalPolicies.privacy.sha256,
    });
    assert.equal(receipt?.termsAcceptedAt, now);
    assert.equal(receipt?.items[0]?.fulfillmentStatus, 'confirmed');
    assert.equal(receipt?.documents.length, 1);
    const statement = receipt?.documents[0];
    assert.ok(statement);
    const statementDetail = await getOrderDocument(
      db,
      order.orderNumber,
      statement.id,
      'receipt-token-docs',
    );
    assert.equal(statementDetail?.snapshot.taxDocument, false);
    assert.equal(
      statementDetail?.snapshot.grandTotalPaisa,
      order.grandTotalPaisa,
    );
    assert.equal(
      await getOrderDocument(
        db,
        order.orderNumber,
        statement.id,
        'wrong-receipt-token',
      ),
      null,
    );

    const orderId = await db
      .prepare(`SELECT id FROM orders WHERE order_number = ?`)
      .bind(order.orderNumber)
      .first<{ id: string }>();
    assert.ok(orderId);
    await db
      .prepare(`UPDATE orders SET status = 'ready_for_pickup' WHERE id = ?`)
      .bind(orderId.id)
      .run();
    await db
      .prepare(
        `UPDATE order_items SET fulfillment_status = 'ready_for_pickup' WHERE order_id = ?`,
      )
      .bind(orderId.id)
      .run();
    await transitionAdminFulfillment(db, {
      orderId: orderId.id,
      actorId: 'admin-1',
      action: 'dispatch',
      note: 'Manual dispatch reference confirmed.',
      trackingCode: 'MANUAL-TEST-1',
      requestId: 'dispatch-doc-test',
      now: now + 1,
    });
    await transitionAdminFulfillment(db, {
      orderId: orderId.id,
      actorId: 'admin-1',
      action: 'deliver',
      note: 'COD collection and delivery confirmed.',
      requestId: 'deliver-doc-test',
      now: now + 2,
    });
    const delivered = await getOrderReceipt(
      db,
      order.orderNumber,
      'receipt-token-docs',
    );
    assert.equal(delivered?.documents.length, 2);
    assert.equal(delivered?.paymentStatus, 'paid');
    assert.equal(delivered?.items[0]?.fulfillmentStatus, 'delivered');
    const paymentDocument = delivered?.documents.find(
      (item) => item.kind === 'payment_receipt',
    );
    assert.ok(paymentDocument);
    const paymentDetail = await getOrderDocument(
      db,
      order.orderNumber,
      paymentDocument.id,
      'receipt-token-docs',
    );
    assert.equal(paymentDetail?.snapshot.paymentStatus, 'paid');
  } finally {
    await fixture.dispose();
  }
});

void test('database rate limits allow the configured window and reject repeats', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const request = new Request('https://example.test/api/action', {
      headers: {
        'cf-connecting-ip': '203.0.113.5',
        'user-agent': 'test-agent',
      },
    });
    assert.equal(
      (
        await consumeRequestRateLimit(db, request, {
          scope: 'test',
          limit: 2,
          windowMs: 60_000,
          now,
        })
      ).allowed,
      true,
    );
    assert.equal(
      (
        await consumeRequestRateLimit(db, request, {
          scope: 'test',
          limit: 2,
          windowMs: 60_000,
          now: now + 1,
        })
      ).allowed,
      true,
    );
    assert.equal(
      (
        await consumeRequestRateLimit(db, request, {
          scope: 'test',
          limit: 2,
          windowMs: 60_000,
          now: now + 2,
        })
      ).allowed,
      false,
    );
    assert.equal(
      (
        await consumeRequestRateLimit(db, request, {
          scope: 'test',
          limit: 2,
          windowMs: 60_000,
          now: now + 60_001,
        })
      ).allowed,
      true,
    );
  } finally {
    await fixture.dispose();
  }
});

void test('catalogue search combines safe text, category, and occasion filters', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await db
      .prepare(
        `INSERT INTO categories (id, slug, name_en, is_active, sort_order, created_at, updated_at) VALUES ('cat-traditional-textiles', 'traditional-textiles', 'Traditional textiles', 1, 10, ?, ?), ('cat-home-decor', 'home-decor', 'Home decor', 1, 20, ?, ?)`,
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
      ['traditional-textiles', 'home-decor', 'others'],
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
    await db
      .prepare(
        `INSERT INTO seller_ledger_entries (
          id, seller_id, order_item_id, type, amount_paisa, available_at,
          description, created_at
        ) VALUES ('commission-item-1', 'seller-1', 'item-1', 'commission',
          -12000, ?, 'Historical snapshotted commission', ?)`,
      )
      .bind(now, now)
      .run();
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
    const completeRefund = (requestId: string) => advanceReturnAsAdmin(db, {
      returnRequestId: created.id,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'complete_refund',
      note: 'Verified COD refund transfer completed successfully.',
      publicMessageEn: 'Your refund has been paid.',
      publicMessageNe: 'तपाईंको फिर्ता रकम भुक्तानी भयो।',
      reference: 'BANK-REF-1',
      restockQuantity: 1,
      requestId,
      now,
    });
    const completionAttempts = await Promise.allSettled([
      completeRefund('refund-paid-1'),
      completeRefund('refund-paid-race'),
    ]);
    assert.equal(
      completionAttempts.filter((attempt) => attempt.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      completionAttempts.filter((attempt) => attempt.status === 'rejected').length,
      1,
    );
    const winningRequestId = completionAttempts[0].status === 'fulfilled'
      ? 'refund-paid-1'
      : 'refund-paid-race';
    await completeRefund(winningRequestId);
    const result = await db
      .prepare(
        `SELECT return_requests.status, refunds.status AS refundStatus,
          refunds.commission_base_refunded_paisa AS commissionBaseRefundedPaisa,
          refunds.commission_reversal_paisa AS commissionReversalPaisa,
          orders.payment_status AS paymentStatus,
          products.inventory_quantity AS inventory,
          (SELECT COUNT(*) FROM seller_ledger_entries WHERE refund_id = refunds.id) AS ledgerCount,
          (SELECT COALESCE(SUM(amount_paisa), 0) FROM seller_ledger_entries
            WHERE refund_id = refunds.id AND type = 'commission_reversal') AS ledgerReversalPaisa,
          (SELECT fulfillment_status FROM order_items WHERE id = 'item-2') AS otherItemStatus
         FROM return_requests
         INNER JOIN refunds ON refunds.return_request_id = return_requests.id
         INNER JOIN order_items ON order_items.id = return_requests.order_item_id
         INNER JOIN orders ON orders.id = order_items.order_id
         INNER JOIN products ON products.id = order_items.product_id
         WHERE return_requests.id = ?`,
      )
      .bind(created.id)
      .first<{
        status: string;
        refundStatus: string;
        commissionBaseRefundedPaisa: number;
        commissionReversalPaisa: number;
        paymentStatus: string;
        inventory: number;
        ledgerCount: number;
        ledgerReversalPaisa: number;
        otherItemStatus: string;
      }>();
    assert.deepEqual(
      { ...result },
      {
        status: 'resolved',
        refundStatus: 'paid',
        commissionBaseRefundedPaisa: 100_000,
        commissionReversalPaisa: 12_000,
        paymentStatus: 'part_refunded',
        inventory: 10,
        ledgerCount: 2,
        ledgerReversalPaisa: 12_000,
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
        'We isolated the batch and provided the production record to HastaBazaar.',
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

void test('archive hides a published product while preserving order snapshots and rejects other sellers', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await db
      .prepare(
        "UPDATE order_items SET fulfillment_status='cancelled' WHERE product_id='product-1'",
      )
      .run();
    const { archiveSellerProduct, getPublishedProductBySlug } =
      await import('../lib/db/repositories/products');
    const before = await db
      .prepare("SELECT * FROM order_items WHERE id='item-1'")
      .first();
    await assert.rejects(
      () =>
        archiveSellerProduct(db, {
          productId: 'product-1',
          sellerId: 'seller-2',
          actorId: 'admin-1',
          now,
        }),
      /not found|published/i,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT status FROM products WHERE id='product-1'")
          .first<{ status: string }>()
      )?.status,
      'published',
    );
    await archiveSellerProduct(db, {
      productId: 'product-1',
      sellerId: 'seller-1',
      actorId: 'admin-1',
      now,
    });
    assert.equal(
      (
        await db
          .prepare("SELECT status FROM products WHERE id='product-1'")
          .first<{ status: string }>()
      )?.status,
      'archived',
    );
    const product = await db
      .prepare("SELECT slug FROM products WHERE id='product-1'")
      .first<{ slug: string }>();
    assert.equal(await getPublishedProductBySlug(db, product!.slug), null);
    assert.deepEqual(
      await db.prepare("SELECT * FROM order_items WHERE id='item-1'").first(),
      before,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM audit_logs WHERE action='product.archived'",
          )
          .first<{ count: number }>()
      )?.count,
      1,
    );
    await assert.rejects(
      () =>
        archiveSellerProduct(db, {
          productId: 'product-1',
          sellerId: 'seller-1',
          actorId: 'admin-1',
          now,
        }),
      /not found|published/i,
    );
    await db
      .prepare("UPDATE products SET status='under_review' WHERE id='product-2'")
      .run();
    await assert.rejects(
      () =>
        archiveSellerProduct(db, {
          productId: 'product-2',
          sellerId: 'seller-2',
          actorId: 'admin-1',
          now,
        }),
      /not found|published/i,
    );
  } finally {
    await fixture.dispose();
  }
});

void test('delete retains product and order records but removes an archived listing from the seller list', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await db
      .prepare(
        "UPDATE order_items SET fulfillment_status='cancelled' WHERE product_id='product-1'",
      )
      .run();
    const { deleteSellerProduct, listSellerProducts, archiveSellerProduct } =
      await import('../lib/db/repositories/products');
    const order = await db
      .prepare("SELECT * FROM order_items WHERE id='item-1'")
      .first();
    await assert.rejects(() =>
      deleteSellerProduct(db, {
        productId: 'product-1',
        sellerId: 'seller-1',
        actorId: 'seller-user-1',
        now,
      }),
    );
    await archiveSellerProduct(db, {
      productId: 'product-1',
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      now,
    });
    await assert.rejects(() =>
      deleteSellerProduct(db, {
        productId: 'product-1',
        sellerId: 'seller-2',
        actorId: 'seller-user-2',
        now,
      }),
    );
    await deleteSellerProduct(db, {
      productId: 'product-1',
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      now,
    });
    assert.ok(
      !(await listSellerProducts(db, 'seller-1')).some(
        (p) => p.id === 'product-1',
      ),
    );
    assert.ok(
      await db.prepare("SELECT id FROM products WHERE id='product-1'").first(),
    );
    assert.deepEqual(
      await db.prepare("SELECT * FROM order_items WHERE id='item-1'").first(),
      order,
    );
    await assert.rejects(() =>
      deleteSellerProduct(db, {
        productId: 'product-1',
        sellerId: 'seller-1',
        actorId: 'seller-user-1',
        now,
      }),
    );
  } finally {
    await fixture.dispose();
  }
});
void test('only an active Super Admin can unpublish and the product returns to review', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const { reviewProduct, getPublishedProductBySlug } =
      await import('../lib/db/repositories/products');
    const options = {
      productId: 'product-1',
      action: 'unpublish' as const,
      reason: 'Listing requires another compliance review',
      requestId: 'unpublish-test',
      now,
    };
    await assert.rejects(
      () => reviewProduct(db, { ...options, actorId: 'admin-1' }),
      /Super Admin/,
    );
    assert.equal(
      await reviewProduct(db, { ...options, actorId: 'super-1' }),
      'under_review',
    );
    const row = await db
      .prepare("SELECT slug,published_at FROM products WHERE id='product-1'")
      .first<{ slug: string; published_at: number | null }>();
    assert.equal(await getPublishedProductBySlug(db, row!.slug), null);
    assert.equal(row!.published_at, null);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_logs WHERE action='product.unpublished'",
          )
          .first<{ n: number }>()
      )?.n,
      1,
    );
  } finally {
    await fixture.dispose();
  }
});

void test('delivery assignment restricts rider updates and clears location on reassignment and completion', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const { assignDelivery, updateRiderLocation, getDelivery } =
      await import('../lib/delivery/repository');
    await db
      .prepare("UPDATE orders SET status='dispatched' WHERE id='order-1'")
      .run();
    await assert.rejects(() =>
      assignDelivery(db, {
        orderId: 'order-1',
        actorId: 'admin-1',
        method: 'own_rider',
        riderEmail: 'seller1@example.test',
        now,
      }),
    );
    await db
      .prepare(
        "INSERT INTO rider_profiles(user_id,status,application_id,updated_at) VALUES ('seller-user-1','approved','synthetic-legacy-app',?)",
      )
      .bind(now)
      .run();
    await db
      .prepare(
        "INSERT INTO delivery_assignments(order_id,method,rider_user_id,assigned_by,updated_at) VALUES ('order-1','own_rider','seller-user-1','admin-1',?)",
      )
      .bind(now)
      .run();
    await assert.rejects(() =>
      updateRiderLocation(
        db,
        'order-1',
        'seller-user-2',
        { latitude: 27.7, longitude: 85.3 },
        now,
      ),
    );
    await updateRiderLocation(
      db,
      'order-1',
      'seller-user-1',
      { latitude: 27.7, longitude: 85.3, accuracy: 12 },
      now,
    );
    assert.equal((await getDelivery(db, 'order-1', now))?.latitude, 27.7);
    assert.equal(
      (await getDelivery(db, 'order-1', now + 180000))?.latitude,
      null,
    );
    await assignDelivery(db, {
      orderId: 'order-1',
      actorId: 'admin-1',
      method: 'courier',
      courierName: 'Test carrier',
      trackingReference: 'ABC123',
      trackingUrl: 'https://courier.example/track/ABC123',
      now: now + 1,
    });
    await assert.rejects(() =>
      updateRiderLocation(
        db,
        'order-1',
        'seller-user-1',
        { latitude: 27.7, longitude: 85.3 },
        now + 15000,
      ),
    );
    assert.equal((await getDelivery(db, 'order-1', now + 1))?.latitude, null);
    await db
      .prepare(
        "UPDATE delivery_assignments SET method='own_rider',rider_user_id='seller-user-1' WHERE order_id='order-1'",
      )
      .run();
    await updateRiderLocation(
      db,
      'order-1',
      'seller-user-1',
      { latitude: 27.7, longitude: 85.3 },
      now + 3,
    );
    await db
      .prepare("UPDATE orders SET status='delivered' WHERE id='order-1'")
      .run();
    assert.equal(
      (
        await db
          .prepare(
            "SELECT latitude FROM delivery_assignments WHERE order_id='order-1'",
          )
          .first<{ latitude: number | null }>()
      )?.latitude,
      null,
    );
    await assert.rejects(() =>
      assignDelivery(db, {
        orderId: 'order-1',
        actorId: 'admin-1',
        method: 'own_rider',
        riderEmail: 'seller1@example.test',
        now: now + 2,
      }),
    );
  } finally {
    await fixture.dispose();
  }
});

void test('inactive sellers cannot be viewed, added or purchased; transaction preserves stock and snapshots', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const { getPublishedProductBySlug } =
      await import('../lib/db/repositories/products');
    const { addCartItem } = await import('../lib/db/repositories/cart');
    const product = await db
      .prepare(
        "SELECT slug,inventory_quantity AS stock FROM products WHERE id='product-1'",
      )
      .first<{ slug: string; stock: number }>();
    assert.ok(product);
    const old = await db
      .prepare(
        "SELECT return_policy_snapshot_json AS snapshot FROM orders WHERE id='order-1'",
      )
      .first<{ snapshot: string }>();
    for (const status of ['disabled', 'suspended']) {
      await db
        .prepare("UPDATE users SET status=? WHERE id='seller-user-1'")
        .bind(status)
        .run();
      assert.equal(await getPublishedProductBySlug(db, product.slug), null);
      await assert.rejects(
        () => addCartItem(db, 'blocked-cart', 'product-1', 1, Date.now()),
        /unavailable/,
      );
      await assert.rejects(
        () =>
          db.batch([
            db.prepare(
              "UPDATE orders SET customer_phone='9800000001' WHERE id='order-1'",
            ),
            db
              .prepare(
                `INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,seller_discount_paisa,commission_bps,commission_paisa,tax_paisa,line_total_paisa,created_at) VALUES ('blocked-item','order-1','product-1','seller-1','Seller','Product','SKU',10000,1,0,1200,1200,0,10000,?)`,
              )
              .bind(Date.now()),
          ]),
        /product_unavailable/,
      );
      assert.equal(
        (
          await db
            .prepare(
              "SELECT inventory_quantity AS stock FROM products WHERE id='product-1'",
            )
            .first<{ stock: number }>()
        )?.stock,
        product.stock,
      );
    }
    await db
      .prepare("UPDATE users SET status='active' WHERE id='seller-user-1'")
      .run();
    await db
      .prepare(
        "UPDATE seller_profiles SET status='suspended' WHERE id='seller-1'",
      )
      .run();
    assert.equal(await getPublishedProductBySlug(db, product.slug), null);
    await db
      .prepare(
        "UPDATE seller_profiles SET status='approved' WHERE id='seller-1'",
      )
      .run();
    assert.ok(await getPublishedProductBySlug(db, product.slug));
    assert.deepEqual(
      await db
        .prepare(
          "SELECT return_policy_snapshot_json AS snapshot FROM orders WHERE id='order-1'",
        )
        .first(),
      old,
    );
  } finally {
    await fixture.dispose();
  }
});

void test('mailbox claim revokes unverified credentials and sessions; reset establishes trusted password; staff credentials survive', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    await resetAuthFixture(db);
    const { createHostedSessionForUser, passwordRecord, getHostedIdentity } =
      await import('../lib/auth/hosted-session');
    const { hasMailboxProof } =
      await import('../lib/auth/mailbox-verification');
    const now = Date.now();
    const unverified = await passwordRecord('Synthetic initial password');
    await db
      .prepare(
        "INSERT INTO user_credentials(user_id,password_hash,password_salt,password_version,created_at,updated_at) VALUES ('seller-user-1',?,?,1,?,?)",
      )
      .bind(unverified.hash, unverified.salt, now, now)
      .run();
    const old = await createHostedSessionForUser(db, 'seller-user-1', now, {
      passwordHash: unverified.hash,
    });
    const identity = await getHostedIdentity(
      db,
      new Headers({ cookie: 'hastabazaar_session=' + old }),
      now,
    );
    assert.equal(hasMailboxProof(identity!), false);
    const fresh = await createHostedSessionForUser(
      db,
      'seller-user-1',
      now + 1,
      { mailbox: true },
    );
    assert.equal(
      await getHostedIdentity(
        db,
        new Headers({ cookie: 'hastabazaar_session=' + old }),
        now + 2,
      ),
      null,
    );
    assert.equal(
      hasMailboxProof(
        (await getHostedIdentity(
          db,
          new Headers({ cookie: 'hastabazaar_session=' + fresh }),
          now + 2,
        ))!,
      ),
      true,
    );
    assert.equal(
      await db
        .prepare(
          "SELECT user_id FROM user_credentials WHERE user_id='seller-user-1'",
        )
        .first(),
      null,
    );
    await assert.rejects(
      () =>
        createHostedSessionForUser(db, 'seller-user-1', now + 3, {
          passwordHash: unverified.hash,
        }),
      /changed/,
    );
    const challenge = createEmailOtpChallenge({ userId: 'seller-user-1', now });
    await new PasswordResetStore(db).replaceChallenge(challenge.record);
    assert.equal(
      await resetPassword(
        db,
        challenge.token,
        challenge.code,
        'New mailbox protected password',
        now + 4,
      ),
      true,
    );
    const saved = await db
      .prepare(
        "SELECT password_hash AS hash FROM user_credentials WHERE user_id='seller-user-1'",
      )
      .first<{ hash: string }>();
    assert.ok(saved);
    const passwordSession = await createHostedSessionForUser(
      db,
      'seller-user-1',
      now + 5,
      { passwordHash: saved.hash },
    );
    assert.equal(
      hasMailboxProof(
        (await getHostedIdentity(
          db,
          new Headers({ cookie: 'hastabazaar_session=' + passwordSession }),
          now + 6,
        ))!,
      ),
      true,
    );
    await createHostedSessionForUser(db, 'seller-user-1', now + 7, {
      mailbox: true,
    });
    assert.ok(
      await getHostedIdentity(
        db,
        new Headers({ cookie: 'hastabazaar_session=' + passwordSession }),
        now + 8,
      ),
    );
    await db
      .prepare(
        "INSERT INTO user_credentials(user_id,password_hash,password_salt,password_version,created_at,updated_at) VALUES ('super-1',?,?,1,?,?)",
      )
      .bind(unverified.hash, unverified.salt, now, now)
      .run();
    await createHostedSessionForUser(db, 'super-1', now + 10, {
      mailbox: true,
    });
    assert.equal(
      (
        await db
          .prepare(
            "SELECT password_hash AS hash FROM user_credentials WHERE user_id='super-1'",
          )
          .first<{ hash: string }>()
      )?.hash,
      unverified.hash,
    );
  } finally {
    await fixture.dispose();
  }
});

import {
  prepareSellerParcels,
  operateParcel,
  listParcels,
  parcelCashRecords,
  shareParcelLocation,
  customerParcel,
  allocateOrderCash,
} from '../lib/operations/parcels';
import {
  transitionSellerFulfillment as parcelSellerTransition,
  transitionAdminFulfillment as parcelLegacyTransition,
} from '../lib/db/repositories/fulfillment';
import { emailQueueSummary } from '../lib/operations/email-queue';

async function parcelFixture() {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  await db
    .prepare(
      "UPDATE orders SET status='confirmed',payment_status='pending',delivered_at=NULL,item_subtotal_paisa=2100000,grand_total_paisa=2115000 WHERE id='order-1'",
    )
    .run();
  await db
    .prepare(
      "UPDATE order_items SET order_id='order-1',fulfillment_status='confirmed' WHERE id IN ('item-1','item-2')",
    )
    .run();
  await db
    .prepare(
      "UPDATE payments SET status='pending',amount_paisa=2115000 WHERE order_id='order-1'",
    )
    .run();
  await prepareSellerParcels(db, {
    orderId: 'order-1',
    actorId: 'admin-1',
    requestId: 'parcel-setup',
    now: Date.now(),
  });
  return { ...fixture, db };
}
void test('parcel cash allocation preserves exact totals and stable remainder ordering', () => {
  const total = Number.MAX_SAFE_INTEGER;
  const p = allocateOrderCash(total, [
    { sellerId: 'b', amount: 2000000 },
    { sellerId: 'a', amount: 100000 },
  ]);
  assert.equal(
    p.reduce((n, x) => n + x.amount, 0),
    total,
  );
  assert.deepEqual(
    allocateOrderCash(1, [
      { sellerId: 'b', amount: 1 },
      { sellerId: 'a', amount: 1 },
    ]),
    [
      { sellerId: 'a', amount: 1 },
      { sellerId: 'b', amount: 0 },
    ],
  );
  assert.throws(() => allocateOrderCash(100, []));
});
void test('two seller parcels separate delivery, collection, remittance, return eligibility and rider access', async () => {
  const f = await parcelFixture(),
    db = f.db;
  let seq = 0;
  const now = Date.now();
  try {
    await db
      .prepare(
        "INSERT INTO rider_profiles(user_id,status,application_id,updated_at) VALUES ('seller-user-1','approved','synthetic-rider-1',?),('seller-user-2','approved','synthetic-rider-2',?)",
      )
      .bind(now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,submitted_by,submitted_at,approved_by,approved_at,published_by,published_at,decision_note,last_request_id) VALUES ('parcel-finance-v1','rider_finance_policy',1,?,'published',3,'controlled',?,'SIMULATED parcel regression finance policy','super-1',?,'super-1',?,'admin-1',?,'admin-1',?,'SIMULATED approval','parcel-finance-request')`,
      )
      .bind(
        JSON.stringify({
          cashExposureLimitPaisa: 10_000_000,
          operatingWeekdays: [
            'sunday',
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
          ],
          holidayDates: [],
          remittanceCutoffLocalTime: '17:00',
          completedTripPaisa: 0,
          failedTripPaisa: 0,
          returnTripPaisa: 0,
          receivingAccountLabel: 'SIMULATED REGRESSION CASH DESK',
        }),
        now - 1,
        now - 1,
        now - 1,
        now - 1,
        now - 1,
      )
      .run();
    const parcels = await listParcels(db, 'order-1');
    assert.equal(parcels.length, 2);
    assert.equal(
      parcels.reduce((n, p) => n + p.codDuePaisa, 0),
      2115000,
    );
    assert.equal((await listParcels(db, 'order-1', 'seller-1')).length, 1);
    assert.equal((await listParcels(db, 'order-1', 'unrelated')).length, 0);
    const [a, b] = parcels;
    async function op(
      id: string,
      action: string,
      extra: Record<string, unknown> = {},
      actorId = 'admin-1',
    ) {
      const current = (await listParcels(db, 'order-1')).find(
        (p) => p.id === id,
      )!;
      await operateParcel(db, {
        jobId: id,
        actorId,
        action,
        version: current.version,
        note: 'Synthetic operational evidence verified.',
        requestId: 'parcel-op-' + seq++,
        now,
        ...extra,
      });
    }
    await assert.rejects(() =>
      prepareSellerParcels(db, {
        orderId: 'order-2',
        actorId: 'seller-user-1',
        requestId: 'forbidden',
        now,
      }),
    );
    await op(a.id, 'assign', {
      method: 'courier',
      courierName: 'Synthetic courier',
      trackingCode: 'SYN-A',
      trackingUrl: 'https://example.test/tracking',
    });
    await db
      .prepare(
        "UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE id='item-1'",
      )
      .run();
    await op(a.id, 'dispatch');
    await op(a.id, 'deliver');
    const partial = await db
      .prepare(
        "SELECT status,payment_status AS payment FROM orders WHERE id='order-1'",
      )
      .first<{ status: string; payment: string }>();
    assert.equal(partial?.status, 'dispatched');
    assert.equal(partial?.payment, 'pending');
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM seller_ledger_entries WHERE order_item_id IN ('item-1','item-2')",
          )
          .first<{ n: number }>()
      )?.n,
      0,
    );
    await assert.rejects(() =>
      parcelLegacyTransition(db, {
        orderId: 'order-1',
        actorId: 'admin-1',
        action: 'deliver',
        note: 'Must use parcel controls',
        requestId: 'legacy-bypass',
        now,
      }),
    );
    await createCustomerReturnRequest(db, {
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      orderItemId: 'item-1',
      quantity: 1,
      reason: 'damaged',
      requestedResolution: 'refund',
      detail: 'Synthetic delivered item damage report.',
      locale: 'en-NP',
      idempotencyKey: 'partial-return',
      evidence: [],
      now: now + 1000,
    });
    for (const action of ['start_packing', 'ready_for_pickup'] as const)
      await parcelSellerTransition(db, {
        orderId: 'order-1',
        sellerId: 'seller-2',
        actorId: 'seller-user-2',
        action,
        note: 'Synthetic seller preparation.',
        requestId: 'seller-' + action,
        now,
      });
    await op(b.id, 'assign', {
      method: 'own_rider',
      riderEmail: 'seller2@example.test',
      trackingCode: 'SYN-B',
    });
    await op(b.id, 'dispatch');
    await shareParcelLocation(
      db,
      b.id,
      'seller-user-2',
      { latitude: 27.7, longitude: 85.3, accuracy: 10 },
      now,
    );
    const located = (await listParcels(db, 'order-1')).find(
      (p) => p.id === b.id,
    )!;
    assert.equal(customerParcel(located, now).latitude, 27.7);
    assert.equal(customerParcel(located, now + 120001).latitude, null);
    await op(b.id, 'assign', {
      method: 'own_rider',
      riderEmail: 'seller1@example.test',
      trackingCode: 'SYN-B2',
    });
    await assert.rejects(() =>
      shareParcelLocation(
        db,
        b.id,
        'seller-user-2',
        { latitude: 27.7, longitude: 85.3 },
        now,
      ),
    );
    assert.equal(
      (await listParcels(db, 'order-1')).find((p) => p.id === b.id)?.latitude,
      null,
    );
    await op(b.id, 'fail');
    await assert.rejects(() =>
      shareParcelLocation(
        db,
        b.id,
        'seller-user-1',
        { latitude: 27.7, longitude: 85.3 },
        now,
      ),
    );
    await op(b.id, 'retry');
    await assert.rejects(() => op(b.id, 'deliver'));
    const { submitRiderRemittance, submitRiderReport } = await import(
      '../lib/riders/repository'
    );
    const current = (await listParcels(db, 'order-1')).find(
      (p) => p.id === b.id,
    )!;
    const proof = await submitRiderReport(db, {
      riderId: 'seller-user-1',
      jobId: b.id,
      version: current.version,
      kind: 'delivered',
      note: 'Synthetic proof of customer handover for staff verification.',
      cashPaisa: current.codDuePaisa - current.collectedPaisa,
      key: 'synthetic-rider-proof',
      mime: 'image/jpeg',
      requestId: 'synthetic-proof-submit',
      openBox: false,
      now,
    });
    await op(b.id, 'deliver', { riderReportId: proof });
    assert.equal(
      (
        await db
          .prepare(
            "SELECT payment_status AS payment FROM orders WHERE id='order-1'",
          )
          .first<{ payment: string }>()
      )?.payment,
      'pending',
    );
    for (const p of parcels) {
      const latest = (await listParcels(db, 'order-1')).find((item) => item.id === p.id)!;
      const remainingCollection = latest.codDuePaisa - latest.collectedPaisa;
      if (remainingCollection > 0) {
        await op(p.id, 'collect', {
          amountPaisa: remainingCollection,
          reference: 'collection-' + p.id,
        });
      }
      if (latest.method === 'own_rider' && latest.riderUserId)
        await submitRiderRemittance(db, {
          riderId: latest.riderUserId,
          jobId: p.id,
          requestId: 'rider-remittance-' + p.id,
          amountPaisa: p.codDuePaisa,
          reference: 'remittance-' + p.id,
          now,
        });
      else
        await op(p.id, 'propose_remittance', {
          amountPaisa: p.codDuePaisa,
          reference: 'remittance-' + p.id,
        });
    }
    assert.equal(
      (
        await db
          .prepare(
            "SELECT payment_status AS payment FROM orders WHERE id='order-1'",
          )
          .first<{ payment: string }>()
      )?.payment,
      'paid',
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM seller_ledger_entries WHERE order_item_id IN ('item-1','item-2')",
          )
          .first<{ n: number }>()
      )?.n,
      0,
    );
    for (const r of (await parcelCashRecords(db, 'order-1')).filter(
      (r) => r.status === 'pending',
    )) {
      if (r.maker === 'admin-1') {
        await assert.rejects(() =>
          op(r.jobId, 'approve_remittance', { cashRecordId: r.id }),
        );
        await op(
          r.jobId,
          'approve_remittance',
          { cashRecordId: r.id },
          'super-1',
        );
      } else
        await op(r.jobId, 'approve_remittance', { cashRecordId: r.id });
    }
    assert.ok(
      ((
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM seller_ledger_entries WHERE order_item_id IN ('item-1','item-2')",
          )
          .first<{ n: number }>()
      )?.n ?? 0) > 0,
    );
    const posted = (await parcelCashRecords(db, 'order-1')).find(
      (r) => r.status === 'posted',
    )!;
    await assert.rejects(() =>
      db
        .prepare('UPDATE parcel_cash_records SET amount_paisa=1 WHERE id=?')
        .bind(posted.id)
        .run(),
    );
    await assert.rejects(() =>
      db
        .prepare('DELETE FROM parcel_cash_records WHERE id=?')
        .bind(posted.id)
        .run(),
    );
  } finally {
    await f.dispose();
  }
});
void test('parcel stale versions, overcollection and reused evidence roll back; exact replay is idempotent', async () => {
  const f = await parcelFixture(),
    db = f.db;
  try {
    let p = (await listParcels(db, 'order-1'))[0];
    const now = Date.now();
    await db
      .prepare("UPDATE shipping_jobs SET status='dispatched' WHERE id=?")
      .bind(p.id)
      .run();
    const o = {
      jobId: p.id,
      actorId: 'admin-1',
      requestId: 'collection-once',
      version: p.version,
      action: 'collect',
      note: 'Synthetic receipt proof.',
      amountPaisa: 100,
      reference: 'unique-receipt',
      now,
    };
    await operateParcel(db, o);
    await operateParcel(db, { ...o, now: now + 1 });
    p = (await listParcels(db, 'order-1'))[0];
    assert.equal(p.collectedPaisa, 100);
    await assert.rejects(() =>
      operateParcel(db, { ...o, requestId: 'stale', reference: 'another' }),
    );
    await assert.rejects(() =>
      operateParcel(db, {
        ...o,
        requestId: 'over',
        version: p.version,
        reference: 'over-receipt',
        amountPaisa: p.codDuePaisa + 1,
      }),
    );
    await assert.rejects(() =>
      operateParcel(db, {
        ...o,
        requestId: 'duplicate-proof',
        version: p.version,
      }),
    );
    const after = (await listParcels(db, 'order-1'))[0];
    assert.equal(after.collectedPaisa, 100);
    assert.equal(after.version, p.version);
    assert.equal((await parcelCashRecords(db, 'order-1')).length, 1);
  } finally {
    await f.dispose();
  }
});
void test('parcel cancellation restores stock once and a returned parcel holds the mixed order open', async () => {
  const f = await parcelFixture(),
    db = f.db;
  try {
    const [a, b] = await listParcels(db, 'order-1');
    const before = await db
      .prepare(
        "SELECT inventory_quantity AS n FROM products WHERE id='product-1'",
      )
      .first<{ n: number }>();
    const o = {
      jobId: a.id,
      actorId: 'admin-1',
      requestId: 'cancel-parcel',
      version: a.version,
      action: 'cancel',
      note: 'Customer cancellation before handoff.',
      now: Date.now(),
    };
    await operateParcel(db, o);
    await operateParcel(db, o);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT inventory_quantity AS n FROM products WHERE id='product-1'",
          )
          .first<{ n: number }>()
      )?.n,
      (before?.n ?? 0) + 1,
    );
    await db
      .prepare("UPDATE shipping_jobs SET status='delivery_failed' WHERE id=?")
      .bind(b.id)
      .run();
    for (const action of ['return_to_origin', 'receive_return']) {
      const p = (await listParcels(db, 'order-1')).find((p) => p.id === b.id)!;
      await operateParcel(db, {
        ...o,
        jobId: b.id,
        version: p.version,
        action,
        requestId: action,
      });
    }
    assert.equal(
      (
        await db
          .prepare("SELECT status FROM orders WHERE id='order-1'")
          .first<{ status: string }>()
      )?.status,
      'dispatched',
    );
    assert.equal(
      (await listParcels(db, 'order-1')).find((p) => p.id === b.id)?.status,
      'returned',
    );
  } finally {
    await f.dispose();
  }
});
void test('queue attention identifies delayed retries and expired leases without SMTP detail', async () => {
  const f = await databaseFixture(),
    db = f.database as unknown as D1Database;
  try {
    await db.prepare('DELETE FROM order_email_jobs').run();
    await db
      .prepare(
        "INSERT INTO order_email_jobs(id,order_id,order_status,created_at,status,next_attempt_at,lease_until) VALUES ('slow','order-1','packing',1000,'retry',1000,0),('expired','order-2','packing',2000,'sending',1000,2000)",
      )
      .run();
    const s = await emailQueueSummary(db, 1000000);
    assert.equal(s.pending, 2);
    assert.equal(s.failures, 1);
    assert.equal(s.expiredLeases, 1);
    assert.equal(s.due, 2);
    assert.equal(s.oldestAgeMinutes, 16);
  } finally {
    await f.dispose();
  }
});

void test('cancelling every unshipped parcel closes payment and records cancellation time', async () => {
  const f = await parcelFixture();
  try {
    for (const initial of await listParcels(f.db, 'order-1')) {
      const p = (await listParcels(f.db, 'order-1')).find(
        (p) => p.id === initial.id,
      )!;
      await operateParcel(f.db, {
        jobId: p.id,
        actorId: 'admin-1',
        requestId: 'all-cancel-' + p.id,
        version: p.version,
        action: 'cancel',
        note: 'Synthetic cancellation before handoff.',
        now: Date.now(),
      });
    }
    const order = await f.db
      .prepare(
        "SELECT status,payment_status AS payment,cancelled_at AS cancelled FROM orders WHERE id='order-1'",
      )
      .first<{ status: string; payment: string; cancelled: number | null }>();
    assert.equal(order?.status, 'cancelled');
    assert.equal(order?.payment, 'cancelled');
    assert.ok(order?.cancelled);
    const payment = await f.db
      .prepare("SELECT status FROM payments WHERE order_id='order-1'")
      .first<{ status: string }>();
    assert.equal(payment?.status, 'cancelled');
  } finally {
    await f.dispose();
  }
});

void test('R006 positive small payouts agree across queue request and preparation; ineligible balances stay blocked', async () => {
  for (const [amount, availableAt, eligible] of [
    [1, now, true],
    [99999, now, true],
    [0, now, false],
    [-1, now, false],
    [500, now + 10000, false],
    [500, null, false],
  ] as const) {
    const fixture = await databaseFixture();
    const db = fixture.database as unknown as D1Database;
    try {
      await db
        .prepare(
          "INSERT INTO seller_ledger_entries (id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES ('r006','seller-1','sale',?,?, 'Synthetic eligible earnings',?)",
        )
        .bind(amount, availableAt, now)
        .run();
      assert.equal(
        (await listPayoutCandidates(db, now)).some(
          (row) => row.sellerId === 'seller-1',
        ),
        eligible,
      );
      const request = () =>
        requestSellerPayout(db, {
          sellerId: 'seller-1',
          actorId: 'seller-user-1',
          note: 'Request available seller earnings.',
          requestId: 'r006-request',
          now,
        });
      const prepare = () =>
        prepareSellerPayout(db, {
          sellerId: 'seller-1',
          actorId: 'admin-1',
          actorRole: 'admin',
          note: 'Verify eligible seller earnings.',
          requestId: 'r006-prepare',
          now,
        });
      if (eligible) {
        await request();
        await assert.rejects(
          () =>
            requestSellerPayout(db, {
              sellerId: 'seller-1',
              actorId: 'seller-user-1',
              note: 'Duplicate open request blocked.',
              requestId: 'r006-second',
              now,
            }),
          PayoutConflictError,
        );
        const payout = await prepare();
        assert.equal(
          (
            await db
              .prepare('SELECT amount_paisa AS amount FROM payouts WHERE id=?')
              .bind(payout.id)
              .first<{ amount: number }>()
          )?.amount,
          amount,
        );
        assert.equal(
          (await listPayoutCandidates(db, now)).some(
            (row) => row.sellerId === 'seller-1',
          ),
          false,
        );
        await assert.rejects(
          () =>
            prepareSellerPayout(db, {
              sellerId: 'seller-1',
              actorId: 'admin-1',
              actorRole: 'admin',
              note: 'Already allocated entries blocked.',
              requestId: 'r006-reprepare',
              now,
            }),
          PayoutConflictError,
        );
      } else {
        await assert.rejects(request, PayoutConflictError);
        await assert.rejects(prepare, PayoutConflictError);
      }
    } finally {
      await fixture.dispose();
    }
  }
});

void test('R006 small payout queue and preparation retain approved seller and destination requirements', async () => {
  for (const [status, destination] of [
    ['approved', null],
    ['approved', '   '],
    ['suspended', 'Verified synthetic destination'],
  ] as const) {
    const fixture = await databaseFixture();
    const db = fixture.database as unknown as D1Database;
    try {
      await db
        .prepare(
          "UPDATE seller_profiles SET status=?,payout_account_reference=? WHERE id='seller-1'",
        )
        .bind(status, destination)
        .run();
      await db
        .prepare(
          "INSERT INTO seller_ledger_entries (id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES ('r006','seller-1','sale',1,?,'Synthetic earnings',?)",
        )
        .bind(now, now)
        .run();
      assert.equal(
        (await listPayoutCandidates(db, now)).some(
          (row) => row.sellerId === 'seller-1',
        ),
        false,
      );
      await assert.rejects(
        () =>
          prepareSellerPayout(db, {
            sellerId: 'seller-1',
            actorId: 'admin-1',
            actorRole: 'admin',
            note: 'Verify payout destination first.',
            requestId: 'r006-destination',
            now,
          }),
        PayoutConflictError,
      );
    } finally {
      await fixture.dispose();
    }
  }
});

void test('R014 parcel audit records commit with operations and retries never duplicate history', async () => {
  const f = await parcelFixture();
  try {
    const db = f.db,
      p = (await listParcels(db, 'order-1'))[0];
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_logs WHERE action='parcel.setup'",
          )
          .first<{ n: number }>()
      )?.n,
      1,
    );
    const o = {
      jobId: p.id,
      actorId: 'admin-1',
      requestId: 'audit-cost',
      version: p.version,
      action: 'record_cost',
      amountPaisa: 100,
      reference: 'synthetic-invoice',
      note: 'Synthetic courier expense.',
      now: Date.now(),
    };
    await operateParcel(db, o);
    await operateParcel(db, o);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_logs WHERE action='parcel.record_cost'",
          )
          .first<{ n: number }>()
      )?.n,
      1,
    );
    const current = (await listParcels(db, 'order-1'))[0];
    await operateParcel(db, {
      ...o,
      requestId: 'audit-cancel',
      version: current.version,
      action: 'cancel',
    });
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_logs WHERE action='parcel.cancel'",
          )
          .first<{ n: number }>()
      )?.n,
      1,
    );
    await assert.rejects(() =>
      operateParcel(db, { ...o, requestId: 'audit-stale' }),
    );
    assert.equal(
      await db
        .prepare(
          "SELECT id FROM audit_logs WHERE request_id='audit-stale:audit'",
        )
        .first(),
      null,
    );
  } finally {
    await f.dispose();
  }
});

import { listBusinessActivity } from '../lib/db/repositories/business-activity';
import { listNotifications } from '../lib/db/repositories/operations';
void test('R014 filters recorded audit fields without exposing private snapshots; R004 reads only recipient workspace', async () => {
  const fixture = await databaseFixture(),
    db = fixture.database as unknown as D1Database;
  try {
    const time = Date.parse('2026-09-13T09:00:00+05:45');
    await db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at) VALUES ('audit-filter','admin-1','parcel.cancel','order','order-1','private operational note','private data',?)",
      )
      .bind(time)
      .run();
    const rows = await listBusinessActivity(
      db,
      { role: 'super_admin' },
      {
        action: 'parcel.cancel',
        actor: 'admin-1',
        type: 'order',
        from: '2026-09-13',
        to: '2026-09-13',
      },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'audit-filter');
    assert.ok(!JSON.stringify(rows).includes('private'));
    assert.equal(
      (
        await listBusinessActivity(
          db,
          { role: 'super_admin' },
          { action: "parcel.cancel' OR 1=1 --" },
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await listBusinessActivity(
          db,
          { role: 'super_admin' },
          { from: '2026-09-14' },
        )
      ).some((r) => r.id === 'audit-filter'),
      false,
    );
    for (const [id, user, audience, channel] of [
      ['n-c', 'seller-user-1', 'customer', 'in_app'],
      ['n-s', 'seller-user-1', 'seller', 'in_app'],
      ['n-mail', 'seller-user-1', 'seller', 'email'],
      ['n-other', 'seller-user-2', 'seller', 'in_app'],
    ])
      await db
        .prepare(
          "INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at) VALUES (?,?,?,?,'test','Test','Test','Test','Test','order','order-1','queued',?,?)",
        )
        .bind(id, user, audience, channel, id, time)
        .run();
    assert.deepEqual(
      (await listNotifications(db, 'seller-user-1', 100, 'seller')).map(
        (n) => n.id,
      ),
      ['n-s'],
    );
    assert.deepEqual(
      (await listNotifications(db, 'seller-user-1', 100, 'customer')).map(
        (n) => n.id,
      ),
      ['n-c'],
    );
    await db
      .prepare(
        "UPDATE orders SET customer_id='seller-user-1' WHERE id='order-1'",
      )
      .run();
    assert.equal(
      (await listNotifications(db, 'seller-user-1', 100, 'customer'))[0]
        .orderNumber,
      'HK-TEST-1',
    );
    assert.equal(
      (await listNotifications(db, 'seller-user-2', 100, 'seller'))[0]
        .orderNumber,
      null,
    );
  } finally {
    await fixture.dispose();
  }
});

void test('R014 revoked queue permissions suppress underlying count reads', async () => {
  const queries: string[] = [];
  const db = {
    prepare: (sql: string) => {
      queries.push(sql);
      return { first: async () => ({}) };
    },
  } as unknown as D1Database;
  const summary = await getAdminWorkSummary(db, 'admin', []);
  assert.equal(summary.products, 0);
  assert.equal(summary.approvals, null);
  assert.equal(queries.length, 1);
  assert.ok(!queries[0].includes('FROM products'));
  assert.ok(!queries[0].includes('FROM seller_profiles'));
  assert.ok(!queries[0].includes('FROM complaints'));
});

void test('R020 repository parcel mutations reject revoked profiles and preserve source records', async () => {
  const f = await parcelFixture();
  try {
    const db = f.db,
      p = (await listParcels(db, 'order-1'))[0];
    await db
      .prepare(
        "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin-1','[]',1,'super-1',?)",
      )
      .bind(now)
      .run();
    await assert.rejects(() =>
      operateParcel(db, {
        jobId: p.id,
        actorId: 'admin-1',
        version: p.version,
        action: 'cancel',
        note: 'Revoked profile must not cancel.',
        requestId: 'revoked-parcel',
        now,
      }),
    );
    assert.equal((await listParcels(db, 'order-1'))[0].status, p.status);
  } finally {
    await f.dispose();
  }
});
void test('R020 payout preparation requires effective permission at repository boundary', async () => {
  const f = await databaseFixture(),
    db = f.database as unknown as D1Database;
  try {
    await accrueExistingDeliveredEarnings(db, {
      actorId: 'admin-1',
      requestId: 'revoked-accrue',
      now,
    });
    await db
      .prepare(
        "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin-1','[]',1,'super-1',?)",
      )
      .bind(now)
      .run();
    await assert.rejects(() =>
      prepareSellerPayout(db, {
        sellerId: 'seller-1',
        actorId: 'admin-1',
        actorRole: 'admin',
        note: 'Revoked profile must not prepare.',
        requestId: 'revoked-payout',
        now: now + 8 * 86400000,
      }),
    );
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM payouts')
          .first<{ n: number }>()
      )?.n,
      0,
    );
  } finally {
    await f.dispose();
  }
});

void test('R020 parcel and payout transactions roll back when permission changes after the initial read', async () => {
  for (const target of ['parcel', 'payout'] as const) {
    const f =
      target === 'parcel' ? await parcelFixture() : await databaseFixture();
    const db = ('db' in f ? f.db : f.database) as D1Database;
    try {
      if (target === 'payout')
        await accrueExistingDeliveredEarnings(db, {
          actorId: 'admin-1',
          requestId: 'before-race',
          now,
        });
      const before =
        target === 'parcel' ? (await listParcels(db, 'order-1'))[0] : null;
      const originalBatch = db.batch.bind(db);
      let changed = false;
      db.batch = async (statements) => {
        if (!changed) {
          changed = true;
          await db
            .prepare(
              "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin-1','[]',1,'super-1',?)",
            )
            .bind(now)
            .run();
        }
        return originalBatch(statements);
      };
      if (before) {
        await assert.rejects(() =>
          operateParcel(db, {
            jobId: before.id,
            actorId: 'admin-1',
            version: before.version,
            action: 'cancel',
            note: 'Permission changed before commit.',
            requestId: 'race-parcel',
            now,
          }),
        );
        const after = (await listParcels(db, 'order-1'))[0];
        assert.equal(after.status, before.status);
        assert.equal(after.version, before.version);
      } else {
        await assert.rejects(() =>
          prepareSellerPayout(db, {
            sellerId: 'seller-1',
            actorId: 'admin-1',
            actorRole: 'admin',
            note: 'Permission changed before preparation.',
            requestId: 'race-payout',
            now: now + 8 * 86400000,
          }),
        );
        assert.equal(
          (
            await db
              .prepare('SELECT COUNT(*) AS n FROM payouts')
              .first<{ n: number }>()
          )?.n,
          0,
        );
      }
    } finally {
      await f.dispose();
    }
  }
});
void test('R020 legacy staff fulfillment requires effective permission and guards cancellation commit', async () => {
  const f = await databaseFixture(),
    db = f.database as unknown as D1Database;
  try {
    await db
      .prepare("UPDATE orders SET status='confirmed' WHERE id='order-1'")
      .run();
    await db
      .prepare(
        "UPDATE order_items SET fulfillment_status='unfulfilled' WHERE order_id='order-1'",
      )
      .run();
    const originalBatch = db.batch.bind(db);
    db.batch = async (statements) => {
      await db
        .prepare(
          "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin-1','[]',1,'super-1',?)",
        )
        .bind(now)
        .run();
      db.batch = originalBatch;
      return originalBatch(statements);
    };
    await assert.rejects(() =>
      parcelLegacyTransition(db, {
        orderId: 'order-1',
        actorId: 'admin-1',
        action: 'cancel',
        note: 'Revocation must roll back cancellation.',
        requestId: 'legacy-race',
        now,
      }),
    );
    assert.equal(
      (
        await db
          .prepare("SELECT status FROM orders WHERE id='order-1'")
          .first<{ status: string }>()
      )?.status,
      'confirmed',
    );
    await assert.rejects(() =>
      parcelLegacyTransition(db, {
        orderId: 'order-1',
        actorId: 'admin-1',
        action: 'cancel',
        note: 'Revoked direct helper invocation.',
        requestId: 'legacy-revoked',
        now,
      }),
    );
  } finally {
    await f.dispose();
  }
});
void test('R020 payout operations reject forged Super Admin role independently of claimed API context', async () => {
  const f = await databaseFixture(),
    db = f.database as unknown as D1Database;
  try {
    await accrueExistingDeliveredEarnings(db, {
      actorId: 'admin-1',
      requestId: 'spoof-accrue',
      now,
    });
    const payout = await prepareSellerPayout(db, {
      sellerId: 'seller-1',
      actorId: 'admin-1',
      actorRole: 'admin',
      note: 'Independent approval is still required.',
      requestId: 'spoof-prepare',
      now: now + 8 * 86400000,
    });
    await assert.rejects(() =>
      operatePayout(db, {
        payoutId: payout.id,
        actorId: 'seller-user-2',
        actorRole: 'super_admin',
        action: 'approve',
        note: 'Forged actor role must never approve.',
        requestId: 'spoof-role',
        now,
      }),
    );
    assert.equal(
      (
        await db
          .prepare('SELECT status FROM payouts WHERE id=?')
          .bind(payout.id)
          .first<{ status: string }>()
      )?.status,
      'prepared',
    );
  } finally {
    await f.dispose();
  }
});

void test('R004 case notification reads follow customer order ownership and suppress closed or reassigned staff work', async () => {
  const f = await databaseFixture(),
    db = f.database as unknown as D1Database;
  try {
    await db
      .prepare(
        "UPDATE orders SET customer_id='seller-user-1' WHERE id='order-1'",
      )
      .run();
    const complaint = await createCustomerComplaint(db, {
      orderNumber: 'HK-TEST-1',
      receiptTokenHash: 'receipt-hash-1',
      orderItemId: 'item-1',
      category: 'product',
      subject: 'Synthetic item concern',
      detail: 'Synthetic source evidence for customer follow-up.',
      locale: 'en-NP',
      requestId: 'case-notification-source',
      now,
    });
    for (const [id, user, audience] of [
      ['case-customer', 'seller-user-1', 'customer'],
      ['case-admin', 'admin-1', 'staff'],
    ])
      await db
        .prepare(
          "INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at) VALUES (?,?,?,'in_app','test','Test','Test','Test','Test','complaint',?,'queued',?,?)",
        )
        .bind(id, user, audience, complaint.id, id, now)
        .run();
    assert.equal(
      (await listNotifications(db, 'seller-user-1', 100, 'customer')).find(
        (n) => n.id === 'case-customer',
      )?.orderNumber,
      'HK-TEST-1',
    );
    assert.ok(
      (await listNotifications(db, 'admin-1', 100, 'staff')).some(
        (n) => n.id === 'case-admin',
      ),
    );
    await db
      .prepare("UPDATE complaints SET assigned_to='super-1' WHERE id=?")
      .bind(complaint.id)
      .run();
    assert.ok(
      !(await listNotifications(db, 'admin-1', 100, 'staff')).some(
        (n) => n.id === 'case-admin',
      ),
    );
    await db
      .prepare(
        "UPDATE complaints SET assigned_to='admin-1',status='resolved' WHERE id=?",
      )
      .bind(complaint.id)
      .run();
    assert.ok(
      !(await listNotifications(db, 'admin-1', 100, 'staff')).some(
        (n) => n.id === 'case-admin',
      ),
    );
    assert.ok(
      (await listNotifications(db, 'seller-user-1', 100, 'customer')).some(
        (n) => n.id === 'case-customer',
      ),
    );
  } finally {
    await f.dispose();
  }
});

void test('R020 empty stored permission JSON is corrupted rather than a legacy missing profile', async () => {
  const f = await parcelFixture();
  try {
    const db = f.db,
      p = (await listParcels(db, 'order-1'))[0];
    await db
      .prepare(
        "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin-1','',1,'super-1',?)",
      )
      .bind(now)
      .run();
    await assert.rejects(() =>
      operateParcel(db, {
        jobId: p.id,
        actorId: 'admin-1',
        version: p.version,
        action: 'cancel',
        note: 'Empty corrupt profile must fail closed.',
        requestId: 'empty-profile',
        now,
      }),
    );
    assert.equal((await listParcels(db, 'order-1'))[0].status, p.status);
  } finally {
    await f.dispose();
  }
});

void test('legacy shipping and privacy record safe transactional audit mirrors', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const {
      createShippingJob,
      operateShippingJob,
      createDataRightsRequest,
      operateDataRightsRequest,
    } = await import('../lib/db/repositories/operations');
    const now = Date.now();
    const job = await createShippingJob(db, {
      orderId: 'order-1',
      sellerId: 'seller-1',
      actorId: 'seller-user-1',
      direction: 'outbound',
      note: 'Private shipping detail',
      requestId: 'audit-ship-create',
      now,
    });
    await operateShippingJob(db, {
      jobId: job,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'record_label',
      note: 'Private label details',
      labelReference: 'private-label',
      requestId: 'audit-ship-update',
      now: now + 1,
    });
    const privacy = await createDataRightsRequest(db, {
      customerId: 'admin-1',
      requestType: 'access',
      detail: 'Private customer identity details for access.',
      requestId: 'audit-privacy-create',
      now,
    });
    await operateDataRightsRequest(db, {
      id: privacy,
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'assign',
      note: 'Private support details',
      requestId: 'audit-privacy-update',
      now: now + 1,
    });
    const audit = (
      await db
        .prepare(
          "SELECT action,actor_id,reason,previous_json,next_json FROM audit_logs WHERE request_id LIKE 'audit-%:audit'",
        )
        .all()
    ).results;
    assert.equal(audit.length, 4);
    assert.equal(JSON.stringify(audit).includes('Private'), false);
    assert.equal(JSON.stringify(audit).includes('private-label'), false);
    await db
      .prepare(
        "CREATE TRIGGER reject_privacy_audit BEFORE INSERT ON audit_logs WHEN NEW.action='privacy.request_information' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END",
      )
      .run();
    await assert.rejects(() =>
      operateDataRightsRequest(db, {
        id: privacy,
        actorId: 'admin-1',
        actorRole: 'admin',
        action: 'request_information',
        note: 'Need more details here',
        requestId: 'audit-privacy-fail',
        now: now + 2,
      }),
    );
    assert.equal(
      (
        await db
          .prepare('SELECT status FROM data_rights_requests WHERE id=?')
          .bind(privacy)
          .first<{ status: string }>()
      )?.status,
      'assigned',
    );
    assert.equal(
      await db
        .prepare(
          "SELECT id FROM data_rights_events WHERE operation_request_id='audit-privacy-fail'",
        )
        .first(),
      null,
    );
  } finally {
    await fixture.dispose();
  }
});

void test('manual email trace distinguishes attempted, pending, finished and thrown failure without raw mail data', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const { auditManualOrderEmailProcessing } =
      await import('../lib/operations/manual-email-audit');
    let calls = 0;
    await auditManualOrderEmailProcessing(
      db,
      'admin-1',
      async () => {
        calls++;
        return { sent: 1, failed: 0 };
      },
      'fake-success',
    );
    await auditManualOrderEmailProcessing(
      db,
      'admin-1',
      async () => ({ sent: 0, failed: 0, pending: true }),
      'fake-pending',
    );
    await auditManualOrderEmailProcessing(
      db,
      'admin-1',
      async () => ({ sent: 0, failed: 1 }),
      'fake-partial',
    );
    await assert.rejects(() =>
      auditManualOrderEmailProcessing(
        db,
        'admin-1',
        async () => {
          throw Error('secret@example.test provider details');
        },
        'fake-failure',
      ),
    );
    const rows = (
      await db
        .prepare(
          "SELECT action,actor_id,reason,next_json,request_id FROM audit_logs WHERE action LIKE 'order.email.processing.%'",
        )
        .all()
    ).results;
    assert.equal(calls, 1);
    assert.equal(rows.length, 8);
    assert.equal(JSON.stringify(rows).includes('secret@'), false);
    assert.equal(
      rows.filter((r) => r.action === 'order.email.processing.attempted')
        .length,
      4,
    );
    for (const suffix of [
      'finished',
      'pending',
      'finished_with_failures',
      'failed',
    ])
      assert.ok(
        rows.some((r) => r.action === 'order.email.processing.' + suffix),
      );
    await db
      .prepare(
        "CREATE TRIGGER reject_email_attempt BEFORE INSERT ON audit_logs WHEN NEW.action='order.email.processing.attempted' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END",
      )
      .run();
    await assert.rejects(() =>
      auditManualOrderEmailProcessing(
        db,
        'admin-1',
        async () => {
          calls++;
          return { sent: 0, failed: 0 };
        },
        'fake-blocked',
      ),
    );
    assert.equal(calls, 1);
  } finally {
    await fixture.dispose();
  }
});

void test('business manual email trace exists before fake processor completes and survives outcome audit failure', async () => {
  const fixture = await databaseFixture();
  const db = fixture.database as unknown as D1Database;
  try {
    const { auditManualOrderEmailProcessing } =
      await import('../lib/operations/manual-email-audit');
    let calls = 0;
    await assert.rejects(
      () =>
        auditManualOrderEmailProcessing(
          db,
          'admin-1',
          async () => {
            calls++;
            const row = await db
              .prepare(
                "SELECT actor_id AS actor FROM audit_logs WHERE action='business.email.processing.attempted' AND request_id='fake-business:attempted'",
              )
              .first<{ actor: string }>();
            assert.equal(row?.actor, 'admin-1');
            await db
              .prepare(
                "CREATE TRIGGER reject_business_outcome BEFORE INSERT ON audit_logs WHEN NEW.action='business.email.processing.finished' BEGIN SELECT RAISE(ABORT,'synthetic outcome write failure'); END",
              )
              .run();
            return { sent: 1, failed: 0 };
          },
          'fake-business',
          Date.now,
          'business',
        ),
      /synthetic outcome write failure/,
    );
    assert.equal(calls, 1);
    assert.equal(
      (
        await db
          .prepare("SELECT action FROM audit_logs WHERE subject_id='business'")
          .all()
      ).results.length,
      1,
    );
  } finally {
    await fixture.dispose();
  }
});
import {
  cancellationPreview,
  cancelSelectedParcels,
  rejectCancellationReview,
} from '../lib/cancellation/repository';
async function cancellationFixture() {
  const f = await parcelFixture(),
    db = f.db;
  await db
    .prepare(
      "INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES ('customer-1','customer-1','cancel@example.test','Synthetic customer','en-NP','active',1,1)",
    )
    .run();
  await db
    .prepare(
      "UPDATE order_items SET line_total_paisa=100000,unit_price_paisa=100000,made_to_order_snapshot=0 WHERE order_id='order-1'",
    )
    .run();
  await db
    .prepare(
      "UPDATE orders SET item_subtotal_paisa=200000,grand_total_paisa=200000,wallet_credit_paisa=10000,referral_discount_paisa=5000,customer_id='customer-1' WHERE id='order-1'",
    )
    .run();
  await db
    .prepare(
      "INSERT OR IGNORE INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES ('customer-1','SYN-CANCEL',0,1)",
    )
    .run();
  await db
    .prepare(
      "UPDATE shipping_parcels SET cod_due_paisa=100000 WHERE shipping_job_id IN (SELECT id FROM shipping_jobs WHERE order_id='order-1')",
    )
    .run();
  const row = await db
    .prepare("SELECT order_number AS number FROM orders WHERE id='order-1'")
    .first<{ number: string }>();
  return {
    ...f,
    access: { orderNumber: row!.number, customerId: 'customer-1' },
    sellerIds: (await listParcels(db, 'order-1')).map((p) => p.sellerId),
  };
}
void test('R018 approved partial then full cancellation restores credit once and preserves original amounts', async () => {
  const f = await cancellationFixture();
  try {
    const { db, access, sellerIds } = f,
      p = await cancellationPreview(db, access, [sellerIds[0]]);
    assert.equal(p.next.total, 107500);
    assert.equal(p.walletRestored, 5000);
    const o = {
      sellerIds: [sellerIds[0]],
      fingerprint: p.fingerprint,
      requestId: 'partial-test',
      note: 'Customer changes one seller parcel.',
      now: Date.now(),
    };
    await cancelSelectedParcels(db, access, o);
    await cancelSelectedParcels(db, access, o);
    assert.equal(
      (await db
        .prepare(
          "SELECT balance_paisa AS n FROM wallet_accounts WHERE user_id='customer-1'",
        )
        .first<{ n: number }>())!.n,
      5000,
    );
    const order = await db
      .prepare(
        "SELECT grand_total_paisa AS original,current_total_paisa AS current FROM orders WHERE id='order-1'",
      )
      .first<{ original: number; current: number }>();
    assert.deepEqual({ ...order }, { original: 200000, current: 107500 });
    const q = await cancellationPreview(db, access, [sellerIds[1]]);
    await cancelSelectedParcels(db, access, {
      ...o,
      sellerIds: [sellerIds[1]],
      fingerprint: q.fingerprint,
      requestId: 'last-test',
    });
    assert.equal(
      (await db
        .prepare(
          "SELECT balance_paisa AS n FROM wallet_accounts WHERE user_id='customer-1'",
        )
        .first<{ n: number }>())!.n,
      10000,
    );
    assert.equal(
      (await db
        .prepare(
          "SELECT current_total_paisa AS n FROM orders WHERE id='order-1'",
        )
        .first<{ n: number }>())!.n,
      0,
    );
    await assert.rejects(() =>
      db.prepare("UPDATE order_cancellation_events SET note='rewrite'").run(),
    );
  } finally {
    await f.dispose();
  }
});
void test('R017/R018 future multi-store order recalculates delivery from remaining stores', async () => {
  const f = await cancellationFixture();
  try {
    const { db, access, sellerIds } = f;
    const snapshot = {
      version: 'initial-150-180-250',
      district: 'Kathmandu',
      band: 'valley',
      zone: 'valley',
      pricingPolicy: 'base_plus_half_per_additional_store_v1',
      baseChargePaisa: 15000,
      storeCount: 2,
      chargePaisa: 22500,
    };
    await db
      .prepare(
        "UPDATE orders SET delivery_charge_paisa=22500,grand_total_paisa=207500,delivery_rate_snapshot_json=? WHERE id='order-1'",
      )
      .bind(JSON.stringify(snapshot))
      .run();
    const p = await cancellationPreview(db, access, [sellerIds[0]]);
    assert.equal(p.previous.delivery, 22500);
    assert.equal(p.next.delivery, 15000);
    assert.equal(p.next.total, 107500);
    await cancelSelectedParcels(db, access, {
      sellerIds: [sellerIds[0]],
      fingerprint: p.fingerprint,
      requestId: 'new-policy-partial',
      note: 'Cancel one future-policy seller parcel.',
      now: Date.now(),
    });
    const order = await db
      .prepare(
        "SELECT delivery_charge_paisa AS original,current_delivery_paisa AS current,delivery_rate_snapshot_json AS snapshot FROM orders WHERE id='order-1'",
      )
      .first<{ original: number; current: number; snapshot: string }>();
    assert.equal(order?.original, 22500);
    assert.equal(order?.current, 15000);
    assert.deepEqual(JSON.parse(order!.snapshot), snapshot);
  } finally {
    await f.dispose();
  }
});
void test('R018 packing ordinary items is cancellable but readiness and changed preview reject without restoring stock', async () => {
  const f = await cancellationFixture();
  try {
    const { db, access, sellerIds } = f;
    await db
      .prepare(
        "UPDATE order_items SET fulfillment_status='packing' WHERE order_id='order-1'",
      )
      .run();
    const p = await cancellationPreview(db, access, [sellerIds[0]]);
    assert.equal(p.reviewRequired, false);
    await db
      .prepare(
        "UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id='order-1' AND seller_id=?",
      )
      .bind(sellerIds[0])
      .run();
    await assert.rejects(() =>
      cancelSelectedParcels(db, access, {
        sellerIds: [sellerIds[0]],
        fingerprint: p.fingerprint,
        requestId: 'ready-race',
        note: 'Readiness wins this race.',
        now: Date.now(),
      }),
    );
    assert.equal(
      await db.prepare('SELECT id FROM order_cancellation_events').first(),
      null,
    );
  } finally {
    await f.dispose();
  }
});
void test('R018 custom production requires explicit staff review and rejecting changes no money', async () => {
  const f = await cancellationFixture();
  try {
    const { db, access, sellerIds } = f;
    await db
      .prepare(
        "UPDATE order_items SET fulfillment_status='packing',made_to_order_snapshot=1 WHERE order_id='order-1'",
      )
      .run();
    const p = await cancellationPreview(db, access, [sellerIds[0]]);
    assert.equal(p.reviewRequired, true);
    const result = await cancelSelectedParcels(db, access, {
      sellerIds: [sellerIds[0]],
      fingerprint: p.fingerprint,
      requestId: 'custom-review',
      note: 'Please review the custom production.',
      now: Date.now(),
    });
    assert.equal(result.status, 'review_requested');
    assert.equal(
      await db.prepare('SELECT id FROM order_cancellation_events').first(),
      null,
    );
    await assert.rejects(() =>
      rejectCancellationReview(db, {
        id: result.id,
        actorId: 'customer-1',
        note: 'Unauthorized review rejected.',
        now: Date.now(),
      }),
    );
    await rejectCancellationReview(db, {
      id: result.id,
      actorId: 'admin-1',
      note: 'Production cannot be cancelled as requested.',
      now: Date.now(),
    });
    assert.equal(
      (await db
        .prepare(
          "SELECT balance_paisa AS n FROM wallet_accounts WHERE user_id='customer-1'",
        )
        .first<{ n: number }>())!.n,
      0,
    );
  } finally {
    await f.dispose();
  }
});
void test('R018 receipt ownership, concurrent confirmations and stale parcel amounts fail closed', async () => {
  const f = await cancellationFixture();
  try {
    const { db, access, sellerIds } = f;
    await assert.rejects(() =>
      cancellationPreview(db, { ...access, customerId: 'unrelated' }, [
        sellerIds[0],
      ]),
    );
    const p = await cancellationPreview(db, access, [sellerIds[0]]);
    const o = {
      sellerIds: [sellerIds[0]],
      fingerprint: p.fingerprint,
      note: 'Concurrent customer cancellation.',
      now: Date.now(),
    };
    const results = await Promise.allSettled([
      cancelSelectedParcels(db, access, { ...o, requestId: 'race-one' }),
      cancelSelectedParcels(db, access, { ...o, requestId: 'race-two' }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (await db
        .prepare('SELECT COUNT(*) AS n FROM order_cancellation_events')
        .first<{ n: number }>())!.n,
      1,
    );
  } finally {
    await f.dispose();
  }
});
void test('R018 later return allocates only remaining wallet credit and referral discount', async () => {
  const f = await cancellationFixture();
  try {
    const p = await cancellationPreview(f.db, f.access, [f.sellerIds[0]]);
    await cancelSelectedParcels(f.db, f.access, {
      sellerIds: [f.sellerIds[0]],
      fingerprint: p.fingerprint,
      requestId: 'refund-baseline',
      note: 'Cancel one parcel before later aftercare.',
      now: Date.now(),
    });
    const { splitCreditRefund } = await import('../lib/db/repositories/wallet');
    const split = await splitCreditRefund(f.db, 'order-1', 100000);
    assert.equal(split.walletPaisa, 5000);
    assert.equal(split.discountPaisa, 2500);
    assert.equal(split.basePaisa, 0);
  } finally {
    await f.dispose();
  }
});
void test('R018 staff approval records the reviewed custom cancellation and immutable decision', async () => {
  const f = await cancellationFixture();
  try {
    await f.db
      .prepare(
        "UPDATE order_items SET fulfillment_status='packing',made_to_order_snapshot=1 WHERE order_id='order-1'",
      )
      .run();
    const p = await cancellationPreview(f.db, f.access, [f.sellerIds[0]]);
    await cancelSelectedParcels(f.db, f.access, {
      sellerIds: [f.sellerIds[0]],
      fingerprint: p.fingerprint,
      requestId: 'approval-review',
      note: 'Review requested before custom cancellation.',
      now: Date.now(),
    });
    const access = { orderNumber: f.access.orderNumber, actorId: 'admin-1' },
      q = await cancellationPreview(f.db, access, [f.sellerIds[0]]);
    await cancelSelectedParcels(f.db, access, {
      sellerIds: [f.sellerIds[0]],
      fingerprint: q.fingerprint,
      requestId: 'approval-confirm',
      reviewId: 'approval-review',
      note: 'Production reviewed and cancellation approved.',
      now: Date.now(),
    });
    assert.equal(
      (await f.db
        .prepare(
          "SELECT status FROM order_cancellation_reviews WHERE id='approval-review'",
        )
        .first<{ status: string }>())!.status,
      'approved',
    );
    await assert.rejects(() =>
      f.db
        .prepare(
          "UPDATE order_cancellation_reviews SET review_note='Rewrite decision'",
        )
        .run(),
    );
    assert.equal(
      (await f.db
        .prepare(
          "SELECT balance_paisa AS n FROM wallet_accounts WHERE user_id='customer-1'",
        )
        .first<{ n: number }>())!.n,
      5000,
    );
  } finally {
    await f.dispose();
  }
});
void test('R018 parcels prepared after cancellation keep its exact approved COD allocation', async () => {
  const f = await cancellationFixture();
  try {
    await f.db
      .prepare(
        "DELETE FROM shipping_parcels WHERE shipping_job_id IN (SELECT id FROM shipping_jobs WHERE order_id='order-1')",
      )
      .run();
    const p = await cancellationPreview(f.db, f.access, [f.sellerIds[0]]);
    await cancelSelectedParcels(f.db, f.access, {
      sellerIds: [f.sellerIds[0]],
      fingerprint: p.fingerprint,
      requestId: 'before-parcels',
      note: 'Cancellation before operational parcel preparation.',
      now: Date.now(),
    });
    await prepareSellerParcels(f.db, {
      orderId: 'order-1',
      actorId: 'admin-1',
      requestId: 'prepare-after-cancel',
      now: Date.now(),
    });
    const parcels = await listParcels(f.db, 'order-1');
    assert.equal(parcels.length, 1);
    assert.equal(parcels[0].codDuePaisa, 107500);
  } finally {
    await f.dispose();
  }
});

void test('customer cancellation retains submitted authorization when ownership changes after the wrapper read', async () => {
  const f = await cancellationFixture();
  try {
    const db = f.db;
    const receipt = await db
      .prepare(
        "SELECT receipt_token_hash AS hash FROM orders WHERE id='order-1'",
      )
      .first<{ hash: string }>();
    const prepare = db.prepare.bind(db);
    let changed = false;
    db.prepare = ((sql: string) => {
      if (
        !changed &&
        sql.includes('SELECT order_number AS number FROM orders WHERE id=?')
      ) {
        changed = true;
        return {
          bind: (...args: unknown[]) => ({
            first: async () => {
              await prepare(
                "UPDATE orders SET receipt_token_hash='synthetic-rotated' WHERE id='order-1'",
              ).run();
              return prepare(sql)
                .bind(...args)
                .first();
            },
          }),
        };
      }
      return prepare(sql);
    }) as typeof db.prepare;
    const { cancelCustomerOrder } =
      await import('../lib/db/repositories/fulfillment');
    await assert.rejects(() =>
      cancelCustomerOrder(db, {
        orderNumber: f.access.orderNumber,
        receiptTokenHash: receipt!.hash,
        note: 'Synthetic ownership race.',
        requestId: 'auth-race',
        now: Date.now(),
      }),
    );
    assert.equal(
      (
        await prepare(
          "SELECT cancellation_version AS version FROM orders WHERE id='order-1'",
        ).first<{ version: number }>()
      )?.version,
      0,
    );
  } finally {
    await f.dispose();
  }
});
