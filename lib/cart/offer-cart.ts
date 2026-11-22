import type {CartItemRow} from '../db/repositories/cart';
import {getPublicOfferSet,type PublicOffer} from '../products/public-offers';
import {publicProductEligibility,publicProductVisibility} from '../products/eligibility';
import {publicSellingIdentityColumns,type PublicSellingIdentity} from '../products/selling-identity';
import {publicProfileFieldSql} from '../sellers/public-profile-sql';
import {sellerOrderReadinessGuards} from '../sellers/order-readiness-guards';
import {CartConflictError,MAX_CART_LINES,MAX_ITEM_QUANTITY,cartGuard,getOrCreateCart,findCart,writeCart} from './storage';

export type CartSelectedOffer=Pick<PublicOffer,'id'|'versionId'|'sku'|'selection'|'pricePaisa'|'compareAtPricePaisa'|'mediaId'|'baseUnit'|'unitsPerOffer'|'pricingRuleVersion'>;
export interface OfferCartChoice {productId:string;offerId:string;versionId:string;publicVersionId:string|null;pricePaisa:number;quantity:number;requestId:string;}
interface Snapshot extends Partial<PublicSellingIdentity>{nameEn:string;nameNe:string|null;slug:string;sellerId:string;tradingName:string;preparationDays:number;offer:CartSelectedOffer;}
interface Line {id:string;productId:string;offerId:string;versionId:string;publicVersionId:string|null;quantity:number;revision:number;snapshotJson:string;createdAt:number;}
const columns='id,product_id AS productId,offer_id AS offerId,version_id AS versionId,public_version_id AS publicVersionId,quantity,revision,snapshot_json AS snapshotJson,created_at AS createdAt';
function textId(value:unknown){return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);}
function quantity(value:number){if(!Number.isSafeInteger(value)||value<1||value>MAX_ITEM_QUANTITY)throw new CartConflictError(`Choose a quantity from 1 to ${MAX_ITEM_QUANTITY}.`);}
function requestId(value:string){if(!textId(value)||value.length<16)throw new CartConflictError('Use the exact cart request reference.');}
async function receipt(db:D1Database,cartId:string,id:string,payload:string){const row=await db.prepare('SELECT payload_json AS payload FROM cart_offer_commands WHERE cart_id=? AND request_id=?').bind(cartId,id).first<{payload:string}>();if(row&&row.payload!==payload)throw new CartConflictError('This request reference belongs to a different cart action.');return Boolean(row);}
async function commit(db:D1Database,cartId:string,id:string,payload:string,now:number,statements:D1PreparedStatement[]){try{await writeCart(db,cartId,now,[...statements,db.prepare('INSERT INTO cart_offer_commands(cart_id,request_id,payload_json,created_at) VALUES(?,?,?,?)').bind(cartId,id,payload,now)]);}catch(error){if(await receipt(db,cartId,id,payload))return;throw error;}}

async function currentChoice(db:D1Database,input:Omit<OfferCartChoice,'requestId'|'quantity'>,now:number){
 const set=await getPublicOfferSet(db,input.productId,now),offer=set?.offers.find(row=>row.id===input.offerId);
 if(!set||!offer||!offer.orderable||set.versionId!==input.versionId||set.publicVersionId!==input.publicVersionId||offer.pricePaisa!==input.pricePaisa)throw new CartConflictError('This exact option or its price changed. Review the current options before adding it.');
 const row=await db.prepare(`SELECT ${publicSellingIdentityColumns(now)},products.name_en AS nameEn,products.name_ne AS nameNe,products.slug,products.seller_id AS sellerId,${publicProfileFieldSql('publicName')} AS tradingName,products.preparation_days AS preparationDays,c.offer_json AS offerJson FROM products JOIN seller_profiles ON seller_profiles.id=products.seller_id JOIN product_offer_current c ON c.product_id=products.id WHERE products.id=? AND c.offer_id=? AND c.version_id=? AND ${publicProductVisibility('products',now)}`).bind(input.productId,input.offerId,input.versionId).first<Omit<Snapshot,'offer'>&{offerJson:string}>();
 if(!row)throw new CartConflictError('This exact option is no longer available.');
 const {offerJson,...publicProduct}=row,{available:_,orderable:__,availability:___,...selected}=offer;
 let readiness:D1PreparedStatement[];try{readiness=await sellerOrderReadinessGuards(db,row.sellerId,now);}catch{throw new CartConflictError('This seller is not currently accepting orders for this option.');}
 const snapshot:Snapshot={...publicProduct,offer:selected};
 const guards=(required:number)=>[...readiness,...cartGuard(db,`EXISTS(SELECT 1 FROM products p WHERE p.id=? AND ${publicProductEligibility('p',now)})`,[input.productId]),...cartGuard(db,`EXISTS(SELECT 1 FROM products p JOIN product_offer_heads h ON h.product_id=p.id JOIN product_offer_current c ON c.product_id=p.id AND c.version_id=h.current_version_id JOIN offer_stock st ON st.offer_id=c.offer_id WHERE p.id=? AND c.offer_id=? AND c.version_id=? AND c.offer_json=? AND h.inventory_mapped=1 AND COALESCE((SELECT current_version_id FROM product_publication_heads WHERE product_id=p.id),'')=? AND st.paused=0 AND st.needs_reconfirmation=0 AND st.confirmed_at IS NOT NULL AND st.available>=?)`,[input.productId,input.offerId,input.versionId,offerJson,input.publicVersionId??'',required])];
 return {snapshot,guards};
}

