import type {CommandContext} from '../workflows/contracts';
import {sellerOrderReadinessGuards} from '../sellers/order-readiness-guards';
import {publicProductEligibility} from './eligibility';
import {offerMoney,physicalOfferIdentity,type OfferDraft} from './offer-contracts';
import {priceApprovedVariant,variantPricingEnabled,variantPricingPublishedOfferSql} from './variant-pricing';
import {offerAuthority,offerGuard,offerReason,executeOfferCommand,OfferError} from './offer-support';

/** Comparable public condition and pack facts; never private workspace answers. */
export function priceOfferScope(details:Record<string,unknown>){return JSON.stringify(Object.fromEntries(['condition','unitContents','packQuantity'].map(key=>[key,typeof details[key]==='string'?details[key]:''])));}
export interface OrderablePriceObservation {id:string;offerId:string;offerVersionId:string;publicVersionId:string;physicalIdentity:string;scope:string;sellingPaisa:number;currency:'NPR';observedAt:number;}
/** Caller must retain and commit its current independent review read guards. */
export async function orderablePriceObservations(db:D1Database,productId:string,sellerId:string){
 return (await db.prepare('SELECT id,offer_id AS offerId,offer_version_id AS offerVersionId,public_version_id AS publicVersionId,physical_json AS physicalIdentity,scope_json AS scope,selling_paisa AS sellingPaisa,currency,observed_at AS observedAt FROM product_orderable_price_observations WHERE product_id=? AND seller_id=? ORDER BY observed_at DESC,id DESC').bind(productId,sellerId).all<OrderablePriceObservation>()).results;
}
/** Explicit observation of current orderability, never a reconstructed continuous period. */
export async function captureOrderablePriceObservation(db:D1Database,ctx:CommandContext,input:{productId:string;offerId:string;publicVersionId:string;caseId:string;versionId:string;expectedCaseRevision:string;reason:string}){
 const authority=await offerAuthority(db,ctx.actorId,input.productId,true),reason=offerReason(input.reason);
 return executeOfferCommand(db,ctx,'observe_orderable_price',input.productId,input,async()=>{
  const reviewSource='EXISTS(SELECT 1 FROM product_publication_candidates pc JOIN product_intake_cases ic ON ic.id=pc.case_id JOIN product_publication_heads ph ON ph.product_id=pc.product_id WHERE pc.product_id=? AND pc.id=? AND pc.case_id=? AND ic.revision=? AND (ph.current_version_id=pc.id OR ph.pending_version_id=pc.id))',reviewValues=[input.productId,input.versionId,input.caseId,input.expectedCaseRevision];
  if(!await db.prepare('SELECT 1 WHERE '+reviewSource).bind(...reviewValues).first())throw new OfferError('Compare the exact current review case before retaining its observation.');
  const pricingSource=variantPricingEnabled(db)?variantPricingPublishedOfferSql('p.id','c.version_id'):'0';
  const source=await db.prepare(`SELECT p.seller_id AS sellerId,h.revision,h.current_version_id AS offerVersionId,ph.current_version_id AS publicVersionId,ph.current_publication_id AS publicationId,d.public_json AS publicJson,c.offer_json AS offerJson,s.revision AS stockRevision,s.available,s.confirmed_at AS confirmedAt,
   p.return_eligible AS returnEligible,CASE WHEN ${pricingSource} THEN 1 ELSE 0 END AS pricingApproved
   FROM products p JOIN product_offer_heads h ON h.product_id=p.id JOIN product_offer_current c ON c.product_id=p.id AND c.version_id=h.current_version_id
   JOIN product_publication_heads ph ON ph.product_id=p.id JOIN product_publication_decisions d ON d.id=ph.current_publication_id
   JOIN product_publication_candidates pc ON pc.id=ph.current_version_id AND pc.offer_version_id=c.version_id
   JOIN offer_stock s ON s.offer_id=c.offer_id WHERE p.id=? AND c.offer_id=? AND d.ordering_facts_ready=1 AND s.available>0 AND s.paused=0 AND s.needs_reconfirmation=0 AND s.confirmed_at IS NOT NULL AND ${publicProductEligibility('p',ctx.now)}`)
   .bind(input.productId,input.offerId).first<{sellerId:string;revision:number;offerVersionId:string;publicVersionId:string;publicationId:string;publicJson:string;offerJson:string;stockRevision:number;available:number;confirmedAt:number;returnEligible:number;pricingApproved:number}>();
  if(!source||String(source.revision)!==ctx.expectedRevision||source.publicVersionId!==input.publicVersionId)throw new OfferError('Compare the exact current orderable public offer and confirmed available stock.');
  const row=JSON.parse(source.offerJson) as OfferDraft,basePrice=offerMoney(row.price),published=JSON.parse(source.publicJson),scope=priceOfferScope(published.details??{});
  if(row.id!==input.offerId||!row.included||row.browseOnly||basePrice===null||!published.details?.condition)throw new OfferError('This public offer is not genuinely orderable with a known condition.');
  const pricingApproved=Number(source.pricingApproved)===1;
  const price=pricingApproved?priceApprovedVariant(basePrice,Number(source.returnEligible)===1).customerUnitPaisa:basePrice;
  const pricingGuard=pricingApproved?'AND p.return_eligible=?':'';
  const readiness=await sellerOrderReadinessGuards(db,source.sellerId,ctx.now);
  const predicate=`EXISTS(SELECT 1 FROM products p JOIN product_offer_heads h ON h.product_id=p.id JOIN product_offer_current c ON c.product_id=p.id AND c.version_id=h.current_version_id JOIN product_publication_heads ph ON ph.product_id=p.id JOIN product_publication_decisions d ON d.id=ph.current_publication_id JOIN product_publication_candidates pc ON pc.id=ph.current_version_id AND pc.offer_version_id=c.version_id JOIN offer_stock s ON s.offer_id=c.offer_id WHERE p.id=? AND p.seller_id=? AND h.revision=? AND c.offer_id=? AND c.version_id=? AND c.offer_json=? AND ph.current_version_id=? AND ph.current_publication_id=? AND d.public_json=? AND d.ordering_facts_ready=1 AND s.revision=? AND s.available=? AND s.available>0 AND s.paused=0 AND s.needs_reconfirmation=0 AND s.confirmed_at=? ${pricingGuard} AND ${publicProductEligibility('p',ctx.now)})`;
  const values=[input.productId,source.sellerId,source.revision,input.offerId,source.offerVersionId,source.offerJson,source.publicVersionId,source.publicationId,source.publicJson,source.stockRevision,source.available,source.confirmedAt,...(pricingApproved?[source.returnEligible]:[])],id=crypto.randomUUID();
  return {result:{id,observedAt:ctx.now,caseId:input.caseId},statements:[...authority,...readiness,...offerGuard(db,reviewSource,reviewValues),...offerGuard(db,predicate,values),db.prepare("INSERT INTO product_orderable_price_observations(id,product_id,seller_id,offer_id,offer_version_id,public_version_id,publication_id,physical_json,scope_json,selling_paisa,currency,observed_at,actor_id,reason) VALUES(?,?,?,?,?,?,?,?,?,?,'NPR',?,?,?)").bind(id,input.productId,source.sellerId,input.offerId,source.offerVersionId,source.publicVersionId,source.publicationId,physicalOfferIdentity(row),scope,price,ctx.now,ctx.actorId,reason)]};
 });
}
