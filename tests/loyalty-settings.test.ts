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

void test('locked denomination exposes live rate after a predating draft without rewriting history', async (t) => {
  const r = await repo(),
    f = await fixture(false);
  const A = { ...TERMS, pointsPerBlock: 5, creditPaisaPerBlock: 1000 };
  const B = { ...TERMS, pointsPerBlock: 10, creditPaisaPerBlock: 500 };
  const proof = async () => ({
    config: await f.db.prepare('SELECT * FROM loyalty_config').first(),
    revisions: (
      await f.db
        .prepare('SELECT * FROM loyalty_revisions ORDER BY revision')
        .all()
    ).results,
    claims: (
      await f.db.prepare('SELECT * FROM loyalty_daily_claims ORDER BY id').all()
    ).results,
    entries: (
      await f.db
        .prepare('SELECT * FROM loyalty_points_entries ORDER BY id')
        .all()
    ).results,
    accounts: (
      await f.db
        .prepare('SELECT * FROM loyalty_accounts ORDER BY user_id')
        .all()
    ).results,
    days: (
      await f.db
        .prepare('SELECT * FROM loyalty_day_issuance ORDER BY local_date')
        .all()
    ).results,
    audits: (
      await f.db
        .prepare(
          "SELECT * FROM audit_logs WHERE action LIKE 'loyalty.%' ORDER BY id",
        )
        .all()
    ).results,
    answers: (
      await f.db
        .prepare(
          "SELECT * FROM form_answer_sets WHERE form_id='staff.loyalty-settings' ORDER BY id",
        )
        .all()
    ).results,
  });
  try {
    await t.test(
      'disabled defaults expose no locked denomination',
      async () => {
        const state = await r.getLoyaltyState(f.db, 'super', NOW, 'super');
        assert.equal(state.rateLocked, false);
        assert.equal(state.lockedDenomination, null);
      },
    );
    const draftA = await r.saveLoyaltyDraft(f.db, ctx('rate-live-A'), A);
    const publishContext = ctx('rate-publish-A', draftA.version);
    const publishedA = await r.publishLoyalty(f.db, publishContext);
    const draftContext = ctx('rate-draft-B', publishedA.version);
    const draftB = await r.saveLoyaltyDraft(f.db, draftContext, B);
    await t.test(
      'unissued draft exposure uses its selected denomination',
      async () => {
        assert.equal(draftB.lockedDenomination, null);
        assert.equal(draftB.rateLocked, false);
        assert.deepEqual(draftB.maximumLiability, {
          wholeBlocks: 1000,
          creditPaisa: 500000,
          remainingPoints: 0,
        });
      },
    );
    const claimInput = claim('rate-claim-A', draftB.version);
    const receipt = await r.claimDailyPoints(f.db, claimInput);
    const state = await r.getLoyaltyState(f.db, 'super', NOW, 'super');
    const before = await proof();
    await t.test(
      'selected immutable draft differs from explicit locked live denomination',
      async () => {
        assert.equal(state.version, draftB.version);
        assert.equal(state.revision, draftB.revision);
        assert.equal(state.publishedRevision, publishedA.revision);
        assert.equal(state.rateLocked, true);
        assert.deepEqual(state.terms, B);
        assert.deepEqual(state.lockedDenomination, {
          pointsPerBlock: 5,
          creditPaisaPerBlock: 1000,
        });
        assert.deepEqual(state.liability, {
          wholeBlocks: 2,
          creditPaisa: 2000,
          remainingPoints: 0,
        });
        const rewards = await r.getRewards(
          f.db,
          'customer',
          NOW,
          undefined,
          20,
          'customer',
        );
        assert.equal(rewards.state.revision, publishedA.revision);
        assert.equal(rewards.state.pointsPerBlock, 5);
        assert.equal(rewards.state.creditPaisaPerBlock, 1000);
        assert.equal(Object.hasOwn(rewards.state, 'lockedDenomination'), false);
      },
    );
    await t.test(
      'selected budget exposure uses the effective locked denomination',
      async () => {
        assert.deepEqual(state.maximumLiability, {
          wholeBlocks: 2000,
          creditPaisa: 2000000,
          remainingPoints: 0,
        });
      },
    );
    await t.test(
      'fresh incompatible saved draft is invalid before the native mutation batch',
      async () => {
        let batched = false;
        const db = beforeBatch(f.db, async () => {
          batched = true;
        });
        const error = await r
          .publishLoyalty(db, ctx('rate-publish-B', state.version))
          .then(
            () => null,
            (reason: unknown) => reason as { code: string },
          );
        assert.deepEqual(await proof(), before);
        assert.equal(error?.code, 'invalid');
        assert.equal(batched, false);
      },
    );
    await t.test(
      'authorized exact prelock receipts retain their original snapshots',
      async () => {
        assert.deepEqual(
          await r.saveLoyaltyDraft(f.db, draftContext, B),
          draftB,
        );
        assert.deepEqual(
          await r.publishLoyalty(f.db, publishContext),
          publishedA,
        );
        assert.deepEqual(await proof(), before);
      },
    );
    await t.test(
      'new locked-rate draft repairs publication while preserving old history',
      async () => {
        await assert.rejects(
          r.saveLoyaltyDraft(f.db, ctx('rate-fresh-B', state.version), B),
          { code: 'invalid' },
        );
        const repaired = await r.saveLoyaltyDraft(
          f.db,
          ctx('rate-repair-A', state.version),
          A,
        );
        assert.deepEqual(repaired.lockedDenomination, {
          pointsPerBlock: 5,
          creditPaisaPerBlock: 1000,
        });
        const published = await r.publishLoyalty(
          f.db,
          ctx('rate-repair-publish', repaired.version),
        );
        assert.equal(published.draftRevision, null);
        assert.equal(published.publishedRevision, repaired.revision);
        assert.equal(published.issuedPoints, 10);
        const after = await proof();
        assert.deepEqual(
          after.revisions.slice(0, before.revisions.length),
          before.revisions,
        );
        assert.deepEqual(after.claims, before.claims);
        assert.deepEqual(after.entries, before.entries);
        assert.deepEqual(after.accounts, before.accounts);
        assert.deepEqual(after.days, before.days);
        assert.deepEqual(await r.claimDailyPoints(f.db, claimInput), receipt);
      },
    );
  } finally {
    await f.dispose();
  }
});

