import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixtureBrowser } from './helpers/browser-fixture-types';
import type { PublishedFormConfig } from '../lib/forms/types';

(globalThis as unknown as { trackingUiReact: typeof React }).trackingUiReact =
  React;
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'next/link'
      ? {
          url: 'data:text/javascript,export default function Link(props){return globalThis.trackingUiReact.createElement("a",props,props.children)}',
          shortCircuit: true,
        }
      : nextResolve(specifier, context);
  },
});
const config: PublishedFormConfig = {
  formId: 'commerce.order-tracking',
  version: 1,
  publishedAt: 1,
  fields: [
    {
      id: 'orderNumber',
      key: 'orderNumber',
      label: 'Published order number',
      type: 'short_text',
      required: true,
      order: 0,
      status: 'active',
    },
    {
      id: 'email',
      key: 'email',
      label: 'Published checkout email',
      type: 'email',
      required: true,
      order: 1,
      status: 'active',
    },
  ],
};
async function fixture(
  options: {
    preload?: 'published' | 'missing' | 'unavailable';
    failure?: 404 | 503;
    hydrate?: boolean;
  } = {},
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
  const props = options.preload
    ? `presentationConfig={${options.preload === 'published' ? JSON.stringify(config) : 'null'}}
    presentationUnavailable={${options.preload === 'unavailable'}}`
    : '';
  let initialHtml = '';
  if (options.hydrate) {
    const { OrderTracker } =
      await import('../components/commerce/order-tracker');
    initialHtml = renderToString(
      React.createElement(OrderTracker, {
        initialOrder: 'HK-FICTIONAL',
        ...(options.preload
          ? {
              presentationConfig:
                options.preload === 'published' ? config : null,
              presentationUnavailable: options.preload === 'unavailable',
            }
          : {}),
      }),
    );
  }
  const bundle = await build({
    stdin: {
      sourcefile: 'tracking-recovery-fixture.tsx',
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
    import React from 'react'; import {createRoot,hydrateRoot} from 'react-dom/client';
    import {OrderTracker} from './components/commerce/order-tracker';
    function HydrationProbe(){React.useEffect(()=>{window.trackingHydrated=true},[]);return null}
    const app=<><OrderTracker initialOrder="HK-FICTIONAL" ${props}/><HydrationProbe/></>;
    window.trackingHydrationErrors=[];
    if(${Boolean(options.hydrate)})hydrateRoot(document.getElementById('root'),app,{
      onRecoverableError(error){window.trackingHydrationErrors.push(error.message)}
    });else createRoot(document.getElementById('root')).render(app);
  `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: {
      'process.env.NODE_ENV': options.hydrate
        ? '"development"'
        : '"production"',
    },
    plugins: [{ name: 'tracking-fixture-navigation', setup: stubFixtureLink }],
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage();
  const configRequests: string[] = [];
  const lookupRequests: { orderNumber: string; email: string }[] = [];
  const state: {
    configStatus: number;
    failLookup: boolean;
    forbiddenLookup?: boolean;
  } = {
    configStatus: options.failure ?? 200,
    failLookup: false,
  };
  await page.route(
    'https://tracking-config-recovery.test/**',
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/')
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<meta charset="utf-8"><div id="root">${initialHtml}</div>`,
        });
      if (url.pathname === '/api/forms/commerce.order-tracking') {
        configRequests.push(url.pathname);
        return route.fulfill({
          status: state.configStatus,
          contentType: 'application/json',
          body: JSON.stringify(
            state.configStatus === 200
              ? { config }
              : { error: 'Form configuration unavailable.' },
          ),
        });
      }
      if (url.pathname === '/api/orders/track') {
        const input = JSON.parse(route.request().postData() ?? '{}') as {
          orderNumber: string;
          email: string;
        };
        lookupRequests.push(input);
        if (state.forbiddenLookup)
          return route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Access denied.' }),
          });
        if (state.failLookup)
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error:
                'Tracking is temporarily unavailable. Please try again shortly.',
            }),
          });
        const known =
          input.orderNumber === 'HK-FICTIONAL' &&
          input.email === 'qa@example.invalid';
        return route.fulfill({
          status: known ? 200 : 404,
          contentType: 'application/json',
          body: JSON.stringify(
            known
              ? {
                  tracking: {
                    orderNumber: 'HK-FICTIONAL',
                    status: 'confirmed',
                    paymentStatus: 'pending',
                    trackingCode: 'FICTIONAL-DELIVERY',
                    placedAt: 1,
                    deliveredAt: null,
                    updatedAt: 2,
                    estimatedMinDays: 1,
                    estimatedMaxDays: 3,
                    events: [{ status: 'confirmed', occurredAt: 2 }],
                  },
                }
              : {
                  error:
                    'We couldn’t match those details. Check your order number and checkout email.',
                },
          ),
        });
      }
      return route.abort();
    },
  );
  await page.goto('https://tracking-config-recovery.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(
    () =>
      (window as unknown as { trackingHydrated: boolean }).trackingHydrated ===
      true,
  );
  await page
    .getByRole('button', { name: 'Track order', exact: true })
    .waitFor();
  return { browser, page, configRequests, lookupRequests, state };
}

