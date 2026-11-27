import {getCommissionSetting} from '../db/repositories/marketplace-settings';
import {CommissionRateUnavailableError} from '../db/repositories/business-settings';
import {getCommissionCheckoutAcceptance} from '../db/repositories/commission-rates';
import {consentPredicate,currentCommissionConsentPredicate,CONTINUITY_END} from '../db/repositories/commission-continuity-proof';
import {verifiedIdentitySql,noProtectedHoldSql} from '../sellers/protected-change-policy';
import {getSellerReadiness} from '../sellers/readiness';
import {managedMakerCapabilities} from '../configuration/capabilities';
import {publicProductEligibility} from './eligibility';
import {variantCustomerUnitPriceSql,variantPricingEnabled,variantPricingPublishedOfferSql} from './variant-pricing';

function alias(value:string){if(!/^[a-z_]+$/.test(value))throw new Error('Invalid public query alias.');return value;}
/** Only source identities/preimages become these literals, never display/search text.
 * Binary native bytes preserve exact source matching without imposing a text collation. */
export function catalogueSourceLiteral(db:D1Database,value:unknown):string{
 if(value===null||value===undefined)return 'NULL';if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);
 if(typeof value!=='string')throw new Error('Unsupported public-query source value.');
 const hex=Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('');
 return `CAST(X'${hex}' AS ${(db as D1Database&{dialect?:string}).dialect==='mariadb'?'BINARY':'TEXT'})`;
}
const literal=catalogueSourceLiteral;
function bindSource(db:D1Database,source:{sql:string;values:unknown[]}){let index=0;const sql=source.sql.replace(/\?/g,()=>literal(db,source.values[index++]));if(index!==source.values.length)throw new Error('Public source binding mismatch.');return sql;}
/** Current offer stock rules without loading marketplace-wide seller readiness. */
export function publicCatalogueInventory(db:D1Database){
 const maria=(db as D1Database&{dialect?:string}).dialect==='mariadb';
 const value=(key:string)=>maria?`JSON_UNQUOTE(JSON_EXTRACT(display_offer.offer_json,'$.${key}'))`:`json_extract(display_offer.offer_json,'$.${key}')`;
 const offerPrice=`CAST(ROUND(CAST(${value('price')} AS DECIMAL(20,2))*100,0) AS ${maria?'SIGNED':'INTEGER'})`;
 const source=(p:string)=>`FROM product_offer_current display_offer JOIN product_offer_heads display_head ON display_head.product_id=display_offer.product_id AND display_head.current_version_id=display_offer.version_id LEFT JOIN offer_stock display_stock ON display_stock.offer_id=display_offer.offer_id WHERE display_offer.product_id=${alias(p)}.id`;
 const stockCondition=`display_stock.available>0 AND display_stock.paused=0 AND display_stock.needs_reconfirmation=0 AND display_stock.confirmed_at IS NOT NULL AND ${value('browseOnly')}=${maria?"'false'":'0'}`;
 const mapped=(p='products')=>`EXISTS(SELECT 1 FROM product_offer_heads mapped WHERE mapped.product_id=${alias(p)}.id AND mapped.inventory_mapped=1)`;
 const stock=(p='products')=>`CASE WHEN ${mapped(p)} THEN COALESCE((SELECT SUM(display_stock.available) ${source(p)} AND ${stockCondition}),0) ELSE ${p}.inventory_quantity END`;
 return {offerPrice,source,stockCondition,mapped,stock};
}

/** Parse the validated decimal string as integer digits, including near the safe integer limit. */
function exactOfferSellingPaisaSql(offerJsonSql:string,dialect:'sqlite'|'mariadb'){
 const price=dialect==='mariadb'?`JSON_UNQUOTE(JSON_EXTRACT(${offerJsonSql},'$.price'))`:`json_extract(${offerJsonSql},'$.price')`;
 const padded=dialect==='mariadb'?`CONCAT(${price},'00')`:`(${price}||'00')`;
 const decimalPoint=`INSTR(${price},'.')`;
 const digits=`CASE WHEN ${decimalPoint}=0 THEN ${padded} ELSE REPLACE(SUBSTR(${padded},1,${decimalPoint}+2),'.','') END`;
 return `CAST(${digits} AS ${dialect==='mariadb'?'SIGNED':'INTEGER'})`;
}

