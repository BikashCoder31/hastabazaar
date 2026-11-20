import type {CommandContext} from '../workflows/contracts';
import type {VariantOrderPricingSnapshot} from '../checkout/variant-order-pricing';
import {OriginalBuyerPricingReconciliationError, originalBuyerPricingMarkerSql, readOriginalBuyerPricingTerms} from '../db/repositories/order-item-pricing-snapshots';
import {offerAuthority,offerGuard,executeOfferCommand,OfferError,offerReason} from './offer-support';
import {offerHead} from './offers';
import {offerMoney,physicalOfferIdentity,validateOfferMatrix} from './offer-contracts';
import {priceOfferScope} from './orderable-price-history';

export interface PriceReferenceEvidence{kind:'historical_order'|'external_offer'|'review_finding'|'platform_orderable';reference:string;sellerId:string;offerId:string;physicalIdentity:string;originalPaisa:number;offeredFrom:number|null;offeredTo:number|null;checkedSameSellerOffer:boolean;checkedPriceHistory?:boolean;historyBasis?:string;historyThroughId?:string;historyCount?:number}

async function historicalOrderPriceGuards(db:D1Database,productId:string,evidence:PriceReferenceEvidence){
 const source=`FROM order_item_offer_snapshots sn
   JOIN order_items i ON i.id=sn.order_item_id JOIN orders o ON o.id=i.order_id
   LEFT JOIN order_policy_acceptances p ON p.order_id=o.id
   WHERE i.id=? AND sn.offer_id=? AND sn.legacy_mapping=0 AND i.product_id=? AND i.seller_id=?
   AND o.status='delivered' AND o.created_at>=? AND o.created_at<=?`;
 const sourceValues=[evidence.reference,evidence.offerId,productId,evidence.sellerId,evidence.offeredFrom,evidence.offeredTo];
 const historical=await db.prepare(`SELECT o.id AS orderId,i.unit_price_paisa AS sellerBasePaisa,i.quantity,
   sn.version_id AS offerVersionId,sn.snapshot_json AS offerJson,p.terms_snapshot_json AS termsJson,
   ${originalBuyerPricingMarkerSql(db,'p.terms_snapshot_json')} AS nativeVersion ${source}`)
  .bind(...sourceValues).first<{orderId:string;sellerBasePaisa:number;quantity:number;offerVersionId:string;offerJson:string;termsJson:string|null;nativeVersion:unknown}>();
 const mismatch=()=>new OfferError('This historical reference does not prove the same genuine offer at that former selling price.');
 if(!historical)throw mismatch();

 let acceptedPricing:ReturnType<typeof readOriginalBuyerPricingTerms>;
 try {
  acceptedPricing=readOriginalBuyerPricingTerms(historical.termsJson,historical.nativeVersion);
 } catch (error) {
  if(error instanceof OriginalBuyerPricingReconciliationError)throw mismatch();
  throw error;
 }
 const {accepted:terms,version:orderRule}=acceptedPricing;
 const maria=(db as D1Database&{dialect?:string}).dialect==='mariadb';
 const jsonEquals=(column:string)=>maria?`CAST(${column} AS BINARY)=CAST(? AS BINARY)`:`${column}=?`;
 const hasTerms=historical.termsJson!==null;
 const termsGuard=hasTerms?jsonEquals('p.terms_snapshot_json'):'p.terms_snapshot_json IS NULL';
 const guardedValues=[...sourceValues,historical.orderId,...(hasTerms?[historical.termsJson]:[])];
 const sellerBasePaisa=Number(historical.sellerBasePaisa);
 let priceGuard='i.unit_price_paisa=?';
 const priceValues:(string|number)[]=[sellerBasePaisa];
 let purchasedPrice=sellerBasePaisa;
 if(orderRule!==null){
  // An order can also contain unpriced offers. Use its retained exact reviewed line.
  const {publicVersionId=null}=JSON.parse(historical.offerJson) as {publicVersionId?:string|null};
  const lines=terms?.reviewedQuote?.lines;
  const line=Array.isArray(lines)?lines.find(row=>row?.offerId===evidence.offerId&&row.offerVersionId===historical.offerVersionId&&row.publicVersionId===publicVersionId&&row.sellerId===evidence.sellerId&&row.quantity===Number(historical.quantity)):undefined;
  if(!line)throw mismatch();
  if(line.pricingRuleVersion!==undefined){
   if(line.pricingRuleVersion!==orderRule)throw mismatch();
   const row=await db.prepare('SELECT snapshot_json AS json FROM order_item_pricing_snapshots WHERE order_id=? AND order_item_id=?')
    .bind(historical.orderId,evidence.reference).first<{json:string}>();
   if(!row)throw mismatch();
   const saved=JSON.parse(row.json) as VariantOrderPricingSnapshot;
   if(saved.ruleVersion!==orderRule||saved.offerId!==evidence.offerId||saved.offerVersionId!==historical.offerVersionId||
      saved.publicVersionId!==publicVersionId||saved.sellerBasePaisa!==sellerBasePaisa||saved.quantity!==Number(historical.quantity)||
      saved.customerUnitPaisa!==line.pricePaisa||!Number.isSafeInteger(saved.customerUnitPaisa))throw mismatch();
   purchasedPrice=saved.customerUnitPaisa;
   priceGuard+=` AND EXISTS(SELECT 1 FROM order_item_pricing_snapshots saved WHERE saved.order_id=o.id AND saved.order_item_id=i.id AND ${jsonEquals('saved.snapshot_json')})`;
   priceValues.push(row.json);
  }else if(line.pricePaisa!==sellerBasePaisa)throw mismatch();
 }
 if(purchasedPrice!==evidence.originalPaisa)throw mismatch();
 return offerGuard(db,`EXISTS(SELECT 1 ${source} AND o.id=? AND ${termsGuard} AND ${priceGuard})`,[...guardedValues,...priceValues]);
}

