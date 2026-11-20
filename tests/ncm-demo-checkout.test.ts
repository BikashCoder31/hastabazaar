import assert from 'node:assert/strict';
import test from 'node:test';
import { ncmDemoCheckoutFixture as setup, emulateDemoQuotes, reviewedRoutes } from './helpers/ncm-demo-checkout-fixture';
import { getCart } from '../lib/db/repositories/cart';
import { prepareSellerParcels } from '../lib/operations/parcels';

void test('NCM demo COD keeps the two accepted branch quotes and shipment references through replay and parcel preparation', async t => {
  const f = await setup(t);
  let swapped = true;
  let movedPickup = false;
  const requested = emulateDemoQuotes(branch => {
    if (movedPickup && branch === 'BIRGUNJ')
      f.sqlite.prepare("UPDATE seller_operational_addresses SET updated_at=updated_at+1 WHERE seller_id='secondary' AND purpose='pickup'").run();
    return (branch === 'POKHARA') !== swapped ? '170.00' : '210.00';
  });
  const { POST } = await import('../app/api/checkout/route');
  const orderCount = () => f.sqlite.prepare('SELECT COUNT(*) AS count FROM orders').get()!.count;
  const before = orderCount();
  const stale = await POST(f.request(f.body));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json() as { code: string }).code, 'quote_changed');
  assert.equal(orderCount(), before);

  swapped = false;
  movedPickup = true;
  const moved = await POST(f.request(f.body));
  assert.equal(moved.status, 409, await moved.clone().text());
  assert.equal((await moved.json() as { code: string }).code, 'quote_changed');
  assert.equal(orderCount(), before);
  assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved, 0);

  movedPickup = false;
  const unassigned = await POST(f.request(f.body));
  assert.equal(unassigned.status, 503);
  assert.equal((await unassigned.json() as { code: string }).code, 'ncm_quote_unavailable');
  assert.equal(requested.length, 4);
  f.assignDemoBranches();
  const placed = await POST(f.request(f.body));
  const result = await placed.json() as { orderNumber: string; grandTotalPaisa: number };
  assert.equal(placed.status, 201, JSON.stringify(result));
  assert.deepEqual(requested.sort(), ['BIRGUNJ', 'BIRGUNJ', 'BIRGUNJ', 'POKHARA', 'POKHARA', 'POKHARA']);
  assert.equal(result.grandTotalPaisa, 138_000);
  const order = f.sqlite.prepare('SELECT id,delivery_charge_paisa,delivery_rate_snapshot_json FROM orders WHERE order_number=?').get(result.orderNumber)!;
  assert.equal(order.delivery_charge_paisa, 38_000);
  const snapshot = JSON.parse(String(order.delivery_rate_snapshot_json));
  assert.equal(snapshot.ncmDemo.service, 'Pickup/Collect');
  const readAllocations = () => f.sqlite.prepare(`SELECT seller_id AS sellerId,id AS vref_id,amount_paisa AS amountPaisa
    FROM order_delivery_shipment_allocations WHERE order_id=? ORDER BY seller_id`).all(order.id).map(row => ({ ...row }));
  const allocated = readAllocations();
  assert.deepEqual(allocated.map(row => [row.sellerId, row.amountPaisa]), [['registered', 17_000], ['secondary', 21_000]]);
  assert.equal(new Set(allocated.map(row => row.vref_id)).size, 2);
  for (const row of allocated) assert.match(String(row.vref_id), /^HB[A-F0-9]{18}$/);
  assert.deepEqual(snapshot.ncmDemo.shipments, reviewedRoutes.map((quote, i) => ({ ...quote, vref_id: allocated[i].vref_id })));

  const replay = await POST(f.request(f.body));
  assert.equal(replay.status, 201, await replay.clone().text());
  assert.deepEqual(await replay.json(), result);
  assert.equal(requested.length, 6, 'A committed checkout must replay without a fresh carrier call.');
  assert.equal(orderCount(), Number(before) + 1);
  assert.deepEqual(readAllocations(), allocated);

  const preparation = { orderId: String(order.id), actorId: 'reviewer', requestId: 'demo-ncm-parcels', now: Date.now() };
  const parcelDues = () => f.sqlite.prepare(`SELECT DISTINCT j.seller_id AS sellerId,a.id AS vref_id,p.cod_due_paisa AS codPaisa
    FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id
    JOIN order_delivery_unit_parcels m ON m.shipping_job_id=j.id
    JOIN order_delivery_unit_allocations u ON u.order_item_id=m.order_item_id AND u.unit_ordinal=m.unit_ordinal
    JOIN order_delivery_shipment_allocations a ON a.id=u.shipment_id
    WHERE j.order_id=? ORDER BY j.seller_id`).all(order.id).map(row => ({ ...row }));
  await prepareSellerParcels(f.db, preparation);
  assert.deepEqual(parcelDues(), [
    { sellerId: 'registered', vref_id: allocated[0].vref_id, codPaisa: 97_000 },
    { sellerId: 'secondary', vref_id: allocated[1].vref_id, codPaisa: 41_000 },
  ]);
  await prepareSellerParcels(f.db, preparation);
  assert.equal(parcelDues().reduce((sum, row) => sum + Number(row.codPaisa), 0), result.grandTotalPaisa);
  t.diagnostic('NPR 170 and NPR 210 delivery, NPR 970 and NPR 410 COD, two stable 20-character references.');
});

