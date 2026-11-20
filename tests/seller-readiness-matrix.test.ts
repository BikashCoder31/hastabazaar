import assert from 'node:assert/strict';
import test from 'node:test';
import {readyMaker} from './helpers/company-store-lifecycle-fixture';
import {reviewProduct} from '../lib/db/repositories/products';
async function readiness(){const loadedFixtureModule=await import('../lib/sellers/readiness');return loadedFixtureModule.getSellerReadiness;}
void test('pending PAN evidence and a verified bank remain separate truthful checks',async()=>{
 const read=await readiness(),f=await readyMaker();try{
  const {verifySellerDocument}=await import('../lib/sellers/document-review');
  const {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails}=await import('../lib/sellers/bank-details');
  const identity=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!;
  await verifySellerDocument(f.db,{sellerId:'maker',documentId:String(identity.id),actorId:'reviewer',reason:'Inspect the fictional government identity for this exact maker',commandId:'readiness-identity',now:f.now+10,expectedReviewId:null});
  const before=await sellerBankState(f.db,'maker');
  await submitSellerBankDetails(f.db,{sellerId:'maker',actorId:'maker-user',revision:before.revision,commandId:'readiness-bank-submit',now:f.now+11,details:{payoutBeneficiary:'Fictional Maker',bankName:'Fictional Bank',bankBranch:'Fictional Branch',bankAccountNumber:'123456789'},document:{id:'readiness-bank-proof',kind:'bank_verification',objectKey:'private/seller-documents/maker/readiness-bank-proof',originalName:'fictional.png',mimeType:'image/png',sizeBytes:20}});
  const pending=await sellerBankState(f.db,'maker');
  await reviewSellerBankDetails(f.db,{sellerId:'maker',actorId:'reviewer',revision:pending.revision,reference:'FICTIONAL-BANK-OWNERSHIP',reason:'The fictional receiving account matches independently reviewed ownership evidence',now:f.now+12,commandId:'readiness-bank-review',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true});
  f.sqlite.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES('readiness-pan','maker','pan_certificate','private/seller-documents/maker/readiness-pan','fictional-pan.png','image/png',20,'pending',?)").run(f.now+13);
  const result=await read(f.db,'maker',f.now+14);assert.equal(result.bankStatus,'verified');assert.equal(result.checks.find(check=>check.id==='bank')?.status,'ready');assert.equal(result.checks.find(check=>check.id==='document:readiness-pan')?.status,'waiting_review');assert.equal(result.submitProducts,true);
  assert.ok(result.blockers.every(blocker=>blocker.capability!=='payouts'||blocker.sourceId!=='terms'));
  assert.doesNotMatch(JSON.stringify(result),/123456789|Fictional Bank|FICTIONAL-BANK-OWNERSHIP/);
 }finally{f.dispose();}
});
void test('approval, dashboard, product submission, public listings, ordering and payouts have separate authoritative outcomes',async()=>{
 const read=await readiness(),f=await readyMaker();try{
  const before=JSON.stringify(f.sqlite.prepare('SELECT * FROM seller_profiles').all());
  let result=await read(f.db,'maker',f.now+3);
  assert.equal(result.stage,'approved_for_activation');assert.equal(result.dashboard,true);assert.equal(result.submitProducts,true);assert.equal(result.newOrders,false);assert.equal(result.payouts,false);assert.equal(result.publicListings,false);
  for(const blocker of result.blockers){assert.ok(blocker.reason);assert.ok(blocker.nextActor);assert.ok(blocker.href);}
  await reviewProduct(f.db,{productId:'cup',actorId:'reviewer',action:'publish',reason:'Publish this reviewed fictional listing before commercial activation',requestId:'readiness-public',now:f.now+4});
  result=await read(f.db,'maker',f.now+5);assert.equal(result.publicListings,true);assert.equal(result.newOrders,false);assert.equal(result.submitProducts,true);
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM seller_profiles').all()),before);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE-GOVERNMENT-IDENTITY-QA-ONLY|bankAccountNumber|details_json|object_key/);
 }finally{f.dispose();}
});
void test('a specific payout hold does not remove dashboard, submission or public visibility',async()=>{
 const read=await readiness(),f=await readyMaker();try{
  const {requestProtectedChange}=await import('../lib/sellers/protected-change-requests');
  // A fictional legacy reference is deliberately not labelled verified by readiness.
  f.sqlite.prepare("UPDATE seller_profiles SET payout_account_reference='LEGACY-FIXTURE-REQUIRES-RECONCILIATION' WHERE id='maker'").run();
  await reviewProduct(f.db,{productId:'cup',actorId:'reviewer',action:'publish',reason:'Keep the fictional listing public while its payout change is reviewed',requestId:'readiness-hold-product',now:f.now+4});
  const {sellerBankState}=await import('../lib/sellers/bank-details');const bank=await sellerBankState(f.db,'maker');
  await requestProtectedChange(f.db,{sellerId:'maker',actorId:'maker-user',kind:'bank',fields:['bank_verification'],reason:'Ask for review of the fictional receiving account change',expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,requestId:'readiness-bank-request',now:f.now+10});
  const result=await read(f.db,'maker',f.now+11);assert.equal(result.dashboard,true);assert.equal(result.submitProducts,true);assert.equal(result.payouts,false);
  assert.ok(result.blockers.some(item=>item.capability==='payouts'&&item.sourceId.startsWith('hold:')));
  assert.ok(!result.blockers.some(item=>item.capability==='dashboard'));
  assert.equal(result.publicListings,true);assert.equal(result.bankStatus,'legacy_review_required');
  assert.equal((await sellerBankState(f.db,'maker')).status,result.bankStatus,'The bank form must not call an unreviewed legacy reference verified');
 }finally{f.dispose();}
});
void test('unavailable source data cannot become an empty ready state',async()=>{
 const read=await readiness(),f=await readyMaker();try{
  f.sqlite.exec('DROP TABLE seller_public_profile_states');
  await assert.rejects(read(f.db,'maker',f.now+3));
 }finally{f.dispose();}
});
