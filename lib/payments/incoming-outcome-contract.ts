export const incomingActions=['record_bank','allocate','review_claim','release','record_reversal','reconcile_cod','record_cash','triage_exception'] as const;
export type IncomingAction=typeof incomingActions[number];
export interface IncomingReference{version:1;actorId:string;action:IncomingAction;sourceId:string;requestId:string}
export interface UnclaimedIncomingReference{version:0;requestId:string;claimedActorId?:string;actorMismatch?:true}
export interface IncomingOutcome{recordedAt:number;entity:{kind:'receipt'|'allocation'|'claim'|'order'|'reversal'|'parcel'|'exception';id:string}}
export function sameIncomingReference(left:IncomingReference,right:IncomingReference){return left.actorId===right.actorId&&left.action===right.action&&left.sourceId===right.sourceId&&left.requestId===right.requestId;}
const opaque=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=191&&!/[\p{Cc}]/u.test(value);
export function isIncomingAction(value:unknown):value is IncomingAction{return incomingActions.some(action=>action===value);}
export function incomingReference(actorId:string,action:unknown,requestId:unknown,input:Record<string,unknown>):IncomingReference{
 const field=action==='record_bank'?'accountVersionId':action==='allocate'||action==='record_reversal'?'receiptId':action==='review_claim'||action==='release'?'orderId':action==='reconcile_cod'?'jobId':'exceptionId';
 const sourceId=action==='record_cash'?requestId:input[field];
 if(!opaque(actorId)||!isIncomingAction(action)||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(requestId)||!opaque(sourceId))throw new Error('Keep the original actor, action and source reference.');
 return{version:1,actorId,action,requestId,sourceId:sourceId.trim()};
}
export function parseIncomingReference(value:unknown,actorId:string):IncomingReference|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>!['version','actorId','action','sourceId','requestId'].includes(key))||row.version!==1||row.actorId!==actorId||!isIncomingAction(row.action)||!opaque(row.sourceId)||typeof row.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(row.requestId)||row.action==='record_cash'&&row.sourceId!==row.requestId)return null;
 return{version:1,actorId,action:row.action,sourceId:row.sourceId,requestId:row.requestId};
}
export function parseUnclaimedIncomingReference(value:unknown):UnclaimedIncomingReference|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>!['version','requestId','claimedActorId','actorMismatch'].includes(key))||row.version!==0||typeof row.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(row.requestId)||row.claimedActorId!==undefined&&!opaque(row.claimedActorId)||row.actorMismatch!==undefined&&row.actorMismatch!==true)return null;
 return{version:0,requestId:row.requestId,...typeof row.claimedActorId==='string'?{claimedActorId:row.claimedActorId}:{},...row.actorMismatch===true?{actorMismatch:true as const}:{}};
}
