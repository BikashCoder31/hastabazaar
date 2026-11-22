import assert from 'node:assert/strict';
import test from 'node:test';
import { readParcelFailureTarget, readParcelProblems } from '../app/admin/shipping/parcel-problems';
import { readDispatchParcels } from '../app/admin/orders/dispatch/read-dispatch';
import { readCustomerWorkspace } from '../lib/admin/customers';
import { operateParcel, type ParcelOperation } from '../lib/operations/parcels';
import { deliverBusinessEmails } from '../lib/operations/business-notifications';
import { courierBookedTemplate, missedDeliveryTemplate } from '../lib/operations/courier-email-notices';
import { completeVersionFixture } from './helpers/complete-version-fixture';

const reasons = ['refused', 'not_reached', 'wrong_address', 'courier_problem', 'other'] as const;
type Fixture = Awaited<ReturnType<typeof completeVersionFixture>>;

function setTestColumn(f: Fixture, installed: boolean) {
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
  const present = f.sqlite.prepare('PRAGMA table_info(shipping_jobs)').all()
    .some(column => column.name === 'delivery_failure_reason');
  if (installed && !present) f.sqlite.exec('ALTER TABLE shipping_jobs ADD COLUMN delivery_failure_reason TEXT DEFAULT NULL');
  if (!installed && present) f.sqlite.exec('ALTER TABLE shipping_jobs DROP COLUMN delivery_failure_reason');
}

function addParcel(f: Fixture, id: string, { status = 'dispatched', payment = 'cod' } = {}) {
  const orderId = id + '-order', jobId = id + '-job';
  f.sqlite.prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,
    shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
    SELECT ?,?,customer_id,customer_email,customer_phone,'dispatched',locale,policy_version,
      shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,?,'unpaid',?,?
    FROM orders WHERE id='legacy-order'`).run(orderId, 'FIX-' + id, payment, f.now, f.now);
  f.sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,
    sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,fulfillment_status,created_at)
    VALUES(?,?,'failure-test-product','registered','Fictional seller','Fictional product','FIX',12550,1,0,0,12550,'dispatched',?)`)
    .run(id + '-item', orderId, f.now);
  f.sqlite.prepare(`INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at)
    VALUES(?,?,'registered','outbound',?,'reviewer',?,?,?)`).run(jobId, orderId, status, id + '-created', f.now, f.now);
  f.sqlite.prepare(`INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,method,courier_name,created_at)
    VALUES(?,?,'courier','Fictional carrier',?)`).run(jobId, payment === 'cod' ? 13050 : 0, f.now);
  return { orderId, jobId };
}

async function fixture(installed: boolean) {
  const f = await completeVersionFixture();
  try {
    setTestColumn(f, installed);
    f.sqlite.exec(`DELETE FROM seller_restrictions WHERE seller_id='registered';
      INSERT INTO categories(id,slug,name_en,is_active,created_at,updated_at)
      VALUES('failure-test-category','failure-test-category','Fictional parcels',1,1,1);
      INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,
      producer,materials,status,created_at,updated_at)
      VALUES('failure-test-product','registered','failure-test-category','failure-test-product','FIX','Fictional product',
        'Fictional parcel',12550,10,'Maker','Clay','published',1,1)`);
    return f;
  } catch (error) {
    f.dispose();
    throw error;
  }
}

const fail = (jobId: string, now: number, failureReason?: string) => ({
  actorId: 'reviewer', requestId: jobId + '-failed', jobId, action: 'fail', now, version: 0,
  note: 'Fictional courier explained this delivery attempt.', failureReason,
} satisfies ParcelOperation);

