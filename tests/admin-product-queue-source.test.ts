import test from 'node:test';
import assert from 'node:assert/strict';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {saveProductWorkspace} from '../lib/products/intake-workspace';
import {listReviewTasks} from '../lib/workflows/review-tasks';
import {filterReviewQueue,readReviewQueueFilters,reviewTitle} from '../lib/admin/review-queue-view';

void test('product queue names/search come from the shared candidate, never its later private draft',async()=>{
 const f=await productPublicationFixture();try{
  await saveProductWorkspace(f.db,{actorId:'registered-owner',requestId:'private-queue-title',expectedRevision:String(f.attached.revision),now:f.now+4},{...f.input,answers:{...f.input.answers,nameEn:'UNSHARED-PRIVATE-TITLE'}});
  const rows=await listReviewTasks(f.db,'delegate'),task=rows.find(row=>row.sourceId===f.sent.caseId)!;assert.ok(task);
  assert.match(reviewTitle(task),/Fictional new cup/);assert.equal(task.sellerName,'Fictional Shop');
  assert.equal(filterReviewQueue(rows,'delegate',readReviewQueueFilters(new URLSearchParams('reviewQ=Fictional+new+cup')),f.now+5).some(row=>row.id===task.id),true);
  assert.doesNotMatch(JSON.stringify(rows),/UNSHARED-PRIVATE-TITLE|Private review note|licenceReference/);
  f.sqlite.exec("UPDATE seller_profiles SET trading_name='',legal_name='PRIVATE-LEGAL-IDENTITY' WHERE id='registered'");
  const withoutShopName=(await listReviewTasks(f.db,'delegate')).find(row=>row.id===task.id)!;
  assert.equal(withoutShopName.sellerName,'Fictional Shop','The current public shop name remains independent of private operational identity.');assert.doesNotMatch(JSON.stringify(withoutShopName),/PRIVATE-LEGAL-IDENTITY/);
 }finally{f.dispose();}
});

void test('original product task excludes a newly personal current shop owner without rewriting its original submitted owner',async()=>{
 const f=await productPublicationFixture();try{
  assert.ok((await listReviewTasks(f.db,'delegate')).some(row=>row.sourceId===f.sent.caseId));
  // Hostile retained ownership change, not a claimed supported business handoff.
  f.sqlite.exec("UPDATE seller_profiles SET user_id='delegate' WHERE id='registered'");
  assert.equal((await listReviewTasks(f.db,'delegate')).some(row=>row.sourceId===f.sent.caseId),false);
  assert.equal(f.sqlite.prepare('SELECT owner_id FROM product_intake_drafts WHERE id=?').get(f.attached.id)!.owner_id,'registered-owner');
 }finally{f.dispose();}
});

void test('product queue final projection fence rejects a current shop-owner change after its source read',async()=>{
 const f=await productPublicationFixture();try{
  const batch=f.db.batch.bind(f.db);let changed=false;
  f.db.batch=async statements=>{
   if(!changed){changed=true;f.sqlite.exec("UPDATE seller_profiles SET user_id='delegate' WHERE id='registered'");}
   return batch(statements);
  };
  await assert.rejects(()=>listReviewTasks(f.db,'delegate'));
  assert.equal(changed,true);
 }finally{f.dispose();}
});
