import {
  normalizeQueueFilters,
  sellerQueueStatuses,
} from '../lib/admin/queue-filters';

import assert from 'node:assert/strict';
import test from 'node:test';
import { adminNavigation } from '../lib/admin/navigation';
void test('task search trims input and finds settings by their task description', () => {
  const links = adminNavigation(
    'super_admin',
    undefined,
    '  company account  ',
  );
  assert.ok(links.some((l) => l.href === '/admin/business-settings'));
  assert.equal(
    links.some((l) => l.href === '/admin/orders'),
    false,
  );
});
void test('task search applies authorization before matching private destinations', () => {
  assert.deepEqual(adminNavigation('admin', undefined, 'rider'), []);
  assert.equal(
    adminNavigation('super_admin', undefined, 'rider').some(
      (l) => l.href === '/admin/riders',
    ),
    true,
  );
  for (const role of ['customer', 'seller', 'guest'])
    assert.deepEqual(adminNavigation(role, undefined, 'rider'), []);
  assert.deepEqual(adminNavigation('admin', [], 'payout'), []);
});
void test('blank task search retains all authorized tools and overview is the first daily task', () => {
  assert.deepEqual(
    adminNavigation('super_admin', undefined, '   '),
    adminNavigation('super_admin'),
  );
  assert.equal(adminNavigation('super_admin')[0]?.href, '/admin');
});

void test('duplicate or nontext query values cannot crash the queue page', () => {
  assert.deepEqual(
    normalizeQueueFilters(
      { q: ['one', 'two'], status: ['approved'] } as unknown as {
        q: string;
        status: string;
      },
      sellerQueueStatuses,
    ),
    { q: '', status: '' },
  );
});
