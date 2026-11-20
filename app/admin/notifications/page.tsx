import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {listNotifications} from '@/lib/db/repositories/operations';
import {canViewStaffNotification} from '@/lib/operations/notification-links';
import {NotificationList} from '@/components/account/notification-list';
export const dynamic='force-dynamic';
export default async function StaffNotificationsPage(){
 const staff=await requireStaffPage('/admin/notifications');
 const items=await listNotifications(requireDatabase(env as unknown as {DB?:D1Database}),staff.id,100,'staff');
 return <div className="space-y-5"><h1 className="font-heading text-4xl">Your work notifications</h1><p className="text-muted-foreground">Updates addressed to you for work you currently have permission to view. Opening a record does not approve or change it.</p><NotificationList workspace="staff" accountId={staff.id} initial={items.filter(item=>canViewStaffNotification(staff,item.relatedType,item.requiredPermission))}/></div>;
}
