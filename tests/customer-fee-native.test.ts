import assert from 'node:assert/strict';
import { test } from 'node:test';
import { customerFeeNativeFixture, seedNativeLegacyHistory } from './helpers/customer-fee-native-fixture';
import { AT, terms, feeWaiverContext as ctx, afterCustomerFeePreparation, withCommercialFinancialIntent } from './helpers/customer-fee-waiver-fixture';
import { getCustomerFeeWaiverState as state, mutateCustomerFeeWaiver as mutate } from '../lib/db/repositories/customer-fee-waivers';
import { createCodOrder, getOrderReceipt } from '../lib/db/repositories/orders';
import { getEffectiveBusinessSetting, saveBusinessSettingChange } from '../lib/db/repositories/business-settings';
import { recordLawfulServiceFeeRefund } from '../lib/db/repositories/platform-service-fee-refunds';
import { transitionAdminFulfillment } from '../lib/db/repositories/fulfillment';
import { createCustomerReturnRequest, reviewReturnAsAdmin, advanceReturnAsAdmin } from '../lib/db/repositories/returns';
import { cancellationPreview, cancelSelectedParcels } from '../lib/cancellation/repository';
import { prepareSellerParcels } from '../lib/operations/parcels';
import { confirmFirstCodReview, getFirstCodReview } from '../lib/orders/first-cod-review';
import { getRegisteredSellerTerms, prepareSellerCommissionAcceptance } from '../lib/db/repositories/marketplace-settings';
import { acceptManagedTerms, getManagedTermsOffers, managedTermsFormId } from '../lib/managed-commerce/accepted-terms';
import { acceptCommissionRate, scheduleCommissionRate } from '../lib/db/repositories/commission-rates';

const enabled = process.env.HATSKALA_STAGING_NATIVE === '1';
const settled = <T>(promise: Promise<T>) => promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));

