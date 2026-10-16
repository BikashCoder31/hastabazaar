import assert from 'node:assert/strict';
import test from 'node:test';

async function helpers() {
  const loaded = await import('../lib/incentives/presentation').catch(
    () => null,
  );
  assert.ok(loaded, 'Readable incentive amounts and cost previews must exist');
  return loaded;
}
void test('Currency display preserves the last paisa of large valid amounts and negative sub-rupee contribution', async () => {
  const h = await helpers();
  assert.match(h.incentiveMoney(Number.MAX_SAFE_INTEGER), /409\.91$/);
  assert.match(h.incentiveMoney('27021597764222973'), /229\.73$/);
  assert.equal(h.incentiveMoney(-1), '-NPR\u00a00.01');
});

void test('NPR inputs preserve paisa exactly and reject excess precision and unsafe amounts', async () => {
  const h = await helpers();
  assert.equal(h.nprToPaisa('125.50'), 12550);
  assert.equal(h.nprToPaisa('0.29'), 29);
  assert.equal(h.nprToPaisa('90071992547409.91'), Number.MAX_SAFE_INTEGER);
  for (const value of ['1.001', '-1', '1e3', '', 'NaN', '90071992547409.92'])
    assert.throws(() => h.nprToPaisa(value));
  assert.equal(h.moneyInput(12550), '125.50');
});
void test('Readable percentages convert exactly to basis points and enforce bounds', async () => {
  const h = await helpers();
  assert.equal(h.percentageToBps('12.35'), 1235);
  assert.equal(h.percentageToBps('0.01'), 1);
  assert.equal(h.percentageToBps('100'), 10000);
  for (const value of ['100.01', '1.001', '-1', '1e1'])
    assert.throws(() => h.percentageToBps(value));
});
void test('Nepal inputs round trip without depending on the machine timezone', async () => {
  const h = await helpers();
  const instant = Date.parse('2026-10-14T04:15:00Z');
  assert.equal(h.nepalDateTimeInput(instant), '2026-10-14T10:00');
  assert.equal(h.parseNepalDateTime('2026-10-14T10:00'), instant);
  assert.throws(() => h.parseNepalDateTime('2026-02-30T10:00'));
});
void test('Promo cost preview respects minimum, discount caps, commission base and negative contribution', async () => {
  const h = await helpers();
  const terms = {
    code: 'DEMO10',
    label: 'Demo',
    kind: 'percentage' as const,
    percentBps: 1000,
    maxDiscountPaisa: 20000,
    minimumSubtotalPaisa: 100000,
    startsAt: 0,
    endsAt: 9999999999999,
    totalUseLimit: 100,
    perCustomerUseLimit: 1,
    budgetPaisa: 1000000,
  };
  assert.deepEqual(h.promoCostPreview(terms, 100000, 900), {
    eligible: true,
    discountPaisa: 10000,
    commissionPaisa: 9000,
    contributionPaisa: -1000,
    customerSubtotalPaisa: 90000,
  });
  assert.equal(h.promoCostPreview(terms, 300000, 900).discountPaisa, 20000);
  assert.equal(h.promoCostPreview(terms, 99999, 900).discountPaisa, 0);
  assert.equal(h.promoCostPreview(terms, 99999, 900).eligible, false);
});
void test('Nepal display supports the largest valid legacy timestamp without an invalid expanded ISO year', async () => {
  const h = await helpers();
  assert.equal(h.nepalDateTimeInput(253402300799999), '10000-01-01T05:44');
  assert.equal(h.parseNepalDateTime('10000-01-01T05:44'), 253402300740000);
});

