import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {saveProductIntakeDraft} from '../lib/products/category-contracts';
import {getPriceScenarios} from '../lib/products/price-scenarios';
import {getSellerCommissionTerms} from '../lib/db/repositories/commission-rates';
import {savePrivatePriceInputs,getPrivatePriceInputs} from '../lib/products/private-price-inputs';
void test('price scenarios follow native current and future rates without accepting terms or exposing agreement details',async()=>{
 const f=await completeVersionFixture();try{
  const ctx={actorId:'registered-owner',requestId:'scenario-draft',expectedRevision:null,now:f.now};
  const draft=await saveProductIntakeDraft(f.db,ctx,{draftId:null,sellerId:'registered',categoryId:null,answers:{}}),subject={kind:'intake' as const,id:draft.id,offerId:'base'};
  const result=await getPriceScenarios(f.db,ctx.actorId,subject,f.now),native=await getSellerCommissionTerms(f.db,'registered',f.now);
  assert.equal(result.current?.versionId,native.version);assert.equal(result.current?.route,'registered');assert.equal(result.current&&'basisPoints' in result.current?result.current.basisPoints:null,native.basisPoints);
  assert.equal(result.upcoming.at(-1)?.versionId,'future-fixture');assert.equal(result.upcoming.at(-1)?.accepted,false);assert.ok(!JSON.stringify(result).includes('termsText'));
  await assert.rejects(getPriceScenarios(f.db,'reviewer',subject,f.now));
  await savePrivatePriceInputs(f.db,{...ctx,requestId:'scenario-private'},{subject,cost:'600',target:'400'});
  const unavailable={prepare(sql:string){if(sql.includes('business_setting_versions'))throw new Error('Fictional source outage');return f.db.prepare(sql);},batch:f.db.batch.bind(f.db)} as D1Database;
  assert.equal((await getPriceScenarios(unavailable,ctx.actorId,subject,f.now)).current,null);assert.equal((await getPrivatePriceInputs(unavailable,ctx.actorId,subject)).cost,'600');
 }finally{f.dispose();}
});
