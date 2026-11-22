import assert from 'node:assert/strict';
import test from 'node:test';
import sharpImport from 'sharp';
import type {SharpConstructor} from '../node_modules/sharp/dist/index.d.mts';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {saveProductWorkspace,getProductWorkspace,submitProductIntake} from '../lib/products/intake-workspace';
import {triageProductIntake} from '../lib/products/intake-assistance';
import {publishCategoryContract} from '../lib/products/category-contracts';
import {listSellerReviewTasks} from '../lib/workflows/review-tasks';
const sharp=sharpImport as SharpConstructor;
async function api(){const path='../lib/products/intake-media';const m=await import(path).catch(()=>null);assert.equal(typeof m?.uploadProductIntakeMedia,'function','A completed optional upload needs a retained, retryable private reference.');return m!;}
async function photo(){return new File([new Uint8Array(await sharp({create:{width:64,height:48,channels:3,background:'#d9c9ab'}}).png().toBuffer())],'fictional-product.png',{type:'image/png'});}
function objects(){
 const stored=new Map<string,{bytes:ArrayBuffer;customMetadata:Record<string,string>}>();let puts=0,loseNextPut=false;
 const bucket={async head(key:string){const value=stored.get(key);return value?{size:value.bytes.byteLength,customMetadata:value.customMetadata}:null;},async put(key:string,bytes:ArrayBuffer,options:{customMetadata:Record<string,string>}){puts++;stored.set(key,{bytes,customMetadata:options.customMetadata});if(loseNextPut){loseNextPut=false;throw new Error('simulated lost object-store response');}return {};},async get(key:string){const value=stored.get(key);return value?{body:new Blob([value.bytes]).stream(),size:value.bytes.byteLength,customMetadata:value.customMetadata}:null;}} as unknown as R2Bucket;
 return {bucket,stored,get puts(){return puts;},loseNext(){loseNextPut=true;}};
}
void test('completed upload survives lost responses and reload, while private files require their owner or an explicitly shared case',async()=>{
 const m=await api(),f=await completeVersionFixture(),storage=objects();try{
  const ctx={actorId:'registered-owner',requestId:'media-draft',expectedRevision:null,now:f.now},input={draftId:null,sellerId:'registered',categoryId:null,answers:{},offers:{axes:[],offers:[]},mediaIds:[],privateReview:{}},saved=await saveProductWorkspace(f.db,ctx,input),file=await photo();
  storage.loseNext();const upload=await m.uploadProductIntakeMedia(f.db,storage.bucket,{...ctx,requestId:'same-photo-upload'},{draftId:saved.id,file});assert.equal(upload.state,'ready');assert.deepEqual(await m.uploadProductIntakeMedia(f.db,storage.bucket,{...ctx,requestId:'same-photo-upload'},{draftId:saved.id,file}),upload);assert.equal(storage.puts,1);assert.equal(storage.stored.size,1);
  const reopened=await getProductWorkspace(f.db,ctx.actorId,saved.id);assert.equal(reopened.uploads[0].id,upload.id);assert.equal(reopened.uploads[0].state,'ready');
  await assert.rejects(m.readProductIntakeMedia(f.db,storage.bucket,'foreign',upload.id,null));await assert.rejects(m.readProductIntakeMedia(f.db,storage.bucket,'delegate',upload.id,null));
  const attached=await saveProductWorkspace(f.db,{...ctx,requestId:'attach-photo',expectedRevision:String(saved.revision)},{...input,draftId:saved.id,mediaIds:[upload.id]}),sent=await submitProductIntake(f.db,{...ctx,requestId:'share-photo',expectedRevision:String(attached.revision)},{draftId:saved.id,versionId:attached.versionId,intent:'help',note:''});
  assert.equal((await m.readProductIntakeMedia(f.db,storage.bucket,'delegate',upload.id,sent.caseId)).mimeType,'image/png');
  await assert.rejects(m.uploadProductIntakeMedia(f.db,storage.bucket,{...ctx,requestId:'same-photo-upload'},{draftId:saved.id,file:new File(['different bytes'],'fictional-product.png',{type:'image/png'})}));assert.equal(storage.puts,1);
 }finally{f.dispose();}
});
void test('a newly reviewed category can make the same frozen facts complete without resetting the unfulfilled assistance deadline',async()=>{
 const m=await api(),f=await completeVersionFixture(),storage=objects();try{
  f.sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('pending-map','pending-map','Fictional pending mapping',1,0,1,1)");
  const ctx={actorId:'registered-owner',requestId:'mapping-draft',expectedRevision:null,now:f.now},input={draftId:null,sellerId:'registered',categoryId:'pending-map',answers:{nameEn:'Fictional cup',descriptionEn:'An unused new cup.',condition:'new',unitContents:'One cup',packQuantity:'1'},offers:{axes:[],offers:[{id:'cup',selection:{},price:'800',compareAt:'',sku:'',mediaId:null,stockFamilyKey:'cup',baseUnit:'piece',unitsPerOffer:'1',included:true,browseOnly:false,stockIntent:''}]},mediaIds:[],privateReview:{}};
  const first=await saveProductWorkspace(f.db,ctx,input),uploaded=await m.uploadProductIntakeMedia(f.db,storage.bucket,{...ctx,requestId:'mapping-photo',now:f.now+1},{draftId:first.id,file:await photo()}),saved=await saveProductWorkspace(f.db,{...ctx,requestId:'mapping-attach',expectedRevision:String(first.revision),now:f.now+2},{...input,draftId:first.id,mediaIds:[uploaded.id]}),received=await submitProductIntake(f.db,{...ctx,requestId:'mapping-help',expectedRevision:String(saved.revision),now:f.now+3},{draftId:saved.id,versionId:saved.versionId,intent:'help',note:''});
  await publishCategoryContract(f.db,{actorId:'reviewer',requestId:'mapping-published',expectedRevision:null,now:f.now+4},{categoryId:'pending-map',contract:{recommendedGroups:[],publicationRules:[],orderingRules:[],eligibilityRequirements:[],labels:{}},reason:'The fictional category has now received its actual independent policy review.'});assert.equal((await getProductWorkspace(f.db,ctx.actorId,saved.id)).guidance.publicationReady,true);
  const sent=await submitProductIntake(f.db,{...ctx,requestId:'mapping-review',expectedRevision:String(saved.revision),now:f.now+5},{draftId:saved.id,versionId:saved.versionId,intent:'review',note:'',expectedCaseRevision:String(received.revision)}),work=await getProductWorkspace(f.db,ctx.actorId,saved.id);assert.equal(work.case!.firstCompleteAt,f.now+5);assert.equal(work.case!.firstRequestedAt,f.now+3);assert.equal(work.case!.triageDueAt,f.now+3+86400000);assert.equal(sent.caseId,received.caseId);
  const tasks=await listSellerReviewTasks(f.db,ctx.actorId);assert.equal(tasks.find(row=>row.sourceType==='product_intake_help')?.status,'awaiting_review');assert.equal(tasks.find(row=>row.sourceType==='product_intake_review')?.status,'awaiting_review');
  await triageProductIntake(f.db,{actorId:'delegate',requestId:'mapping-first-review',expectedRevision:String(sent.revision),now:f.now+6},{caseId:sent.caseId,versionId:sent.versionId,outcome:'reviewing',sellerMessage:'The actual supplied product facts are now in review.'});assert.equal((await listSellerReviewTasks(f.db,ctx.actorId)).find(row=>row.sourceType==='product_intake_help')?.status,'completed');
 }finally{f.dispose();}
});
