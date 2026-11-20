import { env } from 'cloudflare:workers';
import { AccountHeading } from '@/components/account/account-ui';
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
    100,
    'customer',
  );
  return (
    <div>
      <AccountHeading
        eyebrow="Your latest updates"
        title="Keep in the know."
        description="Updates from Hastabazaar, ready when you are."
      />
      <NotificationList
        accountId={customer.userId}
        workspace="customer"
        initial={items.filter((item) => item.channel === 'in_app')}
      />
    </div>
  );
}
