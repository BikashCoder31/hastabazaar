import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  assertBusinessSettingPublicationReady,
  managedMakerCapabilities,
  managedMakerModelIsLiveSelectable,
} from '../lib/configuration/capabilities';

(globalThis as unknown as { settingsPresentationCreateElement: typeof createElement }).settingsPresentationCreateElement = createElement;
registerHooks({ resolve(specifier, context, nextResolve) {
  if(specifier==='next/navigation')return{url:'data:text/javascript,export const useRouter=()=>({refresh(){}});export const usePathname=()=>"/admin/business-settings";export const useSearchParams=()=>new URLSearchParams();',shortCircuit:true};
  return specifier === 'next/link' ? { url: 'data:text/javascript,export default function Link({children,...props}){return globalThis.settingsPresentationCreateElement("a",props,children)}', shortCircuit: true } : nextResolve(specifier, context);
} });
const {BusinessSettingsManager}=await import('../components/admin/business-settings-manager');

void test('an unpublished commission directs to its paired native workflow without inventing zero or an independent rate editor', () => {
  const html = renderToStaticMarkup(createElement(BusinessSettingsManager, {actorId:'reviewer',
    asOf: 2_000,
    initialSettings: [{
      key: 'independent_seller_commission_bps', label: 'Independent seller commission',
      description: 'Published seller commission.', sensitivity: 'financial',
      changeControl: 'controlled', effectiveMode: 'effective_dated',
      snapshotOnTransaction: true, affectedSurfaces: ['seller'], requiredCapability: null,
      effective: {key:'independent_seller_commission_bps', value:null, source:'unconfigured',
        version:null, versionId:null, effectiveFrom:null, approvedBy:null},
      history: [],
    }],
  }));
  assert.match(html, /Review the common fee schedule/);
  assert.match(html, /href="\/admin\/commission#rate-management"/);
  assert.doesNotMatch(html, />Save changes</);
  assert.doesNotMatch(html, /0% commission/);
});

void test('Business Settings presents current, draft, scheduled, preview, impact, and immutable history', () => {
  const html = renderToStaticMarkup(
    createElement(BusinessSettingsManager, {actorId:'reviewer',
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
    'Change history',
    'Selling fee policy',
    'Review the common fee schedule',
  ]) {
    assert.match(html, new RegExp(text, 'i'));
  }
  assert.doesNotMatch(html, />Save changes</);
  assert.doesNotMatch(html, /Different Super Admin approval required/i);
  assert.doesNotMatch(html, /Super Admin approval required|Submit for review/i);
  assert.doesNotMatch(html, /maker entitlement rate/i);
});

void test('Program Management honestly keeps both Managed Maker models in Applications Only', async () => {
  const { ProgramManagement } = await import('../components/admin/program-management');
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
    'Environment unverified',
  ]) {
    assert.match(html, new RegExp(text, 'i'));
  }
  assert.doesNotMatch(html, /Activate now/i);
});

void test('trusted simulation context permits reviewing the fixed model without labelling it live-ready',()=>{
 const item={key:'managed_maker_active_model' as const,label:'Active commercial model',description:'Native program model.',sensitivity:'financial' as const,changeControl:'controlled' as const,effectiveMode:'effective_dated' as const,snapshotOnTransaction:true,affectedSurfaces:['managed_makers'],requiredCapability:null,effective:{key:'managed_maker_active_model' as const,value:'managed_fixed_supplier_price_v1' as const,source:'persisted' as const,version:1,versionId:'fictional-model-version',effectiveFrom:1,approvedBy:'reviewer'},history:[]};
 const html=renderToStaticMarkup(createElement(BusinessSettingsManager,{actorId:'reviewer',initialSettings:[item],asOf:2,simulationAllowed:true} as Parameters<typeof BusinessSettingsManager>[0]));
 assert.doesNotMatch(html,/not implemented and tested/);assert.match(html,/Simulation only/);
});

void test('Program Management uses supplied retention and never fills a missing rate', async () => {
  const {ProgramManagement} = await import('../components/admin/program-management');
  const props = {programMode:'applications_only' as const,activeModel:null,capabilities:managedMakerCapabilities};
  const supplied = renderToStaticMarkup(createElement(ProgramManagement,{...props,platformRetentionBps:1375}));
  assert.match(supplied,/13\.75% platform retention/);
  assert.match(supplied,/86\.25% maker entitlement/);
  const missing = renderToStaticMarkup(createElement(ProgramManagement,props));
  assert.match(missing,/current saved retention rate is unavailable/);
  assert.doesNotMatch(missing,/9% platform retention|91% maker entitlement/);
});

void test('sale-linked live capability and fixed-model simulation support remain distinct from actual maker activation', () => {
  assert.equal(
    managedMakerModelIsLiveSelectable('managed_sale_linked_percentage_v1'),
    true,
  );
  assert.equal(
    managedMakerModelIsLiveSelectable('managed_fixed_supplier_price_v1'),
    false,
  );
  assert.doesNotThrow(
    () =>
      assertBusinessSettingPublicationReady(
        'managed_maker_active_model',
        'managed_sale_linked_percentage_v1',
      ),
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
  assert.doesNotThrow(
    () =>
      assertBusinessSettingPublicationReady(
        'managed_maker_program_mode',
        'activation_enabled',
      ),
  );
  assert.doesNotThrow(() =>
    assertBusinessSettingPublicationReady(
      'managed_maker_program_mode',
      'applications_only',
    ),
  );
  assert.throws(()=>assertBusinessSettingPublicationReady('managed_maker_active_model','unsupported_native_model' as never),/not implemented and tested/i);
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
