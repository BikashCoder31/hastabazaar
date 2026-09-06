import { env } from 'cloudflare:workers';

import { NotificationList } from '@/components/account/notification-list';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { listNotifications } from '@/lib/db/repositories/operations';

export const dynamic = 'force-dynamic';
export default async function SellerNotificationsPage() {
  const seller = await requireSellerPage('/seller/notifications');
  const items = await listNotifications(
    requireDatabase(env as unknown as { DB?: D1Database }),
    seller.userId,
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Seller</p>
        <h1 className="section-title">Notifications</h1>
      </div>
      <NotificationList initial={items} />
    </div>
  );
}
