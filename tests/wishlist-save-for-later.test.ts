import './helpers/public-checkout-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import { publishedOfferFixture } from './helpers/public-offer-fixture';
import { ACTOR_INTENT_HEADER } from '../lib/http/actor-intent';

void test('saving from the bag rejects account drift before writing the current account wishlist', async () => {
  const fixture = await publishedOfferFixture();
  try {
    globalThis.publicCheckoutDb = fixture.db;
    globalThis.publicCheckoutActor = { userId: 'customer', authSubject: 'customer', email: 'customer@local.hastabazaar.test' };
    const { PUT } = await import('../app/api/account/wishlist/route');
    const origin = 'https://public-checkout.test';
    const makeRequest = (actorId: string, requestOrigin = origin) => new Request(origin + '/api/account/wishlist', {
      method: 'PUT',
      headers: { origin: requestOrigin, 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
      body: JSON.stringify({ productId: fixture.productId, saved: true }),
    });
    const saved = () => Number(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM wishlist_items WHERE product_id=?').get(fixture.productId)?.count);
    assert.equal((await PUT(makeRequest('old-customer'))).status, 403);
    assert.equal((await PUT(makeRequest('customer', 'https://elsewhere.test'))).status, 403);
    assert.equal(saved(), 0);
    assert.equal((await PUT(makeRequest('customer'))).status, 200);
    assert.equal(saved(), 1);
  } finally {
    globalThis.publicCheckoutActor = null;
    fixture.dispose();
  }
});
