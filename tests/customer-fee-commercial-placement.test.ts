import assert from 'node:assert/strict';
import test from 'node:test';
import { AT, customerFeeCheckoutFixture, addManaged, interleaveFeeWaiverBatch, afterCustomerFeePreparation, withCommercialFinancialIntent } from './helpers/customer-fee-waiver-fixture';
import { createCodOrder } from '../lib/db/repositories/orders';
import { saveBusinessSettingChange } from '../lib/db/repositories/business-settings';
import { getRegisteredSellerTerms, prepareSellerCommissionAcceptance } from '../lib/db/repositories/marketplace-settings';
import { acceptManagedTerms, getManagedTermsOffers, managedTermsFormId } from '../lib/managed-commerce/accepted-terms';
import { acceptCommissionRate, scheduleCommissionRate } from '../lib/db/repositories/commission-rates';
import type { CheckoutInput } from '../lib/checkout/validation';

type Fixture = Awaited<ReturnType<typeof customerFeeCheckoutFixture>>;
const notice = 1_296_000_000;
async function publish(f: Fixture, managed: boolean, effectiveAt = AT, bps = 1200) {
  return saveBusinessSettingChange(f.database, {
    key: managed ? 'managed_sale_linked_platform_retention_bps' : 'independent_seller_commission_bps',
    value: bps, actorId: 'owner', reason: 'SIMULATED commercial placement publication',
    requestId: 'placement-publication', expectedVersion: 1,
    now: effectiveAt - notice - 1, effectiveFrom: effectiveAt,
  });
}
async function renew(f: Fixture, managed: boolean) {
  if (managed) {
    const offer = (await getManagedTermsOffers(f.database, 'seller-b', AT - 2)).upcoming[0];
    assert.ok(offer, 'The supported renewal offers the future published version');
    await acceptManagedTerms(f.database, { sellerId: 'seller-b', actorId: 'user-b', offerId: offer.id,
      context: offer.context, language: 'en', requestId: 'placement-renewal', now: AT - 2,
      form: { versionId: 'managed-terms-form', answers: { formId: managedTermsFormId, version: 1, answers: [] } } });
  } else {
    const offer = await getRegisteredSellerTerms(f.database, AT);
    await f.database.batch((await prepareSellerCommissionAcceptance(f.database, { sellerId: 'seller-a', actorId: 'user-a',
      context: offer.context, requestId: 'placement-renewal', now: AT })).statements);
  }
}
// Capture every fixture business table, including stock, carts, addresses, promo,
// payment/document/fee/acceptance/ledger evidence and guard rows, byte for byte.
function conserved(f: Fixture) {
  const tables = f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(row => [String(row.name), f.sqlite.prepare(`SELECT * FROM "${String(row.name)}" ORDER BY 1`).all()]));
}
const place = (f: Fixture, db = f.database, now = AT - 1, input: CheckoutInput = f.input) => createCodOrder(db, 'token', 'receipt',
  { ...input, saveAddressForFuture: true, saveAddressLabel: 'Fictional home' }, now, 'checkout-buyer');

for (const managed of [false, true]) for (const renewed of [false, true])
  void test(`${managed ? 'managed' : 'registered'} scheduled 9-to-12 placement crossing rejects ${renewed ? 'already renewed' : 'missing renewal'} without any order side effect`, async t => {
    let clock = AT - 1;
    t.mock.method(Date, 'now', () => clock);
    const f = await customerFeeCheckoutFixture(900);
    try {
      if (managed) await addManaged(f, true);
      await publish(f, managed);
      if (renewed) await renew(f, managed);
      const input = await withCommercialFinancialIntent(f.database, 'token', f.input, AT - 1);
      const before = conserved(f);
      await assert.rejects(place(f, afterCustomerFeePreparation(f.database, () => { clock = AT + 1; }), AT - 1, input), /changed|review|terms/i);
      assert.equal(clock, AT + 1, 'The request prepared successfully before the commercial boundary');
      assert.deepEqual(conserved(f), before);
    } finally { await f.dispose(); }
  });

for (const managed of [false, true])
  void test(`${managed ? 'managed' : 'registered'} publication committed before the post-control decision invalidates the selected commercial identity`, async t => {
    t.mock.method(Date, 'now', () => AT);
    const f = await customerFeeCheckoutFixture(900);
    try {
      if (managed) await addManaged(f, true);
      let before = conserved(f), committed = false;
      const db = interleaveFeeWaiverBatch(f.database, async () => {
        await publish(f, managed);
        committed = true;
        before = conserved(f);
      });
      await assert.rejects(place(f, db, AT), /changed|review|terms/i);
      assert.equal(committed, true);
      assert.deepEqual(conserved(f), before);
    } finally { await f.dispose(); }
  });

