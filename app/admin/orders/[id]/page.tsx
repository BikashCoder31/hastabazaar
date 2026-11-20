import { AdminPageTitle } from '@/components/admin/page-help';
import {StaffReviewAccessBoundary} from '@/components/admin/staff-review-access-boundary';
import {ReviewBackLink} from '@/components/admin/review-back-link';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import {OrderOfferDetails} from '@/components/commerce/order-offer-details';
import { FirstCodConfirmation } from '@/components/admin/first-cod-confirmation';
import { PlatformServiceFeeRefund } from '@/components/admin/platform-service-fee-refund';
import { serviceFeeRefundSummary } from '@/lib/db/repositories/platform-service-fee-refunds';
import { getFirstCodReview } from '@/lib/orders/first-cod-review';
import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import { CancellationReviewSection } from '@/components/admin/cancellation-review-section';
import { ExceptionOrderSection } from '@/components/admin/exception-order-section';
import { InvoiceAdjustmentForm } from '@/components/admin/invoice-adjustment-form';
import { LiveInvoiceAdjustmentForm } from '@/components/admin/live-invoice-adjustment-form';
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
import { getDelivery, publicDelivery } from '@/lib/delivery/repository';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Banknote, MapPin, PackageCheck, Truck } from 'lucide-react';

import { AdminOrderFulfillmentActions } from '@/components/admin/order-fulfillment-actions';
import { listCompanyPreparationGroups } from '@/lib/db/repositories/fulfillment';
import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getOperationsOrderDetail } from '@/lib/db/repositories/fulfillment';
import { listManagedInvoiceGroupsForOrder } from '@/lib/db/repositories/managed-documents';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { can } from '@/lib/marketplace/permissions';
import { readOrderMarketplaceFeeViews } from '@/lib/db/repositories/fee-waivers';
import { OrderMarketplaceFees } from '@/components/seller/order-marketplace-fees';
import { readOrderCustomerServiceFees } from '@/lib/db/repositories/customer-service-fees';
import { CustomerServiceFeeBreakdown } from '@/components/commerce/customer-service-fee-breakdown';

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
  searchParams?: Promise<{
    deliveryAfterAt?: string;
    deliveryAfterId?: string;
    returnTo?:string;
  }>;
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
  const [marketplaceFees, customerFees] = await Promise.all([
    readOrderMarketplaceFeeViews(db,order.items.map(item=>item.id)),
    readOrderCustomerServiceFees(db,[id]),
  ]);
  const customerFee=customerFees.get(id);
  const codReview = await getFirstCodReview(db, id);
  const feeSummary = staff.role==='super_admin' ? await serviceFeeRefundSummary(db,id) : null;
  const codPending =
    codReview?.status === 'pending' && order.status !== 'cancelled';
  const companyPreparation = staff.role==='super_admin' && !codPending
    ? await listCompanyPreparationGroups(db,id) : [];
  const query = await searchParams;
  let deliveryAfter;
  try {
    deliveryAfter = readHistoryCursor(
      query?.deliveryAfterAt,
      query?.deliveryAfterId,
    );
  } catch {
    notFound();
  }
  const returnTo=safeAdminReturnTo(query?.returnTo,'/admin/orders');
  const detailParams=new URLSearchParams();if(deliveryAfter){detailParams.set('deliveryAfterAt',String(deliveryAfter.createdAt));detailParams.set('deliveryAfterId',deliveryAfter.id);}
  const detailHref=withAdminReturnTo(`/admin/orders/${encodeURIComponent(id)}${detailParams.size?'?'+detailParams:''}`,returnTo);
  const deliveryAnswers = staff.role === 'super_admin' ? await listFormAnswersForSubjectPage(db, {
    subjectType: 'order',
    subjectId: id,
    formId: 'staff.delivery-assignment',
    after: deliveryAfter,
  }) : { answers: [], nextCursor: null };
  if (
    (
      await Promise.all(
        deliveryAnswers.answers.map((answer) =>
          authorizeFormAnswerRead(
            db,
            { id: staff.id, role: staff.role },
            answer,
          ),
        ),
      )
    ).some((allowed) => !allowed)
  )
    notFound();
  const [parcels, cash, compensation, invoiceGroups] = await Promise.all([
    listParcels(db, id),
    parcelCashRecords(db, id).then(records => staff.role === 'super_admin' ? records : records.filter(record => record.riderId === null)),
    staff.role === 'super_admin' ? riderCompensationEntries(db, id) : Promise.resolve([]),
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
  const assignedRider = staff.role === 'super_admin' ? await requireDatabase(
    env as unknown as { DB?: D1Database },
  )
    .prepare(
      'SELECT users.email FROM delivery_assignments JOIN users ON users.id=delivery_assignments.rider_user_id WHERE delivery_assignments.order_id=?',
    )
    .bind(id)
    .first<{ email: string }>() : null;
  const rawDelivery = await getDelivery(
    requireDatabase(env as unknown as { DB?: D1Database }),
    id,
  );
  const delivery = staff.role === 'super_admin' ? rawDelivery : publicDelivery(rawDelivery);
  const visibleParcels = staff.role === 'super_admin' ? parcels : parcels.filter(p => p.method !== 'own_rider').map(p => ({ ...p, riderUserId: null, latitude: null, longitude: null, accuracy: null, positionAt: null, riderFinanceSnapshotJson: null }));
  return (
    <StaffReviewAccessBoundary actorId={staff.id} sourceId={id}><div>
      <Link href={withAdminReturnTo(`/admin/order-responses/${encodeURIComponent(id)}`,detailHref)} className="text-sm underline">Preparation issues and next updates</Link>
      {customerFee?<section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 font-heading text-xl">Customer service fee at placement</h2>
        <CustomerServiceFeeBreakdown {...customerFee} campaignName={customerFee.campaign?.name??null}
          source={customerFee.source==='legacy_recorded'?'historical':'recorded'}/>
        <p className="mt-3 text-sm">Customer service fee after cancellations: {money(order.buyerPlatformFeePaisa)}.</p>
      </section>:null}
      {feeSummary && feeSummary.chargedPaisa > 0 ? <div className="mb-6"><PlatformServiceFeeRefund actorId={staff.id} orderId={id} {...feeSummary}/></div> : null}
      <CancellationReviewSection db={db} orderId={id} actorId={staff.id}/>
      <StaffFormHistoryLinks
        returnTo={detailHref}
        entries={[
          {
            kind: 'order-fulfillment',
            subjectId: id,
            label: 'Fulfillment answers',
          },
          {
            kind: 'order-fulfillment-cancellation',
            label: 'Fulfillment cancellation answers',
          },
          {
            kind: 'order-fulfillment-cancellation-review',
            label: 'Fulfillment review answers',
          },
          {
            kind: 'cancellation-approved',
            label: 'Approved cancellation answers',
          },
          {
            kind: 'cancellation-rejected',
            label: 'Rejected cancellation answers',
          },
        ]}
      />
      <OrderMarketplaceFees fees={marketplaceFees}/>
      <ReviewBackLink returnTo={returnTo} actorId={staff.id}/>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <AdminPageTitle>
            <h1 className="font-heading text-4xl tracking-tight">
              {order.orderNumber}
            </h1>
          </AdminPageTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Placed {new Date(order.placedAt).toLocaleString('en-NP')}
          </p>
        </div>
        <OrderStatusBadge
          status={codPending ? 'awaiting_cod_confirmation' : order.status}
        />
      </div>
      {codPending ? <FirstCodConfirmation orderId={id} /> : null}
      {companyPreparation.length ? <section className="mt-6 space-y-4 rounded-2xl border bg-card p-5" aria-label="Company-store preparation">
        <h2 className="font-heading text-2xl">Company-store preparation</h2>
        <p className="text-sm text-muted-foreground">Super Admin prepares company-store items on behalf of each maker. Parcel dispatch, delivery and payment stay separate.</p>
        {companyPreparation.map(group=><div key={`${group.sellerId}:${group.status}`} className="min-w-0 space-y-3 rounded-lg border p-4">
          <p className="break-words font-semibold">{group.makerName} · {group.itemCount} item lines · {group.status.replaceAll('_',' ')}</p>
          <AdminOrderFulfillmentActions orderId={id} status={group.status} companySellerId={group.sellerId}/>
        </div>)}
      </section> : null}
      <div className="mt-6">
        <ParcelControls
          orderId={id}
          parcels={visibleParcels}
          records={staff.role === 'super_admin' ? cash : cash.filter(record => visibleParcels.some(parcel => parcel.id === record.jobId))}
          compensation={compensation}
          actorId={staff.id}
          isSuperAdmin={staff.role === 'super_admin'}
          returnTo={detailHref}
          canReviewIncoming={can(staff,'payment.receipt.verify')}
          canPrepare={
            !parcels.length && !codPending &&
            ['confirmed', 'packing', 'ready_for_pickup'].includes(order.status)
          }
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
                      <OrderOfferDetails offer={item.offerSnapshot} />
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
              !codPending &&
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
                  isSuperAdmin={staff.role === 'super_admin'}
                />
              ) : null}
              {staff.role === 'super_admin' ? <section className="mt-6 space-y-3 rounded-xl border p-5">
                <h3 className="font-semibold">
                  Saved delivery-assignment answers
                </h3>
                {deliveryAnswers.answers.length ? (
                  deliveryAnswers.answers.map((answer) => (
                    <AnswerDetails key={answer.id} answer={answer} />
                  ))
                ) : (
                  <p>No saved assignment answers.</p>
                )}
                {deliveryAnswers.nextCursor ? (
                  <Link
                    className="underline"
                    href={withAdminReturnTo(`/admin/orders/${encodeURIComponent(id)}?deliveryAfterAt=${deliveryAnswers.nextCursor.createdAt}&deliveryAfterId=${encodeURIComponent(deliveryAnswers.nextCursor.id)}`,returnTo)}
                  >
                    Next 50 answers
                  </Link>
                ) : null}
              </section> : null}
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
                <dt>Platform service fee (included)</dt>
                <dd>{money(order.buyerPlatformFeePaisa)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Legally required fee refunds</dt>
                <dd>{money(feeSummary?.refundedPaisa??0)}</dd>
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
                Each issuer retains its original document and recorded financial scope.
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
                      {invoice.recordKind==='live'?'Actual commercial invoice':invoice.simulationLabel}
                    </span>
                  </li>
                ))}
              </ul>
              {invoiceGroups.some(invoice=>invoice.recordKind==='simulation') && (can(staff, 'tax_policy.manage') ? (
                <InvoiceAdjustmentForm
                  invoices={invoiceGroups.filter(invoice=>invoice.recordKind==='simulation')}
                  reasonCodes={adjustmentReasons}
                />
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Only a Super Admin with tax-policy authority can issue a
                  simulated correction document.
                </p>
              ))}
              {staff.role==='super_admin'&&can(staff,'refund.approve.standard')?invoiceGroups.filter(invoice=>invoice.recordKind==='live').map(invoice=><LiveInvoiceAdjustmentForm key={invoice.id} actorId={staff.id} invoiceId={invoice.id}/>):null}
            </section>
          ) : null}
        </aside>
      </div>
    </div></StaffReviewAccessBoundary>
  );
}
