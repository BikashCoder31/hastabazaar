import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { nepalDayIso } from '../lib/dates/nepal-calendar';
import { receiveNcmWebhook, runNcmUpdateCheck } from '../lib/delivery/ncm-events';
import { ncmDailyLimit } from '../lib/delivery/ncm-usage';
import { ncmApiConfiguration, ncmConnectionFingerprint } from '../lib/shipping/nepal-can-move';
import { installNcmFixtureTables } from './helpers/ncm-fixture-tables';
import { securityDatabase } from './helpers/security-database';

declare global { var ncmRouteBindings: Record<string, unknown> | undefined; }
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return {
    url: 'data:text/javascript,export const env=new Proxy({},{get(_target,key){return globalThis.ncmRouteBindings?.[key]}})',
    shortCircuit: true,
  };
  if (specifier === 'next/server') return {url: 'data:text/javascript,export function after(){ }', shortCircuit: true};
  return next(specifier, context);
} });

const key = 'fictional-ncm-webhook-secret-0123456789';
const jobKey = 'fictional-ncm-scheduler-secret-0123456789';
const firstTick = Date.UTC(2026, 5, 1, 8);
const eventTime = '2026-06-01T13:45:00+05:45';
const post = (body: unknown, query = '?key=' + key, kind = 'delivery') => new Request(
  'http://hastabazaar.test/api/webhooks/ncm/' + kind + query, {
    method: 'POST', body: JSON.stringify(body), headers: {'Content-Type': 'application/json'},
  },
);

async function withFixture(run: (fixture: {
  db: D1Database; sqlite: ReturnType<typeof securityDatabase>['sqlite'];
  runtime: {DB: D1Database; HASTABAZAAR_RUNTIME_ENV: string; NCM_API_BASE_URL: string;
    NCM_API_TOKEN: string; NCM_WEBHOOK_KEY: string; ORDER_EMAIL_JOB_SECRET: string};
  calls: number[][]; statuses: Map<number, string>; fail: (failed: boolean) => void;
}) => Promise<void>) {
  const f = securityDatabase();
  installNcmFixtureTables(f.sqlite);
  f.sqlite.exec(`
    CREATE TABLE delivery_partners (id TEXT PRIMARY KEY,name TEXT,status TEXT,booking_mode TEXT,collects_cod INTEGER);
    CREATE TABLE shipping_jobs (id TEXT PRIMARY KEY,status TEXT,direction TEXT,tracking_code TEXT);
    CREATE TABLE shipping_parcels (shipping_job_id TEXT PRIMARY KEY,delivery_partner_id TEXT,method TEXT,rider_user_id TEXT);
    INSERT INTO delivery_partners VALUES ('ncm','Nepal Can Move','in_use','api',1);
    INSERT INTO shipping_jobs VALUES ('open','dispatched','outbound','747'),('closed','delivered','outbound','748'),
      ('manual','dispatched','outbound','987');
    INSERT INTO shipping_parcels(shipping_job_id,delivery_partner_id,method)
      VALUES ('open','ncm','courier'),('closed','ncm','courier'),('manual','ncm','courier');
    INSERT INTO ncm_bookings(job_id,partner_id,actor_id,vendor_reference,ncm_order_id,state,request_id,started_at,updated_at)
      VALUES ('open','ncm','staff','HB1','747','booked','booking-1',1,1),('closed','ncm','staff','HB2','748','booked','booking-2',2,2);
  `);
  const calls: number[][] = [], statuses = new Map<number, string>();
  let failed = false;
  const server = createServer(async (request, response) => {
    const parts: Buffer[] = [];
    for await (const part of request) parts.push(part);
    assert.equal(request.url, '/api/v1/orders/statuses');
    assert.equal(request.headers.authorization, 'Token fake-ncm-token');
    const { orders } = JSON.parse(Buffer.concat(parts).toString());
    calls.push(orders);
    response.statusCode = failed ? 503 : 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({result: Object.fromEntries(orders.filter((id: number) => statuses.has(id))
      .map((id: number) => [id, statuses.get(id)])), errors: orders.filter((id: number) => !statuses.has(id))}));
  });
  try {
    await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const runtime = {DB: f.db, HASTABAZAAR_RUNTIME_ENV: 'test', NCM_API_BASE_URL: `http://127.0.0.1:${address.port}`,
      NCM_API_TOKEN: 'fake-ncm-token', NCM_WEBHOOK_KEY: key, ORDER_EMAIL_JOB_SECRET: jobKey};
    const configuration = ncmApiConfiguration(runtime);
    assert.ok(configuration);
    f.sqlite.prepare(`INSERT INTO ncm_partner_settings(partner_id,connection_fingerprint,assigned_branches_json,
      branches_json,connected_at,updated_at) VALUES ('ncm',?,'["KATHMANDU"]','[]',1,1)`)
      .run(await ncmConnectionFingerprint(configuration));
    await run({ db: f.db, sqlite: f.sqlite, runtime, calls, statuses, fail: value => { failed = value; } });
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    f.dispose();
  }
}