void test('first claim after publish preflight still fences an incompatible draft atomically', async () => {
  const r = await repo(),
    f = await fixture(true, { pointsPerBlock: 5, creditPaisaPerBlock: 1000 });
  const proof = async () => ({
    config: await f.db.prepare('SELECT * FROM loyalty_config').first(),
    revisions: (
      await f.db
        .prepare('SELECT * FROM loyalty_revisions ORDER BY revision')
        .all()
    ).results,
    claims: (
      await f.db.prepare('SELECT * FROM loyalty_daily_claims ORDER BY id').all()
    ).results,
    entries: (
      await f.db
        .prepare('SELECT * FROM loyalty_points_entries ORDER BY id')
        .all()
    ).results,
    audits: (
      await f.db
        .prepare(
          "SELECT * FROM audit_logs WHERE action LIKE 'loyalty.%' ORDER BY id",
        )
        .all()
    ).results,
    answers: (
      await f.db
        .prepare(
          "SELECT * FROM form_answer_sets WHERE form_id='staff.loyalty-settings' ORDER BY id",
        )
        .all()
    ).results,
  });
  try {
    const draft = await r.saveLoyaltyDraft(f.db, ctx('race-draft-B'), {
      ...TERMS,
      pointsPerBlock: 10,
      creditPaisaPerBlock: 500,
    });
    let afterClaim: Awaited<ReturnType<typeof proof>> | undefined;
    const db = beforeBatch(f.db, async () => {
      await r.claimDailyPoints(f.db, claim('race-claim-A', draft.version));
      afterClaim = await proof();
    });
    await assert.rejects(
      r.publishLoyalty(db, ctx('race-publish-B', draft.version)),
      { code: 'stale' },
    );
    assert.ok(afterClaim);
    assert.deepEqual(await proof(), afterClaim);
  } finally {
    await f.dispose();
  }
});

