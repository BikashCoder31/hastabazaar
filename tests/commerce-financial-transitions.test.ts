import {commerceOrderFixture as fixture} from './helpers/commerce-order-fixture';

import assert from 'node:assert/strict';
import test from 'node:test';
import { historicalCommissionDatabase } from './helpers/commission-database';


import { operateParcel } from '../lib/operations/parcels';

import { createCustomerReturnRequest, reviewReturnAsAdmin } from '../lib/db/repositories/returns';
import { buildEarningsAccrualStatements } from '../lib/db/repositories/payouts';
import { cancellationPreview, cancelSelectedParcels } from '../lib/cancellation/repository';
import { refundRemittanceScenario, cancellationSettlementScenario, payFinancialTransitionRefund } from './helpers/financial-transition-scenarios';


async function refund(f: Awaited<ReturnType<typeof fixture>>, full: boolean) {
  const itemId = String(f.sqlite.prepare('SELECT id FROM order_items').get()!.id);
  const request = await createCustomerReturnRequest(f.database, {
    orderNumber: f.access.orderNumber, receiptTokenHash: 'receipt', customerId: 'checkout-buyer', orderItemId: itemId,
    quantity: 1, reason: 'defective', requestedResolution: 'refund', detail: 'Fictional product has a documented defect.',
    locale: 'en-NP', idempotencyKey: 'return', evidence: [], now: 120,
  });
  await reviewReturnAsAdmin(f.database, { returnRequestId: request.id, actorId: 'owner', actorRole: 'super_admin', action: 'approve',
    note: 'Fictional merchandise refund approved', publicMessageEn: 'Refund approved.', publicMessageNe: 'Refund approved.',
    responsibility: 'seller', outcome: 'refund', itemRefundPaisa: full ? 100000 : 50000, deliveryRefundPaisa: 15000,
    requestId: 'refund-approve', now: 121 });
  return payFinancialTransitionRefund(f.database, { caseId: request.id, actorId: 'owner', customerId: 'checkout-buyer', full });
}

for (const full of [false, true]) for (const beforeRemittance of [true, false]) {
  void test(`${full ? 'full' : 'partial'} refund ${beforeRemittance ? 'before' : 'after'} remittance preserves original earnings and one commission reversal`, async () => {
    const f = await fixture();
    try {
      await f.deliver();
      await f.operate('collect', { amountPaisa: 115000, reference: 'LOCAL-COLLECT' });
      const originalAllocation = f.sqlite.prepare('SELECT * FROM order_delivery_allocations').all();
      assert.equal(originalAllocation.length, 1);
      assert.equal(originalAllocation[0].amount_paisa, 15000);
      if (!beforeRemittance) await f.confirmRemittance({ amountPaisa: 115000, reference: 'LOCAL-REMIT', now: 119 });
      assert.equal(f.sqlite.prepare('SELECT remitted_paisa FROM shipping_parcels').get()!.remitted_paisa, beforeRemittance ? 0 : 115000);
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='sale'").get()!.n, beforeRemittance ? 0 : 1);
      const replay = await refund(f, full);
      if (beforeRemittance) {
        assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='sale'").get()!.n, 0);
        const remit = await f.confirmRemittance({ amountPaisa: 115000, reference: 'LOCAL-REMIT', now: 124 });
        await operateParcel(f.database, remit);
      }
      await replay();
      assert.deepEqual(f.sqlite.prepare('SELECT * FROM order_delivery_allocations').all(), originalAllocation);
      for (let n = 0; n < 2; n++) await f.database.batch(buildEarningsAccrualStatements(f.database, { orderId: f.orderId, now: 125 + n }));
      assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders').get()!.payment_status, full ? 'refunded' : 'part_refunded');
      const ledger = f.sqlite.prepare('SELECT type,COUNT(*) n,SUM(amount_paisa) amount FROM seller_ledger_entries GROUP BY type').all();
      const entry = (type: string) => ledger.find(row => row.type === type);
      assert.deepEqual({ n: entry('sale')?.n, amount: entry('sale')?.amount }, { n: 1, amount: 100000 });
      assert.deepEqual({ n: entry('commission')?.n, amount: entry('commission')?.amount }, { n: 1, amount: -9000 });
      assert.deepEqual({ n: entry('commission_reversal')?.n, amount: entry('commission_reversal')?.amount }, { n: 1, amount: full ? 9000 : 4500 });
      assert.deepEqual({ n: entry('refund')?.n, amount: entry('refund')?.amount }, { n: 1, amount: full ? -115000 : -65000 });
      assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').get()!.n, full ? -15000 : 30500);
      assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { await f.dispose(); }
  });
}

void test('refund state alone cannot accrue earnings without captured payment and collected cash', async () => {
  const f = await fixture();
  try {
    await f.deliver();
    f.sqlite.prepare("UPDATE orders SET payment_status='part_refunded'").run();
    await f.database.batch(buildEarningsAccrualStatements(f.database, { orderId: f.orderId, now: 125 }));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n, 0);
  } finally { await f.dispose(); }
});