void test('webhook rejects missing and wrong keys, bounds requests, and retains portal checks and unknown events', async () => {
  await withFixture(async ({ sqlite, runtime, calls }) => {
    const deferred: (() => Promise<unknown>)[] = [];
    const receive = (request: Request) => receiveNcmWebhook(request, 'delivery', runtime, task => deferred.push(task));
    assert.equal((await receive(post({}, ''))).status, 401);
    assert.equal((await receive(post({}, '?key=x'))).status, 401);
    assert.equal((await receive(post({}, '?key=' + key + 'x'))).status, 401);
    assert.equal((await receive(post({}, '?key=' + key + '&key=' + key))).status, 401);
    assert.equal((await receive(post({large: 'x'.repeat(512 * 1024)}))).status, 413);
    assert.equal((await receive(post([1, 2]))).status, 400);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ncm_webhook_events').get()?.n, 0);
    const portal = {test: true, order_id: 'TEST-123456', event: 'delivery_completed', url: 'https://app.test?key=' + key};
    assert.equal((await receive(post(portal))).status, 200);
    assert.equal((await receive(post({event: 'future_event', order_ids: [748, '747'], timestamp: eventTime}))).status, 200);
    assert.equal((await receive(post({event: 'FUTURE_EVENT', order_ids: [747, 748, '747'],
      timestamp: '2026-06-01T08:00:00.000Z'}))).status, 200);
    const receipts = sqlite.prepare('SELECT payload_json AS payload, processed_at AS done FROM ncm_webhook_events').all();
    assert.equal(receipts.length, 2);
    assert.ok(receipts.every(row => row.done && !String(row.payload).includes(key)));
    assert.deepEqual(deferred, []);
    assert.deepEqual(calls, []);
  });
});

void test('delivery receipts persist before processing, deduplicate and confirm only our orders with the API', async () => {
  await withFixture(async ({ sqlite, runtime, calls, statuses }) => {
    const deferred: (() => Promise<unknown>)[] = [], applied: string[] = [];
    const receive = (body: unknown) => receiveNcmWebhook(post(body), 'delivery', runtime, task => deferred.push(task), {
      clock: () => firstTick, applyProgress: async (_db, input) => { applied.push(input.booking.ncmOrderId + ':' + input.status); },
    });
    statuses.set(747, 'On the road');
    const payload = {event: 'order_dispatched', status: 'Delivered', order_ids: [747, 999], timestamp: eventTime};
    assert.equal((await receive(payload)).status, 200);
    assert.equal((await receive({...payload, order_ids: [999, '747']})).status, 200);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ncm_webhook_events WHERE processed_at IS NULL').get()?.n, 1);
    assert.deepEqual(calls, []);
    assert.deepEqual(applied, []);
    assert.equal(deferred.length, 1);
    await deferred[0]();
    assert.deepEqual(calls, [[747]]);
    assert.deepEqual(applied, ['747:On the road']);
    assert.equal(sqlite.prepare('SELECT processed_at FROM ncm_webhook_events').get()?.processed_at, firstTick);
    assert.equal(sqlite.prepare("SELECT used FROM ncm_api_daily_usage WHERE bucket='view'").get()?.used, 1);
  });
});

void test('a failed confirmation remains queued and overlapping drains claim a receipt only once', async () => {
  await withFixture(async ({ sqlite, runtime, calls, statuses, fail }) => {
    const deferred: (() => Promise<unknown>)[] = [], confirmedEvents: string[] = [];
    let now = firstTick;
    const dependencies = {clock: () => now, applyProgress: async (_db: D1Database,
      input: {webhookEvent?: {id: string}}) => { if (input.webhookEvent) confirmedEvents.push(input.webhookEvent.id); }};
    const body = {event: 'delivery_completed', order_id: 747, timestamp: eventTime};
    statuses.set(747, 'Delivered');
    fail(true);
    assert.equal((await receiveNcmWebhook(post(body), 'delivery', runtime, task => deferred.push(task), dependencies)).status, 200);
    await deferred[0]();
    assert.deepEqual(confirmedEvents, []);
    const failed = sqlite.prepare('SELECT processed_at,claimed_at,attempts,next_attempt_at FROM ncm_webhook_events').get();
    assert.equal(failed?.processed_at, null);
    assert.equal(failed?.claimed_at, null);
    assert.equal(failed?.attempts, 1);
    assert.ok(Number(failed?.next_attempt_at) > now);
    now += 15 * 60_000;
    fail(false);
    await Promise.all([runNcmUpdateCheck(runtime.DB, runtime, dependencies), runNcmUpdateCheck(runtime.DB, runtime, dependencies)]);
    assert.equal(confirmedEvents.length, 1);
    assert.equal(sqlite.prepare('SELECT processed_at FROM ncm_webhook_events').get()?.processed_at, now);
    assert.ok(calls.length === 2 || calls.length === 3);
  });
});

