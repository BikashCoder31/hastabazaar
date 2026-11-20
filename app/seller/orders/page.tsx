import { withFirstCodPresentation } from '@/lib/orders/first-cod-review';
import { env } from 'cloudflare:workers';
import { PackageOpen } from 'lucide-react';
import { SellerHeading, SellerEmpty } from '@/components/seller/workspace-ui';
import { SellerOrderList } from '@/components/seller/seller-order-list';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { listOrdersForSeller } from '@/lib/db/repositories/orders';

export const dynamic = 'force-dynamic';
export default async function SellerOrdersPage() {
  const seller = await requireSellerCenterPage('/seller/orders');
  const orders = seller.sellerId ? await listOrdersForSeller(
    requireDatabase(env as unknown as { DB?: D1Database }),
    seller.sellerId,
  ) : [];
  const displayedOrders = await withFirstCodPresentation(
    requireDatabase(env as unknown as { DB?: D1Database }),
    orders,
  );
  return (
    <div className="space-y-7">
      <SellerHeading
        eyebrow="Fulfilment"
        title="Your orders"
        description="Prepare only the items from your shop. Hastabazaar coordinates dispatch and confirms delivery."
      />
      <p className="rounded-xl border bg-card p-4 text-sm leading-6 text-muted-foreground">
        Confirmed → Packing → Ready for pickup → Dispatched → Delivered. Each
        card shows your items’ status separately from the whole order.
      </p>
      {orders.length ? (
        <>
          <SellerOrderList orders={displayedOrders} />
          {orders.length >= 100 ? (
            <p className="text-sm text-muted-foreground">
              Showing the 100 most recent orders.
            </p>
          ) : null}
        </>
      ) : (
        <SellerEmpty
          icon={PackageOpen}
          title="No orders yet"
          description="Orders containing your published products will appear here."
          href="/seller/products"
          action="Manage your products"
        />
      )}
    </div>
  );
}
