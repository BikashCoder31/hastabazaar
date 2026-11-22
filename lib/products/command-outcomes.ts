import {productOutcomeKinds,type ProductOutcomeKind,type ProductCommandOutcome} from './command-outcome-contract';
import {getProductPublicationReview} from './publication';
import {getProductIntakeReview} from './intake-assistance';
import {getProductWorkspace} from './intake-workspace';
import {getProductAvailability} from './availability';
import {getProductConcern,listProductConcerns} from './priority-concerns';
import {inspectLegacyProduct} from './legacy-workspace';
import {pricingSubjectAuthority} from './private-price-inputs';
import {offerAuthority,offerGuard,OfferError,productReadGuardConflict} from './offer-support';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {intakeId} from './intake-http';

interface Input {kind:ProductOutcomeKind;sourceId:string;requestId:string;action:string;relatedId?:string}
interface NativeReceipt {id:string;actorId:string;requestId:string;action:string;subjectType:string;subjectId:string;digest:string;result:string|null}
class OutcomeAuthorityError extends OfferError {constructor(message:string){super(message,403);}}
const publications=['approve_only','approve_and_publish','publish_approved','request_changes','reject'].map(action=>'product.publication.'+action);
const actions:Record<ProductOutcomeKind,Record<string,string>>={publication_review:{approve_only:'product.publication.approve_only',approve_and_publish:'product.publication.approve_and_publish',publish_approved:'product.publication.publish_approved',request_changes:'product.publication.request_changes',reject:'product.publication.reject',price_reference:'review_price_reference',observe_price:'observe_orderable_price'},intake_review:{triage:'product.intake.triaged',propose:'product.intake.changes_proposed'},availability:{owner_pause:'product.availability.owner_pause',owner_resume:'product.availability.owner_resume',owner_stop:'product.availability.owner_stop',owner_restore:'product.availability.owner_restore',staff_withdraw:'product.availability.staff_withdraw',staff_restore:'product.availability.staff_restore',confirm_stock:'offer.stock.confirmed',pause_offer:'offer.stock.pause',move_stock:'offer.stock.moved'},concern_report:{report:'product.priority.reported'},concern_case:{triage:'product.priority.triaged'},publication_owner:{rebase:'product.workspace.rebased',price_only:'product.intake.received'},legacy_product:{open_existing:'product.legacy.workspace_opened'},legacy_media:{reuse_file:'product.legacy.media_reused'},legacy_stock:{map_legacy_stock:'offer.legacy.mapped'}};
async function commandKey(actorId:string,requestId:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actorId,requestId])));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
async function exactSource(db:D1Database,table:string,id:string){const row=await db.prepare('SELECT id FROM '+table+' WHERE id=?').bind(id).first<{id:string}>();if(!row||row.id!==id)throw new OutcomeAuthorityError('The exact original Product source is unavailable.');}

