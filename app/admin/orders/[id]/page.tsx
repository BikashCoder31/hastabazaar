import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import { CancellationReviewSection } from '@/components/admin/cancellation-review-section';
import { ExceptionOrderSection } from '@/components/admin/exception-order-section';
import { InvoiceAdjustmentForm } from '@/components/admin/invoice-adjustment-form';
import { ParcelControls } from '@/components/admin/parcel-controls';
import {
  listParcels,
  parcelCashRecords,
  riderCompensationEntries,
} from '@/lib/operations/parcels';
import { DeliveryAssignment } from '@/components/delivery/delivery-assignment';
import { AnswerDetails } from '@/components/forms/answer-details';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import { readHistoryCursor } from '@/lib/forms/rider-history';
import { getDelivery } from '@/lib/delivery/repository';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Banknote, MapPin, PackageCheck, Truck } from 'lucide-react';

import { AdminOrderFulfillmentActions } from '@/components/admin/order-fulfillment-actions';
import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getOperationsOrderDetail } from '@/lib/db/repositories/fulfillment';
import { listManagedInvoiceGroupsForOrder } from '@/lib/db/repositories/managed-documents';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { can } from '@/lib/marketplace/permissions';

export const dynamic = 'force-dynamic';
const invoiceSettingsObservedAt = () => Date.now();

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ deliveryAfterAt?: string; deliveryAfterId?: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaffPage(`/admin/orders/${id}`, 'order.manage');
  const order = await getOperationsOrderDetail(
    requireDatabase(env as unknown as { DB?: D1Database }),
    id,
  );
  if (!order) notFound();
  const address = order.address;
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const query = await searchParams;
  let deliveryAfter;
  try { deliveryAfter = readHistoryCursor(query?.deliveryAfterAt, query?.deliveryAfterId); }
  catch { notFound(); }
  const deliveryAnswers = await listFormAnswersForSubjectPage(db, {
    subjectType: 'order', subjectId: id, formId: 'staff.delivery-assignment',
    after: deliveryAfter,
  });
  if ((await Promise.all(deliveryAnswers.answers.map((answer) =>
    authorizeFormAnswerRead(db, { id: staff.id, role: staff.role }, answer))))
    .some((allowed) => !allowed)) notFound();
  const [parcels, cash, compensation, invoiceGroups] = await Promise.all([
    listParcels(db, id),
    parcelCashRecords(db, id),
    riderCompensationEntries(db, id),
    listManagedInvoiceGroupsForOrder(db, id),
  ]);
  const adjustmentReasons = can(staff, 'tax_policy.manage')
    ? (
        await getEffectiveBusinessSetting(
          db,
          'managed_adjustment_reason_codes',
          invoiceSettingsObservedAt(),
        )
      ).value
    : [];
  const assignedRider = await requireDatabase(
    env as unknown as { DB?: D1Database },
  )
    .prepare(
      'SELECT users.email FROM delivery_assignments JOIN users ON users.id=delivery_assignments.rider_user_id WHERE delivery_assignments.order_id=?',
    )
    .bind(id)
    .first<{ email: string }>();
  const delivery = await getDelivery(
    requireDatabase(env as unknown as { DB?: D1Database }),
    id,
  );
  return (
    <div>
      <CancellationReviewSection db={db} orderId={id} />
      <StaffFormHistoryLinks entries={[{kind:'order-fulfillment',subjectId:id,label:'Fulfillment answers'},
        {kind:'order-fulfillment-cancellation',label:'Fulfillment cancellation answers'},
        {kind:'order-fulfillment-cancellation-review',label:'Fulfillment review answers'},
        {kind:'cancellation-approved',label:'Approved cancellation answers'},
        {kind:'cancellation-rejected',label:'Rejected cancellation answers'}]} />
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to orders
      </Link>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Order fulfilment</p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">
            {order.orderNumber}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Placed {new Date(order.placedAt).toLocaleString('en-NP')}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="mt-6">
        <ParcelControls
          orderId={id}
          parcels={parcels}
          records={cash}
          compensation={compensation}
          actorId={staff.id}
          isSuperAdmin={staff.role === 'super_admin'}
          canPrepare={['confirmed', 'packing', 'ready_for_pickup'].includes(
            order.status,
          )}
        />
      </div>
      <ExceptionOrderSection db={db} orderId={id} staff={staff} />
      <div className="mt-8 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <PackageCheck className="size-5 text-primary" />
              <h2 className="font-heading text-2xl">Items and sellers</h2>
            </div>
            <div className="mt-5 divide-y">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <strong>
                      {item.productName} × {item.quantity}
                    </strong>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.sellerName} · SKU {item.sku}
                    </p>
                  </div>
                  <div className="sm:text-right">
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
              <h2 className="font-heading text-2xl">Customer and delivery</h2>
            </div>
            <div className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
              <div>
                <p className="font-semibold">Contact</p>
                <p className="mt-1 leading-6 text-muted-foreground">
                  {address.recipientName}
                  <br />
                  {order.customerPhone}
                  <br />
                  {order.customerEmail}
                </p>
              </div>
              <div>
                <p className="font-semibold">Address</p>
                <p className="mt-1 leading-6 text-muted-foreground">
                  {address.location ? (
                    <a
                      href={
                        'https://www.openstreetmap.org/?mlat=' +
                        address.location.latitude +
                        '&mlon=' +
                        address.location.longitude +
                        '#map=17/' +
                        address.location.latitude +
                        '/' +
                        address.location.longitude
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block underline"
                    >
                      Open delivery pin
                    </a>
                  ) : null}
                  {address.locality}
                  {address.landmark ? `, near ${address.landmark}` : ''}
                  <br />
                  Ward {address.ward || '—'}, {address.municipality}
                  <br />
                  {address.district}, {address.province}, Nepal
                </p>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <Truck className="size-5 text-primary" />
              <h2 className="font-heading text-2xl">Status history</h2>
            </div>
            <ol className="mt-5 space-y-4">
              {order.history.map((event) => (
                <li
                  key={event.id}
                  className="border-l-2 border-primary/30 pl-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={event.toStatus} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString('en-NP')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{event.note}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.actorName || 'Customer/system'}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Next action</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {parcels.length
                ? 'Dispatch each parcel after its seller marks the items ready. Record customer cash collection and carrier remittance separately.'
                : 'Legacy whole-order dispatch requires all sellers ready. Legacy delivery includes COD confirmation. Prepare seller parcels before dispatch to use separate cash records.'}
            </p>
            <div className="mt-5">
              {!parcels.length &&
              [
                'confirmed',
                'packing',
                'ready_for_pickup',
                'dispatched',
              ].includes(order.status) ? (
                <DeliveryAssignment
                  orderId={id}
                  current={delivery}
                  riderEmail={assignedRider?.email}
                />
              ) : null}
              <section className="mt-6 space-y-3 rounded-xl border p-5">
                <h3 className="font-semibold">Saved delivery-assignment answers</h3>
                {deliveryAnswers.answers.length ? deliveryAnswers.answers.map((answer) =>
                  <AnswerDetails key={answer.id} answer={answer} />) : <p>No saved assignment answers.</p>}
                {deliveryAnswers.nextCursor ? <Link className="underline" href={
                  `/admin/orders/${encodeURIComponent(id)}?deliveryAfterAt=${deliveryAnswers.nextCursor.createdAt}&deliveryAfterId=${encodeURIComponent(deliveryAnswers.nextCursor.id)}`
                }>Next 50 answers</Link> : null}
              </section>
              {!parcels.length ? (
                <AdminOrderFulfillmentActions
                  key={order.trackingCode ?? 'manual'}
                  initialTrackingCode={order.trackingCode}
                  orderId={order.id}
                  status={order.status}
                />
              ) : (
                <p className="text-sm">
                  Use the parcel controls above. Whole-order actions are
                  disabled for this order.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <Banknote className="size-5 text-primary" />
              <h2 className="font-heading text-2xl">Commercials</h2>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt>Items</dt>
                <dd>{money(order.itemSubtotalPaisa)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>{money(order.deliveryChargePaisa)}</dd>
              </div>
              <div className="flex justify-between border-t pt-3 font-semibold">
                <dt>COD total</dt>
                <dd>{money(order.grandTotalPaisa)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Payment</dt>
                <dd className="capitalize">{order.paymentStatus}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {order.deliveryPricing
                ? `Saved future-order policy: ${money(order.deliveryPricing.baseChargePaisa)} for the first store plus 50% per additional store; ${order.deliveryPricing.currentStoreCount} of ${order.deliveryPricing.originalStoreCount} stores remain.`
                : 'Historical delivery pricing is retained exactly as recorded for this order.'}
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Shipment</h2>
            <p className="mt-3 text-sm capitalize">
              {order.shipmentStatus.replaceAll('_', ' ')}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Reference: {order.trackingCode || 'Not assigned'}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Estimate: {order.estimatedMinDays}–{order.estimatedMaxDays} days
            </p>
          </section>
          {invoiceGroups.length ? (
            <section className="rounded-2xl border bg-card p-6">
              <h2 className="font-heading text-2xl">Issuer invoice records</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Each issuer remains a separate simulated document group.
                Corrections append documents and never rewrite the invoice
                snapshot.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {invoiceGroups.map((invoice) => (
                  <li key={invoice.id} className="rounded border p-3">
                    <strong>{invoice.invoiceNumber}</strong>
                    <span className="block">
                      {invoice.issuerReference} · {invoice.adjustmentCount}{' '}
                      correction documents
                    </span>
                    <span className="block text-xs text-amber-800">
                      {invoice.simulationLabel}
                    </span>
                  </li>
                ))}
              </ul>
              {can(staff, 'tax_policy.manage') ? (
                <InvoiceAdjustmentForm
                  invoices={invoiceGroups}
                  reasonCodes={adjustmentReasons}
                />
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Only a Super Admin with tax-policy authority can issue a
                  simulated correction document.
                </p>
              )}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
