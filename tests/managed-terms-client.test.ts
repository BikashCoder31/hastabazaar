import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
void test('upcoming terms retain original private answers and form through reload until a verified receipt',async()=>{
 // oxlint-disable-next-line typescript/no-explicit-any -- Bundled browser runtime.
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs') as any;
 const bundle=await build({stdin:{resolveDir:process.cwd(),sourcefile:'terms-fixture.tsx',loader:'tsx',contents:`
 import React from 'react';import{createRoot}from'react-dom/client';import{ManagedTermsAcceptance}from'./components/seller/managed-terms-acceptance';import{ManagedTermsRecovery}from'./components/seller/managed-terms-recovery';
 const offer={id:'future-offer',context:'original-context',language:'en',retentionBps:1200,agreementVersion:'agreement',effectiveFrom:1900000000000,settingVersionIds:{account:null,retention:'future-rate'},snapshot:{company:{legalName:'Fictional company'},companyAccount:{storeName:'Fictional store'},terms:['Original future selling terms']}};
 const replacement=location.pathname==='/reload';const current=replacement?{...offer,id:'replacement-offer',context:'replacement-context'}:offer;
 createRoot(document.getElementById('root')).render(<><ManagedTermsAcceptance ownerId="owner" sellerId="maker" offer={current} future alreadyAccepted={false}/><ManagedTermsRecovery ownerId="owner" sellerId="maker" visibleOfferIds={[current.id]}/></>);
 `},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useRouter(){return {refresh(){}}}',loader:'js'}));}}]});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:390,height:844}});const sent:Record<string,unknown>[]=[];let version=1;
 try {
  // oxlint-disable-next-line typescript/no-explicit-any -- Runtime route.
  await page.route('https://terms.test/**',async(route:any)=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'seller.managed-terms-acceptance',version,publishedAt:1,fields:[{id:'private_context',key:'private_context',type:'short_text',label:'Private review context',required:true,order:0,status:'active'}]}})});
   if(url.pathname==='/api/seller-applications/managed-terms'){
    const body=JSON.parse(route.request().postData());sent.push(body);
    return route.fulfill({status:sent.length===1?503:200,contentType:'application/json',body:JSON.stringify(sent.length===1?{error:'Uncertain acceptance'}:sent.length===2?{ok:true}:{ok:true,requestId:body.requestId,sellerId:'maker',offerId:body.offerId,formVersion:body.formVersion,detailId:'accepted-detail'})});
   }
   return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});
  });
  async function mount(path:string){await page.goto('https://terms.test'+path);await page.addScriptTag({content:bundle.outputFiles[0].text});}
  await mount('/initial');await page.getByLabel(/I have read and accept/).check();await page.getByLabel('Private review context',{exact:false}).fill('Original private terms answer');
  await page.getByRole('button',{name:'Accept these terms'}).click();await page.getByText('Uncertain acceptance',{exact:true}).waitFor();
  version=2;await mount('/reload');await page.getByRole('button',{name:'Retry original acceptance'}).click();
  await page.getByText(/result could not be verified/).waitFor();await page.getByRole('button',{name:'Retry original acceptance'}).click();
  await page.getByText('Terms accepted. Earlier sales keep their original terms.',{exact:true}).waitFor();
  assert.equal(sent.length,3);assert.deepEqual(sent[1],sent[0]);assert.deepEqual(sent[2],sent[0]);assert.equal(sent[0].formVersion,1);
  assert.deepEqual(sent[0].customAnswers,[{fieldId:'private_context',value:'Original private terms answer'}]);
  const earlier=page.getByRole('heading',{name:'Earlier recorded company-store terms',exact:true}).locator('..');
  assert.equal(await earlier.getByRole('button',{name:'Accept these terms',exact:true}).count(),0);
  assert.equal(await earlier.getByRole('button',{name:'Retry original acceptance',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('hastabazaar:managed-terms:')).length),0);
 }finally{await browser.close();}
});
