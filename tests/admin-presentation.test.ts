import assert from 'node:assert/strict';
import test from 'node:test';
import { adminNavigation } from '../lib/admin/navigation';
import { availablePayoutActions } from '../lib/admin/payout-actions';
import { sendJson } from '../lib/http/client-request';

void test('staff navigation denies unknown roles and limits staff access to Super Admin', () => {
  for (const role of ['customer', 'seller', 'guest', 'unknown', ''])
    assert.deepEqual(adminNavigation(role), []);
  for (const href of ['/admin/team', '/admin/referrals', '/admin/delivery-rates', '/admin/activity']) {
    assert.equal(adminNavigation('admin').some(item => item.href === href), false);
    assert.equal(adminNavigation('super_admin').some(item => item.href === href), true);
  }
  assert.deepEqual(adminNavigation('admin', []).map(item => item.href), ['/admin/notifications']);
  const orderDesk = adminNavigation('admin', ['order.manage']);
  assert.ok(orderDesk.some(item => item.href === '/admin/orders'));
  assert.ok(orderDesk.some(item => item.href === '/admin/order-emails'));
  assert.equal(orderDesk.some(item => item.href === '/admin/cases'), false);
  assert.equal(orderDesk.some(item => item.href === '/admin/products'), false);
  assert.ok(
    adminNavigation('admin').some(
      (item) => item.href === '/admin/order-emails',
    ),
  );
  assert.equal(
    adminNavigation('admin').some((item) => item.href === '/admin/referrals'),
    false,
  );
  assert.equal(
    adminNavigation('admin').some((item) => item.href === '/admin/team'),
    false,
  );
  assert.equal(
    adminNavigation('super_admin').some((item) => item.href === '/admin/team'),
    true,
  );
  for (const role of ['admin', 'super_admin']) {
    const links = adminNavigation(role);
    assert.equal(new Set(links.map((item) => item.href)).size, links.length);
  }
});
void test('payout affordances follow state, role authority, and independent approval', () => {
  const admin = { canApprove: false, canProcess: false, isPreparer: false };
  const checker = { canApprove: true, canProcess: true, isPreparer: false };
  for (const status of ['prepared', 'scheduled']) {
    assert.deepEqual(availablePayoutActions(status, admin), []);
    assert.deepEqual(availablePayoutActions(status, checker), [
      'approve',
      'reject',
    ]);
    assert.deepEqual(
      availablePayoutActions(status, { ...checker, isPreparer: true }),
      [],
    );
  }
  for (const status of ['approved', 'failed']) {
    assert.deepEqual(availablePayoutActions(status, checker), [
      'start_processing',
    ]);
    assert.deepEqual(availablePayoutActions(status, admin), []);
  }
  assert.deepEqual(availablePayoutActions('processing', checker), [
    'mark_paid',
    'mark_failed',
  ]);
  assert.deepEqual(availablePayoutActions('processing', admin), []);
  for (const status of ['paid', 'rejected', 'reversed', 'unknown', ''])
    assert.deepEqual(availablePayoutActions(status, checker), []);
});
void test('mutation client reports network, non-JSON and rejected responses and retains valid results', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError('Network failed');
    };
    await assert.rejects(
      () => sendJson('/test', 'POST', {}, 'Fallback'),
      /couldn’t connect/,
    );
    globalThis.fetch = async () =>
      new Response('<html>Error</html>', { status: 500 });
    await assert.rejects(
      () => sendJson('/test', 'POST', {}, 'Fallback'),
      /Fallback/,
    );
    globalThis.fetch = async () =>
      Response.json(
        { error: 'Independent approval required.' },
        { status: 403 },
      );
    await assert.rejects(
      () => sendJson('/test', 'POST', {}, 'Fallback'),
      /Independent approval/,
    );
    globalThis.fetch = async () => Response.json({ ok: true });
    assert.deepEqual(await sendJson('/test', 'POST', {}, 'Fallback'), {
      ok: true,
    });
  } finally {
    globalThis.fetch = original;
  }
});