export async function addOfferCartLine(db:D1Database,tokenHash:string,input:OfferCartChoice,now:number){
 quantity(input.quantity);requestId(input.requestId);if(!textId(input.productId)||!textId(input.offerId)||!textId(input.versionId)||(input.publicVersionId!==null&&!textId(input.publicVersionId))||!Number.isSafeInteger(input.pricePaisa)||input.pricePaisa<=0)throw new CartConflictError('Choose one actual published option and its current price.');
 const payload=JSON.stringify({action:'add',productId:input.productId,offerId:input.offerId,versionId:input.versionId,publicVersionId:input.publicVersionId,pricePaisa:input.pricePaisa,quantity:input.quantity}),cart=await getOrCreateCart(db,tokenHash,now);
 if(await receipt(db,cart.id,input.requestId,payload))return;
 const existing=await db.prepare(`SELECT ${columns} FROM cart_offer_lines WHERE cart_id=? AND offer_id=?`).bind(cart.id,input.offerId).first<Line>(),next=(existing?.quantity??0)+input.quantity;quantity(next);
 if(existing&&(existing.versionId!==input.versionId||existing.publicVersionId!==input.publicVersionId||JSON.parse(existing.snapshotJson).offer.pricePaisa!==input.pricePaisa))throw new CartConflictError('Review and update the option already saved in your cart before adding more.');
 const current=await currentChoice(db,input,now),guard=cartGuard(db,`EXISTS(SELECT 1 FROM carts WHERE id=? AND anonymous_token_hash=?) AND ${existing?'EXISTS(SELECT 1 FROM cart_offer_lines WHERE id=? AND cart_id=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM cart_offer_lines WHERE cart_id=? AND offer_id=?) AND ((SELECT COUNT(*) FROM cart_items WHERE cart_id=?)+(SELECT COUNT(*) FROM cart_offer_lines WHERE cart_id=?))<?'}`,[cart.id,tokenHash,...(existing?[existing.id,cart.id,existing.revision]:[cart.id,input.offerId,cart.id,cart.id,MAX_CART_LINES])]);
 await commit(db,cart.id,input.requestId,payload,now,[guard[0],...current.guards(next),existing?db.prepare('UPDATE cart_offer_lines SET quantity=?,revision=revision+1,updated_at=? WHERE id=? AND cart_id=? AND revision=?').bind(next,now,existing.id,cart.id,existing.revision):db.prepare('INSERT INTO cart_offer_lines(id,cart_id,product_id,offer_id,version_id,public_version_id,quantity,revision,snapshot_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,0,?,?,?)').bind(crypto.randomUUID(),cart.id,input.productId,input.offerId,input.versionId,input.publicVersionId,input.quantity,JSON.stringify(current.snapshot),now,now),...cartGuard(db,'changes()=1',[]),guard[1]]);
}

