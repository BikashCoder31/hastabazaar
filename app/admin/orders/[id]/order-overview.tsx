import Link from 'next/link';
import { OrderOfferDetails } from '@/components/commerce/order-offer-details';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import type { FulfillmentOrderDetail } from '@/lib/db/repositories/fulfillment';
import {
  formatOrderTime,
  orderMoney as money,
  orderStage,
} from '../order-queue-presentation';
import { OrderStageBadge } from '../order-stage-badge';
import { OrderItemPhoto } from './order-item-photo';

const panel = 'min-w-0 rounded-[14px] border border-[#E4DACA] bg-card p-5';

export function OrderOverview({
  order,
  sellers,
  courierNames,
  pickupAt,
  canOpenSeller,
  detailHref,
  sellerPhone,
}: {
  order: FulfillmentOrderDetail;
  sellers: Map<string, string>;
  courierNames: string[];
  pickupAt: number | null;
  canOpenSeller: boolean;
  detailHref: string;
  sellerPhone: string | null;
}) {
  const address = order.address;
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        <section className={panel}>
          <h2 className="font-semibold">Items</h2>
          <ul className="mt-2 divide-y">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 flex-wrap items-center gap-3 py-3 last:pb-0"
              >
                <OrderItemPhoto
                  key={item.offerSnapshot?.mediaId ?? 'no-photo'}
                  mediaId={item.offerSnapshot?.mediaId}
                />
                <div className="min-w-0 flex-1">
                  <p className="wrap-anywhere text-sm font-semibold">
                    {item.productName}
                  </p>
                  <p className="wrap-anywhere text-sm text-[#46536F]">
                    {item.sellerName} · Qty {item.quantity}
                  </p>
                  {item.offerSnapshot ? (
                    <OrderOfferDetails offer={item.offerSnapshot} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      SKU {item.sku}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {money(item.lineTotalPaisa)}
                  </p>
                  <OrderStageBadge status={item.fulfillmentStatus} />
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className={panel}>
          <h2 className="font-semibold">Activity</h2>
          {order.history.length ? (
            <ol className="mt-4 space-y-3 text-sm">
              {order.history.map((event) => (
                <li className="flex min-w-0 items-start gap-2.5" key={event.id}>
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-[#14213D] text-[0.65rem] font-semibold text-white"
                    aria-hidden="true"
                  >
                    {(event.actorName || 'System')
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((word) => word.charAt(0).toUpperCase())
                      .join('')}
                  </span>
                  <div className="min-w-0">
                    <p>
                      <strong>{event.actorName || 'Customer/system'}</strong> ·{' '}
                      {orderStage(event.toStatus)}{' '}
                      <span className="text-[#675B4E]">
                        · {formatOrderTime(event.createdAt)}
                      </span>
                    </p>
                    {event.note ? (
                      <p className="wrap-anywhere text-[#46536F]">
                        {event.note}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-[#46536F]">
              No recorded activity for this order.
            </p>
          )}
        </section>
      </div>
      <div className="space-y-5">
        <section id="customer" className={panel + ' scroll-mt-20'}>
          <h2 className="font-semibold">Customer &amp; delivery</h2>
          <p className="mt-2 break-words text-sm font-semibold">
            {address.recipientName}
          </p>
          <p className="mt-2 wrap-anywhere text-sm leading-relaxed text-[#46536F]">
            {order.customerPhone}
            <br />
            {order.customerEmail}
            <br />
            {address.locality}
            {address.landmark ? ', near ' + address.landmark : ''}
            <br />
            Ward {address.ward || '—'}, {address.municipality}
            <br />
            {address.district}, {address.province}, Nepal
          </p>
          {address.location ? (
            <a
              href={`https://www.openstreetmap.org/?mlat=${address.location.latitude}&mlon=${address.location.longitude}#map=17/${address.location.latitude}/${address.location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-sm underline"
            >
              Open delivery pin
            </a>
          ) : null}
          {courierNames.length ? (
            <p className="mt-2 wrap-anywhere text-sm text-[#46536F]">
              Courier ·{' '}
              <strong className="text-[#14213D]">
                {courierNames.join(', ')}
              </strong>
              {pickupAt ? ' · Pickup ' + formatOrderTime(pickupAt) : ''}
            </p>
          ) : null}
        </section>
        <section id="seller" className={panel + ' scroll-mt-20'}>
          <h2 className="font-semibold">
            {sellers.size === 1 ? 'Seller' : 'Sellers'}
          </h2>
          <ul className="mt-1">
            {[...sellers].map(([sellerId, name]) => (
              <li
                key={sellerId}
                className="wrap-anywhere text-sm font-semibold"
              >
                {canOpenSeller ? (
                  <Link
                    className="inline-flex min-h-11 items-center underline"
                    href={withAdminReturnTo(
                      '/admin/sellers/' + encodeURIComponent(sellerId),
                      detailHref + '#seller',
                    )}
                  >
                    {name}
                  </Link>
                ) : (
                  <span className="block py-2">{name}</span>
                )}
              </li>
            ))}
          </ul>
          {sellerPhone ? (
            <a
              href={sellerPhone}
              className="inline-flex min-h-11 items-center text-sm underline"
            >
              Call seller
            </a>
          ) : null}
        </section>
        <section className={panel}>
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-x-3">
            <h2 className="font-semibold">Money</h2>
            <a
              href="#money"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-[#A8232E] underline"
            >
              Details
            </a>
          </div>
          <div className="flex flex-wrap justify-between gap-x-3 text-sm text-[#46536F]">
            <span>
              {order.paymentMode === 'cod'
                ? 'Cash on delivery total'
                : 'Order total'}
            </span>
            <strong className="text-[#14213D]">
              {money(order.grandTotalPaisa)}
            </strong>
          </div>
        </section>
      </div>
    </div>
  );
}
