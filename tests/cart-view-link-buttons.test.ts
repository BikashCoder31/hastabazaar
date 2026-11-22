import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixturePage } from './helpers/browser-fixture-types';

type CartBrowser = { newPage(options: { viewport: { width: number; height: number } }): Promise<FixturePage>; close(): Promise<void> };
type CartKind = 'empty' | 'available' | 'unavailable' | 'price-changed' | 'save-rejected' | 'save-succeeded' | 'move-retry';

async function fixture(kind: CartKind, width: number) {
  const savedProduct = { id: 'saved-product', slug: 'fictional-saved-product', nameEn: 'Fictional saved item', tradingName: 'Fictional maker', primaryMediaId: null, pricePaisa: 12000,
    choice: { offerId: 'offer', versionId: 'v2', publicVersionId: 'pub2', pricePaisa: 12000 } };
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs') as {
      chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<CartBrowser> } };
  const bundle = await build({ stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {CartView} from './components/commerce/cart-view';
    window.cartErrors=[];const original=console.error;
    console.error=(...args)=>{window.cartErrors.push(args.map(String).join(' '));original(...args)};
    createRoot(document.getElementById('root')).render(<CartView customerId={${JSON.stringify(kind.startsWith('save-') || kind === 'move-retry' ? 'buyer-fixture' : undefined)}}
      savedProducts={${JSON.stringify(kind === 'move-retry' ? [savedProduct] : [])}}/>);
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
    pricePaisa: 10000, quantity: 2, inventoryQuantity: 5, productStatus: 'published', primaryMediaId: null,
    ...(kind === 'price-changed' ? { offerId: 'offer', revision: 1, currentChoice: { orderable: true, pricePaisa: 12000, versionId: 'v2', publicVersionId: 'pub2' } } : {}) };
  const cart = { items: kind === 'empty' ? [] : [item], itemSubtotalPaisa: kind === 'empty' ? 0 : 20000,
    itemCount: kind === 'empty' ? 0 : 2, hasUnavailableItems: kind === 'unavailable' };
  let releaseMutation: (() => void) | undefined;
  let signalMutation: (() => void) | undefined;
  let loseWishlistResponse = true;
  const waitForMutation = () => new Promise<void>(resolve => { signalMutation = resolve; });
  await page.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    assert.equal(url.origin, 'https://cart-buttons.test', 'Every request stays in the isolated fixture');
    if (url.pathname === '/api/cart') {
      requests.push({ method: request.method(), body: request.postData() });
      if (request.method() !== 'GET' && kind !== 'move-retry') await new Promise<void>((resolve) => { releaseMutation = resolve; signalMutation?.(); });
      const result = request.method() === 'DELETE' ? { ...cart, items: [], itemSubtotalPaisa: 0, itemCount: 0 }
        : request.method() === 'PATCH' && kind === 'price-changed' ? { ...cart, items: [{ ...item, pricePaisa: 12000 }], itemSubtotalPaisa: 24000 }
        : cart;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    } else if (url.pathname === '/api/account/wishlist') {
      requests.push({ method: request.method(), body: request.postData() });
      if (kind === 'move-retry') {
        if (loseWishlistResponse) { loseWishlistResponse = false; return route.abort(); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":false}' });
      }
      await new Promise<void>((resolve) => { releaseMutation = resolve; signalMutation?.(); });
      const rejected = kind === 'save-rejected';
      await route.fulfill({ status: rejected ? 403 : 200, contentType: 'application/json', body: JSON.stringify(rejected
        ? { error: 'Your signed-in account changed.' } : { saved: true }) });
    } else await route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
  });
  const reload = async () => {
    await page.goto('https://cart-buttons.test/cart');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('heading', { name: kind === 'empty' ? 'Your bag is empty' : 'Order summary', exact: true }).waitFor();
  };
  await reload();
  const errors = async () => {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return page.evaluate(() => (window as unknown as { cartErrors: string[] }).cartErrors);
  };
  return { browser, page, requests, errors, reload, waitForMutation, release() { releaseMutation?.(); } };
}

void test('empty-cart discovery renders a real shop anchor without BaseUI native-button diagnostics', async () => {
  for (const width of [390, 1440]) {
    const h = await fixture('empty', width);
    try {
      assert.equal(await h.page.locator('a[href="/shop"]:has-text("Explore the collection")').textContent(), 'Explore the collection');
      assert.deepEqual(await h.errors(), [], 'Real shared Button must accept its anchor render');
      assert.deepEqual(h.requests.map((request) => request.method), ['GET']);
    } finally { await h.browser.close(); }
  }
});

