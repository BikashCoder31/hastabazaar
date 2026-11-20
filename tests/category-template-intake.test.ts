import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {saveTaxonomy} from '../lib/db/repositories/catalog-admin';
async function api(){const path='../lib/products/category-contracts';const m=await import(path).catch(()=>null);assert.equal(typeof m?.getCategoryDetailGroups,'function','Expandable category contracts and optional private intake are required');return m!;}
const command=(actorId:string,requestId:string,expectedRevision:string|null,now:number)=>({actorId,requestId,expectedRevision,now});
const generic={recommendedGroups:['identity','contents'],publicationRules:[],orderingRules:[],eligibilityRequirements:[],labels:{}};
void test('five independently governed categories and a subcategory keep stable references and optional draft answers through label and category changes',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  for(const [id,name]of [['clothing','Clothing'],['stationery','Stationery'],['electronics','Electronics'],['handmade','Handmade'],['garden','Garden'],['garden-pots','Pots']])f.sqlite.prepare('INSERT INTO categories(id,parent_id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES(?,?,?,?,1,0,1,1)').run(id,id==='garden-pots'?'garden':null,id,name);
  for(const id of ['clothing','stationery','electronics','handmade','garden','garden-pots']){
   await m.publishCategoryContract(f.db,command('reviewer','policy-'+id,null,f.now),{categoryId:id,contract:generic,reason:'Publish a reviewed fictional category contract with explicit supported fields'});
   const groups=await m.getCategoryDetailGroups(f.db,id);assert.equal(groups.status,'available');assert.ok(groups.groups.length>=7);assert.ok(groups.groups.every((group:{fields:{intakeRequired:boolean}[]})=>group.fields.every(field=>!field.intakeRequired)));
   const saved=await m.saveProductIntakeDraft(f.db,command('registered-owner','empty-'+id,null,f.now+1),{draftId:null,sellerId:'registered',categoryId:id,answers:{}});
   const read=await m.getProductIntakeDraft(f.db,'registered-owner',saved.id);assert.deepEqual(read.answers,{});assert.equal(read.categoryId,id);assert.equal(read.guidance.publicationReady,false);
  }
  const saved=await m.saveProductIntakeDraft(f.db,command('registered-owner','original-details',null,f.now+2),{draftId:null,sellerId:'registered',categoryId:'clothing',answers:{materials:'Cotton',sizeGuide:'Actual measurements with units',price:'12.',inventoryQuantity:'unknown'}});
  const policy=await m.getCategoryDetailGroups(f.db,'clothing');await m.publishCategoryContract(f.db,command('reviewer','rename-policy',String(policy.revision),f.now+3),{categoryId:'clothing',contract:{...generic,labels:{materials:'Material used'}},reason:'Clarify an existing label while preserving its stable field meaning'});
  const unchanged=await m.getProductIntakeDraft(f.db,'registered-owner',saved.id);assert.equal(unchanged.answers.price,'12.');assert.equal(unchanged.answers.inventoryQuantity,'unknown');assert.equal(unchanged.answers.materials,'Cotton');
  await m.saveProductIntakeDraft(f.db,command('registered-owner','switch-category',String(unchanged.revision),f.now+4),{draftId:saved.id,sellerId:'registered',categoryId:'garden-pots',answers:unchanged.answers});
  const moved=await m.getProductIntakeDraft(f.db,'registered-owner',saved.id);assert.equal(moved.answers.sizeGuide,'Actual measurements with units');assert.equal(moved.categoryChange.from,'clothing');assert.equal(moved.categoryChange.to,'garden-pots');
  assert.equal(f.sqlite.prepare("SELECT parent_id FROM categories WHERE id='garden-pots'").get()?.parent_id,'garden');
 }finally{f.dispose();}
});
void test('new-only publication and explicit fit/device/pack rules do not turn missing recommendations into intake blockers',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  const categoryId='cat-fixture';f.sqlite.prepare('INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES(?,?,?,1,0,1,1)').run(categoryId,categoryId,'Fictional template');
  const contract={...generic,publicationRules:[{field:'sizeGuide',reason:'Identify the actual fit and measurements',when:{field:'fitDependent',equals:'yes'}},{field:'warrantyOffered',reason:'An active device needs an explicit warranty declaration',when:{field:'activeDevice',equals:'yes'}}]};
  await m.publishCategoryContract(f.db,command('reviewer','specific-policy',null,f.now),{categoryId,contract,reason:'Map actual fictional fit and active device facts to publication'});
  const groups=await m.getCategoryDetailGroups(f.db,categoryId),facts={nameEn:'Fictional new item',descriptionEn:'An accurately described fictional new item',condition:'new',price:'120.00',coverImage:'fictional-private-image-reference',unitContents:'One fictional item',packQuantity:'1',fitDependent:'no',activeDevice:'no'};
  assert.equal(m.evaluateCategoryReadiness(groups,facts).publicationReady,true);
  assert.equal(m.evaluateCategoryReadiness(groups,{...facts,price:'12.29'}).publicationReady,true);
  assert.equal(m.evaluateCategoryReadiness(groups,{...facts,activeDevice:'not sure'}).publicationReady,false);
  for(const condition of ['used','refurbished','renewed','open_box','demo','display'])assert.equal(m.evaluateCategoryReadiness(groups,{...facts,condition}).publicationReady,false);
  const fit=m.evaluateCategoryReadiness(groups,{...facts,fitDependent:'yes'});assert.equal(fit.intakeAllowed,true);assert.ok(fit.publication.some((issue:{field:string})=>issue.field==='sizeGuide'));
  const device=m.evaluateCategoryReadiness(groups,{...facts,activeDevice:'yes'});assert.ok(device.publication.some((issue:{field:string})=>issue.field==='warrantyOffered'));
  assert.equal(m.evaluateCategoryReadiness(groups,{...facts,activeDevice:'yes',warrantyOffered:'no'}).publicationReady,true);
  assert.equal(m.evaluateCategoryReadiness(groups,{...facts,warrantyOffered:'yes'}).publicationReady,false);
  const unknown=await m.getCategoryDetailGroups(f.db,'unknown-request');assert.equal(unknown.status,'unknown');assert.equal(m.evaluateCategoryReadiness(unknown,facts).intakeAllowed,true);assert.equal(m.evaluateCategoryReadiness(unknown,facts).publicationReady,false);
  assert.equal((await m.getCategoryDetailGroups(f.db,categoryId)).groups.flatMap((group:{fields:{key:string}[]})=>group.fields).some((field:{key:string})=>/cost|profit|bank|pan/i.test(field.key)),false);
 }finally{f.dispose();}
});
void test('private intake is owner bound, revision checked and replay safe; policy rejects unauthorized or private field mapping and races',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  const categoryId=f.sqlite.prepare('SELECT id FROM categories LIMIT 1').get()?.id as string;
  await assert.rejects(m.publishCategoryContract(f.db,command('delegate','forged-policy',null,f.now),{categoryId,contract:generic,reason:'An ordinary admin cannot grant themselves category-policy authority'}));
  await assert.rejects(m.publishCategoryContract(f.db,command('reviewer','private-map',null,f.now),{categoryId,contract:{...generic,labels:{privateCost:'Public specification'}},reason:'Private cost data must never be reclassified as a public attribute'}));
  const outcomes=await Promise.allSettled(['policy-one','policy-two'].map(requestId=>m.publishCategoryContract(f.db,command('reviewer',requestId,null,f.now),{categoryId,contract:generic,reason:'Publish exactly one coherent category contract against its original base'})));
  assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);
  const context=command('applicant','foreign-draft',null,f.now);await assert.rejects(m.saveProductIntakeDraft(f.db,context,{draftId:null,sellerId:'registered',categoryId,answers:{}}));
  const own=command('registered-owner','own-draft',null,f.now),input={draftId:null,sellerId:'registered',categoryId,answers:{price:'not money'}};
  const saved=await m.saveProductIntakeDraft(f.db,own,input);assert.deepEqual(await m.saveProductIntakeDraft(f.db,own,input),saved);
  await assert.rejects(m.getProductIntakeDraft(f.db,'foreign',saved.id));
  await assert.rejects(m.saveProductIntakeDraft(f.db,command('registered-owner','stale-draft','99',f.now+1),{...input,draftId:saved.id,answers:{price:'300'}}));
  assert.equal((await m.getProductIntakeDraft(f.db,'registered-owner',saved.id)).answers.price,'not money');
  f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='registered-owner'").run();});
  await assert.rejects(m.saveProductIntakeDraft(f.db,command('registered-owner','revoked-draft','0',f.now+2),{...input,draftId:saved.id,answers:{price:'400'}}));
  assert.equal(f.sqlite.prepare('SELECT revision FROM product_intake_drafts WHERE id=?').get(saved.id)?.revision,0);
 }finally{f.dispose();}
});