void test('the scheduled safety pass catches missed webhooks and records only complete checks', async () => {
  await withFixture(async ({ sqlite, runtime, calls, statuses, fail }) => {
    const applied: string[] = [];
    let now = firstTick;
    const check = () => runNcmUpdateCheck(runtime.DB, runtime, {clock: () => now,
      applyProgress: async (_db, input) => { applied.push(input.booking.ncmOrderId + ':' + input.status); }});
    const lastCheck = () => sqlite.prepare('SELECT last_check_at AS at FROM ncm_partner_settings').get()?.at;
    statuses.set(747, 'Delivered');
    statuses.set(748, 'Delivered');
    fail(true);
    await check();
    assert.deepEqual(applied, []);
    assert.equal(lastCheck(), null);
    fail(false);
    await check();
    assert.deepEqual(applied, ['747:Delivered']);
    assert.equal(lastCheck(), now);
    now += 60_000;
    await check();
    assert.deepEqual(calls, [[747], [747]]);
    now += 15 * 60_000;
    sqlite.exec("UPDATE delivery_partners SET booking_mode='manual'");
    await check();
    assert.deepEqual(calls, [[747], [747]]);
  });
});

void test('the scheduler resumes a partly confirmed bulk receipt without querying completed or foreign orders again', async () => {
  await withFixture(async ({ sqlite, runtime, calls, statuses }) => {
    const deferred: (() => Promise<unknown>)[] = [], applied: string[] = [];
    let now = firstTick;
    const dependencies = {clock: () => now, applyProgress: async (_db: D1Database,
      input: {booking: {ncmOrderId: string}}) => { applied.push(input.booking.ncmOrderId); }};
    statuses.set(747, 'Picked Up');
    const request = post({event: 'pickup_completed', order_ids: [404, 747, 748], timestamp: eventTime});
    await receiveNcmWebhook(request, 'delivery', runtime, task => deferred.push(task), dependencies);
    await deferred[0]();
    assert.deepEqual(calls, [[747, 748]]);
    assert.deepEqual(applied, ['747']);
    assert.equal(sqlite.prepare('SELECT processed_at FROM ncm_webhook_events').get()?.processed_at, null);

    now += 15 * 60_000;
    statuses.set(748, 'Delivered');
    sqlite.exec("UPDATE shipping_jobs SET status='delivered' WHERE id='open'");
    await runNcmUpdateCheck(runtime.DB, runtime, dependencies);
    assert.deepEqual(calls, [[747, 748], [748]]);
    assert.deepEqual(applied, ['747', '748']);
    assert.equal(sqlite.prepare('SELECT processed_at FROM ncm_webhook_events').get()?.processed_at, now);
  });
});

void test('untested bindings and exhausted view budgets never make external requests or record a heartbeat', async () => {
  await withFixture(async ({ sqlite, runtime, calls }) => {
    const deps = {clock: () => firstTick};
    const staleConfiguration = {...runtime, NCM_API_TOKEN: 'unverified-test-token'};
    assert.equal((await runNcmUpdateCheck(runtime.DB, staleConfiguration, deps)).ok, false);
    sqlite.prepare("INSERT INTO ncm_api_daily_usage(usage_day,bucket,used) VALUES (?,'view',?)")
      .run(nepalDayIso(firstTick), ncmDailyLimit.view);
    assert.equal((await runNcmUpdateCheck(runtime.DB, runtime, deps)).ok, false);
    assert.equal(sqlite.prepare('SELECT last_check_at FROM ncm_partner_settings').get()?.last_check_at, null);
    assert.deepEqual(calls, []);
  });
});