void test('sellers sharing a pickup branch each retain the quoted fractional charge and their parcel reference on replay', async t => {
  const f = await setup(t);
  f.assignDemoBranches('POKHARA');
  let carrierAvailable = true;
  const requested = emulateDemoQuotes(() => carrierAvailable ? '170.05' : null);
  const quoteRoute = await import('../app/api/checkout/ncm-demo-quote/route');
  const quote = await quoteRoute.POST(f.quoteRequest());
  assert.equal(quote.status, 200, await quote.clone().text());
  const review = await quote.json() as { deliveryPaisa: number; quotes: typeof reviewedRoutes };
  assert.deepEqual(review, {
    deliveryPaisa: 34_010,
    quotes: ['registered', 'secondary'].map(sellerId => ({ sellerId, originBranch: 'POKHARA', destinationBranch: 'TINKUNE', amountPaisa: 17_005 })),
  });
  assert.deepEqual(requested, ['POKHARA']);

  const body = {
    ...f.body,
    reviewedQuote: { ...f.body.reviewedQuote, deliveryPaisa: review.deliveryPaisa, ncmDemoQuotes: review.quotes, payablePaisa: 134_010 },
  };
  const checkout = await import('../app/api/checkout/route');
  const placed = await checkout.POST(f.request(body));
  assert.equal(placed.status, 201, await placed.clone().text());
  const order = await placed.json() as { orderNumber: string; grandTotalPaisa: number };
  assert.equal(order.grandTotalPaisa, 134_010);
  assert.deepEqual(requested, ['POKHARA', 'POKHARA']);
  const orderId = String(f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)!.id);
  await prepareSellerParcels(f.db, { orderId, actorId: 'reviewer', requestId: 'shared-branch-parcels', now: Date.now() });
  const parcels = () => f.sqlite.prepare(`SELECT a.seller_id AS sellerId,a.id AS reference,a.amount_paisa AS charge,p.cod_due_paisa AS due
    FROM order_delivery_shipment_allocations a JOIN shipping_jobs j ON j.order_id=a.order_id AND j.seller_id=a.seller_id AND j.direction='outbound'
    JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE a.order_id=? ORDER BY a.seller_id`).all(orderId);
  const saved = parcels();
  assert.deepEqual(saved.map(row => [row.sellerId, row.charge, row.due]), [
    ['registered', 17_005, 97_005], ['secondary', 17_005, 37_005],
  ]);
  assert.equal(new Set(saved.map(row => row.reference)).size, 2);

  carrierAvailable = false;
  const replay = await checkout.POST(f.request(body));
  assert.equal(replay.status, 201, await replay.clone().text());
  assert.deepEqual(await replay.json(), order);
  assert.deepEqual(requested, ['POKHARA', 'POKHARA']);
  assert.deepEqual(parcels(), saved);
});

void test('the demo quote route uses the real cart, is disabled in normal runtime, and fails when one route is unavailable', async t => {
  const f = await setup(t);
  let birgunjAvailable = true;
  const requested = emulateDemoQuotes(branch => branch === 'POKHARA' ? '170.00' : birgunjAvailable ? '210.00' : null);
  const quotes = await import('../app/api/checkout/ncm-demo-quote/route');
  globalThis.publicCheckoutEnvironment = 'local_staging';
  assert.equal((await quotes.POST(f.quoteRequest())).status, 404);
  assert.deepEqual(requested, []);
  globalThis.publicCheckoutEnvironment = 'test';
  globalThis.publicCheckoutNcmDemoPickupBranches = undefined;
  assert.equal((await quotes.POST(f.quoteRequest())).status, 503);
  assert.deepEqual(requested, []);
  f.assignDemoBranches();
  const quote = await quotes.POST(f.quoteRequest());
  assert.equal(quote.status, 200, await quote.clone().text());
  assert.deepEqual(await quote.json(), { deliveryPaisa: 38_000, quotes: reviewedRoutes });

  birgunjAvailable = false;
  const before = f.sqlite.prepare('SELECT COUNT(*) AS count FROM orders').get()!.count;
  for (const result of [await quotes.POST(f.quoteRequest()), await (await import('../app/api/checkout/route')).POST(f.request(f.body))]) {
    assert.equal(result.status, 503, await result.clone().text());
    const value = await result.json() as { code: string; error: string };
    assert.equal(value.code, 'ncm_quote_unavailable');
    assert.match(value.error, /BIRGUNJ/);
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM orders').get()!.count, before);
  assert.equal((await getCart(f.db, f.cartHash)).items.length, 2);
});
