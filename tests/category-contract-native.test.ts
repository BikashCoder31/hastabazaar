import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb} from './helpers/incentive-db';
import {publishCategoryContract,saveProductIntakeDraft,getProductIntakeDraft} from '../lib/products/category-contracts';
void test('disposable native D1 keeps optional intake private and serializes category policy and draft revisions',async()=>{
 const f=await createIncentiveDb();try{
  await f.db.batch([f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('owner','owner@local.hastabazaar.test','Fictional Owner','active',1,1),('reviewer','reviewer@local.hastabazaar.test','Fictional Reviewer','active',1,1)"),f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('owner','customer',1),('reviewer','super_admin',1)"),f.db.prepare("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES('seller','owner','Fictional Name','Fictional Studio','Fixture','FIX-CATEGORY','NONE','','Fictional Owner','9800000000','owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional Workshop','submitted',1,1)"),f.db.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('native-category','native-category','Fictional Category',1,0,1,1)")]);
  const contract={recommendedGroups:['materials'],publicationRules:[],orderingRules:[],eligibilityRequirements:[],labels:{}},context=(actorId:string,requestId:string,expectedRevision:string|null)=>({actorId,requestId,expectedRevision,now:2});
  const results=await Promise.allSettled(['category-first','category-race'].map(requestId=>publishCategoryContract(f.db,context('reviewer',requestId,null),{categoryId:'native-category',contract,reason:'Review this isolated category without inventing new product facts'})));
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  const command=context('owner','native-draft',null),input={draftId:null,sellerId:'seller',categoryId:'native-category',answers:{price:'12.',inventoryQuantity:''}};
  const saved=await saveProductIntakeDraft(f.db,command,input);assert.deepEqual(await saveProductIntakeDraft(f.db,command,input),saved);
  const read=await getProductIntakeDraft(f.db,'owner',saved.id);assert.equal(read.answers.price,'12.');assert.equal(read.guidance.publicationReady,false);
  const saves=await Promise.allSettled(['draft-first','draft-race'].map(requestId=>saveProductIntakeDraft(f.db,context('owner',requestId,'0'),{...input,draftId:saved.id,answers:{price:'24.50'}})));
  assert.equal(saves.filter(row=>row.status==='fulfilled').length,1);assert.equal((await getProductIntakeDraft(f.db,'owner',saved.id)).revision,1);
  await assert.rejects(f.db.prepare("UPDATE category_template_versions SET contract_json='{}'").run(),/immutable/);
  await assert.rejects(f.db.prepare("UPDATE product_intake_versions SET answers_json='{}'").run(),/immutable/);
  assert.equal((await f.db.prepare('SELECT COUNT(*) count FROM products').first<{count:number}>())?.count,0);
 }finally{await f.dispose();}
});
