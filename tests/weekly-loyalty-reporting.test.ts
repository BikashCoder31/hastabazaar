import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { seedIncentiveCustomer } from './helpers/incentive-db';
import { publishForm } from './helpers/loyalty-fixture';
import {
  claimDailyPoints,
  publishLoyalty,
  redeemPoints,
  saveLoyaltyDraft,
} from '../lib/db/repositories/loyalty';
import type {
  LoyaltyMutationContext,
  LoyaltyTerms,
} from '../lib/incentives/types';
import { getLoyaltyAdminReport } from '../lib/db/repositories/incentive-reporting';
import {
  LoyaltyActivityReport,
  LoyaltyReportOverview,
} from '../components/admin/incentive-reports';

const NOW = Date.parse('2026-10-14T04:15:00Z');
const actor = { id: 'super', authSubject: 'super' };
declare global {
  var weeklyReportDb: D1Database;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env={get DB(){return globalThis.weeklyReportDb}}',
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/staff')
      return {
        url: "data:text/javascript,export class StaffAuthorizationError extends Error{};export async function requireStaffApi(permission){if(permission!=='admin.invite')throw new Error('Wrong staff permission');return {id:'super',authSubject:'super',role:'super_admin'}}",
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
async function fixture() {
  const f = await incentiveReportDatabase();
  await seedIncentiveCustomer(f.db, 'super');
  await f.db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
    )
    .run();
  return f;
}
async function audit(
  db: D1Database,
  id: string,
  before: unknown,
  after: unknown,
  at: number,
) {
  await db
    .prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,created_at)
    VALUES (?,'super','loyalty.draft','loyalty_config','default','Weekly terms review',?,?,?)`)
    .bind(
      id,
      JSON.stringify({ terms: before }),
      JSON.stringify({ terms: after }),
      at,
    )
    .run();
}
const weeklyTerms: LoyaltyTerms = {
  enabled: true,
  dailyPoints: 5,
  weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
  graceEnabled: true,
  pointsPerBlock: 10,
  creditPaisaPerBlock: 1000,
  startsAt: 0,
  endsAt: 253402300799999,
  dailyBudgetPoints: 1000,
  lifetimeBudgetPoints: 100000,
};
function context(
  requestId: string,
  expectedVersion: number,
): LoyaltyMutationContext {
  return {
    actorId: 'super',
    authSubject: 'super',
    requestId,
    expectedVersion,
    now: NOW,
    reason: 'Published weekly report fixture',
    form: {
      formId: 'staff.loyalty-settings',
      versionId: 'staff.loyalty-settings-v1',
      answers: { formId: 'staff.loyalty-settings', version: 1, answers: [] },
    },
  };
}
async function weeklyFixture() {
  const f = await fixture();
  try {
    await seedIncentiveCustomer(f.db, 'weekly');
    await seedIncentiveCustomer(f.db, 'legacy');
    await f.db
      .prepare(
        "UPDATE users SET display_name='=Asha %_',email='weekly@example.test' WHERE id='weekly'",
      )
      .run();
    for (const form of [
      'staff.loyalty-settings',
      'account.daily-reward',
      'account.points-redemption',
    ])
      await publishForm(f.db, form);
    const {
      weeklyPoints: _schedule,
      graceEnabled: _grace,
      ...legacyTerms
    } = weeklyTerms;
    let draft = await saveLoyaltyDraft(f.db, context('legacy-draft', 1), {
      ...legacyTerms,
      dailyPoints: 10,
    });
    let live = await publishLoyalty(
      f.db,
      context('legacy-publish', draft.version),
    );
    await claimDailyPoints(f.db, {
      userId: 'legacy',
      authSubject: 'legacy',
      requestId: 'legacy-claim',
      expectedVersion: live.version,
      formVersionId: 'account.daily-reward-v1',
      now: NOW - 11 * 86400000,
    });
    draft = await saveLoyaltyDraft(
      f.db,
      context('weekly-draft', live.version),
      weeklyTerms,
    );
    live = await publishLoyalty(f.db, context('weekly-publish', draft.version));
    for (const dayOffset of [-10, -8, -5, -4, -3, -2, -1, 0, 1, 2])
      await claimDailyPoints(f.db, {
        userId: 'weekly',
        authSubject: 'weekly',
        requestId: `weekly-claim-${dayOffset}`,
        expectedVersion: live.version,
        formVersionId: 'account.daily-reward-v1',
        now: NOW + dayOffset * 86400000,
      });
    await redeemPoints(f.db, {
      userId: 'weekly',
      authSubject: 'weekly',
      requestId: 'weekly-redemption',
      expectedVersion: live.version,
      points: 10,
      formVersionId: 'account.points-redemption-v1',
      now: NOW + 3 * 86400000,
    });
    await saveLoyaltyDraft(f.db, context('future-unpublished', live.version), {
      ...weeklyTerms,
      dailyPoints: 6,
      weeklyPoints: [6, 8, 10, 11, 12, 14, 16],
      graceEnabled: false,
    });
    return f;
  } catch (error) {
    f.dispose();
    throw error;
  }
}

void test('SQLite reports use published weekly terms and recorded claim metadata despite later dates or drafts', async () => {
  const f = await weeklyFixture();
  try {
    const report = await getLoyaltyAdminReport(
      f.db,
      actor,
      { query: '%_', from: '2026-10-06', to: '2026-10-06' },
      NOW + 20 * 86400000,
    );
    assert.deepEqual(report.liveTerms.weeklyPoints, [5, 7, 9, 10, 11, 13, 15]);
    assert.equal(report.liveTerms.graceEnabled, true);
    assert.equal(report.activityCount, 1);
    assert.deepEqual(report.activity[0].cycle, {
      day: 2,
      number: 1,
      graceUsed: true,
      graceApplied: true,
      resetReason: null,
      claimDate: '2026-10-06',
    });
    assert.deepEqual(report.customers[0].recordedCycle, {
      day: 1,
      number: 3,
      graceUsed: false,
      graceApplied: false,
      resetReason: 'cycle_complete',
      claimDate: '2026-10-16',
    });
    assert.equal(report.customers[0].balancePoints, 77);
    assert.equal(report.customers[0].walletBalancePaisa, 1000);
    const all = await getLoyaltyAdminReport(
      f.db,
      actor,
      {},
      NOW + 20 * 86400000,
    );
    assert.deepEqual(all.totals, {
      customers: 2,
      claimedToday: 0,
      claims: 11,
      redemptions: 1,
      issuedPoints: 97,
      redeemedPoints: 10,
      creditedPaisa: 1000,
      outstandingPoints: 87,
    });
    assert.equal(
      all.activity.find((row) => row.customerId === 'legacy')?.cycle,
      undefined,
    );
    assert.equal(
      all.activity.find((row) => row.kind === 'redemption')?.cycle,
      undefined,
    );
    assert.equal(
      all.customers.find((row) => row.id === 'legacy')?.recordedCycle,
      undefined,
    );
    assert.equal(
      all.activity.find((row) => row.cycle?.claimDate === '2026-10-09')?.cycle
        ?.resetReason,
      'missed_day',
    );
    assert.equal(
      (await getLoyaltyAdminReport(f.db, actor, { query: "' OR 1=1 --" }, NOW))
        .activityCount,
      0,
    );
  } finally {
    f.dispose();
  }
});

void test('weekly CSV exports recorded cycle and grace details while legacy and redemption cycle cells stay empty', async () => {
  const f = await weeklyFixture();
  try {
    globalThis.weeklyReportDb = f.db;
    const route = await import('../app/api/admin/loyalty/report/route');
    const response = await route.GET(
      new Request(
        'http://localhost/api/admin/loyalty/report?format=csv&query=%25_&from=2026-10-06&to=2026-10-06',
      ),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const csv = await response.text();
    assert.match(
      csv,
      /"Recorded cycle day","Recorded cycle number","Grace used","Grace applied","Cycle reset reason","Claim date \(Nepal\)"/,
    );
    assert.equal(csv.trimEnd().split('\r\n').length, 2);
    assert.match(csv, /"'=Asha %_"/);
    assert.match(csv, /"2","1","Yes","Yes","","2026-10-06"/);
    const allResponse = await route.GET(
      new Request('http://localhost/api/admin/loyalty/report?format=csv'),
    );
    const all = (await allResponse.text()).trimEnd().split('\r\n');
    assert.ok(
      all
        .find((row) => row.includes('"legacy"'))
        ?.endsWith(',"","","","","",""'),
    );
    assert.ok(
      all
        .find((row) => row.includes('"Redemption"'))
        ?.endsWith(',"","","","","",""'),
    );
    assert.ok(
      all.some((row) =>
        row.endsWith(',"1","2","No","No","Missed Nepal day","2026-10-09"'),
      ),
    );
    assert.ok(
      all.some((row) =>
        row.endsWith(
          ',"1","3","No","No","Previous cycle complete","2026-10-16"',
        ),
      ),
    );
  } finally {
    f.dispose();
  }
});

void test('weekly history reports only the changed reward day and readable grace setting', async () => {
  const f = await fixture();
  try {
    await audit(
      f.db,
      'weekly-change',
      { weeklyPoints: [5, 7, 9, 10, 11, 13, 15], graceEnabled: false },
      { weeklyPoints: [5, 7, 9, 10, 12, 13, 15], graceEnabled: true },
      NOW,
    );
    await audit(
      f.db,
      'identical-terms',
      { weeklyPoints: [5, 7, 9, 10, 12, 13, 15], graceEnabled: true },
      { weeklyPoints: [5, 7, 9, 10, 12, 13, 15], graceEnabled: true },
      NOW + 1,
    );
    const report = await getLoyaltyAdminReport(f.db, actor, {}, NOW);
    assert.deepEqual(
      report.history.find((row) => row.id === 'weekly-change')?.changes,
      [
        { label: 'Day 5 reward', before: '11 points', after: '12 points' },
        { label: 'Grace enabled', before: 'No', after: 'Yes' },
      ],
    );
    assert.deepEqual(
      report.history.find((row) => row.id === 'identical-terms')?.changes,
      [],
    );
  } finally {
    f.dispose();
  }
});

void test('weekly overview shows all published rewards and the one-miss grace policy', async () => {
  const f = await fixture();
  try {
    const report = await getLoyaltyAdminReport(f.db, actor, {}, NOW);
    const html = renderToStaticMarkup(
      createElement(LoyaltyReportOverview, {
        report: {
          ...report,
          liveTerms: {
            ...report.liveTerms,
            weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
            graceEnabled: true,
          },
        },
      }),
    );
    assert.match(html, /Published seven-day rewards/);
    for (const [day, points] of [
      [1, 5],
      [2, 7],
      [3, 9],
      [4, 10],
      [5, 11],
      [6, 13],
      [7, 15],
    ])
      assert.match(html, new RegExp(`Day ${day}: ${points} points`));
    assert.match(html, /Grace enabled: one missed Nepal day per cycle/);
    assert.match(html, /Missed days earn no points/);
    assert.match(html, /Day 7 completes the cycle/);
    assert.doesNotMatch(html, /10 points per daily claim/);
  } finally {
    f.dispose();
  }
});

void test('activity and balances label stored cycle progress as recorded and preserve legacy claims', async () => {
  const f = await fixture();
  try {
    const report = await getLoyaltyAdminReport(f.db, actor, {}, NOW);
    const cycle = {
      day: 2,
      number: 3,
      graceUsed: true,
      graceApplied: true,
      resetReason: null,
      claimDate: '2026-10-12',
    } as const;
    const html = renderToStaticMarkup(
      createElement(LoyaltyActivityReport, {
        report: {
          ...report,
          activity: [
            {
              id: 'claim',
              kind: 'daily_claim',
              customerId: 'customer',
              customerName: 'Asha',
              customerEmail: 'asha@example.test',
              points: 7,
              creditPaisa: 0,
              revision: 1,
              createdAt: NOW,
              cycle,
            },
            {
              id: 'legacy',
              kind: 'daily_claim',
              customerId: 'legacy',
              customerName: 'Legacy',
              customerEmail: 'legacy@example.test',
              points: 10,
              creditPaisa: 0,
              revision: 0,
              createdAt: NOW - 1,
            },
          ],
          customers: [
            {
              id: 'customer',
              name: 'Asha',
              email: 'asha@example.test',
              balancePoints: 7,
              walletBalancePaisa: 0,
              claims: 1,
              redeemedPoints: 0,
              lastActivityAt: NOW,
              recordedCycle: cycle,
            },
          ],
        },
      }),
    );
    assert.match(html, /Recorded cycle/);
    assert.match(html, /Day 2 of 7 · cycle 3/);
    assert.match(html, /Grace applied/);
    assert.match(html, /Grace used in this cycle/);
    assert.match(html, /Latest recorded cycle/);
    assert.match(html, /2026-10-12/);
    assert.match(html, /Fixed daily reward/);
    assert.match(html, /recorded claim, not today/);
  } finally {
    f.dispose();
  }
});
