import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import type { FixtureBrowser, FixtureLocator } from './helpers/browser-fixture-types';
import { stubFixtureLink } from './helpers/browser-fixture-link';

const targets = [
  { id: 'shipping.console-request', mode: 'request', path: '/api/seller/shipping', submit: 'Request coordination', reset: 'Start a new shipping request attempt' },
  { id: 'shipping.console-action-seller', mode: 'seller', path: '/api/seller/shipping/job-one', submit: 'Confirm carrier pickup', reset: 'Start a new shipping action attempt' },
  { id: 'shipping.console-action-staff', mode: 'staff', path: '/api/admin/shipping/job-one', submit: 'Apply action', reset: 'Start a new shipping action attempt' },
] as const;

async function fixture(target: (typeof targets)[number]) {
  const runtime = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(runtime) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({ stdin: { sourcefile: 'shipping-safety-fixture.tsx', resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {ShippingConsole} from './components/shipping-console';
    const mode=new URLSearchParams(location.search).get('mode');
    const job={id:'job-one',orderNumber:'ORDER-FIXTURE',sellerName:'Fictional seller',direction:'outbound',status:'requested',trackingCode:null,labelReference:null,reconciliationStatus:'pending'};
    createRoot(document.getElementById('root')).render(<ShippingConsole admin={mode==='staff'} orders={[{id:'order-one',orderNumber:'ORDER-FIXTURE'}]} jobs={mode==='request'?[]:[job]}/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'shipping-safety-navigation', setup(bundler) {
      stubFixtureLink(bundler);
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'shipping-fixture' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'shipping-fixture' }, () => ({ contents: 'export function useRouter(){return {refresh(){window.refreshes=(window.refreshes??0)+1}}}', loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const bodies: Record<string, unknown>[] = [];
  const versions = new Map<string, number>();
  let response = { status: 200, body: '{}' };
  let lost = false;
  let deferRefresh = false;
  let releaseRefresh: (() => void) | undefined;
  await page.route('https://shipping-safety.test/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/forms/')) {
      const formId = decodeURIComponent(path.split('/').at(-1)!);
      const version = (versions.get(formId) ?? 0) + 1;
      versions.set(formId, version);
      if (deferRefresh && formId === target.id) await new Promise<void>((resolve) => { releaseRefresh = resolve; });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config: { formId, version, publishedAt: 1, fields: [{ id: 'context_note', key: 'context_note', label: 'Shipping context', type: 'short_text', required: true, order: 0, status: 'active' }] } }) });
    } else if (path === target.path && request.method() === 'POST') {
      bodies.push(JSON.parse(request.postData() ?? '{}') as Record<string, unknown>);
      if (lost) await route.abort();
      else await route.fulfill({ status: response.status, contentType: 'application/json', body: response.body });
    } else await route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
  });
  const mount = async () => {
    await page.goto(`https://shipping-safety.test/?mode=${target.mode}`);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const form = page.locator(`form[data-form-id="${target.id}"]`);
    await form.getByLabel('Shipping context').fill('Fictional shipping context');
    if (target.mode === 'request') await form.locator('[name="orderId"]').selectOption('order-one');
    await form.locator('[name="note"]').fill('Fictional shipping note');
    if (target.mode === 'staff') {
      await form.locator('[name="labelReference"]').fill('LABEL-FIXTURE');
      await form.locator('[name="trackingCode"]').fill('TRACK-FIXTURE');
    }
    return form;
  };
  const send = async (form: FixtureLocator) => {
    const count = bodies.length;
    await form.getByRole('button', { name: target.submit, exact: true }).click();
    await page.waitForTimeout(80);
    assert.equal(bodies.length, count + 1);
  };
  return { browser, page, bodies, versions, mount, send,
    respond(status: number, body: string) { lost = false; response = { status, body }; },
    lose() { lost = true; },
    pauseRefresh() { deferRefresh = true; },
    resumeRefresh() { deferRefresh = false; releaseRefresh?.(); },
    success() { lost = false; response = { status: target.mode === 'request' ? 201 : 200, body: target.mode === 'request' ? '{"id":"job-created"}' : '{"ok":true}' }; },
  };
}

