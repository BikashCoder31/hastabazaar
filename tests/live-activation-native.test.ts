import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedLiveMakerFixture} from './helpers/live-maker-offer-fixture';
import {addReviewedLiveClearance} from './helpers/live-clearance-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {getManagedLiveActivationReview,activateManagedMakerLive,readManagedLiveEligibility,managedLiveEligibilityGuards} from '../lib/managed-commerce/live-activation';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../lib/db/repositories/business-settings';
import {acceptLiveCurrentTerms,replaceLiveMakerBank} from './helpers/live-maker-current-proof-fixture';
import {checkoutCommitClock} from '../lib/checkout/commit-policy-guards';
void test('native independent live decisions compete once, replay safely, and use current accepted fee and same-beneficiary bank sources',async()=>{
 const f=await publishedLiveMakerFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  const c=await addReviewedLiveClearance(f,'native-live-scope');target=await nativeFinanceClone(f.sqlite);const db=target.db;
  const review=await getManagedLiveActivationReview(db,'reviewer',f.sellerId);assert.equal(review.readyForActivation,true,JSON.stringify(review.blockers));
  const input={sellerId:f.sellerId,readinessDigest:review.readinessDigest,clearanceId:c.clearanceId,reason:'Enable only the current actual independently cleared native fictional live commercial scope.'},contexts=['a','b'].map(suffix=>f.ctx('native-activate-'+suffix,String(review.participationVersion)));
  const results=await Promise.allSettled(contexts.map(ctx=>activateManagedMakerLive(db,ctx,input)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results.map(r=>r.status==='fulfilled'?r:{error:String(r.reason),cause:String(r.reason?.cause)})));
  const winner=results.findIndex(r=>r.status==='fulfilled'),saved=(results[winner] as PromiseFulfilledResult<{id:string}>).value;assert.deepEqual(await activateManagedMakerLive(db,contexts[winner],input),saved);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM managed_live_activation_decisions').first<{n:number}>())!.n,1);
  const now=Date.now(),draft=await createBusinessSettingDraft(db,{key:'managed_sale_linked_platform_retention_bps',value:1625,actorId:'reviewer',reason:'A native current effective fee needs its own owner consent.',requestId:'native-fee-draft',now});
  await publishBusinessSettingDraft(db,{id:draft.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:now,reason:'Publish the independently reviewed native current fee.',requestId:'native-fee-publish',now});
  assert.equal((await readManagedLiveEligibility(db,f.sellerId,Date.now())).enabled,false);
  const accepted=await acceptLiveCurrentTerms({db,sellerId:f.sellerId,ownerId:f.ownerId},'native-accept-current-fee');
  const holder=String(f.sqlite.prepare('SELECT legal_name FROM seller_profiles WHERE id=?').get(f.sellerId)!.legal_name),bank=await replaceLiveMakerBank({db,sellerId:f.sellerId,ownerId:f.ownerId},'native-current-bank',holder);
  const current=await readManagedLiveEligibility(db,f.sellerId,Date.now());assert.equal(current.enabled,true,JSON.stringify(current.blockers));assert.equal(current.proof!.activationDecisionId,saved.id);assert.equal(current.proof!.acceptedManagedDetailId,accepted.detailId);assert.equal(current.proof!.beneficiaryReference,bank.bank.reference);
  await db.batch(await managedLiveEligibilityGuards(db,current.proof!,Date.now()));
 }finally{await target?.dispose();f.dispose();}
});
void test('native raw clearance requires explicit assessments and post-review role or personal-party races roll back the whole activation',async()=>{
 const f=await publishedLiveMakerFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  const c=await addReviewedLiveClearance(f,'native-source-boundary');target=await nativeFinanceClone(f.sqlite);const base=target.db,clock=checkoutCommitClock(base);
  await assert.rejects(base.prepare(`INSERT INTO managed_live_clearances(id,seller_id,owner_id,model,material_scope_digest,company_scope_digest,financial_scope_id,issuer_model,issuer_scope_digest,scope_json,evidence_ids_json,issuer,external_reference,issued_at,effective_from,valid_until,reviewed_by,reviewed_at,request_id,reason) SELECT 'native-forged-clearance',seller_id,owner_id,model,material_scope_digest,company_scope_digest,financial_scope_id,issuer_model,issuer_scope_digest,json_remove(scope_json,'$.attestations'),evidence_ids_json,issuer,external_reference,issued_at,effective_from,valid_until,reviewed_by,${clock},'native-forged-clearance-request',reason FROM managed_live_clearances WHERE id=?`).bind(c.clearanceId).run(),/managed_live_explicit_external_attestation_required/);
  for(const mutation of ['role','party']){
   const review=await getManagedLiveActivationReview(base,'reviewer',f.sellerId);let fired=false;
   const db={prepare:base.prepare.bind(base),async batch(statements:D1PreparedStatement[]){if(!fired){fired=true;await(mutation==='role'?base.prepare("UPDATE users SET status='disabled' WHERE id='reviewer'"):base.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id=?").bind(f.sellerId)).run();}return base.batch(statements);}} as D1Database;
   await assert.rejects(activateManagedMakerLive(db,f.ctx('native-commit-'+mutation,String(review.participationVersion)),{sellerId:f.sellerId,readinessDigest:review.readinessDigest,clearanceId:c.clearanceId,reason:'An actor or personally interested source changing after review must invalidate the whole exact live decision.'}),{status:403});assert.equal(fired,true);
   assert.equal((await base.prepare('SELECT COUNT(*) n FROM managed_live_activation_decisions').first<{n:number}>())!.n,0);assert.equal((await base.prepare('SELECT application_stage stage FROM seller_participation_profiles WHERE seller_id=?').bind(f.sellerId).first<{stage:string}>())!.stage,'approved_for_activation');
   if(mutation==='role')await base.prepare("UPDATE users SET status='active' WHERE id='reviewer'").run();
  }
 }finally{await target?.dispose();f.dispose();}
});
