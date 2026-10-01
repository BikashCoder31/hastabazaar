import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getLegalPolicyDocument,
  publicLegalPolicies,
  publicLegalPolicyNavigation,
} from '../lib/content/legal-policies';

const expected = {
  terms: 'dab5f74dc949e3e567c9cf6e670eae491b7fd16387acac59bdef87a4734c475a',
  returns: '9afdd3f1f6de09b9c3c81d03640d9c314b27f2e4131a77db67d3f690114c360f',
  shipping: '9212a7a0e1959724ee3e4c0d630b9756b89293cc0c54d2f0605fc033937435ce',
  privacy: '6843a1271878b41ee14ce2c3c85152330763d4ec16e3e45a4fda2c053cbcbb8d',
  cookies: '55dc1dfb9b5c07c2c7d542fbea037c92c8d115b36c56fffaa50e4ee0958d20af',
  'prohibited-products': 'fa3f3b8ecaf2989f8d4298e1ce8b45c94971e5d46a190b1b191cf3a06dbcca49',
  'seller-agreement': '4817512b1e2ac55b23a262245a825a26355c640aac3ec4c2e64b2146f396f7a1',
} as const;

void test('all seven canonical policy bodies match the supplied normalized hashes', () => {
  assert.deepEqual(Object.keys(publicLegalPolicies), Object.keys(expected));
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    const body = getLegalPolicyDocument(key)
      .replace(/\r\n/g, '\n')
      .replace(/\s+$/, '') + '\n';
    assert.equal(createHash('sha256').update(body).digest('hex'), expected[key], key);
    assert.equal(publicLegalPolicies[key].sha256, expected[key]);
    assert.doesNotMatch(
      body,
      /Version 3|preparation status|registration pending|draft for|\[DD\/MM\/YYYY\]|sha256_body_utf8_lf/i,
    );
  }
});

void test('legal hub and navigation expose the eight canonical public routes and exact hub copy', () => {
  assert.deepEqual(
    publicLegalPolicyNavigation.map(({ href }) => href),
    ['/terms', '/returns', '/shipping', '/privacy', '/cookies', '/prohibited-products', '/seller-agreement'],
  );
  const hub = readFileSync('app/legal/page.tsx', 'utf8');
  assert.match(hub, />\s*Legal & Policies\s*</);
  assert.match(
    hub,
    /Find the policies that explain shopping, selling, delivery and\s+personal information on HastaBazaar\./,
  );
  assert.match(hub, /mailto:support@hastabazaar\.com/);
  for (const policy of publicLegalPolicyNavigation) {
    assert.match(readFileSync(`app${policy.href}/page.tsx`, 'utf8'), /LegalPolicyPage/);
  }
});

void test('connected acceptance surfaces use the current policy wording and links', () => {
  const checkout = readFileSync('components/commerce/checkout-form.tsx', 'utf8');
  assert.match(checkout, /I agree to the/);
  assert.match(checkout, /href="\/terms"/);
  assert.doesNotMatch(checkout, /accept the Version 3/);
  const seller = readFileSync('components/seller/seller-application-form.tsx', 'utf8');
  assert.match(seller, /9% commission on completed, paid product sales/);
  assert.match(seller, /href="\/seller-agreement"/);
  assert.match(seller, /href="\/prohibited-products"/);
  assert.match(seller, /href="\/privacy"/);
});
