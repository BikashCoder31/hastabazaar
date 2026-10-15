import assert from 'node:assert/strict';
import test from 'node:test';
import * as loyalty from '../lib/db/repositories/loyalty';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { seedIncentiveCustomer } from './helpers/incentive-db';
import { publishForm, TERMS, ctx, claim } from './helpers/loyalty-fixture';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const schedule = [5, 7, 9, 10, 11, 13, 15];

void test('public rewards terms expose published rules and locked conversion without leaking drafts or financial totals', async () => {
  const f = await incentiveReportDatabase();
  try {
    for (const user of ['customer', 'super']) await seedIncentiveCustomer(f.db, user);
    await f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)").run();
    for (const form of ['staff.loyalty-settings', 'account.daily-reward']) await publishForm(f.db, form);
    const draft = await loyalty.saveLoyaltyDraft(f.db, ctx('terms-draft'), {
      ...TERMS, dailyPoints: 5, weeklyPoints: schedule, graceEnabled: false,
    });
    const published = await loyalty.publishLoyalty(f.db, ctx('terms-publish', draft.version));
    await loyalty.claimDailyPoints(f.db, claim('terms-claim', published.version, 'customer', NOW));
    const api = loyalty as unknown as {getPublishedLoyaltyTerms?: (db: D1Database, now: number) => Promise<Record<string, unknown>>};
    assert.equal(typeof api.getPublishedLoyaltyTerms, 'function');
    const before = await api.getPublishedLoyaltyTerms!(f.db, NOW);
    assert.deepEqual(before.weeklyPoints, schedule);
    assert.equal(before.graceEnabled, false);
    assert.equal(before.pointsPerBlock, 100);
    assert.equal(before.creditPaisaPerBlock, 1000);
    assert.deepEqual(Object.keys(before).sort(), [
      'revision', 'enabled', 'paused', 'dailyPoints', 'weeklyPoints', 'graceEnabled',
      'pointsPerBlock', 'creditPaisaPerBlock', 'startsAt', 'endsAt', 'status',
    ].sort());
    const next = await loyalty.saveLoyaltyDraft(f.db, ctx('terms-edited-draft', published.version), {
      ...TERMS, dailyPoints: 6, weeklyPoints: [6, 8, 10, 12, 14, 16, 18], graceEnabled: true,
    });
    assert.deepEqual(await api.getPublishedLoyaltyTerms!(f.db, NOW), before);
    await loyalty.publishLoyalty(f.db, ctx('terms-edited-publish', next.version));
    const after = await api.getPublishedLoyaltyTerms!(f.db, NOW);
    assert.deepEqual(after.weeklyPoints, [6, 8, 10, 12, 14, 16, 18]);
    assert.equal(after.graceEnabled, true);
    assert.equal(after.pointsPerBlock, before.pointsPerBlock);
    assert.equal(after.creditPaisaPerBlock, before.creditPaisaPerBlock);
  } finally { f.dispose(); }
});
