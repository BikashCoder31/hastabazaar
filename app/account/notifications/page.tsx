import { env } from 'cloudflare:workers';

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
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Account</p>
        <h1 className="section-title">Notifications</h1>
        <p className="mt-2 text-muted-foreground">
          In-app updates and the delivery state of queued email/SMS messages.
        </p>
      </div>
      <NotificationList initial={items} />
    </div>
  );
}
