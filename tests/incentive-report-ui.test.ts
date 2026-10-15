import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  reportWindow,
  type PromoAdminReport,
  type LoyaltyAdminReport,
} from '../lib/incentives/reporting';
const now = Date.parse('2026-10-14T04:15:00Z');
async function ui() {
  const loaded = await import('../components/admin/incentive-reports').catch(
    () => null,
  );
  assert.ok(loaded, 'Incentive report panels must exist');
  return loaded;
}
const promo: PromoAdminReport = {
  observedAt: now,
  totals: {
    campaigns: 1,
    active: 1,
    drafts: 1,
    usedCount: 2,
    spentPaisa: 2000,
    publishedBudgetPaisa: 100000,
    remainingBudgetPaisa: 98000,
  },
  activityCount: 1,
  filteredDiscountPaisa: 1000,
  window: reportWindow({ query: 'Asha', from: '2026-10-14', to: '2026-10-14' }),
  activity: [
    {
      id: 'redemption-1',
      code: 'WELCOME10',
      label: 'Welcome',
      customerName: 'Asha',
      customerEmail: 'asha@example.test',
      orderId: 'order-1',
      orderNumber: 'HB-0001',
      orderStatus: 'cancelled',
      paymentStatus: 'unpaid',
      subtotalPaisa: 10000,
      discountPaisa: 1000,
      commissionPaisa: 900,
      revision: 1,
      createdAt: now,
    },
  ],
  historyCount: 1,
  history: [
    {
      id: 'change-1',
      action: 'promo.publish',
      actorName: 'Nisha',
      reason: 'Approved preview campaign',
      createdAt: now,
      subjectLabel: 'WELCOME10',
      changes: [{ label: 'Discount', before: 'NPR 5.00', after: 'NPR 10.00' }],
    },
  ],
};
void test('Promo activity displays human order/customer, original consumed discount and snapshot commission with filtered export', async () => {
  const h = await ui();
  const html = renderToStaticMarkup(
    createElement(h.PromoActivityReport, { report: promo }),
  );
  for (const text of [
    'HB-0001',
    'Asha',
    'WELCOME10',
    'cancelled',
    '10.00',
    '9.00',
    'Snapshot commission',
  ])
    assert.ok(html.includes(text), text);
  assert.ok(html.includes('/admin/orders/order-1'));
  assert.ok(html.includes('query=Asha'));
  assert.ok(html.includes('Export this page'));
});
void test('Campaign overview uses global published budgets rather than filtered or draft terms', async () => {
  const h = await ui();
  const html = renderToStaticMarkup(
    createElement(h.PromoReportOverview, { report: promo }),
  );
  assert.ok(html.includes('980.00'));
  assert.ok(html.includes('Published budget'));
  assert.ok(html.includes('All campaigns'));
});
void test('Change history retains operator, reason and before/after values', async () => {
  const h = await ui();
  const html = renderToStaticMarkup(
    createElement(h.IncentiveHistoryReport, {
      report: promo,
      path: '/admin/promo-codes',
    }),
  );
  for (const text of [
    'Nisha',
    'Approved preview campaign',
    'NPR 5.00',
    'NPR 10.00',
    'Before',
    'After',
  ])
    assert.ok(html.includes(text), text);
});
void test('Loyalty customer balances distinguish total wallet credit from points activity', async () => {
  const h = await ui();
  const report: LoyaltyAdminReport = {
    observedAt: now,
    window: reportWindow(),
    totals: {
      customers: 1,
      claimedToday: 1,
      claims: 10,
      redemptions: 1,
      issuedPoints: 100,
      redeemedPoints: 100,
      creditedPaisa: 1000,
      outstandingPoints: 0,
    },
    liveTerms: {
      dailyPoints: 10,
      pointsPerBlock: 100,
      creditPaisaPerBlock: 1000,
      dailyBudgetPoints: 1000,
      lifetimeBudgetPoints: 10000,
      startsAt: now - 1,
      endsAt: now + 86400000,
      paused: false,
      enabled: true,
      revision: 1,
    },
    activity: [],
    activityCount: 0,
    customers: [
      {
        id: 'customer',
        name: 'Asha',
        email: 'asha@example.test',
        balancePoints: 0,
        walletBalancePaisa: 2000,
        claims: 10,
        redeemedPoints: 100,
        lastActivityAt: now,
      },
    ],
    customerCount: 1,
    history: [],
    historyCount: 0,
  };
  const html = renderToStaticMarkup(
    createElement(h.LoyaltyActivityReport, { report }),
  );
  assert.ok(html.includes('Wallet balance (all sources)'));
  assert.ok(html.includes('20.00'));
  assert.ok(html.includes('Asha'));
  assert.ok(html.includes('No reward transactions'));
});

void test('Unpublished loyalty defaults are described as paused saved settings, with a separate publication step', async () => {
  const h = await ui();
  const report: LoyaltyAdminReport = {
    observedAt: now,
    window: reportWindow(),
    totals: {
      customers: 0,
      claimedToday: 0,
      claims: 0,
      redemptions: 0,
      issuedPoints: 0,
      redeemedPoints: 0,
      creditedPaisa: 0,
      outstandingPoints: 0,
    },
    liveTerms: {
      dailyPoints: 10,
      pointsPerBlock: 100,
      creditPaisaPerBlock: 1000,
      dailyBudgetPoints: null,
      lifetimeBudgetPoints: null,
      startsAt: null,
      endsAt: null,
      paused: true,
      enabled: false,
      revision: 0,
    },
    activity: [],
    activityCount: 0,
    customers: [],
    customerCount: 0,
    history: [],
    historyCount: 0,
  };
  const html = renderToStaticMarkup(
    createElement(h.LoyaltyReportOverview, { report }),
  );
  assert.match(html, /Earning is paused/);
  assert.match(html, /Saved schedule: fixed daily rewards/);
  assert.match(html, /No reward rules have been published yet/);
  assert.match(html, /save a draft and publish it/);
  assert.doesNotMatch(
    html,
    /Live earning rules|These are published earning rules/,
  );
});
