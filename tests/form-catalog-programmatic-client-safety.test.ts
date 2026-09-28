import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

let bundle: ReturnType<typeof build> | undefined;
function clientBundle() {
  return bundle ??= build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {AdminOrderFulfillmentActions} from './components/admin/order-fulfillment-actions';
    import {ReviewModerationActions} from './components/admin/review-moderation-actions';
    import {ReturnCaseActions} from './components/admin/return-case-actions';
    import {ComplaintCaseActions} from './components/admin/complaint-case-actions';
    const mode=new URLSearchParams(location.search).get('mode');
    createRoot(document.getElementById('root')).render(mode==='order'
      ? <AdminOrderFulfillmentActions orderId="order-one" status="ready_for_pickup"/>
      : mode==='review'||mode==='reply'?<ReviewModerationActions id="review-one" status="pending" replyVersion={mode==='reply'?1:undefined}/>
      : mode==='complaint'?<ComplaintCaseActions id="complaint-one" status="open"/>
      : <ReturnCaseActions id="return-one" quantity={1} role={mode==='high-value'?'super_admin':'admin'}
        canApproveStandard={mode!=='high-value'} status={mode==='return'?'requested':mode==='high-value'?'pending_high_value_approval':'approved'}
        outcome={mode==='operations'?'replacement':null} refundStatus={null}/>);
  ` }, bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'client-safety-stubs',setup(bundler){
    bundler.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'safety'}));
    bundler.onResolve({filter:/^@\/components\/forms\/form-config-client$/},()=>({path:'config',namespace:'safety'}));
    bundler.onResolve({filter:/^@\/components\/ui\/alert-dialog$/},()=>({path:'dialog',namespace:'safety'}));
    bundler.onLoad({filter:/^navigation$/,namespace:'safety'},()=>({contents:'export function useRouter(){return {refresh(){}}}',loader:'js'}));
    bundler.onLoad({filter:/^config$/,namespace:'safety'},()=>({resolveDir:process.cwd(),loader:'tsx',contents:`
      import {useState} from 'react';
      export function usePublishedFormConfig(formId){const [status,setStatus]=useState('ready');return {
        config:{formId,version:1,publishedAt:1,fields:[{id:'context_note',key:'context_note',label:'Staff context',type:'short_text',required:true,order:0,status:'active'}]},
        status,canSubmit:status==='ready',message:status==='stale'?'Refresh the changed form.':'',refresh(){setStatus('ready')},
        handleSubmissionResponse(response,code){window.__staleCalls=(window.__staleCalls||0)+1;if(response.status===409&&code!=='request_id_conflict')setStatus('stale');return response.ok}
      }}
    `}));
    bundler.onLoad({filter:/^dialog$/,namespace:'safety'},()=>({resolveDir:process.cwd(),loader:'tsx',contents:`
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
  }}] });
}

for(const mode of ['order','review','reply','return','high-value','operations','complaint'] as const) {
  void test(`${mode} retains opaque action identity across malformed success, reload, edits and conflicts`, async()=>{
    const modulePath=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
    // oxlint-disable-next-line typescript/no-explicit-any -- Browser types come from the supplied local runtime.
    const {chromium}=await import(modulePath) as any;
    const built=await clientBundle();
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page=await browser.newPage();
    const requests:Record<string,unknown>[]=[];
    let status=200;
    let responseBody:unknown={};
    const formId=mode==='order'?'staff.order-fulfillment':mode==='review'||mode==='reply'?'staff.review-moderation'
      :mode==='complaint'?'staff.complaint-case-action':'staff.return-case-action';
    const button=mode==='order'?'Mark dispatched':mode==='review'?'Publish review':mode==='reply'?'Publish reply'
      :mode==='return'?'Save decision':mode==='high-value'?'Approve high-value refund':mode==='operations'?'Mark return in transit':'Apply action';
    try {
      // oxlint-disable-next-line typescript/no-explicit-any -- Route types come from the supplied local runtime.
      await page.route('https://client-safety.test/**',(route:any)=>{
        if(route.request().method()==='POST'){
          requests.push(JSON.parse(route.request().postData()??'{}'));
          return route.fulfill({status,contentType:'application/json',body:JSON.stringify(responseBody)});
        }
        return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});
      });
      const mount=async()=>{
        await page.goto(`https://client-safety.test/?mode=${mode}`);
        await page.addScriptTag({content:built.outputFiles![0].text});
        if(mode==='order')await page.getByRole('button',{name:'Mark dispatched',exact:true}).click();
        const form=page.locator(`form[data-form-id="${formId}"]`);
        await form.getByLabel('Staff context').fill('Fictional private context');
        if(mode==='order'){
          await form.getByLabel('Tracking or consignment reference').fill('SIM-TRACK-1');
          await form.getByLabel('Operations note').fill('Fictional operations note');
        }else if(mode==='review'||mode==='reply')await form.getByLabel('Moderation note').fill('Fictional moderation note');
        else {
          await form.locator('textarea').nth(0).fill('Fictional case note');
          await form.locator('textarea').nth(1).fill('Fictional public message');
          if(mode==='operations')await form.locator('input').nth(0).fill('SIM-TRACK-1');
        }
        return form;
      };
      let form=await mount();
      const submit=async()=>{
        const previous=requests.length;
        await form.getByRole('button',{name:button,exact:true}).click();
        for(let attempt=0;attempt<40&&requests.length===previous;attempt++)await page.waitForTimeout(25);
        assert.equal(requests.length,previous+1);
        await page.waitForTimeout(70);
      };
      await submit();
      const firstId=String(requests[0].requestId??requests[0].idempotencyKey);
      assert.match(firstId,/^[0-9a-f-]{36}$/i);
      assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),firstId),true,
        `${mode}: malformed2xx cannot clear uncertain identity`);
      status=503;responseBody={error:'Unknown outcome'};await submit();
      form=await mount();
      await form.getByLabel('Staff context').fill('Changed fictional private context');
      for(const conflict of [400,409]){
        status=conflict;responseBody={error:'Correct the domain conflict'};await submit();
        assert.equal(requests.at(-1)?.requestId??requests.at(-1)?.idempotencyKey,firstId);
        assert.equal(await page.evaluate(()=>(window as Window & {__staleCalls?:number}).__staleCalls??0),0,
          `${mode}: domain conflict cannot freeze as stale`);
      }
      for(const malformed of [null,{ok:false},{error:'Not confirmed'}]){
        status=200;responseBody=malformed;await submit();
        assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),firstId),true);
      }
      status=409;responseBody={error:'Form changed',code:'stale_version'};await submit();
      assert.equal(await page.evaluate(()=>(window as Window & {__staleCalls?:number}).__staleCalls??0),1);
      assert.equal(await form.getByRole('button',{name:button,exact:true}).isDisabled(),true);
      page.once('dialog',(dialog:{dismiss():Promise<void>})=>{void dialog.dismiss()});
      await form.getByRole('button',{name:/Start a new.*attempt/}).click();
      assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),firstId),true);
      page.once('dialog',(dialog:{accept():Promise<void>})=>{void dialog.accept()});
      await form.getByRole('button',{name:/Start a new.*attempt/}).click();
      status=200;responseBody={ok:true};await submit();
      const lastId=String(requests.at(-1)?.requestId??requests.at(-1)?.idempotencyKey);
      assert.notEqual(lastId,firstId);
      assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),lastId),false);
      assert.equal(await page.evaluate(()=>Object.values(sessionStorage).some((value)=>String(value).includes('Fictional'))),false);
    } finally {await page.close();await browser.close();}
  });
}
