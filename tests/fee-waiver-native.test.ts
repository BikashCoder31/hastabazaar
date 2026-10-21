import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import mysql, { type Pool, type Connection } from 'mysql2/promise';
import { stagingNativeFixture } from './helpers/staging-native-fixture';
import { feeWaiverCheckoutFixture, feeWaiverContext as ctx, feeWaiverTerms as terms, interleaveFeeWaiverBatch } from './helpers/fee-waiver-fixture';
import { getFeeWaiverState, mutateFeeWaiver, readOrderMarketplaceFees } from '../lib/db/repositories/fee-waivers';
import { createCodOrder } from '../lib/db/repositories/orders';
import { transitionAdminFulfillment } from '../lib/db/repositories/fulfillment';
import { createCustomerReturnRequest, reviewReturnAsAdmin, advanceReturnAsAdmin } from '../lib/db/repositories/returns';
import { getCommissionReport } from '../lib/db/repositories/commission-reporting';

// The standard suite deliberately reports this one parent test skipped. The
// native runner requires all 12 nested scenarios (13 tests) to execute, no skips.
const enabled = process.env.HATSKALA_STAGING_NATIVE === '1';
const pools: Pool[] = [], originalCreatePool = mysql.createPool;
let connection: Connection | undefined;
if (enabled) {
  const scope = await stagingNativeFixture();
  mysql.createPool = ((...args: Parameters<typeof originalCreatePool>) => { const pool = originalCreatePool(...args); pools.push(pool); return pool; }) as typeof originalCreatePool;
  connection = await mysql.createConnection(scope);
}
after(async () => { mysql.createPool = originalCreatePool; await connection?.end(); for (const pool of pools) await pool.end(); });

