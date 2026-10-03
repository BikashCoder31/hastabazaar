import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixtureBrowser } from './helpers/browser-fixture-types';
import type { PublishedFormConfig } from '../lib/forms/types';

async function fixture(
  customer: boolean,
  unavailable = false,
  fields?: PublishedFormConfig['fields'],
) {
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
      sourcefile: 'checkout-config-activation-fixture.tsx',
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {CheckoutForm} from './components/commerce/checkout-form';
      createRoot(document.getElementById('root')).render(<CheckoutForm
        customerId={${customer ? "'customer-fixture'" : 'undefined'}} />);
    `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'checkout-config-navigation',
        setup(bundler) {
          stubFixtureLink(bundler);
          bundler.onResolve(
            {
              filter:
                /^next\/navigation$|^@\/components\/delivery\/location-picker$/,
            },
            (args) => ({
              path: args.path,
              namespace: 'checkout-config-fixture',
            }),
          );
          bundler.onLoad(
            { filter: /.*/, namespace: 'checkout-config-fixture' },
            (args) => ({
              loader: 'js',
              contents:
                args.path === 'next/navigation'
                  ? 'export function useRouter(){return {refresh(){}}}'
                  : 'export function LocationPicker(){return null}',
            }),
          );
        },
      },
    ],
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage();
  const configRequests: string[] = [];
  await page.route(
    'https://checkout-config-activation.test/**',
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/')
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<div id="root"></div>',
        });
      if (url.pathname === '/api/cart')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'item-fixture',
                sellerId: 'seller-fixture',
                nameEn: 'Fixture product',
                tradingName: 'Fixture seller',
                pricePaisa: 120000,
                quantity: 1,
                preparationDays: 1,
              },
            ],
            itemSubtotalPaisa: 120000,
            itemCount: 1,
            hasUnavailableItems: false,
          }),
        });
      if (url.pathname === '/api/account/contact-verification')
        return route.fulfill({
          status: customer ? 200 : 401,
          contentType: 'application/json',
          body: JSON.stringify(
            customer
              ? {
                  email: 'fixture@example.test',
                  phone: '+9779811111111',
                  emailVerified: true,
                  phoneVerified: true,
                }
              : { error: 'Sign in.' },
          ),
        });
      if (url.pathname.startsWith('/api/forms/')) {
        configRequests.push(url.pathname);
        return route.fulfill({
          status: customer && !unavailable ? 200 : 403,
          contentType: 'application/json',
          body: JSON.stringify(
            customer && !unavailable
              ? {
                  config: {
                    formId: 'commerce.checkout',
                    version: 1,
                    publishedAt: 1,
                    fields: fields ?? [
                      {
                        id: 'order_note',
                        key: 'order_note',
                        type: 'short_text',
                        label: 'Fixture order note',
                        required: false,
                        order: 0,
                        status: 'active',
                      },
                    ],
                  },
                }
              : { error: 'Forbidden.' },
          ),
        });
      }
      return route.abort();
    },
  );
  await page.goto('https://checkout-config-activation.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return { browser, page, configRequests };
}

void test('guest checkout retains its sign-in gate without requesting a protected form or displaying inactive status', async () => {
  const h = await fixture(false);
  try {
    await h.page
      .getByRole('link', { name: 'Sign in to continue', exact: true })
      .waitFor();
    assert.deepEqual(h.configRequests, []);
    assert.equal(
      await h.page
        .getByText('We couldn’t prepare checkout. Please retry.', {
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(
      await h.page.getByText('Preparing checkout…', { exact: true }).count(),
      0,
    );
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Place COD order', exact: true })
        .isDisabled(),
      true,
    );
  } finally {
    await h.browser.close();
  }
});

void test('signed-in checkout requests and renders its published order fields', async () => {
  const h = await fixture(true);
  try {
    await h.page.getByLabel('Fixture order note').waitFor();
    assert.equal(
      await h.page
        .getByRole('heading', { name: 'Order details', exact: true })
        .count(),
      1,
    );
    assert.equal(
      await h.page.locator('input[name="formVersion"]').inputValue(),
      '1',
    );
    assert.deepEqual(h.configRequests, ['/api/forms/commerce.checkout']);
    await h.page
      .getByRole('button', { name: 'Place COD order', exact: true })
      .waitFor();
    assert.equal(
      await h.page.getByText('Preparing checkout…', { exact: true }).count(),
      0,
    );
    assert.equal(
      await h.page
        .getByText('We couldn’t prepare checkout. Please retry.', {
          exact: true,
        })
        .count(),
      0,
    );
  } finally {
    await h.browser.close();
  }
});

void test('signed-in checkout still reports a real form configuration failure and stays disabled', async () => {
  const h = await fixture(true, true);
  try {
    await h.page
      .getByText('We couldn’t prepare checkout. Please retry.', {
        exact: true,
      })
      .waitFor();
    assert.deepEqual(h.configRequests, ['/api/forms/commerce.checkout']);
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Place COD order', exact: true })
        .isDisabled(),
      true,
    );
  } finally {
    await h.browser.close();
  }
});

for (const [scenario, fields] of [
  ['empty publication', []],
  [
    'built-in only publication',
    [
      {
        id: 'customer_email',
        key: 'customer_email',
        type: 'email',
        label: 'Order email',
        required: true,
        order: 0,
        status: 'active',
      },
      {
        id: 'order_note',
        key: 'order_note',
        type: 'short_text',
        label: 'Archived order note',
        required: false,
        order: 1,
        status: 'archived',
      },
    ],
  ],
] as const) {
  void test(
    'signed-in checkout omits empty Order details card for ' +
      scenario +
      ' while retaining its published version',
    async () => {
      const h = await fixture(
        true,
        false,
        structuredClone(fields) as unknown as PublishedFormConfig['fields'],
      );
      try {
        await h.page.waitForFunction(
          () => document.querySelector('input[name="formVersion"]') !== null,
        );
        const submit = h.page.getByRole('button', {
          name: 'Place COD order',
          exact: true,
        });
        await h.page.waitForFunction(
          () =>
            !document.querySelector<HTMLButtonElement>('button[type="submit"]')
              ?.disabled,
        );
        assert.deepEqual(h.configRequests, ['/api/forms/commerce.checkout']);
        assert.equal(
          await h.page
            .getByRole('heading', { name: 'Order details', exact: true })
            .count(),
          0,
        );
        assert.equal(
          await h.page.locator('[data-configured-field]').count(),
          0,
        );
        assert.equal(
          await h.page.locator('input[name="formVersion"]').inputValue(),
          '1',
        );
        assert.equal(await submit.isEnabled(), true);
        assert.equal(
          await h.page.getByLabel('Recipient name').isVisible(),
          true,
        );
      } finally {
        await h.browser.close();
      }
    },
  );
}
