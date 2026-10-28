import assert from 'node:assert/strict';
import test from 'node:test';
import { historicalCommissionDatabase } from './helpers/commission-database';
import { seedCheckoutBuyer } from './helpers/checkout-contact';
import { createCodOrder } from '../lib/db/repositories/orders';
import { prepareSellerParcels, operateParcel, listParcels } from '../lib/operations/parcels';
import { confirmFirstCodReview, getFirstCodReview } from '../lib/orders/first-cod-review';
import { createCustomerReturnRequest, reviewReturnAsAdmin, advanceReturnAsAdmin } from '../lib/db/repositories/returns';
import { buildEarningsAccrualStatements } from '../lib/db/repositories/payouts';
import { cancellationPreview, cancelSelectedParcels } from '../lib/cancellation/repository';
import { refundRemittanceScenario, cancellationSettlementScenario } from './helpers/financial-transition-scenarios';

async function fixture(twoSellers = false, wallet = 0) {
  const f = await historicalCommissionDatabase(true);
  try {
    if (twoSellers) f.sqlite.prepare("DELETE FROM business_setting_versions WHERE id='historical-no-service-fee'").run();
    await seedCheckoutBuyer(f.database);
    if (wallet) f.sqlite.prepare("INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES ('checkout-buyer','FINANCIAL-WALLET',?,1)").run(wallet);
    f.sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','craft','Craft',1,1,1,1);
      INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','token','NPR',1,1);
      INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,return_eligible,created_at,updated_at)
      VALUES ('product-a','seller-a','cat','craft-a','SKU-A','Craft A','Fictional craft A',${twoSellers ? 16000 : 100000},10,'Maker A','NP','Wood','published',1,1,1);
      INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('line-a','cart','product-a',1,1,1);`);
    if (twoSellers) f.sqlite.exec(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,return_eligible,created_at,updated_at)
      VALUES ('product-b','seller-b','cat','craft-b','SKU-B','Craft B','Fictional craft B',7500,10,'Maker B','NP','Wood','published',1,1,1);
      INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('line-b','cart','product-b',1,1,1);`);
    const placed = await createCodOrder(f.database, 'token', 'receipt', {
      customerAuthSubject: 'checkout-buyer', customerEmail: 'buyer@example.test', customerPhone: '9811111111',
      locale: 'en-NP', termsAccepted: true, idempotencyKey: 'financial-transition-order',
      useWallet: wallet > 0,
      address: { recipientName: 'Fictional Buyer', phone: '9811111111', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Ward 1' },
    }, 100, 'checkout-buyer');
    const orderId = String(f.sqlite.prepare('SELECT id FROM orders').get()!.id);
    if (await getFirstCodReview(f.database, orderId)) await confirmFirstCodReview(f.database, {
      orderId, actorId: 'owner', reason: 'Confirmed isolated fictional COD order', requestId: 'first-cod', now: 101,
    });
    await prepareSellerParcels(f.database, { orderId, actorId: 'owner', requestId: 'prepare', now: 102 });
    let sequence = 0;
    async function operate(action: string, extra: Record<string, unknown> = {}) {
      const p = (await listParcels(f.database, orderId)).find(row => row.sellerId === 'seller-a')!;
      const input = { jobId: p.id, actorId: 'owner', action, version: p.version, note: 'Isolated financial transition fixture',
        requestId: 'parcel-' + sequence, now: 103 + sequence++, ...extra };
      await operateParcel(f.database, input);
      return input;
    }
    async function deliver() {
      await operate('assign', { method: 'courier', courierName: 'Fictional Courier', trackingCode: 'LOCAL-FIXTURE' });
      f.sqlite.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE seller_id='seller-a'").run();
      await operate('dispatch');
      await operate('deliver');
    }
    return { ...f, orderId, operate, deliver, access: { orderNumber: placed.orderNumber, customerId: 'checkout-buyer' } };
  } catch (error) { await f.dispose(); throw error; }
}

