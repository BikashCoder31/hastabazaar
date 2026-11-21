import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { readDispatchParcels } from '../app/admin/orders/dispatch/read-dispatch';
import { courierBookingSummary, dispatchWeightTotal } from '../app/admin/orders/dispatch/packing-summary';
import { parsePackedWeightKg } from '../lib/shipping/packed-weight';
import { packedWeightSchemaAvailable, readPackedParcelPrefill } from '../lib/shipping/packed-weight-storage';
import { getProductWorkspace, saveProductWorkspace, submitProductIntake } from '../lib/products/intake-workspace';
import { getProductPublicationReview, reviewProductPublication } from '../lib/products/publication';
import { post, state } from './helpers/cancellation-fulfillment-fixture';
import { actionableOrderFixture } from './helpers/order-response-fixture';
import { productPublicationFixture } from './helpers/product-publication-fixture';

function defineProductWeight(sqlite: DatabaseSync) {
  assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
  sqlite.exec('ALTER TABLE products ADD COLUMN packed_weight_grams INTEGER');
}

function defineParcelWeight(sqlite: DatabaseSync) {
  assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
  sqlite.exec(`CREATE TABLE seller_parcel_weights (
    order_id TEXT NOT NULL, seller_id TEXT NOT NULL, weight_grams INTEGER NOT NULL, item_count INTEGER NOT NULL,
    recorded_by TEXT NOT NULL, request_id TEXT NOT NULL, recorded_at INTEGER NOT NULL,
    PRIMARY KEY(order_id,seller_id))`);
}

void test('packed weight uses whole grams and rejects out-of-range or ambiguous input', () => {
  for (const [value, grams] of [['0.05', 50], ['.05', 50], ['0.123', 123], ['30.000', 30_000]] as const)
    assert.equal(parsePackedWeightKg(value), grams);
  for (const value of ['', '0.049', '30.001', '-1', '1e1', '5 kg', '2.0001'])
    assert.equal(parsePackedWeightKg(value), null);
});

void test('product weight is private until publication and is skipped if either schema half is missing', async () => {
  const f = await productPublicationFixture();
  try {
    const save = (requestId: string, revision: number, packedWeightGrams?: number) => saveProductWorkspace(f.db,
      { ...f.ctx, requestId, expectedRevision: String(revision), now: f.now + revision + 10 },
      { ...f.input, ...(packedWeightGrams === undefined ? {} : { packedWeightGrams }) });
    assert.equal(await packedWeightSchemaAvailable(f.db), false);
    defineProductWeight(f.sqlite);
    assert.equal(await packedWeightSchemaAvailable(f.db), false);
    const partial = await save('packed-weight-partial-schema', f.attached.revision, 600);
    assert.equal((await getProductWorkspace(f.db, f.ctx.actorId, partial.id)).packedWeightGrams, undefined);
    defineParcelWeight(f.sqlite);
    assert.equal(await packedWeightSchemaAvailable(f.db), true);
    await assert.rejects(save('packed-weight-invalid-product', partial.revision, 49), /0.05 to 30 kg/);
    const saved = await save('packed-weight-draft', partial.revision, 1275);
    const savedAgain = await save('packed-weight-legacy-client-preserve', saved.revision);
    assert.equal((await getProductWorkspace(f.db, f.ctx.actorId, savedAgain.id)).packedWeightGrams, 1275);
    const sent = await submitProductIntake(f.db,
      { ...f.ctx, requestId: 'packed-weight-submit', expectedRevision: String(savedAgain.revision), now: f.now + 20 },
      { draftId: savedAgain.id, versionId: savedAgain.versionId, expectedCaseId: f.sent.caseId,
        expectedCaseRevision: String(f.sent.revision), replaceVersionId: f.sent.versionId, intent: 'review', note: '' });
    const work = await getProductPublicationReview(f.db, 'reviewer', sent.caseId);
    assert.equal(f.sqlite.prepare('SELECT packed_weight_grams AS grams FROM products WHERE id=?').get(work.productId)?.grams, null);
    const reason = 'Approve the exact fictional product and packaging details.';
    await reviewProductPublication(f.db, { actorId: 'reviewer', requestId: 'packed-weight-publish', expectedRevision: String(work.revision), now: f.now + 21 },
      { action: 'approve_and_publish', caseId: sent.caseId, versionId: work.candidate.versionId, expectedCaseRevision: String(work.caseRevision),
        reason, checks: { sameItem: true, accurateCover: true, eligibilityEvidence: [] } });
    assert.equal(f.sqlite.prepare('SELECT packed_weight_grams AS grams FROM products WHERE id=?').get(work.productId)?.grams, 1275);
    assert.doesNotMatch(String(f.sqlite.prepare('SELECT public_json AS value FROM product_publication_decisions WHERE version_id=?').get(work.candidate.versionId)?.value), /packedWeight/);
    assert.deepEqual({ ...f.sqlite.prepare("SELECT actor_id AS actor,reason FROM audit_logs WHERE action='product.packed_weight.published'").get() }, { actor: 'reviewer', reason });
  } finally { f.dispose(); }
});

