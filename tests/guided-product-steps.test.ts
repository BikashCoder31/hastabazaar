import assert from 'node:assert/strict';
import test from 'node:test';
import { groupProductStepIssues, firstProductStep } from '../lib/products/guided-product-steps';

void test('product steps use their own validation and guide an interrupted draft to its first unfinished step', () => {
  const publication = [
    { field: 'descriptionEn', reason: 'Describe what the customer receives.', code: 'missing' as const },
    { field: 'categoryId', reason: 'Choose a category.', code: 'policy' as const },
    { field: 'packQuantity', reason: 'State the actual number of pieces.', code: 'missing' as const },
    { field: 'countryOfOrigin', reason: 'Give the actual country of origin.', code: 'missing' as const },
    { field: 'eligibility:proof', reason: 'Staff checks proof.', code: 'eligibility' as const },
  ];
  const steps = groupProductStepIssues(publication, 2, '');
  assert.deepEqual(steps.map(issues => issues.map(issue => issue.field)), [
    ['coverImage'], ['descriptionEn', 'categoryId'], ['inventoryQuantity'], ['packQuantity', 'countryOfOrigin'],
  ]);
  assert.equal(firstProductStep(steps), 0);
  assert.equal(firstProductStep(groupProductStepIssues(publication, 3, '0')), 1);
  assert.equal(firstProductStep(groupProductStepIssues([], 3, '0')), 4);
  assert.equal(groupProductStepIssues([], 3, '-1')[2][0].field, 'inventoryQuantity');
  assert.equal(groupProductStepIssues([], 9, '0')[0][0].field, 'coverImage');
});
