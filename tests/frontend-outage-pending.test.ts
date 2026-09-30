import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import type {FixtureBrowser} from './helpers/browser-fixture-types';
const playwrightPath=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
async function mounted(contents:string){
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';${contents}`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'frontend-navigation',setup(b){b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'navigation'}));b.onLoad({filter:/.*/,namespace:'navigation'},a=>({contents:a.path==='next/link'?'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}':'export function useRouter(){return {refresh(){}}}export function usePathname(){return "/contact"}',loader:'js',resolveDir:process.cwd()}));}}]});
 const {chromium}=await import(playwrightPath) as {chromium:{launch(options:object):Promise<FixtureBrowser>}};
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage();return {browser,page,script:bundle.outputFiles[0].text};
}
for(const known of [false,true])void test(`contact status outage has retry and keeps checkout blocked (known=${known})`,async()=>{
 const status={email:'buyer@example.test',phone:'+9779811111111',emailVerified:true,phoneVerified:true};
 const f=await mounted(`import {ContactVerificationPanel} from './components/account/contact-verification';window.events=[];createRoot(document.getElementById('root')).render(<ContactVerificationPanel ownerKey="buyer" initialStatus={${known?JSON.stringify(status):'null'}} onStatusChange={v=>window.events.push(v)}/>);`);
 let reads=0;
 try{
  await f.page.route('https://frontend.test/**',async route=>{const path=new URL(route.request().url()).pathname;return route.fulfill(path==='/'?{contentType:'text/html',body:'<title>Contact outage fixture</title><div id="root"></div>'}:{status:++reads===1?503:200,contentType:'application/json',body:reads===1?JSON.stringify({error:'Temporarily unavailable'}):JSON.stringify(status)});});
  await f.page.goto('https://frontend.test/');await f.page.addScriptTag({content:f.script});await f.page.getByText('Temporarily unavailable').waitFor();
  assert.equal(await f.page.getByText('Sign in to continue').count(),0);
  if(known)assert.equal(await f.page.getByText('buyer@example.test').count(),1);
  const events=await f.page.evaluate(()=> (window as unknown as {events:unknown[]}).events);assert.equal(events.at(-1),null,'outage cannot confer current checkout proof');
  await f.page.getByRole('button',{name:'Retry contact status'}).click();
  await f.page.waitForFunction(()=>Boolean((window as unknown as {events:unknown[]}).events.at(-1)));
  assert.equal(reads,2);assert.equal(await f.page.getByText('Temporarily unavailable').count(),0);
 }finally{await f.page.close();await f.browser.close();}
});
for(const kind of ['contact','footer'] as const)void test(`${kind} retries initial configuration outage and freezes custom answers while pending`,async()=>{
 const formId=kind==='contact'?'public.contact':'public.footer-feedback';
 const f=await mounted(`import {CustomerContactForm} from './components/layout/customer-contact-form';import {FooterFeedbackForm} from './components/layout/footer-feedback-form';createRoot(document.getElementById('root')).render(${kind==='contact'?'<CustomerContactForm kind="contact"/>':'<FooterFeedbackForm/>'});`);
 let reads=0;let posts=0;let release:(()=>Promise<void>)|undefined;const sent:FormData[]=[];
 async function completePending(){
  const deadline=Date.now()+30000;
  while(!release && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(release,'the pending feedback request must reach the route');
  const complete=release;release=undefined;await complete();
 }
 const config={formId,version:4,publishedAt:1,fields:[{id:'context_note',key:'context_note',label:'Context note',type:'short_text',required:true,order:0,status:'active'}]};
 try{
  await f.page.route('https://frontend.test/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if(path==='/')return route.fulfill({contentType:'text/html',body:'<title>Feedback fixture</title><div id="root"></div>'});
   if(path.startsWith('/api/forms/'))return route.fulfill({status:++reads===1?503:200,contentType:'application/json',body:reads===1?'{}':JSON.stringify({config})});
   const form=await new Request('https://frontend.test/api/feedback',{method:'POST',headers:{'content-type':await f.page.evaluate(()=> (window as unknown as {lastType:string}).lastType)},body:req.postData()!}).formData();sent.push(form);
   posts++;await new Promise<void>(resolve=>{release=async()=>{await route.fulfill({status:posts===1?503:200,contentType:'application/json',body:JSON.stringify(posts===1?{error:'Delivery unavailable'}:{ok:true})});resolve();};});
  });
  await f.page.goto('https://frontend.test/');
  await f.page.evaluate(()=>{const original=window.fetch;window.fetch=(input,init)=>{if(init?.body instanceof FormData){const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;const req=new Request(new URL(url,location.href),init);(window as unknown as {lastType:string}).lastType=req.headers.get('content-type')!;return original(req);}return original(input,init);};});
  await f.page.addScriptTag({content:f.script});const form=f.page.locator(`form[data-form-id="${formId}"]`);
  await form.getByText('Form configuration is unavailable. Please try again.').waitFor();
  await form.locator('[name="name"]').fill('Asha Rai');await form.getByRole('button',{name:'Refresh form',exact:true}).click();
  await form.locator('[name="custom.context_note"]').waitFor();assert.equal(await form.locator('[name="name"]').inputValue(),'Asha Rai');
  await form.locator('[name="email"]').fill('asha@example.test');await form.locator('[name="topic"]').selectOption('General question');
  if(kind==='contact')await form.locator('[name="subject"]').fill('A handmade order');
  await form.locator('[name="message"]').fill('Could you help with this handmade item?');await form.locator('[name="privacyAcknowledgement"]').check();
  const custom=form.locator('[name="custom.context_note"]');await custom.fill('First answer');await form.locator('button[type="submit"]').click();
  await f.page.waitForFunction(()=>document.querySelector('button[type="submit"]')?.textContent?.includes('Sending'));
  assert.equal(await custom.isDisabled(),true,'pending submission must freeze configured answers');
  await completePending();
  await form.getByText('Delivery unavailable').waitFor();assert.equal(await custom.isEnabled(),true);assert.equal(await custom.inputValue(),'First answer');
  await custom.fill('Corrected answer');await form.locator('button[type="submit"]').click();
  await f.page.waitForFunction(()=>document.querySelector('button[type="submit"]')?.textContent?.includes('Sending'));assert.equal(await custom.isDisabled(),true);
  await completePending();
  await form.getByText(/Thank you/).waitFor();assert.equal(await custom.inputValue(),'');
  assert.equal(sent[0].get('formVersion'),'4');assert.equal(sent[1].get('formVersion'),'4');assert.equal(sent[0].get('requestId'),sent[1].get('requestId'));assert.equal(sent[1].get('custom.context_note'),'Corrected answer');
 }finally{await f.page.close();await f.browser.close();}
});
