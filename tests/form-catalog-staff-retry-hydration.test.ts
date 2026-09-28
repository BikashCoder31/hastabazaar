import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build, type Plugin } from 'esbuild';

const fixtures = `
 import React from 'react';
 import {HomepageVisibilityControl} from './components/admin/homepage-visibility-control';
 import {ProductReviewActions} from './components/admin/product-review-actions';
 import {SellerReviewActions} from './components/admin/seller-review-actions';
 import {SellerGovernanceActions} from './components/admin/seller-governance-actions';
 import {ManagedMakerActivationForm} from './components/admin/managed-maker-activation-form';
 import {ParcelControls} from './components/admin/parcel-controls';
 function element(mode,subject='subject-one'){
  if(mode==='homepage')return <HomepageVisibilityControl productId={subject} productName="Fictional product" hidden={false} version={1} lastReason={null}/>;
  if(mode==='product')return <ProductReviewActions productId={subject} status="under_review"/>;
  if(mode==='seller')return <SellerReviewActions sellerId={subject} status="under_review"/>;
  if(mode==='governance')return <SellerGovernanceActions sellerId={subject} current={null}/>;
  if(mode==='activation')return <ManagedMakerActivationForm sellerId={subject}/>;
  return <ParcelControls orderId="order-one" actorId="staff-one" records={[]} compensation={[]} canPrepare={false}
   parcels={[{id:subject,sellerName:'Fictional seller',status:'prepared',method:'own_rider',version:1,
    codDuePaisa:1000,collectedPaisa:0,remittedPaisa:0,courierCostPaisa:0,openBoxRequired:false}]}/>;
 }
`;
const ids = {homepage:'staff.homepage-visibility',product:'staff.product-review',seller:'staff.seller-review-action',
  governance:'staff.seller-governance',activation:'staff.managed-maker-activation',parcel:'staff.parcel-control'} as const;
const plugin: Plugin = {name:'hydration-read-fixtures',setup(bundler){
  bundler.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
  bundler.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
  bundler.onResolve({filter:/^@\/components\/forms\/form-config-client$/},()=>({path:'config',namespace:'fixture'}));
  bundler.onLoad({filter:/.*/,namespace:'fixture'},(args)=>({contents:args.path==='navigation'
    ? 'export function useRouter(){return {refresh(){}}}'
    : args.path==='link' ? "import React from 'react';export default function Link(props){return React.createElement('a',props)}"
    : 'export function usePublishedFormConfig(formId){return {config:{formId,version:1,publishedAt:1,fields:[]},canSubmit:true,status:"ready",message:"",handleSubmissionResponse(){}}}',loader:'js',resolveDir:process.cwd()}));
}};

void test('retained staff attempts hydrate server markup without mismatch and preserve explicit warning resets', async (t) => {
  const server = await build({stdin:{resolveDir:process.cwd(),sourcefile:'retry-server.tsx',loader:'tsx',contents:fixtures+`
    import {renderToString} from 'react-dom/server';export function markup(mode){return renderToString(element(mode),{identifierPrefix:'retry-'})}
  `},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom/server'],plugins:[plugin]});
  const serverModule = {exports:{} as {markup(mode:string):string}};
  runInNewContext(server.outputFiles[0].text, {module:serverModule,exports:serverModule.exports,
    require:createRequire(import.meta.url),process,console,TextEncoder,TextDecoder});
  const client = await build({stdin:{resolveDir:process.cwd(),sourcefile:'retry-client.tsx',loader:'tsx',contents:fixtures+`
    import {hydrateRoot} from 'react-dom/client';
    const mode=new URLSearchParams(location.search).get('mode');window.hydrationErrors=[];
    const root=hydrateRoot(document.getElementById('root'),element(mode),{identifierPrefix:'retry-',
      onRecoverableError(error){window.hydrationErrors.push(error.message)}});
    window.switchSubject=(subject)=>root.render(element(mode,subject));
  `},bundle:true,write:false,platform:'browser',format:'iife',plugins:[plugin],define:{'process.env.NODE_ENV':'"production"'}});
  const playwrightPath=process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- External browser runtime supplies this type.
  const {chromium}=await import(playwrightPath) as {chromium:{launch(options:{headless:boolean;executablePath:string}):Promise<any>}};
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    for(const [mode,formId] of Object.entries(ids)) await t.test(mode,async()=>{
      const page=await browser.newPage();
      try {
        const key=`hastabazaar:profile-attempt:${formId}:subject-one`;
        await page.addInitScript(({key}:{key:string})=>sessionStorage.setItem(key,'11111111-1111-4111-8111-111111111111'),{key});
        // oxlint-disable-next-line typescript/no-explicit-any -- External browser runtime supplies this type.
        await page.route('https://retry-hydration.test/**',(route:any)=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><div id="root">${serverModule.exports.markup(mode)}</div>`}));
        await page.goto(`https://retry-hydration.test/?mode=${mode}`);
        await page.addScriptTag({content:client.outputFiles[0].text});
        if(mode==='homepage')await page.getByRole('button',{name:'Hide from homepage',exact:true}).click();
        await page.getByRole('button',{name:'Start a new attempt',exact:true}).waitFor();
        const errors=await page.evaluate(()=> (window as unknown as {hydrationErrors:string[]}).hydrationErrors);
        assert.deepEqual(errors,[],mode+' must hydrate existing server markup without React #418');
        page.once('dialog',(dialog:{dismiss():Promise<void>})=>void dialog.dismiss());
        await page.getByRole('button',{name:'Start a new attempt',exact:true}).press('Enter');
        assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),key),'11111111-1111-4111-8111-111111111111');
        page.once('dialog',(dialog:{accept():Promise<void>})=>void dialog.accept());
        await page.getByRole('button',{name:'Start a new attempt',exact:true}).press('Enter');
        await page.getByRole('button',{name:'Start a new attempt',exact:true}).waitFor({state:'detached'});
        assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),key),null);
        if(mode!=='homepage'){
          const otherKey=`hastabazaar:profile-attempt:${formId}:subject-two`;
          await page.evaluate((key:string)=>sessionStorage.setItem(key,'22222222-2222-4222-8222-222222222222'),otherKey);
          await page.evaluate(()=> (window as unknown as {switchSubject(subject:string):void}).switchSubject('subject-two'));
          await page.getByRole('button',{name:'Start a new attempt',exact:true}).waitFor();
          await page.evaluate(()=> (window as unknown as {switchSubject(subject:string):void}).switchSubject('subject-one'));
          await page.getByRole('button',{name:'Start a new attempt',exact:true}).waitFor({state:'detached'});
          assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),otherKey),'22222222-2222-4222-8222-222222222222');
        }
      }finally{await page.close();}
    });
  }finally{await browser.close();}
});
