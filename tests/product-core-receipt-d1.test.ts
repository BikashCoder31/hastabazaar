import assert from 'node:assert/strict';
import test from 'node:test';
import {historicalCommissionDatabase} from './helpers/commission-database';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {assertBillingProductWorkflow} from './helpers/billing-workflow-scenario';
import {resolvePublishedForm} from '../lib/forms/runtime';
import {validateSellerFormSubmission} from '../lib/forms/submission';
import {reviewProduct} from '../lib/db/repositories/products';
import {saveTaxonomy,classifyProduct} from '../lib/db/repositories/catalog-admin';
import {nativeStatementDiagnostics} from './helpers/native-statement-diagnostics';
void test('nonpersistent native D1 retains genuine core SKU checkout snapshots and exact review/catalog/classification replays',{timeout:180000},async()=>{
 const source=await historicalCommissionDatabase(true);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  assert.ok(source.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));native=await nativeFinanceClone(source.sqlite);const raw=native.db;let armed:string|null=null,fired=false;
  const db=nativeStatementDiagnostics(raw,'.test-artifacts/t31/product-core-checkout-depth.json',async sql=>{if(armed&&sql.some(value=>value.includes('FROM cart_items JOIN products'))){const mutation=armed;armed=null;await raw.prepare(mutation).run();fired=true;}});
  await assertBillingProductWorkflow(db,{nativeCore:true,beforeCheckout:async checkout=>{
   const races=[
    {id:'publication',mutate:"UPDATE products SET status='needs_changes' WHERE id='product-a'",restore:"UPDATE products SET status='published' WHERE id='product-a'"},
    {id:'price',mutate:"UPDATE products SET price_paisa=100100 WHERE id='product-a'",restore:"UPDATE products SET price_paisa=100000 WHERE id='product-a'"},
    {id:'stock',mutate:"UPDATE products SET inventory_quantity=0 WHERE id='product-a'",restore:"UPDATE products SET inventory_quantity=10 WHERE id='product-a'"},
    {id:'owner',mutate:"UPDATE users SET status='disabled' WHERE id='user-a'",restore:"UPDATE users SET status='active' WHERE id='user-a'"},
    {id:'restriction',mutate:"INSERT INTO seller_restrictions(seller_id,mode,obligation_mode,reason_code,private_reason,applied_by,applied_at,updated_at) VALUES('seller-a','disabled','allow_existing','fixture','Fictional late restriction','owner',1,1)",restore:"DELETE FROM seller_restrictions WHERE seller_id='seller-a'"},
   ];
   for(const race of races){fired=false;armed=race.mutate;try{
    await assert.rejects(checkout('d1-late-'+race.id),/Availability or delivery rates changed/);assert.equal(fired,true,'The source change must occur after native preparation');
    for(const table of ['orders','order_items','payments','order_documents'])assert.equal(Number((await raw.prepare('SELECT COUNT(*) n FROM '+table).first<{n:number}>())?.n),0,race.id+' left partial '+table);
    assert.equal(Number((await raw.prepare("SELECT quantity FROM cart_items WHERE id='cart-line'").first<{quantity:number}>())?.quantity),1,'A rejected checkout consumed its original cart');
   }finally{armed=null;await raw.prepare(race.restore).run();}}
  }});
  const config=await resolvePublishedForm(db,'staff.product-review'),checked=await validateSellerFormSubmission(db,'staff.product-review',config.version,[]),review={productId:'product-a',actorId:'owner',action:'start_review' as const,reason:'Independently review this original native D1 core submission.',requestId:'d1-core-product-review',now:Date.now(),form:{versionId:checked.versionId,answers:checked.answers}};
  assert.equal(await reviewProduct(db,review),'under_review');assert.equal(await reviewProduct(db,review),'under_review');await assert.rejects(reviewProduct(db,{...review,reason:'A different native review cannot reuse the original.'}));
  const catalog=await resolvePublishedForm(db,'staff.catalog'),catalogForm=await validateSellerFormSubmission(db,'staff.catalog',catalog.version,[]),command={kind:'category' as const,actorId:'owner',input:{slug:'d1-core-category',nameEn:'Fictional native D1 category',nameNe:'',isActive:true,sortOrder:0},requestId:'d1-core-category',now:Date.now(),form:{requestId:'d1-core-category',versionId:catalogForm.versionId,answers:catalogForm.answers}},categoryId=await saveTaxonomy(db,command);assert.equal(await saveTaxonomy(db,command),categoryId);
  const classification=await resolvePublishedForm(db,'staff.product-classification'),classificationForm=await validateSellerFormSubmission(db,'staff.product-classification',classification.version,[]),input={productId:'product-a',categoryId,occasionIds:['gift'],actorId:'owner',requestId:'d1-core-classification',now:Date.now(),form:{requestId:'d1-core-classification',versionId:classificationForm.versionId,answers:classificationForm.answers}};
  await classifyProduct(db,input);await classifyProduct(db,input);
  assert.equal(Number((await db.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id IN ('seller.product-submission','staff.product-review','staff.catalog','staff.product-classification')").first<{n:number}>())?.n),0);
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{if(native)await native.dispose();await source.dispose();}
});
