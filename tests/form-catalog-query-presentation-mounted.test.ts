import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

void test('published tracking text keeps its private lookup body and does not store query answers', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- External browser runtime supplies this type.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'query-tracking-fixture.tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {OrderTracker} from './components/commerce/order-tracker';
    createRoot(document.getElementById('root')!).render(<OrderTracker initialOrder="HK-FICTIONAL"/>);
  `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{name:'query-next-link',setup(bundler){
    bundler.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
    bundler.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default function Link(props){return props.children}',loader:'js'}));
  }}] });
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage();
  const requests: unknown[] = [];
  const config = {formId:'commerce.order-tracking',version:1,publishedAt:1,fields:[
    {id:'orderNumber',key:'orderNumber',type:'short_text',label:'Purchase reference',placeholder:'Your purchase reference',
      helpText:'Use the confirmation reference.',required:true,status:'active',order:0},
    {id:'email',key:'email',type:'email',label:'Purchase email',placeholder:'Your checkout email',
      helpText:'Use the email from checkout.',required:true,status:'active',order:1},
  ]};
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- External browser runtime supplies this type.
    await page.route('https://query-fixture.test/**',(route:any)=>{
      const request=route.request();
      const path=new URL(request.url()).pathname;
      if(path==='/api/forms/commerce.order-tracking')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config})});
      if(path==='/api/orders/track'){
        requests.push(JSON.parse(request.postData() ?? '{}'));
        return route.fulfill({status:404,contentType:'application/json',body:'{"error":"Your order could not be found."}'});
      }
      return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});
    });
    await page.goto('https://query-fixture.test/');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByPlaceholder('Your purchase reference').waitFor();
    await page.getByPlaceholder('Your checkout email').fill('stranger@example.test');
    assert.equal(await page.locator('[name="orderNumber"]').getAttribute('maxlength'),'80');
    assert.equal(await page.locator('[name="email"]').getAttribute('maxlength'),'254');
    await page.getByRole('button',{name:'Track order',exact:true}).click();
    await page.getByRole('alert').getByText('Your order could not be found.').waitFor();
    assert.deepEqual(requests,[{orderNumber:'HK-FICTIONAL',email:'stranger@example.test'}]);
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    assert.equal(await page.getByRole('region',{name:'Order progress'}).count(),0);
  } finally {await page.close();await browser.close();}
});
