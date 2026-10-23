import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import { earnedMaker } from './helpers/company-store-financial-fixture';
import { acceptManagedTerms, getAcceptedManagedTerms, getManagedTermsOffers, managedTermsFormId } from '../lib/managed-commerce/accepted-terms';
import { createBusinessSettingDraft, getEffectiveBusinessSetting, publishBusinessSettingDraft } from '../lib/db/repositories/business-settings';
import type { BusinessSettingKey, BusinessSettingValue } from '../lib/configuration/types';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRegisteredSellerTerms } from '../lib/db/repositories/marketplace-settings';
import { getManagedMakerApplicationTerms } from '../lib/db/repositories/managed-maker-details';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from '../lib/sellers/managed-identity';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';

void test('application browser keeps each available route usable and refuses absent terms even after a forged selection',async()=>{
 const f=await companyStoreMakerFixture();
 // Existing tests use isolated Chrome with all network requests intercepted. No checked local preview is launched.
 // oxlint-disable-next-line typescript/no-explicit-any -- Existing browser runtime contract.
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs') as any;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const output=await mkdtemp(fileURLToPath(new URL('../.superpowers/sdd/2026-10-23-customer-fee-waiver-correction/task-6-ui-',import.meta.url)));
 try {
  for(const key of ['independent_seller_commission_bps','managed_sale_linked_platform_retention_bps'] as const){
   const draft=await createBusinessSettingDraft(f.db,{key,value:1200,actorId:'reviewer',reason:'SIMULATED Task 6 browser terms',requestId:`ui-draft-${key}`,now:f.now-16*86_400_000});
   await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:f.now+1,
    reason:'SIMULATED Task 6 browser terms publication',requestId:`ui-publish-${key}`,now:f.now-16*86_400_000});
  }
  const terms={registered:await getRegisteredSellerTerms(f.db,f.now+1),managed:await getManagedMakerApplicationTerms(f.db,f.now+1,MANAGED_SUPPLIER_AGREEMENT_VERSION)};
  const bundle=await build({stdin:{resolveDir:process.cwd(),sourcefile:'task6-application-fixture.tsx',loader:'tsx',contents:`
   import React from 'react';import{createRoot}from'react-dom/client';import{SellerApplicationForm}from'./components/seller/seller-application-form';
   const terms=${JSON.stringify(terms)};const [registered,managed]=location.pathname.slice(1).split('/').map(x=>x==='ready');
   createRoot(document.getElementById('root')).render(<SellerApplicationForm accountEmail="applicant@local.hastabazaar.test" registeredTerms={registered?terms.registered:undefined} managedTerms={managed?terms.managed:undefined}/>);
  `},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
  for(const [registered,managed] of [[true,false],[false,true],[true,true],[false,false]]){
   const page=await browser.newPage({viewport:{width:390,height:844}}),errors:string[]=[],submissions:string[]=[];
   page.on('pageerror',(error:Error)=>errors.push(error.message));
   // oxlint-disable-next-line typescript/no-explicit-any -- Existing browser runtime contract.
   page.on('console',(message:any)=>{if(['warning','error'].includes(message.type()))errors.push(message.text());});
   // oxlint-disable-next-line typescript/no-explicit-any -- Existing browser runtime contract.
   await page.route('**/*',async(route:any)=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'seller.application',version:1,publishedAt:1,fields:[]}})});
    if(url.pathname==='/api/seller-applications'){submissions.push(route.request().postData());return route.fulfill({status:500,body:'Unexpected submission'});}
    return route.fulfill({status:200,contentType:'text/html',body:'<title>Task 6 private application fixture</title><div id="root"></div>'});
   });
   const suffix=`${registered?'ready':'unavailable'}/${managed?'ready':'unavailable'}`;
   await page.goto(`https://application.test/${suffix}`);await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.getByText('Choose how you want to sell',{exact:true}).waitFor();
   assert.equal(await page.title(),'Task 6 private application fixture');assert.equal(page.url(),`https://application.test/${suffix}`);
   const select=page.getByLabel('Your onboarding route',{exact:false}),submit=page.getByRole('button',{name:'Submit for review',exact:true});
   assert.equal(await select.inputValue(),registered||!managed?'yes':'no');
   if(registered||managed){await page.waitForFunction(()=>!(document.querySelector('button[type="submit"]') as HTMLButtonElement)?.disabled);}
   else assert.equal(await submit.isDisabled(),true);
   if(registered)assert.equal(await page.locator('input[name="sellerAgreementContext"]').inputValue(),terms.registered.context);
   if(managed&&!registered)assert.equal(await page.locator('input[name="managedAgreementContext"]').inputValue(),terms.managed.context);
   if(registered&&managed){await select.selectOption('no');assert.equal(await page.locator('input[name="managedAgreementContext"]').inputValue(),terms.managed.context);assert.equal(await submit.isEnabled(),true);await select.selectOption('yes');}
   if(!registered)assert.equal(await page.getByText(/Registered Seller applications are unavailable/).count(),1);
   if(!managed)assert.equal(await page.getByText(/Managed Maker applications are unavailable/).count(),1);
   await page.screenshot({path:path.join(output,`${registered?'registered':'no-registered'}-${managed?'managed':'no-managed'}.png`)});
   if(!registered||!managed){
    await select.evaluate((element:HTMLSelectElement,value:string)=>{element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));},registered?'no':'yes');
    assert.equal(await submit.isDisabled(),true);
    await page.locator('form').evaluate((form:HTMLFormElement)=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.deepEqual(submissions,[]);
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log(`Task 6 UI evidence: ${output}`);
 }finally{await browser.close();f.dispose();}
});

