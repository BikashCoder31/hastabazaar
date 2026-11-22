import { listNotifications } from '../db/repositories/operations';
import { canViewStaffNotification, type NotificationAudience } from './notification-links';
import type { PermissionSubject } from '../marketplace/permissions';

/** Current recipient/permission filtering precedes both the count and the ten-row menu. */
export async function getNotificationPanel(db: D1Database, input: {
  userId: string; audience: NotificationAudience; staff?: PermissionSubject; unreadOnly?: boolean;
}) {
  const all = await listNotifications(db, input.userId, Number.MAX_SAFE_INTEGER, input.audience);
  const permitted = input.audience === 'staff'
    ? all.filter(item => input.staff && canViewStaffNotification(input.staff, item.relatedType, item.requiredPermission)) : all;
  return { unreadCount: permitted.filter(item => !item.readAt).length,
    items: permitted.filter(item => !input.unreadOnly || !item.readAt).slice(0, 10) };
}
