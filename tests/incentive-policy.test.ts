import assert from 'node:assert/strict';
import test from 'node:test';
import { allocatePromoDiscount, calculatePromoDiscount, normalizePromoCode } from '../lib/incentives/promo-policy';
import { INCENTIVE_FORM_CONTRACTS } from '../lib/incentives/forms';
import { IncentiveError, type PromoTerms } from '../lib/incentives/types';
import { validateAnswersForDefinition, validateFormDraftForDefinition } from '../lib/forms/validation';

const terms: PromoTerms = {
  code: 'SAVE_10', label: 'Save on merchandise', kind: 'percentage', percentBps: 1250,
  maxDiscountPaisa: 20000, minimumSubtotalPaisa: 0, startsAt: 1, endsAt: 1000,
  totalUseLimit: 100, perCustomerUseLimit: 2, budgetPaisa: 100000,
};

void test('promo normalization accepts the ASCII format after trim and uppercase', () => {
  assert.equal(normalizePromoCode(' save_10 '), 'SAVE_10');
  assert.equal(normalizePromoCode('a-b'), 'A-B');
  assert.equal(normalizePromoCode('a'.repeat(32)), 'A'.repeat(32));
});

void test('promo normalization rejects Unicode lookalikes and invalid lengths or syntax', () => {
  for (const code of ['ＳAVE', 'SАVE', 'ſave', 'ßave', 'a'.repeat(33), 'ab', '_SAVE', 'SAVE 10', 'SAVE!', '']) {
    assert.throws(() => normalizePromoCode(code), (error) => error instanceof IncentiveError && error.code === 'invalid', code);
  }
});

void test('percentage discounts floor paisa and cap at the percentage maximum or subtotal', () => {
  assert.equal(calculatePromoDiscount(terms, 10001), 1250);
  assert.equal(calculatePromoDiscount({ ...terms, maxDiscountPaisa: 500 }, 10001), 500);
  assert.equal(calculatePromoDiscount({ ...terms, percentBps: 10000 }, 10001), 10001);
  assert.equal(calculatePromoDiscount(terms, 0), 0);
  assert.equal(calculatePromoDiscount({ ...terms, startsAt: 0, endsAt: 253402300799 }, 10001), 1250);
});

void test('fixed discounts cap at merchandise subtotal without shrinking to campaign budget', () => {
  const { percentBps: _percentBps, maxDiscountPaisa: _maxDiscountPaisa, ...common } = terms;
  const fixed: PromoTerms = { ...common, kind: 'fixed', fixedPaisa: 20000, budgetPaisa: 1 };
  assert.equal(calculatePromoDiscount(fixed, 10001), 10001);
  assert.equal(calculatePromoDiscount({ ...terms, budgetPaisa: 1 }, 10001), 1250);
});

