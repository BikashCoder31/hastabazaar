import { env } from 'cloudflare:workers';
import { PackageOpen } from 'lucide-react';
import Link from 'next/link';

import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { listOrdersForSeller } from '@/lib/db/repositories/orders';

export const dynamic = 'force-dynamic';

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100);
}

export default async function SellerOrdersPage() {
  const seller = await requireSellerPage('/seller/orders');
  const orders = await listOrdersForSeller(requireDatabase(env as unknown as { DB?: D1Database }), seller.sellerId);
  return (
    <div>
      <p className="eyebrow">Sales</p>
      <h1 className="mt-3 font-heading text-4xl tracking-tight">Orders</h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">Orders containing your products. Hastabazaar operations will coordinate carrier pickup during the controlled launch.</p>
      {orders.length === 0 ? <div className="mt-8 rounded-2xl border bg-card px-6 py-14 text-center"><PackageOpen className="mx-auto size-9 text-primary" /><h2 className="mt-4 font-heading text-2xl">No orders yet</h2><p className="mt-2 text-muted-foreground">Your first published-product order will appear here.</p></div> : (
        <div className="mt-8 grid gap-4">{orders.map((order) => <article key={order.id} className="rounded-2xl border bg-card p-5 sm:flex sm:items-center sm:justify-between sm:gap-6"><div><Link href={`/seller/orders/${order.id}`} className="font-semibold hover:underline">{order.orderNumber}</Link><p className="mt-1 text-sm text-muted-foreground">{new Date(order.placedAt).toLocaleString('en-NP')} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}</p><p className="mt-2 text-sm">Customer contact: {order.customerPhone}</p></div><div className="mt-4 sm:mt-0 sm:text-right"><OrderStatusBadge status={order.status} /><p className="mt-3 font-semibold">Your items: {money(order.sellerSubtotalPaisa)}</p><p className="mt-1 text-xs text-muted-foreground">Commission held: {money(order.sellerCommissionPaisa)}</p></div></article>)}</div>
      )}
    </div>
  );
}
