import {isCurrentReminderNotice,readReminderMilestone} from './reminder-notice-sources';
import type {NotificationAudience} from './notification-links';

/** A reminder link is not authority: resolve the retained source for its current eligible recipient. */
export async function resolveReminderDestination(db:D1Database,userId:string,id:string,audience:NotificationAudience,now=Date.now()):Promise<string|null>{
 if(!/^[a-f0-9]{64}$/.test(id)||!await db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").bind(userId).first())return null;
 const notice=await db.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId,required_permission requiredPermission FROM notification_messages WHERE recipient_user_id=? AND audience_role=? AND template_key='business.workflow.reminder' AND related_type='operational_reminder' AND related_id=? AND channel='in_app' LIMIT 1").bind(userId,audience,id).first<{template:string;relatedId:string;relatedType:string;userId:string;audience:string;channel:string;requestId:string;requiredPermission:string|null}>();
 if(!notice||!await isCurrentReminderNotice(db,notice,now))return null;
 const milestone=await readReminderMilestone(db,id);if(!milestone)return null;
 const source=encodeURIComponent(milestone.sourceId);
 if(milestone.family==='refund_obligation')return audience==='staff'?'/admin/payments/refunds?obligation='+source+'#refund-obligation-'+source:null;
 if(milestone.family==='system_incident')return audience==='staff'?'/admin/system-health/incidents?incident='+source:null;
 if(milestone.family==='review_task'){
  if(audience!=='staff')return null;
  const task=await db.prepare('SELECT source_id sourceId,source_type sourceType FROM review_tasks WHERE id=?').bind(milestone.sourceId).first<{sourceId:string;sourceType:string}>();
  if(task?.sourceType==='team_governance')return (await (await import('./team-task-destination')).getTeamTaskDestination(db,userId,task.sourceId)).href;
  if(task?.sourceType==='system_incident')return '/admin/system-health/incidents?incident='+encodeURIComponent(task.sourceId);
  return task?'/admin?reviewView=attention&reviewQ='+encodeURIComponent(task.sourceId)+'#seller-review-queue':null;
 }
 if(milestone.family==='recovery')return audience==='staff'?'/admin/payments/recoveries/'+source:audience==='seller'?'/seller/finance/recoveries/'+source:null;
 if(!['return_request','complaint'].includes(milestone.family))return null;
 const kind=milestone.family==='return_request'?'returns':'complaints';
 if(audience==='staff'||audience==='seller')return '/'+(audience==='staff'?'admin':'seller')+'/cases/'+kind+'/'+source;
 const order=await db.prepare(milestone.family==='return_request'?'SELECT o.order_number number FROM return_requests c JOIN order_items i ON i.id=c.order_item_id JOIN orders o ON o.id=i.order_id WHERE c.id=?':'SELECT o.order_number number FROM complaints c JOIN orders o ON o.id=c.order_id WHERE c.id=?').bind(milestone.sourceId).first<{number:string}>();
 return order?'/orders/'+encodeURIComponent(order.number)+'#aftercare-title':null;
}
