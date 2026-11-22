import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateOrderCash } from '../lib/operations/parcels';
import { bagNeedsReview, checkoutParcelCash, groupCheckoutParcels } from '../lib/checkout/parcel-display';

const first = { sellerId: 'seller-b', tradingName: 'Same public name', pricePaisa: 140000, quantity: 1, preparationDays: 0 };
const second = { sellerId: 'seller-a', tradingName: 'Same public name', pricePaisa: 130000, quantity: 1, preparationDays: 4 };

void test('bag parcels follow distinct seller IDs and the original cart order', () => {
  const groups = groupCheckoutParcels([first, second, { ...first, preparationDays: 2 }]);
  assert.deepEqual(groups.map(group => [group.sellerId, group.items.length, group.preparationDays]), [
    ['seller-b', 2, 2], ['seller-a', 1, 4],
  ]);
});

void test('changed saved price still gates checkout when a cart leaves its unavailable flag false', () => {
  const line = { ...first, productStatus: 'published', inventoryQuantity: 1, currentChoice: { pricePaisa: 145000, orderable: true } };
  assert.equal(bagNeedsReview(line), true);
  assert.equal(bagNeedsReview({ ...line, pricePaisa: 145000 }), false);
  assert.equal(bagNeedsReview({ ...line, productStatus: 'archived' }), true);
});

void test('the checkout preview uses the recorded parcel allocator or real attributed quote, never invented amounts', () => {
  const groups = groupCheckoutParcels([first, second]);
  const legacy = checkoutParcelCash(groups, { totalPaisa: 289321, paymentMethod: 'cod', discountsPaisa: 3180, feePaisa: 0, pricedVariant: false });
  assert.deepEqual([...legacy!.entries()], allocateOrderCash(289321, [{ sellerId: first.sellerId, amount: 140000 }, { sellerId: second.sellerId, amount: 130000 }]).map(row => [row.sellerId, row.amount]));
  const deliveryBySeller = new Map([['seller-b', 13000], ['seller-a', 22500]]);
  const attributed = { totalPaisa: 305500, paymentMethod: 'cod' as const, discountsPaisa: 0, feePaisa: 0, pricedVariant: false, deliveryBySeller };
  assert.deepEqual([...checkoutParcelCash(groups, attributed)!.entries()], [['seller-b', 153000], ['seller-a', 152500]]);
  assert.equal(checkoutParcelCash(groups, { ...attributed, totalPaisa: 305499 }), null);
  assert.equal(checkoutParcelCash(groups, { ...attributed, discountsPaisa: 1 }), null);
  assert.equal(checkoutParcelCash(groups, { ...attributed, paymentMethod: 'manual_bank' }), null);
});
