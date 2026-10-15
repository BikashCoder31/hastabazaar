import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import type { FixtureBrowser, FixturePage } from './helpers/browser-fixture-types';
import {stubFixtureLink} from './helpers/browser-fixture-link';

const supplyId = 'seller.managed-supply-proposal';
const transitionId = 'seller.managed-transition-request';
const managed = { participationRoute: 'managed_maker', applicationStage: 'active',
  commercialModel: 'managed_fixed_supplier_price_v1',
  products: [{ id: 'product-one', name: 'SIMULATED product', sku: 'SIM-ONE' }], supplies: [], transitions: [] };
const configs = Object.fromEntries([[supplyId, 4, 'Supply context'], [transitionId, 7, 'Transition context']]
  .map(([formId, version, label]) => [formId, { config: { formId, version, publishedAt: 1,
    fields: [{ id: 'context_note', key: 'context_note', label, type: 'short_text',
      required: true, order: 0, status: 'active' }] } }]));

void test('managed workspace mounts configuration only for eligible sellers and preserves required submissions', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: {
    headless: boolean; executablePath: string;
  }): Promise<FixtureBrowser> } };
  const bundled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'managed-eligibility-fixture.tsx', loader: 'tsx',
    contents: `import React, {useEffect} from 'react'; import {createRoot} from 'react-dom/client';
      import {SellerManagedProgramWorkspace} from './components/seller/managed-program-workspace';
      const root=createRoot(document.getElementById('root'));
      const originalFetch=window.fetch.bind(window); window.__configReads=[];
      window.fetch=(input,init)=>{const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
        if(path.startsWith('/api/forms/'))window.__configReads.push(path);return originalFetch(input,init);};
      function Fixture({route}){useEffect(()=>{window.__committedRoute=route;},[route]);
        return <SellerManagedProgramWorkspace sellerId="seller-one" workspace={{...${JSON.stringify(managed)},participationRoute:route}}/>;}
      window.__renderWorkspace=(route)=>{window.__committedRoute='waiting';root.render(<Fixture route={route}/>);};
      window.__renderWorkspace('registered_seller');` },
    bundle: true, platform: 'browser', format: 'iife', write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'navigation-fixture', setup(builder) {
      stubFixtureLink(builder);
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'fixture' }, () => ({ loader: 'js',
        contents: 'export function useRouter(){return {refresh(){window.__refreshes=(window.__refreshes||0)+1}}}' }));
    } }] });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page: FixturePage = await browser.newPage();
  const bodies: Array<Record<string, unknown>> = [];
  try {
    await page.route('https://managed-eligibility.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/api/forms/')) {
        const id = decodeURIComponent(path.slice('/api/forms/'.length));
        assert.ok(Object.hasOwn(configs, id), 'Only the two managed configurations are allowed');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(configs[id]) });
      }
      if (path === '/api/seller/managed-program') {
        bodies.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"record-one","simulation":true}' });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://managed-eligibility.test/');
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
    const committed = (route: string | null) => page.waitForFunction(expected =>
      (window as unknown as { __committedRoute: string | null }).__committedRoute === expected, route);
    const render = async (route: string | null) => {
      await page.evaluate(value => (window as unknown as { __renderWorkspace(value: string | null): void }).__renderWorkspace(value), route);
      await committed(route);
    };
    const reads = () => page.evaluate(() => (window as unknown as { __configReads: string[] }).__configReads);
    await committed('registered_seller');
    assert.deepEqual(await reads(), [], 'Registered sellers must not request unauthorized managed configuration');
    assert.equal(await page.locator('form').count(), 0);
    await render(null);
    assert.deepEqual(await reads(), [], 'Absent participation must not mount managed hooks');
    assert.equal(await page.locator('section').count(), 0);

    await render('managed_maker');
    const supply = page.locator(`form[data-form-id="${supplyId}"]`);
    await supply.getByLabel('Supply context').waitFor({ state: 'visible' });
    const transition = page.locator(`form[data-form-id="${transitionId}"]`);
    assert.equal(await transition.count(),0,'Only the owned multipart registration workspace may submit a transition');
    assert.deepEqual(await reads(), [`/api/forms/${supplyId}`]);
    await supply.locator('[name="productId"]').selectOption('product-one');
    await supply.getByLabel('Quantity offered').fill('2');
    await supply.getByLabel('Agreed unit supplier price (NPR)').fill('125');
    await supply.getByLabel('Simulated agreement version').fill('SIM-AGREEMENT');
    await supply.getByLabel('Simulated payout beneficiary').fill('SIM-BENEFICIARY');
    assert.equal(await supply.getByRole('button', { name: 'Propose documented test supply' }).getAttribute('type'), 'submit', 'Managed supply action must submit its real form');
    await supply.getByRole('button', { name: 'Propose documented test supply' }).click();
    assert.equal(bodies.length, 0, 'The published required supply answer blocks submission');
    assert.equal(await supply.getByLabel('Supply context').evaluate(element => element === document.activeElement), true);
    await supply.getByLabel('Supply context').fill('SIMULATED supply answer');
    await supply.getByRole('button', { name: 'Propose documented test supply' }).click();
    await page.waitForFunction(() => (window as unknown as { __refreshes?: number }).__refreshes === 1);
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].action, 'propose_fixed_supply');
    assert.equal(bodies[0].formVersion, 4);
    assert.equal(bodies[0].quantity, 2);
    assert.equal(bodies[0].agreedUnitPaisa, 12500);
    assert.deepEqual(bodies[0].customAnswers, [{ fieldId: 'context_note', value: 'SIMULATED supply answer' }]);
    assert.match(String(bodies[0].requestId), /^[0-9a-f-]{36}$/i);

    assert.equal(await page.getByRole('link',{name:'Review registration documents and request a Registered Seller transition'}).getAttribute('href'),'/sell/application#registered-transition');
    assert.equal(bodies.length,1,'The replaced free-text transition form cannot create a duplicate request');

    await render('registered_seller');
    assert.equal(await page.locator('form').count(), 0);
    assert.equal((await reads()).length, 1, 'A completed transition must unmount hooks without another fetch');
    await render('managed_maker');
    await page.locator(`form[data-form-id="${supplyId}"]`).getByLabel('Supply context').waitFor({ state: 'visible' });
    assert.equal((await reads()).length, 2, 'Becoming eligible again mounts fresh hooks without changing hook order');
  } finally { await page.close(); await browser.close(); }
});
