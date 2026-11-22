import test from 'node:test';
import assert from 'node:assert/strict';
import {activatedLiveMakerFixture} from './helpers/activated-live-maker-fixture';
import {acceptLiveCurrentTerms,replaceLiveMakerBank} from './helpers/live-maker-current-proof-fixture';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../lib/db/repositories/business-settings';
import {readManagedLiveEligibility,getManagedLiveActivationReview,activateManagedMakerLive} from '../lib/managed-commerce/live-activation';
import {revokeManagedClearance} from '../lib/managed-commerce/live-clearance';
import {getAcceptedManagedTerms} from '../lib/managed-commerce/accepted-terms';
void test('accepting actual new effective fee terms automatically restores the same activation and leaves original consent audit intact',async()=>{
 const f=await activatedLiveMakerFixture('fee-validity');try{
  const now=Date.now(),draft=await createBusinessSettingDraft(f.db,{key:'managed_sale_linked_platform_retention_bps',value:1525,actorId:'reviewer',reason:'Publish independently accepted fictional current fee terms.',requestId:'new-live-fee',now});
  await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:now,reason:'Require the exact owner current fee acceptance before new orders.',requestId:'publish-new-live-fee',now});
  const held=await readManagedLiveEligibility(f.db,f.sellerId,Date.now());assert.equal(held.enabled,false);assert.ok(held.blockers.some(b=>b.id==='current_terms'));
  const accepted=await acceptLiveCurrentTerms(f,'accept-1525-live-fee'),current=await readManagedLiveEligibility(f.db,f.sellerId,Date.now());
  assert.equal(current.enabled,true,JSON.stringify(current.blockers));assert.equal(current.proof!.activationDecisionId,f.activation.id);assert.equal(current.proof!.acceptedManagedDetailId,accepted.detailId);assert.equal((await getAcceptedManagedTerms(f.db,f.sellerId,Date.now()))!.retentionBps,1525);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_live_activation_decisions').get()!.n,1);
  assert.equal(JSON.parse(String(f.sqlite.prepare('SELECT source_json FROM managed_live_activation_decisions WHERE id=?').get(f.activation.id)!.source_json)).acceptedManagedDetailId,f.clearance.scope.acceptedTerms!.detailId);
 }finally{f.dispose();}
});
void test('same verified legal beneficiary bank replacement retains activation; a different beneficiary assessment cannot reuse clearance',async()=>{
 const f=await activatedLiveMakerFixture('bank-validity');try{
  const holder=String(f.sqlite.prepare('SELECT legal_name FROM seller_profiles WHERE id=?').get(f.sellerId)!.legal_name),first=await replaceLiveMakerBank(f,'same-beneficiary',holder);
  assert.equal(first.pending.reference,f.sources.beneficiaryReference);
  const current=await readManagedLiveEligibility(f.db,f.sellerId,Date.now());assert.equal(current.enabled,true,JSON.stringify(current.blockers));assert.equal(current.proof!.activationDecisionId,f.activation.id);assert.equal(current.proof!.beneficiaryReference,first.bank.reference);assert.notEqual(current.proof!.beneficiaryReference,f.liveProof.beneficiaryReference);
  await replaceLiveMakerBank(f,'changed-beneficiary','Different Fictional Legal Beneficiary');
  const changed=await readManagedLiveEligibility(f.db,f.sellerId,Date.now());assert.equal(changed.enabled,false);assert.ok(changed.blockers.some(b=>b.id==='external_clearance'));assert.equal(changed.proof,null);
 }finally{f.dispose();}
});
void test('disabled subject remains reviewable and revocable by an independent active Super Admin while new activation is denied',async()=>{
 const f=await activatedLiveMakerFixture('disabled-validity');try{
  f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id=?").run(f.ownerId);
  const review=await getManagedLiveActivationReview(f.db,'reviewer',f.sellerId);assert.equal(review.enabled,false);assert.ok(review.blockers.some(b=>b.id==='owner'));
  await assert.rejects(activateManagedMakerLive(f.db,f.ctx('disabled-new-activation',String(review.participationVersion)),{sellerId:f.sellerId,clearanceId:f.clearance.clearanceId,readinessDigest:review.readinessDigest,reason:'A disabled owner cannot acquire fresh live order acceptance.'}));
  await revokeManagedClearance(f.db,f.ctx('disabled-clearance-revoke','0'),{clearanceId:f.clearance.clearanceId,reason:'Explicitly withdraw actual external clearance while its subject account is disabled.'});
  assert.equal(f.sqlite.prepare('SELECT state FROM managed_live_clearances WHERE id=?').get(f.clearance.clearanceId)!.state,'revoked');
 }finally{f.dispose();}
});
