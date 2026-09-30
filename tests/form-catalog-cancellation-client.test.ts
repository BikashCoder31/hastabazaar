import type { FixtureBrowser } from './helpers/browser-fixture-types';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function cancellationClientBundle() {
  return build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {CustomerOrderCancellation} from './components/commerce/customer-order-cancellation';
    import {CancellationReviewControl} from './components/admin/cancellation-review-control';
    createRoot(document.getElementById('root')).render(<>
      <CustomerOrderCancellation orderNumber="ORDER-1" />
      <CancellationReviewControl reviewId="review-one" />
    </>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'cancellation-client-stubs', setup(bundler) {
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'form-config', namespace: 'cancel-stub' }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'cancel-stub' }));
      bundler.onLoad({ filter: /^form-config$/, namespace: 'cancel-stub' }, () => ({ contents: `
        export function usePublishedFormConfig(formId){return {config:{formId,version:2,publishedAt:1,fields:[{
          id:'context_note',key:'context_note',label:'Cancellation context',type:'short_text',required:true,order:0,status:'active'
        }]},canSubmit:true,status:'ready',message:'',refresh(){},handleSubmissionResponse(){window.__staleCalls=(window.__staleCalls||0)+1;return true}}}
      `, loader: 'js' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'cancel-stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
    } }],
  });
}

void test('native required validation focuses customer and staff controls before fetch or attempt mutation', async () => {
  const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(modulePath) as { chromium: { launch(options: object): Promise<FixtureBrowser> } };
  const bundle = await cancellationClientBundle();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const requests: Record<string, unknown>[] = [];
  const customerKey = 'hastabazaar:profile-attempt:commerce.order-cancellation:ORDER-1';
  const approveKey = 'hastabazaar:profile-attempt:staff.cancellation-review:review-one:approve';
  const rejectKey = 'hastabazaar:profile-attempt:staff.cancellation-review:review-one:reject';
  const originalId = '11111111-1111-4111-8111-111111111111';
  const preview = { fingerprint: 'a'.repeat(64), reviewRequired: false, total: 1000, collected: 0,
    walletRestored: 0, discountRemoved: 0, delivery: 0, deliveryPricingPolicy: null };
  try {
    await page.route('https://cancel-validation.test/**', (route) => {
      const request = route.request();
      if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/cancel'))
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ id: 'seller-one', name: 'Fictional maker', eligible: true, reviewRequired: false }] }) });
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>; requests.push(body);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.action === 'preview' ? preview : body.action === 'reject' ? { ok: true } : { id: 'cancel-one', status: 'cancelled' }) });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://cancel-validation.test/');
    await page.evaluate(({ keys, id }) => { for (const key of keys) sessionStorage.setItem(key, id); }, { keys: [customerKey, approveKey, rejectKey], id: originalId });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('button', { name: 'Cancel order or seller parcels', exact: true }).click();
    const customer = page.locator('form[data-form-id="commerce.order-cancellation"]');
    await customer.getByRole('checkbox').check();
    await customer.getByLabel(/^Reason/).fill('Fictional protected customer reason');
    const context = customer.getByLabel('Cancellation context');
    await customer.getByRole('button', { name: 'Review cancellation amounts', exact: true }).click();
    assert.equal(await context.evaluate((element) => element === document.activeElement && (element as HTMLInputElement).validity.valueMissing), true, 'Missing custom input receives native focus before preview');
    assert.equal(requests.length, 0); assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), customerKey), originalId);
    await context.fill('Fictional customer context');
    await customer.getByLabel(/^Reason/).fill('short');
    await customer.getByRole('button', { name: 'Review cancellation amounts', exact: true }).click();
    assert.equal(await customer.getByLabel(/^Reason/).evaluate((element) => element === document.activeElement && (element as HTMLTextAreaElement).validity.tooShort), true);
    assert.equal(requests.length, 0); assert.equal(await context.inputValue(), 'Fictional customer context');
    await customer.getByLabel(/^Reason/).fill('Fictional protected customer reason');
    await customer.getByRole('button', { name: 'Review cancellation amounts', exact: true }).click();
    const confirm = customer.getByRole('button', { name: 'Confirm cancellation and revised amount', exact: true }); await confirm.waitFor();
    await context.fill(''); await confirm.click();
    assert.equal(await context.evaluate((element) => element === document.activeElement && (element as HTMLInputElement).validity.valueMissing), true);
    assert.equal(requests.length, 1); assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), customerKey), originalId);
    await context.fill('Fictional customer context'); await confirm.click(); await page.getByText(/Selected parcels cancelled/).waitFor();
    assert.equal(requests.length, 2); assert.equal(requests[1].requestId, originalId); assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), customerKey), null);
    const staff = page.locator('form[data-form-id="staff.cancellation-review"]');
    const staffContext = staff.getByLabel('Cancellation context');
    await staff.getByLabel('Decision reason').fill('Fictional protected staff reason');
    for (const action of ['Review current cancellation amounts', 'Reject with reason']) {
      await staff.getByRole('button', { name: action, exact: true }).click();
      assert.equal(await staffContext.evaluate((element) => element === document.activeElement && (element as HTMLInputElement).validity.valueMissing), true);
      assert.equal(requests.length, 2);
      for (const key of [approveKey, rejectKey]) assert.equal(await page.evaluate((name: string) => sessionStorage.getItem(name), key), originalId);
    }
    await staffContext.fill('Fictional staff context'); await staff.getByLabel('Decision reason').fill('short');
    await staff.getByRole('button', { name: 'Review current cancellation amounts', exact: true }).click();
    assert.equal(await staff.getByLabel('Decision reason').evaluate((element) => element === document.activeElement && (element as HTMLTextAreaElement).validity.tooShort), true); assert.equal(requests.length, 2);
    await staff.getByLabel('Decision reason').fill('Fictional protected staff reason');
    await staff.getByRole('button', { name: 'Review current cancellation amounts', exact: true }).click();
    const approve = staff.getByRole('button', { name: 'Approve reviewed cancellation', exact: true }); await approve.waitFor();
    await staffContext.fill(''); await approve.click();
    assert.equal(await staffContext.evaluate((element) => element === document.activeElement && (element as HTMLInputElement).validity.valueMissing), true); assert.equal(requests.length, 3);
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), approveKey), originalId);
    await staffContext.fill('Fictional staff context'); await approve.click(); await staff.getByText('Decision saved.').waitFor();
    assert.equal(await page.evaluate((key: string) => sessionStorage.getItem(key), approveKey), null);
    assert.equal(requests[3].requestId, undefined, 'Native validation preserves the server-owned staff approval identity');
    await staff.getByRole('button', { name: 'Reject with reason', exact: true }).click();
    await page.waitForFunction(() => sessionStorage.getItem('hastabazaar:profile-attempt:staff.cancellation-review:review-one:reject') === null);
    assert.equal(requests.length, 5); assert.equal(requests[4].requestId, undefined);
  } finally { await browser.close(); }
});

