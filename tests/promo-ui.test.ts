import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type {
  FixtureBrowser,
  FixtureRoute,
  FixturePage,
} from './helpers/browser-fixture-types';

const terms = {
  code: 'SAVE10',
  label: 'Fictional savings',
  kind: 'fixed',
  fixedPaisa: 1000,
  minimumSubtotalPaisa: 0,
  startsAt: 1000,
  endsAt: 253402300799999,
  totalUseLimit: 10,
  perCustomerUseLimit: 2,
  budgetPaisa: 10000,
};
const state = {
  campaignId: 'campaign-a',
  version: 3,
  revision: 2,
  draftRevision: 2,
  publishedRevision: 1,
  terms,
  paused: false,
  usedCount: 2,
  spentPaisa: 2000,
  maximumCustomerUsedCount: 1,
};
async function mounted(surface = 'checkout', checkoutContext = false) {
  const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ??
      'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  );
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {CheckoutForm} from './components/commerce/checkout-form';
 import {PromoCodeManager} from './components/admin/promo-code-manager';
 const root=createRoot(document.getElementById('root'));
 window.unmountFixture=()=>root.unmount();
 root.render(${JSON.stringify(surface)}==='empty'?null:${JSON.stringify(surface)}.startsWith('admin')?
 <PromoCodeManager role={${JSON.stringify(surface)}==='admin-denied'?'admin':'super_admin'} initialPage={{campaigns:[${JSON.stringify(state)}],nextCursor:${JSON.stringify(surface === 'admin-paginated' ? 'fixture-cursor' : null)}}}/>:
 <CheckoutForm customerId={${JSON.stringify(surface)}==='guest'?undefined:'customer-fixture'} customerEmail={${JSON.stringify(surface)}==='guest'?undefined:'buyer@example.test'} customerPhone="9811111111" customerDisplayName="Fictional Buyer"
 savedAddresses={[{id:'address-a',isDefault:true,recipientName:'Fictional Buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional locality'}]}
 walletBalancePaisa={window.fixtureWalletBalance??2000} referralCampaign={{enabled:true,friendDiscountPaisa:500,minimumSubtotalPaisa:0}}/>);`,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'fixture',
        setup(b) {
          stubFixtureLink(b);
          b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
          b.onResolve(
            { filter: /^@\/components\/delivery\/location-picker$/ },
            () => ({ path: 'location', namespace: 'fixture' }),
          );
          b.onLoad({ filter: /location|navigation/, namespace: 'fixture' }, (args) => ({
            contents: args.path === 'navigation' ? 'export function useRouter(){return {refresh(){}}}' : 'export function LocationPicker(){return null}',
            loader: 'js',
          }));
        },
      },
    ],
  });
  const browser = (await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  })) as FixtureBrowser;
  const page = (await browser.newPage()) as FixturePage & {
    setDefaultTimeout(ms: number): void;
    on(
      event: 'console',
      handler: (msg: { type(): string; text(): string }) => void,
    ): void;
    on(event: 'pageerror', handler: (error: Error) => void): void;
  };
  page.setDefaultTimeout(5000);
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const quotes: FixtureRoute[] = [];
  const histories: FixtureRoute[] = [];
  let holdHistory = false;
  let failDetail = false;
  let hold = false;
  let quoteUnavailable = false;
  let loseOrderResponse = false;
  let emptyCart = false;
  let walletBalance = 2000;
  let adminResponse = {
    status: 503,
    body: { error: 'Uncertain fixture result' } as object,
  };
  const reads: string[] = [];
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (
      msg.type() === 'error' &&
      !msg.text().includes('Failed to load resource')
    )
      errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, 'https://promo-ui.test');
    const path = url.pathname;
    if (path.startsWith('/api/')) reads.push(path);
    if (path === '/api/account/contact-verification' && route.request().method() === 'GET')
      return route.fulfill({
        status: surface === 'guest' ? 401 : 200,
        contentType: 'application/json',
        body: JSON.stringify(surface === 'guest' ? { error: 'Sign in required.' } : {
          email: 'buyer@example.test', phone: '+9779811111111',
          emailVerified: true, phoneVerified: true, captureAvailable: false,
        }),
      });
    if (path.startsWith('/api/forms/'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            formId: decodeURIComponent(path.split('/').at(-1)!),
            version: 1,
            publishedAt: 1,
            fields: path.endsWith('staff.promo-code')
              ? [
                  {
                    id: 'context_note',
                    key: 'context_note',
                    type: 'short_text',
                    label: 'Context note',
                    required: true,
                    status: 'active',
                    order: 0,
                  },
                ]
              : path.endsWith('commerce.checkout') && checkoutContext
                ? [
                    {
                      id: 'gift_note',
                      key: 'gift_note',
                      type: 'short_text',
                      label: 'Gift note',
                      required: false,
                      status: 'active',
                      order: 0,
                    },
                  ]
                : [],
          },
        }),
      });
    if (path === '/api/cart')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: emptyCart
            ? []
            : [
                {
                  id: 'line-a',
                  sellerId: 'seller-a',
                  nameEn: 'Fictional item',
                  tradingName: 'Fictional seller',
                  pricePaisa: 10000,
                  quantity: 1,
                  preparationDays: 1,
                },
              ],
          itemSubtotalPaisa: emptyCart ? 0 : 10000,
          itemCount: emptyCart ? 0 : 1,
          hasUnavailableItems: false,
        }),
      });
    if (
      path === '/api/admin/promo-codes' &&
      route.request().method() === 'GET'
    ) {
      if (url.searchParams.get('view') === 'history' && holdHistory) {
        histories.push(route);
        return;
      }
      if (
        url.searchParams.get('view') !== 'history' &&
        url.searchParams.has('campaignId') &&
        failDetail
      )
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Detail fixture unavailable' }),
        });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.searchParams.get('view') === 'history'
            ? {
                redemptions: [
                  {
                    redemptionId: 'r-a',
                    orderId: 'order-a',
                    revision: 1,
                    discountPaisa: 1000,
                    createdAt: 1000,
                  },
                ],
                nextCursor: null,
              }
            : url.searchParams.has('campaignId')
              ? state
              : { campaigns: [state], nextCursor: null },
        ),
      });
    }
    if (path.startsWith('/api/')) {
      requests.push({
        path,
        body: JSON.parse(route.request().postData() ?? '{}'),
      });
      if (path === '/api/checkout' && loseOrderResponse) return route.abort();
      if (path === '/api/checkout/promo') {
        if (quoteUnavailable)
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Campaign paused or expired',
              code: 'unavailable',
            }),
          });
        if (hold) {
          quotes.push(route);
          return;
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(quote(String(requests.at(-1)!.body.code))),
        });
      }
      if (adminResponse.status === 0 && path === '/api/admin/promo-codes')
        return route.abort();
      return route.fulfill({
        status: path === '/api/checkout' ? 503 : adminResponse.status,
        contentType: 'application/json',
        body: JSON.stringify(
          path === '/api/checkout'
            ? { error: 'Order fixture uncertain' }
            : adminResponse.body,
        ),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<title>Promo fixture</title><div id="root"></div>',
    });
  });
  await page.goto('https://promo-ui.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return {
    browser,
    page,
    requests,
    quotes,
    histories,
    holdHistory() {
      holdHistory = true;
    },
    failDetail() {
      failDetail = true;
    },
    errors,
    reads,
    async reload() {
      await page.goto('https://promo-ui.test/');
      await page.evaluate((balance: number) => {
        (
          window as unknown as { fixtureWalletBalance: number }
        ).fixtureWalletBalance = balance;
      }, walletBalance);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
    },
    spendWallet() {
      walletBalance = 0;
    },
    emptyCart() {
      emptyCart = true;
    },
    pauseQuotes() {
      quoteUnavailable = true;
    },
    loseOrder() {
      loseOrderResponse = true;
    },
    recoverOrder() {
      loseOrderResponse = false;
    },
    hold() {
      hold = true;
    },
    respond(status: number, body: object) {
      adminResponse = { status, body };
    },
  };
}
function quote(code: string, revision = 1, discountPaisa = 1000) {
  return {
    campaignId: 'campaign-a',
    revision,
    code,
    label: 'Fictional savings',
    discountPaisa,
    subtotalPaisa: 10000,
    expiresAt: 253402300799999,
    minimumSubtotalPaisa: 0,
    quoteIntent: 'a'.repeat(64),
  };
}
async function apply(h: Awaited<ReturnType<typeof mounted>>, code = 'SAVE10') {
  await h.page.getByLabel('Promo code').fill(code);
  await h.page
    .getByRole('button', { name: 'Apply promo', exact: true })
    .click();
}
async function place(h: Awaited<ReturnType<typeof mounted>>) {
  await h.page.getByRole('checkbox').last().press('Space');
  await h.page
    .getByRole('button', { name: 'Place COD order', exact: true })
    .click();
  await h.page.getByText('Order fixture uncertain').waitFor();
}
void test('obsolete quote cannot restore a removed code', async () => {
  const h = await mounted();
  try {
    h.hold();
    await apply(h);
    await h.page.waitForFunction(() =>
      document.querySelector('[data-promo-loading]'),
    );
    await h.page
      .getByRole('button', { name: 'Remove promo', exact: true })
      .click();
    assert.equal(h.quotes.length, 1);
    await h.quotes[0].fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(quote('SAVE10')),
    });
    await h.page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        ),
    );
    assert.equal(
      await h.page
        .locator('[data-promo-discount-paisa]')
        .getAttribute('data-promo-discount-paisa'),
      '0',
    );
    await place(h);
    assert.equal(
      h.requests.find((r) => r.path === '/api/checkout')!.body.promoCode,
      undefined,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
void test('newer quote wins; apply/remove and referral exclusion update real checkout body and summary', async () => {
  const h = await mounted();
  try {
    h.hold();
    await apply(h, 'SAVE10');
    await apply(h, 'SAVE20');
    await h.page.waitForFunction(() =>
      document.querySelector('[data-promo-loading]'),
    );
    assert.equal(h.quotes.length, 2);
    await h.quotes[1].fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(quote('SAVE20', 2, 2000)),
    });
    await h.page.getByText(/Applied SAVE20/).waitFor();
    await h.quotes[0].fulfill({
      status: 409,
      contentType: 'application/json',
      body: '{"error":"Old quote failed","code":"stale"}',
    });
    await h.page.getByLabel('Have a friend’s referral code?').fill('FRIEND');
    await h.page.getByText(/cannot be combined/).waitFor();
    assert.equal(
      await h.page
        .locator('[data-promo-discount-paisa]')
        .getAttribute('data-promo-discount-paisa'),
      '2000',
    );
    await place(h);
    const body = h.requests.find((r) => r.path === '/api/checkout')!.body;
    assert.equal(body.promoCode, 'SAVE20');
    assert.equal(body.promoRevision, 2);
    assert.equal(body.referralCode, '');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
void test('admin keyboard submission retains exact uncertain intent, requires explicit new attempt, and separates form/domain stale', async () => {
  const h = await mounted('admin');
  try {
    const form = h.page.locator('form[data-form-id="staff.promo-code"]');
    await form.getByLabel('Reason').fill('Fictional update');
    await form.getByLabel('Context note').fill('Fictional context');
    await form
      .getByRole('button', { name: 'Save draft', exact: true })
      .press('Enter');
    await form.getByText('Uncertain fixture result').waitFor();
    assert.equal(h.requests.length, 1);
    const first = h.requests[0].body;
    assert.equal(first.expectedVersion, 3);
    assert.equal(first.formVersion, 1);
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await form.getByText('Uncertain fixture result').waitFor();
    assert.deepEqual(h.requests[1].body, first);
    await form.getByLabel('Reason').fill('Changed reason');
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await form.getByText(/differs from the prior attempt/i).waitFor();
    assert.equal(h.requests.length, 2);
    h.page.once('dialog', (dialog) => dialog.accept());
    await form
      .getByRole('button', { name: 'Start a new attempt', exact: true })
      .click();
    h.respond(409, { error: 'Campaign changed', code: 'stale' });
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await form.getByText(/Campaign changed/).waitFor();
    assert.notEqual(h.requests[2].body.requestId, first.requestId);
    assert.equal(
      await form
        .getByRole('button', { name: 'Save draft', exact: true })
        .isEnabled(),
      true,
    );
    h.respond(409, { error: 'Form changed', code: 'stale_version' });
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await form.getByText(/This form changed/).waitFor();
    assert.equal(
      await form
        .getByRole('button', { name: 'Save draft', exact: true })
        .isDisabled(),
      true,
    );
    assert.ok(
      (await h.page.evaluate(() => Object.values(sessionStorage))).every(
        (v) => /^[0-9a-f-]{36}$/i.test(v) || /^\d+$/.test(v),
      ),
      'only opaque IDs and optimistic versions stored',
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
void test('finite admin controls, published/draft/version counters and privacy-safe history are rendered', async () => {
  const h = await mounted('admin');
  try {
    await h.page
      .getByText('Live financial revision: 1', { exact: true })
      .waitFor();
    await h.page
      .getByText('Draft financial revision: 2', { exact: true })
      .waitFor();
    for (const label of [
      'Total use limit',
      'Per customer use limit',
      'Lifetime budget (NPR)',
      'Ends at (Nepal time)',
    ])
      assert.equal(await h.page.getByLabel(label).getAttribute('required'), '');
    await h.page.getByText(/Cancellation and refunds do not restore/).waitFor();
    await h.page
      .getByRole('button', { name: 'Load usage history', exact: true })
      .click();
    await h.page.getByText('order-a', { exact: true }).waitFor();
    assert.equal(await h.page.getByText(/buyer@example/).count(), 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
void test('unauthorized, guest and unmounted surfaces perform no hidden promo fetch', async () => {
  for (const surface of ['admin-denied', 'guest', 'empty']) {
    const h = await mounted(surface);
    try {
      await h.page.evaluate(
        () =>
          new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          ),
      );
      assert.equal(h.requests.length, 0);
      assert.ok(!h.reads.includes('/api/forms/staff.promo-code'));
      assert.ok(!h.reads.includes('/api/forms/commerce.promo-quote'));
      if (surface === 'empty') assert.equal(h.reads.length, 0);
      assert.equal(
        await h.page
          .getByRole('button', { name: 'Apply promo', exact: true })
          .count(),
        0,
      );
      assert.deepEqual(h.errors, []);
    } finally {
      await h.browser.close();
    }
  }
});

void test('malformed administrative success retains the exact original attempt until verified', async () => {
  const h = await mounted('admin');
  try {
    const form = h.page.locator('form[data-form-id="staff.promo-code"]');
    await form.getByLabel('Reason').fill('Fictional review');
    await form.getByLabel('Context note').fill('Fictional context');
    h.respond(200, { ...state, terms: { ...terms, fixedPaisa: 1.5 } });
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await form.getByText(/result could not be verified/).waitFor();
    const first = h.requests[0].body;
    h.respond(503, { error: 'Uncertain fixture result' });
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await form.getByText('Uncertain fixture result').waitFor();
    assert.deepEqual(h.requests[1].body, first);
  } finally {
    await h.browser.close();
  }
});
void test('lost admin responses and reload retain request identity and optimistic version; verified success clears only that attempt', async () => {
  const h = await mounted('admin');
  try {
    async function fill() {
      const form = h.page.locator('form[data-form-id="staff.promo-code"]');
      await form.getByLabel('Reason').fill('Fictional review');
      await form.getByLabel('Context note').fill('Fictional context');
      return form;
    }
    let form = await fill();
    h.respond(0, {});
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await form.getByRole('alert').waitFor();
    const first = h.requests[0].body;
    await h.reload();
    form = await fill();
    h.respond(503, { error: 'Uncertain fixture result' });
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await form.getByText('Uncertain fixture result').waitFor();
    assert.deepEqual(h.requests[1].body, first);
    h.respond(200, { ...state, version: 4, revision: 3, draftRevision: 3 });
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await h.page
      .getByText('Draft saved. Review and publish separately.')
      .waitFor();
    assert.equal(
      (await h.page.evaluate(() => Object.values(sessionStorage))).includes(
        String(first.requestId),
      ),
      false,
    );
  } finally {
    await h.browser.close();
  }
});
void test('changed quote requires explicit confirmation and keyboard rejection cannot submit obsolete discount', async () => {
  const h = await mounted();
  try {
    await apply(h);
    await h.page.getByText(/Applied SAVE10/).waitFor();
    h.hold();
    await h.page
      .getByRole('button', { name: 'Apply promo', exact: true })
      .press('Space');
    h.page.once('dialog', (dialog) => dialog.dismiss());
    await h.page.waitForFunction(
      () => !!document.querySelector('[data-promo-loading]'),
    );
    await h.quotes[0].fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(quote('SAVE10', 2, 2000)),
    });
    await h.page.getByText(/Changed promo terms were not accepted/).waitFor();
    assert.equal(
      await h.page
        .locator('[data-promo-discount-paisa]')
        .getAttribute('data-promo-discount-paisa'),
      '0',
    );
    await place(h);
    assert.equal(
      h.requests.find((r) => r.path === '/api/checkout')!.body.promoCode,
      undefined,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('finite required limits block empty submission and publish/pause require a confirmed real keyboard action', async () => {
  const h = await mounted('admin');
  try {
    const form = h.page.locator('form[data-form-id="staff.promo-code"]');
    await form.getByLabel('Reason').fill('Fictional review');
    await form.getByLabel('Context note').fill('Fictional context');
    await form.getByLabel('Total use limit').fill('');
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    assert.equal(h.requests.length, 0);
    await form.getByLabel('Total use limit').fill('10');
    await form.getByLabel('Operation').selectOption('publish');
    h.page.once('dialog', (dialog) => dialog.dismiss());
    await form
      .getByRole('button', { name: 'Publish draft', exact: true })
      .press('Enter');
    assert.equal(h.requests.length, 0);
    h.page.once('dialog', (dialog) => dialog.accept());
    await form
      .getByRole('button', { name: 'Publish draft', exact: true })
      .press('Space');
    await form.getByText('Uncertain fixture result').waitFor();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].body.action, 'publish');
    assert.equal(h.requests[0].body.terms, undefined);
    await form.getByLabel('Operation').selectOption('pause');
    h.page.once('dialog', (dialog) => dialog.accept());
    await form
      .getByRole('button', { name: 'Pause campaign', exact: true })
      .click();
    await form.getByText('Uncertain fixture result').waitFor();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].body.action, 'pause');
    assert.notEqual(h.requests[0].body.requestId, h.requests[1].body.requestId);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
void test('explicitly accepted changed quote submits the new revision and caps credit after merchandise discount', async () => {
  const h = await mounted();
  try {
    await apply(h);
    await h.page.getByText(/Applied SAVE10/).waitFor();
    h.hold();
    await h.page
      .getByRole('button', { name: 'Apply promo', exact: true })
      .press('Enter');
    h.page.once('dialog', (dialog) => dialog.accept());
    await h.page.waitForFunction(
      () => !!document.querySelector('[data-promo-loading]'),
    );
    await h.quotes[0].fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(quote('SAVE10', 2, 9000)),
    });
    await h.page.getByText(/Applied SAVE10/).waitFor();
    await h.page.getByRole('checkbox').first().press('Space');
    assert.equal(
      await h.page
        .locator('[data-promo-discount-paisa]')
        .getAttribute('data-promo-discount-paisa'),
      '9000',
    );
    await place(h);
    const body = h.requests.find((r) => r.path === '/api/checkout')!.body;
    assert.equal(body.promoRevision, 2);
    assert.equal(body.useWallet, true);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
void test('an uncertain checkout retries the exact intent even after the displayed quote expires', async () => {
  const h = await mounted();
  try {
    await apply(h);
    await h.page.getByText(/Applied SAVE10/).waitFor();
    await place(h);
    const first = h.requests.find((r) => r.path === '/api/checkout')!.body;
    await h.page.evaluate(() => {
      Date.now = () => 253402300800000;
    });
    await Promise.all([
      h.page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/checkout',
      ),
      h.page
        .getByRole('button', { name: 'Place COD order', exact: true })
        .click(),
    ]);
    assert.equal(
      h.requests.filter((r) => r.path === '/api/checkout').length,
      2,
    );
    assert.deepEqual(
      h.requests.filter((r) => r.path === '/api/checkout')[1].body,
      first,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('lost promo checkout response survives reload and unavailable campaign with exact retained replay', async () => {
  const h = await mounted('checkout', true);
  try {
    await apply(h);
    await h.page.getByText(/Applied SAVE10/).waitFor();
    await h.page.getByLabel('Gift note').fill('Fictional personal gift note');
    h.loseOrder();
    await h.page.getByRole('checkbox').last().press('Space');
    await h.page
      .getByRole('button', { name: 'Place COD order', exact: true })
      .click();
    await h.page
      .locator('form[data-form-id="commerce.checkout"]')
      .getByRole('alert')
      .waitFor();
    const first = h.requests.find((r) => r.path === '/api/checkout')!.body;
    h.pauseQuotes();
    h.recoverOrder();
    await h.reload();
    await apply(h);
    await h.page.getByText('Campaign paused or expired').waitFor();
    await h.page.getByLabel('Gift note').fill('Fictional personal gift note');
    await h.page.getByRole('checkbox').last().press('Space');
    const retry = h.page.getByRole('button', {
      name: 'Retry prior order attempt',
      exact: true,
    });
    await (
      (await retry.count())
        ? retry
        : h.page.getByRole('button', { name: 'Place COD order', exact: true })
    ).click();
    await h.page.getByText('Order fixture uncertain').waitFor();
    assert.deepEqual(
      h.requests.filter((r) => r.path === '/api/checkout')[1].body,
      first,
    );
    assert.equal(
      await h.page
        .locator('[data-promo-discount-paisa]')
        .getAttribute('data-promo-discount-paisa'),
      '0',
      'retained replay is not a live current quote',
    );
    const stored = JSON.stringify(
      await h.page.evaluate(() => Object.values(sessionStorage)),
    );
    for (const privateValue of [
      'buyer@example.test',
      '9811111111',
      'Fictional Buyer',
      'Fictional locality',
      'Fictional personal gift note',
    ])
      assert.ok(!stored.includes(privateValue));
    await h.page
      .getByLabel('Municipality / rural municipality')
      .fill('Changed municipality');
    await retry.click();
    await h.page.getByText(/differs from the prior attempt/).waitFor();
    assert.equal(
      h.requests.filter((r) => r.path === '/api/checkout').length,
      2,
    );
    h.page.once('dialog', (dialog) => dialog.dismiss());
    await h.page
      .getByRole('button', { name: 'Start a new order attempt', exact: true })
      .click();
    assert.equal(await retry.count(), 1);
    h.page.once('dialog', (dialog) => dialog.accept());
    await h.page
      .getByRole('button', { name: 'Start a new order attempt', exact: true })
      .click();
    await retry.waitFor({ state: 'detached' });
    await h.page
      .getByRole('button', { name: 'Place COD order', exact: true })
      .click();
    await h.page.getByText('Order fixture uncertain').waitFor();
    const changed = h.requests.filter((r) => r.path === '/api/checkout')[2]
      .body;
    assert.notEqual(changed.idempotencyKey, first.idempotencyKey);
    assert.equal(changed.promoCode, undefined);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('lost promo checkout can replay after reload even when the completed order emptied the cart', async () => {
  const h = await mounted();
  try {
    await apply(h);
    await h.page.getByText(/Applied SAVE10/).waitFor();
    h.loseOrder();
    await h.page.getByRole('checkbox').last().press('Space');
    await h.page
      .getByRole('button', { name: 'Place COD order', exact: true })
      .click();
    await h.page
      .locator('form[data-form-id="commerce.checkout"]')
      .getByRole('alert')
      .waitFor();
    const first = h.requests.find((r) => r.path === '/api/checkout')!.body;
    h.emptyCart();
    h.pauseQuotes();
    h.recoverOrder();
    await h.reload();
    const retry = h.page.getByRole('button', {
      name: 'Retry prior order attempt',
      exact: true,
    });
    await retry.waitFor();
    await h.page.getByRole('checkbox').last().press('Space');
    await retry.click();
    await h.page.getByText('Order fixture uncertain').waitFor();
    assert.deepEqual(
      h.requests.filter((r) => r.path === '/api/checkout')[1].body,
      first,
    );
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Place COD order', exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      h.requests.filter((r) => r.path === '/api/checkout/promo').length,
      1,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('checkout storage failure prevents dispatch and malformed retained metadata cannot authorize replay', async () => {
  const h = await mounted();
  try {
    await apply(h);
    await h.page.getByText(/Applied SAVE10/).waitFor();
    await h.page.evaluate(() => {
      const original = Storage.prototype.setItem.bind(sessionStorage);
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.endsWith(':retry-metadata'))
          throw new Error('Fixture storage unavailable');
        return original(key, value);
      };
    });
    await h.page.getByRole('checkbox').last().press('Space');
    await h.page
      .getByRole('button', { name: 'Place COD order', exact: true })
      .click();
    await h.page.getByText(/No order was sent/).waitFor();
    assert.equal(
      h.requests.filter((r) => r.path === '/api/checkout').length,
      0,
    );
  } finally {
    await h.browser.close();
  }
  const malformed = await mounted();
  try {
    await apply(malformed);
    await malformed.page.getByText(/Applied SAVE10/).waitFor();
    await place(malformed);
    await malformed.page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((k) =>
        k.endsWith(':retry-metadata'),
      )!;
      const meta = JSON.parse(sessionStorage.getItem(key)!);
      sessionStorage.setItem(
        key,
        JSON.stringify({
          ...meta,
          version: 2,
          contact: 'forged-private@example.test',
        }),
      );
    });
    await malformed.reload();
    await malformed.page.getByRole('checkbox').last().press('Space');
    await malformed.page
      .getByRole('button', { name: 'Retry prior order attempt', exact: true })
      .click();
    await malformed.page
      .getByText(/retry metadata could not be verified/)
      .waitFor();
    assert.equal(
      malformed.requests.filter((r) => r.path === '/api/checkout').length,
      1,
    );
  } finally {
    await malformed.browser.close();
  }
});
void test('async checkout intent hashing guards duplicate real submits before dispatch', async () => {
  const h = await mounted();
  try {
    await apply(h);
    await h.page.getByText(/Applied SAVE10/).waitFor();
    await h.page.evaluate(() => {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      (
        window as unknown as { releaseCheckoutDigest: () => void }
      ).releaseCheckoutDigest = release;
      crypto.subtle.digest = async (algorithm, data) => {
        await gate;
        return original(algorithm, data);
      };
    });
    await h.page.getByRole('checkbox').last().press('Space');
    await h.page
      .getByRole('button', { name: 'Place COD order', exact: true })
      .click();
    await h.page
      .getByRole('button', { name: 'Placing order…', exact: true })
      .press('Enter');
    assert.equal(
      h.requests.filter((r) => r.path === '/api/checkout').length,
      0,
    );
    await h.page.evaluate(() => {
      (
        window as unknown as { releaseCheckoutDigest: () => void }
      ).releaseCheckoutDigest();
    });
    await h.page.getByText('Order fixture uncertain').waitFor();
    assert.equal(
      h.requests.filter((r) => r.path === '/api/checkout').length,
      1,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('lost promo checkout replays its original credit choice after reload with an exhausted wallet', async () => {
  const h = await mounted();
  try {
    await apply(h);
    await h.page.getByText(/Applied SAVE10/).waitFor();
    await h.page.getByRole('checkbox').first().press('Space');
    h.loseOrder();
    await h.page.getByRole('checkbox').last().press('Space');
    await h.page
      .getByRole('button', { name: 'Place COD order', exact: true })
      .click();
    await h.page
      .locator('form[data-form-id="commerce.checkout"]')
      .getByRole('alert')
      .waitFor();
    const first = h.requests.find((r) => r.path === '/api/checkout')!.body;
    assert.equal(first.useWallet, true);
    h.spendWallet();
    h.pauseQuotes();
    h.recoverOrder();
    await h.reload();
    const retry = h.page.getByRole('button', {
      name: 'Retry prior order attempt',
      exact: true,
    });
    await retry.waitFor();
    assert.equal(
      await h.page.getByRole('checkbox').first().getAttribute('aria-disabled'),
      'true',
    );
    await h.page.getByRole('checkbox').last().press('Space');
    await retry.click();
    await h.page.getByText('Order fixture uncertain').waitFor();
    assert.deepEqual(
      h.requests.filter((r) => r.path === '/api/checkout')[1].body,
      first,
    );
    await h.page.getByText(/original shopping-credit choice/).waitFor();
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

for (const competingRead of ['pagination', 'failed detail refresh']) {
  void test(`history read invalidation recovers after ${competingRead} and ignores obsolete responses`, async () => {
    const h = await mounted(
      competingRead === 'pagination' ? 'admin-paginated' : 'admin',
    );
    try {
      h.holdHistory();
      await h.page
        .getByRole('button', { name: 'Load usage history', exact: true })
        .click();
      const loading = h.page.getByRole('button', {
        name: 'Loading history…',
        exact: true,
      });
      await loading.waitFor();
      assert.equal(await loading.isDisabled(), true);
      assert.equal(h.histories.length, 1);
      if (competingRead === 'pagination') {
        const complete = h.page.waitForResponse((response) =>
          new URL(response.url()).searchParams.has('cursor'),
        );
        await h.page
          .getByRole('button', { name: 'More campaigns', exact: true })
          .click();
        await complete;
        await h.page
          .getByRole('button', { name: 'More campaigns', exact: true })
          .waitFor({ state: 'detached' });
      } else {
        h.failDetail();
        await h.page
          .getByRole('button', { name: 'Review latest campaign', exact: true })
          .click();
        await h.page
          .getByText('Latest campaign could not be loaded.', { exact: true })
          .waitFor();
      }
      const historyControl = h.page.getByRole('button', {
        name: 'Load usage history',
        exact: true,
      });
      await historyControl.waitFor();
      assert.equal(await historyControl.isEnabled(), true);
      await historyControl.click();
      await loading.waitFor();
      assert.equal(h.histories.length, 2);
      const obsoleteComplete = h.page.waitForResponse(
        (response) =>
          new URL(response.url()).searchParams.get('view') === 'history',
      );
      await h.histories[0].fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          redemptions: [
            {
              redemptionId: 'obsolete-redemption',
              orderId: 'obsolete-history-order',
              revision: 1,
              discountPaisa: 1000,
              createdAt: 1000,
            },
          ],
          nextCursor: null,
        }),
      });
      await obsoleteComplete;
      await h.page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      assert.equal(
        await h.page
          .getByText('obsolete-history-order', { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await loading.isDisabled(),
        true,
        'obsolete completion must not clear the newer history loader',
      );
      await h.histories[1].fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          redemptions: [
            {
              redemptionId: 'current-redemption',
              orderId: 'current-history-order',
              revision: 1,
              discountPaisa: 1000,
              createdAt: 1000,
            },
          ],
          nextCursor: null,
        }),
      });
      await h.page
        .getByText('current-history-order', { exact: true })
        .waitFor();
      assert.equal(await loading.count(), 0);
      assert.equal(
        await h.page
          .getByText('obsolete-history-order', { exact: true })
          .count(),
        0,
      );
      assert.deepEqual(h.errors, []);
    } finally {
      await h.browser.close();
    }
  });
}