void test('governed taxonomy creates a real fifth category and subcategory while rejecting cycles, wrong roles and a parent race',async()=>{
 const f=await completeVersionFixture();try{
  const input={slug:'fictional-garden',nameEn:'Fictional Garden',nameNe:'Fictional Garden',isActive:true,sortOrder:90,parentId:null,expectedParentId:null};
  const parent=await saveTaxonomy(f.db,{kind:'category',actorId:'reviewer',requestId:'create-parent',now:f.now,input});
  const child=await saveTaxonomy(f.db,{kind:'category',actorId:'reviewer',requestId:'create-child',now:f.now+1,input:{...input,slug:'fictional-pots',nameEn:'Fictional Pots',parentId:parent}});
  assert.equal(f.sqlite.prepare('SELECT parent_id FROM categories WHERE id=?').get(child)?.parent_id,parent);
  await assert.rejects(saveTaxonomy(f.db,{kind:'category',id:parent,actorId:'reviewer',requestId:'retained-url',now:f.now+2,input:{...input,slug:'changed-old-url'}}));
  await assert.rejects(saveTaxonomy(f.db,{kind:'category',id:parent,actorId:'reviewer',requestId:'parent-cycle',now:f.now+2,input:{...input,parentId:child}}));
  await assert.rejects(saveTaxonomy(f.db,{kind:'category',id:child,actorId:'delegate',requestId:'parent-forbidden',now:f.now+3,input:{...input,slug:'fictional-pots',expectedParentId:parent}}));
  f.setBeforeBatch(()=>{f.sqlite.prepare('UPDATE categories SET parent_id=NULL WHERE id=?').run(child);});
  await assert.rejects(saveTaxonomy(f.db,{kind:'category',id:child,actorId:'reviewer',requestId:'parent-stale',now:f.now+4,input:{...input,slug:'fictional-pots',parentId:parent,expectedParentId:parent}}));
  assert.equal(f.sqlite.prepare('SELECT parent_id FROM categories WHERE id=?').get(child)?.parent_id,null);
 }finally{f.dispose();}
});