void test('the exact changed offer and price must be confirmed before checkout becomes reachable', async () => {
  const h = await fixture('price-changed', 390);
  try {
    assert.equal(await h.page.getByRole('button', { name: 'Go to checkout', exact: true }).isDisabled(), true);
    await Promise.all([h.waitForMutation(), h.page.getByRole('button', { name: 'Confirm current option and price', exact: true }).click()]);
    await h.page.waitForFunction(() => document.querySelector('a[href="/checkout"]') === null);
    assert.deepEqual(JSON.parse(h.requests[1].body ?? '{}').refresh, { versionId: 'v2', publicVersionId: 'pub2', pricePaisa: 12000 });
    h.release();
    await h.page.locator('a[href="/checkout"]').waitFor();
  } finally { h.release(); await h.browser.close(); }
});

for (const outcome of ['save-rejected', 'save-succeeded'] as const) {
  void test(`Save for later keeps the bag intact until the wishlist confirms the save (${outcome})`, async () => {
    const h = await fixture(outcome, 390);
    try {
      const mutation = h.page.waitForResponse(response => response.request().method() === 'PUT');
      await Promise.all([h.waitForMutation(), h.page.getByRole('button', { name: 'Save Fictional craft for later', exact: true }).click()]);
      assert.deepEqual(h.requests.map(request => request.method), ['GET', 'PUT']);
      assert.deepEqual(JSON.parse(h.requests[1].body ?? '{}'), { productId: 'fictional-product', saved: true });
      assert.equal(await h.page.locator('article').count(), 1);
      const removed = outcome === 'save-succeeded' ? h.waitForMutation() : undefined;
      h.release();
      await mutation;
      if (outcome === 'save-rejected') {
        await h.page.getByText('Your signed-in account changed.', { exact: true }).waitFor();
        assert.deepEqual(h.requests.map(request => request.method), ['GET', 'PUT']);
        assert.equal(await h.page.locator('article').count(), 1);
      } else {
        await removed;
        await h.page.getByRole('heading', { name: /Saved for later/ }).waitFor();
        await h.page.getByText('Saved action: Remove saved item Fictional craft.', { exact: false }).waitFor();
        assert.deepEqual(h.requests.map(request => request.method), ['GET', 'PUT', 'DELETE']);
        assert.deepEqual(JSON.parse(h.requests[2].body ?? '{}'), { itemId: 'cart-item' });
        h.release();
        await h.page.getByRole('heading', { name: 'Your bag is empty', exact: true }).waitFor();
        assert.equal(await h.page.locator('article').count(), 0);
      }
    } finally { h.release(); await h.browser.close(); }
  });
}

void test('moving a saved item replays the same cart command after an interrupted wishlist reply and reload', async () => {
  const h = await fixture('move-retry', 390);
  try {
    const move = h.page.getByRole('button', { name: 'Move to bag', exact: true });
    await move.click();
    await h.page.getByRole('alert').waitFor();
    await h.reload();
    await move.click();
    await h.page.getByText('Fictional saved item moved to your bag.', { exact: true }).waitFor();
    const adds = h.requests.filter(request => request.method === 'POST');
    assert.equal(adds.length, 2);
    assert.deepEqual(JSON.parse(adds[1].body ?? '{}'), JSON.parse(adds[0].body ?? '{}'));
    assert.equal(await h.page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('hb:move-saved-item:'))), false);
  } finally { await h.browser.close(); }
});

void test('available checkout stays an anchor while pending cart updates remain disabled native buttons', async () => {
  const h = await fixture('available', 390);
  try {
    await h.page.locator('a[href="/checkout"]').waitFor();
    assert.deepEqual(await h.errors(), [], 'The available checkout render is not a native button');
    await h.page.getByRole('button', { name: 'Increase Fictional craft quantity', exact: true }).click();
    const pending = h.page.locator('button').getByText(/Go to checkout/);
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
    const blocked = h.page.locator('button').getByText(/Go to checkout/);
    assert.equal(await blocked.isDisabled(), true);
    assert.equal(await h.page.locator('a[href="/checkout"]').count(), 0);
    assert.deepEqual(await h.errors(), []);
    assert.deepEqual(h.requests.map((request) => request.method), ['GET']);
  } finally { await h.browser.close(); }
});
