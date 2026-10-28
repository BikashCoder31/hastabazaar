import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

async function renderCommission(hasSupplement: boolean) {
  const compiled = await build({
    entryPoints: ['app/admin/commission/page.tsx'], bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['react', 'react/*'],
    plugins: [{ name: 'commission-page-boundaries', setup(b) {
      b.onResolve({ filter: /^(cloudflare:workers|next\/link|@\/lib\/auth\/staff|@\/components\/admin\/commission-(settings|report)|@\/lib\/db\/repositories\/(commission-rates|commission-reporting|marketplace-settings|business-settings))$/ }, args => ({ path: args.path, namespace: 'commission-page' }));
      b.onLoad({ filter: /.*/, namespace: 'commission-page' }, args => {
        const sources: Record<string, string> = {
          'cloudflare:workers': 'exports.env={DB:{}};',
          'next/link': "module.exports=({children,...props})=>require('react').createElement('a',props,children);",
          '@/lib/auth/staff': 'exports.requireStaffPage=async()=>({id:"staff"});',
          '@/components/admin/commission-settings': 'exports.CommissionSettings=()=>null;exports.CancelCommissionRate=()=>null;',
          '@/components/admin/commission-report': 'exports.CommissionReport=()=>null;',
          '@/lib/db/repositories/commission-reporting': 'exports.getCommissionReport=async()=>({});',
          '@/lib/db/repositories/marketplace-settings': 'exports.getCommissionSetting=async()=>({basisPoints:725,percent:7.25,versionId:"saved-base",updatedAt:1,updatedByName:"Staff",effectiveFrom:1});',
          '@/lib/db/repositories/business-settings': 'exports.listBusinessSettingHistory=async()=>[];',
          '@/lib/db/repositories/commission-rates': `exports.getCommissionRateState=async()=>({asOf:2000,revision:1,approvedSellers:2,
            current:{basisPoints:${hasSupplement ? 1200 : 725},version:'${hasSupplement ? 'supplement' : 'saved-base'}',acceptedAt:null},
            history:${hasSupplement ? "[{id:'supplement',basisPoints:1200,effectiveAt:1000,agreementVersion:'existing-version',termsText:'Published fee terms',reason:'Isolated supplement',createdAt:1,createdByName:'Staff',acceptedSellers:1,status:'active',cancelledAt:null,cancelledByName:null,cancellationReason:null}]" : '[]'}});`,
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

void test('commission page distinguishes the saved base from the current published supplement', async () => {
  const html = await renderCommission(true);
  const sections = html.match(/<section\b[\s\S]*?<\/section>/g) ?? [];
  const base = sections.find(section => /Current saved base rate/.test(section));
  const supplement = sections.find(section => /Current published fee supplement/.test(section));
  assert.ok(base, 'Saved base needs its own visible rate explanation.');
  assert.match(base, /7\.25%/);
  assert.ok(supplement, 'Published supplement needs a distinct visible rate explanation.');
  assert.match(supplement, /12%/);
  assert.match(html, /Original recorded terms/, 'History must describe recorded terms without hardcoding a launch rate.');
  assert.doesNotMatch(html, /9% launch commission/);
});

void test('commission page identifies the absence of a supplement instead of presenting the saved base as one', async () => {
  const html = await renderCommission(false);
  assert.match(html, /Current saved base rate[\s\S]*?7\.25%/);
  assert.match(html, /No published fee supplement/);
});