for (const managed of [false, true])
  void test(`${managed ? 'managed' : 'registered'} freshly reviewed current accepted twelve percent still places an NPR10-fee order`, async t => {
    t.mock.method(Date, 'now', () => AT + 1);
    const f = await customerFeeCheckoutFixture(900);
    try {
      if (managed) await addManaged(f, true);
      await publish(f, managed); await renew(f, managed);
      await place(f, f.database, AT + 1);
      assert.equal(f.sqlite.prepare('SELECT buyer_platform_fee_paisa FROM orders').get()?.buyer_platform_fee_paisa, 1000);
      const row = f.sqlite.prepare(managed ? 'SELECT platform_retention_bps AS bps,platform_retained_paisa AS amount FROM managed_commercial_snapshots'
        : 'SELECT commission_bps AS bps,commission_paisa AS amount FROM order_items').get();
      assert.deepEqual({ ...row }, { bps: 1200, amount: 12000 });
    } finally { await f.dispose(); }
  });

for (const crossing of [false, true])
  void test(`legitimate accepted supplement ${crossing ? 'becoming effective at placement requires fresh review' : 'keeps its own nine percent over twelve percent base'}`, async t => {
    t.mock.method(Date, 'now', () => AT + 1);
    const f = await customerFeeCheckoutFixture();
    try {
      await scheduleCommissionRate(f.database, { actorId: 'owner', requestId: 'placement-supplement', expectedRevision: 0,
        basisPoints: 900, effectiveAt: crossing ? AT : AT - 10, now: AT - notice - 100,
        reason: 'SIMULATED legitimate accepted supplement' });
      await acceptCommissionRate(f.database, { sellerId: 'seller-a', userId: 'user-a', rateId: 'placement-supplement', now: AT - 2 });
      const before = conserved(f);
      if (crossing) {
        await assert.rejects(place(f), /changed|review|terms/i);
        assert.deepEqual(conserved(f), before);
      } else {
        await place(f);
        assert.equal(f.sqlite.prepare('SELECT commission_bps FROM order_items').get()?.commission_bps, 900);
        assert.equal(f.sqlite.prepare('SELECT commission_rule_version FROM order_items').get()?.commission_rule_version, 'placement-supplement');
      }
    } finally { await f.dispose(); }
  });

for (const changed of ['missing-base', 'base-acceptance', 'supplement-acceptance', 'managed-private-document'] as const)
  void test(`post-quote ${changed} change refuses stale accepted commercial evidence atomically`, async t => {
    t.mock.method(Date, 'now', () => AT);
    const f = await customerFeeCheckoutFixture();
    try {
      if (changed === 'managed-private-document') await addManaged(f, true);
      if (changed === 'supplement-acceptance') {
        await scheduleCommissionRate(f.database, { actorId: 'owner', requestId: 'revoked-supplement', expectedRevision: 0,
          basisPoints: 1000, effectiveAt: AT - 10, now: AT - notice - 100, reason: 'SIMULATED accepted supplement removal' });
        await acceptCommissionRate(f.database, { sellerId: 'seller-a', userId: 'user-a', rateId: 'revoked-supplement', now: AT - 2 });
      }
      let before = conserved(f);
      const db = interleaveFeeWaiverBatch(f.database, async () => {
        if (changed === 'missing-base') f.sqlite.exec("UPDATE business_setting_versions SET effective_until=1999999999 WHERE setting_key='independent_seller_commission_bps'");
        else if (changed === 'base-acceptance') f.sqlite.exec("DELETE FROM seller_agreement_acceptance_history WHERE seller_id='seller-a'");
        else if (changed === 'supplement-acceptance') f.sqlite.exec("DELETE FROM commission_rate_acceptances WHERE seller_id='seller-a'");
        else f.sqlite.exec("UPDATE seller_documents SET object_key='public/unrelated-document' WHERE id='managed-id'");
        before = conserved(f);
      });
      await assert.rejects(place(f, db, AT), /changed|review|terms/i);
      assert.deepEqual(conserved(f), before);
    } finally { await f.dispose(); }
  });
