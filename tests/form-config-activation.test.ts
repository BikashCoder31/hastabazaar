import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import type { FixtureBrowser } from './helpers/browser-fixture-types';

void test('inactive configurations skip requests, abort pending work, and require a fresh configuration on reactivation', async () => {
  const runtime = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(runtime) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({ stdin: { sourcefile: 'form-activation-fixture.tsx', resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {usePublishedFormConfig} from './components/forms/form-config-client';
    window.requests=[];
    window.fetch=(_url,options)=>new Promise(resolve=>{
      const request={signal:options.signal,complete(version){resolve(new Response(JSON.stringify({config:{formId:'shipping.console-request',version,publishedAt:1,fields:[]}}),{status:200}))}};
      window.requests.push(request);
    });
    function App(){const [enabled,setEnabled]=useState(false);const form=usePublishedFormConfig('shipping.console-request',{enabled});
      return <><button onClick={()=>setEnabled(value=>!value)}>Toggle</button><button onClick={form.refresh}>Refresh</button>
        <button disabled={!form.canSubmit}>Submit</button><output id="status">{form.status}</output><output id="version">{form.config?.version??''}</output><output id="message">{form.message}</output></>}
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage();
    await page.route('https://form-activation.test/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://form-activation.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const requests = () => page.evaluate(() => (window as unknown as { requests: unknown[] }).requests.length);
    const complete = (index: number, version: number) => page.evaluate(({ index, version }) => {
      (window as unknown as { requests: { complete(version: number): void }[] }).requests[index].complete(version);
    }, { index, version });
    const status = (value: string) => page.waitForFunction((value) => document.getElementById('status')?.textContent === value, value, { timeout: 3000 });
    const submit = page.getByRole('button', { name: 'Submit', exact: true });
    await status('inactive');
    assert.equal(await requests(), 0);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    assert.equal(await requests(), 0);
    assert.equal(await submit.isDisabled(), true);
    await page.getByRole('button', { name: 'Toggle', exact: true }).click();
    await status('loading');
    assert.equal(await requests(), 1);
    await page.getByRole('button', { name: 'Toggle', exact: true }).click();
    await status('inactive');
    assert.equal(await page.evaluate(() => (window as unknown as { requests: { signal: AbortSignal }[] }).requests[0].signal.aborted), true);
    await complete(0, 1);
    await status('inactive');
    assert.equal(await submit.isDisabled(), true);
    assert.equal(await page.locator('#version').textContent(), '');
    await page.getByRole('button', { name: 'Toggle', exact: true }).click();
    await status('loading');
    assert.equal(await requests(), 2);
    await complete(1, 2);
    await status('ready');
    assert.equal(await submit.isEnabled(), true);
    await page.getByRole('button', { name: 'Toggle', exact: true }).click();
    await status('inactive');
    await page.getByRole('button', { name: 'Toggle', exact: true }).click();
    await status('loading');
    assert.equal(await submit.isDisabled(), true, 'A previously ready configuration cannot authorize a reactivated form.');
    assert.equal(await page.locator('#version').textContent(), '');
    assert.equal(await requests(), 3);
    await complete(2, 3);
    await status('ready');
    assert.equal(await page.locator('#version').textContent(), '3');
    assert.equal(await page.locator('#message').textContent(), '');
  } finally { await browser.close(); }
});
