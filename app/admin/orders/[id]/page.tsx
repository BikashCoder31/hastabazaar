import { AdminPageTitle } from '@/components/admin/page-help';
import { StaffReviewAccessBoundary } from '@/components/admin/staff-review-access-boundary';
import { ReviewBackLink } from '@/components/admin/review-back-link';
import {
  safeAdminReturnTo,
  withAdminReturnTo,
} from '@/lib/admin/return-context';
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
import { deliveryFailureSchemaAvailable } from '@/lib/shipping/delivery-failure';
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
import { ChevronLeft, Clock3, Phone } from 'lucide-react';

import { AdminOrderFulfillmentActions } from '@/components/admin/order-fulfillment-actions';
import { listCompanyPreparationGroups } from '@/lib/db/repositories/fulfillment';
import { OrderStageBadge } from '../order-stage-badge';
import {
  formatOrderTime,
  orderDeadline,
  orderMoney as money,
  orderPaymentMode,
  orderStage,
} from '../order-queue-presentation';
import { OrderDetailTabs, OrderMore } from './order-details-tabs';
import { OrderProgress } from './order-progress';
import { OrderOverview } from './order-overview';
import { readOrderProgress } from './read-order-progress';
import {
  getPaidManualReleaseReview,
  ManualPaymentError,
} from '@/lib/payments/manual-receipts';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getOperationsOrderDetail } from '@/lib/db/repositories/fulfillment';
import { listManagedInvoiceGroupsForOrder } from '@/lib/db/repositories/managed-documents';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { can } from '@/lib/marketplace/permissions';
import { readOrderMarketplaceFeeViews } from '@/lib/db/repositories/fee-waivers';
import { OrderMarketplaceFees } from '@/components/seller/order-marketplace-fees';
import { readOrderCustomerServiceFees } from '@/lib/db/repositories/customer-service-fees';
import { CustomerServiceFeeBreakdown, hasCustomerServiceFee } from '@/components/commerce/customer-service-fee-breakdown';

export const dynamic = 'force-dynamic';
const requestTime = () => Date.now();
const panel = 'min-w-0 rounded-[14px] border border-[#E4DACA] bg-card p-5';
const action =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#D4C2A6] px-3 text-sm font-semibold hover:bg-[#EEE5D5]';
const menuAction =
  'flex min-h-11 w-full items-center rounded-lg px-3 hover:bg-[#EEE5D5]';

