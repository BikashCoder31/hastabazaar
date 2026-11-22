import {detailText,evaluateCategoryReadiness,productDetailKeys,type CategoryDetailModel,type ProductDetailAnswers} from './category-fields';
import {OfferError,offerMoney,validateOfferMatrix} from './offer-contracts';
import type {IntakeSnapshot} from './intake-workspace';

export interface PublicationMedia {id:string;mimeType:string;state:string}
/** Compiles supplied facts, not approval. The transaction must independently bind
 * category evidence, price-reference decisions, media ownership and staff authority. */
export function compileProductPublication(input:{snapshot:IntakeSnapshot;category:CategoryDetailModel;media:readonly PublicationMedia[];confirmedEligibility:readonly string[]}) {
 const {snapshot,category,media,confirmedEligibility}=input;
 if(!snapshot.categoryId||snapshot.categoryId!==category.categoryId)throw new OfferError('Review the category belonging to this exact candidate.');
 const checked=validateOfferMatrix(snapshot.offers);
 if(!checked.publishable)throw new OfferError(checked.issues.join(' '));
 const included=checked.matrix.offers.filter(row=>row.included);
 const attached=snapshot.mediaIds.map(id=>media.find(row=>row.id===id&&row.state==='ready'));
 const photos=attached.filter(row=>row&&['image/jpeg','image/png','image/webp'].includes(row.mimeType));
 const cover=photos[0];if(!cover)throw new OfferError('Review at least one completed usable cover image.');
 if(attached.some(row=>!row||!['image/jpeg','image/png','image/webp','video/mp4'].includes(row.mimeType)))throw new OfferError('Every included media reference must be a completed supported file in this frozen candidate.');
 for(const offer of included)if(offer.mediaId&&!photos.some(photo=>photo?.id===offer.mediaId))throw new OfferError('An offer image must belong to the frozen candidate’s completed photos.');
 const readiness=evaluateCategoryReadiness(category,{...snapshot.answers,price:included[0].price,coverImage:cover.id},confirmedEligibility);
 if(!readiness.publicationReady)throw new OfferError(readiness.publication.map(issue=>issue.reason).join(' '));
 // Default new public facts to review-required, but never publish editor-only
 // stock, duplicate price inputs, arbitrary custom questions or private evidence.
 const omitted=new Set(['inventoryQuantity','price','compareAtPrice','coverImage','occasionIds','packageSize']);
 const details:ProductDetailAnswers={};
 for(const [key,value] of Object.entries(snapshot.answers))if(productDetailKeys.has(key)&&!omitted.has(key))details[key as keyof ProductDetailAnswers]=structuredClone(value);
 const rawOccasions=snapshot.answers.occasionIds;
 const occasionIds=[...new Set((Array.isArray(rawOccasions)?rawOccasions:detailText(snapshot.answers,'occasionIds').split(',')).map(value=>value.trim()).filter(Boolean))];
 if(occasionIds.length>30||occasionIds.some(id=>!/^[A-Za-z0-9_-]{1,160}$/.test(id)))throw new OfferError('Choose valid existing gift occasions, or leave them empty.');
 const offers=included.map(({stockIntent:_,...offer})=>({...offer,pricePaisa:offerMoney(offer.price)!,compareAtPricePaisa:offer.compareAt===''?null:offerMoney(offer.compareAt)!}));
 return {categoryId:snapshot.categoryId,categoryVersionId:category.versionId!,details,axes:structuredClone(checked.matrix.axes),offers,mediaIds:[...snapshot.mediaIds],coverMediaId:cover.id,occasionIds,pricePaisa:offers[0].pricePaisa,compareAtPricePaisa:offers[0].compareAtPricePaisa,orderingFactsReady:readiness.orderingFactsReady,orderingIssues:readiness.ordering};
}
export type ProductPublication=ReturnType<typeof compileProductPublication>;