for (const remitted of [false, true]) void test(`cancelling the last pending seller captures remaining collected COD${remitted ? ' and accrues remitted earnings' : ' while holding unremitted earnings'}`, async () => {
  const f = await fixture(true);
  try {
    await f.deliver();
    await f.operate('collect', { amountPaisa: 32000, reference: 'LOCAL-COLLECT' });
    if (remitted) await f.confirmRemittance({ amountPaisa: 32000, reference: 'LOCAL-REMIT' });
    const preview = await cancellationPreview(f.database, f.access, ['seller-b']);
    assert.equal(preview.next.total, 32000);
    const input = { sellerIds: ['seller-b'], fingerprint: preview.fingerprint, requestId: 'cancel-b', note: 'Cancel pending fictional seller B parcel', now: 120 };
    await cancelSelectedParcels(f.database, f.access, input);
    await cancelSelectedParcels(f.database, f.access, input);
    assert.deepEqual({ ...f.sqlite.prepare('SELECT status,payment_status FROM orders').get() }, { status: 'delivered', payment_status: 'paid' });
    assert.deepEqual({ ...f.sqlite.prepare('SELECT status,amount_paisa FROM payments').get() }, { status: 'captured', amount_paisa: 32000 });
    const receipts = f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE kind='payment_receipt'").all();
    assert.equal(receipts.length, 1);
    const receipt = JSON.parse(String(receipts[0].snapshot_json));
    assert.equal(receipt.grandTotalPaisa, 32000); assert.equal(receipt.items.length, 1);
    assert.equal(receipt.items[0].sellerId, 'seller-a'); assert.equal(receipt.itemSubtotalPaisa, 16000);
    assert.equal(receipt.deliveryChargePaisa, 15000); assert.equal(receipt.buyerPlatformFeePaisa, 1000);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='sale'").get()!.n, remitted ? 1 : 0);
    if (!remitted) await f.confirmRemittance({ amountPaisa: 32000, reference: 'LOCAL-REMIT', now: 121 });
    await f.database.batch(buildEarningsAccrualStatements(f.database, { orderId: f.orderId, now: 122 }));
    assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE type='sale'").get()!.n, 16000);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_documents WHERE kind='payment_receipt'").get()!.n, 1);
  } finally { await f.dispose(); }
});

void test('partial cancellation does not mark uncollected delivery paid', async () => {
  const f = await fixture(true);
  try {
    await f.deliver();
    const preview = await cancellationPreview(f.database, f.access, ['seller-b']);
    await cancelSelectedParcels(f.database, f.access, { sellerIds: ['seller-b'], fingerprint: preview.fingerprint, requestId: 'cancel-b', note: 'Cancel pending fictional seller B parcel', now: 120 });
    assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders').get()!.payment_status, 'pending');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_documents WHERE kind='payment_receipt'").get()!.n, 0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n, 0);
  } finally { await f.dispose(); }
});

