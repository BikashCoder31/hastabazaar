import {productPublicationFixture as submitted,publicationCategory as category,publicationSnapshot as snapshot} from './helpers/product-publication-fixture';
import assert from 'node:assert/strict';
import test from 'node:test';
import {saveProductWorkspace,submitProductIntake,getProductWorkspace} from '../lib/products/intake-workspace';
import {publicProductEligibility} from '../lib/products/eligibility';
import {publishOfferCandidate,saveOfferCandidate,offerHead} from '../lib/products/offers';
import {reviewPriceReference} from '../lib/products/price-references';
import {physicalOfferIdentity} from '../lib/products/offer-contracts';
import {getOwnerProductIntakeCase} from '../lib/products/intake-history';
import {confirmOfferStock,pauseOfferStock,getOfferStock} from '../lib/products/offer-inventory';

const media=[{id:'photo',mimeType:'image/png',state:'ready' as const}];
async function compiler(){const path='../lib/products/publication-contract';const loadedContract=await import(path).catch(()=>null);assert.equal(typeof loadedContract?.compileProductPublication,'function','Publication needs an exact, privacy-safe candidate compiler.');return loadedContract!.compileProductPublication;}

void test('one usable cover and zero occasions publish truthful browse-only facts without draft stock or private answers',async()=>{
 const compile=await compiler(),source=snapshot(),result=compile({snapshot:source,category,media,confirmedEligibility:[]});
 assert.equal(result.pricePaisa,80000);assert.equal(result.coverMediaId,'photo');assert.deepEqual(result.occasionIds,[]);assert.equal(result.orderingFactsReady,false);
 assert.equal(result.details.nameEn,source.answers.nameEn);assert.equal(result.offers[0].browseOnly,true);
 const json=JSON.stringify(result);for(const hidden of ['inventoryQuantity','stockIntent','Private review note','Private licence reference','formContext','999'])assert.equal(json.includes(hidden),false,hidden);
 assert.equal(source.offers.offers[0].stockIntent,'9','Compiling never edits the retained private version.');
});
void test('exact cover and offer images must belong to the frozen media set; a different category cannot bless the candidate',async()=>{
 const compile=await compiler();assert.throws(()=>compile({snapshot:{...snapshot(),mediaIds:[]},category,media,confirmedEligibility:[]}),/cover/i);
 const other=snapshot();other.offers.offers[0].mediaId='unshared';assert.throws(()=>compile({snapshot:other,category,media,confirmedEligibility:[]}),/image|media/i);
 assert.throws(()=>compile({snapshot:snapshot(),category:{...category,categoryId:'other'},media,confirmedEligibility:[]}),/category/i);
 assert.throws(()=>compile({snapshot:snapshot(),category,media:[{...media[0],state:'uploading'}],confirmedEligibility:[]}),/cover/i);
});
void test('applicable eligibility remains an explicit reviewed requirement and ordinary private saving cannot establish it',async()=>{
 const compile=await compiler(),restricted={...category,contract:{...category.contract!,eligibilityRequirements:['actual-licence']}};
 assert.throws(()=>compile({snapshot:snapshot(),category:restricted,media,confirmedEligibility:[]}),/evidence/i);
 assert.equal(compile({snapshot:snapshot(),category:restricted,media,confirmedEligibility:['actual-licence']}).pricePaisa,80000);
});

