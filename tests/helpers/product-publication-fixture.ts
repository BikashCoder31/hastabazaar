import type {OfferMatrix} from '../../lib/products/offer-contracts';
import type {CategoryDetailModel} from '../../lib/products/category-fields';
import type {IntakeSnapshot} from '../../lib/products/intake-workspace';
import {saveProductWorkspace,submitProductIntake} from '../../lib/products/intake-workspace';
import {publishCategoryContract} from '../../lib/products/category-contracts';
import {completeVersionFixture} from './complete-version-fixture';

const category:CategoryDetailModel={categoryId:'cups',name:'Cups',parentId:null,status:'available',versionId:'cups-v1',revision:0,groups:[],contract:{recommendedGroups:[],publicationRules:[],orderingRules:[{field:'preparationDays',reason:'State the actual preparation promise before accepting orders.'}],eligibilityRequirements:[],labels:{}}};
function snapshot():IntakeSnapshot{return {categoryId:'cups',answers:{nameEn:'Fictional new cup',descriptionEn:'One unused ceramic cup.',condition:'new',unitContents:'One cup',packQuantity:'1',inventoryQuantity:'9',price:'999',occasionIds:[]},offers:{axes:[],offers:[{id:'cup',selection:{},price:'800',compareAt:'',sku:'CUP',mediaId:'photo',stockFamilyKey:'cup',baseUnit:'piece',unitsPerOffer:'1',included:true,browseOnly:true,stockIntent:'9'}]},mediaIds:['photo'],privateReview:{note:'Private review note',licenceReference:'Private licence reference'},formContext:{version:1,publishedAt:0,fields:[],answers:[],issues:[]}} as IntakeSnapshot;}
export async function productPublicationFixture(compareAt='',now?:number,orderable=false,matrix?:OfferMatrix,extraMediaIds:string[]=[]){
 const f=await completeVersionFixture(now);
 try{
  f.sqlite.exec("DELETE FROM seller_restrictions WHERE seller_id='registered'; INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('cups','fictional-cups','Fictional Cups',1,0,1,1)");
  await publishCategoryContract(f.db,{actorId:'reviewer',requestId:'cups-policy',expectedRevision:null,now:f.now},{categoryId:'cups',contract:category.contract,reason:'Reviewed the fictional cup category and its applicable facts.'});
  const ctx={actorId:'registered-owner',requestId:'cup-draft',expectedRevision:null,now:f.now+1},input={...snapshot(),formContext:null,draftId:null,sellerId:'registered',mediaIds:[]};
  if(matrix)input.offers=structuredClone(matrix);
  input.offers.offers[0].compareAt=compareAt;
  if(orderable){input.answers.preparationDays='2';input.offers.offers[0].browseOnly=false;}
  const draft=await saveProductWorkspace(f.db,ctx,input);
  f.sqlite.prepare("INSERT INTO product_intake_media(id,draft_id,owner_id,request_id,object_key,mime_type,size_bytes,original_name,content_digest,state,created_at,completed_at) VALUES('photo',?,'registered-owner','fixture-image','private/fictional-cup.png','image/png',100,'fictional-cup.png','fixture-digest','ready',1,1)").run(draft.id);
  for(const id of extraMediaIds)f.sqlite.prepare("INSERT INTO product_intake_media(id,draft_id,owner_id,request_id,object_key,mime_type,size_bytes,original_name,content_digest,state,created_at,completed_at) VALUES(?,?,'registered-owner',?,?,'image/png',100,'fictional-choice.png',?,'ready',1,1)").run(id,draft.id,'fixture-'+id,'private/'+id+'.png','fixture-digest-'+id);
  const attached=await saveProductWorkspace(f.db,{...ctx,requestId:'cup-cover',expectedRevision:String(draft.revision),now:f.now+2},{...input,draftId:draft.id,mediaIds:['photo',...extraMediaIds]});
  const sent=await submitProductIntake(f.db,{...ctx,requestId:'cup-submit',expectedRevision:String(attached.revision),now:f.now+3},{draftId:draft.id,versionId:attached.versionId,intent:'review',note:''});
  return {...f,ctx,input:{...input,draftId:draft.id,mediaIds:['photo',...extraMediaIds]},attached,sent};
 }catch(error){f.dispose();throw error;}
}

export {category as publicationCategory,snapshot as publicationSnapshot};
