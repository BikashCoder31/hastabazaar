import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialPreviewFixture} from './helpers/commercial-preview-fixture';
import {readCommercialCombinationPreview,readCommercialPreviewChoices} from '../lib/incentives/commercial-combination-preview';
import {getSellerCommissionTerms,getCommissionRateState,scheduleCommissionRate,cancelCommissionRate} from '../lib/db/repositories/commission-rates';
import {calculateMarketplaceFee} from '../lib/marketplace/fee-waivers';
import {createBusinessSettingDraft} from '../lib/db/repositories/business-settings';
import {pauseOfferStock,getOfferStock} from '../lib/products/offer-inventory';
import {readonlyBatchDatabase} from './helpers/readonly-batch-database';
import {activatedLiveMakerFixture} from './helpers/activated-live-maker-fixture';
import {publishBusinessSettingDraft,getEffectiveBusinessSetting} from '../lib/db/repositories/business-settings';
import {calculateManagedSaleLinkedAmounts} from '../lib/managed-makers/settlement';

void test('a genuinely activated sale-linked Maker sample uses its own native fee basis without ordering or supplier-cost inference',async()=>{
 const f=await activatedLiveMakerFixture('native-preview-live-maker');try{
  f.sqlite.prepare("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer'").run();const now=Date.now(),fee=await createBusinessSettingDraft(f.db,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:700},actorId:'reviewer',reason:'Explicit isolated actual customer fee for the native Maker sample.',requestId:'preview-live-fee-draft',now});await publishBusinessSettingDraft(f.db,{id:fee.id,actorId:'reviewer',expectedRevision:fee.revision,effectiveFrom:now,reason:'Publish the native sample customer fee without changing any orders.',requestId:'preview-live-fee-publish',now});
  const db=readonlyBatchDatabase(f.db,f.sqlite),actor={id:'reviewer',authSubject:'reviewer'},choices=await readCommercialPreviewChoices(db,actor),offer=choices.offers.find(row=>row.productId===f.productId&&row.offerId===f.offerId);assert.ok(offer);assert.equal(offer.orderable,true);const changes=f.sqlite.prepare('SELECT total_changes() n').get()?.n,result=await readCommercialCombinationPreview(db,actor,{at:Date.now(),district:'Kathmandu',lines:[{productId:offer.productId,offerId:offer.offerId,versionId:offer.versionId,publicVersionId:offer.publicVersionId,quantity:2}],useWallet:false});
  const rate=await getEffectiveBusinessSetting(f.db,'managed_sale_linked_platform_retention_bps',Date.now());assert.equal(typeof rate.value,'number');assert.equal(result.lines[0].fee?.basePaisa,160000);assert.equal(result.lines[0].fee?.amountPaisa,calculateManagedSaleLinkedAmounts({eligibleBasePaisa:160000,platformRetentionBps:Number(rate.value)}).platformRetainedPaisa);assert.equal(result.totals?.payablePaisa,175700);assert.equal(result.eligibility.status,'eligible_at_snapshot');assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,changes);
 }finally{f.dispose();}
});

void test('native sample cart resolves exact effective campaigns, original fee bases and own credit without any writes',async()=>{
 const f=await commercialPreviewFixture();try{const changes=f.sqlite.prepare('SELECT total_changes() n').get()?.n,result=await readCommercialCombinationPreview(f.db,f.actor,f.input);
  assert.equal(result.merchandisePaisa,160000);assert.equal(result.customerFee?.campaign?.id,f.first.id);assert.equal(result.customerFee?.waivedPaisa,700);assert.equal(result.incentive?.discountPaisa,16000);assert.equal(result.wallet.usedPaisa,10000);assert.equal(result.totals?.payablePaisa,149000);
  const terms=await getSellerCommissionTerms(f.db,'registered',f.at);assert.equal(result.lines[0].fee?.basePaisa,160000);assert.equal(result.lines[0].fee?.amountPaisa,calculateMarketplaceFee(160000,terms.basisPoints,null).netPaisa);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,changes);assert.equal(result.hypothetical,true);assert.equal(result.isCheckoutQuote,false);
 }finally{f.dispose();}
});
void test('native source discovery offers original current options and exact unpublished financial references without writes',async()=>{
 const f=await commercialPreviewFixture();try{const changes=f.sqlite.prepare('SELECT total_changes() n').get()?.n,choices=await readCommercialPreviewChoices(f.db,f.actor);assert.ok(choices.offers.some(item=>item.productId===f.productId&&item.offerId==='medium'&&item.pricePaisa===80000));assert.ok(choices.promos.some(item=>item.campaignId===f.promo.campaignId&&item.revision===f.promo.revision));assert.equal(choices.ownCustomerContext,'available');assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,changes);
 }finally{f.dispose();}
});
void test('a superseded published source cannot be relabelled a current or proposed fee version',async()=>{
 const f=await commercialPreviewFixture();try{const now=Date.now(),next=await createBusinessSettingDraft(f.db,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:600},actorId:'reviewer',reason:'A genuine beneficial decrease supersedes the original fictional current fee.',requestId:'preview-lower-fee-draft',now});await publishBusinessSettingDraft(f.db,{id:next.id,actorId:'reviewer',expectedRevision:next.revision,effectiveFrom:now,reason:'Publish this genuine lower native fee without rewriting the original source.',requestId:'preview-lower-fee-publish',now});const retained=await f.db.prepare('SELECT revision FROM business_setting_versions WHERE id=?').bind(f.fee.id).first<{revision:number}>();assert.ok(retained);const changes=f.sqlite.prepare('SELECT total_changes() n').get()?.n,result=await readCommercialCombinationPreview(f.db,f.actor,{...f.input,proposed:{customerFee:{versionId:f.fee.id,revision:retained.revision}}});assert.equal(result.eligibility.status,'unavailable');assert.equal(result.totals,null);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,changes);
 }finally{f.dispose();}
});

