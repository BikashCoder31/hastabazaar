import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readNcmHealthWarning, readNcmOrderTimeline } from '../lib/delivery/ncm-health';
import { readCustomerOrderParcels } from '../lib/orders/customer-parcels';
import { customerParcelState } from '../lib/orders/customer-parcel-state';
import { installNcmFixtureTables } from './helpers/ncm-fixture-tables';
import { securityDatabase } from './helpers/security-database';

const hour = 60 * 60 * 1000;
const now = 10 * hour;
const owner = { role: 'super_admin' } as const;
const dispatcher = { role: 'admin', permissions: ['order.manage'] } as const;
const limited = { role: 'admin', permissions: ['payment.receipt.verify'] } as const;

function setup() {
  const fixture = securityDatabase();
  installNcmFixtureTables(fixture.sqlite);
  fixture.sqlite.exec(`
    CREATE TABLE delivery_partners (id TEXT PRIMARY KEY, name TEXT, status TEXT, booking_mode TEXT);
    CREATE TABLE shipping_jobs (id TEXT PRIMARY KEY, order_id TEXT, seller_id TEXT, direction TEXT, status TEXT, tracking_code TEXT);
    CREATE TABLE shipping_parcels (shipping_job_id TEXT PRIMARY KEY, delivery_partner_id TEXT, method TEXT, rider_user_id TEXT);
    CREATE TABLE parcel_operation_events (id TEXT PRIMARY KEY, order_id TEXT, shipping_job_id TEXT, action TEXT, payload_json TEXT, note TEXT, created_at INTEGER);
    CREATE TABLE audit_logs (action TEXT, subject_type TEXT, subject_id TEXT);
    INSERT INTO delivery_partners VALUES ('ncm','Nepal Can Move','in_use','api');
    INSERT INTO ncm_partner_settings (partner_id) VALUES ('ncm');
    INSERT INTO shipping_jobs VALUES ('job-1','order-1','seller-1','outbound','dispatched','747');
    INSERT INTO shipping_parcels VALUES ('job-1','ncm','courier',NULL);
    INSERT INTO ncm_bookings (job_id,partner_id,ncm_order_id,state,started_at,updated_at,last_status,cod_reported_paisa,delivery_charge_paisa)
      VALUES ('job-1','ncm','747','booked',${now - hour},${now},'out_for_delivery',0,15000);
  `);
  return fixture;
}

void test('the NCM warning waits an hour, uses the last successful check and requires an owned open API parcel', async () => {
  const { db, sqlite, dispose, queries } = setup();
  try {
    assert.equal(await readNcmHealthWarning(db, limited, now), null);
    assert.deepEqual(queries, []);
    assert.equal(await readNcmHealthWarning(db, owner, now - 1), null);
    assert.deepEqual(await readNcmHealthWarning(db, dispatcher, now), { openParcels: 1, lastCheckAt: null });
    sqlite.prepare("UPDATE ncm_partner_settings SET last_check_at=? WHERE partner_id='ncm'").run(now - 1);
    assert.equal(await readNcmHealthWarning(db, owner, now), null);
    assert.deepEqual(await readNcmHealthWarning(db, owner, now + hour), { openParcels: 1, lastCheckAt: now - 1 });
    sqlite.exec("UPDATE delivery_partners SET booking_mode='manual'");
    assert.equal(await readNcmHealthWarning(db, owner, now + hour), null);
    sqlite.exec("UPDATE delivery_partners SET booking_mode='api',status='paused'");
    assert.equal(await readNcmHealthWarning(db, owner, now + hour), null);
    sqlite.exec("UPDATE delivery_partners SET status='in_use'; UPDATE shipping_jobs SET tracking_code='999'");
    assert.equal(await readNcmHealthWarning(db, owner, now + hour), null);
    for (const status of ['delivered', 'cancelled', 'returned', 'claim_resolved']) {
      sqlite.prepare("UPDATE shipping_jobs SET tracking_code='747',status=?").run(status);
      assert.equal(await readNcmHealthWarning(db, owner, now + hour), null);
    }
  } finally {
    dispose();
  }
});

void test('views hide NCM storage until the owner-applied schema is available', async () => {
  const { db, dispose } = securityDatabase();
  try {
    assert.equal(await readNcmHealthWarning(db, owner, now), null);
    assert.deepEqual(await readNcmOrderTimeline(db, 'order-1', true), []);
  } finally {
    dispose();
  }
});

