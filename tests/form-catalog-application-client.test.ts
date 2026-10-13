import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
  'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

void test('seller application retains one opaque request across lost response and reload, then clears on saved reference', async () => {
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright is supplied by the bundled runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'application-client-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { SellerApplicationForm } from './components/seller/seller-application-form';
      createRoot(document.getElementById('root')!).render(<SellerApplicationForm registeredTerms={{percent:10,context:"a".repeat(64)}} />);
    `, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const requests: { requestId: string; tradingName: string }[] = [];
  const storageKey = 'hastabazaar:profile-attempt:seller.application:new';
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Browser route type belongs to bundled Playwright.
    await page.route('https://application.test/**', async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname.startsWith('/api/forms/')) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ config: { formId: 'seller.application', version: 1, publishedAt: 1, fields: [] } }) });
      const request = new Request(url, { method: 'POST', headers: { 'content-type': route.request().headers()['content-type'] },
        body: route.request().postData() });
      const form = await request.formData();
      const requestId = form.get('requestId');
      const tradingName = form.get('tradingName');
      assert.equal(typeof requestId, 'string');
      assert.equal(typeof tradingName, 'string');
      requests.push({ requestId: requestId as string, tradingName: tradingName as string });
      if (requests.length === 1) return route.abort('failed');
      if (requests.length === 4 && requestId === requests[2].requestId && tradingName !== requests[2].tradingName)
        return route.fulfill({ status: 409, contentType: 'application/json',
          body: '{"code":"request_id_conflict","error":"This request reference belongs to different application details."}' });
      if (requests.length === 2) return route.fulfill({ status: 201, contentType: 'application/json',
        body: '{"applicationReference":"HB-APPLICATION-ONE"}' });
      if (requests.length === 3) return route.fulfill({ status: 201, contentType: 'application/json', body: '{invalid-json' });
      return route.fulfill({ status: 201, contentType: 'application/json',
        body: '{"applicationReference":"HB-APPLICATION-TWO"}' });
    });
    async function mount() {
      await page.goto('https://application.test/');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled === false);
    }
    async function submit(tradingName: string) {
      await page.locator('[name="tradingName"]').fill(tradingName);
      await page.evaluate(() => document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    }
    await mount();
    await submit('Fictional Studio');
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('Application status is uncertain'));
    assert.match(requests[0].requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), requests[0].requestId);
    await mount();
    await submit('Fictional Studio');
    await page.waitForFunction(() => document.body.textContent?.includes('HB-APPLICATION-ONE'));
    assert.equal(requests[1].requestId, requests[0].requestId);
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), null);
    await mount();
    await submit('New Studio');
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('Application status is uncertain'));
    assert.notEqual(requests[2].requestId, requests[0].requestId);
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), requests[2].requestId);
    await mount();
    await submit('Changed Studio');
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('different application details'));
    assert.equal(requests[3].requestId, requests[2].requestId);
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), requests[2].requestId);
    const reset = page.getByRole('button', { name: /start a new application attempt/i });
    page.once('dialog', async (dialog: { message(): string; dismiss(): Promise<void> }) => {
      assert.match(dialog.message(), /duplicate|already have succeeded/i);
      await dialog.dismiss();
    });
    await reset.click();
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), requests[2].requestId);
    page.once('dialog', async (dialog: { message(): string; accept(): Promise<void> }) => {
      assert.match(dialog.message(), /duplicate|already have succeeded/i);
      await dialog.accept();
    });
    await reset.click();
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), null);
    await submit('Different Studio');
    await page.waitForFunction(() => document.body.textContent?.includes('HB-APPLICATION-TWO'));
    assert.notEqual(requests[4].requestId, requests[2].requestId);
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), storageKey), null);
  } finally { await page.close(); await browser.close(); }
});