void test('unrepresentable predating draft exposure stays readable and repairable without weakening issuance', async () => {
  const r = await repo(),
    f = await fixture(true, { pointsPerBlock: 5, creditPaisaPerBlock: 1000 });
  const A = { ...TERMS, pointsPerBlock: 5, creditPaisaPerBlock: 1000 };
  const B = {
    ...TERMS,
    pointsPerBlock: 1000000,
    creditPaisaPerBlock: 1,
    lifetimeBudgetPoints: 100000000000000,
  };
  const proof = async () => ({
    config: await f.db.prepare('SELECT * FROM loyalty_config').first(),
    revisions: (
      await f.db
        .prepare('SELECT * FROM loyalty_revisions ORDER BY revision')
        .all()
    ).results,
    claims: (
      await f.db.prepare('SELECT * FROM loyalty_daily_claims ORDER BY id').all()
    ).results,
    entries: (
      await f.db
        .prepare('SELECT * FROM loyalty_points_entries ORDER BY id')
        .all()
    ).results,
    audits: (
      await f.db
        .prepare(
          "SELECT * FROM audit_logs WHERE action LIKE 'loyalty.%' ORDER BY id",
        )
        .all()
    ).results,
    answers: (
      await f.db
        .prepare(
          "SELECT * FROM form_answer_sets WHERE form_id='staff.loyalty-settings' ORDER BY id",
        )
        .all()
    ).results,
  });
  try {
    const draftContext = ctx('overflow-draft-B');
    const draft = await r.saveLoyaltyDraft(f.db, draftContext, B);
    assert.deepEqual(draft.maximumLiability, {
      wholeBlocks: 100000000,
      creditPaisa: 100000000,
      remainingPoints: 0,
    });
    const input = claim('overflow-claim-A', draft.version);
    const receipt = await r.claimDailyPoints(f.db, input);
    const before = await proof();
    const state = await r.getLoyaltyState(f.db, 'super', NOW, 'super');
    assert.deepEqual(await proof(), before);
    assert.deepEqual(state.terms, B);
    assert.deepEqual(state.lockedDenomination, {
      pointsPerBlock: 5,
      creditPaisaPerBlock: 1000,
    });
    assert.deepEqual(state.liability, {
      wholeBlocks: 2,
      creditPaisa: 2000,
      remainingPoints: 0,
    });
    assert.equal(state.maximumLiability, null);
    assert.equal(state.terms.lifetimeBudgetPoints, 100000000000000);
    await assert.rejects(
      r.publishLoyalty(f.db, ctx('overflow-publish-B', state.version)),
      { code: 'invalid' },
    );
    await assert.rejects(
      r.saveLoyaltyDraft(f.db, ctx('overflow-draft-unsafe-A', state.version), {
        ...A,
        lifetimeBudgetPoints: B.lifetimeBudgetPoints,
      }),
      { code: 'invalid' },
    );
    assert.deepEqual(await proof(), before);
    assert.deepEqual(await r.saveLoyaltyDraft(f.db, draftContext, B), draft);
    const repaired = await r.saveLoyaltyDraft(
      f.db,
      ctx('overflow-repair-A', state.version),
      A,
    );
    assert.deepEqual(repaired.maximumLiability, {
      wholeBlocks: 2000,
      creditPaisa: 2000000,
      remainingPoints: 0,
    });
    const published = await r.publishLoyalty(
      f.db,
      ctx('overflow-repair-publish', repaired.version),
    );
    assert.equal(published.publishedRevision, repaired.revision);
    const after = await proof();
    assert.deepEqual(
      after.revisions.slice(0, before.revisions.length),
      before.revisions,
    );
    assert.deepEqual(after.claims, before.claims);
    assert.deepEqual(after.entries, before.entries);
    assert.deepEqual(await r.claimDailyPoints(f.db, input), receipt);
    const rewards = await r.getRewards(
      f.db,
      'customer',
      NOW,
      undefined,
      20,
      'customer',
    );
    assert.equal(rewards.state.pointsPerBlock, 5);
    assert.equal(rewards.state.creditPaisaPerBlock, 1000);
  } finally {
    await f.dispose();
  }
});
