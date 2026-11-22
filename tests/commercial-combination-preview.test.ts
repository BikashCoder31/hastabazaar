import assert from 'node:assert/strict';import test from 'node:test';
import {previewCommercialCombination} from '../lib/incentives/commercial-combination-preview';
void test('combined illustration preserves original seller base, one benefit and credit-as-payment',()=>{
 const input={merchandisePaisa:10000,deliveryPaisa:1000,promoPaisa:1500,referralPaisa:0,creditPaisa:2000,customerFeePaisa:500,waiver:true,model:'registered' as const,feeBps:1200,fixedSupplierPaisa:0};
 const r=previewCommercialCombination(input);assert.equal(r.feePaisa,1200);assert.equal(r.waivedPaisa,500);assert.equal(r.payablePaisa,7500);assert.equal(r.operatingContributionPaisa,-300);assert.equal(r.creditPaisa,2000);
 assert.throws(()=>previewCommercialCombination({...input,referralPaisa:100}));assert.throws(()=>previewCommercialCombination({...input,creditPaisa:9000}));assert.throws(()=>previewCommercialCombination({...input,customerFeePaisa:null}));
 const fixed=previewCommercialCombination({...input,model:'fixed_supplier',feeBps:null,fixedSupplierPaisa:7000});assert.equal(fixed.feePaisa,null);assert.equal(fixed.operatingContributionPaisa,1500);assert.equal(previewCommercialCombination({...input,customerFeePaisa:0}).waivedPaisa,0);
});