export interface UpdateOfferCartChoice {itemId:string;quantity:number;revision:number;requestId:string;refresh?:{versionId:string;publicVersionId:string|null;pricePaisa:number};}
export async function updateOfferCartLine(db:D1Database,tokenHash:string,input:UpdateOfferCartChoice,now:number){
 quantity(input.quantity);requestId(input.requestId);if(!textId(input.itemId)||!Number.isSafeInteger(input.revision)||input.revision<0)throw new CartConflictError('Review the current saved option before changing its quantity.');
 const cart=await findCart(db,tokenHash);if(!cart)throw new CartConflictError('Cart not found.');const payload=JSON.stringify({action:'update',itemId:input.itemId,quantity:input.quantity,revision:input.revision,refresh:input.refresh??null});if(await receipt(db,cart.id,input.requestId,payload))return;
 const line=await db.prepare(`SELECT ${columns} FROM cart_offer_lines WHERE id=? AND cart_id=?`).bind(input.itemId,cart.id).first<Line>();if(!line||line.revision!==input.revision)throw new CartConflictError('This cart line changed. Compare its latest quantity and option.');const previous=JSON.parse(line.snapshotJson) as Snapshot,choice={productId:line.productId,offerId:line.offerId,...(input.refresh??{versionId:line.versionId,publicVersionId:line.publicVersionId,pricePaisa:previous.offer.pricePaisa})},current=await currentChoice(db,choice,now),guard=cartGuard(db,'EXISTS(SELECT 1 FROM cart_offer_lines WHERE id=? AND cart_id=? AND revision=?)',[line.id,cart.id,line.revision]);
 await commit(db,cart.id,input.requestId,payload,now,[guard[0],...current.guards(input.quantity),db.prepare('UPDATE cart_offer_lines SET quantity=?,version_id=?,public_version_id=?,snapshot_json=?,revision=revision+1,updated_at=? WHERE id=? AND cart_id=? AND revision=?').bind(input.quantity,choice.versionId,choice.publicVersionId,JSON.stringify(current.snapshot),now,line.id,cart.id,line.revision),...cartGuard(db,'changes()=1',[]),guard[1]]);
}

export async function listOfferCartLines(db:D1Database,cartId:string,now=Date.now()):Promise<Array<CartItemRow&{createdAt:number}>>{
 const rows=await db.prepare(`SELECT ${columns} FROM cart_offer_lines WHERE cart_id=? ORDER BY created_at,id`).bind(cartId).all<Line>(),sets=new Map<string,Awaited<ReturnType<typeof getPublicOfferSet>>>();
 await Promise.all([...new Set(rows.results.map(row=>row.productId))].map(async id=>sets.set(id,await getPublicOfferSet(db,id,now))));
 return rows.results.map(line=>{
  const {offer,...product}=JSON.parse(line.snapshotJson) as Snapshot;
  const set=sets.get(line.productId),current=set?.offers.find(offer=>offer.id===line.offerId);
  const changed=Boolean(set&&current&&(set.versionId!==line.versionId||set.publicVersionId!==line.publicVersionId||current.pricePaisa!==offer.pricePaisa));
  const usable=Boolean(current?.orderable&&current.available>=line.quantity)&&!changed;
  const { pricingRuleVersion: _savedRule, ...savedOffer } = offer;
  const selectedOffer: CartSelectedOffer = {
    ...savedOffer,
    compareAtPricePaisa: current?.compareAtPricePaisa ?? null,
    ...(usable && current?.pricingRuleVersion ? { pricingRuleVersion: current.pricingRuleVersion } : {}),
  };
  return {...product,id:line.id,productId:line.productId,offerId:line.offerId,offerVersionId:line.versionId,publicVersionId:line.publicVersionId,revision:line.revision,selectedOffer,pricePaisa:offer.pricePaisa,quantity:line.quantity,inventoryQuantity:current?.orderable?current.available:0,productStatus:usable?'published':'archived',primaryMediaId:changed?null:current?.mediaId??null,createdAt:line.createdAt,unavailableReason:usable?null:!current?'This saved option is no longer available. Choose an actual current option.':changed?'This option changed. Review its current price and details before checkout.':current.orderable?'The requested quantity is no longer available.':'This exact option is currently unavailable.',currentChoice:current&&set?{versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:current.pricePaisa,orderable:current.orderable}:null};
 });
}