void test('seller readiness preserves the legacy wire and dispatch with migration missing', async () => {
  const f = await actionableOrderFixture();
  try {
    state.db = f.db;
    state.actor = 'registered-owner';
    const { POST } = await import('../app/api/seller/orders/[id]/fulfillment/route');
    const path = `/api/seller/orders/${f.orderId}/fulfillment`;
    const context = { params: Promise.resolve({ id: f.orderId }) };
    const base = { itemIds: f.rows.map(row => String(row.id)), note: 'Fictional selected items for packing.' };
    const start = await POST(post(path, { ...base, action: 'start_packing', requestId: 'legacy-weight-start' }, state.actor), context);
    assert.equal(start.status, 200, await start.text());
    const original = { ...base, action: 'ready_for_pickup', requestId: 'legacy-weight-ready' };
    const ready = await POST(post(path, original, state.actor), context);
    assert.equal(ready.status, 200, await ready.text());
    const [parcel] = await readDispatchParcels(f.db, { orderId: f.orderId, sellerId: String(f.rows[0].sellerId) });
    assert.equal(parcel.lane, 'ready');
    assert.equal(parcel.packedWeightGrams, undefined);
    defineProductWeight(f.sqlite);
    defineParcelWeight(f.sqlite);
    const replay = await POST(post(path, original, state.actor), context);
    assert.equal(replay.status, 200, await replay.text());
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_parcel_weights').get()?.n, 0);
    const [historical] = await readDispatchParcels(f.db, { orderId: f.orderId, sellerId: String(f.rows[0].sellerId) });
    assert.equal(historical.packedWeightGrams, null);
    assert.equal(dispatchWeightTotal([historical]), 'Weight not recorded');
  } finally { state.db = null; f.dispose(); }
});

void test('seller readiness validates actual weight, stays exact across retries and totals each parcel once', async () => {
  const f = await actionableOrderFixture({ secondOffer: true });
  try {
    state.db = f.db;
    state.actor = 'registered-owner';
    const sellerId = String(f.rows[0].sellerId);
    assert.ok(f.rows.length > 1 && f.rows.every(row => row.sellerId === sellerId));
    defineProductWeight(f.sqlite);
    defineParcelWeight(f.sqlite);
    assert.equal(await readPackedParcelPrefill(f.db, f.orderId, sellerId), null);
    f.sqlite.prepare('UPDATE products SET packed_weight_grams=500 WHERE seller_id=?').run(sellerId);
    const quantity = Number(f.sqlite.prepare('SELECT SUM(quantity) AS n FROM order_items WHERE order_id=? AND seller_id=?').get(f.orderId, sellerId)?.n);
    assert.equal(await readPackedParcelPrefill(f.db, f.orderId, sellerId), quantity * 500);
    const { POST } = await import('../app/api/seller/orders/[id]/fulfillment/route');
    const path = `/api/seller/orders/${f.orderId}/fulfillment`;
    const context = { params: Promise.resolve({ id: f.orderId }) };
    const itemIds = f.rows.map(row => String(row.id));
    const base = { itemIds, note: 'Fictional parcel is packed for this courier.' };
    const action = (body: Record<string, unknown>) => POST(post(path, { ...base, ...body }, state.actor), context);
    const start = await action({ action: 'start_packing', requestId: 'new-weight-start' });
    assert.equal(start.status, 200, await start.text());
    for (const packedParcelWeightGrams of [undefined, 30_001, 0.5, '600']) {
      const invalid = await action({ action: 'ready_for_pickup', requestId: 'weight-invalid-' + crypto.randomUUID(), packedParcelWeightGrams });
      assert.equal(invalid.status, 400, await invalid.clone().text());
      assert.equal((await invalid.json() as { phase: string }).phase, 'before_write');
    }
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_parcel_weights').get()?.n, 0);
    const first = { action: 'ready_for_pickup', requestId: 'ready-first-items', itemIds: itemIds.slice(0, 1), packedParcelWeightGrams: 1370 };
    const firstResponse = await action(first);
    assert.equal(firstResponse.status, 200, await firstResponse.text());
    const last = await action({ action: 'ready_for_pickup', requestId: 'ready-rest-items', itemIds: itemIds.slice(1), packedParcelWeightGrams: 2400 });
    assert.equal(last.status, 200, await last.text());
    const repeat = await action(first);
    assert.equal(repeat.status, 200, await repeat.text());
    const recorded = f.sqlite.prepare('SELECT weight_grams AS grams, request_id AS requestId FROM seller_parcel_weights').all();
    assert.deepEqual(recorded.map(row => ({ ...row })), [{ grams: 2400, requestId: 'ready-rest-items' }]);
    const audit = f.sqlite.prepare("SELECT next_json AS result FROM audit_logs WHERE action='order.seller.ready_for_pickup' AND request_id='ready-rest-items'").get();
    assert.equal(JSON.parse(String(audit?.result)).packedParcelWeightGrams, 2400);
    const parcels = await readDispatchParcels(f.db, { orderId: f.orderId, sellerId });
    assert.equal(parcels.length, 1);
    const [parcel] = parcels;
    assert.equal(parcel.packedWeightGrams, 2400);
    const other = { ...parcel, orderNumber: 'HB-FICTIONAL', key: 'other', packedWeightGrams: 850 };
    assert.equal(dispatchWeightTotal([parcel, other, parcel]), 'Total weight 3.25 kg');
    assert.equal(dispatchWeightTotal([parcel, { ...other, packedWeightGrams: null }]), 'Recorded weight 2.4 kg · 1 missing');
    const summary = courierBookingSummary([parcel, other, parcel]);
    assert.match(summary, /Total weight 3\.25 kg/);
    assert.match(summary, /HB-FICTIONAL.+0\.85 kg/);
    assert.equal(summary.split(parcel.orderNumber).length, 2);
    f.sqlite.prepare('UPDATE seller_parcel_weights SET item_count=item_count+1 WHERE order_id=?').run(f.orderId);
    const [changedPortion] = await readDispatchParcels(f.db, { orderId: f.orderId, sellerId });
    assert.equal(changedPortion.packedWeightGrams, null);
  } finally { state.db = null; f.dispose(); }
});
