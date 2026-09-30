import { stubFixtureLink } from './helpers/browser-fixture-link';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

type FixtureRoute = {
  request(): { url(): string; postData(): string | null };
  abort(reason: string): Promise<void>;
  fulfill(response: { status: number; contentType: string; body: string }): Promise<void>;
};
type FixtureDialog = { message(): string; accept(): Promise<void>; dismiss(): Promise<void> };

async function mounted(hydrate = false) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const bundle = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot,hydrateRoot} from 'react-dom/client';
    import {renderToString} from 'react-dom/server';
    import {InventoryEditor} from './components/seller/inventory-editor';
    import {InvoiceAdjustmentForm} from './components/admin/invoice-adjustment-form';
    const app = <>
      <InventoryEditor productId="product-a" quantity={3} productName="Fictional item" />
      <InventoryEditor productId="product-b" quantity={3} productName="Second fictional item" />
      <InvoiceAdjustmentForm invoices={['a','b'].map(id=>({id:'invoice-'+id,invoiceNumber:'SIM-'+id,issuerReference:'SIM',adjustmentCount:0}))} reasonCodes={['correction']} />
    </>;
    const root=document.getElementById('root');
    if(window.fixtureHydrate){
      const saved=Object.entries(sessionStorage);sessionStorage.clear();
      root.innerHTML=renderToString(app);saved.forEach(([key,value])=>sessionStorage.setItem(key,value));
      window.hydrationErrors=[];
      hydrateRoot(root,app,{onRecoverableError(error){window.hydrationErrors.push(error.message)}});
    }else createRoot(root).render(app);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
    platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'deferred-retry-stubs', setup(bundler) { stubFixtureLink(bundler);
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'stub' }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'stub' }));
      bundler.onLoad({ filter: /^config$/, namespace: 'stub' }, () => ({ contents: `
        export function usePublishedFormConfig(formId){return {config:{formId,version:1,publishedAt:1,
          fields:[{id:'context_note',key:'context_note',label:'Context',type:'short_text',required:true,order:0,status:'active'}]},
          canSubmit:true,status:'ready',message:'',handleSubmissionResponse(response,code){window.staleCalls=(window.staleCalls||0)+1;return true}}}`, loader: 'js' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  let response = { status: 503, body: '{"error":"Uncertain fixture response"}' };
  let abort = false;
  await page.route('**/*', async (route: FixtureRoute) => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, 'https://deferred-retry.test', 'all requests remain intercepted fixtures');
    if (url.pathname.startsWith('/api/')) {
      requests.push({ path: url.pathname, body: JSON.parse(route.request().postData() ?? '{}') });
      if (abort) return route.abort('failed');
      return route.fulfill({ status: response.status, contentType: 'application/json', body: response.body });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
  });
  async function reload() {
    await page.goto('https://deferred-retry.test/');
    if (hydrate) await page.evaluate(() => {
      (window as unknown as { fixtureHydrate: boolean }).fixtureHydrate = true;
      sessionStorage.setItem('hastabazaar:profile-attempt:seller.inventory:product-a', '11111111-1111-4111-8111-111111111111');
      sessionStorage.setItem('hastabazaar:profile-attempt:staff.invoice-adjustment:issue:invoice-a', '22222222-2222-4222-8222-222222222222');
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
  }
  await reload();
  return { browser, page, requests, reload,
    respond(status: number, body: object) { abort = false; response = { status, body: JSON.stringify(body) }; },
    loseResponse() { abort = true; } };
}

void test('server markup hydrates without recoverable errors before showing retained inventory and invoice warnings', async () => {
  const h = await mounted(true);
  try {
    await h.page.locator('form[data-form-id="seller.inventory"]').first().getByRole('button', { name: 'Start a new attempt' }).waitFor();
    await h.page.locator('form[data-form-id="staff.invoice-adjustment"]').getByRole('button', { name: 'Start a new attempt' }).waitFor();
    await h.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.deepEqual(await h.page.evaluate(() => (window as unknown as { hydrationErrors: string[] }).hydrationErrors), [],
      'retained opaque attempts must not change the initial server/client hydration snapshot');
    assert.equal(h.requests.length, 0);
  } finally { await h.browser.close(); }
});

void test('mounted inventory retries survive lost responses, reload, edits and error responses; reset is explicit', async () => {
  const h = await mounted();
  try {
    const form = h.page.locator('form[data-form-id="seller.inventory"]').first();
    async function fill(quantity = '5') { await form.getByRole('spinbutton').fill(quantity); await form.getByLabel(/Context/).fill('Fictional stock evidence'); }
    async function submit() { const n = h.requests.length; await form.getByRole('button', { name: 'Update stock' }).click(); await h.page.waitForFunction(() => !document.querySelector('form[data-form-id="seller.inventory"] button[type="submit"]')?.hasAttribute('disabled')); assert.equal(h.requests.length, n + 1); }
    await fill(); h.loseResponse(); await submit();
    const id = h.requests[0].body.requestId;
    await h.reload(); await fill(); await submit();
    assert.equal(h.requests[1].body.requestId, id, 'reload must retain the opaque product attempt');
    h.respond(409, { error: 'Different payload', code: 'request_id_conflict' }); await fill('6'); await submit();
    assert.equal(h.requests[2].body.requestId, id, 'edits must retain the existing request and permit a conflict');
    h.respond(400, { error: 'Invalid fixture' }); await submit();
    assert.equal(h.requests[3].body.requestId, id);
    h.respond(200, {}); await submit(); await form.getByText(/response could not be verified/i).waitFor();
    assert.equal(h.requests[4].body.requestId, id);
    const other = h.page.locator('form[data-form-id="seller.inventory"]').nth(1);
    await other.getByRole('spinbutton').fill('5'); await other.getByLabel(/Context/).fill('Other fictional evidence');
    h.respond(503, { error: 'Uncertain fixture response' }); await other.getByRole('button', { name: 'Update stock' }).click(); await other.getByText('Uncertain fixture response').waitFor();
    assert.notEqual(h.requests[5].body.requestId, id, 'products require independent attempts');
    h.page.once('dialog', (dialog: FixtureDialog) => void dialog.dismiss()); await form.getByRole('button', { name: 'Start a new attempt' }).click(); await submit();
    assert.equal(h.requests[6].body.requestId, id, 'cancelled reset keeps the reference');
    h.page.once('dialog', (dialog: FixtureDialog) => { assert.match(dialog.message(), /already|duplicate/i); void dialog.accept(); });
    await form.getByRole('button', { name: 'Start a new attempt' }).click(); await submit();
    const replacement = h.requests[7].body.requestId; assert.notEqual(replacement, id);
    h.respond(409, { error: 'Updated form', code: 'stale_version' }); await submit();
    assert.equal(await h.page.evaluate(() => (window as unknown as { staleCalls: number }).staleCalls), 1);
    h.respond(200, { quantity: 6, message: 'Inventory updated.' }); await submit(); await form.getByText('Stock saved.').waitFor();
    assert.equal((await h.page.evaluate(() => Object.values(sessionStorage))).includes(String(replacement)), false);
    const stored = await h.page.evaluate(() => Object.values(sessionStorage));
    assert.ok(stored.every((value: string) => /^[0-9a-f-]{36}$/i.test(value)), 'storage contains only opaque IDs');
  } finally { await h.browser.close(); }
});

void test('mounted invoice attempts are independent per selected invoice and retain A across B and reload', async () => {
  const h = await mounted();
  try {
    const form = h.page.locator('form[data-form-id="staff.invoice-adjustment"]');
    async function fill(note = 'Fictional invoice evidence') { await form.getByLabel('Amount (NPR)').fill('5.00'); await form.getByLabel('Review note').fill(note); await form.getByLabel(/Context/).fill('Fictional correction context'); }
    async function submit() { const n = h.requests.length; await form.getByRole('button', { name: 'Issue simulated document' }).click(); await form.getByText('Uncertain fixture response').waitFor(); assert.equal(h.requests.length, n + 1); }
    await fill(); await submit(); const a = h.requests[0].body.requestId;
    await form.locator('select[name=invoiceId]').selectOption('invoice-b'); await submit(); const b = h.requests[1].body.requestId;
    assert.notEqual(b, a, 'invoice B needs an independent request reference');
    await form.locator('select[name=invoiceId]').selectOption('invoice-a'); await submit(); assert.equal(h.requests[2].body.requestId, a);
    await fill('Fictional changed invoice evidence'); await form.getByRole('button', { name: 'Issue simulated document' }).click();
    await form.getByText(/differs from the prior attempt/i).waitFor(); assert.equal(h.requests.length, 3);
    await h.reload(); await fill(); await submit(); assert.equal(h.requests[3].body.requestId, a);
    h.page.once('dialog', (dialog: FixtureDialog) => void dialog.dismiss()); await form.getByRole('button', { name: 'Start a new attempt' }).click(); await submit(); assert.equal(h.requests[4].body.requestId, a);
    h.page.once('dialog', (dialog: FixtureDialog) => void dialog.accept()); await form.getByRole('button', { name: 'Start a new attempt' }).click(); await submit(); const replacement = h.requests[5].body.requestId; assert.notEqual(replacement, a);
    h.respond(400, { error: 'Invalid fixture' }); await form.getByRole('button', { name: 'Issue simulated document' }).click(); await form.getByText('Invalid fixture').waitFor(); assert.equal(h.requests[6].body.requestId, replacement);
    h.respond(409, { error: 'State fixture conflict', code: 'request_id_conflict' }); await form.getByRole('button', { name: 'Issue simulated document' }).click(); await form.getByText('State fixture conflict').waitFor(); assert.equal(h.requests[7].body.requestId, replacement);
    assert.equal(await h.page.evaluate(() => (window as unknown as { staleCalls?: number }).staleCalls ?? 0), 0);
    h.respond(200, {}); await form.getByRole('button', { name: 'Issue simulated document' }).click(); await form.getByText(/response could not be verified/i).waitFor(); assert.equal(h.requests[8].body.requestId, replacement);
    h.respond(200, { id: 'adjustment-a', adjustmentNumber: 'SIM-CREDIT-A', created: false, simulation: true });
    const reloaded = h.page.waitForEvent('framenavigated', { predicate: (frame: { url(): string }) => frame.url() === 'https://deferred-retry.test/' });
    await form.getByRole('button', { name: 'Issue simulated document' }).click();
    await reloaded;
    await h.page.waitForLoadState('domcontentloaded');
    await h.page.waitForFunction((id: string) => !Object.values(sessionStorage).includes(id), String(replacement));
    const stored = await h.page.evaluate(() => Object.values(sessionStorage));
    assert.ok(stored.includes(String(b)), 'success of A preserves B');
    assert.ok(stored.every((value: string) => /^[0-9a-f-]{36}$/i.test(value)), 'no financial values or notes in storage');
  } finally { await h.browser.close(); }
});
