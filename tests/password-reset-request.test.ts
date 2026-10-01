import assert from 'node:assert/strict';
import test from 'node:test';
import { requestPasswordReset } from '../lib/auth/password-reset-request';
import type { EmailOtpStore } from '../lib/auth/email-otp-service';

void test('reset response follows the same schedule for missing accounts and slow delivery', async () => {
  for (const exists of [false, true]) {
    let release!: () => void;
    let finishDelivery!: () => void;
    let sent = false;
    let responded = false;
    const schedule = new Promise<void>((r) => {
      release = r;
    });
    const delivery = new Promise<void>((r) => {
      finishDelivery = r;
    });
    const store = {
      findActiveUserByEmail: async () =>
        exists ? { id: 'u', email: 'local@example.test' } : null,
      replaceChallenge: async () => {},
      deleteChallenge: async () => {},
    } as unknown as EmailOtpStore;
    const response = requestPasswordReset(
      store,
      'local@example.test',
      async () => {
        sent = true;
        await delivery;
      },
      () => schedule,
    ).then((token) => {
      responded = true;
      return token;
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(responded, false);
    assert.equal(sent, exists);
    release();
    assert.match(await response, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(responded, true);
    finishDelivery();
  }
});

void test('failed background reset delivery removes its challenge without changing the response', async () => {
  let deleted = false;
  const store = {
    findActiveUserByEmail: async () => ({
      id: 'u',
      email: 'local@example.test',
    }),
    replaceChallenge: async () => {},
    deleteChallenge: async () => {
      deleted = true;
    },
  } as unknown as EmailOtpStore;
  assert.match(
    await requestPasswordReset(
      store,
      'local@example.test',
      async () => {
        throw new Error('Mail unavailable');
      },
      async () => {
        await new Promise((r) => setImmediate(r));
      },
    ),
    /^[A-Za-z0-9_-]{43}$/,
  );
  assert.equal(deleted, true);
});
