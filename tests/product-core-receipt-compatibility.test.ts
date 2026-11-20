import {buildFormAnswerInsert} from '../lib/db/repositories/form-answers';
import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {historicalCommissionDatabase} from './helpers/commission-database';
import {assertBillingProductWorkflow} from './helpers/billing-workflow-scenario';
import {resolvePublishedForm} from '../lib/forms/runtime';
import {validateSellerFormSubmission} from '../lib/forms/submission';
import {reviewProduct} from '../lib/db/repositories/products';
import {createProductReview,validateReviewFormSubmission,moderateProductReview} from '../lib/db/repositories/customers';
import {saveSellerReply,moderateSellerReply} from '../lib/db/repositories/review-extras';
import {saveTaxonomy,classifyProduct} from '../lib/db/repositories/catalog-admin';
void test('native Product review without publication replays exact original actor/source/version/digest once',async()=>{
 const f=await completeVersionFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  f.sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('core-review-cat','core-review-cat','Fictional retained category',1,0,1,1);INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,materials,status,created_at,updated_at) VALUES('core-review','registered','core-review-cat','core-review','HB-CORE-REVIEW','Fictional original product','Original retained product facts',1000,2,'','[]','submitted',1,1)");
  const config=await resolvePublishedForm(f.db,'staff.product-review'),checked=await validateSellerFormSubmission(f.db,'staff.product-review',config.version,[]),command={productId:'core-review',actorId:'reviewer',action:'start_review' as const,reason:'Independent original native review.',requestId:'core-product-review-once',now:f.now,form:{versionId:checked.versionId,answers:checked.answers}};
  assert.equal(await reviewProduct(f.db,command),'under_review');assert.equal(await reviewProduct(f.db,command),'under_review');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='product.review.started' AND subject_id='core-review'").get()?.n,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='staff.product-review'").get()?.n,0);
  await assert.rejects(reviewProduct(f.db,{...command,reason:'Different native reason cannot reuse a receipt.'}));
  await assert.rejects(reviewProduct(f.db,{...command,actorId:'registered-owner'}));
 }finally{f.dispose();}
});
void test('real unpublished core Product submissions preserve latest/omitted/cleared SKU through checkout and immutable original documents',async()=>{
 const f=await historicalCommissionDatabase(true);try{await assertBillingProductWorkflow(f.database,{nativeCore:true});}finally{await f.dispose();}
});
void test('actual delivered registered review and seller reply retain no-publication native moderation/reply replay proofs',async()=>{
 const f=await historicalCommissionDatabase(true);try{
  const original=await assertBillingProductWorkflow(f.database);assert.ok(original);const db=f.database;
  const reviewForm=await validateReviewFormSubmission(db,1,[]),reviewId=await createProductReview(db,{userId:original.buyerId,productId:original.productId,orderItemId:original.orderItemId,rating:4,title:'Original delivered item',body:'The actual fictional buyer reviews its original delivered item.',requestId:'core-reply-original-review',now:Date.now(),requestDigest:'f'.repeat(64),form:reviewForm});
  const config=await resolvePublishedForm(db,'staff.review-moderation'),checked=await validateSellerFormSubmission(db,'staff.review-moderation',config.version,[]),publish={reviewId,actorId:original.moderatorId,action:'publish' as const,note:'Review this original delivered-purchase statement independently.',requestId:'core-review-published',now:Date.now(),form:{requestId:'core-review-published',versionId:checked.versionId,answers:checked.answers}};
  await moderateProductReview(db,publish);await moderateProductReview(db,publish);
  const replyConfig=await resolvePublishedForm(db,'seller.review-reply'),replyForm=await validateSellerFormSubmission(db,'seller.review-reply',replyConfig.version,[]),reply={reviewId,sellerId:original.sellerId,actorId:original.ownerId,body:'The original registered supplier replies to this actual delivered purchase.',version:0,requestId:'core-seller-reply',now:Date.now(),form:{requestId:'core-seller-reply',versionId:replyForm.versionId,answers:replyForm.answers}};
  await saveSellerReply(db,reply);await saveSellerReply(db,reply);
  const command={reviewId,actorId:original.moderatorId,action:'publish' as const,version:1,note:'Independently review the actual original seller reply.',requestId:'core-seller-reply-published',now:Date.now(),form:{requestId:'core-seller-reply-published',versionId:checked.versionId,answers:checked.answers}};
  await moderateSellerReply(db,command);await moderateSellerReply(db,command);
  await assert.rejects(moderateSellerReply(db,{...command,note:'Different content cannot reuse this native decision.'}));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM review_replies WHERE review_id=?').get(reviewId)?.n,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id IN ('staff.review-moderation','seller.review-reply')").get()?.n,0);
 }finally{await f.dispose();}
});
void test('native catalog and exact legacy Product classification retain their original no-publication receipts',async t=>{
 const f=await completeVersionFixture();try{
  const config=await resolvePublishedForm(f.db,'staff.catalog'),checked=await validateSellerFormSubmission(f.db,'staff.catalog',config.version,[]),command={kind:'category' as const,actorId:'reviewer',input:{slug:'core-catalog',nameEn:'Fictional native category',nameNe:'',isActive:true,sortOrder:0},requestId:'core-catalog-created',now:f.now,form:{requestId:'core-catalog-created',versionId:checked.versionId,answers:checked.answers}},categoryId=await saveTaxonomy(f.db,command);
  await t.test('catalog original receipt includes native core answer proof without counting it as another business action',async()=>{assert.equal(await saveTaxonomy(f.db,command),categoryId);await assert.rejects(saveTaxonomy(f.db,{...command,input:{...command.input,nameEn:'A different category cannot reuse the request'}}));});
  await f.db.batch([buildFormAnswerInsert(f.db,{formId:'staff.catalog',requestId:'core-catalog-orphan',versionId:checked.versionId,subjectType:'category',subjectId:categoryId,actorId:'reviewer',answers:checked.answers,now:f.now})]);
  await assert.rejects(saveTaxonomy(f.db,{...command,requestId:'core-catalog-orphan',form:{...command.form,requestId:'core-catalog-orphan'}}),'An answer-only native fact is not a business receipt and cannot authorize a replacement');
  f.sqlite.prepare("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,materials,status,created_at,updated_at) VALUES('core-classified','registered',?,'core-classified','HB-CORE-CLASSIFIED','Fictional retained classification','Original retained product facts',1000,2,'','[]','submitted',1,1)").run(categoryId);
  f.sqlite.exec("INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('core-classification-gift','core-classification-gift','Fictional retained occasion',1,0,1,1)");
  const classification=await resolvePublishedForm(f.db,'staff.product-classification'),answers=await validateSellerFormSubmission(f.db,'staff.product-classification',classification.version,[]),input={productId:'core-classified',categoryId,occasionIds:['core-classification-gift'],actorId:'reviewer',requestId:'core-product-classified',now:f.now,form:{requestId:'core-product-classified',versionId:answers.versionId,answers:answers.answers}};
  await classifyProduct(f.db,input);
  await t.test('exact original classification replays its own native source and rejects a changed actor',async()=>{await classifyProduct(f.db,input);await assert.rejects(classifyProduct(f.db,{...input,actorId:'registered-owner'}));});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id IN ('staff.catalog','staff.product-classification')").get()?.n,0);
 }finally{f.dispose();}
});
