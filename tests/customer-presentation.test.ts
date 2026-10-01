import assert from 'node:assert/strict';
import test from 'node:test';
import { sendJson } from '../lib/http/client-request';
import { orderPresentation } from '../lib/commerce/order-presentation';

void test('customer mutations report network failures without claiming success', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Network failed');
  });
  await assert.rejects(
    sendJson('/api/account/profile', 'PATCH', {}, 'Save failed.'),
    /Check your connection/,
  );
});

void test('customer mutations retain server rejection messages and reject unreadable responses', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Address not found.' }, { status: 403 }),
  );
  await assert.rejects(
    sendJson('/api/account/addresses/missing', 'DELETE', {}, 'Delete failed.'),
    /Address not found/,
  );
  t.mock.restoreAll();
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('unreadable', { status: 200 }),
  );
  await assert.rejects(
    sendJson('/api/account/profile', 'PATCH', {}, 'Save failed.'),
    /Save failed/,
  );
});

void test('customer mutation success returns the server result', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
  assert.deepEqual(
    await sendJson(
      '/api/account/profile',
      'PATCH',
      { displayName: 'Test Customer' },
      'Save failed.',
    ),
    { ok: true },
  );
});

void test('receipts distinguish cancelled, delivered, and refunded orders', () => {
  assert.equal(
    orderPresentation('cancelled', 'pending').paymentLabel,
    'No payment due',
  );
  assert.match(orderPresentation('cancelled', 'pending').title, /cancelled/);
  assert.match(orderPresentation('delivered', 'paid').title, /arrived/);
  assert.equal(
    orderPresentation('delivered', 'paid').paymentLabel,
    'Cash on delivery collected',
  );
  assert.equal(
    orderPresentation('refunded', 'refunded').paymentLabel,
    'Refund recorded',
  );
  assert.equal(
    orderPresentation('cancelled', 'paid').paymentLabel,
    'Cash on delivery collected',
  );
  assert.equal(
    orderPresentation('unknown', 'pending').title,
    'Your order details.',
  );
});
