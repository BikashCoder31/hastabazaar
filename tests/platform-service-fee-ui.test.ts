import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerServiceFeeBreakdown } from '../components/commerce/customer-service-fee-breakdown';
import { SettingValuePreview } from '../components/admin/setting-value-preview';

void test('zero customer fees stay hidden in estimates, new orders and historical orders', () => {
 for (const source of ['estimate','recorded','historical'] as const) {
  const html=renderToStaticMarkup(createElement(CustomerServiceFeeBreakdown,{source,standardPaisa:0,waivedPaisa:0,netPaisa:0,campaignName:null}));
  assert.equal(html, '');
 }
 const historical=renderToStaticMarkup(createElement(CustomerServiceFeeBreakdown,{source:'historical',standardPaisa:1000,waivedPaisa:0,netPaisa:1000,campaignName:null}));
 assert.match(historical,/Recorded customer service fee/);
 assert.doesNotMatch(historical,/Standard customer service fee|Net customer service fee/);
});

void test('disabled customer fee settings preview shows Off with no amount', () => {
 const html = renderToStaticMarkup(createElement(SettingValuePreview, {
  value: { enabled: false, amountPaisa: 1000 }, summary: 'Off',
 }));
 assert.match(html, />Off</);
 assert.doesNotMatch(html, /NPR|Amount per order/);
});

// Browser plugin not available. This isolated mounted component uses fictional
// .test routes only; no current website, credentials or retained storage.
void test('Super Admin fee switch and NPR amount submit one prospective policy on desktop and mobile',async()=>{
 const bundle=await build({stdin:{sourcefile:'fee-settings-fixture.tsx',resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {BusinessSettingsManager} from './components/admin/business-settings-manager';
  createRoot(document.getElementById('root')).render(<BusinessSettingsManager actorId={'reviewer'} asOf={100} initialSettings={[{
   key:'platform_service_fee_policy',label:'Customer Platform service fee',description:'Once per order',sensitivity:'financial',changeControl:'controlled',effectiveMode:'effective_dated',snapshotOnTransaction:true,affectedSurfaces:['checkout','orders','finance'],requiredCapability:null,
   effective:{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:1000},source:'default',version:null,versionId:null,effectiveFrom:null,approvedBy:null},history:[]
  }]}/>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[
  {name:'fixture-link',setup:stubFixtureLink},
  {
   name: 'isolated-router',
   setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, ({ path }) => ({
     path,
     namespace: 'router-fixture',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'router-fixture' }, () => ({
     loader: 'js',
     contents: 'export const useRouter = () => ({ refresh() {} });',
    }));
   },
  },
 ]});
 for(const width of [1280,390]){
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
   const page=await browser.newPage({viewport:{width,height:900}}),posts:Array<Record<string,unknown>>=[];
   const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='https://fee-controls.test')return route.abort();
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
    if(url.pathname==='/api/forms/staff.business-settings-manager')return route.fulfill({json:{config:{formId:'staff.business-settings-manager',version:1,publishedAt:1,fields:[]}}});
    if(url.pathname==='/api/admin/business-settings'&&route.request().method()==='POST'){
     posts.push(route.request().postDataJSON());return route.fulfill({status:409,json:{error:'Isolated fixture: no settings were changed.'}});
    }
    return route.abort();
   });
   await page.goto('https://fee-controls.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
   const toggle=page.getByRole('checkbox',{name:'Enable Platform service fee'});
   await toggle.waitFor();assert.equal(await toggle.isChecked(),true);
   assert.equal(await page.getByLabel('Amount per order (NPR)').inputValue(),'10');
   await toggle.uncheck();await page.getByLabel('Saved amount for later (NPR)').fill('25.50');
   await page.getByLabel('Reason and expected impact').fill('Temporarily disable new order fees');
   const save=page.getByRole('button',{name:'Save changes',exact:true});await save.click();
   await page.getByText('Isolated fixture: no settings were changed.').waitFor();
   assert.equal(posts.length,1);assert.equal(posts[0].key,'platform_service_fee_policy');
   assert.deepEqual(posts[0].value,{enabled:false,amountPaisa:2550});
   assert.equal(posts[0].action,'save');assert.equal(posts[0].expectedVersion,0);
   assert.equal(await toggle.isChecked(),false);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 }
});
