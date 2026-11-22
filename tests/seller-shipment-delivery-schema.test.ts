import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { incentiveReportDatabase } from './helpers/incentive-report-database';

function seedDeliveryHistory(sqlite: DatabaseSync) {
  sqlite.exec(`
    INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES
      ('owner-a','seller-a@local.hastabazaar.test','Fictional seller A','active',1,1),
      ('owner-b','seller-b@local.hastabazaar.test','Fictional seller B','active',1,1);
    INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,
      tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at)
    VALUES
      ('seller-a','owner-a','Fictional Seller A','Shop A','Fixture','FIX-A','PAN','FIX-PAN-A','Owner A',
        '9811111111','seller-a@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fixture','approved',1,1),
      ('seller-b','owner-b','Fictional Seller B','Shop B','Fixture','FIX-B','PAN','FIX-PAN-B','Owner B',
        '9822222222','seller-b@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fixture','approved',1,1);
    INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
      VALUES ('delivery-craft','delivery-craft','Fictional crafts',1,1,1,1);
    INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,
      country_of_origin,materials,status,created_at,updated_at)
    VALUES
      ('product-a','seller-a','delivery-craft','fixture-delivery-product-a','FIX-A','Fictional cup','Fixture cup',20000,10,'Maker A','NP','Clay','published',1,1),
      ('product-b','seller-b','delivery-craft','fixture-delivery-product-b','FIX-B','Fictional bowl','Fixture bowl',10000,5,'Maker B','NP','Clay','published',1,1);
    INSERT INTO orders(id,order_number,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,
      item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
    VALUES
      ('v1-order','FIX-DELIVERY-V1','buyer@local.hastabazaar.test','9800000000','confirmed','en-NP','fixture','{}',20000,700,20700,'cod','pending',1,1),
      ('v2-order','FIX-DELIVERY-V2','buyer@local.hastabazaar.test','9800000000','confirmed','en-NP','fixture','{}',70000,15001,85001,'cod','pending',2,2);
    INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,
      unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,created_at)
    VALUES
      ('line-old','v1-order','product-a','seller-a','Shop A','Cup','FIX-A',20000,1,1200,2400,20000,1),
      ('line-a1','v2-order','product-a','seller-a','Shop A','Cup','FIX-A',20000,2,1200,4800,40000,2),
      ('line-a2','v2-order','product-a','seller-a','Shop A','Cup','FIX-A',20000,1,1200,2400,20000,2),
      ('line-b1','v2-order','product-b','seller-b','Shop B','Bowl','FIX-B',10000,1,1200,1200,10000,2);
    INSERT INTO order_delivery_allocations VALUES
      ('line-old','v1-order','seller-a',700,1,'original_seller_item_largest_remainder_v1',1);
    UPDATE orders SET delivery_rate_snapshot_json='{"chargePaisa":700}' WHERE id='v1-order';
    UPDATE orders SET delivery_rate_snapshot_json='{"chargePaisa":15001,"unitAllocationPolicy":"seller_shipment_equal_units_v2"}'
      WHERE id='v2-order';
  `);

  const event = sqlite.prepare(`INSERT INTO order_cancellation_events
    (id,order_id,version,seller_ids_json,original_allocations_json,previous_json,next_json,note,
      wallet_restored_paisa,discount_removed_paisa,item_removed_paisa,created_at)
    VALUES (?,?,?,?,?,'{}','{}','Fictional scope',0,0,0,3)`);
  event.run('old-cancel', 'v1-order', 1, '["seller-a"]', '[{"id":"line-old","sellerId":"seller-a"}]');
  event.run('cancel-a', 'v2-order', 1, '["seller-a"]', '[{"id":"line-a1","sellerId":"seller-a","amount":40000},{"id":"line-a2","sellerId":"seller-a","amount":20000}]');
  event.run('cancel-b', 'v2-order', 2, '["seller-b"]', '[{"id":"line-a1","sellerId":"seller-a"},{"id":"line-b1","sellerId":"seller-b"}]');
  event.run('cancel-missing-line', 'v2-order', 3, '["seller-a"]', '[{"id":"line-a2","sellerId":"seller-a"}]');
  sqlite.exec(`
    INSERT INTO order_delivery_adjustments VALUES
      ('old-cancel','line-old','v1-order','seller-a',400,1,'original_seller_item_largest_remainder_v1',3);
    INSERT INTO return_requests(id,order_item_id,reason,detail,status,quantity,requested_at)
    VALUES
      ('return-a1','line-a1','damaged','Fictional case','pending_high_value_approval',1,3),
      ('return-a2','line-a2','damaged','Fictional case','approved',1,3),
      ('return-b1','line-b1','damaged','Fictional case','approved',1,3);
    INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,reason,requested_at)
    VALUES
      ('refund-pending','v2-order','return-a1','pending_high_value_approval',1000,'Fictional refund',3),
      ('refund-other-item','v2-order','return-a2','approved',1000,'Fictional refund',3),
      ('refund-other-order','v1-order','return-b1','approved',1000,'Fictional refund',3);
    INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at)
    VALUES
      ('outbound-a','v2-order','seller-a','outbound','pickup_requested','owner-a','req-outbound-a',3,3),
      ('return-job-a','v2-order','seller-a','return','pickup_requested','owner-a','req-return-a',3,3),
      ('outbound-b','v2-order','seller-b','outbound','pickup_requested','owner-b','req-outbound-b',3,3),
      ('outbound-old','v1-order','seller-a','outbound','pickup_requested','owner-a','req-outbound-old',3,3);
  `);
}

