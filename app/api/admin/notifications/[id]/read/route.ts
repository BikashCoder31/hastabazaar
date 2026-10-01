import {riderNotificationSourceSql} from '@/lib/operations/rider-notification-access';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {canViewStaffNotification} from '@/lib/operations/notification-links';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 if(!isTrustedMutationRequest(request))return Response.json({error:'Request origin was not accepted.'},{status:403});
 try {
 const staff=await requireStaffApi('account.self.manage');const db=requireDatabase(env as unknown as {DB?:D1Database});const {id}=await params;
 const row=await db.prepare("SELECT related_type AS relatedType,required_permission AS requiredPermission FROM notification_messages WHERE id=? AND recipient_user_id=? AND audience_role='staff' AND channel='in_app' AND (related_type<>'exception_work' OR EXISTS(SELECT 1 FROM exception_work_items w WHERE w.id=notification_messages.related_id AND w.owner_id=notification_messages.recipient_user_id AND w.status='open')) AND (notification_messages.audience_role<>'staff' OR notification_messages.related_type IS NULL OR notification_messages.related_type<>'return_request' OR EXISTS(SELECT 1 FROM return_requests r WHERE r.id=notification_messages.related_id AND r.status NOT IN ('resolved','closed','rejected') AND (r.reviewed_by IS NULL OR r.reviewed_by=notification_messages.recipient_user_id OR (notification_messages.required_permission='refund.approve.high_value' AND r.status='pending_high_value_approval')))) AND (notification_messages.audience_role<>'staff' OR notification_messages.related_type IS NULL OR notification_messages.related_type<>'complaint' OR EXISTS(SELECT 1 FROM complaints c WHERE c.id=notification_messages.related_id AND c.status NOT IN ('resolved','closed','rejected') AND (COALESCE(c.escalated_to,c.assigned_to) IS NULL OR COALESCE(c.escalated_to,c.assigned_to)=notification_messages.recipient_user_id)))"+" AND "+riderNotificationSourceSql('notification_messages')).bind(id,staff.id).first<{relatedType:string|null;requiredPermission:string|null}>();
 if(!row||!canViewStaffNotification(staff,row.relatedType,row.requiredPermission))return Response.json({error:'Notification not found.'},{status:404});
 await db.prepare("UPDATE notification_messages SET status='read',read_at=COALESCE(read_at,?) WHERE id=? AND recipient_user_id=? AND audience_role='staff' AND channel='in_app'"+' AND '+riderNotificationSourceSql('notification_messages')).bind(Date.now(),id,staff.id).run();
 return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof StaffAuthorizationError?e.message:'Notification could not be updated.'},{status:e instanceof StaffAuthorizationError?e.status:500});}
}
