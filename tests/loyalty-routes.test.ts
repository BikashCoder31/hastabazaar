import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import {
  fixture,
  publishForm,
  NOW,
  TERMS,
  counts,
  repo,
  ctx,
  beforeBatch,
} from './helpers/loyalty-fixture';
import {
  FORM_REGISTRY,
  IMPLEMENTED_FORM_ADAPTERS,
} from '../lib/forms/registry';
import type {
  ClaimResult,
  LoyaltyState,
  RewardsView,
} from '../lib/incentives/types';
import { validateFormDraft } from '../lib/forms/validation';
declare global {
  var loyaltyRouteDb: D1Database;
  var loyaltyRouteActor: {
    id: string;
    authSubject: string;
    role: string;
  } | null;
  var loyaltyRouteCustomer: { userId: string; authSubject: string } | null;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env={get DB(){return globalThis.loyaltyRouteDb},APP_ORIGIN:"http://localhost:3000",HASTABAZAAR_RUNTIME_ENV:"test"}',
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/staff')
      return {
        url: "data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(){if(!globalThis.loyaltyRouteActor)throw new StaffAuthorizationError('Authentication required.',401);return globalThis.loyaltyRouteActor;}",
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/customer')
      return {
        url: "data:text/javascript,export class CustomerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireExistingCustomerApi(){if(!globalThis.loyaltyRouteCustomer)throw new CustomerAuthorizationError('Authentication required.',401);return globalThis.loyaltyRouteCustomer;}",
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
async function routes() {
  const admin = await import('../app/api/admin/loyalty/route').catch(
    () => null,
  );
  const rewards = await import('../app/api/account/rewards/route').catch(
    () => null,
  );
  const claim = await import('../app/api/account/rewards/claim/route').catch(
    () => null,
  );
  assert.ok(admin, 'actual admin loyalty receiver must exist');
  assert.ok(rewards, 'actual rewards receiver must exist');
  assert.ok(claim, 'actual claim receiver must exist');
  const redeem = await import('../app/api/account/rewards/redeem/route').catch(
    () => null,
  );
  assert.ok(redeem, 'actual points redemption receiver must exist');
  return { admin, rewards, claim, redeem };
}
function request(
  path: string,
  body: unknown,
  origin = 'http://localhost:3000',
) {
  return new Request('http://localhost:3000' + path, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const claimBody = {
  requestId: 'route-claim',
  expectedVersion: 1,
  formVersion: 1,
  customAnswers: [],
};
void test('actual daily receiver rejects forged authority date amounts custom answers and unsafe origins', async () => {
  const route = await routes(),
    f = await fixture();
  globalThis.loyaltyRouteDb = f.db;
  globalThis.loyaltyRouteCustomer = {
    userId: 'customer',
    authSubject: 'customer',
  };
  try {
    for (const patch of [
      { userId: 'other' },
      { authSubject: 'other' },
      { now: NOW },
      { date: '2000-01-01' },
      { points: 999 },
      { creditPaisa: 999 },
      { rate: 9 },
      { customAnswers: [{ fieldId: 'points', value: 999 }] },
      { expectedVersion: 1.5 },
      { formVersion: 0 },
      { requestId: {} },
    ])
      assert.equal(
        (
          await route.claim.POST(
            request('/api/account/rewards/claim', { ...claimBody, ...patch }),
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await route.claim.POST(
          request(
            '/api/account/rewards/claim',
            claimBody,
            'https://attacker.test',
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await route.claim.POST(
          request('/api/account/rewards/claim', {
            padding: 'x'.repeat(270000),
          }),
        )
      ).status,
      413,
    );
    assert.deepEqual(await counts(f.db), [0, 0, 0, 0, 0]);
    globalThis.loyaltyRouteCustomer = null;
    assert.equal(
      (await route.claim.POST(request('/api/account/rewards/claim', claimBody)))
        .status,
      401,
    );
  } finally {
    await f.dispose();
  }
});
void test('actual daily receiver uses server identity time original receipt and no answer rows; GET stays private read-only', async () => {
  const route = await routes(),
    f = await fixture(true, { dailyBudgetPoints: 10 });
  globalThis.loyaltyRouteDb = f.db;
  globalThis.loyaltyRouteCustomer = {
    userId: 'customer',
    authSubject: 'customer',
  };
  try {
    const first = await route.claim.POST(
      request('/api/account/rewards/claim', claimBody),
    );
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const original = (await first.json()) as ClaimResult;
    assert.equal(original.awardedPoints, 10);
    assert.equal(
      original.localDate,
      new Date(Date.now() + 20700000).toISOString().slice(0, 10),
    );
    globalThis.loyaltyRouteCustomer = { userId: 'other', authSubject: 'other' };
    const exhaustedResponse = await route.rewards.GET(
      new Request('http://localhost:3000/api/account/rewards'),
    );
    assert.equal(exhaustedResponse.status, 200);
    assert.equal(exhaustedResponse.headers.get('cache-control'), 'no-store');
    const exhaustedView = (await exhaustedResponse.json()) as RewardsView;
    assert.equal(exhaustedView.claimedToday, false);
    assert.equal(exhaustedView.state.status, 'exhausted');
    for (const key of [
      'dailyBudgetPoints',
      'lifetimeBudgetPoints',
      'issuedPoints',
      'issuedTodayPoints',
      'liability',
      'maximumLiability',
    ])
      assert.equal(Object.hasOwn(exhaustedView.state, key), false, key);
    globalThis.loyaltyRouteCustomer = {
      userId: 'customer',
      authSubject: 'customer',
    };
    await publishForm(f.db, 'account.daily-reward', 2);
    const r = await repo();
    await r.pauseLoyalty(f.db, ctx('paused'));
    const replay = await route.claim.POST(
      request('/api/account/rewards/claim', claimBody),
    );
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), original);
    const get = await route.rewards.GET(
      new Request('http://localhost:3000/api/account/rewards'),
    );
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('cache-control'), 'no-store');
    const view = (await get.json()) as RewardsView;
    assert.equal(view.balancePoints, 10);
    assert.equal(
      JSON.stringify(view).includes('Fictional approved terms'),
      false,
    );
    assert.equal(Object.hasOwn(view.state, 'issuedPoints'), false);
    assert.equal(
      (await f.db
        .prepare(
          "SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='account.daily-reward'",
        )
        .first<{ n: number }>())!.n,
      0,
    );
    for (const query of [
      'userId=other',
      'limit=51',
      'limit=1&limit=2',
      'limit=1.5',
    ])
      assert.equal(
        (
          await route.rewards.GET(
            new Request('http://localhost:3000/api/account/rewards?' + query),
          )
        ).status,
        400,
      );
    await f.db
      .prepare("UPDATE users SET auth_subject='changed' WHERE id='customer'")
      .run();
    assert.equal(
      (await route.claim.POST(request('/api/account/rewards/claim', claimBody)))
        .status,
      403,
    );
    assert.equal(
      (
        await route.rewards.GET(
          new Request('http://localhost:3000/api/account/rewards'),
        )
      ).status,
      403,
    );
  } finally {
    await f.dispose();
  }
});
void test('actual admin receiver records explanatory configured answers and enforces strict roles and actions', async () => {
  const route = await routes(),
    f = await fixture(false);
  globalThis.loyaltyRouteDb = f.db;
  globalThis.loyaltyRouteActor = {
    id: 'super',
    authSubject: 'super',
    role: 'super_admin',
  };
  try {
    await publishForm(f.db, 'staff.loyalty-settings', 2, [
      {
        id: 'context_note',
        key: 'context_note',
        label: 'Context note',
        type: 'short_text',
        required: true,
        status: 'active',
        order: 0,
      },
    ]);
    const body = {
      action: 'draft',
      terms: TERMS,
      expectedVersion: 1,
      requestId: 'route-draft',
      reason: 'Approved fixture',
      formVersion: 2,
      customAnswers: [
        { fieldId: 'context_note', value: 'Private fixture context' },
      ],
    };
    for (const action of [null, [], {}, 5, true])
      assert.equal(
        (
          await route.admin.POST(
            request('/api/admin/loyalty', { ...body, action }),
          )
        ).status,
        400,
      );
    globalThis.loyaltyRouteActor = {
      id: 'admin',
      authSubject: 'admin',
      role: 'admin',
    };
    assert.equal(
      (await route.admin.POST(request('/api/admin/loyalty', body))).status,
      403,
    );
    globalThis.loyaltyRouteActor = {
      id: 'super',
      authSubject: 'super',
      role: 'super_admin',
    };
    assert.equal(
      (
        await route.admin.POST(
          request('/api/admin/loyalty', { ...body, actorId: 'admin' }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await route.admin.POST(
          request('/api/admin/loyalty', {
            ...body,
            customAnswers: [{ fieldId: 'dailyPoints', value: 999 }],
          }),
        )
      ).status,
      400,
    );
    const draft = await route.admin.POST(request('/api/admin/loyalty', body));
    assert.equal(draft.status, 200);
    assert.equal(((await draft.json()) as LoyaltyState).version, 2);
    const pub = await route.admin.POST(
      request('/api/admin/loyalty', {
        ...body,
        action: 'publish',
        terms: undefined,
        expectedVersion: 2,
        requestId: 'route-publish',
      }),
    );
    assert.equal(pub.status, 200);
    const get = await route.admin.GET(
      new Request('http://localhost:3000/api/admin/loyalty'),
    );
    assert.equal(get.status, 200);
    assert.equal(((await get.json()) as LoyaltyState).publishedRevision, 1);
    assert.equal(
      (await f.db
        .prepare('SELECT COUNT(*) n FROM form_answer_sets')
        .first<{ n: number }>())!.n,
      2,
    );
    assert.equal(
      (
        await route.admin.POST(
          request('/api/admin/loyalty', {
            ...body,
            action: 'pause',
            terms: TERMS,
          }),
        )
      ).status,
      400,
    );
  } finally {
    await f.dispose();
  }
});
void test('registered loyalty receivers reject every protected accounting key and all custom daily questions', () => {
  for (const id of ['staff.loyalty-settings', 'account.daily-reward']) {
    assert.ok(IMPLEMENTED_FORM_ADAPTERS[id]);
    for (const key of [
      'authSubject',
      'draftRevision',
      'publishedRevision',
      'creditedPaisa',
      'liability',
      'maximumLiability',
      'wholeBlocks',
      'remainingPoints',
      'dailyPoints',
      'localDate',
      'requestId',
    ])
      assert.throws(() =>
        validateFormDraft(id, {
          formId: id,
          fields: [
            {
              id: key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
              key,
              type: 'number',
              label: 'Override',
              required: false,
              status: 'active',
              order: 0,
            },
          ],
        }),
      );
  }
  assert.equal(
    FORM_REGISTRY['account.daily-reward'].capabilities.answerBehavior,
    'none',
  );
  assert.throws(() =>
    validateFormDraft('account.daily-reward', {
      formId: 'account.daily-reward',
      fields: [
        {
          id: 'note',
          key: 'note',
          type: 'short_text',
          label: 'Note',
          required: false,
          status: 'active',
          order: 0,
        },
      ],
    }),
  );
});
void test('actual claim receiver rate limits repeated attempts without double awards', async () => {
  const route = await routes(),
    f = await fixture();
  globalThis.loyaltyRouteDb = f.db;
  globalThis.loyaltyRouteCustomer = {
    userId: 'customer',
    authSubject: 'customer',
  };
  try {
    let limited = false;
    for (let i = 0; i < 25; i++) {
      const response = await route.claim.POST(
        request('/api/account/rewards/claim', {
          ...claimBody,
          requestId: 'attempt-' + i,
        }),
      );
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    assert.equal(limited, true);
    assert.equal((await counts(f.db))[1], 1);
  } finally {
    await f.dispose();
  }
});

void test('admin receiver binds current staff subject for fresh actions and exact replay', async (t) => {
  const route = await routes(),
    f = await fixture(false);
  globalThis.loyaltyRouteDb = f.db;
  globalThis.loyaltyRouteActor = {
    id: 'super',
    authSubject: 'super',
    role: 'super_admin',
  };
  const proof = async () => ({
    config: await f.db.prepare('SELECT * FROM loyalty_config').first(),
    revisions: (await f.db
      .prepare('SELECT COUNT(*) n FROM loyalty_revisions')
      .first<{ n: number }>())!.n,
    audits: (await f.db
      .prepare(
        "SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'loyalty.%'",
      )
      .first<{ n: number }>())!.n,
    answers: (await f.db
      .prepare(
        "SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.loyalty-settings'",
      )
      .first<{ n: number }>())!.n,
  });
  const version = async () =>
    (await f.db
      .prepare('SELECT version FROM loyalty_config')
      .first<{ version: number }>())!.version;
  let sequence = 0;
  const body = async (action: 'draft' | 'publish' | 'pause') => ({
    action,
    ...(action === 'draft' ? { terms: TERMS } : {}),
    expectedVersion: await version(),
    requestId: 'staff-subject-' + ++sequence,
    reason: 'Authorized subject fixture',
    formVersion: 1,
    customAnswers: [],
  });
  const submit = (payload: unknown) =>
    route.admin.POST(request('/api/admin/loyalty', payload));
  const prepare = async (action: string) => {
    if (action === 'publish' || action === 'pause') {
      const response = await submit(await body('draft'));
      assert.equal(response.status, 200);
    }
    if (action === 'pause') {
      const response = await submit(await body('publish'));
      assert.equal(response.status, 200);
    }
  };
  const restore = async () => {
    await f.db
      .prepare("UPDATE users SET auth_subject='super' WHERE id='super'")
      .run();
    globalThis.loyaltyRouteDb = f.db;
  };
  try {
    for (const action of ['draft', 'publish', 'pause'] as const) {
      await t.test(
        `fresh ${action} rejects staff relink at native commit`,
        async () => {
          await prepare(action);
          const payload = await body(action),
            before = await proof();
          globalThis.loyaltyRouteDb = beforeBatch(f.db, () =>
            f.db
              .prepare(
                "UPDATE users SET auth_subject='replacement' WHERE id='super'",
              )
              .run(),
          );
          try {
            const response = await submit(payload);
            assert.equal(response.status, 403);
            assert.deepEqual(await proof(), before);
          } finally {
            await restore();
          }
        },
      );
      await t.test(
        `exact ${action} replay rejects staff relink and preserves receipt`,
        async () => {
          await prepare(action);
          const payload = await body(action),
            response = await submit(payload);
          assert.equal(response.status, 200);
          const original = await response.json(),
            before = await proof();
          globalThis.loyaltyRouteDb = beforeBatch(f.db, () =>
            f.db
              .prepare(
                "UPDATE users SET auth_subject='replay-replacement' WHERE id='super'",
              )
              .run(),
          );
          try {
            assert.equal((await submit(payload)).status, 403);
            assert.deepEqual(await proof(), before);
          } finally {
            await restore();
          }
          const retry = await submit(payload);
          assert.equal(retry.status, 200);
          assert.deepEqual(await retry.json(), original);
          assert.deepEqual(await proof(), before);
        },
      );
    }
    await t.test(
      'admin GET and receiver reject old subject and forged client subjects',
      async () => {
        const before = await proof(),
          payload = await body('pause');
        for (const key of ['authSubject', 'actorAuthSubject'])
          assert.equal(
            (await submit({ ...payload, [key]: 'replacement' })).status,
            400,
          );
        await f.db
          .prepare(
            "UPDATE users SET auth_subject='replacement' WHERE id='super'",
          )
          .run();
        try {
          assert.equal(
            (
              await route.admin.GET(
                new Request('http://localhost:3000/api/admin/loyalty'),
              )
            ).status,
            403,
          );
          assert.equal((await submit(payload)).status, 403);
          assert.deepEqual(await proof(), before);
        } finally {
          await restore();
        }
      },
    );
  } finally {
    await f.dispose();
  }
});

const redeemBody = { ...claimBody, requestId: 'route-redeem', points: 200 };
void test('actual redemption receiver enforces bounded closed server authority no-answer origin and rate limits', async () => {
  const route = await routes(),
    f = await fixture(true, { dailyPoints: 200 });
  globalThis.loyaltyRouteDb = f.db;
  globalThis.loyaltyRouteCustomer = {
    userId: 'customer',
    authSubject: 'customer',
  };
  try {
    await publishForm(f.db, 'account.points-redemption');
    await (
      await repo()
    ).claimDailyPoints(f.db, {
      userId: 'customer',
      authSubject: 'customer',
      requestId: 'route-fund',
      expectedVersion: 1,
      now: NOW,
      formVersionId: 'account.daily-reward-v1',
    });
    for (const patch of [
      { userId: 'other' },
      { authSubject: 'other' },
      { customerAuthSubject: 'other' },
      { now: NOW },
      { rate: 10 },
      { creditPaisa: 999 },
      { balancePoints: 999 },
      { points: 0 },
      { points: 99 },
      { points: 101 },
      { points: -100 },
      { points: Number.MAX_SAFE_INTEGER + 1 },
      { expectedVersion: 1.5 },
      { formVersion: 0 },
      { requestId: {} },
      { customAnswers: [{ fieldId: 'note', value: 'forged' }] },
    ])
      assert.equal(
        (
          await route.redeem.POST(
            request('/api/account/rewards/redeem', { ...redeemBody, ...patch }),
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await route.redeem.POST(
          request(
            '/api/account/rewards/redeem',
            redeemBody,
            'https://attacker.test',
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await route.redeem.POST(
          request('/api/account/rewards/redeem', {
            padding: 'x'.repeat(270000),
          }),
        )
      ).status,
      413,
    );
    globalThis.loyaltyRouteCustomer = null;
    assert.equal(
      (
        await route.redeem.POST(
          request('/api/account/rewards/redeem', redeemBody),
        )
      ).status,
      401,
    );
    globalThis.loyaltyRouteCustomer = {
      userId: 'customer',
      authSubject: 'customer',
    };
    const started = Date.now();
    const first = await route.redeem.POST(
      request('/api/account/rewards/redeem', redeemBody),
    );
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const original = await first.json();
    const saved = await f.db
      .prepare(
        'SELECT user_id,actor_id,created_at,points,credit_paisa FROM loyalty_redemptions',
      )
      .first<{
        user_id: string;
        actor_id: string;
        created_at: number;
        points: number;
        credit_paisa: number;
      }>();
    assert.ok(saved);
    assert.equal(saved.user_id, 'customer');
    assert.equal(saved.actor_id, 'customer');
    assert.equal(saved.points, 200);
    assert.equal(saved.credit_paisa, 2000);
    assert.ok(saved.created_at >= started && saved.created_at <= Date.now());
    await publishForm(f.db, 'account.points-redemption', 2);
    await (await repo()).pauseLoyalty(f.db, ctx('pause-redemption'));
    const replay = await route.redeem.POST(
      request('/api/account/rewards/redeem', redeemBody),
    );
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), original);
    assert.equal(
      (
        await route.redeem.POST(
          request('/api/account/rewards/redeem', {
            ...redeemBody,
            points: 100,
          }),
        )
      ).status,
      409,
    );
    assert.equal(
      (await f.db
        .prepare(
          "SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='account.points-redemption'",
        )
        .first<{ n: number }>())!.n,
      0,
    );
    let limited = false;
    for (let i = 0; i < 25; i++) {
      const response = await route.redeem.POST(
        request('/api/account/rewards/redeem', {
          ...redeemBody,
          requestId: 'redeem-rate-' + i,
          formVersion: 2,
        }),
      );
      assert.equal(response.headers.get('cache-control'), 'no-store');
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    assert.equal(limited, true);
    assert.equal(
      (await f.db
        .prepare('SELECT COUNT(*) n FROM loyalty_redemptions')
        .first<{ n: number }>())!.n,
      1,
    );
  } finally {
    await f.dispose();
  }
});
void test('actual redemption receiver fences identity at commit and corrupted published form', async () => {
  const route = await routes();
  for (const scenario of ['subject', 'fields']) {
    const f = await fixture(true, { dailyPoints: 200 });
    globalThis.loyaltyRouteDb = f.db;
    globalThis.loyaltyRouteCustomer = {
      userId: 'customer',
      authSubject: 'customer',
    };
    try {
      await publishForm(f.db, 'account.points-redemption');
      await (
        await repo()
      ).claimDailyPoints(f.db, {
        userId: 'customer',
        authSubject: 'customer',
        requestId: 'fund',
        expectedVersion: 1,
        now: NOW,
        formVersionId: 'account.daily-reward-v1',
      });
      if (scenario === 'fields')
        await publishForm(f.db, 'account.points-redemption', 2, [
          {
            id: 'note',
            key: 'note',
            label: 'Note',
            type: 'short_text',
            required: false,
            status: 'active',
            order: 0,
          },
        ]);
      else
        globalThis.loyaltyRouteDb = beforeBatch(f.db, () =>
          f.db
            .prepare(
              "UPDATE users SET auth_subject='replacement' WHERE id='customer'",
            )
            .run(),
        );
      assert.equal(
        (
          await route.redeem.POST(
            request('/api/account/rewards/redeem', {
              ...redeemBody,
              formVersion: scenario === 'fields' ? 2 : 1,
            }),
          )
        ).status,
        scenario === 'subject' ? 403 : 503,
      );
      assert.equal(
        (await f.db
          .prepare('SELECT COUNT(*) n FROM loyalty_redemptions')
          .first<{ n: number }>())!.n,
        0,
      );
      assert.equal(
        (await (await repo()).getRewards(f.db, 'customer', NOW)).balancePoints,
        200,
      );
    } finally {
      await f.dispose();
    }
  }
});
void test('registered redemption receiver protects accounting fields and rejects any custom question', () => {
  const id = 'account.points-redemption';
  assert.ok(IMPLEMENTED_FORM_ADAPTERS[id]);
  assert.equal(FORM_REGISTRY[id].capabilities.answerBehavior, 'none');
  for (const key of [
    'authSubject',
    'points',
    'creditPaisa',
    'walletBalancePaisa',
    'now',
    'requestId',
    'note',
  ])
    assert.throws(() =>
      validateFormDraft(id, {
        formId: id,
        fields: [
          {
            id: key.toLowerCase(),
            key,
            label: 'Override',
            type: 'short_text',
            required: false,
            status: 'active',
            order: 0,
          },
        ],
      }),
    );
});
