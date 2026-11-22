export const ORDER_RESPONSE_HOUR=3_600_000;
export const preparationBlockers=new Set(['cancellation','customer_clarification','payment_dispute','address_cod','safety','identity','ownership','carrier']);
export interface PreparationHold{startedAt:number;endedAt:number|null;reason:string;preventsPreparation:boolean;}
/** Actual source facts only. Overlapping holds consume one interval, and never restart the original clock. */
export function evaluateResponseClock(input:{releasedAt:number|null;now:number;holds:readonly PreparationHold[];progressAt?:number|null;exceptionAt?:number|null}){
 const {releasedAt,now}=input;if(!Number.isSafeInteger(now)||now<0)throw new Error('An authoritative response time is required.');
 if(releasedAt===null)return {released:false,elapsedMs:0,paused:false,responded:false,reminderDue:false,escalationDue:false,checkpointDue:false};
 if(!Number.isSafeInteger(releasedAt)||releasedAt<0||releasedAt>now)throw new Error('The original release time must precede this evaluation.');
 const relevant=input.holds.filter(h=>h.preventsPreparation&&preparationBlockers.has(h.reason));
 for(const hold of relevant)if(!Number.isSafeInteger(hold.startedAt)||hold.startedAt<0||hold.endedAt!==null&&(!Number.isSafeInteger(hold.endedAt)||hold.endedAt<hold.startedAt))throw new Error('Retain valid actual hold history.');
 const intervals=relevant.map(h=>[Math.max(releasedAt,h.startedAt),Math.min(now,h.endedAt??now)]).filter(([start,end])=>end>start).sort((a,b)=>a[0]-b[0]);let held=0,start=0,end=0;
 for(const interval of intervals){if(interval[0]>end){held+=end-start;[start,end]=interval;}else end=Math.max(end,interval[1]);}held+=end-start;
 const elapsedMs=Math.max(0,now-releasedAt-held),paused=relevant.some(h=>h.startedAt<=now&&(h.endedAt===null||h.endedAt>now)),responded=[input.progressAt,input.exceptionAt].some(at=>at!==undefined&&at!==null&&at<=now),unanswered=!responded;
 return {released:true,elapsedMs,paused,responded,reminderDue:unanswered&&!paused&&elapsedMs>=6*ORDER_RESPONSE_HOUR&&elapsedMs<12*ORDER_RESPONSE_HOUR,escalationDue:unanswered&&!paused&&elapsedMs>=12*ORDER_RESPONSE_HOUR,checkpointDue:unanswered&&now-releasedAt>=24*ORDER_RESPONSE_HOUR};
}
