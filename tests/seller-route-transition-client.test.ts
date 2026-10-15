import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';

void test('owned transition form retains current-terms acceptance and required answers through an uncertain response and reload',async()=>{
  // oxlint-disable-next-line typescript/no-explicit-any -- Bundled Playwright provides runtime types.
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs') as any;
  const bundle=await build({stdin:{resolveDir:process.cwd(),sourcefile:'transition-fixture.tsx',loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RegisteredTransitionForm}from'./components/seller/registered-transition-form';createRoot(document.getElementById('root')).render(<RegisteredTransitionForm ownerId="maker-user" sellerId="maker"/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-boundaries',setup(b){
    b.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('/navigation')?'export function useRouter(){return {refresh(){}}}':'import React from "react";export default function Link(props){return React.createElement("a",props,props.children)}',loader:'js',resolveDir:process.cwd()}));
  }}]});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844}});let reloaded=false;
  const sent:[string,unknown][][]=[];
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Runtime route.
    await page.route('https://transition.test/**',async(route:any)=>{
      const url=new URL(route.request().url());
      if(url.pathname.startsWith('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'seller.managed-transition-request',version:reloaded?4:3,publishedAt:1,fields:[{id:'context_note',key:'context_note',type:'short_text',label:'Required review context',required:true,order:0,status:'active'}]}})});
      if(url.pathname==='/api/seller-applications/transition'&&route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sellerId:'maker',route:'managed_maker',stage:'active',terms:{context:reloaded?'new-context':'original-context',agreementVersion:'original-agreement',percent:reloaded?11:9,document:reloaded?'New agreement text':'Original English agreement text'},documents:[{id:'private-registration',kind:'business_registration',name:'Fictional registration.pdf',status:'pending'},{id:'private-pan',kind:'pan_certificate',name:'Fictional PAN.pdf',status:'pending'},{id:'private-bank',kind:'bank_verification',name:'Fictional bank.pdf',status:'pending'}],transitions:[]})});
      if(url.pathname==='/api/seller-applications/transition') {
        const request=new Request(url,{method:'POST',headers:{'content-type':route.request().headers()['content-type']},body:route.request().postDataBuffer()});
        const data=await request.formData();const entries=[] as [string,unknown][];
        for(const [key,value] of data)entries.push([key,typeof value==='string'?value:{name:value.name,type:value.type,size:value.size}]);sent.push(entries);
        return route.fulfill({status:sent.length===1?503:200,contentType:'application/json',body:JSON.stringify(sent.length===1?{error:'Uncertain fictional transition response'}:{ok:true,id:'transition',requestId:data.get('requestId'),sellerId:'maker',simulation:true})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});
    });
    async function mount(){await page.goto('https://transition.test/form');await page.addScriptTag({content:bundle.outputFiles[0].text});}
    await mount();
    const form=page.locator('form[data-form-id="seller.managed-transition-request"]');
    for(const [name,value] of [['legalName','Fictional registered company'],['registrationAuthority','Fictional company office'],['registrationNumber','SIM-REG-123'],['taxRegistrationNumber','SIM-PAN-123'],['payoutAccountReference','SIM-REGISTERED-RECEIVING']])await form.locator(`[name="${name}"]`).fill(value);
    await form.locator('[name="businessRegistrationId"]').selectOption('private-registration');await form.locator('[name="panCertificateId"]').selectOption('private-pan');await form.locator('[name="bankVerificationId"]').selectOption('private-bank');
    await form.getByLabel('I accept the displayed English seller agreement and commission terms',{exact:true}).check();
    await form.getByLabel('Required review context',{exact:false}).fill('Original private review context');
    await form.getByRole('button',{name:'Submit transition for review'}).click();
    await page.getByText('Uncertain fictional transition response').waitFor();assert.equal(sent.length,1);
    reloaded=true;await mount();
    await page.getByRole('button',{name:'Retry original transition request'}).waitFor();
    assert.equal(await form.locator('[name="legalName"]').inputValue(),'Fictional registered company');
    assert.equal(await form.locator('[name="custom.context_note"]').inputValue(),'Original private review context');
    await page.getByText('Read the English Registered Seller agreement · 9% commission',{exact:true}).waitFor();
    await form.getByRole('button',{name:'Retry original transition request'}).click();
    await page.getByText(/Transition saved for independent review/).waitFor();
    assert.equal(sent.length,2);assert.deepEqual(sent[1],sent[0]);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('hastabazaar:registered-transition:maker-user:maker')),null);
  }finally{await browser.close();}
});
