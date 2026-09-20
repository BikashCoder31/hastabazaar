import assert from 'node:assert/strict';
import test from 'node:test';
import {
  safeSignInReturnPath,
  defaultSignInDestination,
} from '../lib/auth/sign-in-destination';

void test('normal sign-in uses role routing while specific local destinations survive', () => {
  for (const value of [
    undefined,
    '',
    '/account',
    '/account/',
    'https://evil.test',
    '//evil.test',
    '/login',
    '/login/',
    '/register/',
    '/login/code',
  ]) {
    assert.equal(safeSignInReturnPath(value), '/auth/continue');
  }
  for (const value of [
    '/checkout?step=payment',
    '/account/orders',
    '/account/wallet',
    '/seller/products',
    '/admin/orders',
  ]) {
    assert.equal(safeSignInReturnPath(value), value);
  }
});

void test('staff takes precedence over approved seller, then customer; no unnecessary seller lookup', async () => {
  assert.equal(
    await defaultSignInDestination(
      async () => true,
      async () => {
        throw new Error('must not run');
      },
    ),
    '/admin',
  );
  assert.equal(
    await defaultSignInDestination(
      async () => false,
      async () => true,
    ),
    '/seller',
  );
  assert.equal(
    await defaultSignInDestination(
      async () => false,
      async () => false,
    ),
    '/account',
  );
  await assert.rejects(
    defaultSignInDestination(
      async () => {
        throw new Error('Database unavailable');
      },
      async () => false,
    ),
    /Database unavailable/,
  );
});
