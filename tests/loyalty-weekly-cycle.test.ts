import assert from 'node:assert/strict';
import test from 'node:test';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { seedIncentiveCustomer } from './helpers/incentive-db';
import { publishForm, TERMS, ctx, claim } from './helpers/loyalty-fixture';
import * as loyalty from '../lib/db/repositories/loyalty';
import { validateLoyaltyTerms } from '../lib/incentives/loyalty-policy';
import type { LoyaltyTerms } from '../lib/incentives/types';

const DAY = 86400000;
const NOW = Date.parse('2026-10-14T12:00:00Z');
const weekly = {
  ...TERMS,
  dailyPoints: 5,
  weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
  graceEnabled: false,
};
async function fixture(options: Partial<typeof weekly> = {}, fixed = false) {
  const f = await incentiveReportDatabase();
  for (const user of ['customer', 'other', 'super'])
    await seedIncentiveCustomer(f.db, user);
  await f.db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
    )
    .run();
  for (const form of [
    'staff.loyalty-settings',
    'account.daily-reward',
    'account.points-redemption',
  ])
    await publishForm(f.db, form);
  const terms = fixed ? TERMS : { ...weekly, ...options };
  const draft = await loyalty.saveLoyaltyDraft(
    f.db,
    ctx('setup-draft'),
    terms as LoyaltyTerms,
  );
  const state = await loyalty.publishLoyalty(
    f.db,
    ctx('setup-publish', draft.version),
  );
  return { ...f, version: state.version };
}

void test('weekly rules validate seven rising rewards and require budgets to cover the largest award', () => {
  assert.doesNotThrow(() => validateLoyaltyTerms(weekly));
  for (const points of [
    [5, 7],
    [5, 7, 9, 10, 11, 13, 13],
    [0, 7, 9, 10, 11, 13, 15],
    [5, 7, 9, 10, 11, 13, 15.5],
  ]) {
    assert.throws(() =>
      validateLoyaltyTerms({ ...weekly, weeklyPoints: points }),
    );
  }
  assert.throws(() =>
    validateLoyaltyTerms({
      ...weekly,
      graceEnabled: 'yes',
    } as unknown as LoyaltyTerms),
  );
  assert.throws(() => validateLoyaltyTerms({ ...weekly, dailyPoints: 10 }));
  assert.throws(() =>
    validateLoyaltyTerms({ ...weekly, dailyBudgetPoints: 14 }),
  );
});

void test('seven consecutive claims issue the exact 70-point cycle then restart at Day 1', async () => {
  const f = await fixture();
  try {
    const awards = [];
    for (let day = 0; day < 8; day++) {
      const result = await loyalty.claimDailyPoints(
        f.db,
        claim('weekly-' + day, f.version, 'customer', NOW + day * DAY),
      );
      awards.push(result.awardedPoints);
      assert.equal(result.cycle?.day, (day % 7) + 1);
      assert.equal(result.cycle?.number, day < 7 ? 1 : 2);
    }
    assert.deepEqual(awards, [5, 7, 9, 10, 11, 13, 15, 5]);
    assert.equal(
      (
        await loyalty.getRewards(
          f.db,
          'customer',
          NOW + 7 * DAY,
          undefined,
          20,
          'customer',
        )
      ).balancePoints,
      75,
    );
    const state = await loyalty.getLoyaltyState(f.db, 'super', NOW, 'super');
    assert.equal(state.issuedPoints, 75);
    assert.deepEqual(state.lockedDenomination, {
      pointsPerBlock: 100,
      creditPaisaPerBlock: 1000,
    });
  } finally {
    f.dispose();
  }
});

