import assert from 'node:assert/strict';
import test from 'node:test';
import { manualOrderFixture } from './helpers/manual-payment-fixture';
import { isSellerOrderTurn, readSellerOrderQueue } from '../app/seller/orders/order-queue';
import { activeAdminSection, adminSections } from '../components/admin/admin-sections';
import { readBankTransferQueue, readBankTransferWorkCount } from '../lib/payments/bank-transfer-queue';
import { readIncomingCommandOutcome } from '../lib/payments/incoming-command-outcomes';
import { incomingReference } from '../lib/payments/incoming-outcome-contract';
import { preparePaidManualRelease } from '../lib/payments/manual-payment-lifecycle';
import { processManualPaymentWindows } from '../lib/payments/payment-maintenance';
import { allocateBankReceipt, closeExpiredBankOrder, recordBankReceipt, releasePaidManualOrder, submitPaymentClaim } from '../lib/payments/manual-receipts';

type Fixture = Awaited<ReturnType<typeof manualOrderFixture>>;
const command = (requestId: string, expectedRevision: string | null, now = Date.now()) =>
  ({ actorId: 'reviewer', requestId, expectedRevision, now });
const record = (fixture: Fixture, amount: number, requestId: string) => recordBankReceipt(
  fixture.db, command(requestId, null), {
    accountVersionId: fixture.accountVersionId, transactionIdentity: requestId, bankAt: fixture.now,
    amountMinor: amount, currency: 'NPR', payerReference: 'Fictional payer confirmed in statement', payerUserId: 'customer',
    evidenceReference: 'FIXTURE-BANK-EVIDENCE-' + requestId, completedCreditConfirmed: true, conflictUserIds: [],
    reason: 'Verified the original fictional company bank entry for this order.',
  },
);

void test('Bank transfers follows Courier cash and keeps the receipt verification permission', () => {
  const sections = adminSections('super_admin');
  assert.deepEqual(sections.find(section => section.id === 'money')?.tabs.slice(0, 2).map(tab => tab.label), ['Courier cash', 'Bank transfers']);
  assert.equal(activeAdminSection(sections, '/admin/payments', new URLSearchParams('view=incoming'))?.tab.label, 'Bank transfers');
  assert.equal(activeAdminSection(sections, '/admin/payments/orders/saved-order')?.tab.label, 'Bank transfers');
  assert.equal(activeAdminSection(adminSections('admin', ['cod.view']), '/admin/payments')?.section.tabs.some(tab => tab.label === 'Bank transfers'), false);
});

void test('guided match leaves a paid order ready for one reviewed release and sends native release notices once', async () => {
  const f = await manualOrderFixture();
  try {
    assert.equal((await readBankTransferQueue(f.db, 'reviewer')).counts.waiting, 1);
    const claim = await submitPaymentClaim(f.db, { ...command('guided-claim', null), actorId: 'customer' }, {
      orderId: f.orderId, amountPaisa: f.order.grandTotalPaisa, paymentDate: new Date(f.now).toISOString().slice(0, 10),
      bankReference: 'FICT-CLAIM-REFERENCE', note: '', evidenceIds: [],
    });
    let queue = await readBankTransferQueue(f.db, 'reviewer');
    assert.equal(queue.orders[0].claim?.id, claim.id);
    assert.equal(queue.counts.check, 1);
    assert.equal(await readBankTransferWorkCount(f.db, 'reviewer'), 1);
    const bank = await record(f, f.order.grandTotalPaisa, 'guided-exact-credit');
    assert.deepEqual(await record(f, f.order.grandTotalPaisa, 'guided-exact-credit'), bank);
    const allocation = {
      receiptId: bank.id, orderId: f.orderId, amountPaisa: f.order.grandTotalPaisa, expectedWindowRevision: queue.orders[0].revision,
      matchingBasis: 'Fictional bank reference and the exact original customer were checked independently.',
      exceptionApproval: null, deferRelease: true as const,
    };
    const matched = await allocateBankReceipt(f.db, command('guided-allocation', '0'), allocation);
    assert.deepEqual(await allocateBankReceipt(f.db, command('guided-allocation', '0'), allocation), matched);
    await processManualPaymentWindows(f.db, 1, f.orderId);
    await f.db.batch(preparePaidManualRelease(f.db, f.orderId));
    queue = await readBankTransferQueue(f.db, 'reviewer');
    assert.equal(queue.counts.release, 1);
    assert.equal(queue.orders[0].releasedAt, null);
    assert.equal(queue.orders[0].releaseItemsReady, 1);
    assert.equal(f.sqlite.prepare('SELECT status FROM orders WHERE id=?').get(f.orderId)?.status, 'placed');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM order_response_milestones WHERE milestone='released'").get()?.count, 0);
    const sellerId = String(f.sqlite.prepare('SELECT seller_id FROM order_items WHERE order_id=?').get(f.orderId)?.seller_id);
    const sellerOrder = async () => (await readSellerOrderQueue(f.db, sellerId)).find(order => order.id === f.orderId)!;
    assert.equal(isSellerOrderTurn(await sellerOrder(), 'confirmed'), false);

    const release = { orderId: f.orderId, reason: 'Checked the verified funds, sale status, reservations and seller readiness.' };
    const revision = String(queue.orders[0].revision);
    f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='customer'").run();
    await assert.rejects(releasePaidManualOrder(f.db, command('guided-held-release', revision), release));
    assert.equal((await readBankTransferQueue(f.db, 'reviewer')).counts.problems, 1);
    f.sqlite.prepare("UPDATE users SET status='active' WHERE id='customer'").run();
    await releasePaidManualOrder(f.db, command('guided-review-release', revision), release);
    await releasePaidManualOrder(f.db, command('guided-review-release', revision), release);
    assert.equal((await readBankTransferQueue(f.db, 'reviewer')).counts.done, 1);
    assert.equal(await readBankTransferWorkCount(f.db, 'reviewer'), 0);
    assert.equal(isSellerOrderTurn(await sellerOrder(), 'confirmed'), true);
    assert.equal(f.sqlite.prepare('SELECT status FROM orders WHERE id=?').get(f.orderId)?.status, 'confirmed');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM order_response_milestones WHERE milestone='released'").get()?.count, 1);
    assert.equal(f.sqlite.prepare("SELECT reason FROM audit_logs WHERE request_id='guided-review-release'").get()?.reason, release.reason);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM notification_messages WHERE related_id=? AND template_key='business.payment.order' AND channel='email' AND audience_role='customer' AND subject_en LIKE '%Payment received%'").get(f.orderId)?.count, 1);
  } finally {
    f.dispose();
  }
});

