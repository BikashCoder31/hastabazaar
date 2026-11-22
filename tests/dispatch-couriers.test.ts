import assert from 'node:assert/strict';
import test from 'node:test';
import { readDispatchParcels } from '../app/admin/orders/dispatch/read-dispatch';
import { courierBookingCsv, courierBookingDetailsText, courierSheetColumns, type CourierParcelDetails } from '../app/admin/orders/dispatch/courier-details';
import { operateParcel } from '../lib/operations/parcels';
import { post, state } from './helpers/cancellation-fulfillment-fixture';
import { manualOrderFixture } from './helpers/manual-payment-fixture';
import { actionableOrderFixture } from './helpers/order-response-fixture';
import { installFixtureTables } from './helpers/delivery-partner-fixture';

const path = '/admin/orders/dispatch/details';

function installReadyParcel(f: Awaited<ReturnType<typeof manualOrderFixture>>) {
  const row = f.sqlite.prepare('SELECT seller_id AS id FROM order_items WHERE order_id=? LIMIT 1').get(f.orderId)!;
  const sellerId = String(row.id);
  f.sqlite.prepare("UPDATE orders SET status='ready_for_pickup',shipping_address_json=?,customer_phone=? WHERE id=?")
    .run(JSON.stringify({ recipientName: 'Parcel, Recipient', phone: '+9779812345678', province: 'Bagmati', district: 'Lalitpur',
      municipality: 'Godawari', ward: '5', locality: 'Test Road', landmark: 'Next to "the shop"' }), '9800000000', f.orderId);
  f.sqlite.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup',product_name_snapshot='=Example' WHERE order_id=? AND seller_id=?")
    .run(f.orderId, sellerId);
  return { orderId: f.orderId, sellerId, version: null, jobId: null };
}

void test('dispatch details and export use the saved recipient, selected parcel and exact COD allocation', async () => {
  const f = await manualOrderFixture({ method: 'cod' });
  try {
    state.db = f.db;
    state.actor = 'reviewer';
    const selection = installReadyParcel(f);
    const booking = await readDispatchParcels(f.db, selection);
    assert.doesNotMatch(JSON.stringify(booking), /Parcel, Recipient|9812345678|Next to/);
    const { POST } = await import('../app/admin/orders/dispatch/details/route');
    const request = (mode: string, parcels = [selection], actor = 'reviewer') => POST(post(path, { mode, parcels }, actor));
    assert.equal((await request('details', [selection], 'customer')).status, 403);
    const result = await request('details');
    assert.equal(result.status, 200, await result.clone().text());
    const { parcels } = await result.json() as { parcels: CourierParcelDetails[] };
    assert.equal(parcels[0].receiver, 'Parcel, Recipient');
    assert.equal(parcels[0].phone, '+9779812345678');
    assert.match(parcels[0].address, /Ward 5, Test Road, Next to "the shop", Godawari, Lalitpur/);
    assert.equal(parcels[0].codDuePaisa, f.order.grandTotalPaisa);
    assert.match(courierBookingDetailsText(parcels), /COD NPR .+\nWeight not recorded/);
    const csv = await request('sheet');
    assert.equal(csv.status, 200, await csv.clone().text());
    assert.equal(csv.headers.get('cache-control'), 'private, no-store');
    const body = await csv.text();
    assert.equal(body, courierBookingCsv(parcels));
    assert.equal(body.split('\r\n')[0], courierSheetColumns.map(name => `"${name}"`).join(','));
    assert.match(body, /"'\+9779812345678"/);
    assert.match(body, /Next to ""the shop""/);
    assert.match(body, /"'=Example/);
    const audit = f.sqlite.prepare("SELECT actor_id AS actor,next_json AS detail FROM audit_logs WHERE action='dispatch.courier_sheet.downloaded'").all();
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor, 'reviewer');
    assert.doesNotMatch(String(audit[0].detail), /9812345678|Test Road/);
    assert.equal((await request('sheet', [selection, selection])).status, 400);
    f.sqlite.prepare("UPDATE order_items SET fulfillment_status='dispatched' WHERE order_id=?").run(f.orderId);
    assert.equal((await request('sheet')).status, 409);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='dispatch.courier_sheet.downloaded'").get()?.n, 1);
  } finally { state.db = null; f.dispose(); }
});

void test('manual parcel booking works before upgrade and saves a stable configured partner on replay', async () => {
  for (const upgraded of [false, true]) {
    const f = await actionableOrderFixture();
    try {
      const target = installReadyParcel(f);
      state.db = f.db;
      state.actor = 'reviewer';
      const { POST } = await import('../app/admin/orders/dispatch/details/route');
      const response = await POST(post(path, { mode: 'details', parcels: [target] }, 'reviewer'));
      assert.equal(response.status, 200, await response.clone().text());
      const details = await response.json() as { parcels: CourierParcelDetails[] };
      assert.match(courierBookingDetailsText(details.parcels), /Prepaid · collect NPR 0/);
      if (upgraded) {
        installFixtureTables(f.sqlite);
        f.sqlite.exec("INSERT INTO delivery_partners(id,name,status,booking_mode,collects_cod,tracking_pattern,default_slot,created_at,updated_at) VALUES('upaya','Upaya','in_use','manual',1,'https://example.test/track/{number}',1,1,1)");
      }
      const { POST: book } = await import('../app/admin/orders/dispatch/booking/route');
      const bookingPath = '/admin/orders/dispatch/booking';
      const body = { ...target, action: 'assign', requestId: 'courier-booking-regression', formVersion: 1, customAnswers: [],
        courierName: upgraded ? 'Upaya' : 'Nepal Can Move', trackingCode: 'TEST/42',
        pickupStart: Date.now() + 60_000, pickupEnd: Date.now() + 3_600_000,
        ...(upgraded ? { deliveryPartnerId: 'upaya' } : {}) };
      const first = await book(post(bookingPath, body, 'reviewer'));
      assert.equal(first.status, 200, await first.text());
      const row = f.sqlite.prepare(`SELECT p.courier_name AS courier,p.tracking_url AS url,p.shipping_job_id AS job,j.tracking_code AS code
        ${upgraded ? ',p.delivery_partner_id AS partner' : ''} FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=?`).get(f.orderId)!;
      assert.equal(row.courier, body.courierName);
      assert.equal(row.code, 'TEST/42');
      assert.equal(row.partner, upgraded ? 'upaya' : undefined);
      assert.equal(row.url, upgraded ? 'https://example.test/track/TEST%2F42' : null);
      if (upgraded) f.sqlite.exec("UPDATE delivery_partners SET status='not_in_use',default_slot=NULL,tracking_pattern=NULL,revision=2 WHERE id='upaya'");
      const replay = await book(post(bookingPath, body, 'reviewer'));
      assert.equal(replay.status, 200, await replay.text());
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM parcel_operation_events WHERE action='assign'").get()?.n, 1);
      if (upgraded) {
        await assert.rejects(operateParcel(f.db, {
          jobId: String(row.job), actorId: 'reviewer', requestId: 'new-inactive-courier', version: 1,
          action: 'assign', method: 'courier', note: 'Attempt another manual booking.', courierName: 'Upaya',
          deliveryPartnerId: 'upaya', trackingCode: 'TEST-43', now: Date.now(),
        }), /no longer available/i);
      }
    } finally { state.db = null; f.dispose(); }
  }
});