void test('validated server preload renders approved labels without another configuration request', async () => {
  const h = await fixture({ preload: 'published', failure: 503 });
  try {
    await h.page.getByLabel(/Published order number/).waitFor();
    assert.deepEqual(h.configRequests, []);
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Reload tracking form', exact: true })
        .count(),
      0,
    );
    assert.equal(
      await h.page
        .locator('input[name="orderNumber"]')
        .getAttribute('required'),
      '',
    );
    assert.equal(
      await h.page.locator('input[name="email"]').getAttribute('type'),
      'email',
    );
  } finally {
    await h.browser.close();
  }
});

void test('server and client markup hydrate consistently for published, missing and unavailable presentation', async () => {
  for (const preload of ['published', 'missing', 'unavailable'] as const) {
    const h = await fixture({ preload, hydrate: true, failure: 503 });
    try {
      assert.deepEqual(
        await h.page.evaluate(
          () =>
            (window as unknown as { trackingHydrationErrors: string[] })
              .trackingHydrationErrors,
        ),
        [],
        preload,
      );
      assert.deepEqual(h.configRequests, [], preload);
      assert.equal(
        await h.page.locator('input[name="orderNumber"]').inputValue(),
        'HK-FICTIONAL',
      );
    } finally {
      await h.browser.close();
    }
  }
});

void test('known missing optional presentation uses normal fields without a redundant 404 or warning', async () => {
  const h = await fixture({ preload: 'missing', failure: 404 });
  try {
    await h.page.getByLabel(/Order number/).waitFor();
    assert.deepEqual(h.configRequests, []);
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Reload tracking form', exact: true })
        .count(),
      0,
    );
    await h.page.locator('input[name="email"]').fill('qa@example.invalid');
    await h.page
      .getByRole('button', { name: 'Track order', exact: true })
      .click();
    await h.page
      .getByRole('region', { name: 'Order progress', exact: true })
      .waitFor();
    assert.equal(h.lookupRequests.length, 1);
    assert.deepEqual(h.lookupRequests[0], {
      orderNumber: 'HK-FICTIONAL',
      email: 'qa@example.invalid',
    });
  } finally {
    await h.browser.close();
  }
});

void test('failed server read reloads only optional text and preserves both entered lookup fields', async () => {
  const h = await fixture({ preload: 'unavailable', failure: 503 });
  try {
    const order = h.page.locator('input[name="orderNumber"]');
    const email = h.page.locator('input[name="email"]');
    await order.fill('HK-EDITED-FICTIONAL');
    await email.fill('qa@example.invalid');
    const reload = h.page.getByRole('button', {
      name: 'Reload tracking form',
      exact: true,
    });
    await reload.waitFor();
    assert.deepEqual(h.configRequests, []);
    await reload.click();
    await h.page
      .getByText(
        'You can still track your order using your order number and checkout email.',
        { exact: true },
      )
      .waitFor();
    assert.equal(h.configRequests.length, 1);
    h.state.configStatus = 200;
    await reload.click();
    await h.page.getByLabel(/Published order number/).waitFor();
    assert.equal(await order.inputValue(), 'HK-EDITED-FICTIONAL');
    assert.equal(await email.inputValue(), 'qa@example.invalid');
    assert.equal(h.configRequests.length, 2);
    assert.deepEqual(h.lookupRequests, []);
    assert.equal(await reload.count(), 0);
  } finally {
    await h.browser.close();
  }
});

