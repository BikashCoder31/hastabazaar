import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import type { PromoState } from '../lib/incentives/types';
import type {
  FixtureBrowser,
  FixturePage,
} from './helpers/browser-fixture-types';

const original: PromoState = {
  campaignId: 'fictional-a',
  version: 3,
  revision: 2,
  draftRevision: 2,
  publishedRevision: 1,
  paused: false,
  usedCount: 2,
  spentPaisa: 2000,
  maximumCustomerUsedCount: 1,
  terms: {
    code: 'SAVE10',
    label: 'Fictional savings',
    kind: 'fixed',
    fixedPaisa: 1000,
    minimumSubtotalPaisa: 0,
    startsAt: Date.parse('2026-10-14T04:15:32.123Z'),
    endsAt: Date.parse('2026-10-15T04:15:59.999Z'),
    totalUseLimit: 10,
    perCustomerUseLimit: 2,
    budgetPaisa: 10000,
  },
};
const second: PromoState = {
  ...original,
  campaignId: 'fictional-b',
  version: 1,
  revision: 1,
  publishedRevision: null,
  draftRevision: 1,
  terms: {
    code: 'SAVE20',
    label: 'Fictional percentage',
    kind: 'percentage',
    percentBps: 1235,
    maxDiscountPaisa: 2099,
    minimumSubtotalPaisa: 0,
    startsAt: original.terms.startsAt,
    endsAt: original.terms.endsAt,
    totalUseLimit: 10,
    perCustomerUseLimit: 2,
    budgetPaisa: 10000,
  },
};
async function fixture() {
  const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ??
      'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  );
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {PromoCodeManager} from './components/admin/promo-code-manager';
      createRoot(document.getElementById('root')).render(<PromoCodeManager actorId={'reviewer'} role="super_admin"
        initialPage={{campaigns:[${JSON.stringify(original)}],nextCursor:'fictional-next'}} defaultCommissionBps={900}/>);
    `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'promo-editor-router',
        setup(bundler) {
          bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: 'router',
            namespace: 'fixture',
          }));
          bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            loader: 'js',
            contents:
              'export function useRouter(){return {refresh(){window.promoReportRefreshes=(window.promoReportRefreshes??0)+1}}}',
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
  const page = (await browser.newPage()) as FixturePage;
  const requests: Record<string, unknown>[] = [];
  let response = {
    status: 503,
    body: { error: 'Fictional uncertain result' } as unknown,
  };
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    assert.equal(url.origin, 'https://promo-editor.test');
    if (url.pathname === '/api/forms/staff.promo-code')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            formId: 'staff.promo-code',
            version: 1,
            publishedAt: 1,
            fields: [
              {
                id: 'context_note',
                key: 'context_note',
                type: 'short_text',
                label: 'Context note',
                required: true,
                status: 'active',
                order: 0,
              },
            ],
          },
        }),
      });
    if (
      url.pathname === '/api/admin/promo-codes' &&
      request.method() === 'POST'
    ) {
      requests.push(JSON.parse(request.postData() ?? '{}'));
      return route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      });
    }
    if (url.pathname === '/api/admin/promo-codes')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.searchParams.has('cursor')
            ? { campaigns: [second], nextCursor: null }
            : original,
        ),
      });
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<div id="root"></div>',
    });
  });
  await page.goto('https://promo-editor.test/');
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  await page.getByLabel('Context note').waitFor();
  return {
    browser,
    page,
    requests,
    respond(status: number, body: unknown) {
      response = { status, body };
    },
  };
}

void test('unsaved fixed and percentage discounts recalculate with sample subtotal and assumed commission without posting', async () => {
  const h = await fixture();
  try {
    await h.page.getByLabel('Fixed discount (NPR)').fill('125.50');
    await h.page.waitForFunction(() =>
      document.querySelector('[data-promo-preview-discount-paisa="12550"]'),
    );
    assert.equal(
      await h.page
        .locator('[data-promo-preview-contribution-paisa]')
        .getAttribute('data-promo-preview-contribution-paisa'),
      '-3550',
    );
    await h.page
      .getByRole('alert')
      .getByText(/discount exceeds/)
      .waitFor();
    await h.page.getByLabel('Sample products subtotal (NPR)').fill('2000.00');
    await h.page.waitForFunction(() =>
      document.querySelector('[data-promo-preview-contribution-paisa="5450"]'),
    );
    await h.page.getByLabel('Minimum products subtotal (NPR)').fill('2000.01');
    await h.page.waitForFunction(() =>
      document.querySelector('[data-promo-preview-discount-paisa="0"]'),
    );
    await h.page.getByText(/below the draft minimum/).waitFor();
    await h.page.getByLabel('Discount kind').selectOption('percentage');
    await h.page.getByLabel('Discount percentage (%)').fill('12.35');
    await h.page.getByLabel('Maximum discount (NPR)').fill('99.99');
    await h.page.getByLabel('Minimum products subtotal (NPR)').fill('1000');
    await h.page.getByLabel('Assumed seller commission (%)').fill('7.50');
    await h.page.waitForFunction(() =>
      document.querySelector('[data-promo-preview-discount-paisa="9999"]'),
    );
    assert.equal(
      await h.page
        .locator('[data-promo-preview-commission-paisa]')
        .getAttribute('data-promo-preview-commission-paisa'),
      '15000',
    );
    assert.equal(
      await h.page
        .locator('[data-promo-preview-contribution-paisa]')
        .getAttribute('data-promo-preview-contribution-paisa'),
      '5001',
    );
    assert.equal(h.requests.length, 0);
  } finally {
    await h.browser.close();
  }
});

void test('NPR draft submission retains exact uncertain attempt and refreshes reports only after a verified result', async () => {
  const h = await fixture();
  try {
    await h.page.getByLabel('Fixed discount (NPR)').fill('125.50');
    await h.page.getByLabel('Minimum products subtotal (NPR)').fill('0.29');
    await h.page.getByLabel('Lifetime budget (NPR)').fill('1000.90');
    await h.page.getByLabel('Sample products subtotal (NPR)').fill('1.001');
    await h.page.waitForFunction(
      () => !document.querySelector('[data-promo-preview-discount-paisa]'),
    );
    await h.page.getByLabel('Reason').fill('Fictional draft update');
    await h.page.getByLabel('Context note').fill('Fictional context');
    await h.page
      .getByRole('button', { name: 'Save draft', exact: true })
      .click();
    await h.page.getByText('Fictional uncertain result').waitFor();
    assert.equal(h.requests.length, 1);
    const submitted = h.requests[0];
    assert.deepEqual(submitted.terms, {
      ...original.terms,
      fixedPaisa: 12550,
      minimumSubtotalPaisa: 29,
      budgetPaisa: 100090,
    });
    assert.equal(submitted.expectedVersion, 3);
    assert.equal(submitted.formVersion, 1);
    assert.equal(
      await h.page.evaluate(
        () =>
          (window as unknown as { promoReportRefreshes?: number })
            .promoReportRefreshes ?? 0,
      ),
      0,
    );
    h.respond(200, {
      ...original,
      version: 4,
      revision: 3,
      draftRevision: 3,
      terms: submitted.terms,
    });
    await h.page
      .getByRole('button', { name: 'Save draft', exact: true })
      .click();
    await h.page
      .getByText('Draft saved. Review and publish separately.')
      .waitFor();
    assert.deepEqual(h.requests[1], submitted);
    assert.equal(
      await h.page.evaluate(
        () =>
          (window as unknown as { promoReportRefreshes?: number })
            .promoReportRefreshes ?? 0,
      ),
      1,
    );
    assert.equal(
      await h.page.getByText(/An attempt reference is retained/).count(),
      0,
    );
  } finally {
    await h.browser.close();
  }
});

void test('loaded campaign search and pagination select the correct draft and reset displayed controls', async () => {
  const h = await fixture();
  try {
    const table = h.page.getByRole('table', { name: 'Loaded campaigns' });
    await h.page.getByLabel('Search loaded campaigns').fill('SAVE20');
    assert.equal(await table.getByRole('button').count(), 0);
    await h.page
      .getByRole('button', { name: 'More campaigns', exact: true })
      .click();
    await table.getByRole('button', { name: 'Manage SAVE20' }).waitFor();
    assert.equal(await table.getByRole('button').count(), 1);
    await table.getByRole('button', { name: 'Manage SAVE20' }).click();
    assert.equal(
      await h.page.getByLabel('Discount percentage (%)').inputValue(),
      '12.35',
    );
    assert.equal(
      await h.page.getByLabel('Maximum discount (NPR)').inputValue(),
      '20.99',
    );
    assert.equal(await h.page.getByLabel('Fixed discount (NPR)').count(), 0);
    await h.page
      .getByText('Live financial revision: None', { exact: true })
      .waitFor();
    assert.equal(h.requests.length, 0);
  } finally {
    await h.browser.close();
  }
});
