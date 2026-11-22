import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {getSellerEarnings} from '../lib/seller/earnings';
Object.assign(globalThis,{liveEarningsCreateElement:createElement});
registerHooks({resolve(specifier,context,next){if(specifier==='next/link')return {url:'data:text/javascript,'+encodeURIComponent("export default function Link({children,prefetch,...props}){return globalThis.liveEarningsCreateElement('a',props,children)}"),shortCircuit:true};return next(specifier,context);}});

void test('seller view names actual money and retains a separately labelled simulation history',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  const {SellerEarningsSummary}=await import('../components/seller/seller-earnings-summary');
  const earnings=await getSellerEarnings(f.db,f.sellerId);assert.equal(earnings.managed!.recordKind,'live');assert.equal(earnings.managed!.summary.payablePaisa,69000);
  // Separate presentation input; the actual amount above comes from the real commerce journey.
  const history={...earnings.managed!.summary,payablePaisa:1234500,paidPaisa:2345600,balancePaisa:1234500};
  const html=renderToStaticMarkup(createElement(SellerEarningsSummary,{earnings:{...earnings,managed:{...earnings.managed!,simulationHistory:history}}}));
  assert.match(html,/Actual sale-linked earnings/);assert.match(html,/Retained simulation history/);
  assert.match(html,/690\.00/);assert.match(html,/12,345\.00/);assert.match(html,/23,456\.00/);
  assert.match(html,/separate from actual earnings and payment eligibility/);
  const historical=renderToStaticMarkup(createElement(SellerEarningsSummary,{earnings:{...earnings,managed:{...earnings.managed!,recordKind:'simulation',simulationHistory:null}}}));
  assert.match(historical,/Managed Maker simulation history/);assert.match(historical,/Simulated eligible amount/);assert.doesNotMatch(historical,/Actual sale-linked earnings/);
 }finally{f.dispose();}
});