void test('percentage multiplication stays exact when its intermediate product exceeds safe integers', () => {
  assert.equal(calculatePromoDiscount({ ...terms, percentBps: 9999, maxDiscountPaisa: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER), 9006298534815516);
});

void test('promo calculations reject unsafe, negative, fractional and inapplicable terms', () => {
  for (const subtotal of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) assert.throws(() => calculatePromoDiscount(terms, subtotal));
  for (const patch of [
    { percentBps: 0 }, { percentBps: 10001 }, { percentBps: 1.5 }, { percentBps: Number.MAX_SAFE_INTEGER + 1 },
    { fixedPaisa: 1 }, { maxDiscountPaisa: -1 }, { minimumSubtotalPaisa: -1 }, { budgetPaisa: 0 },
    { budgetPaisa: Number.MAX_SAFE_INTEGER + 1 }, { totalUseLimit: 0 }, { perCustomerUseLimit: 101 },
    { startsAt: -1 }, { startsAt: 0.5 }, { endsAt: 1 }, { endsAt: 253402300800 }, { code: 'bad code' }, { label: '' }, { label: 'a'.repeat(201) },
  ]) assert.throws(() => calculatePromoDiscount({ ...terms, ...patch } as PromoTerms, 10001), JSON.stringify(patch));
  assert.throws(() => calculatePromoDiscount({ ...terms, kind: 'fixed', fixedPaisa: 1 } as unknown as PromoTerms, 10001));
});

void test('allocation awards equal fractional remainders to ascending stable keys', () => {
  assert.deepEqual(allocatePromoDiscount([{ key: 'b', subtotalPaisa: 1 }, { key: 'a', subtotalPaisa: 1 }], 1), { a: 1, b: 0 });
  assert.deepEqual(allocatePromoDiscount([{ key: 'c', subtotalPaisa: 1 }, { key: 'b', subtotalPaisa: 3 }, { key: 'a', subtotalPaisa: 2 }], 4), { a: 1, b: 2, c: 1 });
});

void test('allocation conserves exact paisa at safe bounds and accepts zero-value lines', () => {
  const allocation = allocatePromoDiscount([{ key: 'large', subtotalPaisa: Number.MAX_SAFE_INTEGER - 1 }, { key: 'small', subtotalPaisa: 1 }, { key: 'zero', subtotalPaisa: 0 }], Number.MAX_SAFE_INTEGER - 2);
  assert.deepEqual(allocation, { large: 9007199254740988, small: 1, zero: 0 });
  assert.equal(Object.values(allocation).reduce((sum, value) => sum + value, 0), Number.MAX_SAFE_INTEGER - 2);
  assert.deepEqual(allocatePromoDiscount([], 0), {});
  assert.deepEqual(allocatePromoDiscount([{ key: 'a', subtotalPaisa: 0 }], 0), { a: 0 });
  const special = allocatePromoDiscount([{ key: '__proto__', subtotalPaisa: 1 }], 1);
  assert.equal(Object.hasOwn(special, '__proto__'), true);
  assert.equal(special.__proto__, 1);
});

void test('allocation rejects invalid or duplicate keys, unsafe totals and excess discounts', () => {
  for (const discount of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) assert.throws(() => allocatePromoDiscount([{ key: 'a', subtotalPaisa: 1 }], discount));
  for (const lines of [
    [{ key: 'a', subtotalPaisa: -1 }], [{ key: 'a', subtotalPaisa: 0.5 }], [{ key: '', subtotalPaisa: 1 }],
    [{ key: 'a', subtotalPaisa: 1 }, { key: 'a', subtotalPaisa: 1 }],
    [{ key: 'a', subtotalPaisa: Number.MAX_SAFE_INTEGER }, { key: 'b', subtotalPaisa: 1 }],
  ]) assert.throws(() => allocatePromoDiscount(lines, 0));
  assert.throws(() => allocatePromoDiscount([], 1));
  assert.throws(() => allocatePromoDiscount([{ key: 'a', subtotalPaisa: 1 }], 2));
});

void test('incentive administration permits safe context while rejecting financial and authority controls', () => {
  for (const id of ['staff.promo-code', 'staff.loyalty-settings'] as const) {
    const definition = { ...INCENTIVE_FORM_CONTRACTS[id], adapterId: id };
    const safe = { id: 'support_context', key: 'support_context', type: 'short_text', label: 'Context', required: false, status: 'active', order: 0 };
    const config = validateFormDraftForDefinition(definition, { formId: id, fields: [safe] }, true);
    assert.deepEqual(validateAnswersForDefinition(definition, { ...config, version: 1, publishedAt: 1 }, [{ fieldId: 'support_context', value: 'Approved explanation' }]).answers,
      [{ fieldId: 'support_context', label: 'Context', type: 'short_text', value: 'Approved explanation' }]);
    const protectedKeys = id === 'staff.promo-code'
      ? ['actorId', 'userId', 'customerId', 'requestId', 'expectedVersion', 'revision', 'formVersionId', 'versionId', 'formVersion', 'customAnswers', 'answers', 'reason', 'action', 'code', 'kind', 'fixedPaisa', 'percentBps', 'maxDiscountPaisa', 'minimumSubtotalPaisa', 'startsAt', 'endsAt', 'totalUseLimit', 'perCustomerUseLimit', 'budgetPaisa', 'usedCount', 'spentPaisa', 'paused']
      : ['actorId', 'userId', 'customerId', 'requestId', 'expectedVersion', 'version', 'formVersionId', 'versionId', 'formVersion', 'customAnswers', 'answers', 'reason', 'enabled', 'dailyPoints', 'pointsPerBlock', 'creditPaisaPerBlock', 'startsAt', 'endsAt', 'dailyBudgetPoints', 'lifetimeBudgetPoints', 'rateLocked', 'issuedPoints', 'redeemedPoints', 'outstandingPoints', 'issuedTodayPoints', 'points', 'creditPaisa', 'balancePoints', 'walletBalancePaisa', 'date', 'now'];
    for (const key of [...protectedKeys, 'terms', 'form', 'amountPaisa', 'discount', 'balance', 'budget', 'rate']) {
      const fieldId = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
      assert.throws(() => validateFormDraftForDefinition(definition, { formId: id, fields: [{ ...safe, id: fieldId, key: fieldId }] }, true), `${id}: ${key}`);
    }
    assert.throws(() => validateFormDraftForDefinition(definition, { formId: id, fields: [{ ...safe, id: 'password', key: 'password' }] }, true));
  }
});

void test('claim, redemption and promo quote reject custom questions and forged answers', () => {
  for (const id of ['account.daily-reward', 'account.points-redemption', 'commerce.promo-quote'] as const) {
    const definition = { ...INCENTIVE_FORM_CONTRACTS[id], adapterId: id };
    const config = validateFormDraftForDefinition(definition, { formId: id, fields: [] }, true);
    assert.deepEqual(validateAnswersForDefinition(definition, { ...config, version: 1, publishedAt: 1 }, []).answers, []);
    assert.throws(() => validateFormDraftForDefinition(definition, { formId: id, fields: [{ id: 'context', key: 'context', type: 'short_text', label: 'Context', required: false, status: 'active', order: 0 }] }, true));
    assert.throws(() => validateAnswersForDefinition(definition, { ...config, version: 1, publishedAt: 1 }, [{ fieldId: 'points', value: 100000 }]));
  }
});
