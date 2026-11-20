import {eligibleDeliverySql} from '../email/delivery-attempts';
import {catalogReviewEvents,hasOperationalNoticeSource,isCurrentCatalogNotice,isCurrentCaseNotice,isCurrentOperationalNotice} from './event-catalog';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {permissions,type Permission} from '../marketplace/permissions';
class NoticeAuthorityError extends Error{}
interface Row{id:string;template:string;relatedId:string|null;relatedType:string|null;userId:string|null;audience:string;channel:string;requestId:string;requiredPermission:Permission|null;status:string;reason:string|null;authSubject:string|null;userStatus:string|null}
export const obsoleteNoticeSelection="SELECT n.id FROM notification_messages n WHERE n.id>? AND n.template_key LIKE 'business.%' AND (n.status IN('queued','failed') OR n.status='cancelled' AND n.failure_reason='obsolete_or_access_changed') AND n.delivery_lease_until<=? ORDER BY n.id LIMIT 1";

/** Relevance scans never submit mail or rewrite a possible/known provider handoff. */
export async function reconcileObsoleteOperationalNotice(db:D1Database,id:string,now:number){
 const result={cancelled:0,resumed:0},row=await db.prepare('SELECT n.id,n.template_key template,n.related_id relatedId,n.related_type relatedType,n.recipient_user_id userId,n.audience_role audience,n.channel,n.request_id requestId,n.required_permission requiredPermission,n.status,n.failure_reason reason,u.auth_subject authSubject,u.status userStatus FROM notification_messages n LEFT JOIN users u ON u.id=n.recipient_user_id WHERE n.id=?').bind(id).first<Row>();if(!row)return result;
 // Legacy guest/contact-only records retain their original protected delivery
 // source adapter. Absence of an account ID alone is not issue resolution.
 if(!row.userId)return result;
 const supported=hasOperationalNoticeSource(row.template)||Object.hasOwn(catalogReviewEvents,row.template)||['business.return_request.update','business.complaint.update'].includes(row.template);if(!supported)return result;
 let current=!!row.userId&&row.userStatus==='active';
 if(current&&row.audience==='staff'){
  if(!row.requiredPermission||!permissions.includes(row.requiredPermission))current=false;
  else try{await staffMutationGuard(db,row.userId!,row.requiredPermission,NoticeAuthorityError);}catch(error){if(!(error instanceof NoticeAuthorityError))throw error;current=false;}
 }
 if(current)current=await isCurrentCatalogNotice(db,row)&&await isCurrentCaseNotice(db,row)&&await isCurrentOperationalNotice(db,row,now);
 // Zero attempts is known unstarted. After an attempt, require the complete
 // durable attempt count as well as the no-handoff fence; legacy unknown work
 // is retained for reconciliation instead of being relabelled or replayed.
 const safe=`${eligibleDeliverySql('business','notification_messages.id')} AND (delivery_attempts=0 OR delivery_attempts=(SELECT COUNT(*) FROM email_delivery_attempts history WHERE history.queue_kind='business' AND history.queue_id=notification_messages.id))`;
 if(!current&&['queued','failed'].includes(row.status)){
  const changed=await db.prepare(`UPDATE notification_messages SET status='cancelled',failure_reason='obsolete_or_access_changed',delivery_claim_token=NULL,delivery_lease_until=0 WHERE id=? AND status IN('queued','failed') AND delivery_lease_until<=? AND ${safe}`).bind(id,now).run();result.cancelled=Number(changed.meta.changes??0);
 }else if(current&&row.status==='cancelled'&&row.reason==='obsolete_or_access_changed'&&(row.audience!=='staff'||row.channel!=='email'||row.authSubject)){
  // The same never-accepted row may resume after an authoritative assignment or
  // grant correction. Preserve its attempts and existing backoff, never reset it.
  const changed=await db.prepare(`UPDATE notification_messages SET status='queued',failure_reason=NULL WHERE id=? AND status='cancelled' AND failure_reason='obsolete_or_access_changed' AND delivery_lease_until<=? AND ${safe}`).bind(id,now).run();result.resumed=Number(changed.meta.changes??0);
 }
 return result;
}
