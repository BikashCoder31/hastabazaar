import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { customerFeeFixture, feeWaiverContext } from './helpers/customer-fee-waiver-fixture';
import { quoteCustomerServiceFee } from '../lib/db/repositories/customer-service-fees';
import { mutateCustomerFeeWaiver } from '../lib/db/repositories/customer-fee-waivers';
import { saveBusinessSettingChange } from '../lib/db/repositories/business-settings';
import { promoCostPreview } from '../lib/incentives/presentation';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { stubFixtureLink } from './helpers/browser-fixture-link';
async function moduleAt(path:string) {
  assert.ok(existsSync(path),'rendered component exists: '+path);
  const output=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/*','react-dom','react-dom/*'],plugins:[{name:'framework',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useRouter=()=>({refresh(){}})',loader:'js'}));}}]});
  const result={exports:{} as Record<string,ComponentType<Record<string,unknown>>>};
  runInNewContext(output.outputFiles[0].text,{module:result,exports:result.exports,require:createRequire(import.meta.url),process,crypto});
  return result.exports;
}
void test('rendered customer breakdown shows server standard, full waiver and net once per order for current and future policy',async()=>{
  const {CustomerServiceFeeBreakdown}=await moduleAt('components/commerce/customer-service-fee-breakdown.tsx');
  const f=await customerFeeFixture();
  try {
    const now=2_000_000_000;
    const c=await mutateCustomerFeeWaiver(f.database,feeWaiverContext('ui-create',0,{now}),{type:'create',terms:{name:'Customer launch',description:'Customer fee',startsAt:now-1,endsAt:now+2_000_000_000}});
    await mutateCustomerFeeWaiver(f.database,feeWaiverContext('ui-publish',1,{now}),{type:'publish',campaignId:c.id});
    let policyAt=now;
    for(const amount of [1000,2500,0,-1]) {
      policyAt++;
      if(amount!==1000) await saveBusinessSettingChange(f.database,{key:'platform_service_fee_policy',value:{enabled:amount!==-1,amountPaisa:amount===-1?2500:amount},actorId:'owner',reason:'Disposable future customer fee',requestId:'future-'+amount,now:now-1_300_000_000,effectiveFrom:policyAt,expectedVersion:amount===2500?0:amount===0?1:2});
      const s=(await quoteCustomerServiceFee(f.database,policyAt)).snapshot;
      const html=renderToStaticMarkup(createElement(CustomerServiceFeeBreakdown,{standardPaisa:s.standardPaisa,waivedPaisa:s.waivedPaisa,netPaisa:s.chargedPaisa,campaignName:s.campaign?.name??null,source:'estimate'}));
      assert.match(html,/Standard customer service fee/);assert.match(html,/Net customer service fee/);assert.match(html,/once per order/i);
      if(amount>0){assert.match(html,/Full customer fee waiver.*Customer launch/);assert.match(html,new RegExp((amount/100).toFixed(2).replace('.','\\.')));assert.match(html,/0\.00/);}else {assert.match(html,/No customer service fee is currently charged/);assert.doesNotMatch(html,/Full customer fee waiver/);}
    }
  } finally {await f.dispose();}
});
void test('disabled policy renders no fictitious campaign relief even with an applying campaign',async()=>{
  const {CustomerServiceFeeBreakdown}=await moduleAt('components/commerce/customer-service-fee-breakdown.tsx');
  const html=renderToStaticMarkup(createElement(CustomerServiceFeeBreakdown,{standardPaisa:0,waivedPaisa:0,netPaisa:0,campaignName:null,source:'estimate'}));
  assert.match(html,/No customer service fee is currently charged/);assert.doesNotMatch(html,/Full customer fee waiver/);
});
void test('rendered manager supports overlapping customer campaigns, Nepal dates and separate immutable seller history',async()=>{
  const {FeeWaiverManager}=await moduleAt('components/admin/fee-waiver-manager.tsx');
  const base={revision:2,state:'published',description:'Fixture',startsAt:100,endsAt:2000};
  const html=renderToStaticMarkup(createElement(FeeWaiverManager,{initialState:{feeTarget:'customer_service_fee',revision:4,evaluatedAt:1000,campaigns:[{...base,id:'b',name:'Second'},{...base,id:'a',name:'First'}]},legacyHistory:{revision:2,campaigns:[{...base,id:'old',name:'Legacy seller campaign'}]}}));
  assert.match(html,/Applying: First/);assert.match(html,/2 active/);assert.match(html,/overlapping waivers do not stack/i);assert.match(html,/Pausing this campaign will not stop other/);assert.match(html,/UTC\+05:45/);
  assert.match(html,/Historical seller commission campaigns/);assert.match(html,/Legacy seller campaign/);assert.doesNotMatch(html,/aria-label="(?:Edit|Pause|End|Resume|Publish) Legacy seller campaign"/);
  assert.equal(FORM_REGISTRY['staff.fee-waivers'].route,'/api/admin/customer-fee-waivers');
  assert.ok(FORM_REGISTRY['staff.fee-waivers'].baseFields.some(f=>f.key==='feeTarget'));
});
const promo={code:'SAVE10',label:'Fixture',kind:'fixed' as const,fixedPaisa:1000,minimumSubtotalPaisa:0,startsAt:0,endsAt:253402300799999,totalUseLimit:10,perCustomerUseLimit:2,budgetPaisa:10000};
void test('seller and promo rendered previews cannot claim commission relief from a saved legacy campaign',async()=>{
  const campaign={id:'old',revision:2,state:'published' as const,name:'Old seller relief',description:'Historical',startsAt:1,endsAt:253402300799999};
  const {SellerMarketplaceFeeNotice}=await moduleAt('components/seller/commission-fee-notice.tsx');
  const seller=renderToStaticMarkup(createElement(SellerMarketplaceFeeNotice,{basisPoints:1200,campaign}));
  assert.match(seller,/12%/);assert.doesNotMatch(seller,/Full fee waiver|Old seller relief|Net marketplace fee: 0%/);
  const {PromoCodeCostPreview}=await moduleAt('components/admin/promo-code-cost-preview.tsx');
  const html=renderToStaticMarkup(createElement(PromoCodeCostPreview,{terms:promo,defaultCommissionBps:1200,feeWaiver:campaign}));
  assert.doesNotMatch(html,/Old seller relief|marketplace fee waiver/);
  assert.equal(promoCostPreview(promo,10000,1200,campaign).commissionPaisa,1200);
  assert.equal(promoCostPreview(promo,10000,1200,campaign).waivedCommissionPaisa,0);
});
