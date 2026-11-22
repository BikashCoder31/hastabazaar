import assert from 'node:assert/strict';
import test from 'node:test';
import { createNcmClient, NcmApiError, ncmApiConfiguration } from '../lib/shipping/nepal-can-move';

const local = { HASTABAZAAR_RUNTIME_ENV: 'test', NCM_API_BASE_URL: 'http://127.0.0.1:3120', NCM_API_TOKEN: 'fixture-only' };
const config = () => ncmApiConfiguration(local)!;

void test('local runtime never selects a production origin even with a token', () => {
  assert.equal(ncmApiConfiguration({ ...local, NCM_API_BASE_URL: 'https://merchant.invalid' }), null);
  assert.equal(ncmApiConfiguration({ ...local, HASTABAZAAR_RUNTIME_ENV: 'local_staging', NCM_API_BASE_URL: 'https://merchant.invalid' }), null);
  assert.ok(config());
  assert.equal(ncmApiConfiguration({ ...local, HASTABAZAAR_RUNTIME_ENV: 'production' }), null);
});

void test('assigned branches and quote use the documented method, auth and query', async () => {
  const client = createNcmClient(config(), async (url, options) => {
    assert.ok(url instanceof URL);
    const address = url;
    assert.equal(options?.method, 'GET');
    assert.equal(new Headers(options.headers).get('authorization'), 'Token fixture-only');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    if (address.pathname === '/api/v2/vendor/assigned-branches') return Response.json(['KATHMANDU']);
    assert.equal(address.pathname, '/api/v1/shipping-rate');
    assert.deepEqual(Object.fromEntries(address.searchParams), {
      creation: 'KATHMANDU', destination: 'TIN KUNE', type: 'D2B',
    });
    return Response.json({ charge: '130.25' });
  });
  assert.deepEqual(await client.assignedBranches(), ['KATHMANDU']);
  assert.equal(await client.shippingRate('KATHMANDU', 'TIN KUNE', 'Door2Branch'), 13_025);
});

const parcel = {
  name: 'Test Receiver', phone: '9800000000', address: 'Fixture street',
  fbranch: 'KATHMANDU', branch: 'TINKUNE', cod_charge: '133.25',
  vref_id: 'HB123456789012345678', delivery_type: 'Door2Door' as const, weight: 0.34,
};

void test('create sends the exact reviewed payload once and returns the provider number', async () => {
  let calls = 0;
  const client = createNcmClient(config(), async (url, options) => {
    calls += 1;
    assert.ok(url instanceof URL);
    assert.equal(url.pathname, '/api/v1/order/create');
    assert.equal(options?.method, 'POST');
    assert.equal(typeof options.body, 'string');
    assert.deepEqual(JSON.parse(options.body as string), parcel);
    return Response.json({ Message: 'Order Successfully Created', orderid: 747 });
  });
  assert.equal((await client.createOrder(parcel)).trackingCode, '747');
  assert.equal(calls, 1);
});

void test('a validation error shows useful fields without disclosing the token', async () => {
  const client = createNcmClient(config(), async () => Response.json({
    Error: { phone: ['Use a Nepali number.'], address: 'Remove fixture-only', unknown: 'fixture-only' },
  }, { status: 400 }));
  await assert.rejects(() => client.createOrder(parcel), (error: unknown) => {
    assert.ok(error instanceof NcmApiError);
    assert.equal(error.kind, 'rejected');
    assert.deepEqual(error.fields, { phone: 'Use a Nepali number.', address: 'Remove [redacted]' });
    return true;
  });
});

void test('a broken response or network timeout never retries a create', async () => {
  for (const reject of [true, false]) {
    let calls = 0;
    const client = createNcmClient(config(), async () => {
      calls += 1;
      if (reject) throw new Error('internal network detail');
      return new Response('invalid JSON');
    });
    await assert.rejects(() => client.createOrder(parcel), { kind: 'uncertain' });
    assert.equal(calls, 1);
  }
});