void test('mounted cancellation controls retain contextual attempts while server owns staff decision identity', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await cancellationClientBundle();
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const customerConfirm: Record<string, unknown>[] = [];
  const staffDecision: Record<string, unknown>[] = [];
  const preview = { fingerprint: 'a'.repeat(64), reviewRequired: false, walletRestored: 0,
    discountRemoved: 0, delivery: 0, total: 1000, collected: 0, deliveryPricingPolicy: null };
  try {
    await page.route('https://cancel-client.test/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/orders/ORDER-1/cancel' && request.method() === 'GET')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [
          { id: 'seller-one', name: 'Fictional maker', eligible: true, reviewRequired: false } ] }) });
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        if (path === '/orders/ORDER-1/cancel') {
          if (body.action === 'preview') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preview) });
          customerConfirm.push(body);
          const status = customerConfirm.length === 1 ? 503 : customerConfirm.length === 2 ? 409 : 200;
          return route.fulfill({ status, contentType: 'application/json',
            body: status === 200 ? '{"id":"cancel-one","status":"cancelled"}' : JSON.stringify({ error: `Customer ${status} retry` }) });
        }
        if (path === '/api/admin/cancellations') {
          if (body.action === 'preview') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preview) });
          staffDecision.push(body);
          const status = staffDecision.length === 1 ? 503 : staffDecision.length === 2 ? 409 : 200;
          return route.fulfill({ status, contentType: 'application/json',
            body: status === 200 ? JSON.stringify(body.action === 'reject' ? {ok:true} : {id:'review:review-one',status:'cancelled'}) : JSON.stringify({ error: `Staff ${status} retry` }) });
        }
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    const mount = async () => { await page.goto('https://cancel-client.test/'); await page.addScriptTag({ content: bundle.outputFiles[0].text }); };
    const customer = async (reason: string) => {
      await page.getByRole('button', { name: 'Cancel order or seller parcels' }).click();
      const form = page.locator('form[data-form-id="commerce.order-cancellation"]');
      await form.getByRole('checkbox').check();
      await form.getByLabel(/^Reason/).fill(reason);
      await form.getByLabel('Cancellation context').fill('Fictional customer context');
      await form.getByRole('button', { name: 'Review cancellation amounts' }).click();
      await form.getByRole('button', { name: 'Confirm cancellation and revised amount' }).click();
    };
    const staff = async (note: string) => {
      const form = page.locator('form[data-form-id="staff.cancellation-review"]');
      await form.getByLabel('Decision reason').fill(note);
      await form.getByLabel('Cancellation context').fill('Fictional staff context');
      await form.getByRole('button', { name: 'Review current cancellation amounts' }).click();
      await form.getByRole('button', { name: 'Approve reviewed cancellation' }).click();
    };
    await mount();
    await customer('Fictional reason one');
    await page.getByText('Customer 503 retry').waitFor();
    assert.equal(customerConfirm[0].formVersion, 2);
    assert.equal((customerConfirm[0].customAnswers as { fieldId: string }[])[0].fieldId, 'context_note');
    await mount();
    await customer('Fictional changed reason');
    await page.getByText('Customer 409 retry').waitFor();
    assert.equal(customerConfirm[1].requestId, customerConfirm[0].requestId);
    await page.evaluate(() => { window.confirm = () => false; });
    await page.getByRole('button', { name: 'Start a new cancellation attempt' }).click();
    assert.equal(await page.evaluate((id: string) => Object.values(sessionStorage).includes(id), String(customerConfirm[0].requestId)), true);
    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole('button', { name: 'Start a new cancellation attempt' }).click();
    await page.locator('form[data-form-id="commerce.order-cancellation"]').getByRole('button', { name: 'Review cancellation amounts' }).click();
    await page.locator('form[data-form-id="commerce.order-cancellation"]').getByRole('button', { name: 'Confirm cancellation and revised amount' }).click();
    await page.getByText(/Selected parcels cancelled/).waitFor();
    assert.notEqual(customerConfirm[2].requestId, customerConfirm[0].requestId);
    await staff('Fictional staff review one');
    await page.getByText('Staff 503 retry').waitFor();
    assert.equal(staffDecision[0].formVersion, 2);
    assert.equal(staffDecision[0].requestId, undefined, 'server retains approval identity review:<reviewId>');
    await mount();
    await staff('Fictional changed staff review');
    await page.getByText('Staff 409 retry').waitFor();
    assert.equal(staffDecision[1].requestId, undefined);
    const key = 'hastabazaar:profile-attempt:staff.cancellation-review:review-one:approve';
    const savedId = await page.evaluate((name: string) => sessionStorage.getItem(name), key);
    assert.match(String(savedId), /^[0-9a-f-]{36}$/i);
    await page.evaluate(() => { window.confirm = () => false; });
    await page.getByRole('button', { name: 'Start a new approval attempt' }).click();
    assert.equal(await page.evaluate((name: string) => sessionStorage.getItem(name), key), savedId);
    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole('button', { name: 'Start a new approval attempt' }).click();
    assert.equal(await page.evaluate((name: string) => sessionStorage.getItem(name), key), null);
    await staff('Fictional changed staff review');
    await page.getByText('Decision saved.').waitFor();
    assert.equal(await page.evaluate((name: string) => sessionStorage.getItem(name), key), null);
    await page.locator('form[data-form-id="staff.cancellation-review"]').getByRole('button', { name: 'Reject with reason' }).click();
    await page.getByText('Decision saved.').waitFor();
    assert.equal(staffDecision[3].action, 'reject');
    assert.equal(staffDecision[3].requestId, undefined, 'server retains rejection identity review-reject:<reviewId>');
    assert.equal((staffDecision[3].customAnswers as { fieldId: string }[])[0].fieldId, 'context_note');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('hastabazaar:profile-attempt:staff.cancellation-review:review-one:reject')), null);
    assert.equal(await page.evaluate(() => (window as Window & { __staleCalls?: number }).__staleCalls ?? 0), 0);
  } finally { await browser.close(); }
});

