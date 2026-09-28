import assert from 'node:assert/strict';
import test from 'node:test';
import {
  repo,
  policy,
  fixture,
  claim,
  ctx,
  TERMS,
  NOW,
  publishForm,
  beforeBatch,
} from './helpers/loyalty-fixture';
void test('audited draft stays separate from live terms; publication and pause each store atomic provenance', async () => {
  const r = await repo(),
    f = await fixture(false);
  try {
    const d = await r.saveLoyaltyDraft(f.db, ctx('draft'), TERMS);
    assert.equal(d.version, 2);
    assert.equal(d.draftRevision, 1);
    assert.equal(d.publishedRevision, 0);
    assert.equal(
      (await r.getRewards(f.db, 'customer', NOW)).state.enabled,
      false,
    );
    const live = await r.publishLoyalty(f.db, ctx('publish', 2));
    assert.equal(live.version, 3);
    assert.equal(live.draftRevision, null);
    assert.equal(live.paused, false);
    const paused = await r.pauseLoyalty(f.db, ctx('pause', 3));
    assert.equal(paused.paused, true);
    assert.equal(
      (await f.db
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'loyalty.%'",
        )
        .first<{ n: number }>())!.n,
      3,
    );
    assert.equal(
      (await f.db
        .prepare(
          "SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='staff.loyalty-settings'",
        )
        .first<{ n: number }>())!.n,
      3,
    );
    assert.deepEqual(await r.saveLoyaltyDraft(f.db, ctx('draft'), TERMS), d);
    await assert.rejects(
      r.saveLoyaltyDraft(f.db, ctx('draft'), { ...TERMS, dailyPoints: 20 }),
      { code: 'conflict' },
    );
  } finally {
    await f.dispose();
  }
});
void test('settings reject malformed unsafe unbounded unauthorized stale or missing provenance without writes', async () => {
  const r = await repo(),
    f = await fixture(false);
  try {
    for (const patch of [
      { dailyPoints: 0 },
      { dailyPoints: 1.5 },
      { dailyBudgetPoints: 0 },
      { lifetimeBudgetPoints: Infinity },
      { endsAt: 0 },
      { enabled: 1 },
      { creditPaisaPerBlock: Number.MAX_SAFE_INTEGER + 1 },
      { unexpected: 10 },
    ])
      await assert.rejects(
        r.saveLoyaltyDraft(f.db, ctx('invalid-' + JSON.stringify(patch)), {
          ...TERMS,
          ...patch,
        } as never),
        { code: 'invalid' },
      );
    await assert.rejects(
      r.saveLoyaltyDraft(f.db, ctx('admin', 1, 'admin'), TERMS),
      { code: 'unauthorized' },
    );
    await assert.rejects(r.saveLoyaltyDraft(f.db, ctx('stale', 2), TERMS), {
      code: 'stale',
    });
    await assert.rejects(
      r.saveLoyaltyDraft(
        f.db,
        { ...ctx('missing'), form: undefined } as never,
        TERMS,
      ),
    );
    assert.equal(
      (await f.db
        .prepare('SELECT COUNT(*) n FROM loyalty_revisions')
        .first<{ n: number }>())!.n,
      1,
    );
  } finally {
    await f.dispose();
  }
});
void test('first award locks denomination forever and future budgets cannot undercut consumed totals', async () => {
  const r = await repo(),
    f = await fixture();
  try {
    await r.claimDailyPoints(f.db, claim());
    for (const patch of [
      { pointsPerBlock: 200 },
      { creditPaisaPerBlock: 900 },
      { dailyBudgetPoints: 9 },
      { lifetimeBudgetPoints: 9 },
    ])
      await assert.rejects(
        r.saveLoyaltyDraft(f.db, ctx('invalid-' + JSON.stringify(patch)), {
          ...TERMS,
          ...patch,
        }),
        { code: 'invalid' },
      );
    const draft = await r.saveLoyaltyDraft(f.db, ctx('draft'), {
      ...TERMS,
      dailyPoints: 5,
    });
    assert.equal(draft.rateLocked, true);
    assert.equal(draft.issuedPoints, 10);
    const pub = await r.publishLoyalty(f.db, ctx('publish', draft.version));
    assert.equal(pub.issuedPoints, 10);
    assert.equal(pub.outstandingPoints, 10);
    assert.deepEqual(pub.liability, {
      wholeBlocks: 0,
      creditPaisa: 0,
      remainingPoints: 10,
    });
  } finally {
    await f.dispose();
  }
});
void test('liability keeps fractional-block outstanding exposure and rejects numeric overflow', async () => {
  const p = await policy();
  assert.deepEqual(p.loyaltyLiability(210, 100, 1000), {
    wholeBlocks: 2,
    creditPaisa: 2000,
    remainingPoints: 10,
  });
  assert.throws(() =>
    p.loyaltyLiability(Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER),
  );
});
void test('administrative authority form and version fences abort all domain and answer writes', async () => {
  const r = await repo();
  for (const scenario of ['actor', 'form', 'version', 'answer']) {
    const f = await fixture(false);
    try {
      const db = beforeBatch(f.db, async () => {
        if (scenario === 'actor')
          await f.db
            .prepare(
              "DELETE FROM user_roles WHERE user_id='super' AND role='super_admin'",
            )
            .run();
        if (scenario === 'form')
          await publishForm(f.db, 'staff.loyalty-settings', 2);
        if (scenario === 'version')
          await f.db.prepare('UPDATE loyalty_config SET version=2').run();
      });
      const context = ctx('mutation');
      if (scenario === 'answer')
        (context.form.answers as unknown as { answers: unknown[] }).answers = [
          {
            fieldId: 'forged',
            label: 'Forged',
            type: 'short_text',
            value: 'bad',
          },
        ];
      await assert.rejects(r.saveLoyaltyDraft(db, context, TERMS));
      assert.equal(
        (await f.db
          .prepare('SELECT COUNT(*) n FROM loyalty_revisions')
          .first<{ n: number }>())!.n,
        1,
        scenario + ' revisions',
      );
      assert.equal(
        (await f.db
          .prepare(
            "SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'loyalty.%'",
          )
          .first<{ n: number }>())!.n,
        0,
        scenario + ' audit',
      );
      assert.equal(
        (await f.db
          .prepare('SELECT COUNT(*) n FROM form_answer_sets')
          .first<{ n: number }>())!.n,
        0,
        scenario + ' answers',
      );
    } finally {
      await f.dispose();
    }
  }
});
void test('concurrent settings save has one winner and authorized replay does not bypass current role', async () => {
  const r = await repo(),
    f = await fixture(false);
  try {
    const result = await Promise.allSettled([
      r.saveLoyaltyDraft(f.db, ctx('one'), TERMS),
      r.saveLoyaltyDraft(f.db, ctx('two'), TERMS),
    ]);
    assert.equal(result.filter((x) => x.status === 'fulfilled').length, 1);
    const id = result[0].status === 'fulfilled' ? 'one' : 'two';
    await f.db
      .prepare(
        "DELETE FROM user_roles WHERE user_id='super' AND role='super_admin'",
      )
      .run();
    await assert.rejects(r.saveLoyaltyDraft(f.db, ctx(id), TERMS), {
      code: 'unauthorized',
    });
  } finally {
    await f.dispose();
  }
});

