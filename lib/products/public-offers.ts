import {productDetailKeys,type ProductDetailAnswers} from './category-fields';
import {publicProductEligibility,publicProductVisibility} from './eligibility';
import {currentProductMediaSql,currentProductMediaOrder} from './publication-media';
import {getSellerReadiness} from '../sellers/readiness';
import {offerMoney,physicalOfferIdentity,type OfferDraft,type OfferMatrix} from './offer-contracts';
import {publicPricePreview} from './price-guidance';
import {priceApprovedVariant,variantPricingEnabled,variantPricingPublishedOfferSql,type VARIANT_PRICING_RULE_VERSION} from './variant-pricing';

export interface PublicOffer {
 id:string;versionId:string;sku:string;selection:{axisId:string;valueId:string;name:string;value:string}[];
 pricePaisa:number;compareAtPricePaisa:number|null;mediaId:string|null;available:number;orderable:boolean;
 pricingRuleVersion?:typeof VARIANT_PRICING_RULE_VERSION;
 availability:'available'|'out_of_stock'|'unavailable_to_order';baseUnit:'piece'|'gram'|'millilitre';unitsPerOffer:number;
}
export interface PublicOfferSet {
 productId:string;publicVersionId:string|null;versionId:string;details?:ProductDetailAnswers;axes:OfferMatrix['axes'];offers:PublicOffer[];orderable:boolean;
 display:{pricePaisa:number|null;maximumPricePaisa:number|null;from:boolean;compareAtPricePaisa:number|null};
}
/** The represented set is shared by cards, metadata, filters and selected-offer views. */
export function summarizePublicOffers(offers:readonly PublicOffer[]):PublicOfferSet['display'] {
 const available=offers.filter(offer=>offer.orderable),shown=available.length?available:offers;
 if(!shown.length)return {pricePaisa:null,maximumPricePaisa:null,from:false,compareAtPricePaisa:null};
 const minimum=Math.min(...shown.map(offer=>offer.pricePaisa)),maximum=Math.max(...shown.map(offer=>offer.pricePaisa));
 const samePair=shown.every(offer=>offer.pricePaisa===shown[0].pricePaisa&&offer.compareAtPricePaisa===shown[0].compareAtPricePaisa);
 return {pricePaisa:minimum,maximumPricePaisa:maximum,from:minimum!==maximum,compareAtPricePaisa:samePair?shown[0].compareAtPricePaisa:null};
}
/** Explicit public allowlist. No private workspace, evidence reference, cost or stock intent is returned. */
export async function getPublicOfferSet(db:D1Database,productId:string,now=Date.now(),expectedPublicVersionId?:string|null,orderingAllowed?:boolean):Promise<PublicOfferSet|null>{
 const pricingSource=variantPricingEnabled(db)?variantPricingPublishedOfferSql('p.id','h.current_version_id'):'0';
 const head=await db.prepare(`SELECT p.seller_id AS sellerId,h.current_version_id AS versionId,pub.current_version_id AS publicVersionId,
 pub_dec.public_json AS publicJson,v.matrix_json AS matrix,p.return_eligible AS returnEligible,
 CASE WHEN ${pricingSource} THEN 1 ELSE 0 END AS pricingApproved,CASE WHEN ${publicProductEligibility('p',now)} THEN 1 ELSE 0 END AS eligible
 FROM products p JOIN product_offer_heads h ON h.product_id=p.id JOIN product_offer_versions v ON v.id=h.current_version_id
 LEFT JOIN product_publication_heads pub ON pub.product_id=p.id LEFT JOIN product_publication_decisions pub_dec ON pub_dec.id=pub.current_publication_id WHERE p.id=? AND ${publicProductVisibility('p',now)}`)
 .bind(productId).first<{sellerId:string;versionId:string;publicVersionId:string|null;matrix:string;publicJson:string|null;returnEligible:number;pricingApproved:number;eligible:number}>();
 if(!head||expectedPublicVersionId!==undefined&&head.publicVersionId!==expectedPublicVersionId)return null;
 const pricingApproved=Number(head.pricingApproved)===1;
 const [current,media,proofs,readiness]=await Promise.all([
  db.prepare(`SELECT c.offer_id AS id,c.offer_json AS offer,i.platform_sku AS sku,s.available,s.paused,s.needs_reconfirmation AS reconfirm,s.confirmed_at AS confirmedAt
   FROM product_offer_current c JOIN product_offer_heads h ON h.product_id=c.product_id AND h.current_version_id=c.version_id
   JOIN product_offer_identities i ON i.id=c.offer_id AND i.product_id=c.product_id LEFT JOIN offer_stock s ON s.offer_id=c.offer_id
   WHERE c.product_id=? AND c.version_id=? ORDER BY c.offer_id`).bind(productId,head.versionId).all<{id:string;offer:string;sku:string;available:number|null;paused:number|null;reconfirm:number|null;confirmedAt:number|null}>(),
  db.prepare(`SELECT id FROM product_media WHERE product_id=? AND ${currentProductMediaSql()} AND mime_type IN ('image/jpeg','image/png','image/webp') ORDER BY ${currentProductMediaOrder()},id`).bind(productId).all<{id:string}>(),
  db.prepare(`SELECT r.offer_id AS offerId,r.decision,r.physical_json AS physicalIdentity,r.selling_paisa AS sellingPaisa,r.compare_paisa AS compareAtPaisa
   FROM product_price_reference_reviews r WHERE r.product_id=? AND r.seller_id=? AND r.version_id=?
   AND NOT EXISTS(SELECT 1 FROM product_price_reference_reviews newer WHERE newer.product_id=r.product_id AND newer.offer_id=r.offer_id AND newer.version_id=r.version_id AND newer.review_revision>r.review_revision)`)
   .bind(productId,head.sellerId,head.versionId).all<{offerId:string;decision:string;physicalIdentity:string;sellingPaisa:number;compareAtPaisa:number}>(),
  orderingAllowed===undefined?getSellerReadiness(db,head.sellerId,now):Promise.resolve({newOrders:orderingAllowed})
 ]);
 const matrix=JSON.parse(head.matrix) as OfferMatrix,allowedMedia=new Set(media.results.map(row=>row.id));
 const offers=current.results.map(row=>{
  const offer=JSON.parse(row.offer) as OfferDraft,sellerBasePaisa=offerMoney(offer.price),compare=offerMoney(offer.compareAt);
  if(offer.id!==row.id||!offer.included||sellerBasePaisa===null)throw new Error('The published offer needs source reconciliation.');
  const selection=matrix.axes.map(axis=>{const value=axis.values.find(value=>value.id===offer.selection[axis.id]);if(!value)throw new Error('The published option identity is unavailable.');return {axisId:axis.id,valueId:value.id,name:axis.label,value:value.label};});
  const pricing=pricingApproved?priceApprovedVariant(sellerBasePaisa,Number(head.returnEligible)===1):null;
  const pricePaisa=pricing?.customerUnitPaisa??sellerBasePaisa;
  // The review supports the recorded price pair. Savings depend on the customer price.
  const proof=proofs.results.find(proof=>proof.offerId===row.id),preview=publicPricePreview({offerId:row.id,versionId:head.versionId,physicalIdentity:physicalOfferIdentity(offer),sellingPaisa:sellerBasePaisa,compareAtPaisa:compare,reference:proof?{...proof,versionId:head.versionId,approved:proof.decision==='approved'}:null});
  const compareAtPricePaisa=preview.compareAtPaisa!==null&&preview.compareAtPaisa>pricePaisa?preview.compareAtPaisa:null;
  const eligible=Boolean(head.eligible)&&readiness.newOrders&&!offer.browseOnly&&row.paused===0&&row.reconfirm===0&&row.confirmedAt!==null,available=row.available??0,orderable=eligible&&available>0;
  return {id:row.id,versionId:head.versionId,sku:row.sku,selection,pricePaisa,compareAtPricePaisa,...(pricing?{pricingRuleVersion:pricing.ruleVersion}:{}),mediaId:offer.mediaId&&allowedMedia.has(offer.mediaId)?offer.mediaId:media.results[0]?.id??null,available,orderable,availability:orderable?'available':eligible?'out_of_stock':'unavailable_to_order',baseUnit:offer.baseUnit,unitsPerOffer:Number(offer.unitsPerOffer)} satisfies PublicOffer;
 });
 // A concurrent publication/withdrawal cannot pair an old product with a new offer/media set.
 const pricingGuard=pricingApproved?'AND p.return_eligible=?':'';
 if(!await db.prepare(`SELECT 1 FROM products p JOIN product_offer_heads h ON h.product_id=p.id LEFT JOIN product_publication_heads pub ON pub.product_id=p.id WHERE p.id=? AND h.current_version_id=? AND COALESCE(pub.current_version_id,'')=? ${pricingGuard} AND ${publicProductVisibility('p',now)}`).bind(productId,head.versionId,head.publicVersionId??'',...(pricingApproved?[head.returnEligible]:[])).first())return null;
 const axes=matrix.axes.map(axis=>({...axis,values:axis.values.filter(value=>offers.some(offer=>offer.selection.some(selected=>selected.axisId===axis.id&&selected.valueId===value.id)))}));
 const rawDetails=head.publicJson?JSON.parse(head.publicJson).details??{}:{},privateFields=new Set(['inventoryQuantity','price','compareAtPrice','coverImage','occasionIds','sellerSku','originEvidenceReference','licenceReference']);
 const details=Object.fromEntries([...productDetailKeys].filter(key=>!privateFields.has(key)).flatMap(key=>typeof rawDetails[key]==='string'||Array.isArray(rawDetails[key])&&rawDetails[key].every((value:unknown)=>typeof value==='string')?[[key,rawDetails[key]]]:[])) as ProductDetailAnswers;
 return {productId,publicVersionId:head.publicVersionId,versionId:head.versionId,details,axes,offers,orderable:offers.some(offer=>offer.orderable),display:summarizePublicOffers(offers)};
}

