import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { publicLegalPolicyNavigation } from '../lib/content/legal-policies';

type Fixture = { role: 'anonymous' | 'customer' | 'staff'; checks: string[] };

async function loadPage(entry: string, fixture: Fixture) {
  const compiled = await build({
    entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [{ name: 'legal-public-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(next\/link|next\/navigation|@\/lib\/auth\/staff|@\/lib\/auth\/seller-commercial-access|(?:@\/components\/layout\/|\.\/)site-(header|footer))$/ },
        args => ({ path: args.path, namespace: 'legal-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'legal-test' }, args => {
        const sources: Record<string, string> = {
          'next/link': "module.exports=({children,...props})=>require('react').createElement('a',props,children);",
          'next/navigation': "exports.notFound=()=>{throw new Error('NOT_FOUND')};",
          '@/lib/auth/staff': `exports.requireStaffPage=async(path,permission)=>{__fixture.checks.push(path+':'+permission);if(__fixture.role!=='staff')throw new Error('STAFF_REQUIRED');return {id:'staff'}};`,
          '@/lib/auth/seller-commercial-access': `exports.requireSellerTermsPage=async()=>{};`,
        };
        const shell = args.path.endsWith('header') ? 'SiteHeader' : 'SiteFooter';
        return { loader: 'js', contents: sources[args.path] ?? `exports.${shell}=()=>null;` };
      });
    } }],
  });
  const compiledModule = { exports: {} as Record<string, unknown> };
  runInNewContext(compiled.outputFiles[0].text, {
    module: compiledModule, exports: compiledModule.exports, require: createRequire(import.meta.url),
    process, Date, Intl, crypto: globalThis.crypto, __fixture: fixture,
  });
  return compiledModule.exports;
}

void test('public policy pages and the legal hub link only to active wording', async () => {
  const fixture: Fixture = { role: 'anonymous', checks: [] };
  const component = await loadPage('components/layout/legal-policy-page.tsx', fixture);
  const renderPolicy = component.LegalPolicyPage as (props: {policyKey: string}) => ReactElement;
  for (const policy of publicLegalPolicyNavigation) {
    const html = renderToStaticMarkup(renderPolicy({ policyKey: policy.key }));
    assert.match(html, /Updated and effective/);
    assert.doesNotMatch(html, /Previous wording|\/legal\/history/);
  }
  const hub = await loadPage('app/legal/page.tsx', fixture);
  const html = renderToStaticMarkup((hub.default as () => ReactElement)());
  assert.match(html, /Legal &amp; Policies/);
  assert.doesNotMatch(html, /Policy history|\/legal\/history/);
});

void test('direct policy archive requests require authorized staff, while records remain available internally', async () => {
  const fixture: Fixture = { role: 'anonymous', checks: [] };
  const archive = await loadPage('app/legal/history/page.tsx', fixture);
  const page = archive.default as (props: {searchParams: Promise<Record<string, string>>}) => Promise<ReactElement>;
  const sha = 'f048227ae4315b39b04566654996d5a296b9b91b6cf4b4d96c98ae989eaa0ed9';
  assert.equal(archive.dynamic, 'force-dynamic');
  const requests: Array<Record<string, string>> = [{}, { policy: 'terms' }, { sha256: sha }];
  for (const role of ['anonymous', 'customer'] as const) {
    fixture.role = role;
    for (const params of requests) {
      await assert.rejects(page({ searchParams: Promise.resolve(params) }), /STAFF_REQUIRED/);
    }
  }
  fixture.role = 'staff';
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ sha256: sha }) }));
  assert.match(html, /Document reference/);
  assert.match(html, new RegExp(sha));
  assert.ok(fixture.checks.every(check => check === '/legal/history:audit_log.view'));
  assert.equal(fixture.checks.length, 7);
});
