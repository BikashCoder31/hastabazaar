import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import type {
  FixtureBrowser,
  FixturePage,
  FixtureLocator,
} from './helpers/browser-fixture-types';
import { stubFixtureLink } from './helpers/browser-fixture-link';

interface CatalogBridge {
  status: string;
  canSubmit: boolean;
  config: { version: number } | null;
  handleSubmissionResponse(response: Response, code?: string): boolean;
}
declare global {
  interface Window {
    __resetCatalogs: Record<string, CatalogBridge>;
    __originalAttempt: string;
    __attemptKey: string;
  }
}
const origin = 'http://127.0.0.1:39731';
const targets = [
  {
    mode: 'customer',
    form: 'commerce.order-cancellation',
    subject: 'ORDER-ONE',
    reset: 'Start a new cancellation attempt',
    submit: 'Review cancellation amounts',
  },
  {
    mode: 'approve',
    form: 'staff.cancellation-review',
    subject: 'review-one:approve',
    reset: 'Start a new approval attempt',
    submit: 'Review current cancellation amounts',
  },
  {
    mode: 'reject',
    form: 'staff.cancellation-review',
    subject: 'review-one:reject',
    reset: 'Start a new rejection attempt',
    submit: 'Reject with reason',
  },
  {
    mode: 'inventory',
    form: 'seller.inventory',
    subject: 'product-one',
    reset: 'Start a new attempt',
    submit: 'Update stock',
  },
  {
    mode: 'invoice',
    form: 'staff.invoice-adjustment',
    subject: 'issue:invoice-one',
    reset: 'Start a new attempt',
    submit: 'Issue simulated document',
  },
  {
    mode: 'activation',
    form: 'staff.managed-maker-activation',
    subject: 'seller-one',
    reset: 'Start a new attempt',
    submit: 'Activate simulated route',
  },
  {
    mode: 'parcel',
    form: 'staff.parcel-control',
    subject: 'parcel-one',
    reset: 'Start a new attempt',
    submit: 'Save parcel action',
  },
  {
    mode: 'rule.create',
    form: 'staff.governance-rule-create',
    subject: 'new',
    reset: 'Start a new attempt',
    submit: 'Add rule',
  },
  {
    mode: 'promotion.create',
    form: 'staff.governance-promotion-create',
    subject: 'new',
    reset: 'Start a new attempt',
    submit: 'Submit for independent approval',
  },
  {
    mode: 'incident.create',
    form: 'staff.governance-incident-create',
    subject: 'new',
    reset: 'Start a new attempt',
    submit: 'Open incident',
  },
  {
    mode: 'incident.update',
    form: 'staff.governance-incident-update',
    subject: 'incident-one',
    reset: 'Start a new attempt',
    submit: 'Record incident update',
  },
  {
    mode: 'backup.verify',
    form: 'staff.governance-backup-verify',
    subject: 'new',
    reset: 'Start a new attempt',
    submit: 'Record verification',
  },
] as const;

async function fillFields(form: FixtureLocator) {
  const inputs = form.locator('input:not([type="hidden"]),textarea');
  for (let index = 0; index < (await inputs.count()); index++) {
    const control = inputs.nth(index),
      type = await control.getAttribute('type'),
      name = await control.getAttribute('name');
    if (type === 'checkbox' || type === 'radio') {
      await control.check();
      continue;
    }
    if (type === 'datetime-local') {
      await control.fill(
        name === 'endsAt' ? '2030-01-02T10:00' : '2030-01-01T10:00',
      );
      continue;
    }
    if (type === 'number' || name === 'amount') {
      await control.fill('2');
      continue;
    }
    await control.fill(
      type === 'email' || name === 'riderEmail'
        ? 'fictional@hastabazaar.local'
        : name === 'code'
          ? 'FICTIONAL_RULE'
          : 'Fictional reviewed context',
    );
  }
}
async function fieldValues(form: FixtureLocator) {
  return form.evaluate((element) =>
    Array.from(
      element.querySelectorAll('input:not([type="hidden"]),textarea,select'),
    ).map((field) => ({
      name: field.getAttribute('name'),
      id: field.id,
      value: (field as HTMLInputElement).value,
      checked: field instanceof HTMLInputElement ? field.checked : undefined,
    })),
  );
}