void test('expired selected promo is not silently removed, and native quantity and exclusivity limits remain',async()=>{
 const f=await commercialPreviewFixture();try{const changes=f.sqlite.prepare('SELECT total_changes() n').get()?.n,expired=await readCommercialCombinationPreview(f.db,f.actor,{...f.input,at:f.now+600000});assert.equal(expired.totals,null);assert.equal(expired.customerFee?.waivedPaisa,0);assert.match(expired.eligibility.reasons.join(' '),/promo is ineligible/);await assert.rejects(()=>readCommercialCombinationPreview(f.db,f.actor,{...f.input,referralCode:'ABCDEFGHIJKLMNOP'}),/promo OR referral/);await assert.rejects(()=>readCommercialCombinationPreview(f.db,f.actor,{...f.input,lines:[{...f.input.lines[0],quantity:11}]}),/native supported whole quantities/);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,changes);
 }finally{f.dispose();}
});
void test('missing own customer context is unavailable, without provisioning or inventing credit',async()=>{
 const f=await commercialPreviewFixture();try{f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='customer'").run();const changes=f.sqlite.prepare('SELECT total_changes() n').get()?.n,result=await readCommercialCombinationPreview(f.db,f.actor,f.input);assert.equal(result.totals,null);assert.equal(result.wallet.availablePaisa,null);assert.equal(result.wallet.status,'unavailable');assert.match(result.eligibility.reasons.join(' '),/no existing current customer context|own customer/);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,changes);
 }finally{f.dispose();}
});
void test('an actual native stock pause during the final snapshot refuses the stale preview',async()=>{
 const f=await commercialPreviewFixture();try{let changed=false;const raced=new Proxy(f.db,{get(target,key){if(key==='batch')return async(statements:D1PreparedStatement[])=>{if(!changed){changed=true;const stock=await getOfferStock(f.db,'medium');assert.ok(stock);await pauseOfferStock(f.db,{actorId:'registered-owner',requestId:'preview-concurrent-stock-pause',expectedRevision:String(stock.revision),now:Date.now()},{offerId:'medium',paused:true,reason:'Actual native fictional concurrent stock pause before the readonly result.'});}return target.batch(statements);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  await assert.rejects(()=>readCommercialCombinationPreview(raced,f.actor,f.input),(error:unknown)=>error instanceof Error&&'status'in error&&error.status===409);assert.equal(changed,true);assert.equal((await getOfferStock(f.db,'medium'))?.paused,1);
 }finally{f.dispose();}
});
void test('exact proposed customer fee and pause simulation change the deterministic winner without publishing or pausing',async()=>{
 const f=await commercialPreviewFixture();try{const draft=await createBusinessSettingDraft(f.db,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:1200},actorId:'reviewer',reason:'An explicit unpublished value for the hypothetical native preview.',requestId:'preview-proposed-fee',now:Date.now()}),changes=f.sqlite.prepare('SELECT total_changes() n').get()?.n;
  const result=await readCommercialCombinationPreview(f.db,f.actor,{...f.input,proposed:{customerFee:{versionId:draft.id,revision:draft.revision},waiver:{campaignId:f.first.id,revision:f.first.revision,state:'paused'}}});assert.equal(result.customerFee?.campaign?.id,f.second.id);assert.equal(result.customerFee?.waivedPaisa,1200);assert.equal(result.sources.some(source=>source.id===draft.id&&source.proposed),true);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,changes);assert.equal(f.sqlite.prepare('SELECT state FROM customer_fee_waiver_revisions WHERE campaign_id=? AND revision=?').get(f.first.id,f.first.revision)?.state,'published');
 }finally{f.dispose();}
});


void test('a genuinely scheduled supplement at the sample time cannot replace the selected registered rate during the final read',async()=>{
 const f=await commercialPreviewFixture();try{const initial=await getCommissionRateState(f.db,f.now);for(const future of initial.history.filter(row=>row.status==='scheduled'))await cancelCommissionRate(f.db,{actorId:'reviewer',rateId:future.id,expectedRevision:(await getCommissionRateState(f.db,f.now)).revision,requestId:'preview-retire-'+future.id,reason:'Retain and retire the unrelated far-future fixture plan before this actual scheduling race.',now:f.now});let changed=false;const sampleAt=f.now+16*86400000;const raced=new Proxy(f.db,{get(target,key){if(key==='batch')return async(statements:D1PreparedStatement[])=>{if(!changed){changed=true;const state=await getCommissionRateState(f.db,f.now);await scheduleCommissionRate(f.db,{actorId:'reviewer',requestId:'preview-concurrent-supplement',expectedRevision:state.revision,basisPoints:1000,effectiveAt:sampleAt-1,reason:'Schedule an actual fictional future source before returning the old preview.',now:f.now});}return target.batch(statements);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  await assert.rejects(()=>readCommercialCombinationPreview(raced,f.actor,{...f.input,at:sampleAt,promo:undefined,useWallet:false}),(error:unknown)=>error instanceof Error&&'status'in error&&error.status===409);assert.equal(changed,true);
 }finally{f.dispose();}
});
