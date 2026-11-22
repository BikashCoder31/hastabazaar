import { compileFunction } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {readLiveManagedFinance,runLiveManagedFinanceAction} from '../lib/managed-commerce/live-finance-api';
void test('actual payment controls retain preparation and cancellation recovery surfaces while omitting direct payment execution',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  const initial=await readLiveManagedFinance(f.db,'reviewer',f.sellerId,Date.now());
  const saved=await runLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,{sourceFormId:'system.managed-live-finance',action:'prepare',requestId:'render-actual-reservation',expectedRevision:null,input:{scheduledFor:Date.now(),expectedAmountPaisa:initial.preview.amountPaisa,expectedSnapshot:initial.preview.snapshotDigest,reason:'Prepare the exact original actual earnings only, retaining the pending protected execution workflow.'}});
  const current=await readLiveManagedFinance(f.db,'reviewer',f.sellerId,Date.now());assert.equal(current.preview.amountPaisa,0);
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{renderToStaticMarkup}from'react-dom/server';import{LiveManagedFinanceControls}from'./components/admin/live-managed-finance-controls';export const html=renderToStaticMarkup(<LiveManagedFinanceControls actorId="reviewer" sellerId="${f.sellerId}" initial={${JSON.stringify(current)}}/>);`},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom/server'],plugins:[{name:'render-framework',setup(builder){builder.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useRouter(){return{refresh(){}}}',loader:'js'}));}}]})).outputFiles[0].text;
  const loadedFixtureModule={exports:{} as {html:string}};compileFunction(code, ['require', 'module', 'exports'])(createRequire(import.meta.url),loadedFixtureModule,loadedFixtureModule.exports);const html=loadedFixtureModule.exports.html;
  assert.match(html,/Actual original live earnings/);assert.match(html,/Prepare actual payout reservation/);assert.match(html,/Retire unsent reservation/);assert.match(html,/\/admin\/payments\/payouts/);assert.match(html,new RegExp(current.payments.find(p=>p.id===saved.id)!.number));
  assert.doesNotMatch(html,/Record simulated payment|name="providerReference"|name="bankAccountNumber"|Mark paid/);
 }finally{f.dispose();}
});
