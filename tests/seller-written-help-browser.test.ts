import type {Browser as TestBrowser,Route as BrowserRoute} from 'playwright-core';
import './helpers/written-guidance-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {sellerRegistrationScopeFixture} from './helpers/seller-registration-scope-fixture';

void test('written help works with the keyboard, rechecks request access, and opens contact with seller support selected',{timeout:60000},async()=>{
 const f=await sellerRegistrationScopeFixture();let browser!:TestBrowser;try{
  f.select('registration-c');const Help=(await import('../app/help/page')).default,Requests=(await import('../app/seller/requests/page')).default;
  const Contact = (await import('../app/contact-us/page')).default;
  const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/seller/registration-guide.tsx';\n@source '../app/help/page.tsx';\n@source '../app/seller/requests/page.tsx';"),{from:resolve('app/globals.css')})).css;
  await mkdir('.test-artifacts/t32',{recursive:true});const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});const context=await browser.newContext({viewport:{width:390,height:844}}),origin='https://written-help.test';let mediaRequests=0;
  await context.route('**/*',async(route:BrowserRoute)=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(/\.(?:mp4|webm|mp3|wav|vtt)(?:$|\?)/.test(url.pathname)){mediaRequests++;return route.abort();}if(url.pathname==='/fixture.css')return route.fulfill({status:200,contentType:'text/css',body:css});try{
    const searchParams = Promise.resolve(Object.fromEntries(url.searchParams));
    const element = url.pathname === '/help' ? await Help()
      : url.pathname === '/seller/requests' ? await Requests({ searchParams })
      : url.pathname === '/contact-us' ? await Contact({ searchParams }) : null;
    if(!element)return route.abort();return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body>'+renderToStaticMarkup(element)+'</body></html>'});}catch{return route.fulfill({status:403,contentType:'text/html',body:'<p>Current account access is required.</p>'});}});
  const page=await context.newPage();await page.goto(origin+'/help#seller-guide');const guide=page.locator('#seller-guide'),steps=guide.locator('details'),summary=guide.locator('summary');assert.equal(await steps.getAttribute('open'),null);await summary.focus();await page.keyboard.press('Space');assert.notEqual(await steps.getAttribute('open'),null);await guide.getByRole('heading',{name:'Register with available details',exact:true}).waitFor();assert.equal(await guide.locator('input,select,textarea,button,form,video,audio').count(),0,'Reading help introduces no mandatory fields or media');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await guide.getByRole('heading',{name:/Written seller guide/}).scrollIntoViewIfNeeded();await page.screenshot({path:'.test-artifacts/t32/written-guide-mobile.png',fullPage:false});assert.equal(mediaRequests,0);
  await guide.getByRole('link',{name:'Requests & help',exact:true}).click();await page.getByRole('heading',{name:'Requests & help',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/seller/requests');
  await page.locator('header').getByRole('link', { name: 'Ask a question', exact: true }).click();
  await page.getByRole('heading', { name: 'Send us a message', exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/contact-us');
  const topic = page.locator('form[data-form-id="public.contact"] select[name="topic"]');
  assert.equal(await topic.inputValue(), 'Seller support');
  await page.goto(origin + '/contact-us');
  assert.equal(await topic.inputValue(), '');
  await page.goto(origin + '/seller/requests');
  globalThis.registrationScopeIdentity=null;assert.equal((await page.reload())?.status(),403);assert.equal(await page.getByRole('heading',{name:'Requests & help',exact:true}).count(),0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_profiles WHERE user_id='registration-c'").get()!.n,0);
 }finally{await browser?.close();f.dispose();}
});
