import assert from 'node:assert/strict';
import test from 'node:test';
import { beforeBatch } from './helpers/loyalty-fixture';
import { digestFormRequest } from '../lib/forms/submission';
import { buildFormAnswerInsert } from '../lib/db/repositories/form-answers';
import * as promoRepository from '../lib/db/repositories/promo-codes';
import {
  createIncentiveDb,
  seedIncentiveCustomer,
  seedIncentiveInventory,
  incentiveItem,
} from './helpers/incentive-db';
import type {
  PromoMutationContext,
  PromoTerms,
  PromoQuote,
} from '../lib/incentives/types';

const terms: PromoTerms = {
  code: 'SAVE10',
  label: 'Save ten',
  kind: 'fixed',
  fixedPaisa: 1000,
  minimumSubtotalPaisa: 5000,
  startsAt: 10,
  endsAt: 100000,
  totalUseLimit: 20,
  perCustomerUseLimit: 3,
  budgetPaisa: 20000,
};
async function repository() {
  return promoRepository;
}
async function fixture() {
  const f = await createIncentiveDb();
  await seedIncentiveCustomer(f.db);
  await seedIncentiveInventory(f.db);
  for (const id of ['super', 'admin', 'other']) {
    await seedIncentiveCustomer(f.db, id);
    await f.db
      .prepare(
        'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)',
      )
      .bind(id, id === 'admin' ? 'admin' : 'super_admin')
      .run();
  }
  await publishForm(f.db, 1);
  return f;
}
async function publishForm(db: D1Database, version: number) {
  await db
    .prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?,'staff.promo-code',?,1,'published',?,'Fixture','super',1,'super',1,'super',1,?)`)
    .bind(
      `promo-v${version}`,
      version,
      JSON.stringify({ formId: 'staff.promo-code', fields: [] }),
      `seed-${version}`,
    )
    .run();
}
function ctx(
  requestId: string,
  expectedVersion = 0,
  actorId = 'super',
  version = 1,
): PromoMutationContext {
  return {
    actorId,
    authSubject: actorId,
    requestId,
    expectedVersion,
    now: 100,
    reason: 'Approved fictional campaign',
    form: {
      formId: 'staff.promo-code',
      versionId: `promo-v${version}`,
      answers: { formId: 'staff.promo-code', version, answers: [] },
    },
  };
}
async function counts(db: D1Database) {
  return Promise.all(
    [
      'promo_campaigns',
      'promo_revisions',
      'audit_logs',
      'form_answer_sets',
      'promo_redemptions',
    ].map(
      async (table) =>
        (
          await db
            .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
            .first<{ n: number }>()
        )?.n,
    ),
  );
}
function order(db: D1Database, id: string, q: PromoQuote, userId = 'customer') {
  return db
    .prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at,promo_discount_paisa,promo_campaign_id,promo_revision,promo_code,promo_label)
    VALUES (?,?,?,'customer@example.test','9811111111','placed','en-NP','fixture','{}',10000,500,?,'cod','unpaid',100,100,?,?,?,?,?)`)
    .bind(
      id,
      `FIX-${id}`,
      userId,
      10500 - q.discountPaisa,
      q.discountPaisa,
      q.campaignId,
      q.revision,
      q.code,
      q.label,
    );
}
void test('active Super Admin drafts/publishes atomically; ordinary admin, stale, malformed and missing provenance reject', async () => {
  const r = await repository();
  const f = await fixture();
  try {
    await assert.rejects(
      r.savePromoDraft(f.db, ctx('denied', 0, 'admin'), terms),
      { code: 'unauthorized' },
    );
    const draft = await r.savePromoDraft(f.db, ctx('draft'), {
      ...terms,
      code: ' save10 ',
    });
    assert.equal(draft.version, 1);
    assert.equal(draft.draftRevision, 1);
    assert.equal(draft.publishedRevision, null);
    const live = await r.publishPromo(
      f.db,
      ctx('publish', 1),
      draft.campaignId,
    );
    assert.equal(live.version, 2);
    assert.equal(live.publishedRevision, 1);
    assert.equal(live.draftRevision, null);
    const before = await counts(f.db);
    await assert.rejects(
      r.pausePromo(f.db, ctx('stale', 1), draft.campaignId),
      { code: 'stale' },
    );
    await assert.rejects(
      r.savePromoDraft(
        f.db,
        ctx('invalid', 2),
        { ...terms, totalUseLimit: 0 },
        draft.campaignId,
      ),
      { code: 'invalid' },
    );
    await assert.rejects(
      r.savePromoDraft(
        f.db,
        {
          ...ctx('wrongform', 2),
          form: { ...ctx('x').form, formId: 'account.profile' },
        },
        terms,
        draft.campaignId,
      ),
      { code: 'invalid' },
    );
    assert.deepEqual(await counts(f.db), before);
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'promo.%'",
          )
          .first<{ n: number }>()
      )?.n,
      2,
    );
    assert.equal((await counts(f.db))[3], 2);
  } finally {
    await f.dispose();
  }
});
void test('quotes read only current live terms; reject windows/minimum/pause and never expose another customer', async () => {
  const r = await repository();
  const f = await fixture();
  try {
    let s = await r.savePromoDraft(f.db, ctx('draft'), terms);
    s = await r.publishPromo(f.db, ctx('pub', 1), s.campaignId);
    const before = await counts(f.db);
    for (const input of [
      { now: 0, subtotalPaisa: 10000 },
      { now: 100000, subtotalPaisa: 10000 },
      { now: 100, subtotalPaisa: 4999 },
    ])
      await assert.rejects(
        r.quotePromo(f.db, { userId: 'customer', code: 'save10', ...input }),
      );
    await assert.rejects(
      r.quotePromo(f.db, {
        userId: 'missing',
        code: 'SAVE10',
        now: 100,
        subtotalPaisa: 10000,
      }),
      { code: 'unauthorized' },
    );
    const q = await r.quotePromo(f.db, {
      userId: 'customer',
      code: ' save10 ',
      now: 100,
      subtotalPaisa: 10000,
    });
    assert.deepEqual(
      Object.keys(q).sort(),
      [
        'campaignId',
        'revision',
        'code',
        'label',
        'discountPaisa',
        'subtotalPaisa',
        'expiresAt',
        'minimumSubtotalPaisa',
      ].sort(),
    );
    assert.equal(q.discountPaisa, 1000);
    assert.deepEqual(await counts(f.db), before);
    await r.savePromoDraft(
      f.db,
      ctx('edit', 2),
      { ...terms, fixedPaisa: 2000 },
      s.campaignId,
    );
    assert.equal(
      (
        await r.quotePromo(f.db, {
          userId: 'customer',
          code: 'SAVE10',
          now: 100,
          subtotalPaisa: 10000,
        })
      ).discountPaisa,
      1000,
    );
    await r.pausePromo(f.db, ctx('pause', 3), s.campaignId);
    await assert.rejects(
      r.quotePromo(f.db, {
        userId: 'customer',
        code: 'SAVE10',
        now: 100,
        subtotalPaisa: 10000,
      }),
      { code: 'unavailable' },
    );
  } finally {
    await f.dispose();
  }
});
void test('exact admin replay retains original response after pause/new publication; changed intent and revoked actor reject', async () => {
  const r = await repository();
  const f = await fixture();
  try {
    const c = ctx('draft');
    const original = await r.savePromoDraft(f.db, c, terms);
    await r.publishPromo(f.db, ctx('pub', 1), original.campaignId);
    await r.pausePromo(f.db, ctx('pause', 2), original.campaignId);
    await publishForm(f.db, 2);
    assert.deepEqual(
      await r.savePromoDraft(f.db, { ...c, now: 200000 }, terms),
      original,
    );
    await assert.rejects(
      r.savePromoDraft(f.db, c, { ...terms, fixedPaisa: 999 }),
      { code: 'conflict' },
    );
    await assert.rejects(
      r.savePromoDraft(f.db, { ...c, expectedVersion: 1 }, terms),
      { code: 'conflict' },
    );
    await f.db
      .prepare("UPDATE users SET status='suspended' WHERE id='super'")
      .run();
    await assert.rejects(r.savePromoDraft(f.db, c, terms), {
      code: 'unauthorized',
    });
  } finally {
    await f.dispose();
  }
});
void test('republishing never replenishes consumed campaign budget', async () => {
  const r = await repository();
  const f = await fixture();
  try {
    let s = await r.savePromoDraft(f.db, ctx('draft'), {
      ...terms,
      totalUseLimit: 1,
      perCustomerUseLimit: 1,
      budgetPaisa: 1000,
    });
    s = await r.publishPromo(f.db, ctx('pub', 1), s.campaignId);
    const q = await r.quotePromo(f.db, {
      userId: 'customer',
      code: 'SAVE10',
      now: 100,
      subtotalPaisa: 10000,
    });
    const attempts = await Promise.all(
      ['one', 'two'].map(async (id) => {
        const prepared = await r.preparePromoConsumption(f.db, {
          userId: 'customer',
          orderId: id,
          requestId: id,
          quote: q,
          now: 100,
          payloadDigest: 'a'.repeat(64),
          response: { orderId: id },
        });
        assert.ok(
          prepared.length > 0,
          'Consumption must return commit-time statements',
        );
        return [
          order(f.db, id, q),
          incentiveItem(f.db, `item-${id}`, id, q.discountPaisa),
          ...prepared,
        ];
      }),
    );
    const outcomes = await Promise.allSettled(
      attempts.map((statements) => f.db.batch([...statements])),
    );
    assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal((await counts(f.db))[4], 1);
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM orders')
          .first<{ n: number }>()
      )?.n,
      1,
    );
    let state = await r.getPromoCampaign(f.db, {
      actorId: 'super',
      authSubject: 'super',
      campaignId: s.campaignId,
    });
    assert.equal(state.usedCount, 1);
    assert.equal(state.spentPaisa, 1000);
    assert.equal(state.maximumCustomerUsedCount, 1);
    await assert.rejects(
      r.quotePromo(f.db, {
        userId: 'customer',
        code: 'SAVE10',
        now: 100,
        subtotalPaisa: 10000,
      }),
      { code: 'exhausted' },
    );
    await assert.rejects(
      r.savePromoDraft(
        f.db,
        ctx('lower', 2),
        { ...terms, budgetPaisa: 999 },
        s.campaignId,
      ),
      { code: 'invalid' },
    );
    state = await r.savePromoDraft(f.db, ctx('edit', 2), terms, s.campaignId);
    state = await r.publishPromo(f.db, ctx('pub2', 3), s.campaignId);
    assert.equal(state.usedCount, 1);
    assert.equal(state.spentPaisa, 1000);
    assert.equal(state.publishedRevision, 2);
    const nextQuote = await r.quotePromo(f.db, {
      userId: 'customer',
      code: 'SAVE10',
      now: 100,
      subtotalPaisa: 10000,
    });
    for (const [id, userId] of [
      ['next', 'customer'],
      ['third', 'other'],
    ])
      await f.db.batch([
        order(f.db, id, nextQuote, userId),
        incentiveItem(f.db, `${id}-item`, id, nextQuote.discountPaisa),
        ...(await r.preparePromoConsumption(f.db, {
          userId,
          orderId: id,
          requestId: id,
          quote: nextQuote,
          now: 100,
          payloadDigest: 'a'.repeat(64),
          response: { orderId: id },
        })),
      ]);
    await assert.rejects(
      r.savePromoDraft(
        f.db,
        ctx('lowercustomer', 4),
        { ...terms, perCustomerUseLimit: 1 },
        s.campaignId,
      ),
      { code: 'invalid' },
    );
    await assert.rejects(
      r.savePromoDraft(
        f.db,
        ctx('lowertotal', 4),
        { ...terms, totalUseLimit: 2, perCustomerUseLimit: 2 },
        s.campaignId,
      ),
      { code: 'invalid' },
    );
    const history = await r.listPromoRedemptions(f.db, {
      actorId: 'super',
      authSubject: 'super',
      campaignId: s.campaignId,
      limit: 2,
    });
    assert.equal(history.redemptions.length, 2);
    assert.ok(history.nextCursor);
    assert.equal('customerId' in history.redemptions[0], false);
    const rest = await r.listPromoRedemptions(f.db, {
      actorId: 'super',
      authSubject: 'super',
      campaignId: s.campaignId,
      limit: 2,
      cursor: history.nextCursor!,
    });
    assert.equal(rest.redemptions.length, 1);
    assert.equal(rest.nextCursor, null);
    assert.equal(
      new Set(
        [...history.redemptions, ...rest.redemptions].map(
          (row) => row.redemptionId,
        ),
      ).size,
      3,
    );
    await assert.rejects(
      r.listPromoRedemptions(f.db, {
        actorId: 'other',
        authSubject: 'other',
        campaignId: s.campaignId,
        cursor: history.nextCursor!,
      }),
      { code: 'invalid' },
    );
  } finally {
    await f.dispose();
  }
});
void test('commit-time role/version/config/math assertions roll back parent writes and audit', async () => {
  const r = await repository();
  const f = await fixture();
  try {
    let s = await r.savePromoDraft(f.db, ctx('draft'), terms);
    s = await r.publishPromo(f.db, ctx('pub', 1), s.campaignId);
    const q = await r.quotePromo(f.db, {
      userId: 'customer',
      code: 'SAVE10',
      now: 100,
      subtotalPaisa: 10000,
    });
    const p = await r.preparePromoConsumption(f.db, {
      userId: 'customer',
      orderId: 'bad',
      requestId: 'bad',
      quote: q,
      now: 100,
      payloadDigest: 'a'.repeat(64),
      response: { orderId: 'bad' },
    });
    assert.ok(
      p.length > 0,
      'Consumption must return authority and redemption statements',
    );
    await f.db
      .prepare("UPDATE users SET status='suspended' WHERE id='customer'")
      .run();
    await assert.rejects(
      f.db.batch([
        order(f.db, 'bad', q),
        incentiveItem(f.db, 'bad-item', 'bad', 1000),
        ...p,
      ]),
    );
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM orders')
          .first<{ n: number }>()
      )?.n,
      0,
    );
    await f.db
      .prepare("UPDATE users SET status='active' WHERE id='customer'")
      .run();
    await assert.rejects(
      r.preparePromoConsumption(f.db, {
        userId: 'customer',
        orderId: 'forged',
        requestId: 'forged',
        quote: { ...q, discountPaisa: 1 },
        now: 100,
        payloadDigest: 'a'.repeat(64),
        response: {},
      }),
      { code: 'stale' },
    );
    const before = await counts(f.db);
    const withBeforeBatch = (hook: () => Promise<void>): D1Database =>
      new Proxy(f.db, {
        get(target, key) {
          if (key === 'batch')
            return async (statements: D1PreparedStatement[]) => {
              await hook();
              return target.batch(statements);
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    await assert.rejects(
      r.pausePromo(
        withBeforeBatch(async () => {
          await f.db
            .prepare(
              "DELETE FROM user_roles WHERE user_id='super' AND role='super_admin'",
            )
            .run();
        }),
        ctx('commit-role', 2),
        s.campaignId,
      ),
      { code: 'unauthorized' },
    );
    assert.deepEqual(await counts(f.db), before);
    await f.db
      .prepare(
        "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
      )
      .run();
    await assert.rejects(
      r.pausePromo(
        withBeforeBatch(() => publishForm(f.db, 2)),
        ctx('commit-config', 2),
        s.campaignId,
      ),
      { code: 'stale' },
    );
    assert.deepEqual(await counts(f.db), before);
    await assert.rejects(
      f.db.batch([
        order(f.db, 'rollback', q),
        incentiveItem(f.db, 'rollback-item', 'rollback', 1000),
        ...(await r.preparePromoConsumption(f.db, {
          userId: 'customer',
          orderId: 'rollback',
          requestId: 'rollback',
          quote: q,
          now: 100,
          payloadDigest: 'a'.repeat(64),
          response: {},
        })),
        f.db.prepare(
          "INSERT INTO staff_permission_guards(id,valid) VALUES ('failure',0)",
        ),
      ]),
    );
    assert.equal((await counts(f.db))[4], 0);
  } finally {
    await f.dispose();
  }
});
void test('bounded stable read pagination requires current active Super Admin and binds cursor scope', async () => {
  const r = await repository();
  const f = await fixture();
  try {
    for (let i = 0; i < 4; i++)
      await r.savePromoDraft(f.db, ctx(`d${i}`), {
        ...terms,
        code: `SAVE${i}`,
      });
    const first = await r.listPromoCampaigns(f.db, {
      actorId: 'super',
      authSubject: 'super',
      limit: 2,
    });
    assert.equal(first.campaigns.length, 2);
    assert.ok(first.nextCursor);
    const next = await r.listPromoCampaigns(f.db, {
      actorId: 'super',
      authSubject: 'super',
      limit: 2,
      cursor: first.nextCursor!,
    });
    assert.equal(next.campaigns.length, 2);
    assert.equal(next.nextCursor, null);
    assert.equal(
      new Set([...first.campaigns, ...next.campaigns].map((x) => x.campaignId))
        .size,
      4,
    );
    await assert.rejects(
      r.listPromoCampaigns(f.db, {
        actorId: 'other',
        authSubject: 'other',
        cursor: first.nextCursor!,
      }),
      { code: 'invalid' },
    );
    await assert.rejects(
      r.listPromoCampaigns(f.db, {
        actorId: 'super',
        authSubject: 'super',
        limit: 51,
      }),
      { code: 'invalid' },
    );
    await assert.rejects(r.listPromoCampaigns(f.db, { actorId: 'admin', authSubject: 'admin' }), {
      code: 'unauthorized',
    });
    await assert.rejects(
      r.getPromoCampaign(f.db, {
        actorId: 'admin',
        authSubject: 'admin',
        campaignId: first.campaigns[0].campaignId,
      }),
      { code: 'unauthorized' },
    );
    await assert.rejects(
      r.listPromoRedemptions(f.db, {
        actorId: 'admin',
        authSubject: 'admin',
        campaignId: first.campaigns[0].campaignId,
      }),
      { code: 'unauthorized' },
    );
  } finally {
    await f.dispose();
  }
});

void test('promo settings require authenticated staff subject for preflight, receipt and SELECT-only reads', async (t) => {
  const r = await repository(),
    f = await fixture();
  try {
    const context = ctx('subject-original');
    const original = await r.savePromoDraft(f.db, context, terms);
    const snapshot = async () => ({
      campaigns: (
        await f.db.prepare('SELECT * FROM promo_campaigns ORDER BY id').all()
      ).results,
      revisions: (
        await f.db
          .prepare(
            'SELECT * FROM promo_revisions ORDER BY campaign_id,revision',
          )
          .all()
      ).results,
      counts: await counts(f.db),
    });
    await t.test('missing subject is invalid', async () => {
      const before = await snapshot();
      const { authSubject: _, ...withoutSubject } =
        context as typeof context & { authSubject: string };
      await assert.rejects(
        r.savePromoDraft(f.db, withoutSubject as PromoMutationContext, terms),
        { code: 'invalid' },
      );
      assert.deepEqual(await snapshot(), before);
    });
    await f.db
      .prepare("UPDATE users SET auth_subject='replacement' WHERE id='super'")
      .run();
    await t.test(
      'obsolete subject rejects fresh mutation and exact receipt',
      async () => {
        const before = await snapshot();
        await assert.rejects(r.savePromoDraft(f.db, context, terms), {
          code: 'unauthorized',
        });
        await assert.rejects(
          r.pausePromo(
            f.db,
            ctx('subject-new', original.version),
            original.campaignId,
          ),
          { code: 'unauthorized' },
        );
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test(
      'replacement subject cannot reuse prior identity receipt',
      async () => {
        const before = await snapshot();
        await assert.rejects(
          r.savePromoDraft(
            f.db,
            { ...context, authSubject: 'replacement' },
            terms,
          ),
          { code: 'conflict' },
        );
        assert.deepEqual(await snapshot(), before);
      },
    );
    for (const view of ['list', 'detail', 'history'] as const)
      await t.test('read ' + view + ' checks subject', async () => {
        const before = await snapshot();
        const input = {
          actorId: 'super',
          authSubject: 'super',
          campaignId: original.campaignId,
        };
        await assert.rejects(
          view === 'list'
            ? r.listPromoCampaigns(f.db, input)
            : view === 'detail'
              ? r.getPromoCampaign(f.db, input)
              : r.listPromoRedemptions(f.db, input),
          { code: 'unauthorized' },
        );
        assert.deepEqual(await snapshot(), before);
      });
    await f.db
      .prepare("UPDATE users SET auth_subject='super' WHERE id='super'")
      .run();
    for (const view of ['list', 'detail', 'history'] as const)
      await t.test(
        'read ' + view + ' rechecks before returning without batch writes',
        async () => {
          const before = await snapshot();
          let changed = false;
          const db = new Proxy(f.db, {
            get(target, key) {
              if (key === 'batch')
                return () => {
                  throw new Error('Administrative read must stay SELECT-only');
                };
              if (key === 'prepare')
                return (sql: string) => {
                  const statement = target.prepare(sql);
                  if (
                    !sql.startsWith(
                      view === 'history'
                        ? 'SELECT id,order_id,revision'
                        : 'SELECT c.*,r.*',
                    )
                  )
                    return statement;
                  return new Proxy(statement, {
                    get(v, p) {
                      if (p === 'bind')
                        return (...args: (string | number | null)[]) =>
                          wrap(v.bind(...args));
                      const member = Reflect.get(v, p);
                      return typeof member === 'function'
                        ? member.bind(v)
                        : member;
                    },
                  });
                  function wrap(
                    value: D1PreparedStatement,
                  ): D1PreparedStatement {
                    return new Proxy(value, {
                      get(v, p) {
                        if (p === 'first' || p === 'all')
                          return async (...args: unknown[]) => {
                            const result = await (
                              Reflect.get(v, p) as (
                                ...args: unknown[]
                              ) => unknown
                            ).apply(v, args);
                            if (!changed) {
                              changed = true;
                              await f.db
                                .prepare(
                                  "UPDATE users SET auth_subject='replacement' WHERE id='super'",
                                )
                                .run();
                            }
                            return result;
                          };
                        const member = Reflect.get(v, p);
                        return typeof member === 'function'
                          ? member.bind(v)
                          : member;
                      },
                    });
                  }
                };
              const member = Reflect.get(target, key);
              return typeof member === 'function'
                ? member.bind(target)
                : member;
            },
          });
          const input = {
            actorId: 'super',
            authSubject: 'super',
            campaignId: original.campaignId,
          };
          await assert.rejects(
            view === 'list'
              ? r.listPromoCampaigns(db, input)
              : view === 'detail'
                ? r.getPromoCampaign(db, input)
                : r.listPromoRedemptions(db, input),
            { code: 'unauthorized' },
          );
          assert.equal(changed, true);
          assert.deepEqual(await snapshot(), before);
          await f.db
            .prepare("UPDATE users SET auth_subject='super' WHERE id='super'")
            .run();
        },
      );
    await t.test(
      'replay staff role change after lookup rejects under checked native batch',
      async () => {
        const before = await snapshot();
        await assert.rejects(
          r.savePromoDraft(
            beforeBatch(f.db, () =>
              f.db
                .prepare(
                  "DELETE FROM user_roles WHERE user_id='super' AND role='super_admin'",
                )
                .run(),
            ),
            context,
            terms,
          ),
          { code: 'unauthorized' },
        );
        assert.deepEqual(await snapshot(), before);
      },
    );
  } finally {
    await f.dispose();
  }
});

void test('legacy promo receipt without authenticated subject proof fails closed for original and replacement identity', async () => {
  const r = await repository(),
    f = await fixture();
  try {
    const original = await r.savePromoDraft(f.db, ctx('legacy-seed'), terms);
    const context = ctx('legacy-receipt');
    // Seed the genuine predecessor receipt shape; retain current domain state and native provenance checks.
    const digest = await digestFormRequest({
      action: 'draft',
      campaignId: null,
      expectedVersion: context.expectedVersion,
      reason: context.reason.trim(),
      terms,
      form: context.form,
    });
    await f.db.batch([
      f.db
        .prepare(
          "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,'super','promo.draft','promo_campaign',?,?,NULL,?,?,NULL,100)",
        )
        .bind(
          'legacy-receipt-audit',
          original.campaignId,
          context.reason,
          JSON.stringify({ digest, response: original }),
          context.requestId,
        ),
      buildFormAnswerInsert(f.db, {
        formId: 'staff.promo-code',
        requestId: context.requestId,
        versionId: context.form.versionId,
        subjectType: 'promo_campaign',
        subjectId: original.campaignId,
        actorId: 'super',
        answers: context.form.answers,
        now: 100,
      }),
    ]);
    const before = await counts(f.db);
    await assert.rejects(r.savePromoDraft(f.db, context, terms), {
      code: 'conflict',
    });
    assert.deepEqual(await counts(f.db), before);
    await f.db
      .prepare("UPDATE users SET auth_subject='replacement' WHERE id='super'")
      .run();
    await assert.rejects(
      r.savePromoDraft(f.db, { ...context, authSubject: 'replacement' }, terms),
      { code: 'conflict' },
    );
    assert.deepEqual(await counts(f.db), before);
    assert.deepEqual(
      await r.getPromoCampaign(f.db, {
        actorId: 'super',
        authSubject: 'replacement',
        campaignId: original.campaignId,
      }),
      original,
    );
  } finally {
    await f.dispose();
  }
});
