import Link from 'next/link';
import { ArrowLeft, CalendarDays, FileText, MessageCircle } from 'lucide-react';
import { notFound } from 'next/navigation';
import { OrderOfferDetails } from '@/components/commerce/order-offer-details';
import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import { ParcelList } from '@/components/delivery/parcel-list';
import { SellerOrderFulfillmentActions } from '@/components/seller/order-fulfillment-actions';
import { OrderMarketplaceFees } from '@/components/seller/order-marketplace-fees';
import { NextStepBox } from '@/components/ui/next-step-box';
import { WhoseTurn } from '@/components/ui/whose-turn';
import type { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { companyDetails } from '@/lib/content/company-details';
import { readOrderMarketplaceFeeViews } from '@/lib/db/repositories/fee-waivers';
import { getSellerOrderDetail, type ItemFulfillmentStatus } from '@/lib/db/repositories/fulfillment';
import { customerParcel, listParcels } from '@/lib/operations/parcels';
import { getFirstCodReview } from '@/lib/orders/first-cod-review';
import { sellerMoney } from '@/lib/seller/presentation';
import { packedWeightSchemaAvailable, readPackedParcelPrefill } from '@/lib/shipping/packed-weight-storage';

const actionLink = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:border-[#14213D]';
const orderDetailObservedAt = () => Date.now();
const dateTime = new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' });
const timeline = [
  { id: 'placed', label: 'Order placed', actor: 'Customer' },
  { id: 'packing', label: 'Start preparing', actor: 'You' },
  { id: 'ready_for_pickup', label: 'Ready for pickup', actor: 'You' },
  { id: 'dispatched', label: 'Picked up by courier', actor: 'Courier' },
  { id: 'delivered', label: 'Delivered', actor: 'Courier' },
];

const flowOrder: ItemFulfillmentStatus[] = ['packing', 'confirmed', 'ready_for_pickup', 'dispatched', 'delivered', 'cancelled'];

export async function SellerOrderDetail({
  db, seller, id, stage, embedded = false,
}: {
  db: D1Database;
  seller: Awaited<ReturnType<typeof requireSellerCenterPage>>;
  id: string;
  stage?: ItemFulfillmentStatus;
  embedded?: boolean;
}) {
  if (!seller.sellerId) notFound();
  const order = await getSellerOrderDetail(db, id, seller.sellerId);
  if (!order) notFound();
  const status = stage ?? flowOrder.find(step => order.items.some(item => item.fulfillmentStatus === step)) ?? 'confirmed';
  const stageItems = order.items.filter(item => item.fulfillmentStatus === status);
  const reviewPath = `/seller/order-responses/${encodeURIComponent(id)}`;
  const [fees, codReview, parcels, payment, snapshots, restriction, issue, pickup, milestones] = await Promise.all([
    readOrderMarketplaceFeeViews(db, order.items.map(item => item.id)),
    getFirstCodReview(db, id),
    listParcels(db, id, seller.sellerId),
    order.paymentMode === 'manual_bank' || order.status === 'pending_payment'
      ? db.prepare('SELECT 1 FROM manual_payment_windows WHERE order_id=? AND paid_at IS NOT NULL AND released_at IS NOT NULL AND closed_at IS NULL').bind(id).first()
      : true,
    db.prepare(`SELECT i.id, i.commission_bps AS bps,
      EXISTS(SELECT 1 FROM order_fulfillment_holds h WHERE h.order_item_id=i.id AND h.prevents_preparation=1 AND h.ended_at IS NULL) AS held,
      EXISTS(SELECT 1 FROM managed_commercial_snapshots m
        WHERE m.order_item_id=i.id AND m.seller_id=i.seller_id AND m.legal_seller_reference=?) AS companyHandled
      FROM order_items i WHERE i.order_id=? AND i.seller_id=?`)
      .bind(companyDetails.entityReference, id, seller.sellerId).all<{ id: string; bps: number | null; held: number; companyHandled: number }>(),
    db.prepare(`SELECT 1 FROM seller_restrictions WHERE seller_id=? AND obligation_mode<>'allow_existing'
      AND (mode='disabled' OR (mode='suspended' AND suspended_until>?))`).bind(seller.sellerId, orderDetailObservedAt()).first(),
    db.prepare(`SELECT c.public_message AS message, c.next_update_at AS updateAt FROM order_response_cases c
      JOIN order_response_portions p ON p.id=c.portion_id WHERE p.order_id=? AND p.seller_id=? AND p.operator_mode='seller'
      AND c.state NOT IN ('resolved','closed') ORDER BY c.created_at DESC LIMIT 1`)
      .bind(id, seller.sellerId).first<{ message: string | null; updateAt: number | null }>(),
    db.prepare(`SELECT p.courier_name AS courierName, j.pickup_window_start AS startAt, j.pickup_window_end AS endAt
      FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id
      WHERE j.order_id=? AND j.seller_id=? AND j.direction='outbound' AND p.method='courier'
        AND j.status IN ('pickup_requested','label_pending','label_ready','pickup_scheduled')
      ORDER BY j.pickup_window_start,j.id LIMIT 1`)
      .bind(id, seller.sellerId).first<{ courierName: string | null; startAt: number | null; endAt: number | null }>(),
    db.prepare(`SELECT e.order_item_id AS itemId, e.to_status AS status, MAX(e.created_at) AS at
      FROM order_item_status_events e JOIN order_items i ON i.id=e.order_item_id
      WHERE i.order_id=? AND i.seller_id=? GROUP BY e.order_item_id,e.to_status`)
      .bind(id, seller.sellerId).all<{ itemId: string; status: ItemFulfillmentStatus; at: number }>(),
  ]);
  const codPending = Boolean(codReview && codReview.status !== 'confirmed' && order.status !== 'cancelled');
  const snapshotById = new Map(snapshots.results.map(row => [row.id, row]));
  const active = status === 'confirmed' || status === 'packing';
  const actionableItems = stageItems.filter(item => {
    const snapshot = snapshotById.get(item.id);
    return snapshot && !snapshot.held && !snapshot.companyHandled;
  });
  const canAct = active && !codPending && Boolean(payment) && !restriction && seller.approvedSeller && actionableItems.length > 0 &&
    (order.status === 'confirmed' || order.status === 'packing' || order.status === 'dispatched' && parcels.length > 0);
  const parcelWeight = canAct && status === 'packing' && await packedWeightSchemaAvailable(db)
    ? { prefilledGrams: await readPackedParcelPrefill(db, id, seller.sellerId) }
    : undefined;
  const done = status === 'delivered' || status === 'cancelled';
  const turn = done ? 'done' : canAct ? 'your-turn' : 'with-hastabazaar';
  const courier = parcels.find(parcel => parcel.courierName && !['cancelled', 'returned'].includes(parcel.status));
  const bookedCourier = pickup?.courierName ?? courier?.courierName;
  const bookedSlot = pickup?.startAt == null ? '' : pickup.endAt != null && pickup.endAt >= pickup.startAt
    ? dateTime.formatRange(pickup.startAt, pickup.endAt) : dateTime.format(pickup.startAt);
  const bookingMessage = status === 'ready_for_pickup' && bookedCourier
    ? `Courier booked: ${bookedCourier}${bookedSlot ? `, ${bookedSlot}` : ''}.` : '';
  const collected = order.paymentMode === 'cod' && Boolean(courier && courier.codDuePaisa > 0 && courier.collectedPaisa >= courier.codDuePaisa);
  const stageItemIds = new Set(stageItems.map(item => item.id));
  const completedAt = new Map<string, number>();
  for (const event of milestones.results) {
    if (stageItemIds.has(event.itemId)) completedAt.set(event.status, Math.max(event.at, completedAt.get(event.status) ?? 0));
  }
  const commission = order.items.reduce((total, item) => total + item.commissionPaisa, 0);
  const subtotal = order.items.reduce((total, item) => total + item.lineTotalPaisa, 0);
  const rates = new Set(snapshots.results.map(row => row.bps));
  const firstRate = rates.size === 1 ? rates.values().next().value : null;
  const percent = typeof firstRate === 'number' ? `${firstRate / 100}%` : null;
  const title = stageItems[0]?.productName ?? order.items[0]?.productName ?? 'Order details';
  let progressTitle = 'With Hastabazaar';
  let progressText = 'Hastabazaar is coordinating the next step.';
  if (done) {
    progressTitle = status === 'delivered' ? 'Delivered' : 'Cancelled';
    progressText = status === 'delivered' ? 'The courier has delivered these items.' : 'These items are no longer going ahead.';
  } else if (canAct) {
    progressTitle = status === 'packing' ? 'Your turn: mark ready for pickup' : 'Your turn: start preparing';
    progressText = status === 'packing' ? 'Mark ready once the items are packed. Hastabazaar will book the courier.' : 'Use the button when you begin making or packing these items.';
  } else if (codPending) {
    progressText = 'Hastabazaar is confirming this cash-on-delivery order before preparation begins.';
  } else if (!payment) {
    progressText = 'Hastabazaar is reviewing payment before releasing these items for preparation.';
  } else if (status === 'ready_for_pickup') {
    progressText = bookingMessage || 'Hastabazaar will book pickup with the courier.';
  } else if (status === 'dispatched') {
    progressText = courier ? `${courier.courierName} is handling delivery.` : 'The courier is handling delivery.';
  }
  if (issue && !done && !canAct) progressText = issue.message ?? 'Hastabazaar is reviewing the preparation issue.';
  const trackingIndex = status === 'confirmed' ? 1 : status === 'packing' ? 2 : status === 'ready_for_pickup' ? 3 : 4;
  const detailControl = <Link href={reviewPath} className={actionLink}><CalendarDays className="size-4" aria-hidden="true" />{active || status === 'ready_for_pickup' ? 'Running late?' : 'Preparation updates'}</Link>;

  return <article id="order-details" tabIndex={-1} aria-labelledby="seller-order-detail-title"
    className="min-w-0 scroll-mt-28 space-y-5 rounded-2xl border bg-[#FCF9F4] p-4 text-[#14213D] md:p-5">
    {embedded ? null : <Link href="/seller/orders" className="section-link min-h-11"><ArrowLeft className="size-4" />Back to orders</Link>}
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="break-words font-mono text-xs text-muted-foreground">{order.orderNumber}</p>
        <h2 id="seller-order-detail-title" className="mt-1 break-words font-heading text-2xl md:text-3xl">{title}</h2>
      </div>
      <WhoseTurn status={turn} />
    </div>
    <NextStepBox title={progressTitle} className={canAct ? 'bg-[#F0EEE9]' : undefined}>{progressText}
      {bookingMessage && progressText !== bookingMessage ? <p>{bookingMessage}</p> : null}
      {!done && issue?.updateAt ? <p>Next update {dateTime.format(issue.updateAt)}</p> : null}
    </NextStepBox>
    {seller.approvedSeller ? <SellerOrderFulfillmentActions key={id} actorId={seller.userId} orderId={id} items={canAct ? actionableItems : []} parcelWeight={parcelWeight} /> : null}
    {detailControl}
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Customer</dt><dd className="break-words font-semibold">{order.address.recipientName}</dd>
      <dt className="text-muted-foreground">Deliver to</dt><dd className="break-words">{[order.address.locality, order.address.municipality, order.address.district].filter(Boolean).join(', ')}</dd>
      <dt className="text-muted-foreground">Payment</dt><dd>{order.paymentMode === 'cod' ? 'Cash on delivery' : 'Prepaid'} · {sellerMoney(subtotal)}</dd>
      <dt className="text-muted-foreground">{status === 'cancelled' ? 'Recorded proceeds' : 'You receive'}</dt><dd><strong className="text-[#236548]">{sellerMoney(subtotal - commission)}</strong> <span className="text-muted-foreground">after {percent ? `${percent} ` : ''}recorded commission</span></dd>
    </dl>
    <ol aria-label="Order progress" className="space-y-1 border-t pt-4">
      {(status === 'cancelled' ? [timeline[0], { id: 'cancelled', label: 'Cancelled', actor: 'Hastabazaar' }] : timeline).map((step, index) => {
        const complete = index < trackingIndex || done;
        const current = !done && index === trackingIndex;
        const when = index === 0 ? order.placedAt : complete ? completedAt.get(step.id) ??
          (step.id === 'cancelled' ? order.cancelledAt : step.id === 'delivered' ? courier?.deliveredAt ?? order.deliveredAt : null) : null;
        return <li key={step.id} aria-current={current ? 'step' : undefined} className="flex min-h-9 items-start gap-2 text-sm">
          <span aria-hidden="true" className={`mt-1 size-3 shrink-0 rounded-full border-2 ${complete ? 'border-[#236548] bg-[#236548]' : current ? 'border-[#A8232E]' : 'border-[#D3C5B0]'}`} />
          <div className={`min-w-0 flex-1 ${complete || current ? 'font-semibold' : 'text-muted-foreground'}`}>
            {step.label}{step.id === 'delivered' && collected ? ', cash collected' : ''}
            {when ? <span className="ml-1 text-xs font-normal text-muted-foreground">{dateTime.format(when)}</span> : null}
          </div>
          <span className="text-xs text-muted-foreground">{(step.actor === 'You' && status === 'confirmed' && !canAct) || (step.actor === 'You' && stageItems.every(item => snapshotById.get(item.id)?.companyHandled)) ? 'Hastabazaar' : step.actor}</span>
        </li>;
      })}
    </ol>
    <div className="flex flex-wrap gap-2">
      <Link href="#packing-details" className={actionLink}><FileText className="size-4" aria-hidden="true" />Packing details</Link>
      <Link href="/seller/requests" className={actionLink}><MessageCircle className="size-4" aria-hidden="true" />Ask Hastabazaar</Link>
    </div>
    <details id="packing-details" className="scroll-mt-28 rounded-xl border bg-card px-3" open>
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Your items and shipping</summary>
      <div className="space-y-3 pb-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Whole order</span><OrderStatusBadge status={codPending ? 'awaiting_cod_confirmation' : order.status} /></div>
        <p>Pack securely and keep {order.orderNumber} on the parcel.</p>
        <ul className="divide-y">
          {order.items.map(item => <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
            <div className="min-w-0"><strong className="break-words">{item.productName} × {item.quantity}</strong><p className="break-words text-muted-foreground">SKU {item.sku}</p><OrderOfferDetails offer={item.offerSnapshot} /></div>
            <div className="space-y-1"><OrderStatusBadge status={codPending ? 'awaiting_cod_confirmation' : item.fulfillmentStatus} /><p>{sellerMoney(item.lineTotalPaisa)}</p></div>
          </li>)}
        </ul>
        <p className="break-words">Customer phone {order.customerPhone}</p>
        <p>Delivery charge {sellerMoney(order.deliveryChargePaisa)} · estimated arrival {order.estimatedMinDays}–{order.estimatedMaxDays} days</p>
        {order.deliveryPricing ? <p className="text-xs text-muted-foreground">
          {sellerMoney(order.deliveryPricing.baseChargePaisa)} for the first store plus half of that base for each additional store.
          {' '}{order.deliveryPricing.currentStoreCount} of {order.deliveryPricing.originalStoreCount} stores remain.
        </p> : <p className="text-xs text-muted-foreground">This historical order retains its recorded delivery charge.</p>}
        <p className="break-words capitalize">Shipment {order.shipmentStatus.replaceAll('_', ' ')}{order.trackingCode ? ` · ${order.trackingCode}` : ''}</p>
        <OrderMarketplaceFees fees={fees} />
        <ParcelList parcels={parcels.map(parcel => customerParcel(parcel))} />
      </div>
    </details>
  </article>;
}