void test('staff timeline groups verified milestones and saved comments for the authorized order', async () => {
  const { db, sqlite, dispose } = setup();
  try {
    sqlite.exec(`INSERT INTO ncm_courier_notes VALUES
      ('747','info','job-1','Info','Sorting centre',2),('747','action','job-1','Action','Please contact the branch',4),
      ('999','unrelated','job-1','Info','Ignore other tracking numbers',9);
      INSERT INTO parcel_operation_events VALUES
      ('picked-up','order-1','job-1','ncm_status','{"status":"picked_up","providerOrderId":"747"}','Picked up',1),
      ('out','order-1','job-1','ncm_status','{"status":"out_for_delivery","providerOrderId":"747"}','Out for delivery',3),
      ('attention','order-1','job-1','ncm_attention','{"reason":"refund_initiated","providerOrderId":"747","relatedOrderId":"748"}','Review NCM refund',5),
      ('reviewed','order-1','job-1','ncm_attention','{"reason":"comment_added","providerOrderId":"747"}','NCM needs a reply',6),
      ('unknown','order-1','job-1','ncm_status','{"status":"other","providerOrderId":"747"}','Unknown',7),
      ('manual','order-1','job-1','delivery_failed','{}','Manual note',8);
      INSERT INTO audit_logs VALUES ('ncm.review_completed','parcel_operation','reviewed');
      UPDATE delivery_partners SET booking_mode='manual';
    `);
    const timeline = await readNcmOrderTimeline(db, 'order-1', false);
    assert.deepEqual(await readNcmOrderTimeline(db, 'other-order', true), []);
    assert.equal(timeline.length, 1);
    assert.equal(timeline[0].orderNumber, '747');
    assert.equal(timeline[0].status, 'out_for_delivery');
    assert.equal(timeline[0].codPaisa, 0);
    assert.equal(timeline[0].deliveryChargePaisa, 15000);
    assert.deepEqual(timeline[0].entries.map(entry => [entry.kind, entry.text]), [
      ['Action', 'Please contact the branch'], ['status', 'Out for delivery'], ['Info', 'Sorting centre'], ['status', 'Picked up'],
    ]);
    const [adminTimeline] = await readNcmOrderTimeline(db, 'order-1', true);
    assert.deepEqual(adminTimeline.entries.slice(0, 2).map(entry => 'reviewed' in entry && entry.reviewed), [true, false]);
    const attention = adminTimeline.entries.find(entry => entry.id === 'attention');
    assert.equal(attention?.kind === 'review' && attention.relatedOrderNumber, '748');
    sqlite.exec("UPDATE shipping_parcels SET method='own_rider',rider_user_id='rider'");
    assert.deepEqual(await readNcmOrderTimeline(db, 'order-1', true), []);
  } finally {
    dispose();
  }
});

void test('customer parcels show only allowlisted live NCM progress and preserve later local outcomes', async () => {
  const { db, sqlite, dispose } = setup();
  try {
    sqlite.exec(`CREATE TABLE orders(id TEXT,status TEXT,payment_mode TEXT,placed_at INTEGER,created_at INTEGER);
      CREATE TABLE shipments(order_id TEXT,estimated_min_days INTEGER,estimated_max_days INTEGER,tracking_code TEXT);
      CREATE TABLE delivery_assignments(order_id TEXT,method TEXT,rider_user_id TEXT,courier_name TEXT,tracking_reference TEXT,tracking_url TEXT);
      CREATE TABLE order_items(id TEXT,order_id TEXT,seller_id TEXT,seller_name_snapshot TEXT,product_id TEXT,product_name_snapshot TEXT,
        quantity INTEGER,fulfillment_status TEXT,created_at INTEGER);
      CREATE TABLE order_item_status_events(order_item_id TEXT,to_status TEXT,created_at INTEGER);
      ALTER TABLE shipping_parcels ADD COLUMN cod_due_paisa INTEGER;
      ALTER TABLE shipping_parcels ADD COLUMN delivered_at INTEGER;
      ALTER TABLE shipping_parcels ADD COLUMN courier_name TEXT;
      ALTER TABLE shipping_parcels ADD COLUMN tracking_url TEXT;
      INSERT INTO orders VALUES ('order-1','dispatched','prepaid',1,1);
      INSERT INTO order_items VALUES ('item-1','order-1','seller-1','Studio',NULL,'Bowl',1,'dispatched',1);
      INSERT INTO ncm_courier_notes VALUES ('747','private','job-1','Action','Staff-only text',2);
      UPDATE shipping_parcels SET courier_name='Nepal Can Move';`);
    const load = async (withNcmProgress = true) => (await readCustomerOrderParcels(db, ['order-1'], { withItems: false, withCash: false, withNcmProgress })).get('order-1')?.[0];
    const current = await load();
    assert.equal(current?.status, 'out_for_delivery');
    assert.equal(current?.trackingReference, '747');
    assert.equal(customerParcelState({ status: current.status }).label, 'Out for delivery');
    assert.equal((await load(false))?.status, 'dispatched');
    assert.doesNotMatch(JSON.stringify(current), /Staff-only text|15000|codReported|returnCharge/);
    sqlite.exec("UPDATE ncm_bookings SET last_status='staff-only-value'");
    assert.equal((await load())?.status, 'dispatched');
    sqlite.exec("UPDATE ncm_bookings SET last_status='picked_up'; UPDATE shipping_jobs SET tracking_code='999'");
    assert.equal((await load())?.status, 'dispatched');
    sqlite.exec("UPDATE shipping_jobs SET tracking_code='747',status='delivered'");
    assert.equal((await load())?.status, 'delivered');
  } finally {
    dispose();
  }
});
