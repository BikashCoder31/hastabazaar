import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { addOfferCartLine } from '../lib/cart/offer-cart';
import { companyDetails } from '../lib/content/company-details';
import { accrueManagedEntitlements } from '../lib/db/repositories/managed-settlements';
import { createManualBankOrder } from '../lib/db/repositories/orders';
import { buildEarningsAccrualStatements } from '../lib/db/repositories/payouts';
import { publishCompanyReceivingAccount, saveCompanyAccountDraft, submitCompanyAccountForReview, verifyCompanyAccount } from '../lib/payments/company-accounts';
import { allocateBankReceipt, recordBankReceipt } from '../lib/payments/manual-receipts';
import { recordReceiptReversal } from '../lib/payments/receipt-corrections';
import { getPublicOfferSet } from '../lib/products/public-offers';
import { VARIANT_PRICING_RULE_VERSION } from '../lib/products/variant-pricing';
import { activatedLiveMakerFixture } from './helpers/activated-live-maker-fixture';
import { seedCheckoutBuyer } from './helpers/checkout-contact';
import { manualOrderFixture } from './helpers/manual-payment-fixture';

function context(requestId: string, expectedRevision: string | null = null) {
  return { actorId: 'reviewer', now: Date.now(), requestId, expectedRevision };
}

async function capture(f: { db: D1Database; orderId: string; order: { grandTotalPaisa: number }; accountVersionId: string }, buyerId: string) {
  const bankAt = Date.now();
  const receipt = await recordBankReceipt(f.db, context('deferred-bank-receipt'), {
    accountVersionId: f.accountVersionId, transactionIdentity: 'FICTIONAL-DEFERRED-BANK-CAPTURE',
    bankAt, amountMinor: f.order.grandTotalPaisa, currency: 'NPR',
    payerReference: 'Verified fictional payer', payerUserId: buyerId,
    evidenceReference: 'FICTIONAL-DEFERRED-ORIGINAL-BANK-CREDIT',
    completedCreditConfirmed: true, conflictUserIds: [],
    reason: 'Verify the original fictional checkout receipt before delivery.',
  });
  await allocateBankReceipt(f.db, context('deferred-bank-allocate', '0'), {
    receiptId: receipt.id, orderId: f.orderId, amountPaisa: f.order.grandTotalPaisa,
    expectedWindowRevision: 0, matchingBasis: 'Exact original payer and retained fictional checkout instructions.',
    exceptionApproval: null,
  });
  return receipt.id;
}

function recordDeferredRefundedDelivery(sqlite: DatabaseSync, orderId: string) {
  const window = sqlite.prepare('SELECT paid_at AS paidAt,released_at AS releasedAt FROM manual_payment_windows WHERE order_id=?').get(orderId);
  assert.ok(window?.paidAt && window.releasedAt);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM shipping_jobs WHERE order_id=?').get(orderId)?.n, 0);
  // Retain the exact payment statuses after a completed customer refund before initial seller accrual.
  sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE order_id=?").run(orderId);
  sqlite.prepare("UPDATE orders SET status='delivered',payment_status='refunded',delivered_at=? WHERE id=?").run(Date.now(), orderId);
  sqlite.prepare("UPDATE payments SET status='refunded' WHERE order_id=?").run(orderId);
}

function markOriginalPricing(sqlite: DatabaseSync, orderId: string) {
  assert.equal(sqlite.prepare(`UPDATE order_policy_acceptances
    SET terms_snapshot_json=json_set(terms_snapshot_json,'$.variantPricingRuleVersion',?) WHERE order_id=?`)
    .run(VARIANT_PRICING_RULE_VERSION, orderId).changes, 1);
}

void test('registered accrual retains a marked bank-paid sale after refund without a parcel', async () => {
  const f = await manualOrderFixture();
  try {
    await capture(f, 'customer');
    recordDeferredRefundedDelivery(f.sqlite, f.orderId);
    const accrue = () => f.db.batch(buildEarningsAccrualStatements(f.db, { orderId: f.orderId, now: Date.now() }));
    const ledger = () => f.sqlite.prepare('SELECT type,amount_paisa AS amount FROM seller_ledger_entries ORDER BY type').all().map(row => ({ ...row }));
    await accrue();
    assert.deepEqual(ledger(), []);

    markOriginalPricing(f.sqlite, f.orderId);
    await accrue();
    await accrue();
    const original = f.sqlite.prepare('SELECT line_total_paisa AS sale,commission_paisa AS commission FROM order_items WHERE order_id=?').get(f.orderId);
    assert.equal(original?.sale, 80000);
    assert.ok(Number(original?.commission) > 0);
    assert.deepEqual(ledger(), [{ type: 'commission', amount: -Number(original?.commission) }, { type: 'sale', amount: 80000 }]);
  } finally {
    f.dispose();
  }
});

