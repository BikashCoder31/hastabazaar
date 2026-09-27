import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
  'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

void test('product attempts survive lost responses and reload without crossing new, draft, or revision contexts', async () => {
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright is supplied by the bundled runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'product-client-fixture.tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ProductSubmissionForm } from './components/seller/product-submission-form';
      const path = location.pathname;
      const id = path.startsWith('/revision/') ? path.split('/')[2] : null;
      const initial = id ? { id, status: 'needs_changes', pricePaisa: 1000,
        compareAtPricePaisa: null, media: [], mediaCount: 0, occasionIds: [], inventoryQuantity: 1 } : undefined;
      createRoot(document.getElementById('root')!).render(<ProductSubmissionForm
        categories={[]} occasions={[]} mode={path === '/draft' ? 'draft' : 'submit'} initial={initial as any} />);
    `, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'next-link-shim', setup(bundler) {
      bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'next/link', namespace: 'next-shim' }));
      bundler.onLoad({ filter: /.*/, namespace: 'next-shim' }, () => ({
        contents: 'import React from "react"; export default function Link(props){return React.createElement("a", {href:props.href}, props.children)}',
        loader: 'tsx', resolveDir: process.cwd(),
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const requests = new Map<string, string[]>();
  const contexts = [
    { path: '/new', storage: 'new-submit', endpoint: '/api/seller/products' },
    { path: '/draft', storage: 'new-draft', endpoint: '/api/seller/products?intent=draft' },
    { path: '/revision/product-one', storage: 'revision:product-one', endpoint: '/api/seller/products/product-one' },
    { path: '/revision/product-two', storage: 'revision:product-two', endpoint: '/api/seller/products/product-two' },
  ];
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Browser route type belongs to bundled Playwright.
    await page.route('https://product.test/**', async (route: any) => {
      const url = new URL(route.request().url());
      if (contexts.some(({ path }) => path === url.pathname) ||
        url.pathname === '/revision/product-three' || url.pathname === '/revision/product-four')
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname.startsWith('/api/forms/')) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ config: { formId: 'seller.product-submission', version: 1, publishedAt: 1,
          fields: [{ id: 'nameEn', key: 'nameEn', type: 'short_text', label: 'Product name', required: true, order: 0, status: 'active' }] } }) });
      const endpoint = url.pathname + url.search;
      const request = new Request(url, { method: route.request().method(),
        headers: { 'content-type': route.request().headers()['content-type'] }, body: route.request().postData() });
      const requestId = (await request.formData()).get('requestId');
      assert.equal(typeof requestId, 'string');
      const list = requests.get(endpoint) ?? [];
      list.push(requestId as string);
      requests.set(endpoint, list);
      return list.length === 1 && endpoint === '/api/seller/products/product-four'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '{invalid-json' })
        : list.length === 1 ? route.abort('failed')
        : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    async function mount(path: string) {
      await page.goto(`https://product.test${path}`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled === false);
    }
    async function submit() {
      await page.evaluate(() => document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    }
    for (const context of contexts) {
      await mount(context.path);
      await submit();
      await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('Product not submitted'));
      assert.equal(requests.get(context.endpoint)?.length, 1);
      const stored = await page.evaluate((key: string) => sessionStorage.getItem(key),
        `hastabazaar:product-attempt:${context.storage}`);
      assert.equal(stored, requests.get(context.endpoint)?.[0]);
    }
    assert.equal(new Set([...requests.values()].map((ids) => ids[0])).size, contexts.length);
    for (const context of contexts) {
      await mount(context.path);
      await submit();
      await page.waitForFunction(() => document.body.textContent?.includes('Product revised and resubmitted') ||
        document.body.textContent?.includes('Product sent for review') || document.body.textContent?.includes('Private product draft saved'));
      const ids = requests.get(context.endpoint);
      assert.equal(ids?.length, 2);
      assert.equal(ids?.[0], ids?.[1]);
      assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key),
        `hastabazaar:product-attempt:${context.storage}`), null);
    }
    await mount('/revision/product-three');
    await submit();
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('Product not submitted'));
    const first = requests.get('/api/seller/products/product-three')?.[0];
    assert.ok(first);
    const reset = page.getByRole('button', { name: /start a new product attempt/i });
    page.once('dialog', async (dialog: { message(): string; dismiss(): Promise<void> }) => {
      assert.match(dialog.message(), /duplicate|upload/i);
      await dialog.dismiss();
    });
    await reset.click();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('hastabazaar:product-attempt:revision:product-three')), first);
    page.once('dialog', async (dialog: { message(): string; accept(): Promise<void> }) => {
      assert.match(dialog.message(), /duplicate|upload/i);
      await dialog.accept();
    });
    await reset.click();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('hastabazaar:product-attempt:revision:product-three')), null);
    await submit();
    await page.waitForFunction(() => document.body.textContent?.includes('Product revised and resubmitted'));
    assert.notEqual(requests.get('/api/seller/products/product-three')?.[1], first);
    await mount('/revision/product-four');
    await submit();
    await page.waitForFunction(() => document.querySelector('form')?.textContent?.includes('Product not submitted'));
    assert.match(await page.locator('form').textContent() ?? '', /status is uncertain/i);
    const malformedResponseId = requests.get('/api/seller/products/product-four')?.[0];
    await mount('/revision/product-four');
    await submit();
    await page.waitForFunction(() => document.body.textContent?.includes('Product revised and resubmitted'));
    assert.equal(requests.get('/api/seller/products/product-four')?.[1], malformedResponseId);
  } finally { await page.close(); await browser.close(); }
});
