import {getRegisteredFeeOffers} from '../commission/coordinated-policy';
import {getSellerCommissionTerms} from '../db/repositories/commission-rates';
import {getManagedTermsOffers} from '../managed-commerce/accepted-terms';
import {pricingSubjectAuthority,type PricingSubject} from './private-price-inputs';
import type {PriceScenario} from './price-guidance';

export async function getPriceScenarios(db:D1Database,actorId:string,subject:PricingSubject,now:number){
 await pricingSubjectAuthority(db,actorId,subject);
 const owner=await db.prepare(`SELECT s.id,p.participation_route AS route,p.commercial_model AS model FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.user_id=? AND s.id=(SELECT seller_id FROM ${subject.kind==='product'?'products':'product_intake_drafts'} WHERE id=?)`).bind(actorId,subject.id).first<{id:string;route:string|null;model:string|null}>();
 if(!owner)throw new Error('The current pricing owner is unavailable.');
 if(owner.route==='managed_maker'&&owner.model==='managed_fixed_supplier_price_v1')return {current:null,upcoming:[] as PriceScenario[],fixedSupplier:true,message:'Retail price does not determine your agreed supplier amount. Use the accepted supply record.'};
 try{
  if(owner.route==='managed_maker'){
   if(owner.model!=='managed_sale_linked_percentage_v1')return {current:null,upcoming:[],message:'This commercial model has no supported retail-price estimate.'};
   const offers=await getManagedTermsOffers(db,owner.id,now),map=(offer:typeof offers.current|typeof offers.upcoming[number]):PriceScenario=>({route:'sale_linked',versionId:offer.id,basisPoints:offer.retentionBps,effectiveAt:offer.effectiveFrom,observedAt:now,accepted:!!offer.accepted});
   return {current:map(offers.current),upcoming:offers.upcoming.map(map),message:null};
  }
  const offers=await getRegisteredFeeOffers(db,owner.id,now),current=await getSellerCommissionTerms(db,owner.id,now);
  const base=[offers.current,...offers.upcoming],boundaries=(await db.prepare('SELECT r.effective_at AS at FROM commission_rate_changes r LEFT JOIN commission_rate_cancellations c ON c.rate_id=r.id WHERE c.rate_id IS NULL AND r.effective_at>? ORDER BY r.effective_at LIMIT 32').bind(now).all<{at:number}>()).results;
  const map=async(terms:typeof current):Promise<PriceScenario>=>{const matched=base.find(offer=>offer.versionId===terms.version),legacy=matched?null:await db.prepare('SELECT 1 FROM commission_rate_acceptances WHERE seller_id=? AND rate_id=? AND actor_id=? AND accepted_at<=?').bind(owner.id,terms.version,actorId,now).first();return {route:'registered',versionId:terms.version,basisPoints:terms.basisPoints,effectiveAt:terms.effectiveAt??0,observedAt:now,accepted:matched?!!matched.accepted:!!legacy};};
  const times=[...new Set([...offers.upcoming.map(offer=>offer.effectiveFrom),...boundaries.map(item=>item.at)].filter((at):at is number=>typeof at==='number'&&at>now))].sort((a,b)=>a-b),upcoming:PriceScenario[]=[];let prior=current.version;
  for(const at of times){const terms=await getSellerCommissionTerms(db,owner.id,at);if(terms.version!==prior){upcoming.push(await map(terms));prior=terms.version;}}
  return {current:await map(current),upcoming,message:null};
 }catch{return {current:null,upcoming:[] as PriceScenario[],message:'The current fee source is unavailable. Keep your draft; an estimate cannot substitute for ordering eligibility.'};}
}
