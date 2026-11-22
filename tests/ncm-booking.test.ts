import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { readDispatchParcels } from '../app/admin/orders/dispatch/read-dispatch';
import { bookWithNcm, getNcmBookingDraft, ncmVendorReference, recoverNcmBooking } from '../lib/delivery/ncm-booking';
import { getNcmLabel } from '../lib/delivery/ncm-booked-actions';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { ncmApiConfiguration, ncmConnectionFingerprint } from '../lib/shipping/nepal-can-move';
import { installFixtureTables } from './helpers/delivery-partner-fixture';
import { manualOrderFixture } from './helpers/manual-payment-fixture';
import { installNcmFixtureTables } from './helpers/ncm-fixture-tables';

void test('one parcel uses its short order number and split parcels have stable distinct NCM references', async () => {
  const one = {orderId:'one',sellerId:'seller-a',orderNumber:'HB-100',singleParcel:true};
  assert.equal(await ncmVendorReference(one), 'HB-100');
  const a = await ncmVendorReference({...one,singleParcel:false});
  const b = await ncmVendorReference({...one,sellerId:'seller-b',singleParcel:false});
  assert.match(a, /^HB[A-F0-9]{18}$/);
  assert.match(b, /^HB[A-F0-9]{18}$/);
  assert.notEqual(a,b);
  assert.equal(await ncmVendorReference({...one,singleParcel:false}), a);
});

