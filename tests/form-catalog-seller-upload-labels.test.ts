import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

void test('seller image uploads have unique accessible names for required and added optional slots', async () => {
  const modulePath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright is provided by the local bundled runtime.
  const { chromium } = await import(modulePath) as any;
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {ProductSubmissionForm} from './components/seller/product-submission-form';
    createRoot(document.getElementById('root')).render(<ProductSubmissionForm categories={[]} occasions={[]}/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'seller-upload-next-shims', setup(bundler) {
    bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'seller-upload' }));
    bundler.onLoad({ filter: /^link$/, namespace: 'seller-upload' }, () => ({
      contents: 'import React from "react";export default function Link(props){return <a {...props}/>}',
      loader: 'tsx', resolveDir: process.cwd(),
    }));
  } }], });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Route types are supplied by the local bundled runtime.
    await page.route('https://seller-upload-label.test/**', async (route: any) => {
      if (new URL(route.request().url()).pathname.startsWith('/api/forms/')) return route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ config: {
          formId: 'seller.product-submission', version: 1, publishedAt: 1, fields: [],
        } }),
      });
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://seller-upload-label.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const form = page.locator('form[data-form-id="seller.product-submission"]');
    await form.waitFor();
    for (const slot of [1, 2, 3, 4]) {
      const input = form.getByLabel(`Product image ${slot} (required)`, { exact: true });
      assert.equal(await input.count(), 1, `required image ${slot} must be individually discoverable`);
      assert.equal(await input.getAttribute('type'), 'file');
      assert.equal(await input.getAttribute('name'), `image${slot}`);
      assert.equal(await input.getAttribute('required'), '');
      assert.equal(await input.getAttribute('accept'), 'image/jpeg,image/png,image/webp');
    }
    await form.getByRole('button', { name: 'Add Image', exact: true }).click();
    await form.getByRole('button', { name: 'Add Image', exact: true }).click();
    for (const slot of [5, 6]) {
      const input = form.getByLabel(`Product image ${slot} (optional)`, { exact: true });
      assert.equal(await input.count(), 1, `optional image ${slot} must have its own accessible name`);
      assert.equal(await input.getAttribute('name'), 'images');
      assert.equal(await input.getAttribute('required'), null);
      assert.equal(await input.getAttribute('accept'), 'image/jpeg,image/png,image/webp');
    }
  } finally { await page.close(); await browser.close(); }
});