void test('native MariaDB fee campaigns, checkout, returns and immutable recovery evidence', { skip: !enabled }, async t => {
  assert.ok(connection);
  const native = connection;
  const { env } = await import('../lib/runtime/node-bindings');
  const db = env.DB;
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>())?.n, 0, 'Runner must supply an empty owned fixture');
  const fixture = await feeWaiverCheckoutFixture();
  let input: typeof fixture.input;
  try {
    input = fixture.input;
    // Copy explicit fictional prerequisite records only. All operations below
    // run on the real MariaDB adapter with its transactions and SQL translator.
    for (const table of ['users', 'user_roles', 'seller_profiles', 'business_setting_versions', 'seller_agreement_acceptance_history', 'account_email_verifications', 'account_phone_verifications', 'categories', 'products'])
      for (const row of fixture.sqlite.prepare(`SELECT * FROM ${table}${table === 'categories' ? " WHERE id='cat'" : ''}`).all()) {
        const columns = Object.keys(row);
        await db.prepare(`INSERT INTO ${table} (${columns.map(c => '`' + c + '`').join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...Object.values(row)).run();
      }
  } finally { await fixture.dispose(); }
  await db.prepare('UPDATE products SET inventory_quantity=100,return_eligible=1').run();
  await db.prepare('UPDATE seller_profiles SET approved_at=0').run();
  let placement = 100, sequence = 0;
  t.mock.method(Date, 'now', () => placement);
  async function command(request: string, value: Parameters<typeof mutateFeeWaiver>[2]) {
    return mutateFeeWaiver(db, ctx(request, (await getFeeWaiverState(db)).revision), value);
  }
  async function campaign(key: string, startsAt = 10, endsAt = 1000) {
    const draft = await command(key + '-create', { type: 'create', terms: { ...terms, startsAt, endsAt } });
    return command(key + '-publish', { type: 'publish', campaignId: draft.id });
  }
  async function endAll() {
    for (const c of (await getFeeWaiverState(db)).campaigns.filter(c => c.state !== 'ended')) await command('end-' + c.id + '-' + c.revision, { type: 'end', campaignId: c.id });
  }
  async function cart(quantity = 1) {
    const key = 'fee-native-' + (++sequence);
    await db.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES(?,?,'NPR',1,1)").bind(key, key).run();
    await db.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES(?,?,'product',?,1,1)").bind(key, key, quantity).run();
    return { key, input: { ...input, idempotencyKey: key } };
  }
  async function totals() {
    const counts: Record<string, number> = {};
    for (const table of ['orders', 'payments', 'order_item_marketplace_fees', 'cart_items']) counts[table] = Number((await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first<{ n: number }>())?.n);
    counts.stock = Number((await db.prepare("SELECT inventory_quantity n FROM products WHERE id='product'").first<{ n: number }>())?.n);
    return counts;
  }
  async function rejectCheckout(compete?: () => Promise<unknown>, selectedAt = 100) {
    const c = await cart(), before = await totals();
    const target = compete ? interleaveFeeWaiverBatch(db, compete) : db;
    await assert.rejects(createCodOrder(target, c.key, c.key, c.input, selectedAt, 'checkout-buyer'));
    assert.deepEqual(await totals(), before, 'rejected checkout conserves all stock, cart and financial rows');
  }

  await t.test('concurrent independent campaign writes claim one global revision', async () => {
    const revision = (await getFeeWaiverState(db)).revision;
    const results = await Promise.allSettled(['race-a', 'race-b'].map(key => mutateFeeWaiver(db, ctx(key, revision), { type: 'create', terms })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await getFeeWaiverState(db)).revision, revision + 1);
  });
  await t.test('audit failure rolls back control, campaign, revision and request receipt', async () => {
    const before = await getFeeWaiverState(db);
    await native.query("CREATE TRIGGER fee_fixture_reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture_fee_audit_failure'");
    try { await assert.rejects(command('audit-rollback', { type: 'create', terms }), /fixture_fee_audit_failure/); }
    finally { await native.query('DROP TRIGGER fee_fixture_reject_audit'); }
    assert.deepEqual(await getFeeWaiverState(db), before);
    assert.equal(await db.prepare("SELECT 1 FROM marketplace_fee_waiver_requests WHERE request_id='audit-rollback'").first(), null);
  });
  await t.test('live role revocation between state read and commit rejects mutation and replay', async () => {
    const revision = (await getFeeWaiverState(db)).revision;
    const revoked = interleaveFeeWaiverBatch(db, async () => native.query("DELETE FROM user_roles WHERE user_id='owner' AND role='super_admin'"));
    await assert.rejects(mutateFeeWaiver(revoked, ctx('revoked-native', revision), { type: 'create', terms }));
    assert.equal((await getFeeWaiverState(db)).revision, revision);
    await assert.rejects(mutateFeeWaiver(db, ctx('race-a', 0), { type: 'create', terms }));
    await native.query("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('owner','super_admin',1)");
  });
  await t.test('checkout absence guard rejects a concurrently published campaign', async () => {
    await endAll(); placement = 100;
    await rejectCheckout(() => campaign('absence'));
  });
  await t.test('checkout revision guard rejects a concurrently paused campaign', async () => {
    const active = (await getFeeWaiverState(db)).campaigns.find(c => c.state === 'published')!;
    await rejectCheckout(() => command('checkout-pause', { type: 'pause', campaignId: active.id }));
    await endAll();
  });
  for (const boundary of ['start', 'end'] as const) await t.test(`checkout exact ${boundary} boundary rejects the earlier selection`, async () => {
    await endAll(); await campaign('boundary-' + boundary, boundary === 'start' ? 200 : 10, 1000);
    placement = boundary === 'start' ? 200 : 1000;
    await rejectCheckout(); placement = 100;
  });
  await t.test('native fee insert failure rolls back order, payment, evidence and stock', async () => {
    await endAll(); await campaign('insert-rollback');
    await native.query("CREATE TRIGGER fee_fixture_reject_insert BEFORE INSERT ON order_item_marketplace_fees FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture_fee_insert_failure'");
    try { await rejectCheckout(); } finally { await native.query('DROP TRIGGER fee_fixture_reject_insert'); }
  });
  let savedItem = '', savedOrder = '';
  await t.test('overlapping campaigns attribute one full waiver and checkout retry replays original evidence', async () => {
    await endAll(); const a = await campaign('overlap-a'), b = await campaign('overlap-b');
    const c = await cart();
    const receipt = await createCodOrder(db, c.key, c.key, c.input, 100, 'checkout-buyer');
    const rows = await db.prepare('SELECT f.*,i.order_id FROM order_item_marketplace_fees f JOIN order_items i ON i.id=f.order_item_id').all<{ order_item_id: string; order_id: string; campaign_id: string; standard_paisa: number; waived_paisa: number; net_paisa: number }>();
    assert.equal(rows.results.length, 1);
    const evidence = rows.results[0]; savedItem = evidence.order_item_id; savedOrder = evidence.order_id;
    assert.equal(evidence.campaign_id, [a.id, b.id].sort()[0]);
    assert.equal(evidence.standard_paisa, 1000); assert.equal(evidence.waived_paisa, 1000); assert.equal(evidence.net_paisa, 0);
    await endAll();
    assert.deepEqual(await createCodOrder(db, c.key, c.key, c.input, 2000, 'checkout-buyer'), receipt);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM order_item_marketplace_fees').first<{ n: number }>())?.n, 1);
  });
  await t.test('native IDs, revision versions and line evidence remain immutable and constraints reject partial waivers', async () => {
    assert.ok(savedItem && savedOrder);
    for (const sql of [
      "UPDATE marketplace_fee_waiver_revisions SET name='changed'", 'DELETE FROM marketplace_fee_waiver_revisions',
      "UPDATE marketplace_fee_waiver_requests SET response_json='{}'", 'DELETE FROM marketplace_fee_waiver_requests',
      'DELETE FROM marketplace_fee_waiver_campaigns', "UPDATE marketplace_fee_waiver_campaigns SET id=CONCAT(id,'-changed')",
      'UPDATE order_item_marketplace_fees SET net_paisa=0', 'DELETE FROM order_item_marketplace_fees',
      "INSERT INTO marketplace_fee_waiver_control VALUES('other',0)",
    ]) await assert.rejects(native.query(sql), sql);
    const c = await cart(); await createCodOrder(db, c.key, c.key, c.input, 100, 'checkout-buyer');
    const ordinary = await db.prepare('SELECT f.* FROM order_item_marketplace_fees f WHERE campaign_id IS NULL').first<{ order_item_id: string; net_paisa: number }>();
    assert.equal(ordinary?.net_paisa, 1000);
    await assert.rejects(native.query('INSERT INTO order_item_marketplace_fees SELECT * FROM order_item_marketplace_fees LIMIT 1'));
    await db.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,created_at)
      VALUES('native-constraint-line',?,'product','seller-a','Fictional shop','Craft','SKU',10000,1,1000,1000,10000,100)`).bind(savedOrder).run();
    const insert = (standard: number, waived: number, net: number, campaignId: string | null = null, revision: number | null = null) => native.query("INSERT INTO order_item_marketplace_fees(order_item_id,standard_bps,base_paisa,standard_paisa,waived_paisa,net_paisa,campaign_id,campaign_revision,created_at) VALUES('native-constraint-line',1000,10000,?,?,?,?,?,100)", [standard, waived, net, campaignId, revision]);
    for (const amounts of [[1000, 200, 800], [1000, 0, 0], [1000, 1001, -1]]) await assert.rejects(insert(...amounts as [number, number, number]), /CONSTRAINT/);
    await assert.rejects(insert(1000, 1000, 0, 'absent-campaign', 1), /foreign key constraint/i);
    await insert(1000, 0, 1000);
  });
  for (const waived of [false, true]) await t.test(`${waived ? 'waived' : 'ordinary'} partial return reverses recorded net and retains the original revision snapshot`, async () => {
    await endAll(); if (waived) await campaign('return-waiver');
    placement = 100; const c = await cart(3);
    const placed = await createCodOrder(db, c.key, c.key, c.input, 100, 'checkout-buyer');
    const item = await db.prepare('SELECT i.id,i.order_id,o.order_number FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.order_number=?').bind(placed.orderNumber).first<{ id: string; order_id: string; order_number: string }>();
    assert.ok(item);
    const evidence = await db.prepare('SELECT * FROM order_item_marketplace_fees WHERE order_item_id=?').bind(item.id).first();
    await db.prepare("UPDATE orders SET status='dispatched' WHERE id=?").bind(item.order_id).run();
    await db.prepare("UPDATE order_items SET fulfillment_status='dispatched' WHERE id=?").bind(item.id).run();
    await transitionAdminFulfillment(db, { orderId: item.order_id, actorId: 'owner', action: 'deliver', note: 'Fictional native delivery', requestId: c.key + '-deliver', now: 200 });
    const request = await createCustomerReturnRequest(db, { orderNumber: item.order_number, receiptTokenHash: c.key, customerId: 'checkout-buyer', orderItemId: item.id, quantity: 1, reason: 'defective', requestedResolution: 'refund', detail: 'Fictional native product has a documented defect.', locale: 'en-NP', idempotencyKey: c.key + '-return', evidence: [], now: 210 });
    await reviewReturnAsAdmin(db, { returnRequestId: request.id, actorId: 'owner', actorRole: 'super_admin', action: 'approve', note: 'Fictional refund approved', publicMessageEn: 'Refund approved.', publicMessageNe: 'Refund approved.', responsibility: 'seller', outcome: 'refund', itemRefundPaisa: 10000, deliveryRefundPaisa: 0, requestId: c.key + '-approve', now: 220 });
    const options = { returnRequestId: request.id, actorId: 'owner', actorRole: 'super_admin' as const, note: 'Fictional refund processing', publicMessageEn: 'Refund update.', publicMessageNe: 'Refund update.' };
    await advanceReturnAsAdmin(db, { ...options, action: 'start_refund', requestId: c.key + '-start', now: 230 });
    const complete = { ...options, action: 'complete_refund' as const, reference: c.key + '-reference', requestId: c.key + '-complete', now: 240 };
    await advanceReturnAsAdmin(db, complete); await advanceReturnAsAdmin(db, complete);
    assert.equal((await db.prepare('SELECT commission_reversal_paisa FROM refunds WHERE return_request_id=?').bind(request.id).first<{ commission_reversal_paisa: number }>())?.commission_reversal_paisa, waived ? 0 : 1000);
    assert.deepEqual(await db.prepare('SELECT * FROM order_item_marketplace_fees WHERE order_item_id=?').bind(item.id).first(), evidence);
    const breakdown = (await readOrderMarketplaceFees(db, [item.id])).get(item.id)!;
    assert.equal(breakdown.standardPaisa, 3000); assert.equal(breakdown.netPaisa, waived ? 0 : 3000);
    const report = await getCommissionReport(db, {});
    const row = report.rows.find(row => row.orderId === item.order_id);
    assert.equal(String(row?.originalCommissionPaisa), waived ? '0' : '3000');
  });
});
