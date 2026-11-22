import Link from 'next/link';
import Image from 'next/image';
import { Clock3, Landmark, Package, Search, Star } from 'lucide-react';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
import { CustomerParcelProgress } from '@/components/storefront/customer-parcel-progress';
import { CustomerYourTurnCard } from '@/components/storefront/customer-your-turn-card';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import {
  customerOrderTabs,
  selectCustomerOrders,
  type CustomerOrderSummary,
  type CustomerOrderTab,
} from '@/lib/orders/customer-order-list';
import { customerDate, customerDateTime, customerParcelState } from '@/lib/orders/customer-parcel-state';

const primary = 'inline-flex min-h-11 items-center justify-center rounded-[9px] bg-[#14213D] px-4 text-center text-sm font-semibold text-white hover:bg-[#23365a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';
const attention = 'inline-flex min-h-11 items-center justify-center rounded-[9px] bg-[#A8232E] px-4 text-center text-sm font-semibold text-white hover:bg-[#8f1e27] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';
const outline = 'inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#D4C1A6] px-4 text-center text-sm font-semibold text-[#14213D] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';

function orderPath(order: CustomerOrderSummary) {
  return '/orders/' + encodeURIComponent(order.orderNumber);
}

function reviewPath(order: CustomerOrderSummary) {
  return '/account/reviews/' + encodeURIComponent(order.orderNumber);
}

function paymentPath(order: CustomerOrderSummary) {
  return '/account/payments/' + encodeURIComponent(order.id);
}

