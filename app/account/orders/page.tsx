import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { PackageOpen } from 'lucide-react';

import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listCustomerOrders } from '@/lib/db/repositories/customers';

function money(paisa: number) { return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100); }

export default async function CustomerOrdersPage() {
  const customer = await requireCustomerPage('/account/orders');
  const orders = await listCustomerOrders(requireDatabase(env as unknown as { DB?: D1Database }), customer.userId);
  return <div><p className="eyebrow">Purchase history</p><h1 className="mt-2 font-heading text-4xl">Your orders</h1>{orders.length ? <div className="mt-7 grid gap-4">{orders.map((order) => <article key={order.orderNumber} className="rounded-2xl border bg-card p-5 sm:flex sm:items-center sm:justify-between"><div><Link href={`/orders/${order.orderNumber}`} className="font-semibold text-primary hover:underline">{order.orderNumber}</Link><p className="mt-2 text-sm text-muted-foreground">{new Date(order.placedAt).toLocaleString('en-NP')} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}</p></div><div className="mt-4 flex items-center gap-4 sm:mt-0"><OrderStatusBadge status={order.status} /><strong>{money(order.grandTotalPaisa)}</strong></div></article>)}</div> : <div className="mt-7 rounded-2xl border border-dashed p-12 text-center"><PackageOpen className="mx-auto size-9 text-primary" /><p className="mt-4 font-semibold">No account orders yet</p><p className="mt-2 text-sm text-muted-foreground">Orders placed while signed in will appear here.</p><Link href="/shop" className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline">Browse the collection</Link></div>}</div>;
}