void test('legacy client 404 keeps lookup usable and retry preserves a successful tracking result', async () => {
  const h = await fixture({ failure: 404 });
  try {
    const reload = h.page.getByRole('button', {
      name: 'Reload tracking form',
      exact: true,
    });
    await reload.waitFor();
    assert.equal(h.configRequests.length, 1);
    await h.page.locator('input[name="email"]').fill('qa@example.invalid');
    await h.page
      .getByRole('button', { name: 'Track order', exact: true })
      .click();
    const progress = h.page.getByRole('region', {
      name: 'Order progress',
      exact: true,
    });
    await progress.waitFor();
    h.state.configStatus = 200;
    await reload.click();
    await h.page.getByLabel(/Published checkout email/).waitFor();
    assert.equal(await progress.isVisible(), true);
    assert.equal(
      await h.page.locator('input[name="email"]').inputValue(),
      'qa@example.invalid',
    );
    assert.equal(h.lookupRequests.length, 1);
    assert.equal(h.configRequests.length, 2);
  } finally {
    await h.browser.close();
  }
});

void test('identity fields remain required and no-match or temporary lookup failure preserves inputs', async () => {
  const h = await fixture({ preload: 'missing' });
  try {
    const track = h.page.getByRole('button', {
      name: /^(Track order|Retry tracking)$/,
    });
    await track.click();
    assert.deepEqual(h.lookupRequests, []);
    const email = h.page.locator('input[name="email"]');
    await email.fill('not-an-email');
    await track.click();
    assert.deepEqual(h.lookupRequests, []);
    await email.fill('stranger@example.invalid');
    await track.click();
    await h.page.getByRole('alert').waitFor();
    assert.match(
      (await h.page.getByRole('alert').textContent()) ?? '',
      /couldn’t match those details/,
    );
    assert.equal(
      await h.page
        .getByRole('region', { name: 'Order progress', exact: true })
        .count(),
      0,
    );
    assert.equal(await email.inputValue(), 'stranger@example.invalid');
    h.state.failLookup = true;
    await track.click();
    await h.page
      .getByText(
        'Tracking is temporarily unavailable. Please try again shortly.',
        { exact: true },
      )
      .waitFor();
    assert.equal(await track.isEnabled(), true);
    assert.equal(await email.inputValue(), 'stranger@example.invalid');
    assert.equal(h.lookupRequests.length, 2);
  } finally {
    await h.browser.close();
  }
});

void test('configuration recovery preserves main same-query stale tracking and field edits clear results and errors', async () => {
  const h = await fixture({ preload: 'unavailable', failure: 503 });
  try {
    await h.page.locator('input[name="email"]').fill('qa@example.invalid');
    await h.page
      .getByRole('button', { name: 'Track order', exact: true })
      .click();
    const progress = h.page.getByRole('region', {
      name: 'Order progress',
      exact: true,
    });
    await progress.waitFor();
    h.state.failLookup = true;
    await h.page
      .getByRole('button', { name: 'Refresh tracking', exact: true })
      .click();
    await h.page
      .getByText('Last successful tracking is shown. It may be out of date.', {
        exact: true,
      })
      .waitFor();
    assert.equal(await progress.isVisible(), true);
    h.state.configStatus = 200;
    await h.page
      .getByRole('button', { name: 'Reload tracking form', exact: true })
      .click();
    await h.page.getByLabel(/Published checkout email/).waitFor();
    assert.equal(await progress.isVisible(), true);
    assert.equal(await h.page.getByRole('alert').count(), 1);
    h.state.failLookup = false;
    await h.page
      .getByRole('button', { name: 'Retry tracking', exact: true })
      .click();
    await h.page
      .getByRole('button', { name: 'Refresh tracking', exact: true })
      .waitFor();
    assert.equal(
      await h.page
        .getByText(
          'Last successful tracking is shown. It may be out of date.',
          { exact: true },
        )
        .count(),
      0,
    );
    await h.page
      .locator('input[name="email"]')
      .fill('stranger@example.invalid');
    assert.equal(await progress.count(), 0);
    assert.equal(await h.page.getByRole('alert').count(), 0);
    assert.equal(h.lookupRequests.length, 3);
  } finally {
    await h.browser.close();
  }
});

void test('tracking authorization failure still clears a previous successful private result', async () => {
  const h = await fixture({ preload: 'missing' });
  try {
    await h.page.locator('input[name="email"]').fill('qa@example.invalid');
    await h.page
      .getByRole('button', { name: 'Track order', exact: true })
      .click();
    const progress = h.page.getByRole('region', {
      name: 'Order progress',
      exact: true,
    });
    await progress.waitFor();
    h.state.forbiddenLookup = true;
    await h.page
      .getByRole('button', { name: 'Refresh tracking', exact: true })
      .click();
    await h.page.getByText('Access denied.', { exact: true }).waitFor();
    assert.equal(await progress.count(), 0);
    assert.equal(
      await h.page.locator('input[name="email"]').inputValue(),
      'qa@example.invalid',
    );
  } finally {
    await h.browser.close();
  }
});
