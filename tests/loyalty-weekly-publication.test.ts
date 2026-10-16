import assert from 'node:assert/strict';
import test from 'node:test';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { seedIncentiveCustomer } from './helpers/incentive-db';
import { ctx, claim, publishForm, TERMS, NOW } from './helpers/loyalty-fixture';
import * as loyalty from '../lib/db/repositories/loyalty';

void test('a tomorrow claim committed during a midnight rewards read does not invalidate the captured day', async () => {
  const f = await fixture(true);
  const before = Date.parse('2026-10-14T18:14:59.999Z');
  try {
    await loyalty.claimDailyPoints(
      f.db,
      claim('midnight-before', f.live.version, 'customer', before),
    );
    const prepare = f.db.prepare.bind(f.db);
    let interleaved = false;
    const readingDb = {
      batch: f.db.batch.bind(f.db),
      prepare(sql: string) {
        const statement = prepare(sql);
        if (sql.includes('SELECT local_date,response_json')) {
          const first = statement.first.bind(statement) as (
            column?: string,
          ) => Promise<unknown>;
          statement.first = (async (column?: string) => {
            if (!interleaved) {
              interleaved = true;
              await loyalty.claimDailyPoints(
                f.db,
                claim('midnight-after', f.live.version, 'customer', before + 1),
              );
            }
            return first(column);
          }) as typeof statement.first;
        }
        return statement;
      },
    } as D1Database;
    await assert.doesNotReject(async () => {
      const view = await loyalty.getRewards(
        readingDb,
        'customer',
        before,
        undefined,
        20,
        'customer',
      );
      assert.equal(view.cycle?.day, 1);
      assert.equal(view.state.dailyPoints, 5);
      assert.equal(view.claimedToday, true);
    });
    const fresh = await loyalty.getRewards(
      f.db,
      'customer',
      before + 1,
      undefined,
      20,
      'customer',
    );
    assert.equal(fresh.cycle?.day, 2);
    assert.equal(fresh.state.dailyPoints, 7);
    assert.equal(fresh.balancePoints, 12);
  } finally {
    f.dispose();
  }
});

async function fixture(weekly: boolean) {
  const f = await incentiveReportDatabase();
  for (const id of ['super', 'customer']) await seedIncentiveCustomer(f.db, id);
  await f.db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
    )
    .run();
  for (const form of ['staff.loyalty-settings', 'account.daily-reward'])
    await publishForm(f.db, form);
  const terms = weekly
    ? {
        ...TERMS,
        dailyPoints: 5,
        weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
        graceEnabled: false,
      }
    : TERMS;
  const draft = await loyalty.saveLoyaltyDraft(f.db, ctx('draft'), terms);
  const live = await loyalty.publishLoyalty(
    f.db,
    ctx('publish', draft.version),
  );
  return { ...f, live };
}
void test('publishing another weekly schedule today preserves the recorded award and exact replay', async () => {
  const f = await fixture(true);
  try {
    const original = await loyalty.claimDailyPoints(
      f.db,
      claim('today', f.live.version),
    );
    const draft = await loyalty.saveLoyaltyDraft(
      f.db,
      ctx('edit', f.live.version),
      {
        ...f.live.terms,
        dailyPoints: 6,
        weeklyPoints: [6, 8, 10, 11, 12, 14, 16],
      },
    );
    await loyalty.publishLoyalty(f.db, ctx('publish-edit', draft.version));
    const view = await loyalty.getRewards(
      f.db,
      'customer',
      NOW,
      undefined,
      20,
      'customer',
    );
    assert.equal(view.claimedToday, true);
    assert.equal(view.state.dailyPoints, 5);
    assert.deepEqual(view.state.weeklyPoints, [6, 8, 10, 11, 12, 14, 16]);
    assert.deepEqual(view.cycle, original.cycle);
    assert.deepEqual(
      await loyalty.claimDailyPoints(f.db, claim('today', f.live.version)),
      original,
    );
    assert.equal(
      (
        await loyalty.getRewards(
          f.db,
          'customer',
          NOW + 86400000,
          undefined,
          20,
          'customer',
        )
      ).state.dailyPoints,
      8,
    );
  } finally {
    f.dispose();
  }
});
void test('weekly activation after a fixed claim today keeps the old award and starts the next claim at Day1', async () => {
  const f = await fixture(false);
  try {
    await loyalty.claimDailyPoints(f.db, claim('fixed-today', f.live.version));
    const draft = await loyalty.saveLoyaltyDraft(
      f.db,
      ctx('weekly', f.live.version),
      {
        ...f.live.terms,
        dailyPoints: 5,
        weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
        graceEnabled: false,
      },
    );
    await loyalty.publishLoyalty(f.db, ctx('activate', draft.version));
    const view = await loyalty.getRewards(
      f.db,
      'customer',
      NOW,
      undefined,
      20,
      'customer',
    );
    assert.equal(view.state.dailyPoints, 10);
    assert.equal(view.claimedToday, true);
    assert.equal(view.cycle?.day, 1);
    assert.equal(view.cycle?.resetReason, 'first_claim');
    assert.equal(
      view.cycle?.lastClaimDate,
      view.history[0].kind === 'daily_claim'
        ? view.history[0].result.localDate
        : null,
    );
    const tomorrow = await loyalty.getRewards(
      f.db,
      'customer',
      NOW + 86400000,
      undefined,
      20,
      'customer',
    );
    assert.equal(tomorrow.state.dailyPoints, 5);
    assert.equal(tomorrow.cycle?.day, 1);
  } finally {
    f.dispose();
  }
});
