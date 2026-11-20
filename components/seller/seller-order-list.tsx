import Image from 'next/image';
import Link from 'next/link';
import { PackageOpen } from 'lucide-react';
import { WhoseTurn } from '@/components/ui/whose-turn';
import { sellerDate, sellerMoney } from '@/lib/seller/presentation';
import type { ItemFulfillmentStatus } from '@/lib/db/repositories/fulfillment';
import { isSellerOrderTurn, type SellerQueueOrder } from '@/app/seller/orders/order-queue';

export function SellerOrderList({ orders, stage, selectedId, search }: {
  orders: readonly SellerQueueOrder[];
  stage: ItemFulfillmentStatus;
  selectedId?: string;
  search: string;
}) {
  if (!orders.length) return (
    <div className="rounded-2xl border border-dashed bg-card p-6 text-center">
      <PackageOpen className="mx-auto size-7 text-primary" aria-hidden="true" />
      <h2 className="mt-2 font-heading text-xl">{search ? 'No matching orders' : 'No orders at this step'}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{search ? 'Try another order number, product or customer.' : 'Orders in this stage will appear here.'}</p>
    </div>
  );

  return <ul className="space-y-2">
    {orders.map(order => {
      const items = order.items.filter(item => item.status === stage);
      const first = items[0];
      const amount = items.reduce((total, item) => total + item.amountPaisa, 0);
      const destination = [order.address.recipientName, order.address.locality, order.address.district].filter(Boolean).join(' · ');
      const params = new URLSearchParams({ status: stage, order: order.id });
      if (search) params.set('q', search);
      return <li key={order.id}>
        <Link href={`/seller/orders?${params}#order-details`} aria-current={selectedId === order.id ? 'true' : undefined}
          className={`grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-2xl border bg-card p-3 hover:border-[#14213D] md:gap-4 md:p-4 ${selectedId === order.id ? 'ring-1 ring-inset ring-[#14213D]' : ''}`}>
          <div className="flex min-w-0 items-center gap-3">
            {first?.mediaId ? <Image src={`/api/product-media/${encodeURIComponent(first.mediaId)}`} alt="" width={56} height={56}
              unoptimized className="size-11 shrink-0 rounded-lg border object-contain md:size-14" /> : null}
            <div className="min-w-0">
              <span className="block break-words font-mono text-xs font-semibold text-muted-foreground">{order.orderNumber}</span>
              <strong className="block break-words text-sm text-[#14213D]">{first?.name ?? 'Your items'}{items.length > 1 ? ` + ${items.length - 1} more` : ''}</strong>
              <span className="block break-words text-xs text-muted-foreground">{destination || sellerDate(order.placedAt)}</span>
            </div>
          </div>
          <div className="space-y-1 text-right">
            <strong className="block text-sm">{sellerMoney(amount)}</strong>
            <WhoseTurn status={stage === 'delivered' || stage === 'cancelled' ? 'done' : isSellerOrderTurn(order, stage) ? 'your-turn' : 'with-hastabazaar'} />
          </div>
        </Link>
      </li>;
    })}
  </ul>;
}
