import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

void test('uncertain response retains the original operation through reload and changed payment state',async()=>{
  // oxlint-disable-next-line typescript/no-explicit-any -- Runtime-supplied Playwright types.
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs') as any;
  const bundle=await build({stdin:{resolveDir:process.cwd(),sourcefile:'finance-fixture.tsx',loader:'tsx',contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {ManagedSettlementControls} from './components/admin/managed-settlement-controls';
    const changed=location.pathname==='/reloaded';
    const maker={sellerId:'maker',name:'Fictional maker',stage:'active',route:'managed_maker',acceptedTermsReady:true,
      summary:{calculatedPaisa:91000,earnedPaisa:91000,heldPaisa:0,payablePaisa:changed?0:91000,reservedPaisa:changed?91000:0,paidPaisa:0,refundOffsetPaisa:0,balancePaisa:91000,needsReconciliation:false},
      preview:{amountPaisa:changed?0:91000,balancePaisa:91000,receivingReference:'SIM-REVIEWED',needsReview:false,hasUnpaidReservation:changed,snapshotDigest:'a'.repeat(64)},
      payments:[],paymentCount:changed?1:0,blockers:[],moreBlockers:false};
    createRoot(document.getElementById('root')).render(<ManagedSettlementControls ownerId="reviewer" workspace={{makers:[maker],nextCursor:null}} asOf={1800000000000} simulationAllowed/>);
  `},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'navigation',setup(b){
    b.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('/navigation') ? 'export function useRouter(){return {refresh(){}}}' : 'import React from "react";export default function Link(props){return React.createElement("a",props,props.children)}',loader:'js',resolveDir:process.cwd()}));
  }}]});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const sent:Record<string,unknown>[]=[];
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Runtime-supplied Playwright route.
    await page.route('https://finance.test/**',async(route:any)=>{
      const url=new URL(route.request().url());
      if(url.pathname.startsWith('/api/forms/')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:decodeURIComponent(url.pathname.split('/').at(-1)!),version:7,publishedAt:1,fields:[{id:'review_note',key:'review_note',type:'short_text',label:'Review context',required:true,order:0,status:'active'}]}})});
      if(url.pathname.startsWith('/api/admin/')) {
        const body=JSON.parse(route.request().postData());sent.push(body);
        return route.fulfill({status:sent.length===1?503:200,contentType:'application/json',body:JSON.stringify(sent.length===1?{error:'Simulated uncertain response'}:sent.length===2?{ok:true}:{ok:true,simulation:true,requestId:body.requestId,action:body.action,sellerId:'maker',payoutId:'payment',status:'approved',amountPaisa:91000})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});
    });
    async function mount(path:string){await page.goto('https://finance.test'+path);await page.addScriptTag({content:bundle.outputFiles[0].text});}
    await mount('/initial');
    const prepare=page.getByRole('form',{name:'Prepare simulated payment for Fictional maker'});
    await prepare.getByRole('button',{name:'Prepare simulated payment'}).waitFor();
    await prepare.getByLabel('Review reason').fill('Original completed payment review reason.');
    await prepare.getByLabel('Review context',{exact:false}).fill('Original private review answer');
    await prepare.getByRole('button',{name:'Prepare simulated payment'}).click();
    await page.getByText(/Simulated uncertain response/).waitFor();
    assert.equal(sent.length,1);
    await mount('/reloaded');
    await page.getByRole('button',{name:'Retry recorded operation'}).click();
    await page.getByText(/result could not be verified/).waitFor();
    assert.equal(sent.length,2);
    await page.getByRole('button',{name:'Retry recorded operation'}).click();
    await page.getByText(/recorded operation is confirmed/).waitFor();
    assert.equal(sent.length,3);
    assert.deepEqual(sent[1],sent[0]);assert.deepEqual(sent[2],sent[0]);
    assert.equal(sent[0].expectedAmountPaisa,91000);
    assert.deepEqual(sent[0].customAnswers,[{fieldId:'review_note',value:'Original private review answer'}]);
    assert.equal(await page.getByRole('button',{name:'Retry recorded operation'}).count(),0);
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('hastabazaar:managed-finance:')).length),0);
  } finally {await browser.close();}
});
