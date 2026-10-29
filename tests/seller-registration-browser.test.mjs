import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

void test('registration restores partial answers and files after reopening and submits with optional fields empty', async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const bundle = await build({ stdin: { loader: 'tsx', resolveDir: process.cwd(), sourcefile: 'seller-registration-browser-fixture.tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {SellerRegistrationIntakeForm} from './components/seller/seller-registration-intake-form';
    const initial = location.pathname === '/dashboard' ? { version:1, answers:{pickupAddress:['Saved pickup'],returnAddress:['Saved pickup']}, documents:{}, missing:[] } : undefined;
    createRoot(document.getElementById('root')).render(<SellerRegistrationIntakeForm accountId="test-owner" accountEmail="fictional@local.hastabazaar.test" initial={initial} />);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-navigation', setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('navigation')
        ? 'export const useRouter=()=>({refresh(){}});'
        : 'import React from "react"; export default function Link(props){return React.createElement("a",props)}', resolveDir: process.cwd() }));
    } }] });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  let draft = null; let submitted = null; const files = new Map();
  const config = { formId: 'seller.application', version: 1, publishedAt: 1, fields: [
    { id:'additional_note',key:'additional_note',type:'short_text',label:'Additional note',required:true,order:1,status:'active' },
    { id:'contact_later',key:'contact_later',type:'checkbox',label:'Contact later',required:true,order:2,status:'active' },
  ] };
  await page.route('https://registration.test/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.startsWith('/api/forms/')) return json({ config });
    if (url.pathname === '/api/seller-applications/draft') {
      assert.equal(request.headers()['x-draft-account'], 'test-owner');
      if (url.searchParams.has('file')) return route.fulfill({ status:200,body:files.get(url.searchParams.get('file')) });
      if (request.method() === 'GET') return json({ draft });
      if (request.method() === 'DELETE') { draft = null; return json({ deleted:true }); }
      const data = await new Request(request.url(), { method:'PUT',headers:request.headers(),body:request.postDataBuffer() }).formData();
      const input = JSON.parse(data.get('payload'));
      const savedFiles = Object.fromEntries(Object.keys(input.files).map(key => [key,draft.files[key]]));
      for (const [key,file] of data) if (file instanceof File && file.size) {
        const id = crypto.randomUUID(); files.set(id, Buffer.from(await file.arrayBuffer()));
        savedFiles[key] = { id,name:file.name,type:file.type,size:file.size };
      }
      draft = { revision:input.changeId,attemptId:input.attemptId,formVersion:input.formVersion,answers:input.answers,files:savedFiles,updatedAt:Date.now(),expiresAt:Date.now()+86400000 };
      return json({ draft });
    }
    if (url.pathname === '/api/seller-registrations') {
      submitted = await new Request(request.url(), { method:'POST',headers:request.headers(),body:request.postDataBuffer() }).formData();
      return json({ applicationReference:'FICTIONAL-TEST',missing:['Complete details later'] });
    }
    return route.fulfill({ status:200,contentType:'text/html',body:'<html><body><div id="root"></div></body></html>' });
  });
  try {
    await page.goto('https://registration.test/'); await page.addScriptTag({ content:bundle.outputFiles[0].text });
    const submit = () => page.getByRole('button', { name:'Submit application',exact:true });
    await submit().waitFor(); await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    assert.equal(await page.locator('[name="phoneCountry"]').inputValue(), 'NP');
    assert.equal(await page.locator('form [required]').count(), 0);
    assert.equal(await page.locator('[name="bankAccountNumber"],[name="profileImage"],[name="businessDescription"]').count(), 0);
    await page.locator('[name="legalName"]').fill('Fictional Partial Maker');
    const sameAddress = () => page.getByRole('checkbox', { name:'Pickup and return addresses are the same',exact:true });
    assert.equal(await sameAddress().count(), 1);
    await page.locator('[name="returnAddress"]').fill('Fictional return location');
    await sameAddress().check();
    assert.equal(await page.locator('[name="pickupAddress"]').inputValue(), 'Fictional return location');
    await page.locator('[name="pickupAddress"]').fill('Fictional shared location');
    assert.equal(await page.locator('[name="returnAddress"]').inputValue(), 'Fictional shared location');
    await page.getByRole('status').filter({ hasText:'Progress saved to your account.' }).waitFor();
    assert.deepEqual(draft.answers.pickupAddress, ['Fictional shared location']);
    assert.deepEqual(draft.answers.returnAddress, ['Fictional shared location']);
    await page.locator('[name="custom.additional_note"]').fill('Saved custom detail');
    await page.locator('[name="phone"]').fill('123');
    assert.equal(await page.locator('form').evaluate(form => form.checkValidity()), false);
    await page.locator('[name="phone"]').fill('');
    await page.locator('[name="representativeIdentity"]').setInputFiles({ name:'fictional.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nSynthetic browser fixture') });
    await page.getByRole('button', { name:'Save progress now' }).click();
    await page.getByRole('status').filter({ hasText:'Progress saved to your account.' }).waitFor();
    await page.reload(); await page.addScriptTag({ content:bundle.outputFiles[0].text });
    await page.getByRole('status').filter({ hasText:'Saved progress restored' }).waitFor();
    assert.equal(await page.locator('[name="legalName"]').inputValue(), 'Fictional Partial Maker');
    assert.equal(await page.locator('[name="custom.additional_note"]').inputValue(), 'Saved custom detail');
    assert.equal(await page.locator('[name="phone"]').inputValue(), '');
    assert.equal(await sameAddress().isChecked(), true);
    assert.equal(await page.locator('[name="returnAddress"]').inputValue(), 'Fictional shared location');
    await sameAddress().uncheck();
    await page.locator('[name="returnAddress"]').fill('Different return location');
    assert.equal(await page.locator('[name="pickupAddress"]').inputValue(), 'Fictional shared location');
    await sameAddress().check();
    assert.equal(await page.locator('[name="returnAddress"]').inputValue(), 'Fictional shared location');
    assert.equal(await page.locator('form').evaluate(form => form.checkValidity()), true);
    assert.equal(await page.locator('body').evaluate(() => Object.values(localStorage).join('').includes('Fictional Partial Maker')), false);
    await submit().click(); await page.getByRole('heading', { name:'Application submitted' }).waitFor();
    assert.equal(submitted.get('phone'), '');
    assert.equal(submitted.get('pickupAddress'), 'Fictional shared location');
    assert.equal(submitted.get('returnAddress'), 'Fictional shared location');
    assert.equal(submitted.get('custom.contact_later'), null);
    assert.equal(submitted.get('representativeIdentity').name, 'fictional.pdf');
    assert.equal(draft, null, 'draft is removed only after confirmed submission');
    await page.goto('https://registration.test/dashboard'); await page.addScriptTag({ content:bundle.outputFiles[0].text });
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    assert.equal(await sameAddress().isChecked(), true);
    await page.locator('[name="returnAddress"]').fill('Updated dashboard location');
    assert.equal(await page.locator('[name="pickupAddress"]').inputValue(), 'Updated dashboard location');
    await sameAddress().uncheck();
    await page.locator('[name="returnAddress"]').fill('Separate dashboard return');
    await page.getByRole('button',{name:'Submit updated details for review',exact:true}).click();
    await page.getByRole('heading',{name:'Application submitted'}).waitFor();
    assert.equal(submitted.get('pickupAddress'), 'Updated dashboard location');
    assert.equal(submitted.get('returnAddress'), 'Separate dashboard return');
    assert.equal(submitted.get('revision'), '1');
  } finally { await browser.close(); }
});