function phoneHref(phone: string) {
  const number = phone.replace(/[^+0-9]/g, '');
  return /^\+?\d+$/.test(number) ? 'tel:' + number : null;
}

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    deliveryAfterAt?: string;
    deliveryAfterId?: string;
    returnTo?: string;
    tab?: string;
  }>;
}) {
  const { id } = await params;
  const staff = await requireStaffPage(`/admin/orders/${id}`, 'order.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const order = await getOperationsOrderDetail(db, id);
  if (!order) notFound();
  const address = order.address;
  const [marketplaceFees, customerFees] = await Promise.all([
    readOrderMarketplaceFeeViews(
      db,
      order.items.map((item) => item.id),
    ),
    readOrderCustomerServiceFees(db, [id]),
  ]);
  const customerFee = customerFees.get(id);
  const codReview = await getFirstCodReview(db, id);
  const feeSummary =
    staff.role === 'super_admin' ? await serviceFeeRefundSummary(db, id) : null;
  const codPending =
    codReview?.status === 'pending' && order.status !== 'cancelled';
  const companyPreparation =
    staff.role === 'super_admin' && !codPending
      ? await listCompanyPreparationGroups(db, id)
      : [];
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
  const returnTo = safeAdminReturnTo(query?.returnTo, '/admin/orders');
  const detailParams = new URLSearchParams();
  if (deliveryAfter) {
    detailParams.set('deliveryAfterAt', String(deliveryAfter.createdAt));
    detailParams.set('deliveryAfterId', deliveryAfter.id);
  }
  const defaultTab =
    query?.tab === 'records' || deliveryAfter
      ? 'records'
      : query?.tab === 'parcel-cash'
        ? 'parcel-cash'
        : query?.tab === 'money'
          ? 'money'
          : 'overview';
  if (defaultTab !== 'overview') detailParams.set('tab', defaultTab);
  const detailHref = withAdminReturnTo(
    `/admin/orders/${encodeURIComponent(id)}${detailParams.size ? '?' + detailParams : ''}`,
    returnTo,
  );
  const parcelHref = withAdminReturnTo(
    `/admin/orders/${encodeURIComponent(id)}?tab=parcel-cash`,
    returnTo,
  );
  const deliveryAnswers =
    staff.role === 'super_admin'
      ? await listFormAnswersForSubjectPage(db, {
          subjectType: 'order',
          subjectId: id,
          formId: 'staff.delivery-assignment',
          after: deliveryAfter,
        })
      : { answers: [], nextCursor: null };
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
  const [parcels, cash, compensation, invoiceGroups, failureReasonsAvailable] = await Promise.all([
    listParcels(db, id),
    parcelCashRecords(db, id).then((records) =>
      staff.role === 'super_admin'
        ? records
        : records.filter((record) => record.riderId === null),
    ),
    staff.role === 'super_admin'
      ? riderCompensationEntries(db, id)
      : Promise.resolve([]),
    listManagedInvoiceGroupsForOrder(db, id),
    deliveryFailureSchemaAvailable(db),
  ]);
  const adjustmentReasons = can(staff, 'tax_policy.manage')
    ? (
        await getEffectiveBusinessSetting(
          db,
          'managed_adjustment_reason_codes',
          requestTime(),
        )
      ).value
    : [];
  const isSuperAdmin = staff.role === 'super_admin';
  const [delivery, progress, manualReview] = await Promise.all([
    getDelivery(db, id).then(publicDelivery),
    readOrderProgress(db, order, isSuperAdmin, can(staff, 'payout.prepare')),
    order.paymentMode === 'prepaid' && order.status === 'pending_payment'
      ? getPaidManualReleaseReview(db, staff.id, id).catch((error) => {
          if (error instanceof ManualPaymentError && error.status === 404)
            return null;
          throw error;
        })
      : null,
  ]);
  const visibleParcels = isSuperAdmin
    ? parcels
    : parcels
        .filter(
          (parcel) =>
            parcel.method !== 'own_rider' && parcel.riderUserId === null,
        )
        .map((parcel) => ({
          ...parcel,
          latitude: null,
          longitude: null,
          accuracy: null,
          positionAt: null,
          riderFinanceSnapshotJson: null,
        }));
  const sellerById = new Map(
    order.items.map((item) => [item.sellerId, item.sellerName]),
  );
  const sellerNames = [...sellerById.values()];
  const itemCount = order.items.reduce(
    (count, item) => count + item.quantity,
    0,
  );
  const courierNames = [
    ...new Set(
      [
        delivery?.courierName,
        ...visibleParcels.map((parcel) => parcel.courierName),
      ].filter((name): name is string => Boolean(name)),
    ),
  ];
  const activePrep = ['confirmed', 'packing'].includes(order.status);
  const canSetUp =
    !parcels.length &&
    !codPending &&
    ['confirmed', 'packing', 'ready_for_pickup'].includes(order.status);
  const legacyCourier =
    !parcels.length &&
    !codPending &&
    ['confirmed', 'packing', 'ready_for_pickup', 'dispatched'].includes(
      order.status,
    );
  const activeParcel =
    [
      'confirmed',
      'packing',
      'ready_for_pickup',
      'dispatched',
      'delivered',
    ].includes(order.status) &&
    visibleParcels.some(
      (parcel) =>
        !['delivered', 'returned', 'cancelled'].includes(parcel.status),
    );
  const canChangeCourier =
    !codPending && (legacyCourier || activeParcel || canSetUp);
  const canCancel =
    (!parcels.length &&
      ['confirmed', 'packing', 'ready_for_pickup'].includes(order.status)) ||
    visibleParcels.some((parcel) =>
      [
        'pickup_requested',
        'label_pending',
        'label_ready',
        'pickup_scheduled',
      ].includes(parcel.status),
    );
  const now = requestTime();
  const late =
    activePrep && progress.dueAt !== null && progress.dueAt <= now
      ? orderDeadline(progress.dueAt, now)
      : null;
  const customerPhone = phoneHref(order.customerPhone);
  const preparationHref = withAdminReturnTo(
    `/admin/order-responses/${encodeURIComponent(id)}`,
    detailHref + '#records',
  );
  const paymentHref = '/admin/payments/orders/' + encodeURIComponent(id);
  const canOpenSeller = can(staff, 'seller.application.review');
  const sellerContact =
    canOpenSeller && sellerById.size === 1
      ? await db
          .prepare(
            'SELECT support_phone AS phone FROM seller_profiles WHERE id=?',
          )
          .bind(sellerById.keys().next().value)
          .first<{ phone: string }>()
      : null;
  const sellerPhone = sellerContact?.phone
    ? phoneHref(sellerContact.phone)
    : null;

  const next = (() => {
    if (codPending)
      return {
        title: 'Super Admin · confirm this cash order',
        detail: 'Call the customer, then record the order confirmation.',
        label: 'Confirm COD order',
        href: '#confirm-cod',
        call: true,
      };
    if (manualReview?.paid && !manualReview.released && !manualReview.closed)
      return {
        title: 'Operations · review release for packing',
        detail:
          'Check the recorded payment and any holds before releasing the order.',
        label: 'Review release',
        href: paymentHref,
      };
    if (order.status === 'pending_payment')
      return {
        title: 'Customer · complete payment',
        detail: 'Packing can start after payment has cleared.',
        label: 'View payment',
        href: '#money',
      };
    if (
      visibleParcels.some((parcel) =>
        ['delivery_failed', 'returning', 'returned', 'claim_open'].includes(
          parcel.status,
        ),
      )
    )
      return {
        title: 'Operations · check the parcel problem',
        detail: 'Record the next delivery or return action.',
        label: 'Review parcel problem',
        href: '#exceptions',
      };
    if (
      companyPreparation.some((group) =>
        ['confirmed', 'packing'].includes(group.status),
      )
    )
      return {
        title: 'Super Admin · prepare the company-store items',
        detail: 'Record packing progress for each maker.',
        label:
          companyPreparation.length === 1 &&
          companyPreparation[0].status === 'packing'
            ? 'Mark packed for seller'
            : 'Open company preparation',
        href: '#order-preparation',
        callSeller: true,
      };
    if (activePrep)
      return {
        title:
          (sellerNames.length === 1 ? sellerNames[0] : 'Sellers') +
          ' · pack this order',
        detail:
          progress.dueAt === null
            ? 'Dispatch can start after the sellers mark their items ready.'
            : 'Follow up on preparation by ' +
              formatOrderTime(progress.dueAt) +
              '.',
        label: 'Check seller answers',
        href: preparationHref,
        callSeller: true,
      };
    if (order.status === 'ready_for_pickup')
      return {
        title: 'Operations · arrange courier pickup',
        detail: progress.pickupAt
          ? 'Pickup is scheduled for ' +
            formatOrderTime(progress.pickupAt) +
            '.'
          : 'Confirm the handover with the courier and record the dispatch.',
        label: 'Open parcel controls',
        href: '#courier',
      };
    if (order.status === 'dispatched')
      return {
        title: 'Courier · deliver this order',
        detail:
          order.paymentMode === 'cod'
            ? 'Record delivery and customer cash collection when confirmed.'
            : 'Record delivery when the courier confirms receipt.',
        label: 'Check delivery',
        href: '#parcel-cash',
      };
    if (
      order.status === 'delivered' &&
      visibleParcels.some(
        (parcel) => parcel.collectedPaisa > parcel.remittedPaisa,
      )
    )
      return {
        title: 'Courier · remit the collected cash',
        detail: 'Review the parcel’s collection and remittance records.',
        label: 'Check cash',
        href: '#parcel-cash',
      };
    if (order.status === 'delivered')
      return {
        title: progress.paidAt
          ? 'Order complete'
          : 'Delivered · check settlement',
        detail: progress.paidAt
          ? 'Delivery and seller payment are recorded.'
          : 'Check the recorded delivery and payment details.',
        label: 'View money',
        href: '#money',
      };
    return {
      title: orderStage(order.status),
      detail: 'Review the recorded order history and decisions.',
      label: 'View records',
      href: '#records',
    };
  })();

  return (
    <StaffReviewAccessBoundary actorId={staff.id} sourceId={id}>
      <div className="min-w-0 space-y-5 text-[#14213D]">
        <nav
          aria-label="Breadcrumb"
          className="flex min-h-11 flex-wrap items-center gap-2 text-sm text-[#46536F]"
        >
          <Link
            href={
              /^\/admin\/orders(?:[?#]|$)/.test(returnTo)
                ? returnTo
                : '/admin/orders'
            }
            className="inline-flex min-h-11 items-center gap-1 hover:underline"
          >
            <ChevronLeft className="size-4" aria-hidden="true" /> Orders
          </Link>
          <span aria-hidden="true">/</span>
          <span
            className="break-words font-semibold text-[#14213D]"
            aria-current="page"
          >
            {order.orderNumber}
          </span>
        </nav>
        {returnTo !== '/admin/orders' && !/^\/admin\/orders(?:[?#]|$)/.test(returnTo) ? (
          <ReviewBackLink returnTo={returnTo} actorId={staff.id} />
        ) : null}

        <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-5 gap-y-3 md:flex-nowrap">
          <div className="min-w-0 [&>.admin-page-title]:flex-wrap">
            <AdminPageTitle>
              <h1 className="wrap-anywhere font-heading text-[1.75rem] leading-tight tracking-tight lg:text-[2.4rem]">
                Order {order.orderNumber}
              </h1>
              <OrderStageBadge
                status={codPending ? 'awaiting_cod_confirmation' : order.status}
                late={late}
              />
            </AdminPageTitle>
            <p className="mt-2 text-sm leading-6 text-[#46536F]">
              Placed {formatOrderTime(order.placedAt)} ·{' '}
              <strong className="text-[#14213D]">
                {money(order.grandTotalPaisa)}
              </strong>{' '}
              {orderPaymentMode(order.paymentMode).toLowerCase()} ·{' '}
              {address.recipientName}
              {address.locality ? ' in ' + address.locality : ''} · {itemCount}{' '}
              {itemCount === 1 ? 'item' : 'items'}
              {sellerNames.length ? ' from ' + sellerNames.join(', ') : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {customerPhone ? (
              <a href={customerPhone} className={action}>
                <Phone className="size-4" aria-hidden="true" /> Call customer
              </a>
            ) : null}
            <OrderMore className={action}>
              <li>
                <a className={menuAction} href="#exceptions">
                  Report a problem
                </a>
              </li>
              {invoiceGroups.length ? (
                <li>
                  <a className={menuAction} href="#invoice-records">
                    Invoice records
                  </a>
                </li>
              ) : null}
              <li>
                <a className={menuAction} href="#money">
                  Order statement
                </a>
              </li>
              {canChangeCourier ? (
                <li>
                  <a className={menuAction} href="#courier">
                    Change courier
                  </a>
                </li>
              ) : null}
              {canCancel ? (
                <li className="border-t">
                  <a
                    className={menuAction + ' text-[#A8232E]'}
                    href={parcels.length ? '#courier' : '#order-actions'}
                  >
                    Cancel order…
                  </a>
                </li>
              ) : null}
            </OrderMore>
          </div>
        </header>

        <section
          aria-label="Next step"
          className="flex flex-wrap items-center gap-4 rounded-2xl bg-[#14213D] p-5 text-white"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#E2B65C]/15 text-[#E2B65C]">
            <Clock3 className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 basis-full sm:flex-1">
            <h2 className="font-semibold">Next · {next.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#C9D0DD]">
              {next.detail}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            {next.callSeller && sellerPhone ? (
              <a
                href={sellerPhone}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/30 px-3 text-sm font-semibold hover:border-white"
              >
                <Phone className="size-4" aria-hidden="true" /> Call seller
              </a>
            ) : null}
            {next.call && customerPhone ? (
              <a
                href={customerPhone}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/30 px-3 text-sm font-semibold hover:border-white"
              >
                <Phone className="size-4" aria-hidden="true" /> Call customer
              </a>
            ) : null}
            {next.href.startsWith('#') ? (
              <a
                href={next.href}
                className="inline-flex min-h-11 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#14213D] hover:bg-[#F7F3EC]"
              >
                {next.label}
              </a>
            ) : (
              <Link
                href={next.href}
                className="inline-flex min-h-11 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#14213D] hover:bg-[#F7F3EC]"
              >
                {next.label}
              </Link>
            )}
          </div>
        </section>

        <OrderProgress
          order={order}
          parcels={visibleParcels}
          facts={{ ...progress, confirmedAt: codReview?.confirmedAt, late }}
          codPending={codPending}
        />

        <OrderDetailTabs
          defaultTab={defaultTab}
          panels={{
            overview: (
              <OrderOverview
                order={order}
                sellers={sellerById}
                courierNames={courierNames}
                pickupAt={progress.pickupAt}
                canOpenSeller={canOpenSeller}
                detailHref={detailHref}
                sellerPhone={sellerPhone}
              />
            ),
            'parcel-cash': (
              <div className="space-y-5">
                {codPending ? (
                  <div id="confirm-cod" className="scroll-mt-20">
                    <FirstCodConfirmation orderId={id} actorId={staff.id} />
                  </div>
                ) : null}
                {companyPreparation.length ? (
                  <section
                    id="order-preparation"
                    className="scroll-mt-20 space-y-4 rounded-2xl border bg-card p-5"
                    aria-label="Company-store preparation"
                  >
                    <h2 className="font-heading text-2xl">
                      Company-store preparation
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Prepare company-store items on behalf of each maker.
                    </p>
                    {companyPreparation.map((group) => (
                      <div
                        key={`${group.sellerId}:${group.status}`}
                        className="min-w-0 space-y-3 rounded-lg border p-4"
                      >
                        <p className="break-words font-semibold">
                          {group.makerName} · {group.itemCount} item lines ·{' '}
                          {group.status.replaceAll('_', ' ')}
                        </p>
                        <AdminOrderFulfillmentActions
                          orderId={id}
                          status={group.status}
                          companySellerId={group.sellerId}
                        />
                      </div>
                    ))}
                  </section>
                ) : null}

                <div id="courier" className="scroll-mt-20">
                  <ParcelControls
                    orderId={id}
                    failureReasonsAvailable={failureReasonsAvailable}
                    parcels={visibleParcels}
                    records={
                      staff.role === 'super_admin'
                        ? cash
                        : cash.filter((record) =>
                            visibleParcels.some(
                              (parcel) => parcel.id === record.jobId,
                            ),
                          )
                    }
                    compensation={compensation}
                    actorId={staff.id}
                    isSuperAdmin={staff.role === 'super_admin'}
                    returnTo={parcelHref}
                    canReviewIncoming={can(staff, 'payment.receipt.verify')}
                    canPrepare={
                      !parcels.length &&
                      !codPending &&
                      ['confirmed', 'packing', 'ready_for_pickup'].includes(
                        order.status,
                      )
                    }
                  />

                  {legacyCourier ? (
                    <DeliveryAssignment orderId={id} current={delivery} />
                  ) : null}
                </div>
                {!parcels.length &&
                [
                  'confirmed',
                  'packing',
                  'ready_for_pickup',
                  'dispatched',
                ].includes(order.status) ? (
                  <section
                    id="order-actions"
                    className={panel + ' scroll-mt-20 space-y-3'}
                  >
                    <h2 className="font-semibold">Whole-order actions</h2>
                    <AdminOrderFulfillmentActions
                      key={order.trackingCode ?? 'manual'}
                      initialTrackingCode={order.trackingCode}
                      orderId={id}
                      status={order.status}
                    />
                  </section>
                ) : null}
                <section className={panel}>
                  <h2 className="font-semibold">Shipment</h2>
                  <p className="mt-3 text-sm">
                    {orderStage(order.shipmentStatus)}
                  </p>
                  <p className="mt-2 break-words text-sm text-muted-foreground">
                    Reference: {order.trackingCode || 'Not assigned'}
                  </p>
                  <p className="mt-2 break-words text-sm text-muted-foreground">
                    Estimate: {order.estimatedMinDays}–{order.estimatedMaxDays}{' '}
                    days
                  </p>
                </section>

                <ExceptionOrderSection db={db} orderId={id} staff={staff} />
              </div>
            ),
            money: (
              <div className="space-y-5">
                <section className={panel}>
                  <h2 className="font-semibold">Payment breakdown</h2>
                  <dl className="mt-5 space-y-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-x-3">
                      <dt>Items</dt>
                      <dd>{money(order.itemSubtotalPaisa)}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-3">
                      <dt>Delivery</dt>
                      <dd>{money(order.deliveryChargePaisa)}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-3 border-t pt-3 font-semibold">
                      <dt>
                        {order.paymentMode === 'cod'
                          ? 'Cash on delivery total'
                          : 'Order total'}
                      </dt>
                      <dd>{money(order.grandTotalPaisa)}</dd>
                    </div>
                    {order.buyerPlatformFeePaisa > 0 ? (
                      <div className="flex flex-wrap justify-between gap-x-3">
                        <dt>Platform service fee (included)</dt>
                        <dd>{money(order.buyerPlatformFeePaisa)}</dd>
                      </div>
                    ) : null}
                    {feeSummary && feeSummary.refundedPaisa > 0 ? (
                      <div className="flex flex-wrap justify-between gap-x-3">
                        <dt>Legally required fee refunds</dt>
                        <dd>{money(feeSummary.refundedPaisa)}</dd>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap justify-between gap-x-3">
                      <dt>Payment</dt>
                      <dd>{orderStage(order.paymentStatus)}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {order.deliveryPricing
                      ? `Saved delivery pricing · ${money(order.deliveryPricing.baseChargePaisa)} for the first store, plus half that base for each additional store. ${order.deliveryPricing.currentStoreCount} of ${order.deliveryPricing.originalStoreCount} stores remain.`
                      : 'Historical delivery pricing is retained exactly as recorded for this order.'}
                  </p>
                </section>
              </div>
            ),
            records: (
              <div className="space-y-5">
                <Link
                  href={withAdminReturnTo(
                    `/admin/order-responses/${encodeURIComponent(id)}`,
                    detailHref,
                  )}
                  className="inline-flex min-h-11 items-center text-sm underline"
                >
                  Preparation issues and next updates
                </Link>
                {customerFee && hasCustomerServiceFee(customerFee) ? (
                  <section className="rounded-[14px] border bg-card p-5">
                    <h2 className="mb-3 font-heading text-xl">
                      Customer service fee at placement
                    </h2>
                    <CustomerServiceFeeBreakdown
                      {...customerFee}
                      campaignName={customerFee.campaign?.name ?? null}
                      source={
                        customerFee.source === 'legacy_recorded'
                          ? 'historical'
                          : 'recorded'
                      }
                    />
                    {order.buyerPlatformFeePaisa > 0 || customerFee.netPaisa > 0 ? (
                      <p className="mt-3 text-sm">
                        Customer service fee after cancellations: {money(order.buyerPlatformFeePaisa)}.
                      </p>
                    ) : null}
                  </section>
                ) : null}
                {feeSummary && feeSummary.chargedPaisa > 0 ? (
                  <div>
                    <PlatformServiceFeeRefund
                      actorId={staff.id}
                      orderId={id}
                      {...feeSummary}
                    />
                  </div>
                ) : null}
                <div id="cancellation-records">
                  <CancellationReviewSection
                    db={db}
                    orderId={id}
                    actorId={staff.id}
                  />
                </div>
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
                <OrderMarketplaceFees fees={marketplaceFees} />
                {staff.role === 'super_admin' ? (
                  <section className={panel + ' space-y-3'}>
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
                        className="inline-flex min-h-11 items-center underline"
                        href={withAdminReturnTo(
                          `/admin/orders/${encodeURIComponent(id)}?tab=records&deliveryAfterAt=${deliveryAnswers.nextCursor.createdAt}&deliveryAfterId=${encodeURIComponent(deliveryAnswers.nextCursor.id)}#records`,
                          returnTo,
                        )}
                      >
                        Next 50 answers
                      </Link>
                    ) : null}
                  </section>
                ) : null}
                {invoiceGroups.length ? (
                  <section
                    id="invoice-records"
                    className={panel + ' scroll-mt-20'}
                  >
                    <h2 className="font-semibold">Issuer invoice records</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Each issuer retains its original document and recorded
                      financial scope. Corrections append documents and never
                      rewrite the invoice snapshot.
                    </p>
                    <ul className="mt-4 space-y-2 text-sm">
                      {invoiceGroups.map((invoice) => (
                        <li key={invoice.id} className="rounded border p-3">
                          <strong>{invoice.invoiceNumber}</strong>
                          <span className="block">
                            {invoice.issuerReference} ·{' '}
                            {invoice.adjustmentCount} correction documents
                          </span>
                          <span className="block text-xs text-amber-800">
                            {invoice.recordKind === 'live'
                              ? 'Actual commercial invoice'
                              : invoice.simulationLabel}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {invoiceGroups.some(
                      (invoice) => invoice.recordKind === 'simulation',
                    ) &&
                      (can(staff, 'tax_policy.manage') ? (
                        <InvoiceAdjustmentForm
                          invoices={invoiceGroups.filter(
                            (invoice) => invoice.recordKind === 'simulation',
                          )}
                          reasonCodes={adjustmentReasons}
                        />
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Only a Super Admin with tax-policy authority can issue
                          a simulated correction document.
                        </p>
                      ))}
                    {staff.role === 'super_admin' &&
                    can(staff, 'refund.approve.standard')
                      ? invoiceGroups
                          .filter((invoice) => invoice.recordKind === 'live')
                          .map((invoice) => (
                            <LiveInvoiceAdjustmentForm
                              key={invoice.id}
                              actorId={staff.id}
                              invoiceId={invoice.id}
                            />
                          ))
                      : null}
                  </section>
                ) : null}
              </div>
            ),
          }}
        />
      </div>
    </StaffReviewAccessBoundary>
  );
}
