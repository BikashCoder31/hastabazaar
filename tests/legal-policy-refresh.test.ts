import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import * as legal from '../lib/content/legal-policies';
import { companyDetails } from '../lib/content/company-details';

const normalized = (body: string) => body.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
const digest = (body: string) => createHash('sha256').update(normalized(body)).digest('hex');

void test('public terms include rewards, promo and gift-card documents with consistent policy fingerprints', () => {
  const registry = legal.publicLegalPolicies as Record<string, {href: string; sha256?: string; baselineSha256?: string}>;
  for (const key of ['rewards-terms', 'promo-code-terms', 'gift-card-terms']) {
    assert.ok(registry[key], `Missing public document: ${key}`);
    const body = legal.getLegalPolicyDocument(key as legal.LegalPolicyKey);
    assert.match(body, /support@hastabazaar\.com/);
    assert.equal(registry[key].sha256, digest(body));
    assert.ok(legal.publicLegalPolicyNavigation.some((item) => item.href === registry[key].href));
  }
  assert.equal(legal.CUSTOMER_POLICY_VERSION, 'customer-policy-set-2026-10-15');
  assert.equal(companyDetails.pan, '624749646');
});

void test('historical checkout policy hash resolves to its unchanged original terms', () => {
  const api = legal as unknown as {getArchivedLegalPolicy?: (hash: string) => {body: string; sha256: string; key: string} | null};
  assert.equal(typeof api.getArchivedLegalPolicy, 'function');
  const historicalHash = 'f048227ae4315b39b04566654996d5a296b9b91b6cf4b4d96c98ae989eaa0ed9';
  const previous = api.getArchivedLegalPolicy!(historicalHash);
  assert.ok(previous);
  assert.equal(previous.key, 'terms');
  assert.equal(previous.sha256, historicalHash);
  assert.equal(digest(previous.body), historicalHash);
  assert.notEqual(digest(legal.getLegalPolicyDocument('terms')), historicalHash);
  assert.equal(api.getArchivedLegalPolicy!('../../untrusted'), null);
});

void test('reward and refund rules preserve credit, distinguish discounts and prevent retroactive earning changes', () => {
  const rewards = legal.getLegalPolicyDocument('rewards-terms' as legal.LegalPolicyKey);
  assert.equal(typeof rewards, 'string');
  assert.match(rewards, /Nepal/);
  assert.match(rewards, /Day 1/);
  assert.match(rewards, /one missed day/i);
  assert.match(rewards, /do not expire/i);
  assert.match(rewards, /already earned/i);
  assert.match(rewards, /whole blocks/i);
  const refunds = legal.getLegalPolicyDocument('returns');
  assert.match(refunds, /shopping credit.*restored/i);
  assert.match(refunds, /promo.*not.*cash/i);
  assert.match(refunds, /Store credit is provided only when you choose it/);
});

void test('customer policy clearly describes grievance acknowledgement and a fifteen-day written decision', () => {
  const terms = legal.getLegalPolicyDocument('terms');
  assert.match(terms, /immediate.*acknowledg/i);
  assert.match(terms, /15 calendar days/);
  assert.match(terms, /written.*decision/i);
  assert.match(terms, /\/rewards-terms/);
  assert.match(terms, /\/promo-code-terms/);
  assert.match(terms, /\/gift-card-terms/);
});
