import { withFirstCodPresentation } from '@/lib/orders/first-cod-review';
import { env } from 'cloudflare:workers';
import { PackageOpen } from 'lucide-react';
import Link from 'next/link';

import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listOrdersForOperations } from '@/lib/db/repositories/orders';

export const dynamic = 'force-dynamic';

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export default async function AdminOrdersPage() {
  await requireStaffPage('/admin/orders', 'order.manage');
  const orders = await listOrdersForOperations(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  const displayedOrders = await withFirstCodPresentation(
    requireDatabase(env as unknown as { DB?: D1Database }),
    orders,
  );
  return (
    <div>
      <p className="eyebrow">Order operations</p>
      <h1 className="mt-3 font-heading text-4xl tracking-tight">Orders</h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
        COD orders waiting for manual carrier booking and fulfilment workflow.
      </p>
      {orders.length === 0 ? (
        <EmptyOrders />
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-4">Order</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Items</th>
                  <th className="p-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayedOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="p-4">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-semibold hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {new Date(order.placedAt).toLocaleString('en-NP')}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="block">{order.customerPhone}</span>
                      <span className="text-xs text-muted-foreground">
                        {order.customerEmail}
                      </span>
                    </td>
                    <td className="p-4">
                      <OrderStatusBadge
                        status={
                          order.firstCodPending
                            ? 'awaiting_cod_confirmation'
                            : order.status
                        }
                      />
                    </td>
                    <td className="p-4">{order.itemCount}</td>
                    <td className="p-4 text-right font-semibold">
                      {money(order.grandTotalPaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyOrders() {
  return (
    <div className="mt-8 rounded-2xl border bg-card px-6 py-14 text-center">
      <PackageOpen className="mx-auto size-9 text-primary" />
      <h2 className="mt-4 font-heading text-2xl">No orders yet</h2>
      <p className="mt-2 text-muted-foreground">
        New COD orders will appear here immediately.
      </p>
    </div>
  );
}
