import assert from 'node:assert/strict';
import test from 'node:test';
import {publishedOfferFixture} from './helpers/public-offer-fixture';
import {SELLER_AGREEMENT_VERSION} from '../lib/content/legal-policies';
import {offerHead} from '../lib/products/offers';
import {getProductWorkspace} from '../lib/products/intake-workspace';
import {submitProductPriceRevision} from '../lib/products/price-revision';
import {getProductPublicationReview} from '../lib/products/publication';
import {reviewPriceReference} from '../lib/products/price-references';
import {physicalOfferIdentity} from '../lib/products/offer-contracts';
import {getPublicOfferSet} from '../lib/products/public-offers';
import {readProductCommandOutcome} from '../lib/products/command-outcomes';

async function history(){const path='../lib/products/orderable-price-history';const api=await import(path).catch(()=>null);assert.equal(typeof api?.captureOrderablePriceObservation,'function','Native genuinely orderable history must exist without requiring a sale.');return api!;}
async function captureScope(f:Awaited<ReturnType<typeof publishedOfferFixture>>){const view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId);return {caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision)};}
void test('native history retains only an atomic current orderable observation and retries once, without a sale',async()=>{
 const api=await history(),f=await publishedOfferFixture();try{
  const head=await offerHead(f.db,f.productId),ctx={actorId:'reviewer',requestId:'capture-orderable-price',expectedRevision:String(head!.revision),now:f.now+20},input={...await captureScope(f),productId:f.productId,offerId:'medium',publicVersionId:f.approved.versionId,reason:'Observe the actual current public offer and its genuine order availability.'};
  const first=await api.captureOrderablePriceObservation(f.db,ctx,input);assert.deepEqual(await api.captureOrderablePriceObservation(f.db,ctx,input),first);
  const rows=f.sqlite.prepare('SELECT * FROM product_orderable_price_observations').all();assert.equal(rows.length,1);assert.equal(rows[0].observed_at,ctx.now);assert.equal(rows[0].selling_paisa,80000);assert.equal(rows[0].currency,'NPR');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_items WHERE product_id=?').get(f.productId)!.n,0);
  assert.throws(()=>f.sqlite.exec("UPDATE product_orderable_price_observations SET selling_paisa=90000"),/immutable/);assert.throws(()=>f.sqlite.exec('DELETE FROM product_orderable_price_observations'),/retained/);
  assert.equal((await readProductCommandOutcome(f.db,'reviewer','admin',{kind:'publication_review',sourceId:f.sent.caseId,requestId:ctx.requestId,action:'observe_price'})).status,'recorded');
  const publicView=JSON.stringify(await getPublicOfferSet(f.db,f.productId,ctx.now));assert.equal(publicView.includes(first.id),false);assert.equal(publicView.includes(input.reason),false);
  f.sqlite.exec(`UPDATE staff_permission_profiles SET permissions_json='["product.publish"]' WHERE user_id='delegate'`);assert.deepEqual((await getProductPublicationReview(f.db,'delegate',f.sent.caseId)).priceHistory,[]);
 }finally{f.dispose();}
});
void test('an immutable native observation supports only its exact later candidate pair after explicit relevance review',async()=>{
 const api=await history(),f=await publishedOfferFixture();try{
  const head=await offerHead(f.db,f.productId),observed=await api.captureOrderablePriceObservation(f.db,{actorId:'reviewer',requestId:'retain-original-orderable',expectedRevision:String(head!.revision),now:f.now+20},{...await captureScope(f),productId:f.productId,offerId:'medium',publicVersionId:f.approved.versionId,reason:'Retain the genuine public selling offer before a later price proposal.'});
  const work=await getProductWorkspace(f.db,'registered-owner',f.input.draftId),sent=await submitProductPriceRevision(f.db,{actorId:'registered-owner',requestId:'later-price-proposal',expectedRevision:String(work.publication!.revision),now:f.now+30},{draftId:f.input.draftId,baseVersionId:f.approved.versionId,expectedDraftRevision:String(work.revision),expectedCaseId:work.case!.caseId,expectedCaseRevision:String(work.case!.revision),replaceVersionId:work.case!.versionId,offerId:'medium',price:'700',compareAt:'800',note:'Propose a genuine lower selling price, subject to independent review.'});
  const view=await getProductPublicationReview(f.db,'reviewer',sent.caseId),row=view.candidate.snapshot.offers.offers.find(row=>row.id==='medium')!,ctx={actorId:'reviewer',requestId:'native-reference-review',expectedRevision:String(view.offerRevision),now:f.now+40},input={productId:f.productId,versionId:view.candidate.offerVersionId,offerId:'medium',decision:'approved' as const,evidence:{kind:'platform_orderable' as never,reference:observed.id,sellerId:'registered',offerId:'medium',physicalIdentity:physicalOfferIdentity(row),originalPaisa:80000,offeredFrom:observed.observedAt,offeredTo:observed.observedAt,checkedSameSellerOffer:true,checkedPriceHistory:true,historyThroughId:observed.id,historyCount:1,historyBasis:'Reviewed chronology, intervening prices and condition; this observed price is relevant rather than a temporary inflation.'},reason:'Independently checked this prior genuinely orderable price for the same physical offer.'};
  await assert.rejects(reviewPriceReference(f.db,ctx,{...input,evidence:{...input.evidence,checkedPriceHistory:false}}));
  await assert.rejects(reviewPriceReference(f.db,ctx,{...input,evidence:{...input.evidence,offeredFrom:observed.observedAt-1}}));
  for(const change of [{reference:'missing-observation'},{sellerId:'maker'},{offerId:'large'},{originalPaisa:90000},{physicalIdentity:'different pack'},{historyThroughId:'superseded-history'},{historyBasis:''}])await assert.rejects(reviewPriceReference(f.db,ctx,{...input,evidence:{...input.evidence,...change}}));
  const latest=await api.captureOrderablePriceObservation(f.db,{...ctx,requestId:'intervening-price-observation',now:f.now+35},{productId:f.productId,offerId:'medium',publicVersionId:f.approved.versionId,caseId:sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),reason:'Retain another actual current orderable point while the proposal remains under review.'});
  await assert.rejects(reviewPriceReference(f.db,ctx,input),/chronology changed/);input.evidence.historyThroughId=latest.id;
  await assert.rejects(reviewPriceReference(f.db,ctx,input),/chronology changed/);input.evidence.historyCount=2;
  f.setBeforeBatch(async()=>{await api.captureOrderablePriceObservation(f.db,{...ctx,requestId:'concurrent-price-observation',now:f.now+35},{productId:f.productId,offerId:'medium',publicVersionId:f.approved.versionId,caseId:sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),reason:'Retain an independently valid simultaneous observation before the reference review commits.'});});
  await assert.rejects(reviewPriceReference(f.db,ctx,input));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_price_reference_reviews').get()!.n,0);
  const refreshed=await api.orderablePriceObservations(f.db,f.productId,'registered');input.evidence.historyThroughId=refreshed[0].id;input.evidence.historyCount=3;
  const result=await reviewPriceReference(f.db,ctx,input);assert.equal(result.approved,true);
  const retained=f.sqlite.prepare('SELECT * FROM product_price_reference_reviews WHERE id=?').get(result.id)!;assert.equal(retained.evidence_kind,'platform_orderable');assert.equal(retained.evidence_reference,observed.id);assert.equal(retained.offered_from,retained.offered_to);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_items WHERE product_id=?').get(f.productId)!.n,0);
  assert.equal(retained.history_basis,input.evidence.historyBasis);await assert.rejects(readProductCommandOutcome(f.db,'reviewer','admin',{kind:'publication_review',sourceId:sent.caseId,requestId:'retain-original-orderable',action:'observe_price'}),'Another review case for the same product cannot claim this receipt.');
 }finally{f.dispose();}
});
void test('draft/browse-only, paused, unconfirmed, seller-ineligible and unauthorized observations fail without history',async()=>{
 const api=await history(),f=await publishedOfferFixture();try{
  const head=await offerHead(f.db,f.productId),ctx={actorId:'reviewer',requestId:'capture-gates-negative',expectedRevision:String(head!.revision),now:f.now+20},input={...await captureScope(f),productId:f.productId,offerId:'medium',publicVersionId:f.approved.versionId,reason:'Retain only an actually public and available genuine selling price.'};
  for(const actorId of ['registered-owner','foreign'])await assert.rejects(api.captureOrderablePriceObservation(f.db,{...ctx,actorId},input));
  for(const [change,restore]of [
   ["UPDATE products SET status='draft'","UPDATE products SET status='published'"],
   ["UPDATE product_offer_current SET offer_json=json_set(offer_json,'$.browseOnly',json('true'))","UPDATE product_offer_current SET offer_json=json_set(offer_json,'$.browseOnly',json('false'))"],
   ["UPDATE offer_stock SET paused=1,revision=revision+1","UPDATE offer_stock SET paused=0,revision=revision+1"],
   ["UPDATE offer_stock SET needs_reconfirmation=1,revision=revision+1","UPDATE offer_stock SET needs_reconfirmation=0,revision=revision+1"],
   ["UPDATE users SET status='disabled' WHERE id='registered-owner'","UPDATE users SET status='active' WHERE id='registered-owner'"],
   ["UPDATE seller_profiles SET seller_agreement_version=NULL WHERE id='registered'",`UPDATE seller_profiles SET seller_agreement_version='${SELLER_AGREEMENT_VERSION}' WHERE id='registered'`],
  ]){f.sqlite.exec(change);await assert.rejects(api.captureOrderablePriceObservation(f.db,ctx,input),error=>error instanceof Error,change);f.sqlite.exec(restore);}
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_orderable_price_observations').get()!.n,0);
 }finally{f.dispose();}
});
void test('current authority, consent and publication races cannot retain a false observation',async()=>{
 const api=await history(),f=await publishedOfferFixture();try{
  const head=await offerHead(f.db,f.productId),ctx={actorId:'delegate',requestId:'capture-authority-race',expectedRevision:String(head!.revision),now:f.now+20},input={...await captureScope(f),productId:f.productId,offerId:'medium',publicVersionId:f.approved.versionId,reason:'Observe the current independently verified public selling offer.'};
  for(const [change,restore]of [
   [`UPDATE staff_permission_profiles SET permissions_json='[]',version=version+1 WHERE user_id='delegate'`,`UPDATE staff_permission_profiles SET permissions_json='["product.review"]',version=version+1 WHERE user_id='delegate'`],
   ["UPDATE seller_profiles SET seller_agreement_version=NULL WHERE id='registered'",`UPDATE seller_profiles SET seller_agreement_version='${SELLER_AGREEMENT_VERSION}' WHERE id='registered'`],
   ["UPDATE products SET status='draft'","UPDATE products SET status='published'"],
  ]){f.setBeforeBatch(()=>{f.sqlite.exec(change);});await assert.rejects(api.captureOrderablePriceObservation(f.db,ctx,input));f.sqlite.exec(restore);}
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_orderable_price_observations').get()!.n,0);
 }finally{f.dispose();}
});
void test('an out-of-stock offer and a stock race cannot create platform price evidence',async()=>{
 const api=await history(),f=await publishedOfferFixture();try{
  const head=await offerHead(f.db,f.productId),ctx={actorId:'reviewer',requestId:'capture-stock-negative',expectedRevision:String(head!.revision),now:f.now+20},input={...await captureScope(f),productId:f.productId,offerId:'small',publicVersionId:f.approved.versionId,reason:'Observe the current public price only if it can actually be bought.'};
  await assert.rejects(api.captureOrderablePriceObservation(f.db,ctx,input),/orderable|stock|available/i);
  f.setBeforeBatch(()=>{f.sqlite.exec("UPDATE offer_stock SET available=0,revision=revision+1 WHERE offer_id='medium'");});
  await assert.rejects(api.captureOrderablePriceObservation(f.db,{...ctx,requestId:'capture-stock-race'},{...input,offerId:'medium'}));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_orderable_price_observations').get()!.n,0);
 }finally{f.dispose();}
});

