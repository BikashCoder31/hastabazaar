import { env } from 'cloudflare:workers';
import { ShippingConsole } from '@/components/shipping-console';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { listOrdersForSeller } from '@/lib/db/repositories/orders';
import { listShippingJobs } from '@/lib/db/repositories/operations';
export const dynamic = 'force-dynamic';
export default async function SellerShippingPage() {
  const seller = await requireSellerPage('/seller/shipping');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [jobs, orders] = await Promise.all([
    listShippingJobs(db, seller.sellerId),
    listOrdersForSeller(db, seller.sellerId),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Delivery & returns</p>
        <h1 className="section-title">Shipping coordination</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Request outbound or return pickup. Carrier labels and scheduling
          remain manually controlled until Nepal Can Move credentials are
          configured.
        </p>
      </div>
      <ShippingConsole
        jobs={jobs}
        orders={orders.map(({ id, orderNumber }) => ({ id, orderNumber }))}
      />
    </div>
  );
}
