import assert from 'node:assert/strict';
import test from 'node:test';
import { auditFilters } from '../lib/db/repositories/business-activity';
const calendar = import('../lib/dates/nepal-calendar').catch(() => null);

// Hand-checked against the Embassy of Nepal's 2083 holiday table and KMC calendar.
const anchors = [
  ['2026-04-14', '2083-01-01'],
  ['2026-05-26', '2083-02-12'],
  ['2026-06-17', '2083-03-03'],
  ['2026-08-26', '2083-05-10'],
  ['2026-09-15', '2083-05-30'],
  ['2026-10-06', '2083-06-20'],
  ['2026-10-14', '2083-06-28'],
  ['2026-10-20', '2083-07-03'],
  ['2026-11-08', '2083-07-22'],
  ['2027-01-15', '2083-10-01'],
] as const;

void test('reporting calendar conversions match independently verified AD and BS dates', async () => {
  const m = await calendar;
  assert.ok(m, 'Dual-calendar support is not implemented');
  for (const [ad, bs] of anchors) {
    assert.equal(m.adToBs(ad), bs, ad);
    assert.equal(m.bsToAd(bs), ad, bs);
  }
  assert.equal(m.bsToAd('२०८३-०६-२८'), '2026-10-14');
  assert.equal(m.formatBsDate('2026-10-14'), '28 Ashoj 2083 BS');
});

void test('calendar validation rejects non-existent dates without rolling them into another month', async () => {
  const m = await calendar;
  assert.ok(m, 'Dual-calendar support is not implemented');
  for (const value of ['2026-02-30', '2025-02-29', '2026-13-01', 'not-a-date'])
    assert.equal(m.adToBs(value), null, value);
  for (const value of ['2083-06-32', '2083-00-01', '2100-01-01', 'invalid'])
    assert.equal(m.bsToAd(value), null, value);
  assert.equal(m.bsDaysInMonth(2083, 5), 31);
  assert.equal(m.bsDaysInMonth(2083, 6), 31);
  assert.equal(m.adToBs('1900-01-01'), null);
  assert.equal(
    m.isGregorianDate('1900-01-01'),
    true,
    'Unsupported BS conversion must not block AD filtering',
  );
});

void test('a Nepal reporting day changes at local midnight rather than the host timezone', async () => {
  const m = await calendar;
  assert.ok(m, 'Dual-calendar support is not implemented');
  assert.equal(
    m.nepalDayIso(Date.parse('2026-10-13T18:14:59.999Z')),
    '2026-10-13',
  );
  assert.equal(
    m.nepalDayIso(Date.parse('2026-10-13T18:15:00.000Z')),
    '2026-10-14',
  );
});

void test('BS filter entry resolves to the identical inclusive Nepal reporting period', async () => {
  const m = await calendar;
  assert.ok(m, 'Dual-calendar support is not implemented');
  const from = m.bsToAd('2083-05-30'),
    to = m.bsToAd('2083-06-28');
  assert.ok(from && to);
  const bs = auditFilters({ from, to }),
    ad = auditFilters({ from: '2026-09-15', to: '2026-10-14' });
  assert.deepEqual(bs, ad);
  assert.equal(bs.from, Date.parse('2026-09-15T00:00:00+05:45'));
  assert.equal(bs.to, Date.parse('2026-10-15T00:00:00+05:45'));
});

void test('reporting boundary dates preserve canonical AD filters across historical timezone changes', async () => {
  const m=await calendar;
  assert.ok(m);
  assert.equal(typeof m.reportingDayIso,'function');
  for(const day of ['1918-04-13','1985-01-01','2026-10-14']) {
    const range=auditFilters({from:day,to:day});
    assert.equal(m.reportingDayIso(range.from!),day);
    assert.equal(m.reportingDayIso(range.to!-1),day);
  }
});
