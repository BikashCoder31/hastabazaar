import type {CommandContext} from '../workflows/contracts';
import {paymentGuard} from '../payments/manual-receipts';
import {operationalBusinessNotificationStatements} from './business-notifications';
import {financialNoticeIdentity,financialNoticeDetail,type FinancialNoticeKind} from './financial-notice-sources';

/** Append after the exact native event/audit and before the original command receipt. */
export async function financialNoticeStatements(db:D1Database,ctx:CommandContext,input:{kind:FinancialNoticeKind;sourceId:string;status:string;nativeEventId?:string;detail?:string}){
 const eventId=input.nativeEventId??await financialNoticeIdentity(ctx.actorId,ctx.requestId,input.status,input.kind,input.sourceId);
 const prior=await db.prepare('SELECT revision FROM operational_notice_states WHERE family=? AND source_id=?').bind(input.kind,input.sourceId).first<{revision:number}>();
 const marker=prior
  ?[db.prepare('UPDATE operational_notice_states SET current_event_id=?,current_status=?,revision=revision+1 WHERE family=? AND source_id=? AND revision=?').bind(eventId,input.status,input.kind,input.sourceId,prior.revision),...paymentGuard(db,'changes()=1')]
  :[db.prepare('INSERT INTO operational_notice_states(family,source_id,current_event_id,current_status) VALUES(?,?,?,?)').bind(input.kind,input.sourceId,eventId,input.status)];
 return [...marker,...await operationalBusinessNotificationStatements(db,{kind:input.kind,sourceId:input.sourceId,eventId,actorId:ctx.actorId,now:ctx.now,status:input.status,detail:input.detail??financialNoticeDetail(input.status)})];
}
