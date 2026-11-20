export const PRICE_ADVISORY_DAY=86400000;
export type AdvisoryOutcome='pending'|'sent'|'skipped';
export interface DiscountAdvisoryCycle{firstPublishedAt:number;visibleSince:number|null;dismissedAt:number|null;day23:AdvisoryOutcome;day29:AdvisoryOutcome}
/** A suggestion window is not a price expiry or an action deadline. No prices are written here. */
export function discountAdvisoryDecision(cycle:DiscountAdvisoryCycle,now:number,isCurrentPublicPair:boolean){
 if(!Number.isSafeInteger(cycle.firstPublishedAt)||cycle.firstPublishedAt<0||!Number.isSafeInteger(now)||now<0)throw new RangeError('Use the genuine first publication and authoritative observation time.');
 const decisions:{day:23|29;outcome:'suggest'|'skip'}[]=[];
 for(const day of [23,29] as const){const at=cycle.firstPublishedAt+day*PRICE_ADVISORY_DAY;if(cycle[`day${day}`]!=='pending'||now<at)continue;decisions.push({day,outcome:cycle.dismissedAt!==null||!isCurrentPublicPair||cycle.visibleSince===null||cycle.visibleSince>at||now>=at+PRICE_ADVISORY_DAY?'skip':'suggest'});}
 return decisions;
}