for (const target of targets) {
  void test(`${target.id} preserves uncertain attempts and fields until declared success`, async () => {
    const h = await fixture(target);
    try {
      let form = await h.mount();
      h.lose(); await h.send(form);
      const original = String(h.bodies[0].requestId);
      assert.match(original, /^[0-9a-f-]{36}$/i);
      assert.equal(h.bodies[0].formVersion, 1);
      form = await h.mount();
      await h.page.getByRole('button', { name: target.reset, exact: true }).waitFor();
      await form.locator('[name="note"]').fill('Changed fictional shipping note');
      await form.getByLabel('Shipping context').fill('Changed fictional context');
      for (const body of ['{', '{}', 'null', '{"id":{},"ok":"true"}', '{"id":" ","ok":false}', '{"error":"Unconfirmed"}', '{"id":"unconfirmed","ok":true,"error":"Unconfirmed"}']) {
        h.respond(200, body); await h.send(form);
        assert.equal(h.bodies.at(-1)?.requestId, original);
        assert.equal(await h.page.evaluate((id: string) => Object.values(sessionStorage).includes(id), original), true, 'Wrong-shaped success must retain recovery identity.');
        assert.equal(await form.locator('[name="note"]').inputValue(), 'Changed fictional shipping note');
        assert.equal(await form.getByLabel('Shipping context').inputValue(), 'Changed fictional context');
      }
      assert.ok((await h.page.evaluate(() => Object.values(sessionStorage))).every((value) => /^[0-9a-f-]{36}$/i.test(value)), 'Storage contains opaque identities only.');
      form = await h.mount();
      await h.page.getByRole('button', { name: target.reset, exact: true }).waitFor();
      await form.locator('[name="note"]').fill('Changed fictional shipping note');
      await form.getByLabel('Shipping context').fill('Changed fictional context');
      for (const status of [400, 409]) {
        h.respond(status, '{"error":"Correct the shipping domain input"}'); await h.send(form);
        assert.equal(h.bodies.at(-1)?.requestId, original);
        assert.equal(await form.getByRole('button', { name: target.submit, exact: true }).isEnabled(), true, 'Domain conflicts must permit same-key correction.');
      }
      h.success(); await h.send(form);
      assert.equal(h.bodies.at(-1)?.requestId, original);
      assert.equal(await h.page.evaluate((id: string) => Object.values(sessionStorage).includes(id), original), false);
      assert.equal(await form.locator('[name="note"]').inputValue(), '');
      assert.ok((await h.page.evaluate(() => Object.values(sessionStorage))).every((value) => !value.includes('Fictional')));
    } finally { await h.browser.close(); }
  });

  void test(`${target.id} refreshes a stale catalog only after warned reset confirmation`, async () => {
    const h = await fixture(target);
    try {
      const form = await h.mount();
      const values = () => form.evaluate((element) => Array.from(element.querySelectorAll('input,textarea,select')).filter((field) => field.getAttribute('name') !== 'formVersion').map((field) => ({ name: field.getAttribute('name'), value: (field as HTMLInputElement).value })));
      const originalValues = await values();
      h.respond(409, '{"error":"Form changed","code":"stale_version"}'); await h.send(form);
      const original = String(h.bodies[0].requestId);
      const button = form.getByRole('button', { name: target.submit, exact: true });
      assert.equal(await button.isDisabled(), true);
      const version = h.versions.get(target.id);
      h.page.once('dialog', (dialog) => dialog.dismiss());
      await h.page.getByRole('button', { name: target.reset, exact: true }).click();
      assert.equal(await button.isDisabled(), true);
      assert.equal(h.versions.get(target.id), version);
      assert.equal(await h.page.evaluate((id: string) => Object.values(sessionStorage).includes(id), original), true);
      h.pauseRefresh();
      h.page.once('dialog', (dialog) => dialog.accept());
      await h.page.getByRole('button', { name: target.reset, exact: true }).click();
      await h.page.waitForTimeout(80);
      assert.equal(await button.isDisabled(), true, 'A pending real configuration fetch must keep submission frozen.');
      h.resumeRefresh();
      await h.page.waitForTimeout(80);
      assert.equal(await button.isEnabled(), true, 'Accepted stale reset must refresh the actual catalog.');
      assert.equal(h.versions.get(target.id), Number(version) + 1);
      assert.equal(await form.locator('[name="note"]').inputValue(), 'Fictional shipping note');
      assert.equal(await form.getByLabel('Shipping context').inputValue(), 'Fictional shipping context');
      assert.deepEqual(await values(), originalValues, 'Reset preserves all protected controls and custom fields.');
      h.success(); await h.send(form);
      assert.notEqual(h.bodies.at(-1)?.requestId, original);
      assert.equal(h.bodies.at(-1)?.formVersion, h.versions.get(target.id));
      assert.equal(await h.page.evaluate((id: string) => Object.values(sessionStorage).includes(id), String(h.bodies.at(-1)?.requestId)), false);
    } finally { await h.browser.close(); }
  });
}
