import {getProductStockAllocations} from './stock-summary';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {offerAuthority,offerGuard,offerReason,OfferError,confirmProductRead,productStaffPartyGuards} from './offer-support';
import {publicationHead} from './publication-candidates';
import {publicProductVisibility,publicProductEligibility,publicationSellerEligibility} from './eligibility';
import {productAvailabilityState,availabilityStateGuard,type ProductAvailabilityState} from './availability-state';
import {getSellerReadiness} from '../sellers/readiness';
import {sellerOrderReadinessGuards} from '../sellers/order-readiness-guards';
import type {OfferDraft} from './offer-contracts';
export type ProductAvailabilityAction='owner_pause'|'owner_resume'|'owner_stop'|'owner_restore'|'staff_withdraw'|'staff_restore';
export interface ProductAvailabilityInput {productId:string;action:ProductAvailabilityAction;reason:string;publicVersionId?:string}
class AvailabilityPermissionError extends OfferError {constructor(message:string){super(message,403);}}
async function authority(db:D1Database,actorId:string,productId:string,staff:boolean){
 if(!staff)return offerAuthority(db,actorId,productId);
 const result=await staffMutationGuard(db,actorId,'product.review',AvailabilityPermissionError,'super_admin');
 return [...result.statements,...await productStaffPartyGuards(db,actorId,productId)];
}
async function productSource(db:D1Database,productId:string){const row=await db.prepare('SELECT p.name_en AS name,p.seller_id AS sellerId,s.user_id AS ownerId FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?').bind(productId).first<{name:string;sellerId:string;ownerId:string}>();if(!row)throw new OfferError('This product is unavailable.',404);return row;}
async function stockOptions(db:D1Database,productId:string){
 return (await db.prepare('SELECT c.offer_id AS offerId,c.version_id AS versionId,c.offer_json AS offer,COALESCE(s.available,0) AS available,COALESCE(s.reserved,0) AS reserved,s.revision,COALESCE(s.paused,0) AS paused,COALESCE(s.needs_reconfirmation,1) AS needsReconfirmation,s.confirmed_at AS confirmedAt FROM product_offer_current c LEFT JOIN offer_stock s ON s.offer_id=c.offer_id WHERE c.product_id=? ORDER BY c.offer_id').bind(productId).all<{offerId:string;versionId:string;offer:string;available:number;reserved:number;revision:number|null;paused:number;needsReconfirmation:number;confirmedAt:number|null}>()).results.map(row=>({...row,offer:JSON.parse(row.offer) as OfferDraft}));
}
export async function getProductAvailability(db:D1Database,actorId:string,productId:string,now:number=Date.now()){
 const product=await productSource(db,productId),owner=product.ownerId===actorId,readGuards=await authority(db,actorId,productId,!owner);
 const [state,head,offers,readiness,visibility,allocations]=await Promise.all([productAvailabilityState(db,productId),publicationHead(db,productId),stockOptions(db,productId),getSellerReadiness(db,product.sellerId,now),db.prepare(`SELECT ${publicProductVisibility('p',now)} AS visible,${publicProductEligibility('p',now)} AS eligible FROM products p WHERE p.id=?`).bind(productId).first<{visible:number;eligible:number}>(),getProductStockAllocations(db,productId)]);
 const purchasable=offers.some(row=>!row.offer.browseOnly&&row.available>0&&!row.paused&&!row.needsReconfirmation&&row.confirmedAt!==null);
 await authority(db,actorId,productId,!owner);
 const history=(await db.prepare('SELECT id,kind,reason,created_at AS createdAt FROM product_availability_events WHERE product_id=? ORDER BY revision DESC LIMIT 20').bind(productId).all<{id:string;kind:ProductAvailabilityAction;reason:string;createdAt:number}>()).results;
 const result={actorId,productId,name:product.name,history,allocations,owner,state,publicVersionId:head?.currentVersionId??null,visible:Boolean(visibility?.visible),canOrder:Boolean(visibility?.eligible)&&readiness.newOrders&&purchasable,offers,orderBlockers:readiness.blockers.filter(row=>row.capability==='newOrders')};
 await confirmProductRead(db,[...readGuards,...availabilityStateGuard(db,productId,state)],async()=>{await authority(db,actorId,productId,!owner);});
 return result;
}
export async function changeProductAvailability(db:D1Database,ctx:CommandContext,input:ProductAvailabilityInput){
 if(!input||Object.keys(input).some(key=>!['productId','action','reason','publicVersionId'].includes(key))||!['owner_pause','owner_resume','owner_stop','owner_restore','staff_withdraw','staff_restore'].includes(input.action))throw new OfferError('Choose an exact supported availability action.',400);
 const guards=await authority(db,ctx.actorId,input.productId,input.action.startsWith('staff_')),product=await productSource(db,input.productId),reason=offerReason(input.reason),source={action:'product.availability.'+input.action,subjectType:'product',subjectId:input.productId},receipt=await commandReceipt(db,ctx,source,input);
 if(receipt.replayed)return receipt.result as {productId:string;revision:number;eventId:string;action:ProductAvailabilityAction};
 const state=await productAvailabilityState(db,input.productId),head=await publicationHead(db,input.productId);
 if(ctx.expectedRevision!==(state.revision===null?null:String(state.revision)))throw new OfferError('Availability changed. Compare the current independent holds before acting.');
 const restoring=['owner_resume','owner_restore','staff_restore'].includes(input.action);
 if(restoring&&(!input.publicVersionId||!head?.currentVersionId||input.publicVersionId!==head.currentVersionId))throw new OfferError('Compare and explicitly confirm the same current approved public version before restoration.');
 const next:ProductAvailabilityState={...state};
 switch(input.action){case 'owner_pause':next.ownerPaused=true;break;case 'owner_resume':if(state.staffWithdrawn||state.ownerWithdrawn)throw new OfferError('Resolve the separate listing withdrawal before resuming orders.');next.ownerPaused=false;break;case 'owner_stop':next.ownerWithdrawn=true;next.ownerPaused=true;break;case 'owner_restore':next.ownerWithdrawn=false;break;case 'staff_withdraw':next.staffWithdrawn=true;break;case 'staff_restore':next.staffWithdrawn=false;break;}
 if(next.ownerPaused===state.ownerPaused&&next.ownerWithdrawn===state.ownerWithdrawn&&next.staffWithdrawn===state.staffWithdrawn)throw new OfferError('This availability action is already reflected in the current state.');
 const statements=[db.prepare('UPDATE products SET updated_at=updated_at WHERE id=?').bind(input.productId),...guards,...availabilityStateGuard(db,input.productId,state)];
 if(restoring){statements.push(...offerGuard(db,'EXISTS(SELECT 1 FROM product_publication_heads WHERE product_id=? AND current_version_id=? AND current_publication_id=?)',[input.productId,head!.currentVersionId,head!.currentPublicationId]),...offerGuard(db,`EXISTS(SELECT 1 FROM products p WHERE p.id=? AND ${publicationSellerEligibility('p',ctx.now)})`,[input.productId]));}
 if(input.action==='owner_resume'){
  statements.push(...await sellerOrderReadinessGuards(db,product.sellerId,ctx.now));
  const offers=await stockOptions(db,input.productId),ready=offers.find(row=>!row.offer.browseOnly&&row.available>0&&!row.paused&&!row.needsReconfirmation&&row.confirmedAt!==null);
  if(!ready)throw new OfferError('Confirm actual available stock and ordering readiness for the current approved offer before resuming.');
  statements.push(...offerGuard(db,'EXISTS(SELECT 1 FROM product_offer_current c LEFT JOIN offer_stock s ON s.offer_id=c.offer_id WHERE c.offer_id=? AND c.version_id=? AND c.offer_json=? AND s.revision=? AND s.available>0 AND s.paused=0 AND s.needs_reconfirmation=0 AND s.confirmed_at IS NOT NULL)',[ready.offerId,ready.versionId,JSON.stringify(ready.offer),ready.revision]));
 }
 const eventId=crypto.randomUUID(),revision=(state.revision??-1)+1;
 statements.push(db.prepare('INSERT INTO product_availability_events(id,product_id,revision,kind,owner_paused,owner_withdrawn,staff_withdrawn,public_version_id,previous_event_id,actor_id,reason,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(eventId,input.productId,revision,input.action,Number(next.ownerPaused),Number(next.ownerWithdrawn),Number(next.staffWithdrawn),restoring?input.publicVersionId!:head?.currentVersionId??null,state.lastEventId,ctx.actorId,reason,ctx.requestId,ctx.now));
 statements.push(state.revision===null?db.prepare('INSERT INTO product_availability_states(product_id,revision,owner_paused,owner_withdrawn,staff_withdrawn,last_event_id,updated_at) VALUES(?,?,?,?,?,?,?)').bind(input.productId,revision,Number(next.ownerPaused),Number(next.ownerWithdrawn),Number(next.staffWithdrawn),eventId,ctx.now):db.prepare('UPDATE product_availability_states SET revision=?,owner_paused=?,owner_withdrawn=?,staff_withdrawn=?,last_event_id=?,updated_at=? WHERE product_id=?').bind(revision,Number(next.ownerPaused),Number(next.ownerWithdrawn),Number(next.staffWithdrawn),eventId,ctx.now,input.productId));
 if(input.action==='owner_resume')statements.push(...offerGuard(db,`EXISTS(SELECT 1 FROM products p WHERE p.id=? AND ${publicProductEligibility('p',ctx.now)})`,[input.productId]));
 statements.push(...await operationalBusinessNotificationStatements(db,{kind:'product.availability',sourceId:input.productId,eventId,actorId:ctx.actorId,now:ctx.now,status:input.action,detail:reason+' Existing orders and independent restrictions remain unchanged. Open this product for its current availability.'}));
 const result={productId:input.productId,revision,eventId,action:input.action};statements.push(receipt.insert(result));
 try{await db.batch(statements);}catch(error){const retry=await commandReceipt(db,ctx,source,input);if(retry.replayed)return retry.result as typeof result;throw new OfferError(/constraint|guard|availability|conflict/i.test(String(error))?'Availability, approved version, readiness or current authority changed. Compare the saved outcome.':'The availability response is uncertain. Retry this exact request.',/constraint|guard|availability|conflict/i.test(String(error))?409:503);}return result;
}