void test('seller shipment migration preserves v1 history and fences equal units, claims, and parcel links', async () => {
  const fixture = await incentiveReportDatabase(async (name, sqlite) => {
    if (name === '0157_order_item_pricing_snapshots.sql') seedDeliveryHistory(sqlite);
  });
  try {
    const { sqlite } = fixture;
    assert.ok(sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='order_delivery_shipment_allocations'").get(),
      'The additive shipment migration must create its tables');
    assert.equal(sqlite.prepare("SELECT amount_paisa FROM order_delivery_allocations WHERE order_item_id='line-old'").get()?.amount_paisa, 700);
    assert.equal(sqlite.prepare("SELECT amount_paisa FROM order_delivery_adjustments WHERE event_id='old-cancel'").get()?.amount_paisa, 400);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM order_delivery_shipment_allocations WHERE order_id='v1-order'").get()?.count, 0);
    assert.equal(sqlite.prepare("SELECT delivery_rate_snapshot_json FROM orders WHERE id='v1-order'").get()?.delivery_rate_snapshot_json, '{"chargePaisa":700}');

    const shipment = sqlite.prepare(`INSERT INTO order_delivery_shipment_allocations
      (id,order_id,seller_id,shipment_ordinal,amount_paisa,unit_count,policy_version,allocation_source,created_at)
      VALUES (?,'v2-order',?,?,?,?,'seller_shipment_equal_units_v2','fixture_quote',2)`);
    assert.throws(() => shipment.run('shipment-a', 'seller-a', 1, 10000, 2), /delivery_shipment_original_mismatch/);
    shipment.run('shipment-a', 'seller-a', 1, 10000, 3);
    assert.throws(() => shipment.run('shipment-b', 'seller-b', 2, 5002, 1), /delivery_shipment_original_mismatch/);
    shipment.run('shipment-b', 'seller-b', 2, 5001, 1);
    const rewriteDelivery = sqlite.prepare('UPDATE orders SET delivery_rate_snapshot_json=? WHERE id=?');
    for (const replacement of [null, '{}', '{"chargePaisa":1,"unitAllocationPolicy":"seller_shipment_equal_units_v2"}']) {
      assert.throws(() => rewriteDelivery.run(replacement, 'v2-order'), /delivery_shipment_marker_retained/);
    }
    assert.equal(rewriteDelivery.run('{"chargePaisa":700,"fixture":true}', 'v1-order').changes, 1);
    assert.equal(sqlite.prepare("UPDATE orders SET updated_at=3 WHERE id='v2-order'").run().changes, 1);
    assert.throws(() => sqlite.exec(`
      INSERT OR REPLACE INTO order_delivery_shipment_allocations VALUES
      ('replacement','v2-order','seller-a',1,10000,3,'seller_shipment_equal_units_v2','fixture_quote',2)
    `), /delivery_shipment_history_retained/);

    const unit = sqlite.prepare(`INSERT INTO order_delivery_unit_allocations
      (shipment_id,order_id,order_item_id,line_ordinal,unit_ordinal,shipment_unit_ordinal,amount_paisa)
      VALUES (?,?,?,?,?,?,?)`);
    assert.throws(() => unit.run('shipment-a', 'v2-order', 'line-b1', 1, 1, 1, 3334), /delivery_unit_original_mismatch/);
    assert.throws(() => unit.run('shipment-a', 'v1-order', 'line-a1', 1, 1, 1, 3334), /delivery_unit_original_mismatch/);
    assert.throws(() => unit.run('shipment-a', 'v2-order', 'line-a1', 1, 1, 1, 3333), /delivery_unit_original_mismatch/);
    unit.run('shipment-a', 'v2-order', 'line-a1', 1, 1, 1, 3334);
    assert.throws(() => unit.run('shipment-a', 'v2-order', 'line-a2', 2, 1, 2, 3333), /delivery_unit_original_mismatch/);
    unit.run('shipment-a', 'v2-order', 'line-a1', 1, 2, 2, 3333);
    assert.throws(() => unit.run('shipment-a', 'v2-order', 'line-a1', 1, 3, 3, 3333), /delivery_unit_original_mismatch/);
    unit.run('shipment-a', 'v2-order', 'line-a2', 2, 1, 3, 3333);
    unit.run('shipment-b', 'v2-order', 'line-b1', 1, 1, 1, 5001);
    assert.deepEqual(sqlite.prepare(`SELECT amount_paisa FROM order_delivery_unit_allocations WHERE shipment_id='shipment-a'
      ORDER BY shipment_unit_ordinal`).all().map(row => row.amount_paisa), [3334, 3333, 3333]);
    assert.throws(() => sqlite.exec(`
      INSERT OR REPLACE INTO order_delivery_unit_allocations VALUES ('shipment-a','v2-order','line-a2',2,2,1,3334)
    `), /delivery_unit_history_retained/);

    const claim = sqlite.prepare('INSERT INTO order_delivery_unit_claims VALUES (?,?,?,?,3)');
    assert.throws(() => claim.run('line-a1', 1, 'refund-other-item', null), /delivery_unit_claim_source_mismatch/);
    assert.throws(() => claim.run('line-b1', 1, 'refund-other-order', null), /delivery_unit_claim_source_mismatch/);
    assert.throws(() => claim.run('line-a1', 1, null, 'old-cancel'), /delivery_unit_claim_source_mismatch/);
    assert.throws(() => claim.run('line-a1', 1, null, 'cancel-b'), /delivery_unit_claim_source_mismatch/);
    assert.throws(() => claim.run('line-a1', 1, null, 'cancel-missing-line'), /delivery_unit_claim_source_mismatch/);
    assert.throws(() => claim.run('line-a1', 1, null, null), /delivery_unit_claim_source_mismatch/);
    assert.throws(() => claim.run('line-a1', 1, 'refund-pending', 'cancel-a'), /delivery_unit_claim_source_mismatch/);
    claim.run('line-a1', 1, 'refund-pending', null);
    assert.throws(() => claim.run('line-a1', 2, 'refund-pending', null), /delivery_unit_claim_source_mismatch/);
    assert.throws(() => sqlite.exec(`
      INSERT OR REPLACE INTO order_delivery_unit_claims VALUES ('line-a1',1,NULL,'cancel-a',3)
    `), /delivery_unit_claim_history_retained/);
    assert.throws(() => sqlite.exec("DELETE FROM order_delivery_unit_claims WHERE refund_id='refund-pending'"), /delivery_unit_claim_history_retained/);
    sqlite.exec("UPDATE refunds SET status='rejected' WHERE id='refund-pending'");
    sqlite.exec("DELETE FROM order_delivery_unit_claims WHERE refund_id='refund-pending'");
    assert.throws(() => claim.run('line-a1', 1, 'refund-pending', null), /delivery_unit_claim_source_mismatch/);
    claim.run('line-a1', 1, null, 'cancel-a');
    assert.throws(() => sqlite.exec("DELETE FROM order_delivery_unit_claims WHERE cancellation_event_id='cancel-a'"), /delivery_unit_claim_history_retained/);

    const mapParcel = sqlite.prepare("INSERT INTO order_delivery_unit_parcels VALUES ('line-a1',1,?,3)");
    for (const job of ['return-job-a', 'outbound-b', 'outbound-old']) {
      assert.throws(() => mapParcel.run(job), /delivery_unit_parcel_source_mismatch/);
    }
    mapParcel.run('outbound-a');
    assert.throws(() => sqlite.exec(`
      INSERT OR REPLACE INTO order_delivery_unit_parcels VALUES ('line-a1',1,'outbound-a',4)
    `), /delivery_unit_parcel_history_retained/);
    assert.equal(sqlite.prepare("SELECT shipping_job_id FROM order_delivery_unit_parcels WHERE order_item_id='line-a1' AND unit_ordinal=1")
      .get()?.shipping_job_id, 'outbound-a');

    for (const [table, column, error] of [
      ['order_delivery_shipment_allocations', 'amount_paisa', /delivery_shipment_history_retained/],
      ['order_delivery_unit_allocations', 'amount_paisa', /delivery_unit_history_retained/],
      ['order_delivery_unit_claims', 'created_at', /delivery_unit_claim_history_retained/],
      ['order_delivery_unit_parcels', 'created_at', /delivery_unit_parcel_history_retained/],
    ] as const) {
      assert.throws(() => sqlite.exec('UPDATE ' + table + ' SET ' + column + '=' + column), error);
      assert.throws(() => sqlite.exec('DELETE FROM ' + table), error);
    }
  } finally {
    fixture.dispose();
  }
});