void test('a missed Nepal day restarts the next claim without changing earned points or wallet', async () => {
  const f = await fixture();
  try {
    await loyalty.claimDailyPoints(
      f.db,
      claim('one', f.version, 'customer', NOW),
    );
    await loyalty.claimDailyPoints(
      f.db,
      claim('two', f.version, 'customer', NOW + DAY),
    );
    const view = await loyalty.getRewards(
      f.db,
      'customer',
      NOW + 3 * DAY,
      undefined,
      20,
      'customer',
    );
    assert.equal(view.cycle?.day, 1);
    assert.equal(view.cycle?.resetReason, 'missed_day');
    assert.equal(view.balancePoints, 12);
    const result = await loyalty.claimDailyPoints(
      f.db,
      claim('restart', f.version, 'customer', NOW + 3 * DAY),
    );
    assert.equal(result.awardedPoints, 5);
    assert.equal(result.balancePoints, 17);
    assert.equal(result.cycle?.number, 2);
    assert.equal(
      (
        await loyalty.getRewards(
          f.db,
          'customer',
          NOW + 3 * DAY,
          undefined,
          20,
          'customer',
        )
      ).walletBalancePaisa,
      0,
    );
  } finally {
    f.dispose();
  }
});

void test('enabled grace covers only one missed day per cycle and never awards the missing day', async () => {
  const f = await fixture({ graceEnabled: true });
  try {
    await loyalty.claimDailyPoints(
      f.db,
      claim('one', f.version, 'customer', NOW),
    );
    const protectedClaim = await loyalty.claimDailyPoints(
      f.db,
      claim('grace', f.version, 'customer', NOW + 2 * DAY),
    );
    assert.equal(protectedClaim.awardedPoints, 7);
    assert.equal(protectedClaim.cycle?.day, 2);
    assert.equal(protectedClaim.cycle?.graceApplied, true);
    assert.equal(protectedClaim.cycle?.graceUsed, true);
    const restarted = await loyalty.claimDailyPoints(
      f.db,
      claim('second-miss', f.version, 'customer', NOW + 4 * DAY),
    );
    assert.equal(restarted.awardedPoints, 5);
    assert.equal(restarted.cycle?.resetReason, 'missed_day');
    assert.equal(restarted.cycle?.graceUsed, false);
    assert.equal(restarted.balancePoints, 17);
    const multiMiss = await loyalty.claimDailyPoints(
      f.db,
      claim('two-missed-days', f.version, 'customer', NOW + 7 * DAY),
    );
    assert.equal(multiMiss.awardedPoints, 5);
    assert.equal(multiMiss.cycle?.resetReason, 'missed_day');
  } finally {
    f.dispose();
  }
});

void test('Nepal midnight advances a cycle even when the claims are only one millisecond apart', async () => {
  const f = await fixture();
  try {
    const before = Date.parse('2026-10-14T18:14:59.999Z');
    const first = await loyalty.claimDailyPoints(
      f.db,
      claim('before', f.version, 'customer', before),
    );
    const next = await loyalty.claimDailyPoints(
      f.db,
      claim('after', f.version, 'customer', before + 1),
    );
    assert.equal(first.localDate, '2026-10-14');
    assert.equal(next.localDate, '2026-10-15');
    assert.equal(next.awardedPoints, 7);
    await assert.rejects(
      () =>
        loyalty.claimDailyPoints(
          f.db,
          claim('duplicate', f.version, 'customer', before + 2),
        ),
      /conflicts/,
    );
  } finally {
    f.dispose();
  }
});

void test('exact lost-response replay never advances the cycle or posts a second award', async () => {
  const f = await fixture();
  try {
    const original = await loyalty.claimDailyPoints(
      f.db,
      claim('replay', f.version, 'customer', NOW),
    );
    assert.deepEqual(
      await loyalty.claimDailyPoints(
        f.db,
        claim('replay', f.version, 'customer', NOW + DAY),
      ),
      original,
    );
    const next = await loyalty.claimDailyPoints(
      f.db,
      claim('next', f.version, 'customer', NOW + DAY),
    );
    assert.equal(next.awardedPoints, 7);
    assert.equal(next.balancePoints, 12);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM loyalty_daily_claims').get()?.n,
      2,
    );
  } finally {
    f.dispose();
  }
});

