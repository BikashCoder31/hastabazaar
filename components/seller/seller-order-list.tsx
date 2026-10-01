import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import type { SellerOrderRow } from '@/lib/db/repositories/orders';
import { sellerDate, sellerMoney } from '@/lib/seller/presentation';

export function SellerOrderList({
  orders,
}: {
  orders: readonly SellerOrderRow[];
}) {
  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <article key={order.id} className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link
                href={'/seller/orders/' + order.id}
                className="break-all font-semibold text-primary hover:underline"
              >
                {order.orderNumber}
              </Link>
              <p className="mt-2 text-sm text-muted-foreground">
                {sellerDate(order.placedAt)} · {order.itemCount} unit
                {order.itemCount === 1 ? '' : 's'} from your shop
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Your items</span>
              <OrderStatusBadge status={order.sellerStatus} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t pt-4">
            <div>
              <p className="text-lg font-semibold">
                {sellerMoney(order.sellerSubtotalPaisa)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Commission: {sellerMoney(order.sellerCommissionPaisa)} · Order:{' '}
                {order.status.replaceAll('_', ' ')}
              </p>
            </div>
            <Link href={'/seller/orders/' + order.id} className="section-link">
              Manage order
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