void test('twelve warned reset branches refresh only the stale real catalog, preserving fields and cancellation', async () => {
  const playwrightPath =
    process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = (await import(playwrightPath)) as {
    chromium: {
      launch(options: {
        headless: boolean;
        executablePath: string;
      }): Promise<FixtureBrowser>;
    };
  };
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      sourcefile: 'stale-reset-fixture.tsx',
      loader: 'tsx',
      contents: `
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {CustomerOrderCancellation} from './components/commerce/customer-order-cancellation';
  import {CancellationReviewControl} from './components/admin/cancellation-review-control';
  import {InventoryEditor} from './components/seller/inventory-editor';
  import {InvoiceAdjustmentForm} from './components/admin/invoice-adjustment-form';
  import {ManagedMakerActivationForm} from './components/admin/managed-maker-activation-form';
  import {ParcelControls} from './components/admin/parcel-controls';
  import {GovernanceConsole} from './components/admin/governance-console';
  import {getOrCreateSessionAttempt,sessionAttemptKey} from './lib/forms/client-attempt';
  const query=new URLSearchParams(location.search);const mode=query.get('mode');
  window.__attemptKey=sessionAttemptKey(query.get('form'),query.get('subject'));
  window.__originalAttempt=getOrCreateSessionAttempt(window.__attemptKey);
  const data={users:[],rules:[],products:[],promotions:[],backups:[],incidents:[{id:'incident-one',referenceNumber:'INC-1',title:'Fictional incident',severity:'medium',status:'open'}]};
  const parcel={id:'parcel-one',sellerName:'Fictional Seller',status:'prepared',method:'courier',version:1,codDuePaisa:10000,collectedPaisa:0,remittedPaisa:0,courierCostPaisa:0};
  const element=mode==='customer'?<CustomerOrderCancellation orderNumber="ORDER-ONE"/>
   :mode==='approve'||mode==='reject'?<CancellationReviewControl reviewId="review-one"/>
   :mode==='inventory'?<InventoryEditor productId="product-one" quantity={1} productName="Fictional Product"/>
   :mode==='invoice'?<InvoiceAdjustmentForm invoices={[{id:'invoice-one',invoiceNumber:'INV-1',issuerReference:'SIM-ISSUER',adjustmentCount:0}]} reasonCodes={['defect']}/>
   :mode==='activation'?<ManagedMakerActivationForm sellerId="seller-one"/>
   :mode==='parcel'?<ParcelControls orderId="order-one" parcels={[parcel]} records={[]} compensation={[]} actorId="staff-one" canPrepare={false}/>
   :<GovernanceConsole data={data} superAdmin={true} actorId="staff-one"/>;
  createRoot(document.getElementById('root')).render(element);
 `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'stale-reset-fixture-boundaries',
        setup(bundler) {
          stubFixtureLink(bundler);
          bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: 'navigation',
            namespace: 'fixture',
          }));
          bundler.onResolve(
            { filter: /^@\/components\/forms\/form-config-client$/ },
            () => ({ path: 'catalog', namespace: 'fixture' }),
          );
          bundler.onResolve({ filter: /^@\/components\/ui\/tabs$/ }, () => ({
            path: 'tabs',
            namespace: 'fixture',
          }));
          bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            loader: 'tsx',
            resolveDir: process.cwd(),
            contents:
              args.path === 'navigation'
                ? 'export function useRouter(){return {refresh(){}}}'
                : args.path === 'tabs'
                  ? `import React from 'react';export const Tabs=({children})=><div>{children}</div>;export const TabsContent=Tabs;export const TabsList=Tabs;export const TabsTrigger=({children})=><button type="button">{children}</button>;`
                  : `import {usePublishedFormConfig as real} from './components/forms/form-config-client';export function usePublishedFormConfig(id){const value=real(id);window.__resetCatalogs??={};window.__resetCatalogs[id]=value;return value;}`,
          }));
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
  try {
    for (const target of targets) {
      const page: FixturePage = await browser.newPage();
      let reads = 0,
        hold = false,
        release: (() => Promise<void>) | undefined;
      const bodies: Record<string, unknown>[] = [];
      try {
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname.startsWith('/api/forms/')) {
            const id = decodeURIComponent(url.pathname.split('/').at(-1)!);
            if (id === target.form) reads++;
            const send = () =>
              route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  config: {
                    formId: id,
                    version: id === target.form ? reads : 1,
                    publishedAt: 1,
                    fields: [
                      {
                        id: 'context_note',
                        key: 'context_note',
                        label: 'Reset context',
                        type: 'short_text',
                        required: true,
                        order: 0,
                        status: 'active',
                      },
                    ],
                  },
                }),
              });
            if (hold && id === target.form) {
              await new Promise<void>((resolve) => {
                release = async () => {
                  await send();
                  resolve();
                };
              });
              return;
            }
            return send();
          }
          if (
            target.mode === 'customer' &&
            route.request().method() === 'GET' &&
            url.pathname.endsWith('/cancel')
          )
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                choices: [
                  {
                    id: 'seller-one',
                    name: 'Fictional Seller',
                    eligible: true,
                    reviewRequired: false,
                  },
                ],
              }),
            });
          if (route.request().method() !== 'GET') {
            const body = JSON.parse(
              route.request().postData() ?? '{}',
            ) as Record<string, unknown>;
            bodies.push(body);
            if (body.action === 'preview')
              return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  fingerprint: 'a'.repeat(64),
                  reviewRequired: false,
                  walletRestored: 0,
                  discountRemoved: 0,
                  delivery: 0,
                  total: 100,
                  collected: 0,
                  deliveryPricingPolicy: null,
                }),
              });
            return route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: '{"error":"Fictional retained attempt"}',
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<div id="root"></div>',
          });
        });
        await page.goto(
          origin +
            '/?' +
            new URLSearchParams({
              mode: target.mode,
              form: target.form,
              subject: target.subject,
            }),
        );
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        if (target.mode === 'customer')
          await page
            .getByRole('button', { name: 'Cancel order or seller parcels' })
            .click();
        const form = page
          .locator('form[data-form-id="' + target.form + '"]')
          .first();
        await form.waitFor();
        await page.waitForFunction(
          (id) => window.__resetCatalogs?.[id]?.status === 'ready',
          target.form,
        );
        await fillFields(form);
        const initial = await page.evaluate(() => window.__originalAttempt),
          preserved = await fieldValues(form);
        const reset = form.getByRole('button', {
          name: target.reset,
          exact: true,
        });
        await reset.waitFor();
        await page.evaluate(
          (id) =>
            window.__resetCatalogs[id].handleSubmissionResponse(
              new Response(null, { status: 409 }),
              'stale_version',
            ),
          target.form,
        );
        await page.waitForFunction(
          (id) => window.__resetCatalogs[id].status === 'stale',
          target.form,
        );
        const submit = form.getByRole('button', {
          name: target.submit,
          exact: true,
        });
        assert.equal(
          await submit.isDisabled(),
          true,
          target.mode + ': real stale catalog freezes submission',
        );
        page.once('dialog', (dialog) => void dialog.dismiss());
        await reset.click();
        assert.equal(
          reads,
          1,
          target.mode + ': cancelled reset does not fetch',
        );
        assert.equal(
          await page.evaluate(() =>
            sessionStorage.getItem(window.__attemptKey),
          ),
          initial,
        );
        assert.deepEqual(await fieldValues(form), preserved);
        hold = true;
        page.once('dialog', (dialog) => void dialog.accept());
        await reset.click();
        await page.waitForTimeout(60);
        assert.equal(
          reads,
          2,
          target.mode + ': accepted stale reset fetches selected catalog',
        );
        await page.waitForFunction(
          (id) => window.__resetCatalogs[id].status === 'loading',
          target.form,
        );
        assert.equal(
          await submit.isDisabled(),
          true,
          target.mode + ': loading remains disabled',
        );
        assert.equal(
          await page.evaluate(() =>
            sessionStorage.getItem(window.__attemptKey),
          ),
          null,
        );
        assert.deepEqual(await fieldValues(form), preserved);
        assert.ok(release);
        await release();
        await page.waitForFunction(
          (id) => window.__resetCatalogs[id].status === 'ready',
          target.form,
        );
        assert.equal(
          await submit.isDisabled(),
          false,
          target.mode + ': refreshed version is available',
        );
        assert.deepEqual(await fieldValues(form), preserved);
        if (target.mode === 'customer' || target.mode === 'approve') {
          await submit.click();
          await page.waitForTimeout(40);
          await form
            .getByRole('button', {
              name:
                target.mode === 'customer'
                  ? 'Confirm cancellation and revised amount'
                  : 'Approve reviewed cancellation',
              exact: true,
            })
            .click();
        } else if (target.mode === 'reject') await submit.click();
        else
          await form.evaluate((element) =>
            (element as HTMLFormElement).requestSubmit(),
          );
        await page.waitForTimeout(70);
        assert.ok(bodies.length, target.mode + ': actual handler submitted');
        assert.equal(bodies.at(-1)?.formVersion, 2);
        const renewed = await page.evaluate(() =>
          sessionStorage.getItem(window.__attemptKey),
        );
        assert.ok(renewed);
        assert.notEqual(
          renewed,
          initial,
          target.mode + ': fresh opaque attempt retained on known failure',
        );
        assert.match(renewed, /^[0-9a-f-]{36}$/i);
        assert.deepEqual(
          await page.evaluate(() => Object.values(sessionStorage)),
          [renewed],
          target.mode + ': storage contains only opaque identity',
        );
      } finally {
        if (release) await release().catch(() => undefined);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