async function refund(f: Awaited<ReturnType<typeof fixture>>, full: boolean) {
  const itemId = String(f.sqlite.prepare('SELECT id FROM order_items').get()!.id);
  const request = await createCustomerReturnRequest(f.database, {
    orderNumber: f.access.orderNumber, receiptTokenHash: 'receipt', customerId: 'checkout-buyer', orderItemId: itemId,
    quantity: 1, reason: 'defective', requestedResolution: 'refund', detail: 'Fictional product has a documented defect.',
    locale: 'en-NP', idempotencyKey: 'return', evidence: [], now: 120,
  });
  await reviewReturnAsAdmin(f.database, { returnRequestId: request.id, actorId: 'owner', actorRole: 'super_admin', action: 'approve',
    note: 'Fictional merchandise refund approved', publicMessageEn: 'Refund approved.', publicMessageNe: 'Refund approved.',
    responsibility: 'seller', outcome: 'refund', itemRefundPaisa: full ? 100000 : 50000, deliveryRefundPaisa: full ? 15000 : 0,
    requestId: 'refund-approve', now: 121 });
  const input = { returnRequestId: request.id, actorId: 'owner', actorRole: 'super_admin' as const,
    note: 'Fictional refund processing evidence', publicMessageEn: 'Refund processing update.', publicMessageNe: 'Refund processing update.' };
  await advanceReturnAsAdmin(f.database, { ...input, action: 'start_refund', requestId: 'refund-start', now: 122 });
  const complete = { ...input, action: 'complete_refund' as const, reference: 'LOCAL-REFUND', requestId: 'refund-complete', now: 123 };
  await advanceReturnAsAdmin(f.database, complete);
  return complete;
}

for (const full of [false, true]) for (const beforeRemittance of [true, false]) {
  void test(`${full ? 'full' : 'partial'} refund ${beforeRemittance ? 'before' : 'after'} remittance preserves original earnings and one commission reversal`, async () => {
    const f = await fixture();
    try {
      await f.deliver();
      await f.operate('collect', { amountPaisa: 115000, reference: 'LOCAL-COLLECT' });
      if (!beforeRemittance) await f.operate('propose_remittance', { amountPaisa: 115000, reference: 'LOCAL-REMIT', now: 119 });
      const complete = await refund(f, full);
      if (beforeRemittance) {
        assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='sale'").get()!.n, 0);
        const remit = await f.operate('propose_remittance', { amountPaisa: 115000, reference: 'LOCAL-REMIT', now: 124 });
        await operateParcel(f.database, remit);
      }
      await advanceReturnAsAdmin(f.database, complete);
      for (let n = 0; n < 2; n++) await f.database.batch(buildEarningsAccrualStatements(f.database, { orderId: f.orderId, now: 125 + n }));
      assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders').get()!.payment_status, full ? 'refunded' : 'part_refunded');
      const ledger = f.sqlite.prepare('SELECT type,COUNT(*) n,SUM(amount_paisa) amount FROM seller_ledger_entries GROUP BY type').all();
      const entry = (type: string) => ledger.find(row => row.type === type);
      assert.deepEqual({ n: entry('sale')?.n, amount: entry('sale')?.amount }, { n: 1, amount: 100000 });
      assert.deepEqual({ n: entry('commission')?.n, amount: entry('commission')?.amount }, { n: 1, amount: -9000 });
      assert.deepEqual({ n: entry('commission_reversal')?.n, amount: entry('commission_reversal')?.amount }, { n: 1, amount: full ? 9000 : 4500 });
      assert.equal(entry('refund')?.amount, full ? -115000 : -50000);
      assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').get()!.n, full ? -15000 : 45500);
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
    if (remitted) await f.operate('propose_remittance', { amountPaisa: 32000, reference: 'LOCAL-REMIT' });
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
    if (!remitted) await f.operate('propose_remittance', { amountPaisa: 32000, reference: 'LOCAL-REMIT', now: 121 });
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
    await f.operate('propose_remittance', { amountPaisa: 28596, reference: 'LOCAL-REMIT' });
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
    await f.operate('propose_remittance', { amountPaisa: 32000, reference: 'LOCAL-REMIT' });
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
  } finally { await f.dispose(); }
});
