import type {CommandContext} from '../workflows/contracts';
import {currentProductReviewOwnerSql} from '../workflows/review-tasks';
import {digestFormRequest} from '../forms/submission';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {offerAuthority,offerGuard,executeOfferCommand,OfferError} from './offer-support';
import {offerMoney,physicalOfferIdentity,validateOfferMatrix} from './offer-contracts';
import {approvedPriceReference} from './price-references';
import {publicProductVisibility} from './eligibility';
import {discountAdvisoryDecision,PRICE_ADVISORY_DAY,type DiscountAdvisoryCycle} from './discount-advisories';

function currentPair(db:D1Database,now:number,alias='cycle'){
 const value=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract';
 return `EXISTS(SELECT 1 FROM products p JOIN product_offer_current offer ON offer.product_id=p.id JOIN product_price_reference_reviews proof ON proof.id=${alias}.reference_id WHERE p.id=${alias}.product_id AND offer.offer_id=${alias}.offer_id AND offer.version_id=${alias}.version_id AND ${value}(offer.offer_json,'$.price')=${alias}.price_text AND ${value}(offer.offer_json,'$.compareAt')=${alias}.compare_text AND proof.seller_id=p.seller_id AND proof.decision='approved' AND NOT EXISTS(SELECT 1 FROM product_price_reference_reviews newer WHERE newer.product_id=proof.product_id AND newer.offer_id=proof.offer_id AND newer.version_id=proof.version_id AND newer.review_revision>proof.review_revision) AND ${publicProductVisibility('p',now)})`;
}
/** Append after coherent publication has installed the exact current offer. Never call for approval alone. */
export async function prepareDiscountPublicationStatements(db:D1Database,productId:string,versionId:string,now:number){
 if(!Number.isSafeInteger(now)||now<0)throw new OfferError('Use authoritative publication time.',400);
 const source=await db.prepare('SELECT matrix_json AS matrix FROM product_offer_versions WHERE id=? AND product_id=?').bind(versionId,productId).first<{matrix:string}>();if(!source)throw new OfferError('The exact publication candidate is missing.');
 const checked=validateOfferMatrix(JSON.parse(source.matrix));if(!checked.publishable)throw new OfferError('Only publishable offer facts may start a public price cycle.');const statements:D1PreparedStatement[]=[];
 for(const row of checked.matrix.offers.filter(offer=>offer.included&&offer.compareAt!=='')){
  const price=offerMoney(row.price)!,compare=offerMoney(row.compareAt)!,proof=await approvedPriceReference(db,productId,versionId,row.id);
  if(!proof||proof.sellingPaisa!==price||proof.comparePaisa!==compare||proof.physicalIdentity!==physicalOfferIdentity(row))throw new OfferError('This exact offer and price pair needs independent evidence review before public comparison.');
  const id=await digestFormRequest([productId,row.id,price,compare]),predicate=`EXISTS(SELECT 1 FROM products p JOIN product_offer_current offer ON offer.product_id=p.id JOIN product_price_reference_reviews proof ON proof.id=? WHERE p.id=? AND offer.offer_id=? AND offer.version_id=? AND offer.offer_json=? AND proof.seller_id=p.seller_id AND proof.decision='approved' AND NOT EXISTS(SELECT 1 FROM product_price_reference_reviews newer WHERE newer.product_id=proof.product_id AND newer.offer_id=proof.offer_id AND newer.version_id=proof.version_id AND newer.review_revision>proof.review_revision) AND ${publicProductVisibility('p',now)})`,values=[proof.id,productId,row.id,versionId,JSON.stringify(row)];
  statements.push(db.prepare(`INSERT OR IGNORE INTO product_discount_cycles(id,product_id,offer_id,version_id,reference_id,selling_paisa,compare_paisa,price_text,compare_text,first_published_at,visible_since) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${predicate}`).bind(id,productId,row.id,versionId,proof.id,price,compare,row.price,row.compareAt,now,now,...values));
  statements.push(db.prepare(`UPDATE product_discount_cycles SET version_id=?,reference_id=?,price_text=?,compare_text=?,visible_since=COALESCE(visible_since,?),revision=revision+1 WHERE id=? AND ${predicate}`).bind(versionId,proof.id,row.price,row.compareAt,now,id,...values));
 }
 statements.push(...discountVisibilityStatements(db,productId,now));return statements;
}
/** Include in public visibility/commercial mutations; unchanged text/stock never changes the first publication. */
export function discountVisibilityStatements(db:D1Database,productId:string,now:number){return [db.prepare(`UPDATE product_discount_cycles AS cycle SET visible_since=NULL,revision=revision+1 WHERE product_id=? AND visible_since IS NOT NULL AND NOT (${currentPair(db,now)})`).bind(productId)];}
type Cycle=DiscountAdvisoryCycle&{id:string;productId:string;offerId:string;revision:number;current:number};
const selection='cycle.id,cycle.product_id AS productId,cycle.offer_id AS offerId,cycle.first_published_at AS firstPublishedAt,cycle.visible_since AS visibleSince,cycle.dismissed_at AS dismissedAt,cycle.day23,cycle.day29,cycle.revision';
function currentCycleGuard(db:D1Database,cycleId:string,now:number){
 const guardId=crypto.randomUUID();
 // Keep the source predicate at SELECT level: wrapping it in another EXISTS exceeds native D1's depth limit.
 return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${currentPair(db,now)} THEN 1 ELSE 0 END FROM product_discount_cycles cycle WHERE cycle.id=? AND cycle.dismissed_at IS NULL`).bind(guardId,cycleId),...offerGuard(db,'changes()=1',[]),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId)];
}
export async function dismissDiscountSuggestion(db:D1Database,ctx:CommandContext,cycleId:string){
 const cycle=await db.prepare('SELECT product_id AS productId,revision FROM product_discount_cycles WHERE id=?').bind(cycleId).first<{productId:string;revision:number}>();if(!cycle)throw new OfferError('This optional suggestion is unavailable.',404);const authority=await offerAuthority(db,ctx.actorId,cycle.productId);
 return executeOfferCommand(db,ctx,'dismiss_discount_suggestion',cycle.productId,{cycleId},async()=>{
  if(ctx.expectedRevision!==String(cycle.revision))throw new OfferError('Compare the current suggestion before dismissing it.');
  return {result:{dismissed:true},statements:[...authority,...offerGuard(db,'EXISTS(SELECT 1 FROM product_discount_cycles WHERE id=? AND revision=?)',[cycleId,cycle.revision]),db.prepare("UPDATE product_discount_cycles SET dismissed_at=COALESCE(dismissed_at,?),day23=CASE WHEN day23='pending' THEN 'skipped' ELSE day23 END,day29=CASE WHEN day29='pending' THEN 'skipped' ELSE day29 END,revision=revision+1 WHERE id=?").bind(ctx.now,cycleId)]};
 });
}
/** Bounded native scan. Its only mutations are advisory state and the shared outbox. */
export async function scanProductDiscountAdvisories(db:D1Database,productId:string,now:number){
 const cycles=(await db.prepare(`SELECT ${selection},CASE WHEN ${currentPair(db,now)} THEN 1 ELSE 0 END AS current FROM product_discount_cycles cycle WHERE cycle.product_id=? AND (cycle.day23='pending' OR cycle.day29='pending') ORDER BY cycle.first_published_at,cycle.id LIMIT 500`).bind(productId).all<Cycle>()).results;
 const statements:D1PreparedStatement[]=[...discountVisibilityStatements(db,productId,now)],groups=new Map<string,{id:string;day:23|29;at:number;cycles:Cycle[]}>();
 for(const cycle of cycles){const decisions=discountAdvisoryDecision(cycle,now,!!cycle.current);if(!decisions.length)continue;
  statements.unshift(...offerGuard(db,'EXISTS(SELECT 1 FROM product_discount_cycles WHERE id=? AND revision=?)',[cycle.id,cycle.revision]));
  for(const decision of decisions){if(decision.outcome==='suggest'){const at=cycle.firstPublishedAt+decision.day*PRICE_ADVISORY_DAY,id=await digestFormRequest([productId,decision.day,at]);const group=groups.get(id)??{id,day:decision.day,at,cycles:[]};group.cycles.push(cycle);groups.set(id,group);statements.push(...currentCycleGuard(db,cycle.id,now));}
   statements.push(db.prepare(`UPDATE product_discount_cycles SET day${decision.day}=?,revision=revision+1 WHERE id=?`).bind(decision.outcome==='suggest'?'sent':'skipped',cycle.id));
  }
 }
 const newSuggestions=groups.size;
 const active=(await db.prepare('SELECT id,window_day AS day,suggested_at AS at FROM product_discount_advisories WHERE product_id=? AND suggested_at<=? AND suggested_at+?>? ORDER BY suggested_at,id LIMIT 100').bind(productId,now,PRICE_ADVISORY_DAY,now).all<{id:string;day:23|29;at:number}>()).results;
 for(const group of active){if(groups.has(group.id)||!await currentDiscountAdvisory(db,group.id,now))continue;const items=(await db.prepare(`SELECT ${selection},CASE WHEN ${currentPair(db,now)} THEN 1 ELSE 0 END AS current FROM product_discount_cycles cycle JOIN product_discount_advisory_items item ON item.cycle_id=cycle.id WHERE item.advisory_id=? AND cycle.dismissed_at IS NULL AND cycle.visible_since<=?`).bind(group.id,group.at).all<Cycle>()).results.filter(cycle=>cycle.current);if(!items.length)continue;groups.set(group.id,{...group,cycles:items});statements.push(...currentCycleGuard(db,items[0].id,now));}
 for(const group of groups.values()){
  statements.push(db.prepare('INSERT OR IGNORE INTO product_discount_advisories(id,product_id,window_day,suggested_at,created_at) VALUES(?,?,?,?,?)').bind(group.id,productId,group.day,group.at,now));
  for(const cycle of group.cycles)statements.push(db.prepare('INSERT OR IGNORE INTO product_discount_advisory_items(advisory_id,cycle_id) VALUES(?,?)').bind(group.id,cycle.id));
  statements.push(...await operationalBusinessNotificationStatements(db,{kind:'product.discount_suggestion',sourceId:group.id,eventId:group.id,status:productId,actorId:'system',now,detail:'Review your prices if you want to make a change. Your approved prices and discount will stay as they are. Open the suggestion to review the affected variants, or dismiss it. Taking no action is valid.'}));
 }
 await db.batch(statements);return {suggestions:newSuggestions,observed:cycles.length};
}
export async function currentDiscountAdvisory(db:D1Database,id:string,now:number){
 return !!await db.prepare(`SELECT 1 FROM product_discount_advisories a JOIN product_discount_advisory_items item ON item.advisory_id=a.id JOIN product_discount_cycles cycle ON cycle.id=item.cycle_id WHERE a.id=? AND a.suggested_at<=? AND a.suggested_at+?>? AND cycle.dismissed_at IS NULL AND cycle.visible_since IS NOT NULL AND cycle.visible_since<=a.suggested_at AND ${currentPair(db,now)} LIMIT 1`).bind(id,now,PRICE_ADVISORY_DAY,now).first();
}
export async function currentDiscountStaffRecipient(db:D1Database,id:string,userId:string){return !!await db.prepare(`SELECT 1 FROM product_discount_advisories a WHERE a.id=? AND (EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role='super_admin') OR ?=(${currentProductReviewOwnerSql('a.product_id')}))`).bind(id,userId,userId).first();}
/** Suggestions remain optional after their notice windows. There is deliberately no overdue/expiry field. */
export async function listDiscountSuggestions(db:D1Database,actorId:string,productId:string,now:number,staff=false){
 await offerAuthority(db,actorId,productId,staff);
 const rows=(await db.prepare(`SELECT cycle.id,cycle.revision,cycle.offer_id AS offerId,cycle.selling_paisa AS sellingPaisa,cycle.compare_paisa AS comparePaisa,cycle.first_published_at AS firstPublishedAt,offer.offer_json AS offer,version.matrix_json AS matrix FROM product_discount_cycles cycle JOIN product_offer_current offer ON offer.offer_id=cycle.offer_id JOIN product_offer_versions version ON version.id=offer.version_id WHERE cycle.product_id=? AND cycle.dismissed_at IS NULL AND (cycle.day23='sent' OR cycle.day29='sent') AND ${currentPair(db,now)} ORDER BY cycle.first_published_at,cycle.offer_id LIMIT 100`).bind(productId).all<{id:string;revision:number;offerId:string;sellingPaisa:number;comparePaisa:number;firstPublishedAt:number;offer:string;matrix:string}>()).results;
 return rows.map(row=>{const offer=JSON.parse(row.offer),matrix=validateOfferMatrix(JSON.parse(row.matrix)).matrix,name=matrix.axes.map(axis=>axis.label+': '+(axis.values.find(value=>value.id===offer.selection[axis.id])?.label??'')).join(' · ')||'Current offer';return {id:row.id,revision:String(row.revision),offerId:row.offerId,name,sellingPaisa:row.sellingPaisa,comparePaisa:row.comparePaisa,firstPublishedAt:row.firstPublishedAt};});
}
