import test from 'node:test';
import assert from 'node:assert/strict';
import {liveMakerFixture} from './helpers/live-maker-fixture';
import {addReviewedLiveClearance} from './helpers/live-clearance-fixture';
import {getManagedClearanceScope,readCurrentManagedClearance,reviewManagedClearance,revokeManagedClearance} from '../lib/managed-commerce/live-clearance';
import {MANAGED_SUPPLIER_AGREEMENT_VERSION} from '../lib/sellers/managed-identity';
void test('actual external clearance is separate from application approval, bank review and owner consent, retains current v2 terms and exact material sources',async()=>{
 const f=await liveMakerFixture();try{
  const before=await getManagedClearanceScope(f.db,f.sellerId,Date.now());assert.equal(before.currentOffer.agreementVersion,MANAGED_SUPPLIER_AGREEMENT_VERSION);assert.equal(before.acceptedTerms?.retentionBps,1375);assert.equal(await readCurrentManagedClearance(f.db,before,Date.now()),null);
  const original=f.sqlite.prepare('SELECT agreement_version,agreement_language FROM managed_maker_application_details WHERE seller_id=? ORDER BY created_at DESC,id DESC LIMIT 1').get(f.sellerId)!;
  assert.equal(original.agreement_version,MANAGED_SUPPLIER_AGREEMENT_VERSION);assert.equal(original.agreement_language,'en','Current intake must retain the language of the displayed and explicitly accepted English agreement.');
  const c=await addReviewedLiveClearance(f);
  assert.equal((await readCurrentManagedClearance(f.db,c.scope,Date.now()))!.id,c.clearanceId);
  assert.equal(f.sqlite.prepare('SELECT application_stage FROM seller_participation_profiles WHERE seller_id=?').get(f.sellerId)!.application_stage,'approved_for_activation');
  assert.equal(f.sqlite.prepare('SELECT tax_mode FROM seller_profiles WHERE id=?').get(f.sellerId)!.tax_mode,'NONE');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_live_activation_decisions').get()!.n,0);
  await assert.rejects(reviewManagedClearance(f.db,f.ctx('unattested-external-source'),{...c.input,externalAuthenticityConfirmed:false}));
  await assert.rejects(reviewManagedClearance(f.db,f.ctx('missing-external-source'),{...c.input,evidenceIds:[]}));
  await assert.rejects(reviewManagedClearance(f.db,{...f.ctx('owner-self-clearance'),actorId:f.ownerId},c.input));
  await assert.rejects(f.db.prepare('DELETE FROM managed_live_clearances WHERE id=?').bind(c.clearanceId).run(),/retained/);
  await revokeManagedClearance(f.db,f.ctx('clearance-revoked','0'),{clearanceId:c.clearanceId,reason:'The actual external issuer revoked this fictional clearance; retain its exact original source and await review.'});
  assert.equal(await readCurrentManagedClearance(f.db,c.scope,Date.now()),null);
 }finally{f.dispose();}
});
void test('changed legal material cannot reuse another scope while routine fee changes do not rewrite external clearance',async()=>{
 const f=await liveMakerFixture();try{
  const c=await addReviewedLiveClearance(f,'material-scope-case');
  const {createBusinessSettingDraft,publishBusinessSettingDraft}=await import('../lib/db/repositories/business-settings');
  const now=Date.now(),draft=await createBusinessSettingDraft(f.db,{key:'managed_sale_linked_platform_retention_bps',value:1525,actorId:'reviewer',reason:'Publish a separately accepted future commercial fee in the isolated current-contract fixture.',requestId:'live-new-effective-fee',now});
  await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:now,reason:'The new effective fee needs owner acceptance while external legal material remains unchanged.',requestId:'live-new-effective-fee-published',now});
  const current=await getManagedClearanceScope(f.db,f.sellerId,Date.now());assert.equal(current.materialScopeDigest,c.scope.materialScopeDigest);assert.equal(current.acceptedTerms,null);assert.equal((await readCurrentManagedClearance(f.db,current,Date.now()))!.id,c.clearanceId);
  f.sqlite.prepare('UPDATE seller_profiles SET legal_name=? WHERE id=?').run('Different fictional legal party',f.sellerId);
  const changed=await getManagedClearanceScope(f.db,f.sellerId,Date.now());assert.notEqual(changed.materialScopeDigest,current.materialScopeDigest);assert.equal(await readCurrentManagedClearance(f.db,changed,Date.now()),null);
 }finally{f.dispose();}
});
