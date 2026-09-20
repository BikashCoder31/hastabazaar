import {listParcels,customerParcel} from '@/lib/operations/parcels';
import {ParcelList} from '@/components/delivery/parcel-list';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, PackageCheck, Truck } from 'lucide-react';

import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import { SellerOrderFulfillmentActions } from '@/components/seller/order-fulfillment-actions';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerOrderDetail } from '@/lib/db/repositories/fulfillment';

export const dynamic = 'force-dynamic';

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export default async function SellerOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seller = await requireSellerPage(`/seller/orders/${id}`);
  const order = await getSellerOrderDetail(
    requireDatabase(env as unknown as { DB?: D1Database }),
    id,
    seller.sellerId,
  );
  if (!order) notFound();
  const parcels=await listParcels(requireDatabase(env as unknown as {DB?:D1Database}),id,seller.sellerId);
  const sellerSubtotal = order.items.reduce(
    (total, item) => total + item.lineTotalPaisa,
    0,
  );
  const commission = order.items.reduce(
    (total, item) => total + item.commissionPaisa,
    0,
  );
  return (
    <div>
      <ParcelList parcels={parcels.map(p=>customerParcel({...p,latitude:null,longitude:null,accuracy:null,positionAt:null}))}/>
      <Link
        href="/seller/orders"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to orders
      </Link>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Seller fulfilment</p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">
            {order.orderNumber}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Placed {new Date(order.placedAt).toLocaleString('en-NP')}
          </p>
        </div>
        <div>
          <p className="mb-2 text-sm text-muted-foreground">Whole order</p>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <PackageCheck className="size-5 text-primary" />
              <h2 className="font-heading text-2xl">Your items</h2>
            </div>
            <div className="mt-5 divide-y">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div>
                    <strong>
                      {item.productName} × {item.quantity}
                    </strong>
                    <p className="mt-1 text-sm text-muted-foreground">
                      SKU {item.sku}
                    </p>
                  </div>
                  <div className="text-right">
                    <OrderStatusBadge status={item.fulfillmentStatus} />
                    <p className="mt-2 text-sm font-semibold">
                      {money(item.lineTotalPaisa)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <MapPin className="size-5 text-primary" />
              <h2 className="font-heading text-2xl">Pickup and delivery</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Pack securely and keep the order number on the parcel. HastaBazaar
              operations coordinates carrier collection during the controlled
              launch.
            </p>
            <div className="mt-5 rounded-xl bg-secondary/35 p-4 text-sm leading-6">
              <strong className="block text-foreground">Destination</strong>
              <span className="text-muted-foreground">
                {order.address.municipality}, {order.address.district},{' '}
                {order.address.province}
                <br />
                Customer phone: {order.customerPhone}
              </span>
            </div>
          </section>
        </div>
        <aside className="order-first space-y-6 lg:order-last">
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Next action</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Update only after every item shown here reaches the stated stage.
            </p>
            <div className="mt-5">
              <SellerOrderFulfillmentActions
                orderId={order.id}
                itemStatuses={order.items.map((item) => item.fulfillmentStatus)}
              />
            </div>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Your sale</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt>Items</dt>
                <dd>{money(sellerSubtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Snapshotted marketplace commission</dt>
                <dd>{money(commission)}</dd>
              </div>
              <div className="flex justify-between border-t pt-3 font-semibold">
                <dt>Before reserve</dt>
                <dd>{money(sellerSubtotal - commission)}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Delivery calculation</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt>Customer delivery charge</dt>
                <dd className="font-semibold">
                  {money(order.deliveryChargePaisa)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Estimated arrival</dt>
                <dd>
                  {order.estimatedMinDays}–{order.estimatedMaxDays} days
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              {order.deliveryPricing
                ? `${money(order.deliveryPricing.baseChargePaisa)} for the first store plus 50% of that base for each additional store; ${order.deliveryPricing.currentStoreCount} of ${order.deliveryPricing.originalStoreCount} stores remain.`
                : 'This historical order retains its recorded delivery charge.'}
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <Truck className="size-5 text-primary" />
            <p className="mt-3 text-sm font-semibold capitalize">
              Shipment {order.shipmentStatus.replaceAll('_', ' ')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.trackingCode || 'Reference not assigned'}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
