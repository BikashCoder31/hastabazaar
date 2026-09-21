import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BusinessSettingsManager } from '../components/admin/business-settings-manager';
import { ProgramManagement } from '../components/admin/program-management';
import {
  assertBusinessSettingPublicationReady,
  managedMakerCapabilities,
  managedMakerModelIsLiveSelectable,
} from '../lib/configuration/capabilities';

void test('Business Settings presents current, draft, scheduled, preview, impact, and immutable history', () => {
  const html = renderToStaticMarkup(
    createElement(BusinessSettingsManager, {
      asOf: 2_000,
      initialSettings: [
        {
          key: 'managed_sale_linked_platform_retention_bps',
          label: 'Managed Maker sale-linked platform retention',
          description: 'Platform-retained share; maker entitlement is the remainder.',
          sensitivity: 'financial',
          changeControl: 'controlled',
          effectiveMode: 'effective_dated',
          snapshotOnTransaction: true,
          affectedSurfaces: ['managed_makers', 'orders', 'settlements'],
          requiredCapability: 'managed_sale_linked_percentage_v1',
          effective: {
            key: 'managed_sale_linked_platform_retention_bps',
            value: 900,
            source: 'default',
            version: null,
            versionId: null,
            effectiveFrom: null,
            approvedBy: null,
          },
          history: [
            {
              id: 'draft-1',
              key: 'managed_sale_linked_platform_retention_bps',
              value: 800,
              version: 1,
              status: 'draft',
              revision: 1,
              changeControl: 'controlled',
              effectiveFrom: null,
              effectiveUntil: null,
              reason: 'Test draft',
              createdBy: 'super-a',
              createdAt: 1_000,
              submittedBy: null,
              submittedAt: null,
              approvedBy: null,
              approvedAt: null,
              publishedBy: null,
              publishedAt: null,
              decisionNote: null,
              supersedesId: null,
              lastRequestId: 'draft-request',
            },
          ],
        },
      ],
    }),
  );
  for (const text of [
    'Current value',
    'Draft',
    'Scheduled',
    'Preview',
    'Affected areas',
    'Change history',
    'Different Super Admin approval required',
    '9% platform retention',
    '91% maker entitlement',
  ]) {
    assert.match(html, new RegExp(text, 'i'));
  }
  assert.match(html, /type="number"/);
  assert.doesNotMatch(html, /maker entitlement rate/i);
});

void test('Program Management honestly keeps both Managed Maker models in Applications Only', () => {
  const html = renderToStaticMarkup(
    createElement(ProgramManagement, {
      programMode: 'applications_only',
      activeModel: null,
      capabilities: managedMakerCapabilities,
    }),
  );
  for (const text of [
    'Applications Only',
    'Sale-linked percentage settlement',
    'Fixed supplier-price purchasing',
    'Live activation unavailable',
    'profiles',
    'product drafts',
    'not valid for production',
  ]) {
    assert.match(html, new RegExp(text, 'i'));
  }
  assert.doesNotMatch(html, /Activate now/i);
});

void test('implemented commercial models are staging-selectable but remain blocked for live use', () => {
  assert.equal(
    managedMakerModelIsLiveSelectable('managed_sale_linked_percentage_v1'),
    false,
  );
  assert.equal(
    managedMakerModelIsLiveSelectable('managed_fixed_supplier_price_v1'),
    false,
  );
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady(
        'managed_maker_active_model',
        'managed_sale_linked_percentage_v1',
      ),
    /not implemented and tested/i,
  );
  assert.doesNotThrow(() =>
    assertBusinessSettingPublicationReady(
      'managed_maker_active_model',
      'managed_sale_linked_percentage_v1',
      { simulationAllowed: true },
    ),
  );
  assert.doesNotThrow(() =>
    assertBusinessSettingPublicationReady(
      'managed_maker_active_model',
      'managed_fixed_supplier_price_v1',
      { simulationAllowed: true },
    ),
  );
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady(
        'managed_maker_program_mode',
        'activation_enabled',
      ),
    /not implemented and tested/i,
  );
  assert.doesNotThrow(() =>
    assertBusinessSettingPublicationReady(
      'managed_maker_program_mode',
      'applications_only',
    ),
  );
});

void test('admin pages and navigation retain server-authoritative Super Admin access', async () => {
  const [settingsPage, programsPage, navigation] = await Promise.all([
    readFile(
      new URL('../app/admin/business-settings/page.tsx', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../app/admin/programs/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/admin/navigation.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(settingsPage, /requireStaffPage\([\s\S]*?business_settings\.view/);
  assert.match(programsPage, /requireStaffPage\([\s\S]*?business_settings\.view/);
  assert.match(navigation, /\/admin\/business-settings/);
  assert.match(navigation, /\/admin\/programs/);
  assert.match(navigation, /business_settings\.view/);
});