void test('cancellation clients reject malformed 2xx previews and retain uncertain decision attempts until exact success', async () => {
  const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const {chromium} = await import(modulePath) as {chromium:{launch(options:object):Promise<FixtureBrowser>}};
  const bundle = await cancellationClientBundle();
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const validPreview = {fingerprint:'b'.repeat(64),reviewRequired:false,total:1000,collected:0,
    walletRestored:0,discountRemoved:0,delivery:0,deliveryPricingPolicy:null};
  try {
    for (const kind of ['customer-cancel','customer-review','staff-approve','staff-reject'] as const) {
      const page = await browser.newPage();
      const customer = kind.startsWith('customer');
      const action = kind === 'staff-reject' ? 'reject' : customer ? 'confirm' : 'approve';
      const storageKey = customer ? 'hastabazaar:profile-attempt:commerce.order-cancellation:ORDER-1'
        : `hastabazaar:profile-attempt:staff.cancellation-review:review-one:${action}`;
      const requests:Record<string,unknown>[]=[];
      let previewBody:unknown=validPreview;
      let successBody:unknown={};
      try {
        await page.route('https://cancel-shape.test/**', (route) => {
          const request=route.request();
          if(request.method()==='GET'&&new URL(request.url()).pathname.endsWith('/cancel'))
            return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{
              id:'seller-one',name:'Fictional maker',eligible:true,reviewRequired:false,
            }]})});
          if(request.method()==='POST') {
            const body=JSON.parse(request.postData()??'{}') as Record<string,unknown>;
            if(body.action==='preview')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(previewBody)});
            requests.push(body);
            return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(successBody)});
          }
          return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});
        });
        const mount=async()=>{
          await page.goto('https://cancel-shape.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
          if(customer)await page.getByRole('button',{name:'Cancel order or seller parcels'}).click();
          const form=page.locator(`form[data-form-id="${customer?'commerce.order-cancellation':'staff.cancellation-review'}"]`);
          if(customer)await form.getByRole('checkbox').check();
          await form.getByLabel(customer?/^Reason/:'Decision reason').fill('Fictional cancellation reason');
          await form.getByLabel('Cancellation context').fill('Fictional private context');
          return form;
        };
        let form=await mount();
        const previewButton=customer?'Review cancellation amounts':'Review current cancellation amounts';
        const decisionButton=customer?'Confirm cancellation and revised amount':kind==='staff-reject'?'Reject with reason':'Approve reviewed cancellation';
        if(action!=='reject') {
          for(const bad of [{},{...validPreview,fingerprint:''},{...validPreview,total:-1},
            {...validPreview,total:1.5},{...validPreview,deliveryPricingPolicy:'invented'},
            ...(customer?[{...validPreview,reviewRequired:'yes'},{...validPreview,collected:1001}]:[])]) {
            previewBody=bad;await form.getByRole('button',{name:previewButton,exact:true}).click();
            await page.waitForTimeout(50);
            assert.equal(await form.count(),1,`${kind}: invalid preview must keep the form usable`);
            assert.equal(await form.getByRole('button',{name:decisionButton,exact:true}).count(),0,`${kind}: invalid preview cannot offer confirmation`);
            assert.equal(await form.getByText(/Remaining.*COD/).count(),0,`${kind}: invalid money cannot render`);
          }
        }
        for(const bad of [{},{id:'',status:'cancelled'},{id:'bad',status:'pending'},{ok:false}]) {
          successBody=bad;previewBody=validPreview;
          if(action!=='reject')await form.getByRole('button',{name:previewButton,exact:true}).click();
          await form.getByRole('button',{name:decisionButton,exact:true}).click();
          await page.waitForTimeout(60);
          assert.equal(await page.getByText(/Selected parcels cancelled|Request saved\.|Decision saved\./).count(),0,`${kind}: wrong success shape cannot claim success`);
          const id=await page.evaluate((key:string)=>sessionStorage.getItem(key),storageKey);
          assert.match(String(id),/^[0-9a-f-]{36}$/i,`${kind}: ambiguous success retains opaque attempt`);
          form=await mount();
          assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),storageKey),id);
        }
        successBody=customer?{id:'cancel-one',status:kind==='customer-review'?'review_requested':'cancelled'}
          : action==='reject'?{ok:true}:{id:'review:review-one',status:'cancelled'};
        if(action!=='reject')await form.getByRole('button',{name:previewButton,exact:true}).click();
        await form.getByRole('button',{name:decisionButton,exact:true}).click();
        await page.getByText(customer?kind==='customer-review'?/Request saved\./:/Selected parcels cancelled/:'Decision saved.').waitFor();
        assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),storageKey),null);
        if(customer)assert.equal(new Set(requests.map(request=>request.requestId)).size,1);
        else assert.ok(requests.every(request=>request.requestId===undefined),'staff identity remains server-owned');
      } finally {await page.close();}
    }
  } finally {await browser.close();}
});
