import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

type TestRoute = { request(): { url(): string; postData(): string | null };
  abort(code?: string): Promise<void>;
  fulfill(options: { status: number; contentType: string; body: string }): Promise<void> };
type TestLocator = { count(): Promise<number>; first(): TestLocator;
  locator(selector: string): TestLocator; getByLabel(label: string): TestLocator;
  getByRole(role: string, options: { name: string }): TestLocator;
  fill(value: string): Promise<void>; click(): Promise<void>; isVisible(): Promise<boolean> };
type TestPage = { route(pattern: string, handler: (route: TestRoute) => Promise<void>): Promise<void>;
  goto(url: string): Promise<unknown>; reload(): Promise<unknown>;
  addScriptTag(options: { content: string }): Promise<unknown>;
  locator(selector: string): TestLocator; getByRole(role: string, options: { name: string }): TestLocator;
  evaluate<T>(fn: () => T): Promise<T>; once(event: string, handler: (dialog: { dismiss(): Promise<void>; accept(): Promise<void> }) => void): void;
  waitForTimeout(ms: number): Promise<void>; close(): Promise<void> };
type TestBrowser = { newPage(): Promise<TestPage>; close(): Promise<void> };

const supplies = [
  { id: 'proposed', status: 'proposed', paymentId: null, paymentStatus: null },
  { id: 'accepted', status: 'accepted', paymentId: null, paymentStatus: null },
  { id: 'prepared', status: 'accepted', paymentId: 'pay-prepared', paymentStatus: 'prepared' },
].map((item) => ({ productName: item.id, quantityProposed: 2, quantityAccepted: null,
  agreedUnitPaisa: 50000, acceptedTotalPaisa: null, possessionStatus: 'received',
  qualityStatus: 'accepted', evidenceReference: null, originalOwedPaisa: 100000,
  adjustedPaisa: 0, paidPaisa: 0, createdAt: 100, ...item }));
const workspace = { participationRoute: 'managed_maker', applicationStage: 'active',
  commercialModel: 'managed_fixed_supplier_price_v1', products: [], supplies,
  transitions: [{ id: 'application', status: 'submitted', legalName: 'Registered Maker', taxMode: 'PAN',
    effectiveAt: null, reviewReason: null, createdAt: 100 }] };

const cases = [
  ['staff.managed-supply-decision', 'decide_supply'],
  ['staff.managed-adjustment', 'add_adjustment'],
  ['staff.managed-payment-preparation', 'prepare_payment'],
  ['staff.managed-payment-action', 'approve_payment'],
  ['staff.managed-transition-decision', 'review_transition'],
] as const;

