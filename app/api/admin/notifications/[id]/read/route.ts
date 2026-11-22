import {operationalNotificationRequestId} from '@/lib/operations/event-catalog';
import {validateAdminPermissions} from '@/lib/marketplace/permissions';
import {riderNotificationSourceSql} from '@/lib/operations/rider-notification-access';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {canViewStaffNotification} from '@/lib/operations/notification-links';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
const exceptionTemplate = 'business.exception.assigned';
const notFound = () => Response.json({error:'Notification not found.'},{status:404});

function exceptionSource(db: D1Database) {
 const jsonValue = (db as D1Database & {dialect?: string}).dialect === 'mariadb' ? 'JSON_VALUE' : 'json_extract';
 return `FROM exception_work_items w JOIN exception_work_events e ON e.work_id=w.id
   WHERE w.status='open' AND COALESCE(${jsonValue}(e.payload_json,'$.version'),-1)+1=w.version
     AND HEX(e.owner_id)=HEX(w.owner_id)`;
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 if(!isTrustedMutationRequest(request))return Response.json({error:'Request origin was not accepted.'},{status:403});
 try {
 const staff=await requireStaffApi('account.self.manage');if(hasActorIntentMismatch(request,staff.id))return Response.json({error:'Your signed-in account changed. Refresh the notification workspace.'},{status:403});const db=requireDatabase(env as unknown as {DB?:D1Database});const {id}=await params;
 const row=await db.prepare("SELECT template_key AS template,related_id AS relatedId,recipient_user_id AS userId,audience_role AS audience,channel,request_id AS requestId,related_type AS relatedType,required_permission AS requiredPermission FROM notification_messages WHERE id=? AND recipient_user_id=? AND audience_role='staff' AND channel='in_app' AND (related_type<>'exception_work' OR EXISTS(SELECT 1 FROM exception_work_items w WHERE w.id=notification_messages.related_id AND (w.owner_id=notification_messages.recipient_user_id OR (notification_messages.required_permission='admin.invite' AND EXISTS(SELECT 1 FROM users oversight_user JOIN user_roles oversight_role ON oversight_role.user_id=oversight_user.id WHERE oversight_user.id=notification_messages.recipient_user_id AND oversight_user.status='active' AND oversight_role.role='super_admin'))) AND w.status='open')) AND (notification_messages.audience_role<>'staff' OR notification_messages.related_type IS NULL OR notification_messages.related_type<>'return_request' OR EXISTS(SELECT 1 FROM return_requests r WHERE r.id=notification_messages.related_id AND r.status NOT IN ('resolved','closed','rejected') AND (r.reviewed_by IS NULL OR r.reviewed_by=notification_messages.recipient_user_id OR (notification_messages.required_permission='refund.approve.high_value' AND r.status='pending_high_value_approval')))) AND (notification_messages.audience_role<>'staff' OR notification_messages.related_type IS NULL OR notification_messages.related_type<>'complaint' OR EXISTS(SELECT 1 FROM complaints c WHERE c.id=notification_messages.related_id AND c.status NOT IN ('resolved','closed','rejected') AND (COALESCE(c.escalated_to,c.assigned_to) IS NULL OR COALESCE(c.escalated_to,c.assigned_to)=notification_messages.recipient_user_id)))"+" AND "+riderNotificationSourceSql('notification_messages')).bind(id,staff.id).first<{template:string;relatedId:string|null;userId:string;audience:string;channel:string;requestId:string;relatedType:string|null;requiredPermission:string|null}>();
 if (!row || !canViewStaffNotification(staff,row.relatedType,row.requiredPermission)) return notFound();

 let fence = '';
 let fenceValues: (string | number | null)[] = [];
 if (row.relatedType === 'exception_work') {
   if (row.template !== exceptionTemplate || !row.relatedId || row.userId !== staff.id) return notFound();
   const sourceSql = exceptionSource(db);
   const sources = await db.prepare(`SELECT e.id AS eventId,w.version,w.owner_id AS ownerId
     ${sourceSql} AND w.id=? AND HEX(w.id)=HEX(?)`)
     .bind(row.relatedId,row.relatedId).all<{eventId:string;version:number;ownerId:string}>();
   let source: (typeof sources.results)[number] | undefined;
   for (const candidate of sources.results) {
     const keys = candidate.ownerId === row.userId ? ['owner',row.userId] : [row.userId];
     for (const key of keys) {
       if (row.requestId === await operationalNotificationRequestId(row.template,candidate.eventId,key,row.channel)) {
         source = candidate;
         break;
       }
     }
     if (source) break;
   }
   if (!source) return notFound();

   let profileFence = '';
   let profileValues: string[] = [];
   if (staff.role === 'admin') {
     const profile = await db.prepare('SELECT permissions_json AS raw FROM staff_permission_profiles WHERE user_id=? AND HEX(user_id)=HEX(?)')
       .bind(staff.id,staff.id).first<{raw:string}>();
     if (profile) {
       let permissions;
       try { permissions = validateAdminPermissions(JSON.parse(profile.raw)); }
       catch { return notFound(); }
       if (!canViewStaffNotification({role:staff.role,permissions},row.relatedType,row.requiredPermission)) return notFound();
       profileFence = 'AND EXISTS(SELECT 1 FROM staff_permission_profiles p WHERE p.user_id=u.id AND HEX(p.user_id)=HEX(u.id) AND HEX(p.permissions_json)=HEX(?))';
       profileValues = [profile.raw];
     } else {
       if (!canViewStaffNotification({role:staff.role},row.relatedType,row.requiredPermission)) return notFound();
       profileFence = 'AND NOT EXISTS(SELECT 1 FROM staff_permission_profiles p WHERE p.user_id=u.id AND HEX(p.user_id)=HEX(u.id))';
     }
   }

   const permissionFence = row.requiredPermission === null
     ? 'required_permission IS NULL'
     : 'HEX(required_permission)=HEX(?)';
   // The request hash is checked above. Pin the same message, event and authority at the write.
   fence = `AND HEX(recipient_user_id)=HEX(?) AND HEX(related_type)=HEX('exception_work')
     AND HEX(audience_role)=HEX('staff') AND HEX(channel)=HEX('in_app')
     AND HEX(related_id)=HEX(?) AND HEX(template_key)=HEX(?) AND HEX(request_id)=HEX(?)
     AND ${permissionFence}
     AND EXISTS(SELECT 1 ${sourceSql}
       AND w.id=notification_messages.related_id AND HEX(w.id)=HEX(notification_messages.related_id)
       AND w.version=? AND HEX(e.id)=HEX(?) AND HEX(w.owner_id)=HEX(?)
       AND (HEX(w.owner_id)=HEX(notification_messages.recipient_user_id)
         OR (HEX(notification_messages.required_permission)=HEX('admin.invite') AND ?='super_admin')))
     AND EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id AND HEX(r.user_id)=HEX(u.id)
       WHERE u.id=notification_messages.recipient_user_id AND HEX(u.id)=HEX(notification_messages.recipient_user_id)
         AND HEX(u.status)=HEX('active') AND HEX(r.role)=HEX(?) ${profileFence})`;
   fenceValues = [staff.id,row.relatedId,row.template,row.requestId,
     ...(row.requiredPermission === null ? [] : [row.requiredPermission]),
     source.version,source.eventId,source.ownerId,staff.role,staff.role,...profileValues];
 }
 const update = await db.prepare(`UPDATE notification_messages SET status='read',read_at=COALESCE(read_at,?)
   WHERE id=? AND recipient_user_id=? AND audience_role='staff' AND channel='in_app'
     AND ${riderNotificationSourceSql('notification_messages')} ${fence}`)
   .bind(Date.now(),id,staff.id,...fenceValues).run();
 if (row.relatedType === 'exception_work' && !update.meta.changes) return notFound();
 return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof StaffAuthorizationError?e.message:'Notification could not be updated.'},{status:e instanceof StaffAuthorizationError?e.status:500});}
}
