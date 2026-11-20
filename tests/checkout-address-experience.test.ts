import {checkoutClientReadiness} from './helpers/checkout-client-readiness';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

import { stubFixtureLink } from './helpers/browser-fixture-link';
import { parseCheckoutInput } from '../lib/checkout/validation';

let bundle: Promise<string> | undefined;
async function componentBundle() {
  const readiness=await checkoutClientReadiness();
  return bundle ??= build({
    stdin: {
      sourcefile: 'checkout-address-fixture.tsx', resolveDir: process.cwd(), loader: 'tsx',
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {CheckoutForm} from './components/commerce/checkout-form';
        const q=new URLSearchParams(location.search); const phone=q.has('missingPhone')?undefined:'9811111111';
        createRoot(document.getElementById('root')).render(<CheckoutForm cartScope={${JSON.stringify(readiness.cartScope)}} paymentCapabilities={${JSON.stringify(readiness.paymentCapabilities)}} policyContext={'a'.repeat(64)}
          customerId="buyer" customerEmail="buyer@example.test" customerPhone={phone}
          contactPolicy="email_only" customerDisplayName="Fixture Buyer"
          contactStatus={{email:'buyer@example.test',phone:phone?'+977'+phone:null,emailVerified:true,phoneVerified:false}}
          savedAddresses={q.has('newAddress')?[]:[{id:'home',label:'Home',isDefault:1,recipientName:'Original Buyer',
            phone:'9822222222',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',
            locality:'Original locality',ward:null,landmark:null,postalCode:null,latitude:27.7,longitude:85.3}]}/>);`,
    }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'checkout-address-navigation', setup(b) {
      stubFixtureLink(b);
      b.onResolve({ filter: /^next\/navigation$|^@\/components\/delivery\/location-picker$/ }, a => ({ path: a.path, namespace: 'checkout-address-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'checkout-address-stub' }, a => ({ resolveDir:process.cwd(),loader: 'js', contents: a.path === 'next/navigation'
        ? 'export function useRouter(){return {refresh(){}}}'
        : `import React from 'react';export function LocationPicker({initial}){const[p,setP]=React.useState(initial);return React.createElement('div',null,
          React.createElement('button',{type:'button',onClick:()=>setP({latitude:27.8,longitude:85.4})},'Set fixture map pin'),
          React.createElement('input',{type:'hidden',name:'latitude',value:p?.latitude??''}),React.createElement('input',{type:'hidden',name:'longitude',value:p?.longitude??''}));}` }));
    } }],
  }).then(result => result.outputFiles[0].text);
}

async function fixture(query = '') {
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const posts: unknown[] = [];
  await page.route('https://checkout-address.test/**', async (route:{request():{url():string;postDataJSON():unknown};fulfill(options:unknown):Promise<void>;abort():Promise<void>}) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<style>[data-slot="checkbox"]{display:inline-flex;width:16px;height:16px}</style><div id="root"></div>' });
    if (url.pathname === '/api/cart') return route.fulfill({ json: {
      items: [{ id: 'line', sellerId: 'seller', nameEn: 'Fictional craft', tradingName: 'Fictional seller', pricePaisa: 100000, quantity: 1, preparationDays: 0 }],
      itemSubtotalPaisa: 100000, itemCount: 1, hasUnavailableItems: false,
    } });
    if (url.pathname === '/api/account/contact-verification') return route.fulfill({ json: {
      email: 'buyer@example.test', phone: query.includes('missingPhone') ? null : '+9779811111111', emailVerified: true, phoneVerified: false,
    } });
    if (url.pathname.startsWith('/api/forms/')) return route.fulfill({ json: { config: { formId: url.pathname.slice('/api/forms/'.length), version: 1, publishedAt: 1, fields: [] } } });
    if (url.pathname === '/api/checkout') {
      posts.push(request.postDataJSON());
      return route.fulfill({ status: 503, json: { error: 'Fixture only; no order created.' } });
    }
    return route.abort();
  });
  await page.goto('https://checkout-address.test/' + query);
  await page.addScriptTag({ content: await componentBundle() });
  await page.getByText('Verified', { exact: true }).waitFor();
  await page.locator('input[name="formVersion"]').waitFor({ state: 'attached' });
  return { browser, page, posts };
}

void test('recipient switches retain edited address fields and optional recipient email', async () => {
  const h = await fixture();
  try {
    const edits = { recipientName: 'Edited recipient', recipientPhone: '9833333333', municipality: 'Edited municipality', locality: 'Edited locality', ward: '12', landmark: 'Edited landmark', postalCode: '12345' };
    for (const [id, value] of Object.entries(edits)) await h.page.locator('#' + id).fill(value);
    await h.page.getByRole('button',{name:'Set fixture map pin'}).click();
    await h.page.getByRole('radio', { name: 'For someone else', exact: true }).check();
    for (const [id, value] of Object.entries(edits)) assert.equal(await h.page.locator('#' + id).inputValue(), value, id);
    await h.page.locator('#recipientEmail').fill('recipient@example.test');
    await h.page.getByRole('radio', { name: 'For myself', exact: true }).check();
    for (const [id, value] of Object.entries(edits)) assert.equal(await h.page.locator('#' + id).inputValue(), value, id);
    await h.page.getByRole('radio', { name: 'For someone else', exact: true }).check();
    assert.equal(await h.page.locator('#recipientEmail').inputValue(), 'recipient@example.test');
    assert.equal(await h.page.locator('input[name="latitude"]').inputValue(),'27.8');
    assert.equal(await h.page.locator('input[name="longitude"]').inputValue(),'85.4');
    assert.equal(h.posts.length, 0);
  } finally { await h.browser.close(); }
});

void test('checkout labels required and optional fields and explains automatic address saving', async () => {
  const h = await fixture();
  try {
    for (const id of ['recipientName', 'recipientPhone', 'customerEmail', 'customerPhone', 'district', 'municipality', 'locality']) {
      assert.equal(await h.page.locator('#' + id).getAttribute('required'), '', id);
      assert.match(await h.page.locator('label[for="' + id + '"]').innerText(), /required/i, id);
    }
    assert.match(await h.page.locator('label[for="province"]').innerText(), /required/i);
    assert.equal(await h.page.locator('#province').getAttribute('aria-required'), 'true');
    for (const id of ['ward', 'landmark', 'postalCode']) {
      assert.equal(await h.page.locator('#' + id).getAttribute('required'), null);
      assert.match(await h.page.locator('label[for="' + id + '"]').innerText(), /optional/i);
    }
    assert.equal(await h.page.getByRole('button', { name: 'Place COD order', exact: true }).isDisabled(), true, 'Terms are still unaccepted');
    await h.page.getByRole('checkbox', { name: /I agree to the Terms/ }).check();
    assert.equal(await h.page.getByRole('button', { name: 'Place COD order', exact: true }).isEnabled(), true);
    await h.page.getByText(/delivery address.*saved automatically/i).waitFor();
    assert.equal(await h.page.getByRole('checkbox', { name: /Save this address for future orders/ }).count(), 0);
    await h.page.locator('#locality').fill('');
    await h.page.getByRole('button', { name: 'Place COD order', exact: true }).click();
    assert.equal(h.posts.length, 0, 'Empty locality must not dispatch checkout');
  } finally { await h.browser.close(); }
});

void test('new address requires an explicit province and a missing buyer mobile cannot use the recipient phone', async () => {
  const h = await fixture('?newAddress');
  try {
    assert.match(await h.page.locator('#province').innerText(), /select.*province/i);
    await h.page.getByRole('checkbox', { name: /I agree to the Terms/ }).check();
    assert.equal(await h.page.getByRole('button', { name: 'Place COD order', exact: true }).isDisabled(), true);
    await h.page.getByRole('combobox', {name:/Province/}).click();
    await h.page.getByRole('option', {name:'Bagmati',exact:true}).click();
    await h.page.locator('#district').fill('Kathmandu');
    await h.page.locator('#municipality').fill('Kathmandu');
    await h.page.locator('#locality').fill('Sample tole');
    await h.page.getByRole('button', { name:'Place COD order',exact:true }).click();
    await h.page.getByRole('alert').filter({hasText:'Fixture only; no order created.'}).waitFor();
    assert.equal(h.posts.length,1);
    assert.equal((h.posts[0] as {address:{province:string}}).address.province,'Bagmati');
  } finally { await h.browser.close(); }
  const missing = await fixture('?missingPhone');
  try {
    assert.equal(await missing.page.locator('#customerPhone').inputValue(), '');
    await missing.page.getByRole('checkbox', { name: /I agree to the Terms/ }).check();
    assert.equal(await missing.page.getByRole('button', { name: 'Place COD order', exact: true }).isDisabled(), true);
    assert.equal(missing.posts.length, 0);
  } finally { await missing.browser.close(); }
});

void test('server parser refuses blank contact phone, province and locality independently', () => {
  const base = { customerEmail: 'buyer@example.test', customerPhone: '9811111111', termsAccepted: true, idempotencyKey: crypto.randomUUID(), address: { recipientName: 'Fixture Buyer', phone: '9822222222', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fixture locality' } };
  assert.ok(parseCheckoutInput(base).value);
  for (const blank of ['', '   ']) {
    assert.equal(parseCheckoutInput({ ...base, customerPhone: blank }).value, undefined);
    assert.equal(parseCheckoutInput({ ...base, address: { ...base.address, province: blank } }).value, undefined);
    assert.equal(parseCheckoutInput({ ...base, address: { ...base.address, locality: blank } }).value, undefined);
  }
});
