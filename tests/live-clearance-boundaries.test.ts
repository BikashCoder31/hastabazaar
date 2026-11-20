import test from 'node:test';
import assert from 'node:assert/strict';
import {liveMakerFixture} from './helpers/live-maker-fixture';
import {addReviewedLiveClearance} from './helpers/live-clearance-fixture';
import {reviewManagedClearance,readCurrentManagedClearance,managedClearanceGuards} from '../lib/managed-commerce/live-clearance';
import {recordManagedLiveFinancialScope} from '../lib/managed-commerce/live-billing';
import {readManagedLiveEligibility} from '../lib/managed-commerce/live-readiness';
import {managedLiveAuthority} from '../lib/managed-commerce/live-activation-support';
void test('external review retains every explicit assessment attestation and rejects another issuer despite a copied company digest',async()=>{
 const f=await liveMakerFixture();try{
  const c=await addReviewedLiveClearance(f,'assessment-audit');
  const row=await f.db.prepare('SELECT scope_json source FROM managed_live_clearances WHERE id=?').bind(c.clearanceId).first<{source:string}>();
  assert.deepEqual(JSON.parse(row!.source).attestations,{externalAuthenticityConfirmed:true,supplierRegistrationTaxAssessmentConfirmed:true,invoiceIssuerConfirmed:true,payoutBeneficiaryConfirmed:true});
  const company=c.scope.currentOffer.snapshot.company;
  await assert.rejects(recordManagedLiveFinancialScope(f.db,f.ctx('another-issuer'),{companyEntityReference:c.scope.companyEntityReference,companyScopeDigest:c.scope.companyScopeDigest,issuerModel:'company_commercial_invoice_v1',issuer:{legalName:'Different Fictional Issuer',taxMode:'PAN',taxRegistrationNumber:company.pan,address:company.registeredOffice,phone:'9800000000'},seriesPrefix:'OTHER-ISSUER',seriesVersion:'fictional-v1',openingNumber:1,evidenceReference:'FICTIONAL-WRONG-COMPANY',reason:'Retain this different fictional issuer as a negative boundary fixture only.'}));
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM managed_live_clearances').first<{n:number}>())!.n,1);
 }finally{f.dispose();}
});
void test('maker ownership follows the canonical customer role including mixed roles and reports incomplete application safely',async()=>{
 const f=await liveMakerFixture();try{
  await f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'seller',?)").bind(f.ownerId,Date.now()).run();
  await assert.rejects(managedLiveAuthority(f.db,f.ownerId,f.sellerId),{status:403});
  assert.equal((await readManagedLiveEligibility(f.db,f.sellerId,Date.now())).blockers.some(b=>b.id==='owner'),false);
  await f.db.prepare("DELETE FROM user_roles WHERE user_id=? AND role='customer'").bind(f.ownerId).run();
  assert.equal((await readManagedLiveEligibility(f.db,f.sellerId,Date.now())).blockers.some(b=>b.id==='owner'),true);
  const missing=await readManagedLiveEligibility(f.db,'no-managed-application',Date.now());
  assert.equal(missing.enabled,false);assert.ok(missing.blockers.length);assert.equal(missing.proof,null);
  await f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'super_admin',?)").bind(f.ownerId,Date.now()).run();
  await f.db.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id=?").bind(f.sellerId).run();
  await assert.rejects(managedLiveAuthority(f.db,f.ownerId,f.sellerId),{status:403});
 }finally{f.dispose();}
});
void test('an external clearance expiring while the command waits cannot authorize a later transaction',async()=>{
 const f=await liveMakerFixture();try{
  const c=await addReviewedLiveClearance(f,'expiry-boundary'),observedAt=Date.now();
  await reviewManagedClearance(f.db,f.ctx('short-lived-clearance'),{...c.input,validUntil:observedAt+2000});
  const observed=await readCurrentManagedClearance(f.db,c.scope,observedAt+10);assert.ok(observed);
  const guards=managedClearanceGuards(f.db,observed,observedAt+10);
  await new Promise(resolve=>setTimeout(resolve,2100));
  await assert.rejects(f.db.batch(guards));
 }finally{f.dispose();}
});
