import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixturePage } from './helpers/browser-fixture-types';

type CartBrowser = { newPage(options: { viewport: { width: number; height: number } }): Promise<FixturePage>; close(): Promise<void> };
type CartKind = 'empty' | 'available' | 'unavailable';

async function fixture(kind: CartKind, width: number) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs') as {
      chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<CartBrowser> } };
  const bundle = await build({ stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {CartView} from './components/commerce/cart-view';
    window.cartErrors=[];const original=console.error;
    console.error=(...args)=>{window.cartErrors.push(args.map(String).join(' '));original(...args)};
    createRoot(document.getElementById('root')).render(<CartView/>);
  `, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'cart-framework-fixtures', setup(bundler) {
      stubFixtureLink(bundler);
      bundler.onResolve({ filter: /^next\/image$/ }, () => ({ path: 'image', namespace: 'cart-fixture' }));
      bundler.onLoad({ filter: /^image$/, namespace: 'cart-fixture' }, () => ({ resolveDir: process.cwd(), loader: 'tsx',
        contents: "import React from 'react';export default function Image({unoptimized,...props}){return <img {...props}/>;}" }));
    } }] });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const requests: { method: string; body: string | null }[] = [];
  const item = { id: 'cart-item', productId: 'fictional-product', slug: 'fictional-product', nameEn: 'Fictional craft', tradingName: 'Fictional maker',
    pricePaisa: 10000, quantity: 2, inventoryQuantity: 5, productStatus: 'published', primaryMediaId: null };
  const cart = { items: kind === 'empty' ? [] : [item], itemSubtotalPaisa: kind === 'empty' ? 0 : 20000,
    itemCount: kind === 'empty' ? 0 : 2, hasUnavailableItems: kind === 'unavailable' };
  let releaseMutation: (() => void) | undefined;
  await page.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    assert.equal(url.origin, 'https://cart-buttons.test', 'Every request stays in the isolated fixture');
    if (url.pathname === '/api/cart') {
      requests.push({ method: request.method(), body: request.postData() });
      if (request.method() !== 'GET') await new Promise<void>((resolve) => { releaseMutation = resolve; });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cart) });
    } else await route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
  });
  await page.goto('https://cart-buttons.test/cart');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole('heading', { name: kind === 'empty' ? 'Your cart is empty' : 'Order summary', exact: true }).waitFor();
  const errors = async () => {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return page.evaluate(() => (window as unknown as { cartErrors: string[] }).cartErrors);
  };
  return { browser, page, requests, errors, release() { releaseMutation?.(); } };
}

void test('empty-cart discovery renders a real shop anchor without BaseUI native-button diagnostics', async () => {
  for (const width of [390, 1440]) {
    const h = await fixture('empty', width);
    try {
      assert.equal(await h.page.locator('a[href="/shop"]').textContent(), 'Explore the collection');
      assert.deepEqual(await h.errors(), [], 'Real shared Button must accept its anchor render');
      assert.deepEqual(h.requests.map((request) => request.method), ['GET']);
    } finally { await h.browser.close(); }
  }
});

void test('available checkout stays an anchor while pending cart updates remain disabled native buttons', async () => {
  const h = await fixture('available', 390);
  try {
    await h.page.locator('a[href="/checkout"]').waitFor();
    assert.deepEqual(await h.errors(), [], 'The available checkout render is not a native button');
    await h.page.getByRole('button', { name: 'Increase Fictional craft quantity', exact: true }).click();
    const pending = h.page.locator('button').getByText(/Continue to checkout/);
    await pending.waitFor();
    assert.equal(await pending.isDisabled(), true, 'A pending update must block checkout');
    assert.equal(await h.page.locator('a[href="/checkout"]').count(), 0);
    assert.deepEqual(h.requests.map((request) => request.method), ['GET', 'PATCH']);
    assert.deepEqual(JSON.parse(h.requests[1].body ?? '{}'), { itemId: 'cart-item', quantity: 3 });
    assert.deepEqual(await h.errors(), [], 'The pending checkout render must retain native button semantics');
    h.release();
    await h.page.locator('a[href="/checkout"]').waitFor();
    assert.deepEqual(await h.errors(), []);
  } finally { h.release(); await h.browser.close(); }
});

void test('unavailable-item checkout remains a disabled native button without a checkout link', async () => {
  const h = await fixture('unavailable', 1440);
  try {
    const blocked = h.page.locator('button').getByText(/Continue to checkout/);
    assert.equal(await blocked.isDisabled(), true);
    assert.equal(await h.page.locator('a[href="/checkout"]').count(), 0);
    assert.deepEqual(await h.errors(), []);
    assert.deepEqual(h.requests.map((request) => request.method), ['GET']);
  } finally { await h.browser.close(); }
});
