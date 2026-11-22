import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

let bundle: ReturnType<typeof build> | undefined;
function clientBundle() {
  return bundle ??= build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {SellerReviewActions} from './components/admin/seller-review-actions';
    import {SellerGovernanceActions} from './components/admin/seller-governance-actions';
    import {ProductReviewActions} from './components/admin/product-review-actions';
    import {HomepageVisibilityControl} from './components/admin/homepage-visibility-control';
    const mode=new URLSearchParams(location.search).get('mode');
    createRoot(document.getElementById('root')).render(mode==='seller-review'
      ? <SellerReviewActions sellerId="seller-one" status="submitted"/>
      :mode==='governance'?<SellerGovernanceActions sellerId="seller-one" current={null}/>
      :mode==='product-review'?<ProductReviewActions productId="product-one" status="submitted"/>
      :<HomepageVisibilityControl actorId="reviewer" productId="product-one" productName="Fictional product" hidden={false} version={0} lastReason={null}/>);
  `},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'success-stubs',setup(bundler){
    bundler.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'success'}));
    bundler.onLoad({filter:/^link$/,namespace:'success'},()=>({resolveDir:process.cwd(),loader:'tsx',contents:'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}'}));
    for(const [filter,path] of [[/^next\/navigation$/,'navigation'],[/^@\/components\/forms\/form-config-client$/,'config'],[/^@\/components\/ui\/alert-dialog$/,'dialog']] as const)
      bundler.onResolve({filter},()=>({path,namespace:'success'}));
    bundler.onLoad({filter:/^navigation$/,namespace:'success'},()=>({contents:'export function useRouter(){return {refresh(){}}}',loader:'js'}));
    bundler.onLoad({filter:/^config$/,namespace:'success'},()=>({resolveDir:process.cwd(),loader:'tsx',contents:`
      import {useState} from 'react';
      export function usePublishedFormConfig(formId){const [status,setStatus]=useState('ready');return {
        config:{formId,version:1,publishedAt:1,fields:[{id:'context_note',key:'context_note',label:'Staff context',type:'short_text',required:true,order:0,status:'active'}]},
        status,canSubmit:status==='ready',message:'',refresh(){setStatus('ready')},
        handleSubmissionResponse(response,code){window.__staleCalls=(window.__staleCalls||0)+1;if(response.status===409&&code!=='request_id_conflict')setStatus('stale');return response.ok}
      }}
    `}));
    bundler.onLoad({filter:/^dialog$/,namespace:'success'},()=>({resolveDir:process.cwd(),loader:'tsx',contents:`
      import React from 'react';
      export function AlertDialog({open,children}){return open?<div role="dialog">{children}</div>:null}
      export function AlertDialogContent({children}){return <div>{children}</div>}
      export function AlertDialogHeader({children}){return <div>{children}</div>}
      export function AlertDialogTitle({children}){return <h2>{children}</h2>}
      export function AlertDialogDescription({children}){return <p>{children}</p>}
      export function AlertDialogFooter({children}){return <div>{children}</div>}
      export function AlertDialogAction({children,onClick,disabled}){return <button type="button" disabled={disabled} onClick={onClick}>{children}</button>}
      export function AlertDialogCancel({children,disabled}){return <button type="button" disabled={disabled}>{children}</button>}
    `}));
  }}]});
}

for(const mode of ['seller-review','governance','product-review','homepage'] as const) {
  void test(`${mode} retains attempts for ambiguous2xx and clears only its declared result`,async()=>{
    const modulePath=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
    // oxlint-disable-next-line typescript/no-explicit-any -- Local supplied browser runtime.
    const {chromium}=await import(modulePath) as any;
    const built=await clientBundle();
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page=await browser.newPage();
    const requests:Record<string,unknown>[]=[];
    let status=200;let responseBody:unknown={};
    const formId=mode==='seller-review'?'staff.seller-review-action':mode==='governance'?'staff.seller-governance':mode==='product-review'?'staff.product-review':'staff.homepage-visibility';
    try {
      // oxlint-disable-next-line typescript/no-explicit-any -- Local supplied route runtime.
      await page.route('https://seller-product-success.test/**',(route:any)=>{
        if(route.request().method()==='POST'){
          requests.push(JSON.parse(route.request().postData()??'{}'));
          return route.fulfill({status,contentType:'application/json',body:JSON.stringify(responseBody)});
        }
        return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});
      });
      const mount=async()=>{
        await page.goto(`https://seller-product-success.test/?mode=${mode}`);
        await page.addScriptTag({content:built.outputFiles![0].text});
        if(mode==='homepage')await page.getByRole('button',{name:'Hide from homepage',exact:true}).click();
        const form=page.locator(`form[data-form-id="${formId}"]`);
        await form.getByLabel('Staff context').fill('Fictional private evidence');
        if(mode==='governance')await form.getByLabel('Private decision note').fill('Fictional governance decision');
        if(mode==='homepage')await form.getByLabel('Decision reason').fill('Fictional homepage decision');
        return form;
      };
      let form=await mount();
      const submit=async()=>{
        const previous=requests.length;
        if(mode==='seller-review'||mode==='product-review') {
          await form.getByRole('button',{name:'Start review',exact:true}).first().click();
          await page.getByRole('dialog').getByRole('button',{name:'Start review',exact:true}).click();
        }else await form.getByRole('button',{name:mode==='governance'?'Record seller decision':'Hide from homepage',exact:true}).click();
        for(let attempt=0;attempt<40&&requests.length===previous;attempt++)await page.waitForTimeout(25);
        assert.equal(requests.length,previous+1);
        await page.waitForTimeout(80);
      };
      if(mode==='homepage'){
        await submit();const id=String(requests[0].requestId),original=JSON.stringify(requests[0]);
        assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),id),true);
        const retry=async()=>{const previous=requests.length,done=page.waitForResponse((response:{request():{method():string}})=>response.request().method()==='POST');await form.getByRole('button',{name:'Retry original action',exact:true}).click();await done;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));assert.equal(requests.length,previous+1);assert.equal(JSON.stringify(requests.at(-1)),original);};
        for(const malformed of [null,{error:'Unconfirmed'},{hidden:'true',version:1}]){responseBody=malformed;await retry();assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),id),true);}
        for(const conflict of [400,409]){status=conflict;responseBody={error:'A later rejected invocation cannot disprove the original unknown result.',phase:'rejected_before_write'};await retry();assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),id),true);}
        assert.equal((await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).map(key=>[key,sessionStorage.getItem(key)]))))).includes('Fictional private evidence'),false);
        status=200;responseBody={hidden:true,version:1};await retry();assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),id),false);
        form=await mount();status=409;responseBody={error:'Stale form',code:'stale_version',phase:'rejected_before_write'};await submit();const staleId=String(requests.at(-1)?.requestId);assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),staleId),false);assert.equal(await form.getByRole('button',{name:'Start a new attempt',exact:true}).count(),0);assert.equal(await form.getByRole('button',{name:'Hide from homepage',exact:true}).isEnabled(),false);await form.getByRole('button',{name:'Refresh current form configuration',exact:true}).click();assert.equal(await form.getByLabel('Staff context').inputValue(),'Fictional private evidence');assert.equal(await form.getByLabel('Decision reason').inputValue(),'Fictional homepage decision');status=200;responseBody={hidden:true,version:1};await submit();assert.notEqual(requests.at(-1)?.requestId,staleId);return;
      }
      await submit();
      const id=String(requests[0].requestId);
      assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),id),true,'Malformed2xx must retain opaque identity');
      for(const malformed of [null,{error:'Unconfirmed'},mode==='governance'?{restriction:{version:'1'}}:{status:'unknown'}]){
        form=await mount();responseBody=malformed;await submit();
        assert.equal(requests.at(-1)?.requestId,id);
        assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),id),true);
      }
      form=await mount();
      for(const conflict of [400,409]){
        status=conflict;responseBody={error:'Domain conflict'};await submit();
        assert.equal(requests.at(-1)?.requestId,id);
        assert.equal(await page.evaluate(()=>(window as Window & {__staleCalls?:number}).__staleCalls??0),0);
      }
      status=200;
      responseBody=mode==='governance'?{restriction:{mode:'active',obligationMode:'admin_review',version:1}}:{status:'under_review'};
      await submit();
      assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),id),false,'Verified result clears opaque identity');
      form=await mount();status=409;responseBody={error:'Stale form',code:'stale_version'};
      await submit();
      const staleId=String(requests.at(-1)?.requestId);
      const operationButton=form.getByRole('button',{name:mode==='governance'?'Record seller decision':'Start review',exact:true}).first();
      assert.equal(await operationButton.isEnabled(),false,'True stale response freezes submission');
      page.once('dialog',(dialog:{dismiss():Promise<void>})=>void dialog.dismiss());
      await form.getByRole('button',{name:'Start a new attempt',exact:true}).click();
      assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),staleId),true);
      assert.equal(await operationButton.isEnabled(),false,'Canceled reset preserves stale state');
      page.once('dialog',(dialog:{accept():Promise<void>})=>void dialog.accept());
      await form.getByRole('button',{name:'Start a new attempt',exact:true}).click();
      assert.equal(await operationButton.isEnabled(),true,'Confirmed reset refreshes stale config');
      assert.equal(await form.getByLabel('Staff context').inputValue(),'Fictional private evidence');
      status=200;responseBody=mode==='governance'?{restriction:{mode:'active',obligationMode:'admin_review',version:1}}:{status:'under_review'};
      await submit();
      assert.notEqual(requests.at(-1)?.requestId,staleId);
    }finally{await browser.close();}
  });
}