export interface PublicOfferProductFields {offerSet?:PublicOfferSet|null;priceFrom?:boolean;maximumPricePaisa?:number|null;}
export interface PublicOfferQueryFields {offerMapped?:number;sourcePublicVersionId?:string|null;sourceOrderingAllowed?:number;}
export function publicOfferQueryColumns(query:Awaited<ReturnType<typeof import('./public-catalogue-query').publicCatalogueQuery>>,product='products'){
 if(!/^[a-z_]+$/.test(product))throw new Error('Invalid public source alias.');
 return `CASE WHEN ${query.mapped(product)} THEN 1 ELSE 0 END AS offerMapped,
 (SELECT current_version_id FROM product_publication_heads WHERE product_id=${product}.id) AS sourcePublicVersionId,
 CASE WHEN ${query.orderingAllowed(product)} THEN 1 ELSE 0 END AS sourceOrderingAllowed`;
}
export async function attachPublicOfferRows<T extends {id:string;pricePaisa:number|null;purchasable?:boolean|number;inventoryQuantity?:number;compareAtPricePaisa?:number|null}&PublicOfferQueryFields>(db:D1Database,rows:readonly T[],now:number){
 const projected=await Promise.all(rows.map(async row=>{
  const {offerMapped,sourcePublicVersionId,sourceOrderingAllowed,...publicRow}=row;
  const offerSet=offerMapped?await getPublicOfferSet(db,row.id,now,sourcePublicVersionId,Boolean(sourceOrderingAllowed)):null;
  if(offerMapped&&!offerSet)return null;
  return {...publicRow,purchasable:offerSet?offerSet.orderable:Number(row.purchasable)===1,
   ...(offerSet?{offerSet,pricePaisa:offerSet.display.pricePaisa,compareAtPricePaisa:offerSet.display.compareAtPricePaisa,priceFrom:offerSet.display.from,maximumPricePaisa:offerSet.display.maximumPricePaisa,inventoryQuantity:offerSet.offers.filter(offer=>offer.orderable).reduce((total,offer)=>total+offer.available,0)}:{offerSet:null,priceFrom:false,maximumPricePaisa:row.pricePaisa})};
 }));return projected.filter((row):row is NonNullable<typeof row>=>row!==null);
}
