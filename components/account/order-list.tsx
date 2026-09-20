import Link from 'next/link';
import { ArrowRight, Package } from 'lucide-react';
import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import type { CustomerOrderRow } from '@/lib/db/repositories/customers';

export function CustomerOrderList({
  orders,
}: {
  orders: readonly CustomerOrderRow[];
}) {
  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <article
          key={order.orderNumber}
          className="rounded-2xl border bg-card p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Package className="size-5" />
              </span>
              <div>
                <Link
                  href={`/orders/${order.orderNumber}`}
                  className="break-all font-semibold text-primary hover:underline"
                >
                  {order.orderNumber}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(order.placedAt).toLocaleDateString('en-NP', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t pt-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'} ·
                Cash on delivery
              </p>
              <p className="mt-1 text-lg font-semibold">
                {new Intl.NumberFormat('en-NP', {
                  style: 'currency',
                  currency: 'NPR',
                }).format(order.grandTotalPaisa / 100)}
              </p>
            </div>
            <Link
              href={`/orders/${order.orderNumber}`}
              className="section-link"
            >
              View order & tracking
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
