import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkNcmDemoStatus } from '../scripts/check-ncm-demo-status.mjs';

const script = fileURLToPath(new URL('../scripts/check-ncm-demo-status.mjs', import.meta.url));
const args = ['--order-id', '134', '--vref-id', 'VREF-123'];
const token = 'a'.repeat(40);
const env = { HASTABAZAAR_RUNTIME_ENV: 'test', NCM_DEMO_API_TOKEN: token };
const label = {
  orderid: 134,
  description: { vendor_orderid: 'VREF-123' },
  receiver: { name: 'Private Receiver', phone: 'private phone', address: 'private address' },
};
const latest = { orderid: 134, status: 'Delivered', added_time: '2019-10-18T13:24:30.960365+05:45' };
const earlier = { orderid: 134, status: 'Sent for Delivery', added_time: '2019-10-18T13:22:21.033595+05:45' };
const labelUrl = 'https://demo.nepalcanmove.com/api/v2/vendor/order/label/134';
const statusUrl = 'https://demo.nepalcanmove.com/api/v1/order/status?id=134';

function provider(...responses: Array<Response | Error>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init });
    const result = responses.shift();
    if (!result) throw new Error('Unexpected external request');
    if (result instanceof Error) throw result;
    return result;
  };
  return { fetch, calls };
}

void test('the status CLI exits with a safe explanation when the demo runtime is off', () => {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8', env: { NODE_ENV: 'test', NCM_DEMO_API_TOKEN: token },
  });
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /HASTABAZAAR_RUNTIME_ENV=test/);
  assert.doesNotMatch(stderr, new RegExp(token));
});

void test('matched label and descending history expose only the newest confirmed status, time and order ID', async () => {
  const fixture = provider(Response.json({ ...label, orderid: '134' }), Response.json([
    { ...latest, orderid: '134', comment: 'private note' }, earlier,
  ]));
  assert.deepEqual(await checkNcmDemoStatus(args, env, fixture.fetch), {
    orderId: '134', status: 'Delivered', addedTime: '2019-10-18T13:24:30.960365+05:45',
  });
  assert.deepEqual(fixture.calls.map(call => call.url), [labelUrl, statusUrl]);
  for (const { init } of fixture.calls) {
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Token ' + token);
    assert.equal(init?.body, undefined);
  }
});

void test('missing or invalid bindings, IDs, and extra arguments fail before any provider request', async () => {
  const fixture = provider();
  for (const bindings of [{}, { ...env, HASTABAZAAR_RUNTIME_ENV: 'local_staging' }, { ...env, NCM_DEMO_API_TOKEN: '' }]) {
    await assert.rejects(checkNcmDemoStatus(args, bindings, fixture.fetch));
  }
  for (const invalid of [[], ['--order-id', '134'], ['--order-id', '../134', '--vref-id', 'VREF-123'],
    ['--order-id', '0', '--vref-id', 'VREF-123'], ['--order-id', '134', '--vref-id', ' '],
    ['--order-id', '134', '--vref-id', 'X'.repeat(21)], [...args, '--order-id', '135'], [...args, '--token', token]]) {
    await assert.rejects(checkNcmDemoStatus(invalid, env, fixture.fetch), error =>
      error instanceof Error && !error.message.includes(token));
  }
  assert.deepEqual(fixture.calls, []);
});

void test('the six-state demo history confirms delivery and safely renders branch-qualified current statuses', async () => {
  const statuses = [
    'Delivered', 'Sent for Delivery', 'Arrived at POKHARA', 'Dispatched to POKHARA', 'Drop off Order Collected', 'Drop off Order Created',
  ];
  const history = statuses.map((status, i) => ({ orderid: '134', status, added_time: '2026-11-20T12:0' + (5 - i) + ':00+05:45' }));
  for (const [offset, expected] of [[0, 'Delivered'], [2, 'Arrived'], [3, 'Dispatched']] as const) {
    const fixture = provider(Response.json(label), Response.json(history.slice(offset)));
    assert.deepEqual(await checkNcmDemoStatus(args, env, fixture.fetch), {
      orderId: '134', status: expected, addedTime: history[offset].added_time,
    });
  }
  const fixture = provider(Response.json(label), Response.json([latest, { ...earlier, status: 'Unlisted historical transport status' }]));
  assert.equal((await checkNcmDemoStatus(args, env, fixture.fetch)).status, 'Delivered');
});

void test('label mismatch stops before history and never echoes provider or caller data', async () => {
  for (const badLabel of [{ ...label, orderid: 135 }, { ...label, description: { vendor_orderid: 'Private Receiver' } }, {}]) {
    const fixture = provider(Response.json(badLabel));
    await assert.rejects(checkNcmDemoStatus(args, env, fixture.fetch), error =>
      error instanceof Error && !/private|VREF/i.test(error.message));
    assert.deepEqual(fixture.calls.map(call => call.url), [labelUrl]);
  }
});

void test('empty, mixed-order, malformed or reversed history cannot confirm a status', async () => {
  for (const history of [[], {}, [latest, { ...earlier, orderid: 135 }], [latest, null], [latest, { ...earlier, status: ' ' }],
    [{ ...latest, status: 'Private Receiver' }], [{ ...latest, added_time: '2019-02-30T12:00:00Z' }],
    [{ ...latest, added_time: '2019-12-01' }], [earlier, latest],
    [{ ...latest, added_time: '2019-10-18T13:24:30.960364+05:45' }, latest]]) {
    const fixture = provider(Response.json(label), Response.json(history));
    await assert.rejects(checkNcmDemoStatus(args, env, fixture.fetch), error =>
      error instanceof Error && !/private|VREF/i.test(error.message));
  }
});

void test('HTTP, decoding and network failures do not disclose response contents or exception text', async () => {
  const secretText = 'private provider text ' + token;
  for (const stage of ['label', 'status']) {
    for (const failure of [new Response(secretText, { status: 403 }), new Response(secretText), new Error(secretText)]) {
      const fixture = stage === 'label' ? provider(failure) : provider(Response.json(label), failure);
      await assert.rejects(checkNcmDemoStatus(args, env, fixture.fetch), error =>
        error instanceof Error && !/private|VREF/i.test(error.message) && !error.message.includes(token));
    }
  }
});
