import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const DELIVERY_ESTIMATE_NOTICE =
  'This estimate uses the current district rate. It does not confirm delivery availability at your address. Delivery is available only to an address accepted for your order.';
import type { FixtureBrowser } from './helpers/browser-fixture-types';

void test('product district feedback announces invalid input, removes stale prices and accepts canonical aliases', async () => {
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
  const bundle = await build({
    stdin: {
      sourcefile: 'product-delivery-feedback-fixture.tsx',
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {ProductDelivery} from './components/commerce/product-delivery';
        import {DEFAULT_DELIVERY_RATES} from './lib/checkout/delivery-rates';
        createRoot(document.getElementById('root')).render(<ProductDelivery preparationDays={2} madeToOrder={true} rates={DEFAULT_DELIVERY_RATES}/>);`,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  try {
    const page = await browser.newPage();
    await page.route(
      'https://product-delivery-feedback.test/**',
      async (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<div id="root"></div>',
        }),
    );
    await page.goto('https://product-delivery-feedback.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const district = page.getByLabel('Delivery district');
    await district.waitFor();
    assert.equal(await district.getAttribute('aria-invalid'), 'false');
    assert.match(
      (await page.locator('#product-delivery-help').textContent()) ?? '',
      new RegExp(
        DELIVERY_ESTIMATE_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      ),
    );
    await district.fill('  kAtHmAnDu  ');
    await page.getByText('Estimate for Kathmandu.', { exact: true }).waitFor();
    assert.equal(await district.getAttribute('aria-invalid'), 'false');
    assert.match(
      (await page.getByText(/^Delivery charge:/).textContent()) ?? '',
      /150/,
    );
    assert.match(
      (await page.getByText(/^Estimated arrival:/).textContent()) ?? '',
      /3–5 days/,
    );
    await district.fill('Atlantis');
    await page
      .getByText(/No delivery charge is available for this entry/)
      .waitFor();
    assert.equal(await district.getAttribute('aria-invalid'), 'true');
    assert.equal(await page.getByText(/^Delivery charge:/).count(), 0);
    assert.equal(await page.getByText(/^Estimated arrival:/).count(), 0);
    assert.equal(
      await page
        .locator('#product-delivery-feedback')
        .evaluate((element) =>
          element.parentElement?.getAttribute('aria-live'),
        ),
      'polite',
    );
    await district.fill('Nawalparasi');
    await page
      .getByText(
        'Choose East or West for Nawalparasi or Rukum from the suggestions.',
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.getByText(/^Delivery charge:/).count(), 0);
    await district.fill('Nawalpur');
    await page
      .getByText('Estimate for Nawalparasi East.', { exact: true })
      .waitFor();
    assert.equal(await district.getAttribute('aria-invalid'), 'false');
    assert.match(
      (await page.getByText(/^Delivery charge:/).textContent()) ?? '',
      /180/,
    );
    await district.fill('');
    await page
      .getByText(
        'Choose or type your delivery district to see the charge and estimated arrival.',
        { exact: true },
      )
      .waitFor();
    assert.equal(await district.getAttribute('aria-invalid'), 'false');
    assert.equal(await page.getByText(/^Delivery charge:/).count(), 0);
  } finally {
    await browser.close();
  }
});