/** No replay or business action. Return only an owned native receipt fact after current source proof. */
export async function readProductCommandOutcome(db:D1Database,actorId:string,namespace:'admin'|'seller',input:Input):Promise<ProductCommandOutcome>{
 if(!input||Object.keys(input).some(key=>!['kind','sourceId','requestId','action','relatedId'].includes(key))||!productOutcomeKinds.includes(input.kind)||!intakeId(input.sourceId)||typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(input.requestId)||typeof input.action!=='string'||!Object.hasOwn(actions[input.kind],input.action)||input.kind==='legacy_media'&&!intakeId(input.relatedId)||input.kind!=='legacy_media'&&input.relatedId!==undefined)throw new OfferError('Use the original Product action, source and opaque request reference.',400);
 const expectedAction=actions[input.kind][input.action],key=await commandKey(actorId,input.requestId),receipt=await db.prepare("SELECT id,actor_id AS actorId,request_id AS requestId,action,subject_type AS subjectType,subject_id AS subjectId,command_digest AS digest,CASE WHEN action='product.legacy.media_reused' OR action='review_price_reference' OR action='observe_orderable_price' OR action LIKE 'product.publication.%' THEN command_result_json ELSE NULL END AS result FROM audit_logs WHERE command_key=? AND command_digest IS NOT NULL AND command_result_json IS NOT NULL").bind(key).first<NativeReceipt>();
 if(receipt&&(receipt.actorId!==actorId||receipt.requestId!==input.requestId))throw new OutcomeAuthorityError('The original Product request identity is unavailable.');
 const guards:D1PreparedStatement[]=[];let matches=false;
 const direct=(type:string,id:string,actions:readonly string[])=>!!receipt&&receipt.action===expectedAction&&receipt.subjectType===type&&receipt.subjectId===id&&actions.includes(receipt.action);
 if(input.kind==='publication_review'){
  if(namespace!=='admin')throw new OutcomeAuthorityError('Use the independent staff publication workspace.');
  await exactSource(db,'product_intake_cases',input.sourceId);
  const view=await getProductPublicationReview(db,actorId,input.sourceId),authority=await staffMutationGuard(db,actorId,view.canReview?'product.review':'product.publish',OutcomeAuthorityError);
  guards.push(...authority.statements,...offerGuard(db,'EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id JOIN seller_profiles s ON s.id=d.seller_id JOIN product_publication_links l ON l.draft_id=d.id WHERE c.id=? AND d.id=? AND l.product_id=? AND d.owner_id<>? AND s.user_id<>?)',[input.sourceId,view.draftId,view.productId,actorId,actorId]));
  matches=direct('product',view.productId,publications)||direct('product_offer',view.productId,['review_price_reference','observe_orderable_price']);
  if(matches&&receipt){
   const result:unknown=JSON.parse(receipt.result??'null');
   if(publications.includes(receipt.action)){
    const versionId=result&&typeof result==='object'&&'versionId'in result&&typeof result.versionId==='string'?result.versionId:null;
    const predicate='EXISTS(SELECT 1 FROM product_publication_candidates WHERE id=? AND case_id=? AND product_id=?)',values=[versionId,input.sourceId,view.productId];
    matches=versionId!==null&&!!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first();guards.push(...offerGuard(db,predicate,values));
   }else if(receipt.action==='observe_orderable_price'){
    const observationId=result&&typeof result==='object'&&'caseId'in result&&result.caseId===input.sourceId&&'id'in result&&typeof result.id==='string'?result.id:null;
    const predicate='EXISTS(SELECT 1 FROM product_orderable_price_observations o JOIN product_publication_candidates c ON c.product_id=o.product_id WHERE o.id=? AND c.case_id=? AND o.product_id=?)',values=[observationId,input.sourceId,view.productId];
    matches=observationId!==null&&!!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first();guards.push(...offerGuard(db,predicate,values));
   }else{
    const reviewId=result&&typeof result==='object'&&'id'in result&&typeof result.id==='string'?result.id:null;
    const predicate='EXISTS(SELECT 1 FROM product_price_reference_reviews r JOIN product_publication_candidates c ON c.product_id=r.product_id AND c.offer_version_id=r.version_id WHERE r.id=? AND c.case_id=? AND r.product_id=?)',values=[reviewId,input.sourceId,view.productId];
    matches=reviewId!==null&&!!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first();guards.push(...offerGuard(db,predicate,values));
   }
  }
 }else if(input.kind==='legacy_stock'){
  if(namespace!=='admin')throw new OutcomeAuthorityError('Use the independent original stock review workspace.');
  await exactSource(db,'products',input.sourceId);guards.push(...await offerAuthority(db,actorId,input.sourceId,true));matches=direct('product_offer',input.sourceId,['offer.legacy.mapped']);
 }else if(input.kind==='intake_review'){
  if(namespace!=='admin')throw new OutcomeAuthorityError('Use the independent staff assistance workspace.');
  await exactSource(db,'product_intake_cases',input.sourceId);const view=await getProductIntakeReview(db,actorId,input.sourceId),authority=await staffMutationGuard(db,actorId,view.canReviewProducts?'product.review':'support.manage',OutcomeAuthorityError);
  guards.push(...authority.statements,...offerGuard(db,'EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id JOIN seller_profiles s ON s.id=d.seller_id WHERE c.id=? AND d.id=? AND d.owner_id=? AND s.user_id=d.owner_id AND d.owner_id<>?)',[input.sourceId,view.draftId,view.ownerId,actorId]));
  matches=direct('product_intake',input.sourceId,['product.intake.triaged','product.intake.changes_proposed']);
 }else if(input.kind==='availability'){
  await exactSource(db,'products',input.sourceId);const view=await getProductAvailability(db,actorId,input.sourceId,Date.now());
  if(view.owner!==(namespace==='seller'))throw new OutcomeAuthorityError('Use the exact current owner or independent staff availability workspace.');
  if(view.owner)guards.push(...await offerAuthority(db,actorId,input.sourceId));
  else{const authority=await staffMutationGuard(db,actorId,'product.review',OutcomeAuthorityError,'super_admin');guards.push(...authority.statements,...offerGuard(db,'NOT EXISTS(SELECT 1 FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=? AND s.user_id=?)',[input.sourceId,actorId]));}
  matches=direct('product',input.sourceId,(namespace==='seller'?['owner_pause','owner_resume','owner_stop','owner_restore']:['staff_withdraw','staff_restore']).map(action=>'product.availability.'+action));
  if(!matches&&namespace==='seller'&&receipt?.action===expectedAction&&receipt.subjectType==='product_offer'&&['offer.stock.confirmed','offer.stock.pause','offer.stock.moved'].includes(receipt.action)){
   matches=!!await db.prepare('SELECT 1 FROM product_offer_identities WHERE id=? AND product_id=?').bind(receipt.subjectId,input.sourceId).first();
   guards.push(...offerGuard(db,'EXISTS(SELECT 1 FROM product_offer_identities WHERE id=? AND product_id=?)',[receipt.subjectId,input.sourceId]));
  }
 }else if(input.kind==='concern_report'||input.kind==='concern_case'){
  await exactSource(db,input.kind==='concern_case'?'product_priority_cases':'products',input.sourceId);
  const view=input.kind==='concern_case'?await getProductConcern(db,actorId,input.sourceId):await listProductConcerns(db,actorId,input.sourceId);
  if(view.staff!==(namespace==='admin'))throw new OutcomeAuthorityError('Use your exact current Product concern workspace.');
  guards.push(...await offerAuthority(db,actorId,view.productId,view.staff));
  if(input.kind==='concern_case')guards.push(...offerGuard(db,'EXISTS(SELECT 1 FROM product_priority_cases WHERE id=? AND product_id=?)',[input.sourceId,view.productId]));
  matches=input.kind==='concern_case'?direct('product_priority',input.sourceId,['product.priority.triaged']):direct('product',input.sourceId,['product.priority.reported']);
 }else{
  if(namespace!=='seller')throw new OutcomeAuthorityError('Only the current owner may recover this private Product action.');
  if(input.kind==='legacy_product'){
   await exactSource(db,'products',input.sourceId);await inspectLegacyProduct(db,actorId,input.sourceId);guards.push(...await offerAuthority(db,actorId,input.sourceId));matches=direct('product',input.sourceId,['product.legacy.workspace_opened']);
  }else{
   await exactSource(db,'product_intake_drafts',input.sourceId);await getProductWorkspace(db,actorId,input.sourceId);const authority=await pricingSubjectAuthority(db,actorId,{kind:'intake',id:input.sourceId,offerId:'base'});guards.push(...authority.statements);
   matches=direct('product_intake',input.sourceId,input.kind==='legacy_media'?['product.legacy.media_reused']:['product.workspace.rebased','product.intake.received']);
   if(matches&&input.kind==='legacy_media'&&receipt){
    const result:unknown=JSON.parse(receipt.result??'null'),copyId=result&&typeof result==='object'&&'id'in result&&typeof result.id==='string'?result.id:null;
    const predicate='EXISTS(SELECT 1 FROM product_legacy_media_copies WHERE draft_id=? AND source_media_id=? AND intake_media_id=?)',values=[input.sourceId,input.relatedId,copyId];
    matches=copyId!==null&&!!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first();guards.push(...offerGuard(db,predicate,values));
   }
  }
 }
 if(receipt&&!matches)throw new OfferError('This original request belongs to a different Product source or action. Open its exact original record.',409);
 if(receipt)guards.push(...offerGuard(db,'EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND command_key=? AND actor_id=? AND request_id=? AND action=? AND subject_type=? AND subject_id=? AND command_digest=? AND command_result_json IS NOT NULL AND (? IS NULL OR HEX(command_result_json)=HEX(?)))',[receipt.id,key,actorId,input.requestId,receipt.action,receipt.subjectType,receipt.subjectId,receipt.digest,receipt.result,receipt.result]));
 try{await db.batch(guards);}catch(error){if(!productReadGuardConflict(error))throw new OfferError('The original Product outcome could not be checked. Keep its reference and retry.',503);throw new OutcomeAuthorityError('Current Product source or authority changed. Open the original record with current access.');}
 return{requestId:input.requestId,status:receipt?'recorded':'unconfirmed'};
}
