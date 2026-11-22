import {isCurrentReviewAssignmentNotice,readReviewAssignment} from './review-task-assignment-notices';
import {operationalNotificationRequestId} from './event-catalog';
import {reviewTaskReminderSource} from '../workflows/review-tasks';
import type {CurrentOperationalNotice} from './financial-notice-sources';

/** Receipt URLs confer no authority; former owners receive no private source link. */
export async function resolveReviewAssignmentDestination(db:D1Database,userId:string,key:string,now=Date.now()){
 if(!/^[a-f0-9]{64}$/.test(key))return null;
 const rows=await db.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId,required_permission requiredPermission FROM notification_messages WHERE recipient_user_id=? AND related_type='review_task_assignment' AND related_id=? AND template_key='business.workflow.assignment' AND channel='in_app' AND business_event_key=template_key LIMIT 2").bind(userId,key).all<CurrentOperationalNotice>();
 for(const notice of rows.results){if(!await isCurrentReviewAssignmentNotice(db,notice,now))continue;const saved=await readReviewAssignment(db,key);if(!saved)return null;
  const released=notice.requestId===await operationalNotificationRequestId(notice.template,key+':released',userId,notice.channel);let destination='/admin/team#responsibilities';
  if(!released){const source=await reviewTaskReminderSource(db,saved.taskId,now);if(!source)return null;const id=encodeURIComponent(source.task.sourceId),kind=source.task.sourceType;
   if(kind==='system_incident')destination='/admin/system-health/incidents?incident='+id;
   else if(kind==='team_governance')destination=(await(await import('./team-task-destination')).getTeamTaskDestination(db,userId,source.task.sourceId)).href;
   else if(kind==='return_request'||kind==='complaint')destination='/admin/cases/'+(kind==='return_request'?'returns':'complaints')+'/'+id;
   else if(kind==='payment_exception')destination='/admin/payments/exceptions/'+id;
   else if(kind==='recovery_claim')destination='/admin/payments/recoveries/claims/'+id;
   else if(kind==='recovery_review'||kind==='recovery_contact')destination='/admin/payments/recoveries/'+id;
   else destination='/admin?reviewView=attention&reviewQ='+encodeURIComponent(source.task.sourceId)+'#seller-review-queue';
  }
  if(await isCurrentReviewAssignmentNotice(db,notice,now))return destination;
 }return null;
}
