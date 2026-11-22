import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectFeeWaiver,
  validateFeeWaiverTerms,
  type FeeWaiverCampaign,
} from '../lib/marketplace/fee-waivers';

const earlier: FeeWaiverCampaign = {
  id: 'a',
  revision: 1,
  state: 'published',
  name: 'Launch',
  description: '',
  startsAt: 10,
  endsAt: 20,
};
const later: FeeWaiverCampaign = {
  ...earlier,
  id: 'b',
  startsAt: 11,
  endsAt: 30,
};
void test('selection uses inclusive start, exclusive end and earliest start then immutable ID without mutating input', () => {
  const input = [later, earlier];
  assert.equal(selectFeeWaiver(input, 9), null);
  assert.equal(selectFeeWaiver(input, 10)?.id, 'a');
  assert.equal(selectFeeWaiver(input, 20)?.id, 'b');
  assert.equal(selectFeeWaiver(input, 30), null);
  assert.equal(
    selectFeeWaiver([{ ...earlier, id: 'z' }, earlier], 10)?.id,
    'a',
  );
  assert.deepEqual(input, [later, earlier]);
});
void test('draft, paused and ended campaigns never apply; pausing the selected overlap exposes the next campaign', () => {
  for (const state of ['draft', 'paused', 'ended'] as const) {
    assert.equal(selectFeeWaiver([{ ...earlier, state }], 11), null);
    assert.equal(selectFeeWaiver([{ ...earlier, state }, later], 11)?.id, 'b');
  }
});
void test('terms reject unsafe timestamps, reversed ranges, empty names and oversized text', () => {
  for (const startsAt of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => validateFeeWaiverTerms({ ...earlier, startsAt }));
  for (const endsAt of [
    -1,
    NaN,
    Infinity,
    1.5,
    10,
    9,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(() => validateFeeWaiverTerms({ ...earlier, endsAt }));
  for (const name of ['', '  ', 'a'.repeat(101)])
    assert.throws(() => validateFeeWaiverTerms({ ...earlier, name }));
  assert.throws(() =>
    validateFeeWaiverTerms({ ...earlier, description: 'a'.repeat(1001) }),
  );
  assert.doesNotThrow(() =>
    validateFeeWaiverTerms({
      name: 'a'.repeat(100),
      description: 'a'.repeat(1000),
      startsAt: 0,
      endsAt: Number.MAX_SAFE_INTEGER,
    }),
  );
  assert.throws(() => selectFeeWaiver([], NaN));
});
