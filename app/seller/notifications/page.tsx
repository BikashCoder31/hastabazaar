import { env } from 'cloudflare:workers';

import { NotificationList } from '@/components/account/notification-list';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { listNotifications } from '@/lib/db/repositories/operations';

export const dynamic = 'force-dynamic';
export default async function SellerNotificationsPage() {
  const seller = await requireSellerCenterPage('/seller/notifications');
  const items = await listNotifications(
    requireDatabase(env as unknown as { DB?: D1Database }),
    seller.userId,
    100,
    'seller',
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Seller</p>
        <h1 className="section-title">Notifications</h1>
      </div>
      <NotificationList workspace="seller" accountId={seller.userId} initial={items} />
    </div>
  );
}
