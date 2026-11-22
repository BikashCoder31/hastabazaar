import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedLiveMakerFixture} from './helpers/live-maker-offer-fixture';
import {addReviewedLiveClearance} from './helpers/live-clearance-fixture';
void test('approval and verified bank alone cannot enable real orders, and seller personal review remains denied',async()=>{
 const f=await publishedLiveMakerFixture();try{
  const live=await import('../lib/managed-commerce/live-activation');
  const current=await live.readManagedLiveEligibility(f.db,f.sellerId,Date.now());assert.equal(current.enabled,false);assert.ok(current.blockers.some(row=>row.id==='external_clearance'));
  const review=await live.getManagedLiveActivationReview(f.db,'reviewer',f.sellerId);
  await assert.rejects(live.activateManagedMakerLive(f.db,f.ctx('no-external-clearance',String(review.participationVersion)),{sellerId:f.sellerId,readinessDigest:review.readinessDigest,clearanceId:'not-issued',reason:'A staff note and bank verification cannot manufacture external clearance.'}));
  await assert.rejects(live.getManagedLiveActivationReview(f.db,f.ownerId,f.sellerId));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_live_activation_decisions').get()!.n,0);
 }finally{f.dispose();}
});
void test('one eligible Super Admin enables current v2 sale-linked orders with exact external evidence, actual references, audit and safe replay',async()=>{
 const f=await publishedLiveMakerFixture();try{
  const c=await addReviewedLiveClearance(f),live=await import('../lib/managed-commerce/live-activation');
  const review=await live.getManagedLiveActivationReview(f.db,'reviewer',f.sellerId);assert.equal(review.readyForActivation,true,JSON.stringify(review.blockers));
  const ctx=f.ctx('actual-live-activation',String(review.participationVersion)),input={sellerId:f.sellerId,readinessDigest:review.readinessDigest,clearanceId:c.clearanceId,reason:'Enable only this exact independently cleared and accepted live sale-linked commercial scope.'};
  const saved=await live.activateManagedMakerLive(f.db,ctx,input);assert.deepEqual(await live.activateManagedMakerLive(f.db,ctx,input),saved);
  const current=await live.readManagedLiveEligibility(f.db,f.sellerId,Date.now());assert.equal(current.enabled,true);assert.ok(current.proof);assert.equal(current.proof.acceptedManagedDetailId,c.scope.acceptedTerms!.detailId);assert.equal(current.proof.financialScopeId,c.financial.id);
  const participation=f.sqlite.prepare('SELECT * FROM seller_participation_profiles WHERE seller_id=?').get(f.sellerId)!;assert.equal(participation.application_stage,'active');assert.equal(participation.legal_seller_reference,c.scope.companyEntityReference);assert.equal(participation.invoice_issuer_reference,c.scope.companyEntityReference);assert.equal(participation.payout_beneficiary_reference,f.sources.beneficiaryReference);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_live_activation_decisions').get()!.n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='managed_maker.simulation_activated' AND subject_id=?").get(f.sellerId)!.n,0);
  assert.doesNotMatch(JSON.stringify(current),/123456789|TEST-MANAGED-001|private\/managed-clearance|governmentIdDescription/);
  await assert.rejects(live.activateManagedMakerLive(f.db,{...ctx,requestId:'stale-live-activation'},input));
 }finally{f.dispose();}
});
