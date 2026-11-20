import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getLegalPolicyDocument,
  publicLegalPolicies,
  publicLegalPolicyNavigation,
  SELLER_AGREEMENT_VERSION,
  getArchivedLegalPolicy,
} from '../lib/content/legal-policies';

void test('company identity disclosure does not require existing sellers to reaccept', () => {
  assert.equal(
    SELLER_AGREEMENT_VERSION,
    'seller-agreement:sha256:4817512b1e2ac55b23a262245a825a26355c640aac3ec4c2e64b2146f396f7a1',
  );
});

const expected = {
  terms: 'f048227ae4315b39b04566654996d5a296b9b91b6cf4b4d96c98ae989eaa0ed9',
  returns: 'fe1ce8ecb209f94861103a6c0f63418068116861ca47ed136dff6b1f20aae19b',
  shipping: '7523ecd552d52161fd13fbb86579616e9f72ff564e955abbdedf31d811030ee2',
  privacy: 'c73ff698ca068c67ebb4856460ba5020102446929bcadcebec28e34b4068be4e',
  cookies: '270a7ff94bf7bdae82901474a06b18eace0f2feaf05947b225ccdc4310e8dd7b',
  'prohibited-products': 'afa80125cd2c1daadc16b242a542f8b3c4c5604545f0ab9a8edbb1a61bd3582a',
  'seller-agreement': '3bbe5e4b2775ea265ddeffdcd7360a7e7977737b5ac826b3c8c01be55d2ff96d',
} as const;

void test('all current canonical policy bodies match their recorded normalized hashes', () => {
  assert.deepEqual(Object.keys(publicLegalPolicies), [...Object.keys(expected), 'rewards-terms', 'promo-code-terms', 'gift-card-terms']);
  for (const key of Object.keys(publicLegalPolicies) as Array<keyof typeof publicLegalPolicies>) {
    const body = getLegalPolicyDocument(key, key === 'seller-agreement' ? 900 : undefined)
      .replace(/\r\n/g, '\n')
      .replace(/\s+$/, '') + '\n';
    assert.equal(createHash('sha256').update(body).digest('hex'), key === 'seller-agreement' ? publicLegalPolicies[key].baselineSha256 : publicLegalPolicies[key].sha256, key);
    assert.doesNotMatch(
      body,
      /Version 3|preparation status|registration pending|draft for|\[DD\/MM\/YYYY\]|sha256_body_utf8_lf/i,
    );
  }
});

void test('the previous seven documents remain retrievable by their exact recorded hashes', () => {
  for (const [key, hash] of Object.entries(expected)) {
    const previous = getArchivedLegalPolicy(hash);
    assert.equal(previous?.key, key);
    assert.equal(createHash('sha256').update(previous!.body).digest('hex'), hash);
  }
});

void test('customer policy navigation excludes seller commercial terms and preserves hub copy', () => {
  assert.deepEqual(
    publicLegalPolicyNavigation.map(({ href }) => href),
    ['/terms', '/returns', '/shipping', '/privacy', '/cookies', '/prohibited-products', '/rewards-terms', '/promo-code-terms', '/gift-card-terms'],
  );
  const hub = readFileSync('app/legal/page.tsx', 'utf8');
  assert.match(hub, />\s*Legal & Policies\s*</);
  assert.match(
    hub,
    /Find the policies that explain shopping, selling, delivery and\s+personal information on Hastabazaar\./,
  );
  assert.match(hub, /href=\{`mailto:\$\{companyDetails\.supportEmail\}`\}/);
  assert.match(hub, /\{companyDetails\.supportEmail\}/);
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
  assert.match(seller, /registrationAnswer === 'yes' && registeredTerms/);
  assert.match(seller, /\{registeredTerms\.percent\}% commission/);
  assert.doesNotMatch(seller, /9% commission/);
  assert.match(seller, /href="\/seller-agreement"/);
  assert.match(seller, /href="\/prohibited-products"/);
  assert.match(seller, /href="\/privacy"/);
});
