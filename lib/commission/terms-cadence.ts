import {CONTINUOUS_CALENDAR_VERSION} from '../workflows/service-clock';
export const FEE_DAY_MS=86400000;
export type FeeTermsTiming={publishedAt:number;effectiveAt:number;createdAt:number};
export type FeeTermsNoticeKind='publication'|'advance_7'|'assistance_3'|'advance_1'|'hold_started'|'help_3'|'final_7';
/** The current milestone only; elapsed milestones never become a backlog of mail. */
export function feeTermsCadence(source:FeeTermsTiming,now:number){
 for(const timestamp of [source.publishedAt,source.effectiveAt,source.createdAt,now])if(!Number.isSafeInteger(timestamp)||timestamp<0)throw new RangeError('Use authoritative elapsed calendar timestamps.');
 const day=FEE_DAY_MS,holdStartedAt=Math.max(source.effectiveAt,source.createdAt),outreachAt=Math.max(source.createdAt,source.effectiveAt-3*day);
 const milestones:{kind:FeeTermsNoticeKind;dueAt:number;routine:boolean}[]=[
  {kind:'publication',dueAt:Math.max(source.publishedAt,source.createdAt),routine:true},
  ...([[-7,'advance_7'],[-3,'assistance_3'],[-1,'advance_1']] as const).map(([days,kind])=>({kind,dueAt:source.effectiveAt+days*day,routine:true})),
  {kind:'hold_started',dueAt:holdStartedAt,routine:false},{kind:'help_3',dueAt:holdStartedAt+3*day,routine:true},{kind:'final_7',dueAt:holdStartedAt+7*day,routine:true},
 ];
 // A final-day reminder expires after its one calendar-day dispatch window.
 // This is an email expiry, never a change to T, consent or the terms hold.
 const notice=now>=holdStartedAt+8*day?null:milestones.filter(item=>item.dueAt<=now&&!(source.createdAt>=source.effectiveAt&&item.kind!=='hold_started'&&item.dueAt<holdStartedAt)&&!(item.kind==='publication'&&source.createdAt>=source.effectiveAt)).sort((a,b)=>a.dueAt-b.dueAt).at(-1)??null;
 return {calendarVersion:CONTINUOUS_CALENDAR_VERSION,holdStartedAt,held:now>=holdStartedAt,outreachAt,assignmentDueAt:outreachAt+day,preHoldContactDueAt:Math.max(source.createdAt,source.effectiveAt-day),contactDueAt:holdStartedAt+day,retryDueAt:holdStartedAt+2*day,superAdminReviewDueAt:holdStartedAt+3*day,longOpenReviewDueAt:holdStartedAt+7*day,notice};
}
/** One routine email across replacements and deliberate resends; contact also quiets it. */
export function routineFeeEmailReady(now:number,lastRoutineAt:number|null,lastMeaningfulContactAt:number|null){return [lastRoutineAt,lastMeaningfulContactAt].every(at=>at===null||at<=now-FEE_DAY_MS);}