void test('promo cost preview uses the same half-up commission rounding as checkout', async () => {
  const h = await helpers();
  const result = h.promoCostPreview({code:'TEST',label:'Test',kind:'fixed',fixedPaisa:100,
    minimumSubtotalPaisa:0,startsAt:0,endsAt:9999999999999,totalUseLimit:100,
    perCustomerUseLimit:1,budgetPaisa:100000},10050,900);
  assert.equal(result.commissionPaisa,905);
  assert.equal(result.contributionPaisa,805);
});
void test('Loyalty forecast derives cost and redemption days without issuing points', async () => {
  const h = await helpers();
  assert.deepEqual(
    h.loyaltyCostPreview(
      { dailyPoints: 10, pointsPerBlock: 100, creditPaisaPerBlock: 1000 },
      100,
      30,
    ),
    {
      projectedPoints: 30000,
      estimatedValuePaisa: 300000,
      daysToRedemption: 10,
    },
  );
  assert.throws(() =>
    h.loyaltyCostPreview(
      {
        dailyPoints: Number.MAX_SAFE_INTEGER,
        pointsPerBlock: 100,
        creditPaisaPerBlock: 1000,
      },
      2,
      30,
    ),
  );
});
void test('weekly loyalty forecast repeats the schedule and accumulates whole-block redemption from Day 1', async () => {
  const h = await helpers();
  const weekly = {
    dailyPoints: 5,
    weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
    graceEnabled: false,
    pointsPerBlock: 100,
    creditPaisaPerBlock: 1000,
  };
  for (const [days, projectedPoints, estimatedValuePaisa] of [
    [1, 500, 5000],
    [7, 7000, 70000],
    [8, 7500, 75000],
    [14, 14000, 140000],
    [30, 29200, 292000],
  ]) {
    assert.deepEqual(h.loyaltyCostPreview(weekly, 100, days), {
      projectedPoints,
      estimatedValuePaisa,
      daysToRedemption: 11,
    });
  }
  assert.equal(
    h.loyaltyCostPreview({ ...weekly, pointsPerBlock: 70 }, 1, 7)
      .daysToRedemption,
    7,
  );
  assert.deepEqual(
    h.loyaltyCostPreview({ ...weekly, graceEnabled: true }, 100, 30),
    {
      projectedPoints: 29200,
      estimatedValuePaisa: 292000,
      daysToRedemption: 11,
    },
    'Grace does not add points to an estimate that assumes all daily claims',
  );
});

void test('weekly forecasts reject malformed schedules instead of falling back to daily points', async () => {
  const h = await helpers();
  const base = {
    dailyPoints: 5,
    pointsPerBlock: 100,
    creditPaisaPerBlock: 1000,
  };
  for (const weeklyPoints of [
    null,
    [],
    [5, 7, 9, 10, 11, 13],
    [5, 7, 9, 10, 11, 13, 13],
    [5, 7, 9, 10, 11, 13, 0],
    [5, 7, 9, 10, 11, 13, '15'],
    [5, 7, 9, 10, 11, 13, 15.5],
    [6, 7, 9, 10, 11, 13, 15],
    [5, 7, 9, 10, 11, 13, Number.MAX_SAFE_INTEGER],
  ]) {
    assert.throws(() =>
      h.loyaltyCostPreview({ ...base, weeklyPoints } as never, 1, 7),
    );
  }
  assert.throws(() =>
    h.loyaltyCostPreview(
      { ...base, weeklyPoints: [5, 7, 9, 10, 11, 13, 15] },
      Number.MAX_SAFE_INTEGER,
      7,
    ),
  );
});
void test('CSV quotes cells and neutralizes spreadsheet formulas including leading whitespace', async () => {
  const loaded = await import('../lib/incentives/reporting').catch(() => null);
  assert.ok(loaded, 'Safe report export must exist');
  const csv = loaded.reportCsv(
    ['Name', 'Value'],
    [
      [' =HYPERLINK("x")', 29],
      ['A,B', 0],
    ],
  );
  assert.ok(csv.includes("' =HYPERLINK"));
  assert.ok(csv.includes('"A,B"'));
  assert.ok(csv.endsWith('\r\n'));
});