void test('native courier operations queue current, scoped emails and matching notifications once', async () => {
  const f = await fixture(true);
  try {
    const booked = addParcel(f, 'booked-email', { status: 'pickup_requested' });
    const assign = {
      actorId: 'reviewer', requestId: 'booked-fixture-assign', jobId: booked.jobId, action: 'assign',
      version: 0, method: 'courier', courierName: 'Fictional courier',
      trackingCode: 'FIX-BOOKED-EMAIL', note: 'Courier pickup was booked for this fictional parcel.',
      pickupStart: f.now + 1000, pickupEnd: f.now + 2000, now: f.now,
    } satisfies ParcelOperation;
    await operateParcel(f.db, assign);
    await operateParcel(f.db, assign);

    const missed = addParcel(f, 'missed-email');
    const failure = fail(missed.jobId, f.now, 'not_reached');
    await operateParcel(f.db, failure);
    await operateParcel(f.db, failure);

    const stale = addParcel(f, 'stale-missed-email');
    await operateParcel(f.db, fail(stale.jobId, f.now, 'refused'));
    await operateParcel(f.db, { ...fail(stale.jobId, f.now + 1), action: 'retry', version: 1, requestId: 'stale-failure-retried' });

    const guest = addParcel(f, 'guest-missed-email');
    f.sqlite.prepare("UPDATE orders SET customer_id=NULL,customer_email='guest-courier@example.test' WHERE id=?").run(guest.orderId);
    await operateParcel(f.db, fail(guest.jobId, f.now, 'courier_problem'));

    for (const [id, template, audience] of [[booked.orderId, courierBookedTemplate, 'seller'], [missed.orderId, missedDeliveryTemplate, 'customer']]) {
      assert.deepEqual(f.sqlite.prepare('SELECT channel,audience_role FROM notification_messages WHERE related_id=? AND template_key=? ORDER BY channel')
        .all(id, template).map(row => [row.channel, row.audience_role]), [['email', audience], ['in_app', audience]]);
    }
    for (const [id, template, audience, userId] of [
      [booked.orderId, 'business.parcel.customer_courier_booked', 'customer', 'customer'],
      [missed.orderId, 'business.parcel.problem', 'staff', 'reviewer'],
    ]) {
      assert.deepEqual(f.sqlite.prepare('SELECT channel,audience_role,recipient_user_id FROM notification_messages WHERE related_id=? AND template_key=? ORDER BY channel')
        .all(id, template).map(row => [row.channel, row.audience_role, row.recipient_user_id]),
      [['email', audience, userId], ['in_app', audience, userId]]);
    }
    const messages: Array<{ to: string; text: string; subject: string }> = [];
    await deliverBusinessEmails(f.db, {
      transport: 'capture', transportKey: 'fictional-courier-capture', handoffAware: true,
      send: async (message, context) => {
        await context?.beforeHandoff?.();
        messages.push(message);
        return { outcome: 'captured', transport: 'capture', receipt: 'fictional-only' };
      },
    }, 'http://localhost:3018', { now: f.now + 2, limit: 20 });
    const pickup = messages.find(m => m.subject === 'Hastabazaar · Courier pickup booked · FIX-booked-email');
    assert.ok(pickup);
    assert.match(pickup.text, /Fictional courier/);
    assert.match(pickup.text, /\/seller\/orders\/booked-email-order/);
    const buyerBooking = messages.find(m => m.subject === 'Hastabazaar · Courier booked for your order · FIX-booked-email');
    assert.equal(buyerBooking?.to, 'customer@local.hastabazaar.test');
    assert.match(buyerBooking.text, /\/orders\/FIX-booked-email/);
    const delivery = messages.find(m => m.subject === 'Hastabazaar · Delivery missed · FIX-missed-email');
    assert.ok(delivery);
    assert.match(delivery.text, /Customer could not be reached/);
    assert.match(delivery.text, /\/orders\/FIX-missed-email/);
    assert.doesNotMatch(delivery.text, /Fictional courier explained this delivery attempt/);
    const staffIssues = messages.filter(m => m.subject.includes('Parcel delivery needs attention') && m.text.includes('/admin/orders/missed-email-order'));
    assert.deepEqual(staffIssues.map(m => m.to), ['reviewer@local.hastabazaar.test']);
    const guestDelivery = messages.find(m => m.to === 'guest-courier@example.test');
    assert.ok(guestDelivery);
    assert.match(guestDelivery.text, /\/track\?order=FIX-guest-missed-email/);
    assert.ok(!messages.some(m => m.subject.includes('stale-missed')));
  } finally {
    f.dispose();
  }
});

