import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sendAccountSecurityInvitation,
  sendAccountSecurityNotice,
} from '../lib/email/account-security';
void test('private invitation secrets occur only in recipient URL fragment and local mail stays fictional', async () => {
  const messages: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }[] = [];
  const bindings = {
    APP_ORIGIN: 'http://localhost:3018',
    HASTABAZAAR_RUNTIME_ENV: 'local_staging',
    EMAIL: {
      configured: true,
      send: async (message: { to: string; subject: string; text: string }) => {
        messages.push(message);
      },
    },
  };
  await sendAccountSecurityInvitation(bindings, {
    email: 'owner@local.hastabazaar.test',
    token: 'private-token',
    kind: 'password',
    expiresAt: 1800000000000,
  });
  const url = new URL(messages[0].text.match(/http[^\s]+/)![0]);
  assert.equal(url.search, '');
  assert.equal(url.hash, '#private-token');
  assert.equal(url.pathname, '/recover-account');
  assert.ok(
    messages[0].html?.includes(
      'href="http://localhost:3018/recover-account#private-token"',
    ),
  );
  await assert.rejects(
    sendAccountSecurityInvitation(bindings, {
      email: 'real@example.com',
      token: 'private-token',
      kind: 'password',
      expiresAt: 1800000000000,
    }),
  );
  await sendAccountSecurityNotice(bindings, {
    email: 'owner@local.hastabazaar.test',
    event: 'mfa_disabled',
  });
  assert.match(messages[1].text, /disabled/);
  assert.match(messages[1].html ?? '', /disabled/);
  assert.ok(!messages[1].text.includes('private-token'));
  await sendAccountSecurityInvitation(bindings, {
    email: 'owner@local.hastabazaar.test',
    token: 'private&token',
    kind: 'mfa',
    expiresAt: 1800000000000,
  });
  assert.ok(messages[2].html?.includes('#private&amp;token'));
  assert.ok(!messages[2].html?.includes('#private&token'));
});
void test('missing email adapter rejects instead of pretending to deliver', async () => {
  await assert.rejects(
    sendAccountSecurityNotice(
      { APP_ORIGIN: 'https://example.test' },
      { email: 'owner@example.test', event: 'password_reset' },
    ),
  );
});
