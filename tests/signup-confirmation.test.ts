import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordConfirmationError } from '../lib/auth/password-confirmation';

void test('signup requires an exact confirmation without trimming or truncation', () => {
  assert.equal(passwordConfirmationError('long-password', ''), 'confirmation');
  assert.equal(passwordConfirmationError('long-password', 'long-password '), 'confirmation');
  assert.equal(passwordConfirmationError('long-password', 'long-password'), null);
  assert.equal(passwordConfirmationError('short', 'short'), 'invalid');
  const maximum = 'a'.repeat(256);
  assert.equal(passwordConfirmationError(maximum, maximum), null);
  assert.equal(passwordConfirmationError(maximum + 'x', maximum + 'y'), 'invalid');
  assert.equal(passwordConfirmationError(maximum + 'x', maximum + 'x'), 'invalid');
});
