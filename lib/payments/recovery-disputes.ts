import {calculateServiceDueAt,CONTINUOUS_CALENDAR_VERSION} from '../workflows/service-clock';
/** Decisions consume the oldest disputed portions; original submission clocks are retained. */
export async function pendingRecoveryDisputes(db:D1Database,caseId:string,additionalResolved=0){
 const events=await db.prepare("SELECT id,action,details_json AS details,created_at AS createdAt FROM seller_recovery_events WHERE case_id=? AND action IN('disputed','absorbed','dispute_upheld','liability_corrected') ORDER BY revision").bind(caseId).all<{id:string;action:string;details:string;createdAt:number}>();
 // The immutable carrier journal also covers older events that omitted the resolved amount.
 const carrier=await db.prepare('SELECT COALESCE(SUM(resolved_disputed_paisa),0) amount FROM seller_recovery_carrier_reviews WHERE case_id=?').bind(caseId).first<{amount:number}>();
 const returned=await db.prepare('SELECT COALESCE(SUM(resolved_disputed_paisa),0) amount FROM seller_recovery_payout_return_reviews WHERE case_id=?').bind(caseId).first<{amount:number}>();
 let resolved=additionalResolved+Number(carrier?.amount??0)+Number(returned?.amount??0);
 for(const event of events.results){const details=JSON.parse(event.details);if(event.action==='absorbed'||event.action==='liability_corrected')resolved+=details.resolveDisputedPaisa??0;else if(event.action==='dispute_upheld')resolved+=details.amountPaisa;}
 if(!Number.isSafeInteger(resolved)||resolved<0)throw new Error('The retained dispute decisions need reconciliation.');
 const pending=[];
 for(const event of events.results){if(event.action!=='disputed')continue;const amount=JSON.parse(event.details).amountPaisa;if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('The retained dispute submission needs reconciliation.');const covered=Math.min(resolved,amount);resolved-=covered;if(amount>covered)pending.push({id:event.id,remainingPaisa:amount-covered,createdAt:event.createdAt,dueAt:calculateServiceDueAt({startedAt:event.createdAt,amount:1,unit:'service_day',calendarVersion:CONTINUOUS_CALENDAR_VERSION})});}
 if(resolved)throw new Error('The retained dispute decisions exceed their original submissions.');
 return pending;
}
