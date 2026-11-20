import assert from 'node:assert/strict';
import test from 'node:test';
import { transitionAdminFulfillment } from '../lib/db/repositories/fulfillment';
import { createShippingJob } from '../lib/db/repositories/operations';
import { prepareSellerParcels } from '../lib/operations/parcels';
import {
  prepareSellerShipmentDeliveryAllocations,
  SELLER_SHIPMENT_DELIVERY_POLICY,
} from '../lib/returns/seller-shipment-delivery';
import { completeVersionFixture } from './helpers/complete-version-fixture';

async function parcelFixture(marked: boolean) {
  const f = await completeVersionFixture();
  try {
    f.sqlite.prepare(`UPDATE orders SET status='confirmed',delivery_rate_snapshot_json=?
      WHERE id='legacy-order'`).run(marked ? JSON.stringify({ unitAllocationPolicy: SELLER_SHIPMENT_DELIVERY_POLICY }) : null);
    f.sqlite.exec(`DELETE FROM seller_restrictions WHERE seller_id='registered';
      INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,
      tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,
      payout_account_reference,status,created_at,updated_at)
      SELECT 'second','foreign','Fictional Bowl Seller','Fictional Bowls',registration_authority,'FIX-BOWL',tax_mode,
      'FIX-BOWL-TAX',representative_name,support_phone,'bowls@local.hastabazaar.test',province,district,municipality,locality,
      'FIX-BOWL-BANK','approved',created_at,updated_at FROM seller_profiles WHERE id='registered';
      INSERT INTO categories(id,slug,name_en,is_active,created_at,updated_at)
      VALUES ('parcel-fixture','parcel-fixture','Fictional parcels',1,1,1);
      INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,
      producer,materials,status,created_at,updated_at) VALUES
        ('cup','registered','parcel-fixture','fixture-cup','CUP','Fictional cup','Fictional cup',5000,4,'Maker','Clay','published',1,1),
        ('bowl','second','parcel-fixture','fixture-bowl','BOWL','Fictional bowl','Fictional bowl',2550,4,'Maker','Clay','published',1,1);
      INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,
      sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,created_at) VALUES
        ('cup-line','legacy-order','cup','registered','Fictional cup seller','Fictional cup','CUP',5000,2,0,0,10000,1),
        ('bowl-line','legacy-order','bowl','second','Fictional bowl seller','Fictional bowl','BOWL',2550,1,0,0,2550,1)`);
    return f;
  } catch (error) {
    f.dispose();
    throw error;
  }
}

const outbound = {
  orderId: 'legacy-order', sellerId: 'registered', actorId: 'registered-owner', direction: 'outbound',
  note: 'Request an outbound carrier for the fictional cups.', requestId: 'phase-two-carrier-request',
} as const;

void test('outbound creation and parcel setup trace each saved unit to its seller job once', async () => {
  const f = await parcelFixture(true);
  try {
    const request = { ...outbound, now: f.now + 1 };
    await assert.rejects(createShippingJob(f.db, request));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shipping_jobs WHERE order_id='legacy-order'").get()?.n, 0);
    await f.db.batch(prepareSellerShipmentDeliveryAllocations(f.db, {
      orderId: 'legacy-order', totalPaisa: 500, now: f.now,
      lines: [
        { orderItemId: 'cup-line', sellerId: 'registered', quantity: 2 },
        { orderItemId: 'bowl-line', sellerId: 'second', quantity: 1 },
      ],
      attribution: {
        source: 'fictional-carrier-quote',
        sellerCharges: [{ sellerId: 'registered', amountPaisa: 401 }, { sellerId: 'second', amountPaisa: 99 }],
      },
    }));

    const carrierJob = await createShippingJob(f.db, request);
    assert.equal(await createShippingJob(f.db, request), carrierJob);
    const mappedUnits = () => f.sqlite.prepare(`SELECT m.order_item_id AS itemId,m.unit_ordinal AS unitOrdinal,
      m.shipping_job_id AS jobId,j.seller_id AS sellerId,m.created_at AS createdAt
      FROM order_delivery_unit_parcels m JOIN shipping_jobs j ON j.id=m.shipping_job_id
      WHERE j.order_id='legacy-order' ORDER BY itemId,unitOrdinal`).all().map(row => ({ ...row }));
    const original = mappedUnits();
    assert.deepEqual(original, [1, 2].map(unitOrdinal => ({
      itemId: 'cup-line', unitOrdinal, jobId: carrierJob, sellerId: 'registered', createdAt: request.now,
    })));

    const setup = { orderId: 'legacy-order', actorId: 'reviewer', requestId: 'phase-two-setup', now: f.now + 2 };
    await prepareSellerParcels(f.db, setup);
    await prepareSellerParcels(f.db, setup);
    const [bowl, ...cups] = mappedUnits();
    assert.deepEqual(cups, original);
    assert.equal(bowl.itemId, 'bowl-line');
    assert.equal(bowl.sellerId, 'second');
    assert.equal(bowl.unitOrdinal, 1);
    assert.equal(bowl.createdAt, setup.now);
    assert.notEqual(bowl.jobId, carrierJob);
    assert.deepEqual(f.sqlite.prepare(`SELECT j.seller_id AS sellerId,p.cod_due_paisa AS due
      FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id
      WHERE j.order_id='legacy-order' ORDER BY j.seller_id`).all().map(row => ({ ...row })), [
      { sellerId: 'registered', due: 10401 }, { sellerId: 'second', due: 2649 },
    ]);
  } finally {
    f.dispose();
  }
});

void test('marked orders must use the parcel workflow for physical dispatch', async () => {
  const f = await parcelFixture(true);
  try {
    f.sqlite.exec(`UPDATE orders SET status='ready_for_pickup' WHERE id='legacy-order';
      UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id='legacy-order';`);
    await assert.rejects(transitionAdminFulfillment(f.db, {
      orderId: 'legacy-order', actorId: 'reviewer', action: 'dispatch', trackingCode: 'FICTIONAL-DIRECT-JOB',
      note: 'Record fictional direct dispatch before preparing a parcel.', requestId: 'phase-two-direct-dispatch', now: f.now + 1,
    }), /seller parcel/i);
    assert.equal(f.sqlite.prepare("SELECT status FROM orders WHERE id='legacy-order'").get()?.status, 'ready_for_pickup');
  } finally {
    f.dispose();
  }
});

void test('legacy outbound and parcel setup work without the new allocation tables', async () => {
  const f = await parcelFixture(false);
  try {
    f.sqlite.exec(`DROP TABLE IF EXISTS order_delivery_unit_claims;
      DROP TABLE IF EXISTS order_delivery_unit_parcels;
      DROP TABLE IF EXISTS order_delivery_unit_allocations;
      DROP TABLE IF EXISTS order_delivery_shipment_allocations;`);
    await createShippingJob(f.db, { ...outbound, now: f.now + 1 });
    await prepareSellerParcels(f.db, {
      orderId: 'legacy-order', actorId: 'reviewer', requestId: 'legacy-setup', now: f.now + 2,
    });
    assert.deepEqual({ ...f.sqlite.prepare(`SELECT COUNT(*) AS parcels,SUM(p.cod_due_paisa) AS due
      FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id='legacy-order'`).get() },
    { parcels: 2, due: 13050 });
  } finally {
    f.dispose();
  }
});