void test('all five managed decisions preserve opaque attempts across lost replies, reloads and edits until confirmed reset/success', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<TestBrowser> } };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'managed-retry-fixture.tsx',
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {ManagedProgramReview} from './components/admin/managed-program-review';
      createRoot(document.getElementById('root')!).render(<ManagedProgramReview sellerId="seller" workspace={${JSON.stringify(workspace)}}/>);`, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'managed-retry-stubs', setup(bundler) {
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'retry-stub' }));
      bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'retry-stub' }));
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'retry-stub' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'retry-stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
      bundler.onLoad({ filter: /^link$/, namespace: 'retry-stub' }, () => ({ resolveDir:process.cwd(),
        contents:'import React from "react";export default function Link(props){return <a {...props}/>}',loader:'tsx' }));
      bundler.onLoad({ filter: /^config$/, namespace: 'retry-stub' }, () => ({ contents: `export function usePublishedFormConfig(formId){return {config:{formId,version:1,publishedAt:1,fields:[{id:'context_note',key:'context_note',type:'short_text',label:'Staff context',required:true,order:0,status:'active'}]},status:'ready',canSubmit:true,message:'',refresh(){},handleSubmissionResponse(){window.__staleCalls=(window.__staleCalls||0)+1;return true}}}`, loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const [formId, action] of cases) {
      const page = await browser.newPage();
      const requests: Array<Record<string, unknown>> = [];
      let response: 'lost' | 'conflict' | 'stale' | 'success' = 'lost';
      try {
        await page.route('https://managed-retry.test/**', async (route: TestRoute) => {
          if (new URL(route.request().url()).pathname.startsWith('/api/admin/managed-program/')) {
            requests.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
            if (response === 'lost') return route.abort('failed');
            if (response === 'conflict') return route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Different content for prior request."}' });
            if (response === 'stale') return route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Form changed.","code":"stale_version"}' });
            return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"paymentId":"new-payment"}' });
          }
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
        });
        const mount = async () => { await page.goto('https://managed-retry.test/'); await page.addScriptTag({ content: bundle.outputFiles[0].text }); };
        await mount();
        let form = page.locator(`form[data-form-id="${formId}"]`).first();
        assert.equal(await form.count(), 1, formId);
        await form.getByLabel('Staff context').fill('SIMULATED first context');
        if (action === 'decide_supply') {
          await form.getByLabel('Evidence reference').fill('SIM-EVIDENCE');
          await form.getByLabel('Decision reason').fill('SIMULATED decision reason');
        } else if (action === 'add_adjustment') {
          await form.locator('[name="amountNpr"]').fill('10');
          await form.locator('[name="reason"]').fill('SIMULATED adjustment reason');
        } else if (action === 'review_transition')
          await form.getByLabel('Review reason').fill('SIMULATED transition reason');
        await form.getByRole('button', { name: action === 'decide_supply' ? 'Record supply decision'
          : action === 'add_adjustment' ? 'Record adjustment'
            : action === 'prepare_payment' ? 'Prepare simulated payment'
              : action === 'approve_payment' ? 'Record payment action' : 'Record transition decision' }).click();
        await page.waitForTimeout(80);
        assert.equal(requests.length, 1, `${formId}: lost response sent once`);
        const firstId = requests[0].requestId;
        assert.match(String(firstId), /^[0-9a-f-]{36}$/i);
        await mount();
        form = page.locator(`form[data-form-id="${formId}"]`).first();
        assert.equal(await form.getByRole('button', { name: 'Start a new attempt' }).count(), 1,
          `${formId}: reload must expose the pending attempt`);
        await form.getByLabel('Staff context').fill('SIMULATED changed context');
        if (action === 'decide_supply') {
          await form.getByLabel('Evidence reference').fill('SIM-EVIDENCE');
          await form.getByLabel('Decision reason').fill('SIMULATED decision reason');
        } else if (action === 'add_adjustment') {
          await form.locator('[name="amountNpr"]').fill('10');
          await form.locator('[name="reason"]').fill('SIMULATED adjustment reason');
        } else if (action === 'review_transition')
          await form.getByLabel('Review reason').fill('SIMULATED transition reason');
        response = 'conflict';
        await form.getByRole('button', { name: action === 'decide_supply' ? 'Record supply decision'
          : action === 'add_adjustment' ? 'Record adjustment'
            : action === 'prepare_payment' ? 'Prepare simulated payment'
              : action === 'approve_payment' ? 'Record payment action' : 'Record transition decision' }).click();
        await page.waitForTimeout(80);
        assert.equal(requests[1]?.requestId, firstId, `${formId}: changed retry must retain request ID`);
        assert.equal(await page.evaluate(() => (window as unknown as { __staleCalls?: number }).__staleCalls ?? 0), 0,
          `${formId}: ordinary conflict must not call stale handler`);
        response = 'stale';
        await form.getByRole('button', { name: action === 'decide_supply' ? 'Record supply decision'
          : action === 'add_adjustment' ? 'Record adjustment'
            : action === 'prepare_payment' ? 'Prepare simulated payment'
              : action === 'approve_payment' ? 'Record payment action' : 'Record transition decision' }).click();
        await page.waitForTimeout(80);
        assert.equal(requests[2]?.requestId, firstId);
        assert.equal(await page.evaluate(() => (window as unknown as { __staleCalls?: number }).__staleCalls ?? 0), 1);
        page.once('dialog', (dialog) => { void dialog.dismiss(); });
        await form.getByRole('button', { name: 'Start a new attempt' }).click();
        assert.equal(await form.getByRole('button', { name: 'Start a new attempt' }).count(), 1);
        page.once('dialog', (dialog) => { void dialog.accept(); });
        await form.getByRole('button', { name: 'Start a new attempt' }).click();
        response = 'success';
        await form.getByRole('button', { name: action === 'decide_supply' ? 'Record supply decision'
          : action === 'add_adjustment' ? 'Record adjustment'
            : action === 'prepare_payment' ? 'Prepare simulated payment'
              : action === 'approve_payment' ? 'Record payment action' : 'Record transition decision' }).click();
        await page.waitForTimeout(80);
        assert.notEqual(requests[3]?.requestId, firstId);
        assert.equal(await page.evaluate(() => Object.values(sessionStorage).some((value) =>
          typeof value === 'string' && value.includes('SIMULATED'))), false,
        `${formId}: browser storage must not contain form values`);
        await mount();
        form = page.locator(`form[data-form-id="${formId}"]`).first();
        assert.equal(await form.getByRole('button', { name: 'Start a new attempt' }).count(), 0,
          `${formId}: confirmed success clears the attempt`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
});