async function publication(){const path='../lib/products/publication';const loadedContract=await import(path).catch(()=>null);assert.equal(typeof loadedContract?.reviewProductPublication,'function','The whole frozen product needs one guarded publication decision.');return loadedContract!;}
const checks={sameItem:true,accurateCover:true,eligibilityEvidence:[]};
void test('review publishes frozen A while private B, counted stock and an owner pause remain separate; retry records one outcome',async()=>{
 const api=await publication(),f=await submitted();try{
  const work=await api.getProductPublicationReview(f.db,'reviewer',f.sent.caseId);
  const stock=await confirmOfferStock(f.db,{...f.ctx,requestId:'count-cups',expectedRevision:null,now:f.now+4},{offerId:'cup',available:7,independentStockConfirmed:true,reason:'Counted seven independently allocated fictional cups.'});
  await pauseOfferStock(f.db,{...f.ctx,requestId:'pause-cups',expectedRevision:String(stock.revision),now:f.now+5},{offerId:'cup',paused:true,reason:'The maker is temporarily unable to fulfill new orders.'});
  const privateInput=structuredClone(f.input);privateInput.answers.nameEn='Private version B';privateInput.offers.offers[0].price='900';
  const b=await saveProductWorkspace(f.db,{...f.ctx,requestId:'private-b',expectedRevision:String(f.attached.revision),now:f.now+6},privateInput);
  const originalOrder=f.sqlite.prepare("SELECT * FROM orders WHERE id='legacy-order'").get();
  const ctx={actorId:'reviewer',requestId:'publish-a',expectedRevision:String(work.revision),now:f.now+7};
  const input={caseId:f.sent.caseId,versionId:work.candidate.versionId,expectedCaseRevision:String(f.sent.revision),action:'approve_and_publish',reason:'Reviewed this exact new cup, its accurate cover and all included offer facts.',checks};
  const result=await api.reviewProductPublication(f.db,ctx,input);assert.equal(result.outcome,'published');
  assert.deepEqual(await api.reviewProductPublication(f.db,{...ctx,now:f.now+8},input),result);
  const live=f.sqlite.prepare('SELECT name_en,price_paisa,status FROM products WHERE id=?').get(work.productId);assert.equal(live?.name_en,'Fictional new cup');assert.equal(live?.price_paisa,80000);assert.equal(live?.status,'published');
  assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM products WHERE id=? AND ${publicProductEligibility('products',f.now+7)}`).get(work.productId)?.n,0,'Unresolved category ordering facts must stop direct orderability too.');
  const privateDraft=await getProductWorkspace(f.db,f.ctx.actorId,f.attached.id);assert.equal(privateDraft.versionId,b.versionId);assert.equal(privateDraft.answers.nameEn,'Private version B');
  const stockAfter=await getOfferStock(f.db,'cup');assert.equal(stockAfter?.available,7);assert.equal(stockAfter?.paused,1);
  assert.deepEqual(f.sqlite.prepare("SELECT * FROM orders WHERE id='legacy-order'").get(),originalOrder);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM product_publication_decisions WHERE action='approve_and_publish'").get()?.n,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id='publish-a'").get()?.n,1,'The combined action has one command audit receipt.');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM notification_messages WHERE related_id=? AND recipient_user_id='registered-owner' AND subject_en='Product version published'").get(f.sent.caseId)?.n,2,'One email and one bell entry represent the combined outcome.');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM product_publication_media WHERE version_id=?').get(work.candidate.versionId)?.n,1);
 }finally{f.dispose();}
});
void test('approval-only preserves privacy; publication needs its permission and cannot bypass the complete product through the offer API',async()=>{
 const api=await publication(),f=await submitted();try{
  const work=await api.getProductPublicationReview(f.db,'delegate',f.sent.caseId),input={caseId:f.sent.caseId,versionId:work.candidate.versionId,expectedCaseRevision:String(f.sent.revision),action:'approve_and_publish',reason:'Reviewed the exact fictional item and its cover.',checks};
  const ctx={actorId:'delegate',requestId:'delegate-combined',expectedRevision:String(work.revision),now:f.now+4};
  await assert.rejects(api.reviewProductPublication(f.db,ctx,input),/permission|publish/i);
  const offer=await offerHead(f.db,work.productId);
  await assert.rejects(publishOfferCandidate(f.db,{actorId:'reviewer',requestId:'partial-publish',expectedRevision:String(offer!.revision),now:f.now+4},{productId:work.productId,versionId:work.candidate.offerVersionId,reason:'Attempt to publish only the price and offers.'}),/whole|complete|workspace/i);
  await assert.rejects(saveOfferCandidate(f.db,{...f.ctx,requestId:'separate-offer',expectedRevision:String(offer!.revision),now:f.now+4},{productId:work.productId,matrix:f.input.offers}),/whole|complete|workspace/i);
  const approved=await api.reviewProductPublication(f.db,{...ctx,requestId:'approve-only'},{...input,action:'approve_only'});assert.equal(approved.outcome,'approved');assert.equal(f.sqlite.prepare('SELECT status FROM products WHERE id=?').get(work.productId)?.status,'submitted');assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM product_offer_current WHERE product_id=?').get(work.productId)?.n,0);
  const published=await api.reviewProductPublication(f.db,{actorId:'reviewer',requestId:'publish-approved',expectedRevision:String(approved.revision),now:f.now+5},{...input,expectedCaseRevision:String(approved.caseRevision),action:'publish_approved',checks:null});assert.equal(published.outcome,'published');
 }finally{f.dispose();}
});
void test('explicit replacement defeats old approval and preserves the review age; a permission loss rolls the decision back',async()=>{
 const api=await publication(),f=await submitted();try{
  const work=await api.getProductPublicationReview(f.db,'reviewer',f.sent.caseId),input=structuredClone(f.input);input.offers.offers[0].price='850';
  const b=await saveProductWorkspace(f.db,{...f.ctx,requestId:'replace-draft',expectedRevision:String(f.attached.revision),now:f.now+4},input);
  const replaced=await submitProductIntake(f.db,{...f.ctx,requestId:'replace-submit',expectedRevision:String(b.revision),now:f.now+5},{draftId:b.id,versionId:b.versionId,intent:'review',note:'This replaces the earlier proposed selling price.',replaceVersionId:f.sent.versionId,expectedCaseRevision:String(f.sent.revision)});
  assert.equal((await getProductWorkspace(f.db,f.ctx.actorId,b.id)).case?.firstCompleteAt,f.now+3);
  const decision={caseId:f.sent.caseId,versionId:work.candidate.versionId,expectedCaseRevision:String(f.sent.revision),action:'approve_and_publish',reason:'Reviewed the exact fictional item and its cover.',checks};
  await assert.rejects(api.reviewProductPublication(f.db,{actorId:'reviewer',requestId:'old-approval',expectedRevision:String(work.revision),now:f.now+6},decision),/changed|version/i);
  const fresh=await api.getProductPublicationReview(f.db,'reviewer',f.sent.caseId);
  f.setBeforeBatch(()=>{f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");});
  await assert.rejects(api.reviewProductPublication(f.db,{actorId:'reviewer',requestId:'revoked-approval',expectedRevision:String(fresh.revision),now:f.now+7},{...decision,versionId:fresh.candidate.versionId,expectedCaseRevision:String(replaced.revision)}));
  assert.equal(f.sqlite.prepare('SELECT status FROM products WHERE id=?').get(work.productId)?.status,'submitted');assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM product_publication_decisions').get()?.n,0);
 }finally{f.dispose();}
});
void test('a subsequent revision explicitly rebases the preserved draft, starts a new case clock and retains the old public version',async()=>{
 const api=await publication();assert.equal(typeof api.rebaseProductWorkspace,'function','Published edits need an explicit comparison/rebase without rewriting the private draft.');
 const f=await submitted();try{
  const work=await api.getProductPublicationReview(f.db,'reviewer',f.sent.caseId),published=await api.reviewProductPublication(f.db,{actorId:'reviewer',requestId:'first-publication',expectedRevision:String(work.revision),now:f.now+4},{caseId:f.sent.caseId,versionId:work.candidate.versionId,expectedCaseRevision:String(f.sent.revision),action:'approve_and_publish',reason:'Reviewed the complete fictional new cup and cover.',checks});
  const input=structuredClone(f.input);input.offers.offers[0].price='900';input.answers.nameEn='Proposed revised cup';
  const b=await saveProductWorkspace(f.db,{...f.ctx,requestId:'next-cycle-draft',expectedRevision:String(f.attached.revision),now:f.now+5},input);
  const send={draftId:b.id,versionId:b.versionId,intent:'review' as const,note:'A proposed price change.',replaceVersionId:f.sent.versionId,expectedCaseRevision:String(published.caseRevision)},sendCtx={...f.ctx,requestId:'next-cycle-submit',expectedRevision:String(b.revision),now:f.now+8};
  await assert.rejects(submitProductIntake(f.db,sendCtx,send),/rebase|public version/i);
  await api.rebaseProductWorkspace(f.db,{...f.ctx,requestId:'accept-base',expectedRevision:String(published.revision),now:f.now+7},{draftId:b.id,publicVersionId:published.versionId,expectedDraftRevision:String(b.revision),retainDraft:true});
  assert.equal((await getProductWorkspace(f.db,f.ctx.actorId,b.id)).versionId,b.versionId);
  const next=await submitProductIntake(f.db,sendCtx,send);assert.notEqual(next.caseId,f.sent.caseId);assert.equal(next.versionId,b.versionId);
  assert.equal((await getProductWorkspace(f.db,f.ctx.actorId,b.id)).case?.firstCompleteAt,f.now+8);
  assert.equal(f.sqlite.prepare('SELECT first_complete_at FROM product_intake_cases WHERE id=?').get(f.sent.caseId)?.first_complete_at,f.now+3);
  assert.equal(f.sqlite.prepare('SELECT price_paisa FROM products WHERE id=?').get(work.productId)?.price_paisa,80000);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM products').get()?.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM product_intake_cases').get()?.n,2);
  const old=await getOwnerProductIntakeCase(f.db,f.ctx.actorId,f.sent.caseId);assert.equal(old.state,'resolved');assert.equal(old.snapshot.answers.nameEn,'Fictional new cup');await assert.rejects(getOwnerProductIntakeCase(f.db,'foreign',f.sent.caseId));
  await assert.rejects(submitProductIntake(f.db,{...sendCtx,requestId:'wrong-cycle',now:f.now+9},{...send,expectedCaseRevision:String(next.revision),replaceVersionId:next.versionId,expectedCaseId:f.sent.caseId}),/cycle/i);
 }finally{f.dispose();}
});
void test('incomplete replacement remains a help case and revokes the obsolete whole-product and reference-price candidate',async()=>{
 const api=await publication(),f=await submitted('1000');try{
  const work=await api.getProductPublicationReview(f.db,'reviewer',f.sent.caseId),input=structuredClone(f.input);input.offers.offers[0].unitsPerOffer='2';
  const b=await saveProductWorkspace(f.db,{...f.ctx,requestId:'changed-pack',expectedRevision:String(f.attached.revision),now:f.now+4},input);
  assert.equal((await getProductWorkspace(f.db,f.ctx.actorId,b.id)).guidance.reviewReady,false);
  const help=await submitProductIntake(f.db,{...f.ctx,requestId:'changed-pack-help',expectedRevision:String(b.revision),now:f.now+5},{draftId:b.id,versionId:b.versionId,intent:'help',note:'Help me establish the different pack without rewriting the earlier identity.',replaceVersionId:f.sent.versionId,expectedCaseRevision:String(f.sent.revision),expectedCaseId:f.sent.caseId});assert.equal(help.state,'details_needed');
  assert.equal(f.sqlite.prepare('SELECT pending_version_id FROM product_publication_heads WHERE product_id=?').get(work.productId)?.pending_version_id,null);
  const head=await offerHead(f.db,work.productId);
  await assert.rejects(reviewPriceReference(f.db,{actorId:'reviewer',requestId:'stale-price-proof',expectedRevision:String(head!.revision),now:f.now+6},{productId:work.productId,versionId:work.candidate.offerVersionId,offerId:'cup',decision:'approved',reason:'Reviewing the previous fictional reference price.',evidence:{kind:'external_offer',reference:'Fictional original offer dated in the fixture',sellerId:'registered',offerId:'cup',physicalIdentity:physicalOfferIdentity(f.input.offers.offers[0]),originalPaisa:100000,offeredFrom:f.now-2000,offeredTo:f.now-1000,checkedSameSellerOffer:true}}),/current|replaced|complete|candidate/i);
 }finally{f.dispose();}
});
void test('a reference-price finding after approval prevents publication of the obsolete comparison without removing or changing selling prices',async()=>{
 const api=await publication(),f=await submitted('1000');try{
  const work=await api.getProductPublicationReview(f.db,'reviewer',f.sent.caseId),ctx={actorId:'reviewer',requestId:'approve-claim',expectedRevision:String(work.revision),now:f.now+4},input={caseId:f.sent.caseId,versionId:work.candidate.versionId,expectedCaseRevision:String(f.sent.revision),action:'approve_only',reason:'Reviewed the exact actual cup, cover and comparison.',checks};
  await assert.rejects(api.reviewProductPublication(f.db,ctx,input),/reference-price evidence/i);
  const offer=await offerHead(f.db,work.productId),evidence={kind:'external_offer' as const,reference:'Fictional original offer dated in the fixture',sellerId:'registered',offerId:'cup',physicalIdentity:physicalOfferIdentity(f.input.offers.offers[0]),originalPaisa:100000,offeredFrom:f.now-2000,offeredTo:f.now-1000,checkedSameSellerOffer:true};
  const proof=await reviewPriceReference(f.db,{...ctx,requestId:'genuine-reference',expectedRevision:String(offer!.revision)},{productId:work.productId,versionId:work.candidate.offerVersionId,offerId:'cup',decision:'approved',reason:'Recorded the actual fictional same-offer source.',evidence});
  const approved=await api.reviewProductPublication(f.db,ctx,input);
  await reviewPriceReference(f.db,{...ctx,requestId:'reference-finding',expectedRevision:String(proof.revision),now:f.now+5},{productId:work.productId,versionId:work.candidate.offerVersionId,offerId:'cup',decision:'suppressed',reason:'The fictional original-price source was found to be unsupported.',evidence:{...evidence,kind:'review_finding',offeredFrom:null,offeredTo:null,checkedSameSellerOffer:false}});
  await assert.rejects(api.reviewProductPublication(f.db,{...ctx,requestId:'stale-approved-claim',expectedRevision:String(approved.revision),now:f.now+6},{...input,action:'publish_approved',expectedCaseRevision:String(approved.caseRevision),checks:null}),/reference-price evidence/i);
  assert.equal(f.sqlite.prepare('SELECT price_paisa FROM products WHERE id=?').get(work.productId)?.price_paisa,80000);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM product_discount_cycles').get()?.n,0);
 }finally{f.dispose();}
});
void test('a price-only request inherits approved facts and leaves unrelated private edits and their base untouched',async()=>{
 const api=await publication();assert.equal(typeof api.submitProductPriceRevision,'function','A price-only candidate must use the accepted public base while preserving the other private draft.');
 const f=await submitted();try{
  const work=await api.getProductPublicationReview(f.db,'reviewer',f.sent.caseId),published=await api.reviewProductPublication(f.db,{actorId:'reviewer',requestId:'price-base',expectedRevision:String(work.revision),now:f.now+4},{caseId:f.sent.caseId,versionId:work.candidate.versionId,expectedCaseRevision:String(f.sent.revision),action:'approve_and_publish',reason:'Reviewed the complete fictional cup and its cover.',checks});
  const privateInput=structuredClone(f.input);privateInput.answers.nameEn='Unrelated private edit';privateInput.answers.unitContents='';
  const b=await saveProductWorkspace(f.db,{...f.ctx,requestId:'unrelated-private-edit',expectedRevision:String(f.attached.revision),now:f.now+5},privateInput);
  const ctx={...f.ctx,requestId:'price-only-request',expectedRevision:String(published.revision),now:f.now+6},input={draftId:b.id,baseVersionId:published.versionId,expectedDraftRevision:String(b.revision),expectedCaseId:f.sent.caseId,expectedCaseRevision:String(published.caseRevision),replaceVersionId:f.sent.versionId,offerId:'cup',price:'900',note:'A proposed price correction.'};
  let batches=0;const interrupted={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){if(++batches===2)throw new Error('Fictional interruption before sending the retained proposal');return f.db.batch(statements);}} as D1Database;
  await assert.rejects(api.submitProductPriceRevision(interrupted,ctx,input),/not confirmed|uncertain/i);
  const recoverable=await api.getRetainedProductPriceRequests(f.db,f.ctx.actorId,b.id);assert.equal(recoverable.length,1);assert.equal(recoverable[0].requestId,ctx.requestId);assert.deepEqual(recoverable[0].input,input);await assert.rejects(api.getRetainedProductPriceRequests(f.db,'foreign',b.id));
  const b2=await saveProductWorkspace(f.db,{...f.ctx,requestId:'private-edit-during-price-recovery',expectedRevision:String(b.revision),now:f.now+7},{...privateInput,answers:{...privateInput.answers,nameEn:'Later unrelated private edit'}});
  const sent=await api.submitProductPriceRevision(f.db,ctx,input);assert.equal(sent.state,'submitted');assert.deepEqual(await api.submitProductPriceRevision(f.db,{...ctx,now:f.now+7},input),sent);assert.equal((await api.getRetainedProductPriceRequests(f.db,f.ctx.actorId,b.id)).length,0);
  const after=await getProductWorkspace(f.db,f.ctx.actorId,b.id);assert.equal(after.versionId,b2.versionId);assert.equal(after.answers.nameEn,'Later unrelated private edit');assert.equal(after.answers.unitContents,'');assert.equal(after.publication?.baseVersionId,null);assert.equal(after.submitted?.snapshot.answers.nameEn,'Fictional new cup');assert.equal(after.submitted?.snapshot.answers.unitContents,'One cup');assert.equal(after.submitted?.snapshot.offers.offers[0].price,'900');
  assert.equal(f.sqlite.prepare('SELECT price_paisa FROM products WHERE id=?').get(work.productId)?.price_paisa,80000);
  const next=await api.getProductPublicationReview(f.db,'reviewer',sent.caseId);await api.reviewProductPublication(f.db,{actorId:'reviewer',requestId:'publish-price-only',expectedRevision:String(next.revision),now:f.now+8},{caseId:sent.caseId,versionId:next.candidate.versionId,expectedCaseRevision:String(sent.revision),action:'approve_and_publish',reason:'Reviewed the price correction against the same accepted public item.',checks});
  const row=f.sqlite.prepare('SELECT name_en,price_paisa FROM products WHERE id=?').get(work.productId);assert.equal(row?.name_en,'Fictional new cup');assert.equal(row?.price_paisa,90000);
  assert.equal(String(f.sqlite.prepare('SELECT public_json FROM product_publication_decisions WHERE version_id=?').get(next.candidate.versionId)?.public_json).includes(ctx.requestId),false,'Private request recovery metadata is not public content.');
 }finally{f.dispose();}
});
