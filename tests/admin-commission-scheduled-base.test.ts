import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const now = Date.UTC(2026, 9, 28);
const effectiveAt = Date.UTC(2026, 10, 10, 18, 15);

async function renderCommission(history: object[], supplements: object[] = []) {
  const compiled = await build({
    entryPoints: ['app/admin/commission/page.tsx'], bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['react', 'react/*'],
    plugins: [{ name: 'commission-scheduled-base-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(cloudflare:workers|next\/link|@\/lib\/auth\/staff|@\/components\/admin\/commission-(settings|report)|@\/lib\/db\/repositories\/(commission-rates|commission-reporting|marketplace-settings|business-settings))$/ }, args => ({ path: args.path, namespace: 'commission-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'commission-test' }, args => {
        const sources: Record<string, string> = {
          'cloudflare:workers': 'exports.env={DB:{}};',
          'next/link': "module.exports=({children,...props})=>require('react').createElement('a',props,children);",
          '@/lib/auth/staff': 'exports.requireStaffPage=async()=>({id:"staff"});',
          '@/components/admin/commission-settings': 'exports.CommissionSettings=()=>null;exports.CancelCommissionRate=()=>null;',
          '@/components/admin/commission-report': 'exports.CommissionReport=()=>null;',
          '@/lib/db/repositories/commission-reporting': 'exports.getCommissionReport=async()=>({});',
          '@/lib/db/repositories/marketplace-settings': 'exports.getCommissionSetting=async()=>({basisPoints:900,percent:9,versionId:"base",effectiveFrom:1});',
          '@/lib/db/repositories/business-settings': `exports.listBusinessSettingHistory=async()=>${JSON.stringify(history)};`,
          '@/lib/db/repositories/commission-rates': `exports.getCommissionRateState=async()=>({asOf:${now},revision:1,approvedSellers:2,current:{basisPoints:900,version:'base',acceptedAt:null},history:${JSON.stringify(supplements)}});`,
        };
        return { loader: 'js', contents: sources[args.path] };
      });
    } }],
  });
  const compiledModule = { exports: {} as { default(props: object): Promise<ReactElement> } };
  runInNewContext(compiled.outputFiles[0].text, {
    module: compiledModule, exports: compiledModule.exports, require: createRequire(import.meta.url),
    process, Date, Intl, crypto: globalThis.crypto,
  });
  return renderToStaticMarkup(await compiledModule.exports.default({ searchParams: Promise.resolve({}) }));
}

void test('commission page shows the next published base rate and its Nepal effective date', async () => {
  const html = await renderCommission([
    { status: 'published', value: 900, version: 2, effectiveFrom: 1, effectiveUntil: effectiveAt },
    { status: 'published', value: 1200, version: 1, effectiveFrom: effectiveAt, effectiveUntil: null },
    { status: 'published', value: 1400, version: 4, effectiveFrom: effectiveAt + 86400000, effectiveUntil: null },
    { status: 'cancelled', value: 1500, version: 3, effectiveFrom: now + 1000, effectiveUntil: null },
  ]);
  const sections = html.match(/<section\b[\s\S]*?<\/section>/g) ?? [];
  const scheduledBase = sections.find(section => /Next scheduled base rate/.test(section));
  assert.ok(scheduledBase, 'The scheduled Business Settings base rate must be visible.');
  assert.match(scheduledBase, /12%/);
  assert.match(scheduledBase, /Nov 11, 2026/);
  assert.match(scheduledBase, /12:00\s?am/i);
  assert.doesNotMatch(scheduledBase, /15%/);
  assert.doesNotMatch(scheduledBase, /14%/);
  assert.match(html, /Next scheduled fee supplement/);
});

void test('commission page distinguishes an empty base schedule from a scheduled fee supplement', async () => {
  const html = await renderCommission([
    { status: 'published', value: 900, version: 1, effectiveFrom: 1, effectiveUntil: null },
  ], [{ id: 'future', basisPoints: 1300, effectiveAt: effectiveAt, status: 'scheduled',
    agreementVersion: 'v1', termsText: 'Test terms', reason: 'Test', createdAt: 1,
    createdByName: 'Staff', acceptedSellers: 1, cancelledAt: null, cancelledByName: null, cancellationReason: null }]);
  const sections = html.match(/<section\b[\s\S]*?<\/section>/g) ?? [];
  const base = sections.find(section => /Next scheduled base rate/.test(section));
  const supplement = sections.find(section => /Next scheduled fee supplement/.test(section));
  assert.ok(base && supplement);
  assert.match(base, /No base rate change scheduled/);
  assert.match(supplement, /13%/);
});
