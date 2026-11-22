export type PaymentAttemptAction='claim'|'release'|'upload';
export type PaymentAttemptReference={version:1;actorId:string;sourceId:string;action:PaymentAttemptAction;requestId:string};
export type PaymentAttemptOutcome={reference:PaymentAttemptReference;result:Record<string,unknown>;recordedAt:number};
export function paymentAttemptReference(value:unknown,actorId:string,sourceId:string,action:PaymentAttemptAction):PaymentAttemptReference|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 return v.version===1&&v.actorId===actorId&&v.sourceId===sourceId&&v.action===action&&typeof v.requestId==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(v.requestId)?{version:1,actorId,sourceId,action,requestId:v.requestId}:null;
}