void test('guided short credit leaves an unpaid order and an extra credit keeps its separate case', async () => {
  for (const difference of [-500, 500]) {
    const f = await manualOrderFixture();
    try {
      const due = f.order.grandTotalPaisa;
      const credited = due + difference;
      const bank = await record(f, credited, `guided-difference-${difference}`);
      await allocateBankReceipt(f.db, command(`guided-allocate-${difference}`, '0'), {
        receiptId: bank.id, orderId: f.orderId, amountPaisa: Math.min(due, credited), expectedWindowRevision: 0,
        matchingBasis: 'Independently verified the original order and precise company bank entry.', exceptionApproval: null, deferRelease: true,
      });
      const { counts, orders, unmatched } = await readBankTransferQueue(f.db, 'reviewer');
      assert.equal(counts.problems, 1);
      assert.equal(orders[0].releasedAt, null);
      assert.equal(orders[0].receivedPaisa, Math.min(due, credited));
      if (difference < 0) {
        assert.equal(orders[0].paidAt, null);
        assert.equal(unmatched.length, 0);
        assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders WHERE id=?').get(f.orderId)?.payment_status, 'unpaid');
      } else {
        assert.equal(counts.release, 1);
        assert.equal(unmatched[0].receiptId, bank.id);
        assert.equal(f.sqlite.prepare('SELECT amount_minor - (SELECT SUM(amount_minor) FROM manual_receipt_uses WHERE receipt_id=r.id) AS remaining FROM company_money_receipts r WHERE r.id=?').get(bank.id)?.remaining, difference);
      }
    } finally {
      f.dispose();
    }
  }
});

void test('expired unpaid closure uses its saved cutoff, releases stock and recovers the recorded staff outcome', async () => {
  const f = await manualOrderFixture();
  try {
    const cutoff = Number(f.sqlite.prepare('SELECT cutoff_at FROM manual_payment_cutoffs WHERE order_id=?').get(f.orderId)?.cutoff_at);
    let now = cutoff - 1;
    f.sqlite.function('strftime', { varargs: true }, format => {
      if (format === '%s') return String(Math.floor(now / 1000));
      if (format === '%f') return (now % 60_000 / 1000).toFixed(3).padStart(6, '0');
      throw new Error('Unsupported fixture clock format.');
    });
    const input = { orderId: f.orderId, reason: 'Checked the company bank statement through the saved cutoff. No payment arrived.' };
    await assert.rejects(closeExpiredBankOrder(f.db, command('guide-expiry-early', '0', now), input), /not expired/);
    now = cutoff;
    assert.equal((await readBankTransferQueue(f.db, 'reviewer')).counts.problems, 1);
    assert.deepEqual(await closeExpiredBankOrder(f.db, command('guided-expiry-reviewed', '0', now), input), { orderId: f.orderId });
    assert.deepEqual(await closeExpiredBankOrder(f.db, command('guided-expiry-reviewed', '0', now), input), { orderId: f.orderId });
    const reference = incomingReference('reviewer', 'close_expired', 'guided-expiry-reviewed', input);
    assert.deepEqual((await readIncomingCommandOutcome(f.db, 'reviewer', reference))?.entity, { kind: 'order', id: f.orderId });
    assert.deepEqual({ ...f.sqlite.prepare('SELECT status,current_total_paisa AS total FROM orders WHERE id=?').get(f.orderId) },
      { status: 'cancelled', total: 0 });
    assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()?.reserved, 0);
    assert.deepEqual({ ...f.sqlite.prepare("SELECT actor_id AS actorId,reason FROM audit_logs WHERE action='manual.payment.expired'").get() },
      { actorId: 'reviewer', reason: input.reason });
  } finally {
    f.dispose();
  }
});
