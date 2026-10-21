import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReferralShare } from '../components/account/referral-share';
import { referralInvitationLink } from '../lib/referrals/invitation-link';

void test('referral sharing displays the server-provided local invitation instead of a production test-code link', () => {
  const props = {
    code: 'ABCD1234EFGH5678',
    invitationLink: 'http://localhost:3018/r/ABCD1234EFGH5678',
  };
  const markup = renderToStaticMarkup(createElement(ReferralShare, props));
  assert.match(markup, /value="http:\/\/localhost:3018\/r\/ABCD1234EFGH5678"/);
  assert.doesNotMatch(markup, /https:\/\/hastabazaar\.com\/r\//);
});

void test('an unavailable configured origin keeps the code available without offering an invitation URL', () => {
  const props = { code: 'ABCD1234EFGH5678', invitationLink: null };
  const markup = renderToStaticMarkup(createElement(ReferralShare, props));
  assert.match(markup, /value="ABCD1234EFGH5678"/);
  assert.match(markup, /Copy code/);
  assert.doesNotMatch(
    markup,
    /id="referral-link"|Copy invitation|Share with a friend/,
  );
  assert.match(markup, /Invitation links are unavailable/);
});

void test('functional referral invitations follow the explicit local, staging and production origins', () => {
  assert.equal(
    referralInvitationLink('ABCD1234EFGH5678', 'http://localhost:3018'),
    'http://localhost:3018/r/ABCD1234EFGH5678',
  );
  assert.equal(
    referralInvitationLink(
      'ABCD1234EFGH5678',
      'https://staging.hastabazaar.com/',
    ),
    'https://staging.hastabazaar.com/r/ABCD1234EFGH5678',
  );
  assert.equal(
    referralInvitationLink('ABCD1234EFGH5678', 'https://hastabazaar.com'),
    'https://hastabazaar.com/r/ABCD1234EFGH5678',
  );
});

void test('missing or malformed server origins never fall back to production or become shareable URLs', () => {
  for (const origin of [
    undefined,
    '',
    '//attacker.example',
    '/relative',
    'javascript:alert(1)',
    'ftp://example.test',
    'https://user:secret@example.test',
    'https://example.test/path',
    'https://example.test/..',
    'https://example.test?redirect=other',
    'https://example.test?',
    'https://example.test#fragment',
    'https://example.test#',
    'https://*.example.test',
    'https://example.test\\path',
    'https://exam\nple.test',
  ]) {
    const invitationLink = referralInvitationLink('ABCD1234EFGH5678', origin);
    assert.equal(invitationLink, null, `Unsafe origin: ${origin}`);
  }
});
