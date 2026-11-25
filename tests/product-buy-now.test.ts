import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixtureBrowser } from './helpers/browser-fixture-types';

type ResponseKind =
  | 'accepted'
  | 'pending'
  | 'forbidden'
  | 'offline'
  | 'non-json';
let bundled: Promise<string> | undefined;
function bundle() {
  return (bundled ??= build({
    stdin: {
      resolveDir: process.cwd(),
      sourcefile: 'buy-now-fixture.tsx',
      loader: 'tsx',
      contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import {AddToCart} from './components/commerce/add-to-cart';
      createRoot(document.getElementById('root')).render(<AddToCart productId="product-fixture" available={5} productPage={location.search === "?product-page"}/>);
    `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'buy-now-framework',
        setup(bundler) {
          stubFixtureLink(bundler);
          bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: 'navigation',
            namespace: 'buy-now-fixture',
          }));
          bundler.onLoad(
            { filter: /^navigation$/, namespace: 'buy-now-fixture' },
            () => ({
              loader: 'js',
              contents:
                'export function useRouter(){return {push(path){history.pushState({},"",path)}}}',
            }),
          );
        },
      },
    ],
  }).then((result) => result.outputFiles[0].text));
}

async function fixture(kind: ResponseKind = 'accepted', productPage = false) {
  const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE ??
      'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  )) as {
    chromium: {
      launch(options: {
        headless: boolean;
        executablePath: string;
      }): Promise<FixtureBrowser>;
    };
  };
  const source = await bundle();
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage();
  const requests: { method: string; body: unknown }[] = [];
  let releaseResponse: (() => void) | undefined;
  await page.route('https://buy-now.test/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname === '/products/product-fixture')
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<div id="root"></div>',
      });
    if (url.pathname === '/cart')
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<h1>Your bag</h1>',
      });
    if (url.pathname !== '/api/cart') return route.abort();
    requests.push({
      method: request.method(),
      body: JSON.parse(request.postData() ?? 'null'),
    });
    if (kind === 'pending')
      await new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
    if (kind === 'offline') return route.abort();
    if (kind === 'non-json')
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<h1>Unexpected response</h1>',
      });
    return route.fulfill({
      status: kind === 'forbidden' ? 403 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        kind === 'forbidden'
          ? {
              error:
                'This product is currently unavailable. Please choose another item.',
            }
          : { ok: true },
      ),
    });
  });
  await page.goto(
    'https://buy-now.test/products/product-fixture' + (productPage ? '?product-page' : ''),
  );
  await page.addScriptTag({ content: source });
  await page.getByRole('button', { name: 'Buy now', exact: true }).waitFor();
  return {
    browser,
    page,
    requests,
    release() {
      releaseResponse?.();
    },
  };
}

void test('adding from the product page makes View bag available in the mobile purchase row', async () => {
  const h = await fixture('accepted', true);
  try {
    const purchaseRow = h.page.locator('[data-product-mobile-add]');
    const viewBag = purchaseRow.getByRole('link', { name: 'View bag', exact: true });
    assert.equal(await viewBag.count(), 0);
    await purchaseRow.getByRole('button', { name: 'Add to bag', exact: true }).click();
    await purchaseRow.getByRole('button', { name: 'Added to bag', exact: true }).waitFor();
    assert.equal(await viewBag.isVisible(), true);
    await viewBag.click();
    await h.page.getByRole('heading', { name: 'Your bag' }).waitFor();
    assert.equal(await h.page.evaluate(() => location.pathname), '/cart');
    assert.deepEqual(h.requests, [
      { method: 'POST', body: { productId: 'product-fixture', quantity: 1 } },
    ]);
  } finally {
    await h.browser.close();
  }
});

void test('Buy now submits the selected quantity and waits for cart acceptance before opening checkout', async () => {
  const h = await fixture('pending');
  try {
    assert.equal(await h.page.getByLabel('Quantity').count(), 1);
    assert.equal(
      await h.page.getByLabel('Quantity').locator('option').count(),
      5,
    );
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Add to cart', exact: true })
        .count(),
      1,
    );
    await h.page.getByLabel('Quantity').selectOption('3');
    await h.page.getByRole('button', { name: 'Buy now', exact: true }).click();
    const pending = h.page.getByRole('button', {
      name: 'Opening checkout…',
      exact: true,
    });
    await pending.waitFor();
    assert.equal(await pending.isDisabled(), true);
    assert.equal(await h.page.getByLabel('Quantity').isDisabled(), true);
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Add to cart', exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await h.page.evaluate(() => location.pathname),
      '/products/product-fixture',
    );
    assert.deepEqual(h.requests, [
      { method: 'POST', body: { productId: 'product-fixture', quantity: 3 } },
    ]);
    h.release();
    await h.page.waitForFunction(() => location.pathname === '/checkout');
    assert.equal(h.requests.length, 1);
  } finally {
    h.release();
    await h.browser.close();
  }
});

void test('Buy now reuses an already accepted cart selection without adding it twice', async () => {
  const h = await fixture();
  try {
    await h.page.getByLabel('Quantity').selectOption('2');
    await h.page
      .getByRole('button', { name: 'Add to cart', exact: true })
      .click();
    await h.page
      .getByText('Your selection is in the cart.', { exact: true })
      .waitFor();
    await h.page.getByRole('button', { name: 'Buy now', exact: true }).click();
    await h.page.waitForFunction(() => location.pathname === '/checkout');
    assert.deepEqual(h.requests, [
      { method: 'POST', body: { productId: 'product-fixture', quantity: 2 } },
    ]);
  } finally {
    await h.browser.close();
  }
});

void test('changing an accepted quantity requires a new cart validation before Buy now', async () => {
  const h = await fixture();
  try {
    await h.page
      .getByRole('button', { name: 'Add to cart', exact: true })
      .click();
    await h.page
      .getByText('Your selection is in the cart.', { exact: true })
      .waitFor();
    await h.page.getByLabel('Quantity').selectOption('4');
    await h.page.getByRole('button', { name: 'Buy now', exact: true }).click();
    await h.page.waitForFunction(() => location.pathname === '/checkout');
    assert.deepEqual(h.requests, [
      { method: 'POST', body: { productId: 'product-fixture', quantity: 1 } },
      { method: 'POST', body: { productId: 'product-fixture', quantity: 4 } },
    ]);
  } finally {
    await h.browser.close();
  }
});

for (const [kind, message] of [
  [
    'forbidden',
    'This product is currently unavailable. Please choose another item.',
  ],
  ['offline', 'We couldn’t connect. Check your connection and try again.'],
  ['non-json', 'We couldn’t add this product. Please try again.'],
] as const)
  void test(`Buy now retains the product page and permits a retry after a ${kind} cart response`, async () => {
    const h = await fixture(kind);
    try {
      await h.page.getByLabel('Quantity').selectOption('3');
      await h.page
        .getByRole('button', { name: 'Buy now', exact: true })
        .click();
      const error = h.page.getByRole('alert');
      await error.waitFor();
      assert.equal(await error.textContent(), message);
      assert.equal(
        await h.page.evaluate(() => location.pathname),
        '/products/product-fixture',
      );
      assert.equal(
        await h.page
          .getByRole('button', { name: 'Buy now', exact: true })
          .isEnabled(),
        true,
      );
      assert.equal(await h.page.getByLabel('Quantity').inputValue(), '3');
      assert.deepEqual(h.requests, [
        { method: 'POST', body: { productId: 'product-fixture', quantity: 3 } },
      ]);
    } finally {
      await h.browser.close();
    }
  });
