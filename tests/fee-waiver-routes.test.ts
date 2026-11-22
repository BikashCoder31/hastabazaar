import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import {
  feeWaiverFixture,
  interleaveFeeWaiverBatch,
} from './helpers/fee-waiver-fixture';

declare global {
  var waiverHttpDb: D1Database;
  var waiverHttpActor: { id: string; authSubject: string; role: string } | null;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    const source =
      specifier === 'cloudflare:workers'
        ? 'export const env={get DB(){return globalThis.waiverHttpDb}}'
        : specifier === '@/lib/auth/staff'
          ? `export class StaffAuthorizationError extends Error {constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(permission){if(permission!=='commercial_policy.manage')throw Error('Wrong permission');if(!globalThis.waiverHttpActor)throw new StaffAuthorizationError('Sign in.',401);return globalThis.waiverHttpActor}`
          : null;
    return source
      ? {
          url: 'data:text/javascript,' + encodeURIComponent(source),
          shortCircuit: true,
        }
      : nextResolve(specifier, context);
  },
});
const url = 'http://localhost:3018/api/admin/customer-fee-waivers';
const request = (body: unknown, origin = 'http://localhost:3018') =>
  new Request(url, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const terms = {
  name: 'Fictional launch',
  description: 'All Registered Sellers',
  startsAt: 0,
  endsAt: 253402280099999,
};
const create = {
  feeTarget: 'customer_service_fee',
  reason:'Independently review this exact fictional customer fee campaign.',
  command: { type: 'create', terms },
  expectedRevision: 0,
  requestId: 'route-create',
};

void test('fee waiver routes enforce live Super Admin, origin, input allowlist and private responses', async () => {
  const route = await import('../app/api/admin/customer-fee-waivers/route');
  const f = await feeWaiverFixture();
  globalThis.waiverHttpDb = f.database;
  try {
    for (const actor of [
      null,
      { id: 'staff', authSubject: 'staff', role: 'admin' },
      { id: 'user-a', authSubject: 'user-a', role: 'customer' },
      { id: 'owner', authSubject: 'wrong', role: 'super_admin' },
    ]) {
      globalThis.waiverHttpActor = actor;
      assert.equal((await route.POST(request(create))).status,403);
      assert.equal((await route.GET(new Request(url))).status,403);
    }
    globalThis.waiverHttpActor = {
      id: 'owner',
      authSubject: 'owner',
      role: 'super_admin',
    };
    assert.equal(
      (await route.POST(request(create, 'https://attacker.test'))).status,
      403,
    );
    for (const body of [
      { ...create, role: 'super_admin' },
      { ...create, now: 0 },
      { ...create, commissionPaisa: 0 },
      { ...create, customAnswers: [] },
      {
        ...create,
        command: { type: 'create', terms: { ...terms, netPaisa: 0 } },
      },
      { ...create, expectedRevision: -1 },
    ])
      assert.equal((await route.POST(request(body))).status, 422);
    const response = await route.POST(request(create));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await route.POST(request(create))).status, 200);
    const state = (await (await route.GET(new Request(url))).json()) as {
      revision: number;
      campaigns: { displayState: string }[];
    };
    assert.equal(state.revision, 1);
    assert.equal(state.campaigns.length, 1);
    assert.equal(state.campaigns[0].displayState, 'draft');
    const audit = await f.database
      .prepare(
        "SELECT actor_id,created_at FROM audit_logs WHERE action='customer.service-fee-waiver.create'",
      )
      .first<{ actor_id: string; created_at: number }>();
    assert.equal(audit?.actor_id, 'owner');
    assert.ok(audit!.created_at > Date.now() - 10000);
    assert.equal(
      (await route.POST(request({ ...create, requestId: 'route-stale' })))
        .status,
      409,
    );
    f.sqlite.exec(
      "DELETE FROM user_roles WHERE user_id='owner' AND role='super_admin'",
    );
    assert.equal((await route.POST(request(create))).status, 403);
    assert.equal((await route.GET(new Request(url))).status, 403);
  } finally {
    await f.dispose();
  }
});

void test('fee waiver route catches authority races and storage outage without partial writes', async () => {
  const route = await import('../app/api/admin/customer-fee-waivers/route');
  const f = await feeWaiverFixture();
  globalThis.waiverHttpActor = {
    id: 'owner',
    authSubject: 'owner',
    role: 'super_admin',
  };
  try {
    globalThis.waiverHttpDb = interleaveFeeWaiverBatch(f.database, async () => {
      f.sqlite.exec(
        "DELETE FROM user_roles WHERE user_id='owner' AND role='super_admin'",
      );
    });
    assert.equal((await route.POST(request(create))).status, 403);
    assert.equal(
      (
        await f.database
          .prepare('SELECT COUNT(*) n FROM customer_fee_waiver_campaigns')
          .first<{ n: number }>()
      )?.n,
      0,
    );
    globalThis.waiverHttpDb = {
      prepare() {
        throw Error('Fictional outage');
      },
    } as unknown as D1Database;
    assert.equal((await route.GET(new Request(url))).status, 503);
  } finally {
    await f.dispose();
  }
});
