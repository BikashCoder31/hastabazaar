import { stubFixtureImage, stubFixtureLink } from './helpers/browser-fixture-link';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

void test('staff classification keeps an opaque request across lost response and reload', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- The installed browser package supplies this runtime type.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'staff-context-retry.tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { ProductClassificationForm } from './components/admin/product-classification-form';
    createRoot(document.getElementById('root')!).render(<ProductClassificationForm productId="product-one"
      categoryId="category-one" occasionIds={['occasion-one']}
      categories={[{ id:'category-one', nameEn:'Category one' }] as any}
      occasions={[{ id:'occasion-one', nameEn:'Occasion one' }] as any} />);
  `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'staff-context-stubs', setup(bundler) {
    stubFixtureLink(bundler);
    bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
    bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'fixture' }));
    bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
      contents: args.path === 'navigation'
        ? 'export function useRouter(){return {refresh(){}}}'
        : 'export function usePublishedFormConfig(formId){return {config:{formId,version:1,publishedAt:1,fields:[]},canSubmit:true,status:"ready",message:"",handleSubmissionResponse(){}}}',
      loader: 'js',
    }));
  } }], });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const requests: Array<Record<string, unknown>> = [];
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Playwright's runtime route type is supplied by the dependency.
    await page.route('https://staff-retry.test/**', (route: any) => {
      if (route.request().method() === 'PUT') {
        requests.push(JSON.parse(route.request().postData() ?? '{}'));
        if (requests.length === 1) return route.abort('failed');
        if (requests.length >= 4) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
        return route.fulfill({ status: 409, contentType: 'application/json',
          body: '{"error":"Request reference belongs to different content."}' });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    const mount = async () => {
      await page.goto('https://staff-retry.test/');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.getByRole('button', { name: 'Save classification' }).waitFor();
    };
    await mount();
    await page.getByRole('button', { name: 'Save classification' }).click();
    await page.getByRole('alert').getByText(/Failed to fetch|couldn.t connect|could not be saved/i).waitFor({ timeout: 5000 });
    const original = String(requests[0].idempotencyKey);
    assert.match(original, /^[0-9a-f-]{36}$/i);
    await mount();
    await page.getByRole('button', { name: 'Save classification' }).click();
    await page.getByRole('alert').getByText(/different content/i).waitFor();
    assert.equal(requests[1].idempotencyKey, original);
    assert.ok((await page.evaluate(() => Object.values(sessionStorage))).includes(original));
    page.once('dialog', (dialog: {dismiss():Promise<void>}) => void dialog.dismiss());
    await page.getByRole('button', { name: 'Start a new attempt' }).click();
    const thirdResponse=page.waitForResponse((response: {url():string}) => new URL(response.url()).pathname.endsWith('/classification'));
    await page.getByRole('button', { name: 'Save classification' }).click();
    await thirdResponse;
    assert.equal(requests[2].idempotencyKey, original);
    page.once('dialog', (dialog: {accept():Promise<void>}) => void dialog.accept());
    await page.getByRole('button', { name: 'Start a new attempt' }).click();
    const fourthResponse=page.waitForResponse((response: {url():string}) => new URL(response.url()).pathname.endsWith('/classification'));
    await page.getByRole('button', { name: 'Save classification' }).click();
    await fourthResponse;
    assert.notEqual(requests[3].idempotencyKey, original);
    await page.getByText('Classification saved.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Object.values(sessionStorage).length), 0);
  } finally { await page.close(); await browser.close(); }
});

void test('staff catalogue, exception, payout, privacy and both rider sites require confirmed retry reset', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- The installed browser package supplies this runtime type.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'staff-context-retry-all.tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {CatalogManager} from './components/admin/catalog-manager';
    import {ExceptionWorkForm} from './components/admin/exception-work-form';
    import {PayoutRequestActions} from './components/admin/payout-request-actions';
    import {PrivacyActions} from './components/admin/privacy-actions';
    import {RiderAdminAction,RiderPolicyForm} from './components/admin/rider-controls';
    const mode=new URLSearchParams(location.search).get('mode');
    const element=mode==='catalog'?<CatalogManager categories={[]} occasions={[]}/>
      :mode==='exception'?<ExceptionWorkForm jobs={[{id:'job-one',status:'delivery_failed'}]} owners={[]} finance={false}/>
      :mode==='payout'?<PayoutRequestActions id="payout-one"/>
      :mode==='privacy'?<PrivacyActions id="privacy-one" canDecide={true} status="submitted" requestType="correction" assignedToCurrentStaff={false}/>
      :mode==='rider'?<RiderAdminAction action="review" fields={{userId:'rider-one',version:0}} label="Record decision"/>
      :<RiderPolicyForm policy={{version:0,openBox:0,otpScope:'off'}}/>;
    createRoot(document.getElementById('root')!).render(element);
  `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'staff-context-retry-stubs', setup(bundler) {
    stubFixtureLink(bundler);
    stubFixtureImage(bundler);
    bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
    bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'fixture' }));
    bundler.onResolve({ filter: /^@\/components\/admin\/confirm-operation$/ }, () => ({ path: 'confirm', namespace: 'fixture' }));
    bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
      contents: args.path === 'navigation' ? 'export function useRouter(){return {refresh(){}}}'
        : args.path === 'confirm' ? 'export function ConfirmOperation(){return null}'
        : 'export function usePublishedFormConfig(formId){return {config:{formId,version:1,publishedAt:1,fields:[]},canSubmit:true,status:"ready",message:"",handleSubmissionResponse(){globalThis.staleCalls=(globalThis.staleCalls||0)+1},refresh(){}}}',
      loader: 'js',
    }));
  } }], });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const targets = [
    { mode:'catalog', formId:'staff.catalog', path:'/api/admin/catalog', button:'Save entry' },
    { mode:'exception', formId:'staff.exception-work', path:'/api/admin/exception-work', button:'Report exception follow-up' },
    { mode:'payout', formId:'staff.payout-request-action', path:'/api/admin/payout-requests/payout-one', button:'Save decision' },
    { mode:'privacy', formId:'staff.privacy-action', path:'/api/admin/privacy/privacy-one', button:'Save decision' },
    { mode:'rider', formId:'staff.rider-control-1', path:'/api/admin/riders', button:'Record decision' },
    { mode:'policy', formId:'staff.rider-control-2', path:'/api/admin/riders', button:'Save settings' },
  ] as const;
  try {
    for (const target of targets) {
      const page = await browser.newPage();
      const bodies: Record<string, unknown>[] = [];
      try {
        // oxlint-disable-next-line typescript/no-explicit-any -- Playwright supplies this route at runtime.
        await page.route('https://staff-context-retry.test/**', (route: any) => {
          if (new URL(route.request().url()).pathname === target.path && route.request().method() !== 'GET') {
            bodies.push(JSON.parse(route.request().postData() ?? '{}'));
            if (bodies.length === 1) return route.abort('failed');
            if (bodies.length < 4) return route.fulfill({ status: 409, contentType: 'application/json',
              body: '{"error":"Request reference belongs to different content."}' });
            return route.fulfill({ status: 200, contentType: 'application/json',
              body: bodies.length === 4 ? '{}' : target.mode === 'catalog' || target.mode === 'exception' ? '{"id":"saved-one"}' : '{"ok":true}' });
          }
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
        });
        const mount = async () => {
          await page.goto(`https://staff-context-retry.test/?mode=${target.mode}`);
          await page.addScriptTag({ content: bundle.outputFiles[0].text });
          if (target.mode === 'catalog') await page.getByRole('button', { name: 'Add category' }).click();
          const form = page.locator(`form[data-form-id="${target.formId}"]`);
          if (target.mode === 'catalog') {
            await form.getByLabel('Display name').fill('Fictional Category');
            await form.getByLabel('URL slug').fill('fictional-category');
          } else if (target.mode === 'exception') {
            await form.getByLabel('Next action *').fill('Call the customer and review evidence');
            await form.getByLabel('Report details and evidence references *').fill('Fictional failed delivery evidence reviewed');
          } else if (target.mode === 'payout') await form.getByLabel('Review note').fill('Fictional seller payout decision');
          else if (target.mode === 'privacy') await form.getByLabel('Investigation or decision note').fill('Fictional data rights investigation');
          else if (target.mode === 'rider') await form.getByLabel('Reason / next action *').fill('Fictional rider evidence reviewed');
          return form;
        };
        let form = await mount();
        const submit = async () => form.getByRole('button', { name: target.button }).click();
        await submit();
        await page.waitForFunction(() => document.body.textContent?.includes('Start a new'), undefined, { timeout: 5000 })
          .catch(async () => { throw new Error(`${target.mode}: no retry notice; requests=${bodies.length}; text=${await page.locator('body').innerText()}`); });
        const first = String(bodies[0].requestId ?? bodies[0].idempotencyKey);
        assert.match(first, /^[0-9a-f-]{36}$/i, target.mode);
        assert.ok((await page.evaluate(() => Object.values(sessionStorage))).includes(first), target.mode);
        form = await mount();
        await submit();
        await page.getByText('Request reference belongs to different content.').waitFor({ timeout: 5000 });
        assert.equal(bodies[1].requestId ?? bodies[1].idempotencyKey, first, target.mode);
        assert.equal(await page.evaluate(() => (globalThis as {staleCalls?:number}).staleCalls??0), 0,
          `${target.mode}: a domain 409 is not a stale form`);
        const resetName=target.mode==='privacy' ? /Start a new decision attempt/i : /Start a new attempt/i;
        page.once('dialog', (dialog: {dismiss():Promise<void>}) => void dialog.dismiss());
        await page.getByRole('button', { name: resetName }).click();
        const thirdResponse=page.waitForResponse((response: {url():string}) => new URL(response.url()).pathname === target.path);
        await submit();
        await thirdResponse;
        assert.equal(bodies[2].requestId ?? bodies[2].idempotencyKey, first, `${target.mode}: cancelled reset`);
        page.once('dialog', (dialog: {accept():Promise<void>}) => void dialog.accept());
        await page.getByRole('button', { name: resetName }).click();
        const fourthResponse=page.waitForResponse((response: {url():string}) => new URL(response.url()).pathname === target.path);
        await submit();
        await fourthResponse;
        assert.notEqual(bodies[3].requestId ?? bodies[3].idempotencyKey, first, `${target.mode}: confirmed reset`);
        const uncertain = String(bodies[3].requestId ?? bodies[3].idempotencyKey);
        await page.getByText(/response could not be verified/i).waitFor({ timeout: 5000 });
        assert.ok((await page.evaluate(() => Object.values(sessionStorage))).includes(uncertain),
          `${target.mode}: ambiguous 2xx must keep the same attempt`);
        const fifthResponse=page.waitForResponse((response: {url():string}) => new URL(response.url()).pathname === target.path);
        await submit();
        await fifthResponse;
        assert.equal(bodies[4].requestId ?? bodies[4].idempotencyKey, uncertain,
          `${target.mode}: retry after ambiguous 2xx`);
        await page.waitForFunction((id:string) => !Object.values(sessionStorage).includes(id), uncertain);
        assert.ok((await page.evaluate(() => Object.values(sessionStorage))).every((value:string) =>
          !value.includes('Fictional')), `${target.mode}: no form values in storage`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
});