void test('all five reasons are saved with their courier operation, note and audit and can filter the queue', async () => {
  const f = await fixture(true);
  try {
    for (const reason of reasons) {
      const { orderId, jobId } = addParcel(f, reason);
      const operation = fail(jobId, f.now, reason);
      const dispatch = await readDispatchParcels(f.db, { orderId, sellerId: 'registered' });
      assert.equal(dispatch[0]?.canRecordFailure, true);
      assert.equal((await readParcelFailureTarget(f.db, jobId))?.orderId, orderId);
      await operateParcel(f.db, operation);
      await operateParcel(f.db, operation);
      assert.equal(await readParcelFailureTarget(f.db, jobId), null);
      assert.equal(f.sqlite.prepare('SELECT delivery_failure_reason FROM shipping_jobs WHERE id=?').get(jobId)?.delivery_failure_reason, reason);
      const event = f.sqlite.prepare('SELECT payload_json,note FROM parcel_operation_events WHERE id=?').get(operation.requestId);
      assert.equal(JSON.parse(String(event?.payload_json)).failureReason, reason);
      assert.equal(event?.note, operation.note);
      assert.equal(f.sqlite.prepare('SELECT reason FROM audit_logs WHERE request_id=?').get(operation.requestId + ':audit')?.reason, operation.note);
    }
    addParcel(f, 'older-unrecorded', { status: 'delivery_failed' });
    const { problems } = await readParcelProblems(f.db, { superAdmin: true, kind: 'all', requestedPage: undefined, reason: 'not_reached' });
    assert.deepEqual(problems.map(problem => problem.sourceId), ['not_reached-job']);
    const unrecorded = await readParcelProblems(f.db, { superAdmin: true, kind: 'all', requestedPage: undefined, reason: 'unrecorded' });
    assert.deepEqual(unrecorded.problems.map(problem => problem.sourceId), ['older-unrecorded-job']);
  } finally {
    f.dispose();
  }
});

void test('the failed-delivery route requires a reason on the installed schema and leaves invalid attempts unwritten', async () => {
  const f = await fixture(true);
  try {
    const { jobId } = addParcel(f, 'invalid');
    await assert.rejects(operateParcel(f.db, fail(jobId, f.now)), /choose a delivery failure reason/i);
    await assert.rejects(operateParcel(f.db, fail(jobId, f.now, 'invented')), /choose a delivery failure reason/i);
    await assert.rejects(operateParcel(f.db, { ...fail(jobId, f.now, 'other'), note: '' }), /note/i);
    assert.equal(f.sqlite.prepare('SELECT status FROM shipping_jobs WHERE id=?').get(jobId)?.status, 'dispatched');
    assert.equal(f.sqlite.prepare('SELECT version FROM shipping_parcels WHERE shipping_job_id=?').get(jobId)?.version, 0);
  } finally {
    f.dispose();
  }
});

void test('COD risk counts only distinct orders with confirmed refused or not-reached courier outcomes', async () => {
  const f = await fixture(true);
  try {
    const { jobId } = addParcel(f, 'retry');
    await operateParcel(f.db, fail(jobId, f.now, 'refused'));
    await operateParcel(f.db, { ...fail(jobId, f.now + 1), action: 'retry', requestId: jobId + '-retried', version: 1 });
    await operateParcel(f.db, { ...fail(jobId, f.now + 2, 'courier_problem'), requestId: jobId + '-failed-again', version: 2 });
    for (const reason of ['wrong_address', 'courier_problem', 'other'] as const) {
      await operateParcel(f.db, fail(addParcel(f, reason).jobId, f.now, reason));
    }
    await operateParcel(f.db, fail(addParcel(f, 'online', { payment: 'manual_bank' }).jobId, f.now, 'refused'));
    addParcel(f, 'generic', { status: 'delivery_failed' });
    const customer = () => readCustomerWorkspace(f.db, { customer: 'customer' }, f.now + 3);
    assert.equal((await customer()).customer?.unsuccessfulCodCount, 1);
    assert.equal((await customer()).counts.risk, 0);
    await operateParcel(f.db, fail(addParcel(f, 'unreached').jobId, f.now + 3, 'not_reached'));
    assert.equal((await customer()).customer?.unsuccessfulCodCount, 2);
    const risk = await readCustomerWorkspace(f.db, { view: 'risk' }, f.now + 3);
    assert.deepEqual(risk.customers.map(row => row.id), ['customer']);
  } finally {
    f.dispose();
  }
});

void test('the old schema still records manual failures and does not treat submitted reasons as saved', async () => {
  const f = await fixture(false);
  try {
    const { orderId, jobId } = addParcel(f, 'pre-upgrade');
    assert.equal(await readParcelFailureTarget(f.db, jobId), null);
    assert.equal((await readDispatchParcels(f.db, { orderId, sellerId: 'registered' }))[0]?.canRecordFailure, false);
    const operation = fail(jobId, f.now, 'refused');
    await operateParcel(f.db, operation);
    assert.equal(f.sqlite.prepare('SELECT status FROM shipping_jobs WHERE id=?').get(jobId)?.status, 'delivery_failed');
    const event = f.sqlite.prepare('SELECT payload_json FROM parcel_operation_events WHERE id=?').get(operation.requestId);
    assert.equal(Object.hasOwn(JSON.parse(String(event?.payload_json)), 'failureReason'), false);
    assert.equal((await readCustomerWorkspace(f.db, { customer: 'customer' }, f.now)).counts.risk, 0);
  } finally {
    f.dispose();
  }
});
