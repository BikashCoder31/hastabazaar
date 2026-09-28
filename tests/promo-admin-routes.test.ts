import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import {
  createIncentiveDb,
  seedIncentiveCustomer,
} from './helpers/incentive-db';
import {
  FORM_REGISTRY,
  IMPLEMENTED_FORM_ADAPTERS,
} from '../lib/forms/registry';
import { validateFormDraft } from '../lib/forms/validation';
declare global {
  var promoRouteDb: D1Database;
  var promoRouteActor: { id: string; role: 'admin' | 'super_admin' } | null;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env={get DB(){return globalThis.promoRouteDb},APP_ORIGIN:"http://localhost:3000",HASTABAZAAR_RUNTIME_ENV:"test"}',
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/staff')
      return {
        url: `data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(){if(!globalThis.promoRouteActor)throw new StaffAuthorizationError('Authentication required.',401);return globalThis.promoRouteActor;}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const terms = {
  code: 'SAVE10',
  label: 'Fictional campaign',
  kind: 'fixed',
  fixedPaisa: 1000,
  minimumSubtotalPaisa: 0,
  startsAt: 0,
  endsAt: 253402300799999,
  totalUseLimit: 2,
  perCustomerUseLimit: 1,
  budgetPaisa: 2000,
};
function request(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/admin/promo-codes', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
void test('promo receiver rejects unsafe origin and oversized body before financial mutation', async () => {
  const route = await import('../app/api/admin/promo-codes/route');
  globalThis.promoRouteActor = { id: 'super', role: 'super_admin' };
  assert.equal(
    (await route.POST(request({}, 'https://attacker.test'))).status,
    403,
  );
  assert.equal(
    (await route.POST(request({ padding: 'x'.repeat(270000) }))).status,
    413,
  );
});
void test('actual promo receiver enforces actor, finite limits, optimistic version, exact replay, configured provenance and GET privacy', async () => {
  const route = await import('../app/api/admin/promo-codes/route');
  const f = await createIncentiveDb();
  globalThis.promoRouteDb = f.db;
  try {
    for (const id of ['super', 'admin']) {
      await seedIncentiveCustomer(f.db, id);
      await f.db
        .prepare(
          'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)',
        )
        .bind(id, id === 'super' ? 'super_admin' : 'admin')
        .run();
    }
    await f.db
      .prepare(
        `INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES ('promo-v1','staff.promo-code',1,1,'published',?,'Fixture','super',1,'super',1,'super',1,'seed')`,
      )
      .bind(
        JSON.stringify({
          formId: 'staff.promo-code',
          fields: [
            {
              id: 'context_note',
              key: 'context_note',
              label: 'Context note',
              type: 'short_text',
              required: true,
              status: 'active',
              order: 0,
            },
          ],
        }),
      )
      .run();
    const body = {
      action: 'draft',
      terms,
      expectedVersion: 0,
      requestId: 'route-draft',
      reason: 'Fictional approved campaign',
      formVersion: 1,
      customAnswers: [{ fieldId: 'context_note', value: 'Fictional reason' }],
    };
    globalThis.promoRouteActor = null;
    assert.equal((await route.POST(request(body))).status, 401);
    globalThis.promoRouteActor = { id: 'admin', role: 'admin' };
    assert.equal((await route.POST(request(body))).status, 403);
    globalThis.promoRouteActor = { id: 'super', role: 'super_admin' };
    assert.equal(
      (
        await route.POST(
          request({ ...body, terms: { ...terms, budgetPaisa: 0 } }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await route.POST(
          request({
            ...body,
            customAnswers: [{ fieldId: 'budgetPaisa', value: 999999 }],
          }),
        )
      ).status,
      400,
    );
    const first = await route.POST(request(body));
    assert.equal(first.status, 200);
    const original = (await first.json()) as {
      version: number;
      campaignId: string;
    };
    assert.equal(original.version, 1);
    assert.equal(
      (
        await route.POST(
          request({
            action: 'publish',
            campaignId: original.campaignId,
            expectedVersion: 0,
            requestId: 'route-stale',
            reason: body.reason,
            formVersion: 1,
            customAnswers: body.customAnswers,
          }),
        )
      ).status,
      409,
    );
    const published = await route.POST(
      request({
        ...body,
        action: 'publish',
        terms: undefined,
        campaignId: original.campaignId,
        expectedVersion: 1,
        requestId: 'route-pub',
      }),
    );
    assert.equal(published.status, 200);
    const mutationProof = async () => ({
      campaign: await f.db
        .prepare(
          'SELECT version,paused,status,current_revision,draft_revision FROM promo_campaigns WHERE id=?',
        )
        .bind(original.campaignId)
        .first(),
      audits: await f.db
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'promo.%'",
        )
        .first(),
      answers: await f.db
        .prepare(
          "SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='staff.promo-code'",
        )
        .first(),
    });
    const beforeMalformedAction = await mutationProof();
    const malformedActions: unknown[] = [
      ['publish'],
      ['draft'],
      ['pause'],
      null,
      7,
      {},
      true,
      undefined,
    ];
    for (const [index, action] of malformedActions.entries()) {
      const response = await route.POST(
        request({
          ...body,
          action,
          terms: undefined,
          campaignId: original.campaignId,
          expectedVersion: 2,
          requestId: `route-malformed-action-${index}`,
        }),
      );
      assert.equal(
        response.status,
        400,
        `non-string action ${JSON.stringify(action)} must reject`,
      );
      assert.deepEqual(
        await mutationProof(),
        beforeMalformedAction,
        'malformed actions must leave campaign version/pause/audit/answers unchanged',
      );
    }
    assert.equal(
      (
        await route.POST(
          request({
            ...body,
            action: 'pause',
            terms: undefined,
            campaignId: original.campaignId,
            expectedVersion: 2,
            requestId: 'route-pause',
          }),
        )
      ).status,
      200,
    );
    assert.deepEqual(await (await route.POST(request(body))).json(), original);
    assert.equal(
      (
        await route.POST(
          request({ ...body, terms: { ...terms, fixedPaisa: 999 } }),
        )
      ).status,
      409,
    );
    const detail = await route.GET(
      new Request(
        `http://localhost:3000/api/admin/promo-codes?campaignId=${original.campaignId}`,
      ),
    );
    assert.equal(detail.status, 200);
    assert.equal(((await detail.json()) as { paused: boolean }).paused, true);
    const history = await route.GET(
      new Request(
        `http://localhost:3000/api/admin/promo-codes?campaignId=${original.campaignId}&view=history`,
      ),
    );
    assert.deepEqual(await history.json(), {
      redemptions: [],
      nextCursor: null,
    });
    assert.equal(
      (
        await route.GET(
          new Request('http://localhost:3000/api/admin/promo-codes?limit=51'),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await route.GET(
          new Request('http://localhost:3000/api/admin/promo-codes?unknown=x'),
        )
      ).status,
      400,
    );
    await f.db
      .prepare("UPDATE users SET status='suspended' WHERE id='super'")
      .run();
    assert.equal((await route.POST(request(body))).status, 403);
    assert.equal(
      (
        await route.GET(
          new Request('http://localhost:3000/api/admin/promo-codes'),
        )
      ).status,
      403,
    );
    await f.db
      .prepare("UPDATE users SET status='active' WHERE id='super'")
      .run();
    let limited: Response | undefined;
    for (let i = 0; i < 41; i++) {
      limited = await route.POST(request(body));
      if (limited.status === 429) break;
      assert.equal(limited.status, 200);
    }
    assert.equal(limited?.status, 429);
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'promo.%'",
          )
          .first<{ n: number }>()
      )?.n,
      3,
    );
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='staff.promo-code'",
          )
          .first<{ n: number }>()
      )?.n,
      3,
    );
  } finally {
    await f.dispose();
  }
});
void test('real promo receiver is registered with closed protected finite financial fields', () => {
  const form = FORM_REGISTRY['staff.promo-code'];
  assert.equal(form.adapterId, 'staff.promo-code');
  assert.deepEqual(IMPLEMENTED_FORM_ADAPTERS['staff.promo-code'], {
    formId: 'staff.promo-code',
    route: '/api/admin/promo-codes',
    mode: 'operation',
  });
  assert.ok(form.baseFields.every((field) => field.capability === 'protected'));
  for (const key of [
    'draftRevision',
    'publishedRevision',
    'budgetPaisa',
    'percentBps',
    'campaignId',
    'expectedVersion',
    'requestId',
  ])
    assert.throws(() =>
      validateFormDraft(form.id, {
        formId: form.id,
        fields: [
          {
            id: key,
            key,
            type: 'number',
            label: 'Override',
            required: true,
            order: 0,
            status: 'active',
          },
        ],
      }),
    );
});
