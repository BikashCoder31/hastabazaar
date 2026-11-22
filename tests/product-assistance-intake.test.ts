import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {listSellerReviewTasks,listReviewTasks} from '../lib/workflows/review-tasks';
import {savePrivatePriceInputs} from '../lib/products/private-price-inputs';
async function api(){const path='../lib/products/intake-workspace';const m=await import(path).catch(()=>null);assert.equal(typeof m?.saveProductWorkspace,'function','Optional product intake must retain one native workspace and frozen assistance candidate.');return m!;}
void test('empty and zero-cover intake reaches one assistance case without creating a fabricated public product',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  const ctx={actorId:'registered-owner',requestId:'empty-workspace',expectedRevision:null,now:f.now},input={draftId:null,sellerId:'registered',categoryId:null,answers:{},offers:{axes:[],offers:[]},mediaIds:[],privateReview:{}};
  const saved=await m.saveProductWorkspace(f.db,ctx,input);assert.deepEqual(await m.saveProductWorkspace(f.db,ctx,input),saved);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM products').get()?.n,0);
  const sent=await m.submitProductIntake(f.db,{...ctx,requestId:'empty-review',expectedRevision:String(saved.revision)},{draftId:saved.id,versionId:saved.versionId,intent:'review',note:''});
  assert.equal(sent.state,'details_needed');const help=await m.submitProductIntake(f.db,{...ctx,requestId:'empty-help',expectedRevision:String(saved.revision)},{draftId:saved.id,versionId:saved.versionId,intent:'help',note:''});assert.equal(help.caseId,sent.caseId);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_cases').get()?.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_events').get()?.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM products').get()?.n,0);
  const work=await m.getProductWorkspace(f.db,ctx.actorId,saved.id);assert.equal(work.case.firstRequestedAt,f.now);assert.equal(work.case.triageDueAt,f.now+86400000);assert.equal(work.guidance.publicationReady,false);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='product_intake_help'").get()?.n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.product.intake'").get()?.n,6);assert.equal((await listSellerReviewTasks(f.db,ctx.actorId)).filter(row=>row.sourceType==='product_intake_help').length,1);assert.equal((await listReviewTasks(f.db,'delegate')).filter(row=>row.sourceType==='product_intake_help').length,1);
  for(const actor of ['foreign','delegate'])await assert.rejects(m.getProductWorkspace(f.db,actor,saved.id));
 }finally{f.dispose();}
});
void test('staff proposals require owner confirmation, preserve the submitted candidate and exclude private pricing',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  assert.equal(typeof m.proposeProductIntakeChanges,'function','Staff need proposed changes rather than a silent owner-draft overwrite.');
  const ctx={actorId:'registered-owner',requestId:'proposal-draft',expectedRevision:null,now:f.now},saved=await m.saveProductWorkspace(f.db,ctx,{draftId:null,sellerId:'registered',categoryId:null,answers:{nameEn:'Seller supplied title'},offers:{axes:[],offers:[]},mediaIds:[],privateReview:{originEvidenceReference:'PRIVATE-PRODUCT-REVIEW'}}),sent=await m.submitProductIntake(f.db,{...ctx,requestId:'proposal-send',expectedRevision:String(saved.revision)},{draftId:saved.id,versionId:saved.versionId,intent:'help',note:''});
  await savePrivatePriceInputs(f.db,{...ctx,requestId:'private-during-help'},{subject:{kind:'intake',id:saved.id,offerId:'base'},cost:'876.54',target:'654.32'});
  const staff={actorId:'delegate',requestId:'staff-proposal',expectedRevision:String(sent.revision),now:f.now+100},proposalInput={caseId:sent.caseId,versionId:sent.versionId,patch:{answers:{nameEn:'Seller clarified title'}},sourceNote:'The seller supplied this exact correction in their recorded message.'};
  await assert.rejects(m.proposeProductIntakeChanges(f.db,{...staff,actorId:'foreign'},proposalInput));const proposal=await m.proposeProductIntakeChanges(f.db,staff,proposalInput);assert.deepEqual(await m.proposeProductIntakeChanges(f.db,staff,proposalInput),proposal);
  const before=await m.getProductWorkspace(f.db,ctx.actorId,saved.id);assert.equal(before.answers.nameEn,'Seller supplied title');assert.equal(before.submitted.snapshot.answers.nameEn,'Seller supplied title');
  const review=JSON.stringify(await m.getProductIntakeReview(f.db,'delegate',sent.caseId));assert.ok(!review.includes('876.54'));assert.ok(!review.includes('654.32'));
  await assert.rejects(m.confirmProductIntakeProposal(f.db,{...ctx,requestId:'stale-confirm',expectedRevision:'0'},{caseId:sent.caseId,proposalId:proposal.proposalId,expectedDraftRevision:String(saved.revision),decision:'accept'}));
  const confirmed=await m.confirmProductIntakeProposal(f.db,{...ctx,requestId:'owner-confirm',expectedRevision:String(proposal.revision),now:f.now+200},{caseId:sent.caseId,proposalId:proposal.proposalId,expectedDraftRevision:String(saved.revision),decision:'accept'});assert.ok(confirmed.workspace.revision>saved.revision);
  const after=await m.getProductWorkspace(f.db,ctx.actorId,saved.id);assert.equal(after.answers.nameEn,'Seller clarified title');assert.equal(after.submitted.snapshot.answers.nameEn,'Seller supplied title');assert.equal(after.case.firstRequestedAt,f.now);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM products').get()?.n,0);
 }finally{f.dispose();}
});
void test('later draft edits preserve the frozen submitted version, invalid numeric text and private-price separation',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  const ctx={actorId:'registered-owner',requestId:'raw-workspace',expectedRevision:null,now:f.now},input={draftId:null,sellerId:'registered',categoryId:null,answers:{nameEn:'Fictional unfinished item',price:'12.',inventoryQuantity:'not counted'},offers:{axes:[],offers:[]},mediaIds:[],privateReview:{}};
  const saved=await m.saveProductWorkspace(f.db,ctx,input),submitted=await m.submitProductIntake(f.db,{...ctx,requestId:'raw-submit',expectedRevision:String(saved.revision)},{draftId:saved.id,versionId:saved.versionId,intent:'review',note:''});
  const changed=await m.saveProductWorkspace(f.db,{...ctx,requestId:'later-draft',expectedRevision:String(saved.revision)},{...input,draftId:saved.id,answers:{...input.answers,nameEn:'Later private draft'}});assert.ok(changed.revision>saved.revision);
  const owner=await m.getProductWorkspace(f.db,ctx.actorId,saved.id);assert.equal(owner.answers.price,'12.');assert.equal(owner.submitted.versionId,submitted.versionId);assert.equal(owner.submitted.snapshot.answers.nameEn,'Fictional unfinished item');assert.equal(owner.answers.nameEn,'Later private draft');
  await assert.rejects(m.saveProductWorkspace(f.db,{...ctx,requestId:'forbidden-private',expectedRevision:String(changed.revision)},{...input,draftId:saved.id,answers:{cost:'600',targetProfit:'400'}}));
  await assert.rejects(m.submitProductIntake(f.db,{...ctx,requestId:'stale-send',expectedRevision:String(saved.revision)},{draftId:saved.id,versionId:saved.versionId,intent:'review',note:''}));
  await assert.rejects(m.submitProductIntake(f.db,{...ctx,requestId:'silent-supersede',expectedRevision:String(changed.revision)},{draftId:saved.id,versionId:changed.versionId,intent:'review',note:''}));
  const replaced=await m.submitProductIntake(f.db,{...ctx,requestId:'explicit-supersede',expectedRevision:String(changed.revision)},{draftId:saved.id,versionId:changed.versionId,intent:'review',note:'',replaceVersionId:submitted.versionId,expectedCaseRevision:String(owner.case.revision)});assert.equal(replaced.caseId,submitted.caseId);assert.equal((await m.getProductWorkspace(f.db,ctx.actorId,saved.id)).case.firstRequestedAt,f.now);
 }finally{f.dispose();}
});
void test('assistance rolls back a lost staff permission and recovers a committed proposal without duplicate events',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  const owner={actorId:'registered-owner',requestId:'guarded-draft',expectedRevision:null,now:f.now},saved=await m.saveProductWorkspace(f.db,owner,{draftId:null,sellerId:'registered',categoryId:null,answers:{nameEn:'Recorded fact'},offers:{axes:[],offers:[]},mediaIds:[],privateReview:{note:'PRIVATE-REVIEW-EVIDENCE'}}),sent=await m.submitProductIntake(f.db,{...owner,requestId:'guarded-send',expectedRevision:String(saved.revision)},{draftId:saved.id,versionId:saved.versionId,intent:'help',note:''});
  const staff={actorId:'delegate',requestId:'guarded-proposal',expectedRevision:'0',now:f.now+10},input={caseId:sent.caseId,versionId:sent.versionId,patch:{answers:{descriptionEn:'Description supplied by the seller.'}},sourceNote:'The seller supplied this description during their assistance request.'};
  f.setBeforeBatch(()=>{f.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='delegate'");});await assert.rejects(m.proposeProductIntakeChanges(f.db,staff,input));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_proposals').get()?.n,0);assert.equal(f.sqlite.prepare('SELECT revision FROM product_intake_cases').get()?.revision,0);
  f.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[\"support.manage\"]' WHERE user_id='delegate'");const support=await m.getProductIntakeReview(f.db,'delegate',sent.caseId);assert.deepEqual(support.snapshot.privateReview,{});assert.ok(!JSON.stringify(support).includes('PRIVATE-REVIEW-EVIDENCE'));
  let lost=true;const uncertain={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){const result=await f.db.batch(statements);if(lost){lost=false;throw new Error('simulated lost response after commit');}return result;}} as D1Database;
  const result=await m.proposeProductIntakeChanges(uncertain,staff,input);assert.deepEqual(await m.proposeProductIntakeChanges(f.db,staff,input),result);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_proposals').get()?.n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM product_intake_events WHERE kind='changes_proposed'").get()?.n,1);
 }finally{f.dispose();}
});
