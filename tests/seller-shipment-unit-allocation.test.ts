import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocateSellerShipmentDelivery } from '../lib/returns/seller-shipment-delivery';

void test('the first saved unit receives the remainder regardless of item value or ID', () => {
  const [shipment] = allocateSellerShipmentDelivery(10_000, [
    { orderItemId: 'second-lexically', sellerId: 'seller', quantity: 2 },
    { orderItemId: 'first-lexically', sellerId: 'seller', quantity: 1 },
  ], { source: 'fixture-quote', sellerCharges: [{ sellerId: 'seller', amountPaisa: 10_000 }] });
  assert.deepEqual(shipment.units.map(({ orderItemId, lineOrdinal, unitOrdinal, shipmentUnitOrdinal, amountPaisa }) =>
    [orderItemId, lineOrdinal, unitOrdinal, shipmentUnitOrdinal, amountPaisa]), [
    ['second-lexically', 1, 1, 1, 3334],
    ['second-lexically', 1, 2, 2, 3333],
    ['first-lexically', 2, 1, 3, 3333],
  ]);
});

void test('each seller keeps its explicit charge and an independent unit sequence', () => {
  const shipments = allocateSellerShipmentDelivery(100, [
    { orderItemId: 'b-line', sellerId: 'b', quantity: 2 },
    { orderItemId: 'a-line', sellerId: 'a', quantity: 3 },
  ], { source: 'fixture-quote', sellerCharges: [{ sellerId: 'a', amountPaisa: 94 }, { sellerId: 'b', amountPaisa: 6 }] });
  assert.deepEqual(shipments.map(shipment => [shipment.sellerId, shipment.shipmentOrdinal, shipment.units.map(unit => unit.amountPaisa)]), [
    ['b', 1, [3, 3]], ['a', 2, [32, 31, 31]],
  ]);
});

void test('shared charges require complete reconciled seller amounts', () => {
  const lines = [{ orderItemId: 'a', sellerId: 'seller', quantity: 1 }];
  for (const sellerCharges of [[], [{ sellerId: 'other', amountPaisa: 1 }], [{ sellerId: 'seller', amountPaisa: 2 }]]) {
    assert.throws(() => allocateSellerShipmentDelivery(1, lines, { source: 'fixture', sellerCharges }), /seller shipment charges/i);
  }
  assert.throws(() => allocateSellerShipmentDelivery(0, [{ ...lines[0], quantity: 0 }], {
    source: 'fixture', sellerCharges: [{ sellerId: 'seller', amountPaisa: 0 }],
  }), /quantity/i);
});