void test('loyalty settings bind staff subject before reads receipt lookup and replay intent', async (t) => {
  const r = await repo(),
    f = await fixture(false);
  const originalContext = { ...ctx('subject-receipt'), authSubject: 'super' };
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
  try {
    await r.saveLoyaltyDraft(f.db, originalContext, TERMS);
    await f.db
      .prepare("UPDATE users SET auth_subject='replacement' WHERE id='super'")
      .run();
    await t.test(
      'admin read rejects original authenticated subject',
      async () => {
        const before = await proof();
        await assert.rejects(r.getLoyaltyState(f.db, 'super', NOW, 'super'), {
          code: 'unauthorized',
        });
        assert.deepEqual(await proof(), before);
      },
    );
    await t.test(
      'fresh mutation checks staff subject before domain work',
      async () => {
        const before = await proof(),
          version = (await f.db
            .prepare('SELECT version FROM loyalty_config')
            .first<{ version: number }>())!.version;
        await assert.rejects(
          r.saveLoyaltyDraft(
            f.db,
            { ...ctx('old-subject-fresh', version), authSubject: 'super' },
            TERMS,
          ),
          { code: 'unauthorized' },
        );
        assert.deepEqual(await proof(), before);
      },
    );
    await t.test(
      'old subject exact and changed receipt intent both fail authority first',
      async () => {
        const before = await proof();
        for (const terms of [TERMS, { ...TERMS, dailyPoints: 20 }])
          await assert.rejects(
            r.saveLoyaltyDraft(f.db, originalContext, terms),
            { code: 'unauthorized' },
          );
        assert.deepEqual(await proof(), before);
      },
    );
    await t.test(
      'new current staff subject cannot replay old identity receipt',
      async () => {
        const before = await proof();
        await assert.rejects(
          r.saveLoyaltyDraft(
            f.db,
            { ...originalContext, authSubject: 'replacement' },
            TERMS,
          ),
          { code: 'conflict' },
        );
        assert.deepEqual(await proof(), before);
      },
    );
    await t.test(
      'missing staff subject is invalid without domain changes',
      async () => {
        const before = await proof(),
          version = (await f.db
            .prepare('SELECT version FROM loyalty_config')
            .first<{ version: number }>())!.version;
        const payload = { ...ctx('missing-subject', version) } as Record<
          string,
          unknown
        >;
        delete payload.authSubject;
        await assert.rejects(
          r.saveLoyaltyDraft(f.db, payload as never, TERMS),
          { code: 'invalid' },
        );
        assert.deepEqual(await proof(), before);
      },
    );
  } finally {
    await f.dispose();
  }
});
