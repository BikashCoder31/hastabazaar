import assert from 'node:assert/strict';
import test from 'node:test';
import {activatedLiveMakerFixture} from './helpers/activated-live-maker-fixture';
import {acceptLiveCurrentTerms} from './helpers/live-maker-current-proof-fixture';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../lib/db/repositories/business-settings';
import {getPublicOfferSet} from '../lib/products/public-offers';
import {readManagedLiveEligibility} from '../lib/managed-commerce/live-readiness';
import {publishedLiveMakerFixture} from './helpers/live-maker-offer-fixture';
import {publicProductVisibility,publicProductEligibility} from '../lib/products/eligibility';

void test('reviewed in-stock managed products are browseable before live activation',async()=>{
 const f=await publishedLiveMakerFixture();try{
  const row=f.sqlite.prepare(`SELECT ${publicProductVisibility('products',Date.now())} visible,${publicProductEligibility('products',Date.now())} orderable FROM products WHERE id=?`).get(f.productId)!;
  assert.equal(row.visible,1);assert.equal(row.orderable,0);
  assert.equal(f.sqlite.prepare('SELECT application_stage stage FROM seller_participation_profiles WHERE seller_id=?').get(f.sellerId)!.stage,'approved_for_activation');
  assert.equal(f.sqlite.prepare('SELECT available FROM offer_stock WHERE offer_id=?').get(f.offerId)!.available,9);
 }finally{f.dispose();}
});

void test('an actual active listing remains browseable during a genuine new effective fee hold and acceptance restores the same activation',async()=>{
 const f=await activatedLiveMakerFixture('browse-live-policy');try{
  assert.equal((await getPublicOfferSet(f.db,f.productId))!.orderable,true);
  const original=String(f.sqlite.prepare('SELECT source_json FROM managed_live_activation_decisions WHERE id=?').get(f.activation.id)!.source_json);
  const now=Date.now(),draft=await createBusinessSettingDraft(f.db,{key:'managed_sale_linked_platform_retention_bps',value:1725,actorId:'reviewer',reason:'A genuinely new effective commercial fee requires exact owner acceptance.',requestId:'browse-new-fee',now});
  await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:now,reason:'Publish the reviewed fee while preserving retained product browsing.',requestId:'browse-new-fee-publish',now});
  const held=await readManagedLiveEligibility(f.db,f.sellerId,Date.now());assert.equal(held.enabled,false);assert.ok(held.blockers.some(b=>b.id==='current_terms'));
  const row=f.sqlite.prepare(`SELECT ${publicProductVisibility('products',Date.now())} visible,${publicProductEligibility('products',Date.now())} orderable FROM products WHERE id=?`).get(f.productId)!;
  assert.equal(row.visible,1,'A genuine terms-only ordering blocker must not hide retained reviewed content.');assert.equal(row.orderable,0);
  const heldOffers=await getPublicOfferSet(f.db,f.productId);assert.ok(heldOffers);assert.equal(heldOffers.orderable,false);assert.ok(heldOffers.offers.every(offer=>!offer.orderable));
  await acceptLiveCurrentTerms(f,'browse-accept-current-fee');
  const restored=await readManagedLiveEligibility(f.db,f.sellerId,Date.now());assert.equal(restored.enabled,true);assert.equal(restored.proof!.activationDecisionId,f.activation.id);assert.equal((await getPublicOfferSet(f.db,f.productId))!.orderable,true);
  assert.equal(String(f.sqlite.prepare('SELECT source_json FROM managed_live_activation_decisions WHERE id=?').get(f.activation.id)!.source_json),original,'Original activation and accepted source history stays immutable.');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_live_activation_decisions').get()!.n,1);
  f.sqlite.prepare("INSERT INTO seller_restrictions(seller_id,mode,obligation_mode,reason_code,private_reason,version,applied_by,applied_at,updated_at) VALUES(?,'disabled','allow_existing','fixture','Fictional independent visibility restriction',1,'reviewer',1,1)").run(f.sellerId);
  assert.equal(f.sqlite.prepare(`SELECT ${publicProductVisibility('products',Date.now())} visible FROM products WHERE id=?`).get(f.productId)!.visible,0,'A separate visibility restriction still applies.');
  assert.equal(await getPublicOfferSet(f.db,f.productId),null);
 }finally{f.dispose();}
});
