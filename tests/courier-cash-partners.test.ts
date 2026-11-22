import assert from 'node:assert/strict';
import test from 'node:test';
import { readCourierCashWorkspace } from '../lib/payments/manual-payment-workspace';
import { installFixtureTables } from './helpers/delivery-partner-fixture';
import { manualOrderFixture } from './helpers/manual-payment-fixture';

void test('courier cash prefers the current linked partner name and keeps legacy cash balances and names', async () => {
  const f = await manualOrderFixture({ method: 'cod' });
  try {
    const jobId = 'courier-cash-delivered';
    const total = f.order.grandTotalPaisa;
    f.sqlite.prepare(`INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at)
      SELECT ?,?,seller_id,'outbound','delivered','reviewer',?,?,? FROM order_items WHERE order_id=? LIMIT 1`)
      .run(jobId, f.orderId, jobId, f.now, f.now, f.orderId);
    f.sqlite.prepare(`INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,collected_paisa,remitted_paisa,method,courier_name,delivered_at,created_at)
      VALUES(?,?,?,0,'courier','Original courier name',?,?)`).run(jobId, total, total, f.now, f.now);

    const before = await readCourierCashWorkspace(f.db, 'reviewer');
    assert.equal(before.parcels.length, 1);
    assert.equal(before.parcels[0].courierName, 'Original courier name');
    assert.equal(before.parcels[0].remainingPaisa, total);

    installFixtureTables(f.sqlite);
    f.sqlite.prepare(`INSERT INTO delivery_partners(id,name,status,collects_cod,created_at,updated_at)
      VALUES('upaya','Upaya','not_in_use',1,?,?)`).run(f.now, f.now);
    const unlinked = await readCourierCashWorkspace(f.db, 'reviewer');
    assert.deepEqual(unlinked.parcels, before.parcels);

    f.sqlite.prepare('UPDATE shipping_parcels SET delivery_partner_id=? WHERE shipping_job_id=?').run('upaya', jobId);
    const linked = await readCourierCashWorkspace(f.db, 'reviewer');
    assert.deepEqual(linked.parcels, [{ ...before.parcels[0], courierName: 'Upaya' }]);
    assert.deepEqual(linked.totals, before.totals);
    assert.deepEqual(linked.receipts, before.receipts);
    assert.deepEqual(linked.differences, before.differences);
    assert.deepEqual(linked.costs, before.costs);
  } finally {
    f.dispose();
  }
});