void test('wallet-funded cancellation captures only remaining cash and preserves one receipt, refund and sale on replay', async () => {
  const f = await fixture(true, 5000);
  try {
    assert.equal(f.sqlite.prepare('SELECT wallet_credit_paisa FROM orders').get()!.wallet_credit_paisa, 5000);
    await f.deliver();
    await f.operate('collect', { amountPaisa: 28596, reference: 'LOCAL-COLLECT' });
    await f.confirmRemittance({ amountPaisa: 28596, reference: 'LOCAL-REMIT' });
    const preview = await cancellationPreview(f.database, f.access, ['seller-b']);
    assert.equal(preview.next.total, 28596); assert.equal(preview.next.wallet, 3404); assert.equal(preview.walletRestored, 1596);
    const input = { sellerIds: ['seller-b'], fingerprint: preview.fingerprint, requestId: 'cancel-wallet-b', note: 'Cancel pending wallet-funded parcel', now: 120 };
    await cancelSelectedParcels(f.database, f.access, input);
    await cancelSelectedParcels(f.database, f.access, input);
    await f.database.batch(buildEarningsAccrualStatements(f.database, { orderId: f.orderId, now: 122 }));
    assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders').get()!.payment_status, 'paid');
    assert.deepEqual({ ...f.sqlite.prepare('SELECT status,amount_paisa FROM payments').get() }, { status: 'captured', amount_paisa: 28596 });
    const receipts = f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE kind='payment_receipt'").all();
    assert.equal(receipts.length, 1);
    const receipt = JSON.parse(String(receipts[0].snapshot_json));
    assert.equal(receipt.walletCreditPaisa, 3404); assert.equal(receipt.grandTotalPaisa, 28596);
    assert.equal(receipt.itemSubtotalPaisa + receipt.deliveryChargePaisa + receipt.buyerPlatformFeePaisa - receipt.walletCreditPaisa, receipt.grandTotalPaisa);
    assert.equal(receipt.items.length, 1); assert.equal(receipt.items[0].sellerId, 'seller-a');
    assert.equal(f.sqlite.prepare('SELECT balance_paisa FROM wallet_accounts').get()!.balance_paisa, 1596);
    assert.deepEqual({ ...f.sqlite.prepare("SELECT COUNT(*) n,SUM(amount_paisa) amount FROM wallet_entries WHERE kind='cancellation'").get() }, { n: 1, amount: 1596 });
    assert.deepEqual({ ...f.sqlite.prepare("SELECT COUNT(*) n,SUM(amount_paisa) amount FROM seller_ledger_entries WHERE type='sale'").get() }, { n: 1, amount: 16000 });
  } finally { await f.dispose(); }
});

void test('full unpaid cancellation never issues a payment receipt or accrues earnings', async () => {
  const f = await fixture(true);
  try {
    const selected = ['seller-a', 'seller-b'];
    const preview = await cancellationPreview(f.database, f.access, selected);
    const input = { sellerIds: selected, fingerprint: preview.fingerprint, requestId: 'cancel-all', note: 'Cancel both unpaid fictional parcels', now: 120 };
    await cancelSelectedParcels(f.database, f.access, input);
    await cancelSelectedParcels(f.database, f.access, input);
    assert.deepEqual({ ...f.sqlite.prepare('SELECT status,payment_status FROM orders').get() }, { status: 'cancelled', payment_status: 'cancelled' });
    assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM payments').get()!.amount_paisa, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_documents WHERE kind='payment_receipt'").get()!.n, 0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n, 0);
  } finally { await f.dispose(); }
});

void test('receipt failure rolls back cancellation, capture and registered earnings together', async () => {
  const f = await fixture(true);
  try {
    await f.deliver();
    await f.operate('collect', { amountPaisa: 32000, reference: 'LOCAL-COLLECT' });
    await f.confirmRemittance({ amountPaisa: 32000, reference: 'LOCAL-REMIT' });
    const preview = await cancellationPreview(f.database, f.access, ['seller-b']);
    f.sqlite.exec(`CREATE TRIGGER fail_fixture_receipt BEFORE INSERT ON order_documents WHEN NEW.kind='payment_receipt'
      BEGIN SELECT RAISE(ABORT,'fixture receipt failure'); END;`);
    const input = { sellerIds: ['seller-b'], fingerprint: preview.fingerprint, requestId: 'cancel-b', note: 'Cancel pending fictional seller B parcel', now: 120 };
    await assert.rejects(cancelSelectedParcels(f.database, f.access, input));
    assert.deepEqual({ ...f.sqlite.prepare('SELECT status,payment_status,cancellation_version FROM orders').get() },
      { status: 'dispatched', payment_status: 'pending', cancellation_version: 0 });
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_cancellation_events').get()!.n, 0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n, 0);
    f.sqlite.exec('DROP TRIGGER fail_fixture_receipt');
    await cancelSelectedParcels(f.database, f.access, input);
    assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders').get()!.payment_status, 'paid');
  } finally { await f.dispose(); }
});