// 21 original + 7 commercial scenarios + this parent = 29. Ordinary-suite skip is not native proof.
void test('native customer fee transactions, independent lock races and actual-net aftercare', { skip: !enabled }, async t => {
  const f = await customerFeeNativeFixture(true), { db, monitor, blocker } = f;
  let placement = AT, sequence = 0, policyPublishedAt = AT - 100;
  t.mock.method(Date, 'now', () => placement);
  const command = async (request: string, value: Parameters<typeof mutate>[2], now = placement) => mutate(db, ctx(request, (await state(db)).revision, { now }), value);
  const policy = async (enabled = true, amountPaisa = 1000, now = policyPublishedAt + 1) => {
    const row = await db.prepare("SELECT COALESCE(MAX(version),0) n FROM business_setting_versions WHERE setting_key='platform_service_fee_policy'").first<{ n: number }>();
    // Routine setup publications are strictly ordered before the frozen placement.
    // The races explicitly publish at their captured placement millisecond.
    const saved = await saveBusinessSettingChange(db, { key: 'platform_service_fee_policy', value: { enabled, amountPaisa }, actorId: 'owner', reason: 'Fictional native customer policy', requestId: 'native-policy-' + (++sequence), now, effectiveFrom: null, expectedVersion: Number(row!.n) });
    policyPublishedAt = now;
    return saved;
  };
  async function campaign(key: string, startsAt = AT - 10, endsAt = AT + 1000, publicationAt = placement) {
    const draft = await command(key + '-create', { type: 'create', terms: { ...terms, startsAt, endsAt } }, publicationAt);
    return command(key + '-publish', { type: 'publish', campaignId: draft.id }, publicationAt);
  }
  async function endAll() { for (const c of (await state(db)).campaigns.filter(c => c.state !== 'ended')) await command('native-end-' + c.id + '-' + c.revision, { type: 'end', campaignId: c.id }); }
  async function cart(mode: 'registered' | 'mixed' | 'managed' = 'registered', quantity = 1) {
    const key = 'customer-native-' + (++sequence);
    await db.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES(?,?,'NPR',1,1)").bind(key, key).run();
    for (const product of mode === 'registered' ? ['product'] : mode === 'managed' ? ['managed-product'] : ['product', 'managed-product'])
      await db.prepare('INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES(?,?,?,?,1,1)').bind(key + '-' + product, key, product, quantity).run();
    return { key, input: { ...f.input, idempotencyKey: key } };
  }
  const place = (c: Awaited<ReturnType<typeof cart>>, now = placement) => createCodOrder(db, c.key, c.key, c.input, now, 'checkout-buyer');
  async function financial(includeAudit = false) {
    const tables = ['orders', 'payments', 'order_items', 'order_customer_service_fees', 'order_item_marketplace_fees', 'order_documents',
      'order_policy_acceptances', 'seller_ledger_entries', 'managed_commercial_snapshots', 'managed_entitlements', 'cart_items', 'products',
      'addresses', 'address_locations', 'wallet_accounts', 'wallet_entries', 'gift_cards', 'promo_redemptions', 'promo_customer_usage',
      'promo_campaigns', 'promo_revisions', 'shipments', 'order_status_events',
      'notification_messages', 'form_answer_sets', 'staff_permission_guards', 'operation_transaction_guards', ...(includeAudit ? ['audit_logs'] : [])];
    return Object.fromEntries(await Promise.all(tables.map(async table => [table, (await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results])));
  }
  async function gateThread(gate: ReturnType<typeof f.holdCommit>, operation: Promise<unknown>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([gate.entered, operation.then(() => { throw Error('Native operation ended before the commit barrier'); }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Native commit barrier timed out')), 10000); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  async function campaignRace(value: Parameters<typeof mutate>[2], request: string) {
    const c = await cart(), before = await financial(), mark = f.traces.length;
    const gate = f.holdCommit(/INSERT INTO customer_fee_waiver_revisions/);
    const publication = settled(command(request, value));
    let checkout: ReturnType<typeof settled<Awaited<ReturnType<typeof place>>>> | undefined;
    try {
      const holder = await gateThread(gate, publication);
      checkout = settled(place(c));
      await f.waitForBlocked(/UPDATE customer_fee_waiver_control/, mark, holder);
    } finally { gate.release(); }
    assert.equal((await publication).ok, true);
    assert.ok(checkout); assert.equal((await checkout).ok, false, 'Stale campaign selection must roll back');
    assert.deepEqual(await financial(), before);
  }
  try {
    await policy();
    await t.test('independent control writers serialize and claim exactly one global revision', async () => {
      await db.prepare("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES('native-other-owner','native-other-owner','other-owner@example.test','Fictional second owner','en-NP','active',1,1)").run();
      await db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('native-other-owner','super_admin',1)").run();
      const revision = (await state(db)).revision, mark = f.traces.length;
      const gate = f.holdCommit(/INSERT INTO customer_fee_waiver_revisions/);
      const first = settled(mutate(db, ctx('native-race-a', revision, { now: AT }), { type: 'create', terms }));
      let second: typeof first | undefined;
      try {
        const holder = await gateThread(gate, first);
        second = settled(mutate(db, ctx('native-race-b', revision, { now: AT, actorId: 'native-other-owner', authSubject: 'native-other-owner' }), { type: 'create', terms }));
        await f.waitForBlocked(/UPDATE customer_fee_waiver_control/, mark, holder);
      } finally { gate.release(); }
      assert.ok(second);
      const secondResult = await second;
      assert.deepEqual([(await first).ok, secondResult.ok], [true, false]);
      if (!secondResult.ok) assert.equal(secondResult.error.code, 'stale');
      assert.equal((await state(db)).revision, revision + 1);
      assert.equal((await db.prepare("SELECT COUNT(*) n FROM customer_fee_waiver_requests WHERE request_id IN ('native-race-a','native-race-b')").first<{ n: number }>())?.n, 1);
    });
    await t.test('audit insertion failure rolls back control, campaign, revision and receipt', async () => {
      const before = await state(db);
      await monitor.query("CREATE TRIGGER customer_fixture_reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture_customer_audit_failure'");
      try { await assert.rejects(command('native-audit-rollback', { type: 'create', terms }), /fixture_customer_audit_failure/); }
      finally { await monitor.query('DROP TRIGGER customer_fixture_reject_audit'); }
      assert.deepEqual(await state(db), before);
      assert.equal(await db.prepare("SELECT 1 FROM customer_fee_waiver_requests WHERE request_id='native-audit-rollback'").first(), null);
    });
    await t.test('actor revocation commits on a separate connection while mutation waits and rejects replay', async () => {
      const before = await state(db), mark = f.traces.length;
      await blocker.beginTransaction();
      await blocker.query("SELECT id FROM users WHERE id='owner' FOR UPDATE");
      const mutation = settled(command('native-revoked', { type: 'create', terms }));
      try {
        await f.waitForBlocked(/UPDATE users/, mark);
        await blocker.query("DELETE FROM user_roles WHERE user_id='owner' AND role='super_admin'");
        await blocker.commit();
        assert.equal((await mutation).ok, false);
        await assert.rejects(mutate(db, ctx('native-race-a', 0, { now: AT }), { type: 'create', terms }), { code: 'unauthorized' });
        assert.deepEqual(await state(db), before);
      } finally {
        await blocker.rollback();
        await monitor.query("INSERT IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('owner','super_admin',1)");
      }
    });
    await t.test('no-campaign checkout waits for a real uncommitted publication and rejects its stale absence', async () => {
      await endAll(); const draft = await command('native-absence-create', { type: 'create', terms });
      await campaignRace({ type: 'publish', campaignId: draft.id }, 'native-absence-publish');
    });
    await t.test('selected-campaign checkout waits for a real pause and rejects its stale revision', async () => {
      const active = (await state(db)).campaigns.find(c => c.state === 'published')!;
      await campaignRace({ type: 'pause', campaignId: active.id }, 'native-race-pause');
    });
    await t.test('paused-campaign absence waits for a real resume and rejects stale eligibility', async () => {
      const paused = (await state(db)).campaigns.find(c => c.state === 'paused')!;
      await campaignRace({ type: 'resume', campaignId: paused.id }, 'native-race-resume');
    });
    for (const boundary of ['start', 'end'] as const) await t.test(`placement at the exact ${boundary} boundary rejects the earlier quote`, async () => {
      await endAll(); await campaign('native-boundary-' + boundary, boundary === 'start' ? AT : AT - 10, boundary === 'end' ? AT : AT + 1000, boundary === 'end' ? AT - 1 : AT);
      const c = await cart(), before = await financial();
      await assert.rejects(place(c, AT - 1));
      assert.deepEqual(await financial(), before);
    });
    await t.test('native customer evidence failure rolls back order, payment, documents, stock and cart', async () => {
      await endAll(); await campaign('native-evidence');
      const c = await cart(), before = await financial();
      await monitor.query("CREATE TRIGGER customer_fixture_reject_evidence BEFORE INSERT ON order_customer_service_fees FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture_customer_evidence_failure'");
      try { await assert.rejects(place(c), /fixture_customer_evidence_failure/); }
      finally { await monitor.query('DROP TRIGGER customer_fixture_reject_evidence'); }
      assert.deepEqual(await financial(), before);
    });
    let savedOrder = '';
    await t.test('overlap selects one earliest-start immutable ID and retry preserves the original evidence', async () => {
      await endAll(); const later = await campaign('native-later', AT - 5), a = await campaign('native-tie-a'), b = await campaign('native-tie-b');
      const c = await cart(), receipt = await place(c);
      savedOrder = String((await db.prepare('SELECT id FROM orders WHERE order_number=?').bind(receipt.orderNumber).first<{ id: string }>())!.id);
      const evidence = await db.prepare('SELECT * FROM order_customer_service_fees WHERE order_id=?').bind(savedOrder).first<{ campaign_id: string; standard_paisa: number; waived_paisa: number; net_paisa: number }>();
      assert.equal(evidence!.campaign_id, [a.id, b.id].sort()[0]); assert.notEqual(evidence!.campaign_id, later.id);
      assert.deepEqual([evidence!.standard_paisa, evidence!.waived_paisa, evidence!.net_paisa], [1000, 1000, 0]);
      const before = await financial(); await endAll(); placement = AT + 2000;
      try { assert.deepEqual(await place(c, AT + 2000), receipt); }
      finally { placement = AT; }
      assert.deepEqual(await financial(), before);
    });
    await t.test('native customer identity, revisions, receipts and order evidence are immutable and partial relief is invalid', async () => {
      assert.ok(savedOrder);
      for (const sql of ["UPDATE customer_fee_waiver_revisions SET name='changed'", 'DELETE FROM customer_fee_waiver_revisions', "UPDATE customer_fee_waiver_requests SET response_json='{}'", 'DELETE FROM customer_fee_waiver_requests', 'DELETE FROM customer_fee_waiver_campaigns', "UPDATE customer_fee_waiver_campaigns SET id=CONCAT(id,'x')", 'UPDATE order_customer_service_fees SET net_paisa=net_paisa', 'DELETE FROM order_customer_service_fees', "INSERT INTO customer_fee_waiver_control VALUES('other',0)", 'INSERT INTO order_customer_service_fees SELECT * FROM order_customer_service_fees LIMIT 1']) await assert.rejects(monitor.query(sql), sql);
      await assert.rejects(monitor.query('UPDATE orders SET buyer_platform_fee_paisa=1 WHERE id=?', [savedOrder]), /customer_fee_order_mismatch/);
      // A new fictional original order permits checking native CHECK/FK predicates without first tripping immutable evidence.
      await monitor.query("INSERT INTO orders(id,order_number,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at) VALUES('native-invalid-fee','native-invalid-fee','fiction@example.test','9811111111','confirmed','en-NP','fictional','{}',10000,0,500,10500,'cod','pending',1,1)");
      await assert.rejects(monitor.query("INSERT INTO order_customer_service_fees VALUES('native-invalid-fee',1,1000,NULL,1000,500,500,NULL,NULL,1)"), /CONSTRAINT/i);
      await monitor.query("INSERT INTO orders(id,order_number,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at) VALUES('native-invalid-reference','native-invalid-reference','fiction@example.test','9811111111','confirmed','en-NP','fictional','{}',10000,0,0,10000,'cod','pending',1,1)");
      await assert.rejects(monitor.query("INSERT INTO order_customer_service_fees VALUES('native-invalid-reference',1,1000,NULL,1000,1000,0,'absent-native-campaign',1,1)"), /foreign key constraint/i);
    });
    for (const mode of ['mixed', 'managed'] as const) await t.test(`${mode} checkout waives one customer fee and preserves accepted twelve percent commercial facts`, async () => {
      await endAll(); await campaign('native-' + mode);
      const c = await cart(mode), receipt = await place(c);
      const order = await db.prepare('SELECT id FROM orders WHERE order_number=?').bind(receipt.orderNumber).first<{ id: string }>();
      const lines = (await db.prepare('SELECT product_id,commission_bps,commission_paisa FROM order_items WHERE order_id=? ORDER BY product_id').bind(order!.id).all<{ product_id: string; commission_bps: number; commission_paisa: number }>()).results;
      assert.equal(lines.length, mode === 'mixed' ? 2 : 1);
      // Managed retention belongs to its commercial snapshot, never registered commission.
      assert.deepEqual(lines.map(line => [line.product_id, line.commission_bps, line.commission_paisa]), mode === 'mixed' ? [
        ['managed-product', 0, 0], ['product', 1200, 12000],
      ] : [['managed-product', 0, 0]]);
      const snapshot = await db.prepare('SELECT platform_retention_bps,platform_retained_paisa FROM managed_commercial_snapshots WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?)').bind(order!.id).first<{ platform_retention_bps: number; platform_retained_paisa: number }>();
      assert.deepEqual([snapshot!.platform_retention_bps, snapshot!.platform_retained_paisa], [1200, 12000]);
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM order_customer_service_fees WHERE order_id=? AND waived_paisa=1000 AND net_paisa=0').bind(order!.id).first<{ n: number }>())?.n, 1);
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM order_item_marketplace_fees WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?)').bind(order!.id).first<{ n: number }>())?.n, 0);
    });
    for (const mode of ['disabled', 'zero'] as const) await t.test(`${mode} policy with an active campaign creates no fictitious customer relief`, async () => {
      await policy(mode !== 'disabled', mode === 'zero' ? 0 : 2500);
      const c = await cart(), receipt = await place(c);
      const row = await db.prepare('SELECT f.* FROM order_customer_service_fees f JOIN orders o ON o.id=f.order_id WHERE o.order_number=?').bind(receipt.orderNumber).first<{ standard_paisa: number; waived_paisa: number; net_paisa: number; campaign_id: string | null }>();
      assert.deepEqual([row!.standard_paisa, row!.waived_paisa, row!.net_paisa, row!.campaign_id], [0, 0, 0, null]);
      await policy();
    });
    for (const waived of [false, true]) await t.test(`${waived ? 'waived' : 'charged'} native delivered return and lawful refund use actual net and preserve originals`, async () => {
      await endAll(); if (waived) await campaign('native-aftercare-waiver');
      const c = await cart('registered', 3), receipt = await place(c);
      const item = await db.prepare('SELECT i.id,i.order_id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.order_number=?').bind(receipt.orderNumber).first<{ id: string; order_id: string }>();
      const evidence = await db.prepare('SELECT * FROM order_customer_service_fees WHERE order_id=?').bind(item!.order_id).first();
      await db.prepare("UPDATE orders SET status='dispatched' WHERE id=?").bind(item!.order_id).run();
      await db.prepare("UPDATE order_items SET fulfillment_status='dispatched' WHERE id=?").bind(item!.id).run();
      await transitionAdminFulfillment(db, { orderId: item!.order_id, actorId: 'owner', action: 'deliver', note: 'Fictional native delivered return', requestId: c.key + '-deliver', now: AT + 1 });
      const request = await createCustomerReturnRequest(db, { orderNumber: receipt.orderNumber, receiptTokenHash: c.key, customerId: 'checkout-buyer', orderItemId: item!.id, quantity: 1, reason: 'defective', requestedResolution: 'refund', detail: 'Fictional native item has a documented defect.', locale: 'en-NP', idempotencyKey: c.key + '-return', evidence: [], now: AT + 2 });
      const options = { returnRequestId: request.id, actorId: 'owner', actorRole: 'super_admin' as const, note: 'Fictional native refund processing', publicMessageEn: 'Refund update.', publicMessageNe: 'Refund update.' };
      await reviewReturnAsAdmin(db, { ...options, action: 'approve', responsibility: 'seller', outcome: 'refund', itemRefundPaisa: 100000, deliveryRefundPaisa: 0, requestId: c.key + '-approve', now: AT + 3 });
      await advanceReturnAsAdmin(db, { ...options, action: 'start_refund', requestId: c.key + '-start', now: AT + 4 });
      const complete = { ...options, action: 'complete_refund' as const, reference: c.key + '-bank', requestId: c.key + '-complete', now: AT + 5 };
      await advanceReturnAsAdmin(db, complete); await advanceReturnAsAdmin(db, complete);
      assert.equal((await db.prepare('SELECT commission_reversal_paisa FROM refunds WHERE return_request_id=?').bind(request.id).first<{ commission_reversal_paisa: number }>())?.commission_reversal_paisa, 12000);
      const legal = (amountPaisa: number, requestId: string) => ({ orderId: item!.order_id, amountPaisa, actorId: 'owner', legalBasis: 'Mandatory consumer remedy confirmed by fictional case review', caseReference: 'NATIVE-CASE', paymentReference: 'NATIVE-BANK', requestId, now: AT + 6 });
      if (waived) await assert.rejects(recordLawfulServiceFeeRefund(db, legal(1, c.key + '-zero')), /fee|exceeds/i);
      else { const paid = await recordLawfulServiceFeeRefund(db, legal(1000, c.key + '-lawful')); assert.deepEqual(await recordLawfulServiceFeeRefund(db, legal(1000, c.key + '-lawful')), paid); await assert.rejects(recordLawfulServiceFeeRefund(db, legal(1, c.key + '-excess')), /fee|remaining/i); }
      assert.deepEqual(await db.prepare('SELECT * FROM order_customer_service_fees WHERE order_id=?').bind(item!.order_id).first(), evidence);
      assert.equal((await getOrderReceipt(db, receipt.orderNumber, c.key, 'checkout-buyer'))?.originalBuyerPlatformFeePaisa, waived ? 0 : 1000);
    });
    for (const waived of [false, true]) await t.test(`${waived ? 'waived' : 'charged'} native partial and full cancellation remove only the saved customer net`, async () => {
      await endAll(); if (waived) await campaign('native-cancel-waiver');
      const c = await cart('mixed'), receipt = await place(c), access = { orderNumber: receipt.orderNumber, customerId: 'checkout-buyer' };
      const order = await db.prepare('SELECT id FROM orders WHERE order_number=?').bind(receipt.orderNumber).first<{ id: string }>();
      if (await getFirstCodReview(db, order!.id)) await confirmFirstCodReview(db, { orderId: order!.id, actorId: 'owner', reason: 'Fictional native buyer confirmed order', requestId: c.key + '-cod', now: AT + 1 });
      await prepareSellerParcels(db, { orderId: order!.id, actorId: 'owner', requestId: c.key + '-parcels', now: AT + 2 });
      const before = await db.prepare('SELECT f.* FROM order_customer_service_fees f JOIN orders o ON o.id=f.order_id WHERE o.order_number=?').bind(receipt.orderNumber).first();
      for (const [index, sellerId] of ['seller-b', 'seller-a'].entries()) {
        const preview = await cancellationPreview(db, access, [sellerId]);
        await cancelSelectedParcels(db, access, { sellerIds: [sellerId], fingerprint: preview.fingerprint, requestId: c.key + '-cancel-' + index, note: 'Fictional uncollected native cancellation', now: AT + 3 + index });
        const after = await getOrderReceipt(db, receipt.orderNumber, c.key, 'checkout-buyer');
        assert.equal(typeof after?.buyerPlatformFeePaisa, 'number', 'Public receipt normalizes native JSON scalar money');
        assert.equal(Number.isSafeInteger(after?.buyerPlatformFeePaisa), true);
        assert.equal(after?.buyerPlatformFeePaisa, index === 0 && !waived ? 1000 : 0);
        if (index === 1) assert.equal(after?.grandTotalPaisa, 0);
        assert.equal(after?.originalBuyerPlatformFeePaisa, waived ? 0 : 1000);
        assert.deepEqual(await db.prepare('SELECT f.* FROM order_customer_service_fees f JOIN orders o ON o.id=f.order_id WHERE o.order_number=?').bind(receipt.orderNumber).first(), before);
      }
    });
    for (const waived of [false, true]) await t.test(`${waived ? 'zero-net waived' : 'charged'} quote cannot commit stale policy identity after evaluating its predicate and waiting for control`, async () => {
      placement = Math.max(placement, policyPublishedAt + 1);
      await endAll(); if (waived) await campaign('native-policy-race');
      const quotedPolicy = await getEffectiveBusinessSetting(db, 'platform_service_fee_policy', placement);
      const c = await cart(), before = await financial(), mark = f.traces.length;
      await blocker.beginTransaction(); await blocker.query("UPDATE customer_fee_waiver_control SET revision=revision WHERE id='default'");
      const checkout = settled(place(c));
      try {
        const waiting = await f.waitForBlocked(/UPDATE customer_fee_waiver_control/, mark);
        assert.ok(f.traces.slice(mark).some(e => e.thread === waiting.thread && e.complete && e.sql.includes("setting_key='platform_service_fee_policy'")), 'The actual checkout policy predicate completed before its real control lock wait');
        const published = await policy(true, waived ? 1000 : 2500, placement);
        assert.equal(published.effectiveFrom, placement, 'Concurrent publication applies at the actual captured placement');
        assert.notEqual(published.id, quotedPolicy.versionId, 'Concurrent publication changes immutable policy identity');
        assert.equal((await getEffectiveBusinessSetting(db, 'platform_service_fee_policy', placement)).versionId, published.id);
        // The waived case changes identity without changing zero net money.
        await blocker.commit();
        assert.equal((await checkout).ok, false, 'A stale policy must never commit old customer money or evidence');
        assert.deepEqual(await financial(), before);
      } finally { await blocker.rollback(); await checkout; await policy(); }
    });
    // Each scenario publishes through supported commands on an explicitly
    // simulated logical clock, with the full registered notice interval.
    const notice = 1_296_000_000;
    async function commercial(managed: boolean, bps: number, effectiveAt: number) {
      const key = managed ? 'managed_sale_linked_platform_retention_bps' : 'independent_seller_commission_bps';
      const version = await db.prepare('SELECT MAX(version) n FROM business_setting_versions WHERE setting_key=?').bind(key).first<{ n: number }>();
      return saveBusinessSettingChange(db, { key, value: bps, actorId: 'owner', reason: 'SIMULATED native commercial placement terms',
        requestId: 'native-commercial-' + (++sequence), expectedVersion: Number(version!.n), now: effectiveAt - notice - 1, effectiveFrom: effectiveAt });
    }
    async function acceptCommercial(managed: boolean, at: number, upcoming = false) {
      if (managed) {
        const offers = await getManagedTermsOffers(db, 'seller-b', at);
        const offer = upcoming ? offers.upcoming.find(o => o.retentionBps === 1200)! : offers.current;
        assert.ok(offer);
        return acceptManagedTerms(db, { sellerId: 'seller-b', actorId: 'user-b', offerId: offer.id, context: offer.context,
          language: 'en', requestId: 'native-commercial-accept-' + (++sequence), now: at,
          form: { versionId: 'managed-terms-form', answers: { formId: managedTermsFormId, version: 1, answers: [] } } });
      }
      const offer = await getRegisteredSellerTerms(db, at);
      await db.batch((await prepareSellerCommissionAcceptance(db, { sellerId: 'seller-a', actorId: 'user-a', context: offer.context,
        requestId: 'native-commercial-accept-' + (++sequence), now: at })).statements);
    }
    async function prepareCommercial(managed: boolean) {
      placement += 2 * notice + 1000;
      const requestAt = placement;
      await commercial(managed, 900, requestAt - 100);
      await acceptCommercial(managed, requestAt - 2);
      return requestAt;
    }
    for (const managed of [false, true]) for (const renewed of [false, true])
      await t.test(`${managed ? 'managed' : 'registered'} native scheduled nine-to-twelve crossing rejects ${renewed ? 'renewed' : 'missing renewal'} and conserves every order effect`, async () => {
        await endAll();
        const requestAt = await prepareCommercial(managed), boundary = requestAt + 1;
        await commercial(managed, 1200, boundary);
        if (renewed) await acceptCommercial(managed, managed ? requestAt - 1 : boundary, managed);
        const c = await cart(managed ? 'managed' : 'registered');
        const input = await withCommercialFinancialIntent(db, c.key, c.input, requestAt), before = await financial(true);
        const advancing = afterCustomerFeePreparation(db, () => { placement = boundary + 1; });
        await assert.rejects(createCodOrder(advancing, c.key, c.key, input, requestAt, 'checkout-buyer'), /changed|review|terms/i);
        assert.equal(placement, boundary + 1, 'Clock advances after real checkout preparation');
        assert.deepEqual(await financial(true), before);
        if (renewed) {
          const receipt = await createCodOrder(db, c.key, c.key, input, placement, 'checkout-buyer');
          const money = await db.prepare(managed
            ? 'SELECT s.platform_retention_bps AS bps FROM managed_commercial_snapshots s JOIN order_items i ON i.id=s.order_item_id JOIN orders o ON o.id=i.order_id WHERE o.order_number=?'
            : 'SELECT i.commission_bps AS bps FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.order_number=?').bind(receipt.orderNumber).first<{ bps: number }>();
          assert.equal(money!.bps, 1200);
        }
      });
    for (const managed of [false, true])
      await t.test(`${managed ? 'managed' : 'registered'} native commercial publication commits while checkout really waits for customer control`, async () => {
        await endAll();
        const requestAt = await prepareCommercial(managed), boundary = requestAt + 1;
        const c = await cart(managed ? 'managed' : 'registered');
        const input = await withCommercialFinancialIntent(db, c.key, c.input, requestAt), before = await financial(true), mark = f.traces.length;
        await blocker.beginTransaction();
        await blocker.query("UPDATE customer_fee_waiver_control SET revision=revision WHERE id='default'");
        const advancing = afterCustomerFeePreparation(db, () => { placement = boundary + 1; });
        const checkout = settled(createCodOrder(advancing, c.key, c.key, input, requestAt, 'checkout-buyer'));
        try {
          await f.waitForBlocked(/UPDATE customer_fee_waiver_control/, mark);
          const publication = await commercial(managed, 1200, boundary);
          assert.equal((await getEffectiveBusinessSetting(db, managed ? 'managed_sale_linked_platform_retention_bps'
            : 'independent_seller_commission_bps', placement)).versionId, publication.id);
          // Publications legitimately add audits; preserve those while rejecting
          // every attempted checkout write after the real control wait.
          const afterPublication = await financial(true);
          assert.deepEqual({ ...afterPublication, audit_logs: before.audit_logs }, before);
          await blocker.commit();
          assert.equal((await checkout).ok, false, 'Post-control commercial guard rejects the now-current source');
          assert.deepEqual(await financial(true), afterPublication);
        } finally { await blocker.rollback(); await checkout; }
      });
    await t.test('native accepted supplement retains its own nine percent over a current accepted twelve percent base', async () => {
      placement += 2 * notice + 1000;
      await commercial(false, 1200, placement - 100);
      await acceptCommercial(false, placement - 2);
      const supplement = 'native-legitimate-supplement';
      await scheduleCommissionRate(db, { actorId: 'owner', requestId: supplement, expectedRevision: 0, basisPoints: 900,
        effectiveAt: placement - 10, now: placement - notice - 100, reason: 'SIMULATED legitimate supplemental commission' });
      await acceptCommissionRate(db, { sellerId: 'seller-a', userId: 'user-a', rateId: supplement, now: placement - 2 });
      const c = await cart(), receipt = await place(c);
      const row = await db.prepare('SELECT i.commission_bps,i.commission_rule_version FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.order_number=?')
        .bind(receipt.orderNumber).first<{ commission_bps: number; commission_rule_version: string }>();
      assert.deepEqual([row!.commission_bps, row!.commission_rule_version], [900, supplement]);
      await acceptCommercial(true, placement - 2);
    });
    // Recovery runs after this final suite reset: keep BOTH histories nonempty in this same source.
    await seedNativeLegacyHistory(db);
  } finally { await f.close(); }
});
