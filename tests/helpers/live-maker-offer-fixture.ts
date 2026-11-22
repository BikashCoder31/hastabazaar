import {liveMakerFixture} from './live-maker-fixture';
import {publicationCategory,publicationSnapshot} from './product-publication-fixture';
import {publishCategoryContract} from '../../lib/products/category-contracts';
import {saveProductWorkspace,submitProductIntake} from '../../lib/products/intake-workspace';
import {getProductPublicationReview,reviewProductPublication} from '../../lib/products/publication';
import {confirmOfferStock} from '../../lib/products/offer-inventory';

/** Genuine fictional intake/publication; publication and stock do not activate ordering. */
export async function publishedLiveMakerFixture(){
 const f=await liveMakerFixture();try{
  f.sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('cups','live-fixture-cups','Fictional Cups',1,0,1,1)");
  await publishCategoryContract(f.db,f.ctx('live-category'),{categoryId:'cups',contract:publicationCategory.contract,reason:'Review the applicable facts for these fictional new cups.'});
  const source=publicationSnapshot();source.answers.preparationDays='2';source.offers.offers[0].browseOnly=false;
  const input={...source,formContext:null,draftId:null as string|null,sellerId:f.sellerId,mediaIds:[] as string[]};
  const ownerCtx=(requestId:string,expectedRevision:string|null=null)=>({...f.ctx(requestId,expectedRevision),actorId:f.ownerId});
  const draft=await saveProductWorkspace(f.db,ownerCtx('live-cup-draft'),input);
  f.sqlite.prepare("INSERT INTO product_intake_media(id,draft_id,owner_id,request_id,object_key,mime_type,size_bytes,original_name,content_digest,state,created_at,completed_at) VALUES('photo',?,?,'live-fixture-image','private/fictional-live-cup.png','image/png',100,'fictional-live-cup.png','fictional-image-digest','ready',1,1)").run(draft.id,f.ownerId);
  const attached=await saveProductWorkspace(f.db,ownerCtx('live-cup-cover',String(draft.revision)),{...input,draftId:draft.id,mediaIds:['photo']});
  const sent=await submitProductIntake(f.db,ownerCtx('live-cup-submit',String(attached.revision)),{draftId:draft.id,versionId:attached.versionId,intent:'review',note:''});
  const review=await getProductPublicationReview(f.db,'reviewer',sent.caseId);
  const published=await reviewProductPublication(f.db,f.ctx('live-cup-publish',String(review.revision)),{caseId:sent.caseId,versionId:review.candidate.versionId,expectedCaseRevision:String(review.caseRevision),action:'approve_and_publish',reason:'Independently review this exact fictional new cup and its actual ordering facts.',checks:{sameItem:true,accurateCover:true,eligibilityEvidence:[]}});
  await confirmOfferStock(f.db,ownerCtx('live-cup-stock'),{offerId:'cup',available:9,reason:'Count nine independent fictional cups before order activation.',independentStockConfirmed:true});
  const product=f.sqlite.prepare('SELECT slug FROM products WHERE id=?').get(review.productId)!;
  return {...f,ownerCtx,productId:review.productId,offerId:'cup',slug:String(product.slug),publication:published,publicationReview:review};
 }catch(error){f.dispose();throw error;}
}
