import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BusinessSettingAuthorizationError,
  assertBusinessSettingAuthorization,
} from '../lib/configuration/authorization';
import { parseBusinessSettingKey } from '../lib/configuration/definitions';
import { can } from '../lib/marketplace/permissions';

void test('business settings remain Super-Admin-only even when an Admin forges delegated permissions', () => {
  for (const permission of [
    'business_settings.view',
    'business_settings.manage',
    'business_settings.approve',
  ] as const) {
    assert.equal(can({ role: 'admin' }, permission), false);
    assert.equal(
      can({ role: 'admin', permissions: [permission] }, permission),
      false,
    );
    assert.equal(can('super_admin', permission), true);
  }
});

void test('controlled approval permits the proposing Super Admin and retains role authority', () => {
  const proposer = {
    id: 'super-a',
    role: 'super_admin' as const,
  };
  const reviewer = {
    id: 'super-b',
    role: 'super_admin' as const,
  };
  assert.doesNotThrow(() =>
    assertBusinessSettingAuthorization(reviewer, 'approve', {
      proposedBy: proposer.id,
    }),
  );
  assert.doesNotThrow(() => assertBusinessSettingAuthorization(proposer, 'approve', { proposedBy: proposer.id }));
  for (const role of ['admin', 'customer', 'seller'] as const) {
    assert.throws(() => assertBusinessSettingAuthorization({ id: proposer.id, role, permissions: ['business_settings.approve'] }, 'approve', { proposedBy: proposer.id }), BusinessSettingAuthorizationError);
  }
  assert.throws(
    () =>
      assertBusinessSettingAuthorization(
        { id: 'admin-a', role: 'admin' },
        'manage',
      ),
    BusinessSettingAuthorizationError,
  );
});

void test('unknown setting keys are rejected before repository access', () => {
  assert.equal(
    parseBusinessSettingKey('managed_sale_linked_platform_retention_bps'),
    'managed_sale_linked_platform_retention_bps',
  );
  assert.throws(() => parseBusinessSettingKey('raw_sql'), /unknown business setting/i);
  assert.throws(
    () => parseBusinessSettingKey('production_readiness_bypass'),
    /unknown business setting/i,
  );
});

void test('admin APIs enforce trusted mutations, bounded bodies, explicit permissions, and revisions', async () => {
  const sources = await Promise.all(
    [
      '../app/api/admin/business-settings/route.ts',
      '../app/api/admin/business-settings/[key]/route.ts',
      '../app/api/admin/business-settings/changes/[id]/route.ts',
    ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
  );
  const joined = sources.join('\n');
  assert.match(joined, /requireStaffApi\('business_settings\.view'\)/);
  assert.match(joined, /requireStaffApi\('business_settings\.manage'\)/);
  assert.match(joined, /requireStaffApi\('business_settings\.approve'\)/);
  assert.match(joined, /isTrustedMutationRequest\(request\)/);
  assert.match(joined, /readBoundedBody\(request,/);
  assert.match(joined, /expectedRevision/);
  assert.match(joined, /BusinessSettingConflictError/);
  assert.doesNotMatch(joined, /bypass|rawSql|process\.env\.NODE_ENV/);
});
