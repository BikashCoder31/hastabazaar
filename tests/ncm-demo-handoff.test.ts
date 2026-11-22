import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/public-checkout-runtime';
import { ncmDemoCheckoutFixture, emulateDemoQuotes } from './helpers/ncm-demo-checkout-fixture';
import { manualOrderFixture } from './helpers/manual-payment-fixture';
import { prepareSellerParcels } from '../lib/operations/parcels';

const demoToken = 'f'.repeat(40);

async function readDraft(id: string, jobId: string) {
  const { GET } = await import('../app/api/admin/orders/[id]/parcels/[jobId]/ncm-demo/route');
  const request = new Request(`https://public-checkout.test/api/admin/orders/${id}/parcels/${jobId}/ncm-demo`);
  return GET(request, { params: Promise.resolve({ id, jobId }) });
}

function signIn(userId: string) {
  globalThis.publicCheckoutActor = { userId, authSubject: userId, email: `${userId}@local.hastabazaar.test` };
}

void test('staff can reread both prepared demo COD handoffs with the accepted references, routes and exact cash amounts', async t => {
  const f = await ncmDemoCheckoutFixture(t);
  const rates = emulateDemoQuotes(branch => branch === 'POKHARA' ? '170.00' : '210.00');
  const checkout = await import('../app/api/checkout/route');
  const placed = await checkout.POST(f.request(f.body));
  assert.equal(placed.status, 201, await placed.clone().text());
  const order = await placed.json() as { orderNumber: string; grandTotalPaisa: number };
  assert.equal(order.grandTotalPaisa, 138_000);
  const orderId = String(f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)!.id);
  assert.deepEqual(rates.sort(), ['BIRGUNJ', 'POKHARA']);

  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Unexpected carrier request during draft read'); };
  globalThis.publicCheckoutNcmDemoPickupBranches = undefined;
  signIn('reviewer');
  // A carrier request may create an outbound job before staff prepare its parcel and COD due.
  f.sqlite.prepare(`INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,carrier,created_by,created_request_id,created_at,updated_at)
    VALUES('fixture-early-pickup',?,'registered','outbound','pickup_requested','manual','reviewer','early-pickup',1,1)`).run(orderId);
  assert.equal((await readDraft(orderId, 'fixture-early-pickup')).status, 404);
  const preparation = { orderId, actorId: 'reviewer', requestId: 'fixture-draft-preparation', now: Date.now() };
  await prepareSellerParcels(f.db, preparation);
  const sellers = f.sqlite.prepare(`SELECT j.id AS jobId,a.id AS reference FROM shipping_jobs j
    JOIN order_delivery_shipment_allocations a ON a.order_id=j.order_id AND a.seller_id=j.seller_id
    WHERE j.order_id=? AND j.direction='outbound' ORDER BY j.seller_id`).all(orderId);
  assert.equal(sellers.length, 2);
  assert.notEqual(sellers[0].reference, sellers[1].reference);
  const [pokharaJob, birgunjJob] = sellers.map(seller => String(seller.jobId));
  const expected = [
    { vref_id: sellers[0].reference, originBranch: 'POKHARA', destinationBranch: 'TINKUNE', deliveryPaisa: 17_000, codPaisa: 97_000 },
    { vref_id: sellers[1].reference, originBranch: 'BIRGUNJ', destinationBranch: 'TINKUNE', deliveryPaisa: 21_000, codPaisa: 41_000 },
  ];
  const readBoth = async () => {
    for (const [i, jobId] of [pokharaJob, birgunjJob].entries()) {
      const response = await readDraft(orderId, jobId);
      assert.equal(response.status, 200, await response.clone().text());
      assert.match(response.headers.get('Cache-Control') ?? '', /no-store/i);
      assert.deepEqual(await response.json(), expected[i]);
    }
  };
  await readBoth();
  signIn('customer');
  const replay = await checkout.POST(f.request(f.body));
  assert.equal(replay.status, 201, await replay.clone().text());
  assert.deepEqual(await replay.json(), order);
  await prepareSellerParcels(f.db, preparation);

  const changes = () => f.sqlite.prepare('SELECT total_changes() AS count').get()!.count;
  const before = changes();
  for (const actor of ['customer', 'registered-owner', 'delegate']) {
    signIn(actor);
    assert.equal((await readDraft(orderId, pokharaJob)).status, 403, actor);
  }
  globalThis.publicCheckoutActor = null;
  assert.equal((await readDraft(orderId, pokharaJob)).status, 401);
  signIn('reviewer');
  await readBoth();
  assert.equal((await readDraft('legacy-order', pokharaJob)).status, 404);
  for (const environment of ['local_staging', 'production']) {
    globalThis.publicCheckoutEnvironment = environment;
    assert.equal((await readDraft(orderId, pokharaJob)).status, 404, environment);
  }
  globalThis.publicCheckoutEnvironment = 'test';
  for (const token of [undefined, 'invalid-demo-token']) {
    globalThis.publicCheckoutNcmDemoToken = token;
    assert.equal((await readDraft(orderId, pokharaJob)).status, 404);
  }
  globalThis.publicCheckoutNcmDemoToken = demoToken;
  assert.equal(changes(), before, 'Draft reads and access denials must leave saved records untouched.');

  f.sqlite.exec(`UPDATE staff_permission_profiles SET permissions_json='["order.manage"]' WHERE user_id='delegate'`);
  signIn('delegate');
  await readBoth();
  // The original units still belong to registered. A mismatched job must not expose their handoff.
  f.sqlite.prepare("UPDATE shipping_jobs SET seller_id='maker' WHERE id=?").run(pokharaJob);
  assert.equal((await readDraft(orderId, pokharaJob)).status, 404);
  f.sqlite.prepare("UPDATE shipping_jobs SET status='dispatched' WHERE id=?").run(birgunjJob);
  assert.equal((await readDraft(orderId, birgunjJob)).status, 404);
  assert.equal(networkAttempts, 0);
});

void test('prepared ordinary and legacy COD parcels do not offer a demo handoff', async t => {
  const f = await manualOrderFixture({ method: 'cod' });
  t.after(() => { globalThis.publicCheckoutNcmDemoToken = undefined; globalThis.publicCheckoutActor = null; f.dispose(); });
  globalThis.publicCheckoutDb = f.db;
  globalThis.publicCheckoutNcmDemoToken = demoToken;
  signIn('reviewer');
  await prepareSellerParcels(f.db, { orderId: f.orderId, actorId: 'reviewer', requestId: 'fixture-ordinary-parcel', now: Date.now() });
  const ordinary = f.sqlite.prepare(`SELECT j.id FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=?`).get(f.orderId)!;
  assert.equal((await readDraft(f.orderId, String(ordinary.id))).status, 404);
  f.sqlite.exec(`INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at)
    VALUES('fixture-legacy-parcel','legacy-order','registered','outbound','pickup_requested','reviewer','legacy-parcel',1,1);
    INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,created_at) VALUES('fixture-legacy-parcel',13050,1)`);
  assert.equal((await readDraft('legacy-order', 'fixture-legacy-parcel')).status, 404);
});
