import assert from 'node:assert/strict';
import test from 'node:test';
import {
  marketplaceSummaryRange,
  parseMarketplaceSummaryPeriod,
} from '../lib/admin/marketplace-period';

void test('only the four scalar URL periods are accepted', () => {
  for (const period of ['today', '7d', '30d', 'all'] as const)
    assert.equal(parseMarketplaceSummaryPeriod(period), period);
  for (const value of [
    undefined,
    '',
    'week',
    'TODAY',
    ['today'],
    ['today', 'all'],
    7,
    null,
    {},
  ])
    assert.equal(parseMarketplaceSummaryPeriod(value), 'all');
});

void test('Nepal reporting periods start at local midnight and include today', () => {
  const now = Date.parse('2026-10-15T06:00:00Z');
  for (const [period, start, label] of [
    ['today', '2026-10-14T18:15:00Z', 'Today'],
    ['7d', '2026-10-08T18:15:00Z', 'Last 7 days'],
    ['30d', '2026-09-15T18:15:00Z', 'Last 30 days'],
  ] as const) {
    const range = marketplaceSummaryRange(period, now);
    assert.equal(range.start, Date.parse(start));
    assert.equal(range.end, now);
    assert.equal(range.label, label);
    assert.match(range.description, /Nepal time/);
  }
  const all = marketplaceSummaryRange('all', now);
  assert.equal(all.start, null);
  assert.equal(all.label, 'All time');
});

void test('Today changes at Nepal midnight rather than UTC midnight', () => {
  assert.equal(
    marketplaceSummaryRange('today', Date.parse('2026-10-14T18:14:59.999Z'))
      .start,
    Date.parse('2026-10-13T18:15:00Z'),
  );
  assert.equal(
    marketplaceSummaryRange('today', Date.parse('2026-10-14T18:15:00Z')).start,
    Date.parse('2026-10-14T18:15:00Z'),
  );
});

void test('invalid observation timestamps cannot form a reporting period', () => {
  for (const now of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    assert.throws(() => marketplaceSummaryRange('today', now), /timestamp/i);
});