async function fakeBooking(kind: 'ok'|'timeout'|'rejected') {
  const f = await manualOrderFixture({method:'cod'});
  installFixtureTables(f.sqlite);
  installNcmFixtureTables(f.sqlite);
  f.sqlite.exec(`ALTER TABLE products ADD COLUMN packed_weight_grams INTEGER;
    CREATE TABLE seller_parcel_weights (order_id TEXT,seller_id TEXT,weight_grams INTEGER,
    item_count INTEGER,recorded_by TEXT,recorded_at INTEGER,request_id TEXT,PRIMARY KEY(order_id,seller_id));
    INSERT INTO delivery_partners(id,name,status,booking_mode,collects_cod,created_at,updated_at)
    VALUES('ncm','Nepal Can Move','in_use','api',1,1,1)`);
  const item = f.sqlite.prepare('SELECT seller_id,COUNT(*) AS itemCount FROM order_items WHERE order_id=? GROUP BY seller_id LIMIT 1')
    .get(f.orderId)!;
  const sellerId = String(item.seller_id);
  f.sqlite.prepare("UPDATE orders SET status='ready_for_pickup',shipping_address_json=? WHERE id=?")
    .run(JSON.stringify({recipientName:'Test Receiver',phone:'9800000000',district:'Lalitpur',municipality:'Godawari',locality:'Test Road',
      landmark:'Fictional gate',deliveryNotes:'Leave with the test receiver'}),f.orderId);
  f.sqlite.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=?").run(f.orderId);
  f.sqlite.prepare('INSERT INTO seller_parcel_weights VALUES(?,?,?,?,?,?,?)').run(f.orderId,sellerId,550,Number(item.itemCount),'reviewer',1,'fixture-weight');
  f.sqlite.prepare(`INSERT INTO seller_operational_addresses
    (id,seller_id,purpose,province,district,municipality,locality,created_at,updated_at)
    VALUES('test-pickup',?,'pickup','Bagmati','Kathmandu','Kathmandu','Fixture pickup',1,1)
    ON CONFLICT(seller_id,purpose) DO UPDATE SET updated_at=1`).run(sellerId);
  const pickup = f.sqlite.prepare("SELECT id FROM seller_operational_addresses WHERE seller_id=? AND purpose='pickup'").get(sellerId)!;
  f.sqlite.prepare("INSERT INTO ncm_pickup_branches VALUES(?,'ncm',1,'KATHMANDU',1)").run(pickup.id!);
  let requests = 0;
  let savedBeforeRequest: unknown = null;
  let posted: Record<string, unknown> | null = null;
  const server = createServer((req,res) => {
    res.setHeader('Content-Type','application/json');
    if (req.url?.startsWith('/api/v1/shipping-rate?')) { res.end(JSON.stringify({charge:'110.25'})); return; }
    if (req.url === '/api/v2/vendor/order/label/747') {
      res.end(JSON.stringify({orderid:747,from_branch:'KATHMANDU',to_branch:'GODAWARI',receiver:{name:'Test Receiver'},
        description:{vendor_orderid:posted?.vref_id,package:'Fixture art'}}));
      return;
    }
    if (req.url !== '/api/v1/order/create') { res.statusCode = 404; res.end('{}'); return; }
    let data = '';
    req.setEncoding('utf8').on('data', chunk => { data += chunk; }).on('end', () => {
      requests += 1;
      posted = JSON.parse(data) as Record<string,unknown>;
      savedBeforeRequest = f.sqlite.prepare('SELECT state FROM ncm_bookings').get()?.state;
      if (kind === 'rejected') { res.statusCode = 400; res.end(JSON.stringify({Error:{phone:'Review the phone.'}})); }
      else if (kind === 'timeout') req.socket.destroy();
      else res.end(JSON.stringify({Message:'Order Successfully Created',orderid:747}));
    });
  });
  try {
    await new Promise<void>((resolve,reject) => server.listen(0,'127.0.0.1',resolve).once('error',reject));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const runtime = {NCM_API_BASE_URL:`http://127.0.0.1:${address.port}`,NCM_API_TOKEN:'fixture-token',HASTABAZAAR_RUNTIME_ENV:'test'};
    const fingerprint = await ncmConnectionFingerprint(ncmApiConfiguration(runtime)!);
    f.sqlite.prepare(`INSERT INTO ncm_partner_settings(partner_id,connection_fingerprint,assigned_branches_json,branches_json,connected_at,package_name,updated_at)
      VALUES('ncm',?,? ,?,1,'Fixture art',1)`).run(fingerprint,JSON.stringify(['KATHMANDU']),
      JSON.stringify([{name:'GODAWARI',district:'Lalitpur',areas:['Godawari']}]));
    const [before] = await readDispatchParcels(f.db,{orderId:f.orderId,sellerId});
    assert.equal(before.lane,'ready');
    const selection = {orderId:f.orderId,sellerId,jobId:before.jobId,version:before.version};
    const draft = await getNcmBookingDraft(f.db,runtime,selection,'ncm');
    assert.equal(draft.chargePaisa,11_025);
    assert.equal(draft.codPaisa,f.order.grandTotalPaisa);
    assert.equal(draft.destinationBranch,'GODAWARI');
    assert.ok(draft.reviewKey);
    const requestId = 'fake-book-'+kind;
    const validated = await validateSellerFormSubmission(f.db,'staff.parcel-control',1,[],requestId);
    const form = {requestId,versionId:validated.versionId,answers:validated.answers};
    const input = {selection,partnerId:'ncm',destinationBranch:'GODAWARI',reviewKey:draft.reviewKey,requestId,form};
    const book = () => bookWithNcm(f.db,runtime,'reviewer',input);
    if (kind === 'ok') {
      assert.equal(await book(),'747');
      assert.equal(await book(),'747');
      const [after] = await readDispatchParcels(f.db,{orderId:f.orderId,sellerId});
      assert.equal(after.lane,'booked');
      assert.equal(after.trackingNumber,'747');
      assert.equal((await getNcmLabel(f.db,runtime,after.jobId!)).description,'Fixture art');
    } else if (kind === 'timeout') {
      await assert.rejects(book,{state:'needs_review'});
      await assert.rejects(book,{state:'needs_review'});
      await assert.rejects(() => bookWithNcm(f.db,runtime,'reviewer',{...input,requestId:'a-new-request'}),{state:'needs_review'});
      const [current] = await readDispatchParcels(f.db,{orderId:f.orderId,sellerId});
      assert.equal(current.trackingNumber,null);
      const operationId = 'staff-recovered';
      const tracking = await recoverNcmBooking(f.db,runtime,'reviewer',{
        selection:{...selection,jobId:current.jobId,version:current.version},partnerId:'ncm',requestId:operationId,
        trackingNumber:'747',form:{...form,requestId:operationId},
      });
      assert.equal(tracking,'747');
    } else {
      await assert.rejects(book,{state:'rejected',fields:{phone:'Review the phone.'}});
      const [after] = await readDispatchParcels(f.db,{orderId:f.orderId,sellerId});
      assert.equal(after.lane,'ready');
      assert.equal(after.trackingNumber,null);
    }
    assert.equal(requests,1);
    assert.equal(savedBeforeRequest,'booking');
    assert.deepEqual(posted,{
      name:'Test Receiver',phone:'9800000000',address:'Test Road, Fictional gate, Godawari, Lalitpur',
      fbranch:'KATHMANDU',branch:'GODAWARI',cod_charge:String(f.order.grandTotalPaisa/100),vref_id:draft.vendorReference,
      package:'Fixture art',instruction:'Fictional gate · Leave with the test receiver',delivery_type:'Door2Door',weight:0.55,
    });
  } finally {
    if (server.listening) await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
    f.dispose();
  }
}

for (const kind of ['ok','timeout','rejected'] as const) {
  void test('Dispatch preserves its manual safeguards when NCM returns ' + kind, () => fakeBooking(kind));
}
