import { openCheckoutAddress, openCheckoutPayment } from './helpers/checkout-step-navigation';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import type { FixtureBrowser, FixtureLocator, FixturePage } from './helpers/browser-fixture-types';
import { stubFixtureImage } from './helpers/browser-fixture-link';

const modes = [
  ['customer-return', 'commerce.return-request'], ['customer-complaint', 'commerce.complaint'],
  ['seller-return', 'seller.case-return-response'], ['seller-complaint', 'seller.case-complaint-response'],
  ['gift-issue', 'commerce.gift-card-issue'], ['gift-redeem', 'commerce.gift-card-redeem'],
  ['checkout', 'commerce.checkout'],
] as const;
let bundled: Promise<string> | undefined;
function bundle() {
  return bundled ??= build({ stdin: { resolveDir: process.cwd(), sourcefile: 'commerce-success-fixture.tsx',
    loader: 'tsx', contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import {CustomerAftercare} from './components/commerce/customer-aftercare';
      import {SellerCaseResponseForm} from './components/seller/case-response-form';
      import {GiftCardForm} from './components/commerce/gift-card-form';
      import {CheckoutForm} from './components/commerce/checkout-form';
      const mode=window.__mode;
      createRoot(document.getElementById('root')).render(mode.startsWith('customer-')?
        <CustomerAftercare orderNumber="HK-TEST" orderStatus="delivered" items={[{id:'item',productName:'Product',sellerName:'Shop',quantity:1,returnEligible:true}]} returns={[]} complaints={[]}/>:
        mode.startsWith('seller-')?<SellerCaseResponseForm kind={mode==='seller-return'?'return':'complaint'} id="case-1" disabled={false}/>:
        mode.startsWith('gift-')?<GiftCardForm actorId="gift-success-fixture" issue={mode==='gift-issue'}/>:<CheckoutForm policyContext={'a'.repeat(64)} customerId="customer-fixture" customerEmail="buyer@example.test" customerPhone="9811111111"
          paymentCapabilities={{cod:true,manual_bank:false,state:'ready'}}
          savedAddresses={[{id:'fixture-address',label:'Home',isDefault:1,recipientName:'Fixture Buyer',phone:'9811111111',province:'Madhesh',district:'Dhanusha',municipality:'Janakpur',locality:'Fixture locality',ward:null,landmark:null,postalCode:null}]}/>);` },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'navigation-fixture', setup(builder) {
      stubFixtureImage(builder);
      builder.onResolve({ filter: /^next\/navigation$|^next\/link$|^@\/components\/delivery\/location-picker$/ },
        (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ loader: 'js', resolveDir: process.cwd(),
        contents: args.path === 'next/navigation' ? 'export function useRouter(){return {refresh(){window.__refreshes=(window.__refreshes||0)+1}}}'
          : args.path === 'next/link' ? 'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)}'
            : 'export function LocationPicker(){return null}' }));
    } }] }).then((result) => result.outputFiles[0].text);
}

async function fill(page: FixturePage, mode: string, form: FixtureLocator) {
  if (mode.startsWith('customer-')) {
    if (mode === 'customer-complaint') await form.getByLabel('Subject').fill('Damaged delivery');
    await form.locator('[name="detail"]').fill('The item arrived damaged and cannot be used.');
  } else if (mode.startsWith('seller-')) {
    if (mode === 'seller-return') await form.getByRole('radio', { name: /Accept the return/ }).check();
    await form.getByLabel(mode === 'seller-return' ? 'Explain what you know' : 'Response for the investigation')
      .fill('I inspected the packing record and will resolve the case.');
  } else if (mode.startsWith('gift-'))
    await form.getByLabel(mode === 'gift-issue' ? 'Amount in NPR' : 'Gift card code').fill(mode === 'gift-issue' ? '100' : 'HG-SIMULATED');
  else {
    const changeRecipient = page.getByRole('button', { name: 'Change: Who is it for?', exact: true });
    if (await changeRecipient.isVisible()) await changeRecipient.click();
    await form.getByLabel('Recipient name').fill('Maya Buyer');
    await form.getByLabel('Recipient phone').fill('9811111111');
    await openCheckoutAddress(page);
    for (const [label, value] of [['District', 'Dhanusha'],
      ['Municipality / rural municipality', 'Janakpur'], ['Street, tole or locality', 'Ward 1']])
      await form.getByLabel(label).fill(value);
    await openCheckoutPayment(page);
    await form.locator('label[for="checkout-terms"]').click();
  }
  await form.getByLabel('Case context').fill('SIMULATED retained context');
}
const retainedValues = (form: FixtureLocator) => form.evaluate((element) => Array.from(
  (element as HTMLFormElement).elements).flatMap((control) =>
    control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement
      ? [[control.name, control.value]] : []));

async function submitAttempt(page: FixturePage, form: FixtureLocator, expectEnabled = true) {
  const completed = await page.evaluate(() => (window as unknown as { __completed: number }).__completed);
  await form.getByRole('button', { name: /Send return request|Send complaint|Submit response|Send reply to Hastabazaar|Issue gift card|Redeem into wallet|Place COD order/ }).click();
  await page.waitForFunction((previous) => (window as unknown as { __completed: number }).__completed > previous, completed);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  if (expectEnabled) {
    const formId = await form.getAttribute('data-form-id');
    await page.waitForFunction((id) => {
      const buttons = document.querySelector(`form[data-form-id="${id}"]`)?.querySelectorAll('button');
      return buttons && Array.from(buttons).some((button) => !button.disabled &&
        /Send return request|Send complaint|Submit response|Send reply to Hastabazaar|Issue gift card|Redeem into wallet|Place COD order/.test(button.textContent ?? ''));
    }, formId);
  }
}

for (const [mode, formId] of modes) void test(`${formId} retains attempts and input until an exact positive response`, async () => {
  const modulePath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(modulePath) as { chromium: { launch(options: {
    headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage(), payloads: { id: string; body: string }[] = [];
  let reply: { status: number; body: string } | 'lost' = { status: 200, body: '{}' };
  try {
    await page.route('https://commerce-success.test/**', async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/orders/')))
        return route.fulfill({ status: 200, contentType: 'text/html', body: `<div id="root"></div><script>window.__mode=${JSON.stringify(mode)};window.__refreshes=0;window.__completed=0;
          const originalFetch=window.fetch;window.fetch=async(...args)=>{try{return await originalFetch(...args)}finally{if(args[1]?.method==='POST')window.__completed++}}</script>` });
      if (url.pathname === '/api/account/contact-verification') {
        if (mode !== 'checkout' || request.method() !== 'GET') return route.abort();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          email: 'buyer@example.test', phone: '+9779811111111', emailVerified: true, phoneVerified: true,
        }) });
      }
      if (url.pathname.startsWith('/api/forms/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config: {
        formId: decodeURIComponent(url.pathname.slice('/api/forms/'.length)), version: 1, publishedAt: 1,
        fields: [{ id: 'context_note', key: 'context_note', type: 'short_text', label: 'Case context',
          required: true, order: 0, status: 'active' }] } }) });
      if (url.pathname === '/api/cart') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        items: [{ id: 'item', sellerId: 'seller', nameEn: 'Product', tradingName: 'Shop', pricePaisa: 100000, quantity: 1, preparationDays: 1 }],
        itemSubtotalPaisa: 100000, itemCount: 1, hasUnavailableItems: false }) });
      if (request.method() === 'POST') {
        const body = request.postData() ?? '';
        const id = mode === 'customer-return' ? body.match(/name="idempotencyKey"[\s\S]*?\r\n\r\n([^\r\n]+)/)?.[1]
          : (JSON.parse(body) as { idempotencyKey?: string; requestId?: string }).idempotencyKey ??
            (JSON.parse(body) as { requestId?: string }).requestId;
        payloads.push({ body, id: id ?? '' });
        if (reply === 'lost') return route.abort();
        return route.fulfill({ status: reply.status, contentType: 'application/json', body: reply.body });
      }
      return route.abort();
    });
    const mount = async () => {
      await page.goto('https://commerce-success.test/');
      await page.addScriptTag({ content: await bundle() });
      if (mode.startsWith('customer-')) await page.getByText(mode === 'customer-return' ?
        'Return or replace an item' : 'Get help or raise a complaint').click();
      const form = page.locator(`form[data-form-id="${formId}"]`);
      if (mode.startsWith('customer-')) {
        for (let step = 1; step < 4; step++) await form.getByRole('button', { name: 'Continue', exact: true }).click();
      }
      if (mode !== 'checkout') await form.getByLabel('Case context').waitFor();
      await fill(page, mode, form);
      return form;
    };
    let form = await mount();
    const expectedValues = await retainedValues(form);
    const invalidBodies = ['{}', 'null', 'false', '"saved"', 'not-json',
      JSON.stringify({ id: {}, referenceNumber: 123, duplicate: 'false', message: 'Saved', ok: 'true',
        code: {}, amountPaisa: '10000', orderNumber: {} }),
      JSON.stringify({ id: ' ', referenceNumber: ' ', duplicate: false, message: 'Saved', ok: false,
        code: null, amountPaisa: -1, orderNumber: ' ' }),
      JSON.stringify({ id: 'case', referenceNumber: 'HK-C', duplicate: 'false', message: 'Saved', ok: 'true',
        code: null, amountPaisa: 10000, orderNumber: 'x'.repeat(101) })];
    if (mode.startsWith('customer-')) for (const invalid of [{ id: false }, { referenceNumber: {} },
      { duplicate: 'false' }, { message: {} }]) invalidBodies.push(JSON.stringify({
        id: 'case-1', referenceNumber: 'HK-C-1', duplicate: false, message: 'Case received.', ...invalid }));
    if (mode.startsWith('gift-')) for (const invalid of [{ id: false }, { amountPaisa: '10000' },
      { amountPaisa: 1.5 }, { duplicate: 'false' }, ...(mode === 'gift-issue' ? [{ code: {} }, { code: null }] : [])])
      invalidBodies.push(JSON.stringify({ id: 'gift-1', amountPaisa: 10000, duplicate: false,
        ...(mode === 'gift-issue' ? { code: 'HG-SIMULATED' } : {}), ...invalid }));
    if(mode.startsWith('gift-')){
      // Gift ambiguity retains one frozen RAM payload; reload checks the native
      // opaque receipt rather than reconstructing private answers for another POST.
      const send=async()=>{const completed=await page.evaluate(()=>(window as unknown as{__completed:number}).__completed);const retry=page.getByRole('button',{name:'Retry original request',exact:true});if(await retry.count())await retry.click();else await form.getByRole('button',{name:/Issue gift card|Redeem into wallet/}).click();await page.waitForFunction(previous=>(window as unknown as{__completed:number}).__completed>previous,completed);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));};
      for(const body of invalidBodies){reply={status:200,body};await send();await page.getByRole('alert').first().waitFor();assert.deepEqual(await retainedValues(form),expectedValues);assert.equal(await form.getByRole('button',{name:/Issue gift card|Redeem into wallet/}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Retry original request',exact:true}).isEnabled(),true);}
      for(const failure of ['lost',{status:409,body:'{"error":"Unclassified original conflict."}'}]as const){reply=failure;await send();await page.getByRole('alert').first().waitFor();assert.deepEqual(await retainedValues(form),expectedValues);}
      const firstId=payloads[0].id;assert.ok(payloads.every(row=>row.id===firstId));assert.ok(payloads.every(row=>row.body===payloads[0].body));assert.equal(await page.evaluate(()=>(window as unknown as{__refreshes:number}).__refreshes),0);
      reply={status:200,body:JSON.stringify({id:'gift-1',amountPaisa:10000,duplicate:true,...(mode==='gift-issue'?{code:null}:{})})};await send();await page.waitForFunction(()=>(window as unknown as{__refreshes:number}).__refreshes===1);await page.getByText(mode==='gift-issue'?'Gift card issuance is recorded.':'Gift card redemption is recorded.',{exact:false}).waitFor();
      form=await mount();reply={status:409,body:'{"error":"Current config changed.","code":"stale_version"}'};await send();await page.getByText(/This form changed while/).first().waitFor();assert.equal(await form.getByRole('button',{name:/Issue gift card|Redeem into wallet/}).isDisabled(),true);assert.notEqual(payloads.at(-1)?.id,firstId);return;
    }
    for (const body of invalidBodies) {
      reply = { status: 200, body };
      await submitAttempt(page, form);
      await page.getByRole('alert').first().waitFor();
      assert.deepEqual(await retainedValues(form), expectedValues, `${formId}: malformed success must retain all values`);
      assert.equal(await page.evaluate(() => (window as unknown as { __refreshes: number }).__refreshes), 0,
        `${formId}: malformed success must not refresh`);
      assert.equal(await form.getByRole('button', { name: /Send return request|Send complaint|Submit response|Send reply to Hastabazaar|Issue gift card|Redeem into wallet|Place COD order/ }).isEnabled(), true);
    }
    for (const failure of ['lost', { status: 409, body: '{"error":"Correct the details."}' }] as const) {
      reply = failure;
      await submitAttempt(page, form);
      await page.getByRole('alert').first().waitFor();
      await form.getByRole('button', { name: /Send return request|Send complaint|Submit response|Send reply to Hastabazaar|Issue gift card|Redeem into wallet|Place COD order/ }).waitFor();
      await page.waitForFunction(() => !document.querySelector('form button[type="submit"]:disabled'));
      assert.deepEqual(await retainedValues(form), expectedValues);
    }
    assert.equal(payloads.length, invalidBodies.length + 2);
    const firstId = payloads[0].id;
    assert.ok(firstId.length >= 8);
    assert.ok(payloads.every((payload) => payload.id === firstId), `${formId}: ambiguous responses and domain conflict must retain identity`);
    if (mode !== 'gift-redeem') {
      form = await mount();
      reply = { status: 409, body: '{"error":"Correct the details."}' };
      await submitAttempt(page, form);
      await page.getByText('Correct the details.').waitFor();
      assert.equal(payloads.at(-1)?.id, firstId, `${formId}: reload must retain opaque attempt`);
    }
    await form.getByLabel('Case context').fill('SIMULATED corrected context');
    if (mode === 'checkout') {
      const priorRequests = payloads.length;
      const priorCompleted = await page.evaluate(() => (window as unknown as { __completed: number }).__completed);
      await form.getByRole('button', { name: 'Place COD order' }).click();
      await form.getByText(/This order differs from the prior attempt/).waitFor();
      assert.equal(payloads.length, priorRequests, 'changed checkout context must not dispatch a POST');
      assert.equal(await page.evaluate(() => (window as unknown as { __completed: number }).__completed), priorCompleted);
      assert.equal(payloads.at(-1)?.id, firstId, 'blocked changed context retains the original attempt');
      assert.equal(await form.getByLabel('Case context').inputValue(), 'SIMULATED corrected context');
      assert.equal(await form.getByRole('button', { name: 'Place COD order' }).isEnabled(), true);
      await form.getByLabel('Case context').fill('SIMULATED retained context');
    }
    reply = { status: 200, body: '{"error":"Current config changed.","code":"stale_version"}' };
    // A 2xx error-shaped body cannot masquerade as success, even with a stale code.
    await submitAttempt(page, form);
    await page.getByRole('alert').first().waitFor();
    await page.waitForFunction(() => !document.querySelector('form button[type="submit"]:disabled'));
    assert.equal(payloads.at(-1)?.id, firstId);
    reply = { status: 200, body: JSON.stringify(mode.startsWith('customer-') ?
      { id: 'case-1', referenceNumber: 'HK-C-1', duplicate: false, message: 'Case received.' }
      : mode.startsWith('seller-') ? { ok: true }
        : mode === 'gift-issue' ? { id: 'gift-1', amountPaisa: 10000, duplicate: true, code: null }
          : mode === 'gift-redeem' ? { id: 'gift-1', amountPaisa: 10000, duplicate: false }
            : { orderNumber: 'HK-20260928-ABCDEF' }) };
    await form.getByRole('button', { name: /Send return request|Send complaint|Submit response|Send reply to Hastabazaar|Issue gift card|Redeem into wallet|Place COD order/ }).click();
    if (mode === 'checkout') await page.waitForFunction(() => location.pathname === '/orders/HK-20260928-ABCDEF' && new URLSearchParams(location.search).get('placed') === '1');
    else await page.waitForFunction(() => (window as unknown as { __refreshes: number }).__refreshes === 1);
    assert.equal(payloads.at(-1)?.id, firstId);
    if (mode !== 'gift-redeem') {
      form = await mount();
      reply = { status: 409, body: '{"error":"Correct the details."}' };
      await submitAttempt(page, form);
      await page.getByText('Correct the details.').waitFor();
      assert.notEqual(payloads.at(-1)?.id, firstId, `${formId}: concrete success clears the attempt`);
      reply = { status: 409, body: '{"error":"Current config changed.","code":"stale_version"}' };
      if (mode === 'gift-issue') {
        const issuedCode = 'HG-' + 'A'.repeat(48);
        reply = { status: 201, body: JSON.stringify({ id: 'gift-2', amountPaisa: 10000, duplicate: false, code: issuedCode }) };
        await form.getByRole('button', { name: 'Issue gift card' }).click();
        await page.getByText(issuedCode, { exact: true }).waitFor();
        assert.equal(await page.getByText('Gift card issued.', { exact: true }).count(), 1);
        form = await mount();
        reply = { status: 409, body: '{"error":"Current config changed.","code":"stale_version"}' };
      }
      await submitAttempt(page, form, false);
      await page.getByText(mode === 'checkout' ? /Checkout details changed/ : /This form changed while/).first().waitFor();
      assert.equal(await form.getByRole('button', { name: /Send return request|Send complaint|Submit response|Send reply to Hastabazaar|Issue gift card|Redeem into wallet|Place COD order/ }).isDisabled(), true);
    }
  } finally { await page.close(); await browser.close(); }
});
