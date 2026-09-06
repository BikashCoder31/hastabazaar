import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Banknote, MapPin, PackageCheck, Truck } from 'lucide-react';

import { AdminOrderFulfillmentActions } from '@/components/admin/order-fulfillment-actions';
import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getOperationsOrderDetail } from '@/lib/db/repositories/fulfillment';

export const dynamic = 'force-dynamic';

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100);
}

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaffPage(`/admin/orders/${id}`, 'order.manage');
  const order = await getOperationsOrderDetail(requireDatabase(env as unknown as { DB?: D1Database }), id);
  if (!order) notFound();
  const address = order.address;
  return (
    <div>
      <Link href="/admin/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to orders</Link>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Order fulfilment</p><h1 className="mt-2 font-heading text-4xl tracking-tight">{order.orderNumber}</h1><p className="mt-2 text-sm text-muted-foreground">Placed {new Date(order.placedAt).toLocaleString('en-NP')}</p></div><OrderStatusBadge status={order.status} /></div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-6"><div className="flex items-center gap-3"><PackageCheck className="size-5 text-primary" /><h2 className="font-heading text-2xl">Items and sellers</h2></div><div className="mt-5 divide-y">{order.items.map((item) => <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><strong>{item.productName} × {item.quantity}</strong><p className="mt-1 text-sm text-muted-foreground">{item.sellerName} · SKU {item.sku}</p></div><div className="sm:text-right"><OrderStatusBadge status={item.fulfillmentStatus} /><p className="mt-2 text-sm font-semibold">{money(item.lineTotalPaisa)}</p></div></div>)}</div></section>
          <section className="rounded-2xl border bg-card p-6"><div className="flex items-center gap-3"><MapPin className="size-5 text-primary" /><h2 className="font-heading text-2xl">Customer and delivery</h2></div><div className="mt-5 grid gap-5 text-sm sm:grid-cols-2"><div><p className="font-semibold">Contact</p><p className="mt-1 leading-6 text-muted-foreground">{address.recipientName}<br />{order.customerPhone}<br />{order.customerEmail}</p></div><div><p className="font-semibold">Address</p><p className="mt-1 leading-6 text-muted-foreground">{address.locality}{address.landmark ? `, near ${address.landmark}` : ''}<br />Ward {address.ward || '—'}, {address.municipality}<br />{address.district}, {address.province}, Nepal</p></div></div></section>
          <section className="rounded-2xl border bg-card p-6"><div className="flex items-center gap-3"><Truck className="size-5 text-primary" /><h2 className="font-heading text-2xl">Status history</h2></div><ol className="mt-5 space-y-4">{order.history.map((event) => <li key={event.id} className="border-l-2 border-primary/30 pl-4"><div className="flex flex-wrap items-center gap-2"><OrderStatusBadge status={event.toStatus} /><span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString('en-NP')}</span></div><p className="mt-2 text-sm">{event.note}</p><p className="mt-1 text-xs text-muted-foreground">{event.actorName || 'Customer/system'}</p></li>)}</ol></section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-2xl border bg-card p-6"><h2 className="font-heading text-2xl">Next action</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Dispatch requires all sellers to mark their items ready. Delivery confirms COD collection.</p><div className="mt-5"><AdminOrderFulfillmentActions orderId={order.id} status={order.status} /></div></section>
          <section className="rounded-2xl border bg-card p-6"><div className="flex items-center gap-3"><Banknote className="size-5 text-primary" /><h2 className="font-heading text-2xl">Commercials</h2></div><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt>Items</dt><dd>{money(order.itemSubtotalPaisa)}</dd></div><div className="flex justify-between"><dt>Delivery</dt><dd>{money(order.deliveryChargePaisa)}</dd></div><div className="flex justify-between border-t pt-3 font-semibold"><dt>COD total</dt><dd>{money(order.grandTotalPaisa)}</dd></div><div className="flex justify-between"><dt>Payment</dt><dd className="capitalize">{order.paymentStatus}</dd></div></dl></section>
          <section className="rounded-2xl border bg-card p-6"><h2 className="font-heading text-2xl">Shipment</h2><p className="mt-3 text-sm capitalize">{order.shipmentStatus.replaceAll('_', ' ')}</p><p className="mt-2 text-sm text-muted-foreground">Reference: {order.trackingCode || 'Not assigned'}</p><p className="mt-2 text-sm text-muted-foreground">Estimate: {order.estimatedMinDays}–{order.estimatedMaxDays} days</p></section>
        </aside>
      </div>
    </div>
  );
}