export function CustomerOrderList({ orders, tab, query }: {
  orders: readonly CustomerOrderSummary[];
  tab: CustomerOrderTab;
  query: string;
}) {
  const questions = orders.flatMap(order => order.questions);
  const payments = orders.filter(order => order.bankAction);
  const reviews = orders.filter(order => order.parcels.some(parcel => parcel.items.some(item => item.reviewable)));
  const needsAction = questions.length + payments.length + reviews.length;
  const visible = selectCustomerOrders(orders, tab, query);
  return (
    <div className="min-w-0 space-y-7 text-[#14213D]">
      {needsAction ? (
        <section aria-labelledby="orders-your-turn" className="space-y-2.5">
          <h2 id="orders-your-turn" className="flex flex-wrap items-center gap-2.5 text-lg font-semibold">
            <CustomerActingChip actor="you" yourTurn />
            {needsAction === 1 ? '1 thing needs you' : `${needsAction} things need you`}
          </h2>
          {questions.map(question => (
            <CustomerYourTurnCard key={question.id} icon={<Clock3 className="size-5" />} title={`Keep your parcel from ${question.sellerName} or cancel it?`}
              description={`${question.orderNumber} · Proposed ready date ${customerDate(question.proposedReadyAt)}`}
              action={<Link href={`/account/order-responses/${encodeURIComponent(question.id)}`} className={attention}>Answer</Link>} />
          ))}
          {payments.map(order => (
            <CustomerYourTurnCard key={order.id} icon={<Landmark className="size-5" />}
              title={order.claimStatus === 'needs_information' ? `Update your payment for ${order.orderNumber}` :
                order.remainingPaisa !== null ? `Transfer ${formatPaisaExact(order.remainingPaisa)} for ${order.orderNumber}` : `View bank transfer for ${order.orderNumber}`}
              description={order.claimStatus === 'needs_information' ? 'We need a little more information to check your transfer.' : order.paymentDeadline ? `Pay by ${customerDateTime(order.paymentDeadline)} Nepal time.` : undefined}
              action={<Link href={paymentPath(order)} className={primary}>{order.claimStatus === 'needs_information' ? 'Update payment' : 'How to pay'}</Link>} />
          ))}
          {reviews.map(order => (
            <CustomerYourTurnCard key={order.id} icon={<Star className="size-5" />} title="How were your items?"
              description={`${order.orderNumber} · Share a review with other shoppers and the makers.`}
              action={<Link href={reviewPath(order)} className={outline}>Rate items</Link>} />
          ))}
        </section>
      ) : null}
      <section aria-label="Order list" className="min-w-0 space-y-4">
        <nav aria-label="Order status filters" className="grid grid-cols-2 border-b border-[#E3D6C3] sm:flex sm:flex-wrap">
          {customerOrderTabs.map(([key, label]) => {
            const active = tab === key;
            const count = selectCustomerOrders(orders, key, '').length;
            const search = new URLSearchParams({ tab: key });
            if (query) search.set('q', query);
            return (
              <Link key={key} href={`/account/orders?${search}`} aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2 border-b-2 px-2 py-2 text-sm sm:px-3.5 ${active ? 'border-[#A8232E] font-bold' : 'border-transparent text-[#465573] hover:text-[#A8232E]'}`}>
                {label}
                {count > 0 ? <span className={`rounded-full px-1.5 text-xs font-bold ${active ? 'bg-[#14213D] text-white' : 'bg-[#EBE2D3]'}`}>{count}</span> : null}
              </Link>
            );
          })}
        </nav>
        <form data-form-id="account.order-search" action="/account/orders" method="get" className="account-surface flex min-w-0 items-center gap-2 rounded-[10px] border border-[#D4C1A6] bg-white px-3 focus-within:outline-2 focus-within:outline-[#14213D]">
          <input type="hidden" name="tab" value={tab} />
          <Search className="size-4 shrink-0 text-[#655848]" aria-hidden="true" />
          <label htmlFor="my-order-search" className="sr-only">Search by order number, item or seller</label>
          <input type="search" id="my-order-search" name="q" defaultValue={query} maxLength={100} className="min-h-11 min-w-0 flex-1 text-sm outline-none"
            placeholder="Search by order number, item or seller" />
          {query ? <Link className="inline-flex min-h-11 items-center px-1 text-sm font-semibold" href={`/account/orders?tab=${tab}`}>Clear</Link> : null}
          <button type="submit" className="inline-flex min-h-11 items-center px-1 text-sm font-semibold">Search</button>
        </form>
        {tab === 'help' ? (
          <Link href="/account/refunds" className={outline}>View returns, requests and refunds</Link>
        ) : null}
        {visible.length ? visible.map(order => <OrderCard key={order.id} order={order} />) : (
          <div className="account-surface rounded-[15px] border border-[#E3D6C3] bg-[#FDFAF5] p-5">
            <p className="font-semibold">{query ? 'No orders match that search.' : !orders.length ? 'Your orders will appear here.' : 'There are no orders in this view.'}</p>
            <p className="mt-1 text-sm text-[#465573]">{query ? 'Try a different order number, item or seller.' : !orders.length ? 'Check out while signed in to follow each parcel here.' : 'Choose another tab to see your other orders.'}</p>
            {!orders.length ? <Link href="/shop" className={`${outline} mt-3`}>Explore the shop</Link> : null}
          </div>
        )}
      </section>
    </div>
  );
}

function OrderCard({ order }: { order: CustomerOrderSummary }) {
  const base = orderPath(order);
  return (
    <article className="account-surface min-w-0 overflow-hidden rounded-[15px] border border-[#E3D6C3] bg-[#FDFAF5]">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-0 border-b border-[#E3D6C3] px-4 py-2 text-sm sm:px-5">
        <h3 className="font-bold">{order.orderNumber}</h3>
        <p className="text-[#465573]">Placed {customerDate(order.placedAt)}</p>
        <p className="text-[#465573]">{formatPaisaExact(order.grandTotalPaisa)} · {order.paymentMode === 'prepaid' ? 'Bank transfer' : 'Cash on delivery'}</p>
        <Link href={base} className="ml-auto inline-flex min-h-11 items-center font-semibold text-[#A8232E] underline underline-offset-4">Order details</Link>
      </header>
      <ul className="divide-y divide-[#E3D6C3]">
        {order.parcels.map(parcel => {
          const question = order.questions.find(value => value.sellerId === parcel.sellerId);
          const state = customerParcelState({ status: parcel.status, bankDue: order.bankAction, bankReview: order.bankReview, codPending: order.firstCodPending, proposedDate: Boolean(question) });
          const preview = parcel.items.find(item => item.mediaId) ?? parcel.items[0];
          const parcelPath = `${base}#parcel-${encodeURIComponent(parcel.sellerId)}`;
          const mayCancel = !question && !order.bankAction && !order.bankReview &&
            ['placed', 'confirmed', 'packing', 'ready_for_pickup'].includes(parcel.status);
          const action = question ? { href: `/account/order-responses/${encodeURIComponent(question.id)}`, label: 'Keep it or cancel', className: attention }
            : order.bankAction ? { href: paymentPath(order), label: order.claimStatus === 'needs_information' ? 'Update payment' : 'How to pay', className: attention }
            : order.bankReview ? { href: paymentPath(order), label: 'View payment', className: outline }
            : parcel.items.some(item => item.reviewable) ? { href: reviewPath(order), label: 'Rate items', className: outline }
            : parcel.status === 'delivery_failed' ? { href: `${base}#order-help`, label: 'Get help', className: outline }
            : state.actor === 'courier' ? { href: parcelPath, label: 'Track parcel', className: primary }
            : { href: parcelPath, label: 'View parcel', className: outline };
          return (
            <li key={parcel.sellerId} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5">
              {preview?.mediaId ? (
                <Image src={`/api/product-media/${encodeURIComponent(preview.mediaId)}`} alt="" width={54} height={54} data-media-mode="cover" unoptimized className="size-12 rounded-[9px] border border-[#E3D6C3] object-cover sm:size-14" />
              ) : <div className="grid size-12 place-items-center rounded-[9px] bg-[#F1E4C5] sm:size-14"><Package className="size-5" aria-hidden="true" /></div>}
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">{state.label} <CustomerActingChip actor={state.actor} yourTurn={state.actor === 'you'} /></p>
                <p className="mb-2 mt-1 text-sm text-[#465573]">
                  {preview?.name ? `${preview.name} · ` : ''}{parcel.sellerName}
                  {question ? ` · Proposed ready date ${customerDate(question.proposedReadyAt)}` : null}
                  {parcel.codPaisa !== null && !['delivered', 'returned'].includes(parcel.status) ? ` · Cash to give the courier ${formatPaisaExact(parcel.codPaisa)}` : null}
                </p>
                {parcel.status !== 'cancelled' ? <div className="max-w-[30rem]"><CustomerParcelProgress stage={state.stage} condition={state.condition} /></div> : null}
              </div>
              <div className="col-span-2 grid min-w-0 gap-1 sm:col-span-1">
                <Link href={action.href} className={action.className}>{action.label}</Link>
                {mayCancel ? <Link href={`${base}?cancel=1&parcel=${encodeURIComponent(parcel.sellerId)}`} className="inline-flex min-h-11 items-center justify-center rounded-md px-2 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]">Cancel parcel</Link> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {!order.parcels.length ? <p className="flex flex-wrap items-center gap-2 px-4 py-4 text-sm text-[#465573]">
        <CustomerActingChip actor={customerParcelState({ status: order.status, codPending: order.firstCodPending, bankDue: order.bankAction, bankReview: order.bankReview }).actor} />
        Open the order to see its saved details.
      </p> : null}
    </article>
  );
}
