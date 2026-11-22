import { env } from 'cloudflare:workers';
import { CustomerSettings } from '@/components/account/account-sections';
import { NotificationList } from '@/components/account/notification-list';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listNotifications } from '@/lib/db/repositories/operations';

export const dynamic = 'force-dynamic';
export default async function CustomerNotificationsPage() {
  const customer = await requireCustomerPage('/account/notifications');
  const items = await listNotifications(
    requireDatabase(env as unknown as { DB?: D1Database }),
    customer.userId,
    Number.MAX_SAFE_INTEGER,
    'customer',
  );
  return (
    <CustomerSettings active="notifications">
      <NotificationList
        accountId={customer.userId}
        workspace="customer"
        initial={items.slice(0, 100)}
        unreadCount={items.filter(item => !item.readAt).length}
      />
    </CustomerSettings>
  );
}
