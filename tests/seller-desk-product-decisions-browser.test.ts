import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { productPublicationFixture } from './helpers/product-publication-fixture';
import { stubFixtureLink, stubFixtureImage } from './helpers/browser-fixture-link';

declare global { var deskDecisionFixtureDb:D1Database; }
registerHooks({resolve(specifier,context,next){
  const source=specifier==='cloudflare:workers'?'export const env={get DB(){return globalThis.deskDecisionFixtureDb}}'
    :specifier==='@/lib/auth/staff'?"export class StaffAuthorizationError extends Error{};export async function requireStaffApi(){return {id:'reviewer'}}":null;
  return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(specifier,context);
}});

void test('desk decisions call the original product, document and payout actions and advance on confirmation', {timeout:120000}, async()=>{
  const bundle=await build({stdin:{sourcefile:'desk-browser.tsx',resolveDir:process.cwd(),loader:'tsx',contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {ProductPublicationReview} from './components/admin/product-publication-review';
    import {SellerDocumentReview} from './components/admin/seller-document-review';
    import {PayoutRequestActions} from './components/admin/payout-request-actions';
    import {ApprovePreparedPayoutButton} from './components/admin/payout-actions';
    window.addEventListener('seller-desk-decided',()=>document.body.dataset.recorded='true');
    createRoot(document.getElementById('root')).render(location.pathname==='/document'?<SellerDocumentReview desk clearFix actorId="reviewer" sellerId="registered" documentId="doc" expectedReviewId="prior"/>:
      location.pathname==='/request'?<PayoutRequestActions desk role="super_admin" actorId="reviewer" approvalAmount="NPR 100" id="request"/>:
      location.pathname==='/prepared'?<ApprovePreparedPayoutButton desk amount="NPR 100" payoutId="prepared" status="prepared" canApprove canProcess={false} isPreparer={false}/>:
      <ProductPublicationReview desk actorId="reviewer" caseId={location.search.slice(1)}/>);
  `},plugins:[{name:'fixture-navigation',setup(b){
    stubFixtureLink(b);stubFixtureImage(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useRouter(){return {refresh(){}}}'}));
  }}],bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
  const css=await postcss([tailwind()]).process((await readFile('app/globals.css','utf8'))
    .replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components';"),{from:'app/globals.css'});
  const runtime=await import(process.env.PLAYWRIGHT_MODULE||'playwright') as typeof import('playwright');
  const browser=await runtime.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
  try {
    const handler=await import('../app/api/admin/product-publications/route');
    for(const action of ['request_changes','approve_and_publish','reject'] as const){
      const f=await productPublicationFixture('',Date.now()-20000);
      globalThis.deskDecisionFixtureDb=f.db;
      const page=await browser.newPage({viewport:{width:390,height:844}});
      try {
        const writes:string[]=[];
        await page.route('**/*', async route=>{
          const request=route.request(), url=new URL(request.url());
          if(url.pathname==='/desk')return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/entry.js"></script>'});
          if(url.pathname==='/entry.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
          if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css.css});
          if(url.pathname.startsWith('/api/seller/product-intakes/media/'))return route.fulfill({status:204});
          if(url.pathname!=='/api/admin/product-publications')return route.abort();
          const post=request.method()==='POST';
          if(post)writes.push(request.postDataJSON().action);
          const actual=new Request(url,{method:request.method(),headers:{...request.headers(),origin:url.origin},body:post?request.postData():undefined});
          const result=post?await handler.POST(actual):await handler.GET(actual);
          return route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:await result.text()});
        });
        await page.goto('http://localhost:3018/desk?'+f.sent.caseId);
        const approve=page.getByRole('button',{name:'Approve & publish',exact:true});
        await approve.waitFor();
        if(action==='request_changes'){
          for(const width of [390,768,1024,1440]){
            await page.setViewportSize({width,height:844});
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
            assert.ok((await page.getByRole('button',{name:'Ask to fix',exact:true}).first().boundingBox())!.height>=44);
          }
          await page.getByRole('button',{name:'Ask to fix',exact:true}).nth(1).click();
          const note=page.getByLabel('Note to the seller');
          assert.match(await note.inputValue(),/cover photo/);
          await note.fill('Please replace the cover with a photograph of this exact cup.');
          await page.getByRole('button',{name:'Send back with 1 fix'}).click();
        }else{
          await page.getByLabel('Note to the seller').fill('Reviewed the exact cup details, cover, and offered item.');
          if(action==='approve_and_publish'){
            assert.equal(await approve.isDisabled(),true);
            await page.getByLabel('The main photo shows the actual product.').check();
            await page.getByLabel('The details and offers describe the same product.').check();
            await approve.click();
          }else{
            page.once('dialog',dialog=>void dialog.accept());
            await page.getByRole('button',{name:'Reject…'}).click();
          }
        }
        await page.waitForSelector('body[data-recorded="true"]');
        assert.deepEqual(writes,[action]);
        assert.equal(f.sqlite.prepare('SELECT action FROM product_publication_decisions').get()?.action,action);
      }finally{await page.close();f.dispose();}
    }
    for(const decision of ['verify','request_correction','prepare','approve'] as const){
      const page=await browser.newPage();
      try {
        const writes:{path:string;body:Record<string,unknown>}[]=[];
        const path=decision==='prepare'?'/request':decision==='approve'?'/prepared':'/document';
        await page.route('**/*',async route=>{
          const r=route.request(), pathname=new URL(r.url()).pathname;
          if(pathname===path)return route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/entry.js"></script>'});
          if(pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css.css});
          if(pathname==='/entry.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
          if(pathname.startsWith('/api/forms/'))return route.fulfill({json:{config:{formId:decodeURIComponent(pathname.slice('/api/forms/'.length)),version:1,publishedAt:0,fields:[]}}});
          if(r.method()==='POST'){
            const body=r.postDataJSON();writes.push({path:pathname,body});
            if(path==='/document')return route.fulfill({json:{recorded:true,id:'doc',sourceId:'doc',action:'review',actorId:'reviewer',decision:body.decision,requestId:body.commandId}});
            return route.fulfill({json:{ok:true}});
          }
          return route.abort();
        });
        await page.goto('http://localhost:3018'+path);
        if(path==='/document'){
          await page.getByRole('button',{name:decision==='verify'?'Matches · clear the hold':'Still wrong · ask again'}).click();
          await page.getByLabel('Reason shown to the seller').fill('Independently checked the current submitted evidence.');
          await page.getByRole('button',{name:'Record decision',exact:true}).click();
        }else{
          await page.getByRole('button',{name:'Approve payout',exact:true}).click();
          if(decision==='prepare'){
            await page.getByLabel('Review note').fill('Reviewed the current eligible balance.');
            await page.getByRole('dialog').getByRole('button',{name:'Approve payout',exact:true}).click();
          }else{
            await page.getByRole('dialog').getByRole('textbox').first().fill('Reviewed the prepared payout and destination.');
            await page.getByRole('button',{name:'Review decision'}).click();
            await page.getByRole('alertdialog').getByRole('button',{name:'Confirm decision',exact:true}).click();
          }
        }
        await page.waitForSelector('body[data-recorded="true"]');
        assert.equal(writes.length,1);
        assert.equal(writes[0].path,path==='/document'?'/api/admin/seller-documents/doc/review':decision==='approve'?'/api/admin/payouts/prepared':'/api/admin/payout-requests/request');
        assert.equal(writes[0].body[path==='/document'?'decision':'action'],decision);
        if(path==='/document')assert.equal(writes[0].body.expectedReviewId,'prior');
      }finally{await page.close();}
    }
  }finally{await browser.close();}
});
