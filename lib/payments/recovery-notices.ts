import type {CommandContext} from '../workflows/contracts';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';

/** Source-derived, bank-free statement updates use the common outbox and inbox. */
export function recoveryNoticeStatements(db:D1Database,ctx:CommandContext,caseId:string,status:string,detail:string){
 return operationalBusinessNotificationStatements(db,{kind:'seller.recovery',sourceId:caseId,eventId:ctx.requestId,actorId:ctx.actorId,now:ctx.now,status,detail});
}