void test('cancellation retry resumes managed accrual after its payment transaction committed', async () => {
  const f = await fixture(true);
  try {
    const itemId = String(f.sqlite.prepare("SELECT id FROM order_items WHERE seller_id='seller-a'").get()!.id);
    f.sqlite.prepare("UPDATE order_items SET commission_paisa=0,commission_bps=0,commission_rule_version='managed-sale-linked' WHERE id=?").run(itemId);
    f.sqlite.prepare(`INSERT INTO managed_commercial_snapshots(id,order_item_id,seller_id,participation_route,commercial_model,
      legal_seller_reference,invoice_issuer_reference,payout_beneficiary_reference,agreement_version,agreement_language,
      delivery_hold_days,product_value_paisa,eligible_base_paisa,platform_retention_bps,platform_retained_paisa,
      maker_entitlement_paisa,simulation_label,created_at)
      VALUES ('managed-snapshot',?,'seller-a','managed_maker','managed_sale_linked_percentage_v1','SIM-LEGAL','SIM-INVOICE','SIM-PAYOUT',
        'SIM-AGREEMENT','en',7,16000,16000,900,1440,14560,'SIMULATED - NOT VALID FOR PRODUCTION',100)`).run(itemId);
    f.sqlite.exec(`INSERT INTO managed_entitlements(id,snapshot_id,seller_id,status,calculated_paisa,created_at,updated_at)
      VALUES ('entitlement','managed-snapshot','seller-a','calculated',14560,100,100);`);
    await f.deliver();
    await f.operate('collect', { amountPaisa: 32000, reference: 'LOCAL-COLLECT' });
    const preview = await cancellationPreview(f.database, f.access, ['seller-b']);
    const input = { sellerIds: ['seller-b'], fingerprint: preview.fingerprint, requestId: 'cancel-b', note: 'Cancel pending fictional seller B parcel', now: 120 };
    const prepare = f.database.prepare.bind(f.database);
    let interrupt = true;
    f.database.prepare = ((sql: string) => {
      if (interrupt && sql.includes('INSERT INTO managed_settlement_entries')) {
        interrupt = false;
        throw new Error('Fixture transient managed accrual failure');
      }
      return prepare(sql);
    }) as D1Database['prepare'];
    await assert.rejects(cancelSelectedParcels(f.database, f.access, input), /Fixture transient/);
    assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders').get()!.payment_status, 'paid');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_documents WHERE kind='payment_receipt'").get()!.n, 1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n, 0);
    await cancelSelectedParcels(f.database, f.access, input);
    await cancelSelectedParcels(f.database, f.access, input);
    assert.deepEqual(f.sqlite.prepare("SELECT type,amount_paisa FROM managed_settlement_entries").all().map(row => ({ ...row })),
      [{ type: 'earned', amount_paisa: 14560 }]);
    assert.equal(f.sqlite.prepare('SELECT status FROM managed_entitlements').get()!.status, 'held');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_documents WHERE kind='payment_receipt'").get()!.n, 1);
  } finally { await f.dispose(); }
});

void test('disposable native financial scenarios also satisfy the full SQLite schema', async () => {
  const f = await historicalCommissionDatabase(true);
  try {
    for (const full of [false, true]) for (const beforeRemittance of [true, false]) {
      await refundRemittanceScenario(f.database, full, beforeRemittance);
    }
    for (const [collected, remitted] of [[false, false], [true, false], [true, true]]) {
      await cancellationSettlementScenario(f.database, collected, remitted);
    }
    await cancellationSettlementScenario(f.database, true, true, true);
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { await f.dispose(); }
});
