import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILT_IN_STAFF_ACCESS_TEMPLATES,
  STAFF_ACCESS_RIGHTS,
  compareStaffAccess,
  parseSavedStaffAccessTemplate,
  parseStaffAccessSnapshot,
} from '../lib/staff/access';
import {
  can,
  configurableAdminPermissions,
} from '../lib/marketplace/permissions';

void test('job templates grant only their supported work and keep account access', () => {
  const bundles = [
    ['Technical responder', ['system.health.view', 'system.incidents.manage']],
    ['Orders assistant', ['order.manage']],
    ['Customer support', ['support.manage']],
    ['Product reviewer', ['product.review']],
    ['Product publisher', ['product.review', 'product.publish']],
    ['Seller reviewer', ['seller.application.review']],
    ['Finance assistant', ['payout.prepare']],
    ['Reports only', ['audit_log.view']],
    ['Money (view only)', ['payout.view', 'cod.view', 'refund.view']],
    ['Work access off', []],
  ] as const;
  for (const [name, expected] of bundles) {
    const template = BUILT_IN_STAFF_ACCESS_TEMPLATES.find(
      (item) => item.name === name,
    );
    assert.ok(template, name);
    assert.deepEqual(template.permissions, expected);
    for (const right of configurableAdminPermissions)
      assert.equal(
        can({ role: 'admin', permissions: template.permissions }, right),
        (expected as readonly string[]).includes(right),
        `${name}: ${right}`,
      );
    assert.equal(
      can(
        { role: 'admin', permissions: template.permissions },
        'account.self.manage',
      ),
      true,
    );
    assert.equal(
      can(
        { role: 'admin', permissions: template.permissions },
        'payout.approve',
      ),
      false,
    );
  }
  assert.deepEqual(
    STAFF_ACCESS_RIGHTS.map((item) => item.permission).sort(),
    [...configurableAdminPermissions].sort(),
  );
  assert.equal(can({ role: 'admin' }, 'support.manage'), true);
});

void test('saved templates reject malformed data and every reserved right without partial grants', () => {
  const preset = {
    id: 'saved-orders',
    name: ' Orders desk ',
    permissionsJson: '["order.manage","order.manage"]',
  };
  const valid = parseSavedStaffAccessTemplate(preset);
  assert.ok(valid);
  assert.equal(valid.name, 'Orders desk');
  assert.equal(valid.source, 'saved');
  assert.deepEqual(valid.permissions, ['order.manage']);
  assert.deepEqual(
    parseSavedStaffAccessTemplate({ ...preset, permissionsJson: '[]' })
      ?.permissions,
    [],
  );
  for (const value of [
    null,
    [],
    {},
    { ...preset, id: '' },
    { ...preset, name: '' },
    { ...preset, name: 'x'.repeat(81) },
    { ...preset, permissionsJson: 'not-json' },
    { ...preset, permissionsJson: '{}' },
    { ...preset, permissionsJson: '[null]' },
    { ...preset, permissionsJson: '["order.manage","unknown"]' },
  ]) {
    assert.equal(parseSavedStaffAccessTemplate(value), null);
  }
  for (const permission of [
    'admin.invite',
    'admin.permissions.manage',
    'payout.approve',
    'payout.mark_paid',
    'seller.suspend',
    'refund.approve.high_value',
    'account.self.manage',
  ])
    assert.equal(
      parseSavedStaffAccessTemplate({
        ...preset,
        permissionsJson: JSON.stringify(['order.manage', permission]),
      }),
      null,
      permission,
    );
});

void test('audit snapshots preserve explicit empty access and reject unknown or reserved data', () => {
  assert.deepEqual(parseStaffAccessSnapshot('{"permissions":[]}'), []);
  assert.deepEqual(
    parseStaffAccessSnapshot(
      '{"permissions":["support.manage","order.manage","order.manage"],"version":3}',
    ),
    ['order.manage', 'support.manage'],
  );
  for (const value of [
    null,
    undefined,
    '',
    'not-json',
    'null',
    '[]',
    '{}',
    '{"permissions":null}',
    '{"permissions":"order.manage"}',
    '{"permissions":["order.manage","payout.approve"]}',
    '{"permissions":["unknown"]}',
  ])
    assert.equal(parseStaffAccessSnapshot(value), null);
});

void test('access comparisons show real additions and removals without inventing unknown access', () => {
  assert.deepEqual(
    compareStaffAccess(
      ['order.manage', 'support.manage'],
      ['support.manage', 'product.review'],
    ),
    {
      added: ['product.review'],
      removed: ['order.manage'],
      unchanged: ['support.manage'],
    },
  );
  assert.deepEqual(compareStaffAccess(['order.manage'], []), {
    added: [],
    removed: ['order.manage'],
    unchanged: [],
  });
  assert.deepEqual(compareStaffAccess([], []), {
    added: [],
    removed: [],
    unchanged: [],
  });
  assert.equal(compareStaffAccess(null, []), null);
  assert.equal(compareStaffAccess([], ['payout.approve']), null);
  assert.equal(compareStaffAccess(['unknown'], []), null);
});