void test('bounded scheduled checks prioritize the open parcels that waited longest', async () => {
  await withFixture(async ({ sqlite, runtime, calls, statuses }) => {
    const job = sqlite.prepare("INSERT INTO shipping_jobs VALUES (?,'dispatched','outbound',?)");
    const parcel = sqlite.prepare("INSERT INTO shipping_parcels(shipping_job_id,delivery_partner_id,method) VALUES (?,'ncm','courier')");
    const booking = sqlite.prepare(`INSERT INTO ncm_bookings(job_id,partner_id,actor_id,vendor_reference,ncm_order_id,
      state,request_id,started_at,updated_at) VALUES (?,'ncm','staff',?,?,'booked',?,1,1)`);
    const orderIds = Array.from({length: 121}, (_, index) => 1000 + index);
    for (const orderId of orderIds) {
      const id = 'fixture-' + orderId;
      job.run(id, String(orderId));
      parcel.run(id);
      booking.run(id, 'HB' + orderId, String(orderId), 'booking-' + orderId);
    }
    for (const id of [...orderIds, 747]) statuses.set(id, 'In Transit');
    const deps = {clock: () => firstTick, applyProgress: async () => {} };
    const first = await runNcmUpdateCheck(runtime.DB, runtime, deps);
    assert.equal(first.ok, true);
    assert.equal(first.deferred, true);
    const firstIds = new Set(calls.flat());
    assert.equal(firstIds.size, 120);
    const firstCalls = calls.length;
    const next = await runNcmUpdateCheck(runtime.DB, runtime, {...deps, clock: () => firstTick + 15 * 60_000});
    assert.equal(next.ok, true);
    assert.ok([747, ...orderIds].filter(id => !firstIds.has(id)).every(id => calls[firstCalls].includes(id)));
    assert.ok(calls.every(ids => ids.length <= 40));
  });
});

void test('comment receipts are linked to ours by order and distinct comment id without using delivery status', async () => {
  await withFixture(async ({ sqlite, runtime, calls }) => {
    const deferred: (() => Promise<unknown>)[] = [], saved: unknown[] = [];
    const receive = (order: number, comment: number) => receiveNcmWebhook(post({event: 'comment_added', order_id: order,
      comment_id: comment, comment_type: 'Action', comment: 'Confirm pickup', timestamp: eventTime}, '?key=' + key, 'comments'),
    'comments', runtime, task => deferred.push(task), {clock: () => firstTick,
      recordComment: async (_db, input) => { saved.push([input.booking.ncmOrderId, input.payload.comment_id]); }});
    for (const [order, comment] of [[747, 1], [747, 1], [747, 2], [404, 1]]) assert.equal((await receive(order, comment)).status, 200);
    for (const task of deferred) await task();
    assert.deepEqual(calls, []);
    assert.deepEqual(saved, [['747', 1], ['747', 2]]);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ncm_webhook_events').get()?.n, 3);
  });
});

void test('nested return and refund records identify ours without following new exchange or refund order IDs', async () => {
  await withFixture(async ({ runtime, calls, statuses }) => {
    const deferred: (() => Promise<unknown>)[] = [], applied: string[] = [];
    const receive = (body: unknown) => receiveNcmWebhook(post(body), 'delivery', runtime, task => deferred.push(task), {
      clock: () => firstTick, applyProgress: async (_db, input) => {
        applied.push(input.webhookEvent?.event + ':' + input.booking.ncmOrderId);
      },
    });
    statuses.set(747, 'Returning');
    statuses.set(748, 'Delivered');
    assert.equal((await receive({event: 'rtv_delivery', orders: [{order_id: 747, delivery_charge: '120'}], timestamp: eventTime})).status, 200);
    assert.equal((await receive({event: 'refund_initiated', customer_order: {order_id: 747}, refund_order: {order_id: 748},
      timestamp: eventTime})).status, 200);
    assert.equal((await receive({event: 'exchange_initiated', customer_order: {order_id: 404}, exchange_order: {order_id: 748},
      timestamp: eventTime})).status, 200);
    for (const task of deferred) await task();
    assert.deepEqual(calls, [[747], [747]]);
    assert.deepEqual(applied, ['rtv_delivery:747', 'refund_initiated:747']);
  });
});

void test('the actual webhook and scheduled routes authenticate before checking for optional NCM storage', async () => {
  const f = securityDatabase();
  globalThis.ncmRouteBindings = { DB: f.db, ORDER_EMAIL_JOB_SECRET: jobKey, NCM_WEBHOOK_KEY: key };
  try {
    const [job, delivery, comments] = await Promise.all([import('../app/api/jobs/ncm-updates/route'),
      import('../app/api/webhooks/ncm/delivery/route'), import('../app/api/webhooks/ncm/comments/route')]);
    const request = (query: string, secret?: string) => new Request('https://app.test/api/jobs/ncm-updates' + query,
      {method: 'POST', headers: secret ? {authorization: 'Bearer ' + secret} : undefined});
    assert.equal((await job.POST(request('?key=' + jobKey))).status, 401);
    assert.equal((await job.POST(request('', key))).status, 401);
    assert.equal((await delivery.POST(post({test: true}, ''))).status, 401);
    assert.equal((await comments.POST(post({test: true}, '?key=wrong', 'comments'))).status, 401);
    assert.equal(f.queries.length, 0);
    assert.equal((await job.POST(request('', jobKey))).status, 200);
    assert.equal((await delivery.POST(post({test: true}))).status, 503);
  } finally {
    f.dispose();
    globalThis.ncmRouteBindings = undefined;
  }
});