void test('managed 12% renewal binds both real published source IDs and preserves old 9% orders and acceptance',async()=>{
 const f=await earnedMaker('calculated');
 try {
  const oldDetails=f.sqlite.prepare('SELECT * FROM managed_maker_application_details ORDER BY id').all();
  const moneyTables=['orders','order_items','managed_commercial_snapshots','managed_entitlements'] as const;
  const oldMoney=moneyTables.map(table=>f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
  assert.equal(f.sqlite.prepare('SELECT platform_retention_bps FROM managed_commercial_snapshots').get()?.platform_retention_bps,900);
  assert.equal(f.sqlite.prepare('SELECT platform_retained_paisa FROM managed_commercial_snapshots').get()?.platform_retained_paisa,9000);
  assert.equal(f.sqlite.prepare('SELECT maker_entitlement_paisa FROM managed_commercial_snapshots').get()?.maker_entitlement_paisa,91000);
  async function publish<K extends BusinessSettingKey>(key:K,value:BusinessSettingValue<K>,effectiveFrom:number,tag:string) {
   const draft=await createBusinessSettingDraft(f.db,{key,value,actorId:'reviewer',reason:'SIMULATED Task 6 source-bound terms',requestId:`terms-draft-${tag}`,now:f.now+10});
   await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:1,effectiveFrom,
    reason:'SIMULATED Task 6 source-bound publication',requestId:`terms-publish-${tag}`,now:f.now+10});
   return draft.id;
  }
  const start=f.now+100_000;
  const account=(await getEffectiveBusinessSetting(f.db,'managed_maker_company_account',f.now)).value;
  const accountId=await publish('managed_maker_company_account',account,start,'company');
  const retentionId=await publish('managed_sale_linked_platform_retention_bps',1200,start,'retention');
  const offers=await getManagedTermsOffers(f.db,f.sellerId,f.now+11),future=offers.upcoming[0];
  assert.equal(offers.current.retentionBps,900);assert.equal(future.retentionBps,1200);
  assert.deepEqual(future.settingVersionIds,{account:accountId,retention:retentionId});
  f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,
   updated_by,updated_at,published_by,published_at,last_request_id) VALUES(?,?,1,'published',?,'SIMULATED Task 6 form','reviewer',1,'reviewer',1,'reviewer',1,'task6-renewal-form')`)
   .run('task6-terms-form',managedTermsFormId,JSON.stringify({formId:managedTermsFormId,fields:[]}));
  const input={sellerId:f.sellerId,actorId:f.actorId,offerId:future.id,context:future.context,language:'en' as const,
   requestId:'task6-accept-twelve-percent',now:f.now+12,form:{versionId:'task6-terms-form',answers:{formId:managedTermsFormId,version:1,answers:[]}}};
  await assert.rejects(()=>acceptManagedTerms(f.db,{...input,context:offers.current.context}),/changed|cancelled/);
  assert.equal(await getAcceptedManagedTerms(f.db,f.sellerId,start),null);
  const receipt=await acceptManagedTerms(f.db,input);
  assert.deepEqual(await acceptManagedTerms(f.db,input),receipt);
  assert.equal((await getAcceptedManagedTerms(f.db,f.sellerId,start-1))?.retentionBps,900);
  assert.equal((await getAcceptedManagedTerms(f.db,f.sellerId,start))?.detailId,receipt.detailId);
  const stored=JSON.parse(String(f.sqlite.prepare('SELECT agreement_snapshot_json FROM managed_maker_application_details WHERE id=?').get(receipt.detailId)?.agreement_snapshot_json));
  assert.deepEqual(stored.settingVersionIds,{account:accountId,retention:retentionId});
  const replacementId=await publish('managed_maker_company_account',account,start+100_000,'same-company-new-source');
  const replacement=(await getManagedTermsOffers(f.db,f.sellerId,start+100_000)).current;
  assert.equal(replacement.context,future.context,'identical terms text is insufficient when source IDs differ');
  assert.notEqual(replacement.id,future.id);
  assert.deepEqual(replacement.settingVersionIds,{account:replacementId,retention:retentionId});
  assert.equal(await getAcceptedManagedTerms(f.db,f.sellerId,start+100_000),null);
  await assert.rejects(()=>acceptManagedTerms(f.db,{...input,requestId:'task6-stale-source-id',now:start+100_000}),/changed|cancelled/);
  const renewed=await acceptManagedTerms(f.db,{...input,offerId:replacement.id,context:replacement.context,requestId:'task6-replacement-source',now:start+100_000});
  assert.equal((await getAcceptedManagedTerms(f.db,f.sellerId,start+100_000))?.detailId,renewed.detailId);
  for(const old of oldDetails)assert.deepEqual(f.sqlite.prepare('SELECT * FROM managed_maker_application_details WHERE id=?').get(old.id),old);
  moneyTables.forEach((table,index)=>assert.deepEqual(f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),oldMoney[index],table));
 }finally{f.dispose();}
});
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
