import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
type Context={actorId:string;requestId:string;now:number};
export function protectedChangeEvent(db:D1Database,input:Context,caseId:string,action:string,reason:string,payload:unknown){return db.prepare(`INSERT INTO seller_protected_change_events(id,case_id,actor_id,action,reason,payload_json,created_at) VALUES(?,?,?,?,?,?,?)`)
  .bind(crypto.randomUUID(),caseId,input.actorId,action,reason,JSON.stringify(payload),input.now);}
/** A linked document case retains one notification family and one current operation marker. */
export async function protectedChangeNotice(db:D1Database,caseId:string,sourceRequestId:string|null,eventId:string,input:Context){
  return sourceRequestId?[
    db.prepare('UPDATE seller_document_change_requests SET operation_request_id=? WHERE id=?').bind(eventId,sourceRequestId),
    ...await operationalBusinessNotificationStatements(db,{kind:'seller.document.change',sourceId:sourceRequestId,eventId,actorId:input.actorId,now:input.now}),
  ]:await operationalBusinessNotificationStatements(db,{kind:'seller.protected_change',sourceId:caseId,eventId,actorId:input.actorId,now:input.now});
}