export async function reviewPriceReference(db:D1Database,ctx:CommandContext,input:{productId:string;versionId:string;offerId:string;decision:'approved'|'suppressed';evidence:PriceReferenceEvidence;reason:string}){
 const authority=await offerAuthority(db,ctx.actorId,input.productId,true),reason=offerReason(input.reason);
 return executeOfferCommand(db,ctx,'review_price_reference',input.productId,input,async()=>{
  const head=await offerHead(db,input.productId);if(!head||String(head.revision)!==ctx.expectedRevision||head.candidateVersionId!==input.versionId&&head.currentVersionId!==input.versionId)throw new OfferError('Review the exact current candidate or published commercial version.');
  const coherent="NOT EXISTS(SELECT 1 FROM product_publication_heads WHERE product_id=?) OR EXISTS(SELECT 1 FROM product_publication_heads h JOIN product_publication_candidates c ON c.product_id=h.product_id WHERE h.product_id=? AND c.offer_version_id=? AND (c.id=h.pending_version_id OR c.id=h.current_version_id))",coherentValues=[input.productId,input.productId,input.versionId];
  if(!await db.prepare(`SELECT 1 WHERE ${coherent}`).bind(...coherentValues).first())throw new OfferError('The complete product candidate was replaced. Review its current submitted or published version.');
  const source=await db.prepare('SELECT v.matrix_json AS matrix,p.seller_id AS seller FROM product_offer_versions v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.product_id=?').bind(input.versionId,input.productId).first<{matrix:string;seller:string}>();if(!source)throw new OfferError('The exact candidate is unavailable.');
  const row=validateOfferMatrix(JSON.parse(source.matrix)).matrix.offers.find(offer=>offer.id===input.offerId&&offer.included),price=row?offerMoney(row.price):null,compare=row?offerMoney(row.compareAt):null,e=input.evidence;
  if(!row||price===null||compare===null||compare<=price||!['approved','suppressed'].includes(input.decision))throw new OfferError('Only a valid exact selling/original price pair can be reviewed.',400);
  const dated=e&&['historical_order','external_offer','platform_orderable'].includes(e.kind)&&e.checkedSameSellerOffer===true&&typeof e.offeredFrom==='number'&&typeof e.offeredTo==='number'&&Number.isSafeInteger(e.offeredFrom)&&Number.isSafeInteger(e.offeredTo)&&e.offeredFrom>=0&&e.offeredTo>=e.offeredFrom&&e.offeredTo<=ctx.now;
  const finding=e&&input.decision==='suppressed'&&e.kind==='review_finding'&&e.checkedSameSellerOffer===false&&e.offeredFrom===null&&e.offeredTo===null;
  if(!e||!dated&&!finding||typeof e.reference!=='string'||e.reference.trim().length<4||e.reference.length>1000||e.sellerId!==source.seller||e.offerId!==row.id||e.physicalIdentity!==physicalOfferIdentity(row)||e.originalPaisa!==compare)throw new OfferError('Approval needs dated evidence for this seller, exact physical offer and genuine former selling price. Unsupported claims can instead record an explicit suppression finding.',400);
  const proofStatements:D1PreparedStatement[]=[...offerGuard(db,coherent,coherentValues)];
  if(e.kind==='platform_orderable'){
   if(e.checkedPriceHistory!==true||typeof e.historyBasis!=='string'||e.historyBasis.trim().length<10||e.historyBasis.length>1000||typeof e.historyThroughId!=='string'||!Number.isSafeInteger(e.historyCount)||e.historyCount!<1)throw new OfferError('Review the observed chronology, intervening prices, condition and any temporary inflation; record why this reference remains relevant.',400);
   const candidate=await db.prepare('SELECT w.snapshot_json AS snapshot FROM product_publication_candidates c JOIN product_intake_workspace_versions w ON w.id=c.workspace_version_id WHERE c.product_id=? AND c.offer_version_id=?').bind(input.productId,input.versionId).first<{snapshot:string}>();
   if(!candidate)throw new OfferError('Native price history requires the exact complete product candidate.');
   const scope=priceOfferScope(JSON.parse(candidate.snapshot).answers??{}),predicate="EXISTS(SELECT 1 FROM product_orderable_price_observations o WHERE o.id=? AND o.product_id=? AND o.seller_id=? AND o.offer_id=? AND o.physical_json=? AND o.scope_json=? AND o.currency='NPR' AND o.selling_paisa=? AND o.observed_at=? AND o.observed_at=?) AND (SELECT id FROM product_orderable_price_observations WHERE product_id=? AND seller_id=? AND offer_id=? ORDER BY observed_at DESC,id DESC LIMIT 1)=? AND (SELECT COUNT(*) FROM product_orderable_price_observations WHERE product_id=? AND seller_id=? AND offer_id=?)=?",values=[e.reference,input.productId,source.seller,row.id,e.physicalIdentity,scope,compare,e.offeredFrom,e.offeredTo,input.productId,source.seller,row.id,e.historyThroughId,input.productId,source.seller,row.id,e.historyCount];
   if(!await db.prepare(`SELECT 1 WHERE ${predicate}`).bind(...values).first())throw new OfferError('This observation does not prove the exact seller, condition, physical offer, original price and observed time, or its reviewed chronology changed.');
   proofStatements.push(...offerGuard(db,predicate,values));
  }
  if(e.kind==='historical_order')proofStatements.push(...await historicalOrderPriceGuards(db,input.productId,e));
  const id=crypto.randomUUID(),revision=head.revision+1;
  if(input.decision==='suppressed')proofStatements.push(db.prepare('UPDATE product_discount_cycles SET visible_since=NULL,revision=revision+1 WHERE product_id=? AND offer_id=? AND version_id=?').bind(input.productId,input.offerId,input.versionId));
  return {result:{id,revision,approved:input.decision==='approved'},statements:[...authority,...proofStatements,...offerGuard(db,'EXISTS(SELECT 1 FROM product_offer_heads h JOIN products p ON p.id=h.product_id WHERE h.product_id=? AND h.revision=? AND (h.candidate_version_id=? OR h.current_version_id=?) AND p.seller_id=?)',[input.productId,head.revision,input.versionId,input.versionId,source.seller]),db.prepare('INSERT INTO product_price_reference_reviews(id,product_id,seller_id,offer_id,version_id,review_revision,physical_json,selling_paisa,compare_paisa,decision,evidence_kind,evidence_reference,offered_from,offered_to,reason,actor_id,created_at,history_basis) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,input.productId,source.seller,row.id,input.versionId,revision,e.physicalIdentity,price,compare,input.decision,e.kind,e.reference.trim(),e.offeredFrom,e.offeredTo,reason,ctx.actorId,ctx.now,e.kind==='platform_orderable'?e.historyBasis!.trim():null),db.prepare('UPDATE product_offer_heads SET revision=?,updated_at=? WHERE product_id=?').bind(revision,ctx.now,input.productId)]};
 });
}
export async function approvedPriceReference(db:D1Database,productId:string,versionId:string,offerId:string){
 const row=await db.prepare('SELECT r.id,r.decision,r.selling_paisa AS sellingPaisa,r.compare_paisa AS comparePaisa,r.physical_json AS physicalIdentity FROM product_price_reference_reviews r JOIN products p ON p.id=r.product_id AND p.seller_id=r.seller_id WHERE r.product_id=? AND r.version_id=? AND r.offer_id=? ORDER BY r.review_revision DESC LIMIT 1').bind(productId,versionId,offerId).first<{id:string;decision:string;sellingPaisa:number;comparePaisa:number;physicalIdentity:string}>();return row?.decision==='approved'?row:null;
}