void test('a bank reversal before the accrual batch invalidates original capture proof', async () => {
  const f = await manualOrderFixture();
  try {
    const receiptId = await capture(f, 'customer');
    recordDeferredRefundedDelivery(f.sqlite, f.orderId);
    markOriginalPricing(f.sqlite, f.orderId);
    const statements = buildEarningsAccrualStatements(f.db, { orderId: f.orderId, now: Date.now() });

    const bankAt = Date.now();
    await recordReceiptReversal(f.db, context('deferred-bank-reversal', '1'), {
      receiptId, amountMinor: 1, transactionIdentity: 'FICTIONAL-DEFERRED-BANK-REVERSAL', bankAt,
      evidenceReference: 'FICTIONAL-ORIGINAL-CAPTURE-PARTIAL-REVERSAL',
      reason: 'Verify a partial reversal of the original fictional payment before seller accrual.',
    });
    assert.equal(f.sqlite.prepare('SELECT status FROM company_money_receipts WHERE id=?').get(receiptId)?.status, 'verified');
    await f.db.batch(statements);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_ledger_entries').get()?.n, 0);
  } finally {
    f.dispose();
  }
});

void test('managed accrual retains the original contracted entitlement of a marked bank-paid refund without a parcel', async () => {
  const f = await activatedLiveMakerFixture('deferred-managed-bank');
  try {
    const draft = await saveCompanyAccountDraft(f.db, context('deferred-bank-draft'), {
      accountId: null, basedOnVersionId: null,
      details: { holder: companyDetails.legalName, bank: 'Fictional Bank', branch: 'Fictional Branch', accountNumber: 'TEST-DEFERRED-01', currency: 'NPR', purpose: 'both' },
      evidenceReference: 'FICTIONAL-DEFERRED-COMPANY-OWNERSHIP', conflictUserIds: [],
      reason: 'Record exact fictional company checkout account authority.',
    });
    await submitCompanyAccountForReview(f.db, context('deferred-bank-submit', '0'), { versionId: draft.versionId, reason: 'Submit this original fictional account for verification.' });
    await verifyCompanyAccount(f.db, context('deferred-bank-verify', '1'), { versionId: draft.versionId, ownershipConfirmed: true,
      currencyConfirmed: true, verificationReference: 'FICTIONAL-DEFERRED-BANK-CHECK', reason: 'Verify fictional account ownership and original currency.' });
    await publishCompanyReceivingAccount(f.db, context('deferred-bank-publish', '2'), { versionId: draft.versionId, expectedReceivingRevision: 0,
      reason: 'Publish the exact verified fictional checkout account.' });
    const buyerId = 'deferred-managed-buyer';
    const email = `${buyerId}@local.hastabazaar.test`;
    const phone = '9811111111';
    await seedCheckoutBuyer(f.db, buyerId, email, phone);
    const offer = await getPublicOfferSet(f.db, f.productId);
    assert.ok(offer?.orderable);
    const cartToken = 'deferred-managed-bank-cart';
    await addOfferCartLine(f.db, cartToken, { productId: f.productId, offerId: f.offerId, versionId: offer.versionId,
      publicVersionId: offer.publicVersionId, pricePaisa: 80000, quantity: 1, requestId: 'deferred-managed-cart' }, Date.now());
    const order = await createManualBankOrder(f.db, cartToken, 'deferred-managed-token', {
      customerAuthSubject: buyerId, customerEmail: email, customerPhone: phone, locale: 'en-NP', termsAccepted: true,
      idempotencyKey: 'deferred-managed-bank-checkout', address: { recipientName: 'Fictional buyer', phone, province: 'Bagmati',
        district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional delivery location' },
    }, Date.now(), buyerId);
    const row = f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber);
    assert.ok(row);
    const orderId = String(row.id);
    await capture({ db: f.db, orderId, order, accountVersionId: draft.versionId }, buyerId);
    recordDeferredRefundedDelivery(f.sqlite, orderId);
    const accrue = (requestId: string) => accrueManagedEntitlements(f.db, { ...context(requestId), orderId });
    assert.equal(await accrue('deferred-managed-unmarked'), 0);

    markOriginalPricing(f.sqlite, orderId);
    assert.equal(await accrue('deferred-managed-marked'), 1);
    assert.equal(await accrue('deferred-managed-retry'), 0);
    assert.deepEqual(f.sqlite.prepare('SELECT type,amount_paisa AS amount FROM managed_settlement_entries').all().map(entry => ({ ...entry })),
      [{ type: 'earned', amount: 69000 }]);
  } finally {
    f.dispose();
  }
});