void test('weekly activation preserves old fixed awards and publishing edits affects only new claims', async () => {
  const f = await fixture({}, true);
  try {
    const legacy = await loyalty.claimDailyPoints(
      f.db,
      claim('legacy', f.version, 'customer', NOW),
    );
    assert.equal(legacy.awardedPoints, 10);
    const draft = await loyalty.saveLoyaltyDraft(
      f.db,
      ctx('weekly-draft', f.version),
      weekly,
    );
    assert.equal(
      (
        await loyalty.getRewards(
          f.db,
          'customer',
          NOW + DAY,
          undefined,
          20,
          'customer',
        )
      ).state.dailyPoints,
      10,
    );
    const live = await loyalty.publishLoyalty(
      f.db,
      ctx('weekly-live', draft.version),
    );
    const first = await loyalty.claimDailyPoints(
      f.db,
      claim('weekly-first', live.version, 'customer', NOW + DAY),
    );
    assert.equal(first.awardedPoints, 5);
    assert.equal(first.balancePoints, 15);
    assert.equal(first.cycle?.resetReason, 'first_claim');
    assert.deepEqual(
      await loyalty.claimDailyPoints(
        f.db,
        claim('legacy', f.version, 'customer', NOW + DAY),
      ),
      legacy,
    );
    const edited = {
      ...weekly,
      dailyPoints: 6,
      weeklyPoints: [6, 8, 10, 11, 12, 14, 16],
      graceEnabled: true,
    };
    const nextDraft = await loyalty.saveLoyaltyDraft(
      f.db,
      ctx('edit', live.version),
      edited,
    );
    const nextLive = await loyalty.publishLoyalty(
      f.db,
      ctx('publish-edit', nextDraft.version),
    );
    const next = await loyalty.claimDailyPoints(
      f.db,
      claim('edited-next', nextLive.version, 'customer', NOW + 2 * DAY),
    );
    assert.equal(next.awardedPoints, 8);
    assert.equal(next.cycle?.day, 2);
    assert.equal(first.awardedPoints, 5);
  } finally {
    f.dispose();
  }
});

void test('higher cycle awards respect remaining daily budget and truthful customer eligibility', async () => {
  const f = await fixture({ dailyBudgetPoints: 15 });
  try {
    for (let day = 0; day < 6; day++)
      await loyalty.claimDailyPoints(
        f.db,
        claim('day-' + day, f.version, 'customer', NOW + day * DAY),
      );
    await loyalty.claimDailyPoints(
      f.db,
      claim('other', f.version, 'other', NOW + 6 * DAY),
    );
    const view = await loyalty.getRewards(
      f.db,
      'customer',
      NOW + 6 * DAY,
      undefined,
      20,
      'customer',
    );
    assert.equal(view.state.dailyPoints, 15);
    assert.equal(view.state.status, 'exhausted');
    await assert.rejects(
      () =>
        loyalty.claimDailyPoints(
          f.db,
          claim('too-large', f.version, 'customer', NOW + 6 * DAY),
        ),
      /limit/,
    );
    assert.equal(view.balancePoints, 55);
  } finally {
    f.dispose();
  }
});

void test('native database guards reject forged cycle progress before any points are posted', async () => {
  const f = await fixture();
  try {
    const first = await loyalty.claimDailyPoints(
      f.db,
      claim('one', f.version, 'customer', NOW),
    );
    const forged = {
      claimId: 'forged',
      localDate: '2026-10-15',
      awardedPoints: 9,
      balancePoints: 14,
      cycle: {
        day: 3,
        number: 1,
        graceUsed: false,
        graceApplied: false,
        resetReason: null,
        lastClaimDate: first.localDate,
      },
    };
    assert.throws(() =>
      f.sqlite
        .prepare(
          `INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at,cycle_day,cycle_number,grace_used,grace_applied,cycle_reset_reason) VALUES ('forged','customer','customer','forged',?,1,'2026-10-15',9,?,'account.daily-reward-v1',?,3,1,0,0,NULL)`,
        )
        .run('a'.repeat(64), JSON.stringify(forged), NOW + DAY),
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT balance_points n FROM loyalty_accounts WHERE user_id='customer'",
        )
        .get()?.n,
      5,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM loyalty_daily_claims').get()?.n,
      1,
    );
  } finally {
    f.dispose();
  }
});