/** Request-scoped source context: price filters/sort and presentation use the same eligible offer set. */
export async function publicCatalogueQuery(db:D1Database,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw new Error('Invalid catalogue observation time.');
 const setting=await getCommissionSetting(db,now).catch(error=>{if(error instanceof CommissionRateUnavailableError)return null;throw error;});
 const registered:string[]=[];
 if(setting?.versionId){
  registered.push(bindSource(db,currentCommissionConsentPredicate(setting,now,'ready_seller.id')));
  if(setting.basisPoints===900&&now<CONTINUITY_END){
   const rows=await db.prepare('SELECT seller_id AS id FROM commission_continuity_sellers WHERE setting_id=?').bind(setting.versionId).all<{id:string}>();
   for(const row of rows.results){const proof=await getCommissionCheckoutAcceptance(db,row.id,setting,now);if(proof?.kind==='preserved_legacy')registered.push(`(ready_seller.id=${literal(db,row.id)} AND ${bindSource(db,consentPredicate(row.id,setting,now,proof))})`);}
  }
 }
 const supplements=setting?`COALESCE((SELECT CASE WHEN a.accepted_at IS NULL THEN 0 ELSE 1 END FROM commission_rate_changes r
 LEFT JOIN commission_rate_acceptances a ON a.rate_id=r.id AND a.seller_id=ready_seller.id AND a.actor_id=ready_seller.user_id AND a.accepted_at<=${now}
 LEFT JOIN commission_rate_cancellations c ON c.rate_id=r.id WHERE c.rate_id IS NULL AND r.effective_at<=${now} AND r.effective_at>${setting.effectiveFrom??0}
 ORDER BY r.effective_at DESC,r.created_at DESC,r.id DESC LIMIT 1),1)=1`:'0';
 const liveModels=managedMakerCapabilities.filter(model=>model.selectableForLiveActivation).map(model=>model.code),managed:string[]=[];
 if(liveModels.length){const candidates=await db.prepare(`SELECT seller_id AS id FROM seller_participation_profiles WHERE participation_route='managed_maker' AND application_stage='active' AND commercial_model IN (${liveModels.map(()=>'?').join(',')})`).bind(...liveModels).all<{id:string}>();for(const row of candidates.results)if((await getSellerReadiness(db,row.id,now)).newOrders)managed.push(literal(db,row.id));}
 const withClause=`WITH public_ready_sellers AS (SELECT ready_seller.id FROM seller_profiles ready_seller JOIN users ready_owner ON ready_owner.id=ready_seller.user_id
 JOIN seller_protected_revisions ready_revision ON ready_revision.seller_id=ready_seller.id JOIN seller_public_profile_states ready_profile ON ready_profile.seller_id=ready_seller.id
 LEFT JOIN seller_participation_profiles ready_route ON ready_route.seller_id=ready_seller.id
 WHERE ready_owner.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=ready_owner.id AND role IN ('customer','seller'))
 AND ${noProtectedHoldSql('ready_seller.id','new_orders')}
 AND NOT EXISTS(SELECT 1 FROM seller_restrictions r WHERE r.seller_id=ready_seller.id AND (r.mode='disabled' OR r.mode='suspended' AND r.suspended_until>${now}))
 AND ((COALESCE(ready_route.participation_route,'registered_seller')='registered_seller' AND ready_seller.status='approved' AND ${setting?.versionId?`${literal(db,setting.versionId)}=(SELECT id FROM business_setting_versions WHERE setting_key='independent_seller_commission_bps' AND status='published' AND effective_from<=${now} AND (effective_until IS NULL OR effective_until>${now}) ORDER BY effective_from DESC,version DESC,id DESC LIMIT 1)`:'0'} AND (${registered.join(' OR ')||'0'}) AND ${supplements})
 OR (${managed.length?`(ready_seller.id IN (${managed.join(',')}) AND ${verifiedIdentitySql('ready_seller.id',now)})`:'0'})))`;
 const {offerPrice,source,stockCondition,mapped,stock}=publicCatalogueInventory(db);
 const pricingEnabled=await variantPricingEnabled(db);
 const dialect=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'mariadb':'sqlite';
 const exactOfferPrice=pricingEnabled?exactOfferSellingPaisaSql('display_offer.offer_json',dialect):null;
 const orderable=(p:string)=>`(${publicProductEligibility(alias(p),now)}) AND EXISTS(SELECT 1 FROM public_ready_sellers WHERE id=${p}.seller_id)`;
 const available=(p:string)=>`(${orderable(p)} AND EXISTS(SELECT 1 ${source(p)} AND ${stockCondition}))`;
 // Ordering eligibility depends on the product, so evaluate it outside the
 // offer subquery to stay within D1's expression depth limit.
 const price=(p='products')=>{
  const product=alias(p);
  const displayedOfferPrice=exactOfferPrice===null?offerPrice:`CASE WHEN ${variantPricingPublishedOfferSql(`${product}.id`,'display_offer.version_id')}
   THEN ${variantCustomerUnitPriceSql(exactOfferPrice,`${product}.return_eligible`,dialect)} ELSE ${offerPrice} END`;
  return `CASE WHEN ${mapped(product)} THEN COALESCE(
 CASE WHEN ${orderable(product)} THEN (SELECT MIN(${displayedOfferPrice}) ${source(product)} AND ${stockCondition}) END,
 (SELECT MIN(${displayedOfferPrice}) ${source(product)})) ELSE ${product}.price_paisa END`;
 };
 const purchasable=(p='products')=>`CASE WHEN ${mapped(p)} THEN ${available(p)} ELSE ${orderable(p)} END`;
 return {now,withClause,price,stock,purchasable,mapped,orderingAllowed:orderable};
}
