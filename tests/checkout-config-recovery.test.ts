import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type {
  FixtureBrowser,
  FixtureRoute,
} from './helpers/browser-fixture-types';

type ConfigFailure = 404 | 503 | 'network';
const attemptKey = 'hastabazaar:profile-attempt:commerce.checkout:cart';
let bundlePromise: Promise<string> | undefined;
function fixtureBundle() {
  return (bundlePromise ??= build({
    stdin: {
      sourcefile: 'checkout-recovery-fixture.tsx',
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {CheckoutForm} from './components/commerce/checkout-form';
      createRoot(document.getElementById('root')).render(<CheckoutForm
        customerId="fictional-customer" customerEmail="buyer@example.test" customerPhone="9811111111"
        customerDisplayName="Fictional Buyer" contactStatus={{email:'buyer@example.test',phone:'+9779811111111',emailVerified:true,phoneVerified:true}}
        savedAddresses={[{id:'fictional-address',isDefault:true,recipientName:'Fictional Buyer',phone:'9811111111',province:'Madhesh',district:'Dhanusha',municipality:'Janakpur',locality:'Fictional locality'}]}/>);
    `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'checkout-recovery-fixture',
        setup(bundler) {
          stubFixtureLink(bundler);
          bundler.onResolve(
            {
              filter:
                /^next\/navigation$|^@\/components\/delivery\/location-picker$/,
            },
            (args) => ({
              path: args.path,
              namespace: 'checkout-recovery-stubs',
            }),
          );
          bundler.onLoad(
            { filter: /.*/, namespace: 'checkout-recovery-stubs' },
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
  }).then((result) => result.outputFiles[0].text));
}
function config(version: number) {
  return {
    config: {
      formId: 'commerce.checkout',
      version,
      publishedAt: version,
      fields: [
        {
          id: 'delivery_note',
          key: 'delivery_note',
          type: 'short_text',
          label: version === 1 ? 'Delivery note' : 'Delivery instructions',
          required: false,
          order: 0,
          status: 'active',
        },
      ],
    },
  };
}
async function mounted(failure?: ConfigFailure) {
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
  const bundle = await fixtureBundle();
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage();
  const checkoutRequests: Record<string, unknown>[] = [];
  let configRequests = 0;
  let version = 1;
  let heldConfig: FixtureRoute | undefined;
  let holdNextConfig = false;
  await page.route('https://checkout-recovery.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/')
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<div id="root"></div>',
      });
    if (path === '/api/cart')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'fictional-item',
              sellerId: 'fictional-seller',
              nameEn: 'Fictional product',
              tradingName: 'Fictional shop',
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
    if (path === '/api/account/contact-verification')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          email: 'buyer@example.test',
          phone: '+9779811111111',
          emailVerified: true,
          phoneVerified: true,
        }),
      });
    if (path === '/api/forms/commerce.checkout') {
      configRequests++;
      if (configRequests === 1 && failure)
        return failure === 'network'
          ? route.abort()
          : route.fulfill({
              status: failure,
              contentType: 'application/json',
              body: JSON.stringify({
                error: 'Internal diagnostic must stay hidden.',
              }),
            });
      if (holdNextConfig) {
        holdNextConfig = false;
        heldConfig = route;
        return;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(config(version)),
      });
    }
    if (path === '/api/forms/commerce.promo-quote')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            formId: 'commerce.promo-quote',
            version: 1,
            publishedAt: 1,
            fields: [],
          },
        }),
      });
    if (path === '/api/checkout') {
      checkoutRequests.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({
        status: checkoutRequests.length === 1 ? 409 : 503,
        contentType: 'application/json',
        body: JSON.stringify(
          checkoutRequests.length === 1
            ? { error: 'Checkout was updated.', code: 'stale_version' }
            : { error: 'Fictional order result remains uncertain.' },
        ),
      });
    }
    return route.abort();
  });
  await page.goto('https://checkout-recovery.test/');
  await page.addScriptTag({ content: bundle });
  return {
    browser,
    page,
    checkoutRequests,
    configCount: () => configRequests,
    holdConfig: () => {
      holdNextConfig = true;
    },
    setVersion: (next: number) => {
      version = next;
    },
    completeConfig: async () => {
      assert.ok(heldConfig, 'configuration request must be held');
      await heldConfig.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(config(version)),
      });
      heldConfig = undefined;
    },
  };
}
for (const failure of [404, 503, 'network'] as const) {
  void test(
    'checkout configuration ' +
      failure +
      ' can recover without clearing fields or a retained attempt',
    async () => {
      const h = await mounted(failure);
      try {
        const retry = h.page.getByRole('button', {
          name: 'Retry loading checkout',
          exact: true,
        });
        await retry.waitFor();
        const priorId = '11111111-1111-4111-8111-111111111111';
        await h.page.evaluate(
          ({ key, id }) => {
            sessionStorage.setItem(key, id);
            sessionStorage.setItem(
              key + ':retry-metadata',
              JSON.stringify({
                version: 1,
                requestId: id,
                intentHash: 'a'.repeat(64),
                formVersion: 1,
                deliveryRateVersion: 'fictional-rate',
                useWallet: false,
              }),
            );
          },
          { key: attemptKey, id: priorId },
        );
        const storageBefore = await h.page.evaluate(() =>
          Object.entries(sessionStorage).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        );
        await h.page
          .getByLabel('Municipality / rural municipality')
          .fill('Edited municipality');
        await h.page
          .getByLabel('Street, tole or locality')
          .fill('Entered locality');
        await h.page.locator('label[for="checkout-terms"]').click();
        assert.equal(
          await h.page
            .getByRole('button', { name: 'Place COD order', exact: true })
            .isDisabled(),
          true,
        );
        assert.equal(
          await h.page
            .getByText('Internal diagnostic must stay hidden.')
            .count(),
          0,
        );
        h.holdConfig();
        await retry.click();
        await h.page
          .getByRole('button', { name: 'Loading checkout…', exact: true })
          .waitFor();
        assert.equal(
          await h.page
            .getByRole('button', { name: 'Loading checkout…', exact: true })
            .isDisabled(),
          true,
        );
        assert.equal(
          await h.page
            .getByRole('button', { name: 'Place COD order', exact: true })
            .isDisabled(),
          true,
        );
        assert.deepEqual(
          await h.page.evaluate(() =>
            Object.entries(sessionStorage).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
          storageBefore,
        );
        await h.completeConfig();
        await h.page.getByLabel('Delivery note').waitFor();
        assert.equal(h.configCount(), 2);
        assert.equal(
          await h.page
            .getByLabel('Municipality / rural municipality')
            .inputValue(),
          'Edited municipality',
        );
        assert.equal(
          await h.page.getByLabel('Street, tole or locality').inputValue(),
          'Entered locality',
        );
        assert.equal(
          await h.page
            .getByRole('checkbox')
            .last()
            .getAttribute('aria-checked'),
          'true',
        );
        assert.equal(
          await h.page
            .getByRole('button', { name: 'Place COD order', exact: true })
            .isEnabled(),
          true,
        );
        assert.deepEqual(
          await h.page.evaluate(() =>
            Object.entries(sessionStorage).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
          storageBefore,
        );
        assert.equal(
          h.checkoutRequests.length,
          0,
          'retrying configuration must never submit an order',
        );
      } finally {
        await h.browser.close();
      }
    },
  );
}
void test('stale checkout refresh retains custom answers and original idempotent replay without an automatic order retry', async () => {
  const h = await mounted();
  try {
    await h.page.getByLabel('Delivery note').fill('Call before delivery');
    await h.page.locator('label[for="checkout-terms"]').click();
    await h.page
      .getByRole('button', { name: 'Place COD order', exact: true })
      .click();
    const retry = h.page.getByRole('button', {
      name: 'Retry loading checkout',
      exact: true,
    });
    await retry.waitFor();
    assert.equal(h.checkoutRequests.length, 1);
    const first = h.checkoutRequests[0];
    assert.equal(first.formVersion, 1);
    assert.deepEqual(first.customAnswers, [
      { fieldId: 'delivery_note', value: 'Call before delivery' },
    ]);
    const stored = await h.page.evaluate(() =>
      Object.entries(sessionStorage).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
    assert.equal(stored.length, 2);
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Retry prior order attempt', exact: true })
        .isDisabled(),
      true,
    );
    h.setVersion(2);
    await retry.click();
    await h.page.getByLabel('Delivery instructions').waitFor();
    assert.equal(
      await h.page.getByLabel('Delivery instructions').inputValue(),
      'Call before delivery',
    );
    assert.equal(
      await h.page.getByRole('checkbox').last().getAttribute('aria-checked'),
      'true',
    );
    assert.deepEqual(
      await h.page.evaluate(() =>
        Object.entries(sessionStorage).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      stored,
    );
    assert.equal(
      h.checkoutRequests.length,
      1,
      'refresh must not automatically resend an uncertain order',
    );
    await h.page
      .getByRole('button', { name: 'Place COD order', exact: true })
      .click();
    await h.page
      .getByText(
        'This order differs from the prior attempt. Check whether it completed, then explicitly start a new attempt.',
      )
      .waitFor();
    assert.equal(
      h.checkoutRequests.length,
      1,
      'new published version must not silently replace original intent',
    );
    await h.page
      .getByRole('button', { name: 'Retry prior order attempt', exact: true })
      .click();
    await h.page
      .getByText('Fictional order result remains uncertain.')
      .waitFor();
    assert.equal(h.checkoutRequests.length, 2);
    assert.deepEqual(
      h.checkoutRequests[1],
      first,
      'explicit prior retry must preserve exact original form version, fields and request identity',
    );
    assert.deepEqual(
      await h.page.evaluate(() =>
        Object.entries(sessionStorage).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      stored,
    );
    await h.page.getByLabel('Delivery instructions').fill('Changed answer');
    await h.page
      .getByRole('button', { name: 'Retry prior order attempt', exact: true })
      .click();
    await h.page
      .getByText(/This order differs from the prior attempt/)
      .waitFor();
    assert.equal(
      h.checkoutRequests.length,
      2,
      'edited fields must not be replayed under the original identity',
    );
  } finally {
    await h.browser.close();
  }
});
