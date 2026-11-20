import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {listNotifications} from '@/lib/db/repositories/operations';
import {canViewStaffNotification} from '@/lib/operations/notification-links';
import {NotificationList} from '@/components/account/notification-list';
import {financialNoticeTypes} from '@/lib/operations/financial-notice-links';
export const dynamic='force-dynamic';
export default async function StaffNotificationsPage({searchParams}: {searchParams?: Promise<{view?: string}>} = {}){
 const staff=await requireStaffPage('/admin/notifications');
 const view=(await searchParams)?.view;
 const items=await listNotifications(requireDatabase(env as unknown as {DB?:D1Database}),staff.id,100,'staff');
 const visible=items.filter(item=>canViewStaffNotification(staff,item.relatedType,item.requiredPermission));
 const filtered=view==='reminders' ? visible.filter(item=>item.relatedType==='operational_reminder')
   : view==='money-notices' ? visible.filter(item=>item.relatedType && Object.hasOwn(financialNoticeTypes,item.relatedType))
     : visible;
 const title=view==='reminders' ? 'Reminders' : view==='money-notices' ? 'Money notices' : 'Your work notifications';
 return <div className="space-y-5"><h1 className="font-heading text-4xl">{title}</h1><p className="text-muted-foreground">Updates addressed to you for work you currently have permission to view. Opening a record does not approve or change it.</p><NotificationList workspace="staff" accountId={staff.id} initial={filtered}/></div>;
}
