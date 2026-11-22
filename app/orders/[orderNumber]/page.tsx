import {OrderOfferDetails} from '@/components/commerce/order-offer-details';
import { customerCodSchemaAvailable, getFirstCodReview } from '@/lib/orders/first-cod-review';
import { listCustomerCancellationAnswers } from '@/lib/forms/cancellation-history';
import { CancellationHistory } from '@/components/commerce/cancellation-history';
import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CircleHelp, FileText, Package } from 'lucide-react';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
import { CustomerParcelCard } from '@/components/commerce/customer-parcel-card';
import { CustomerOrderRefresh } from '@/components/commerce/customer-order-refresh';
import { CustomerPreparationQuestion } from '@/components/commerce/customer-preparation-question';
import { CustomerOrderPlaced } from '@/components/commerce/customer-order-placed';
import { readCustomerOrderParcels, type CustomerOrderParcel } from '@/lib/orders/customer-parcels';
import { readCustomerDelayQuestions } from '@/lib/orders/customer-delay-answer';
import { customerDate, customerDateTime, customerParcelState } from '@/lib/orders/customer-parcel-state';
import { cancellationChoices } from '@/lib/cancellation/repository';
import { checkoutCommitClock } from '@/lib/checkout/commit-policy-guards';
import { customerOrderPaymentAction } from '@/lib/orders/customer-order-list';
import { readCustomerAftercareContext } from '@/lib/returns/customer-aftercare-context';
import { formatPaisaExact } from '@/lib/marketplace/money-display';

import { CustomerOrderCancellation } from '@/components/commerce/customer-order-cancellation';
import { CustomerAftercare } from '@/components/commerce/customer-aftercare';
import { AnswerDetails } from '@/components/forms/answer-details';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import {
  RECEIPT_COOKIE,
  hashOpaqueToken,
  readCookieHeader,
} from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { getOrderReceipt, type OrderReceipt } from '@/lib/db/repositories/orders';
import { CustomerServiceFeeBreakdown, hasCustomerServiceFee } from '@/components/commerce/customer-service-fee-breakdown';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import { listReturnsForCustomerReceipt } from '@/lib/db/repositories/returns';
import { listComplaintsForCustomerReceipt } from '@/lib/db/repositories/complaints';
import { getCustomerUser } from '@/lib/auth/customer';
import { COD_CONFIRMATION_NOTICE, orderPresentation } from '@/lib/commerce/order-presentation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your order' };

const panel = 'min-w-0 space-y-3 rounded-[15px] border border-[#E3D6C3] bg-[#FDFAF5] p-4 sm:p-5';
const textLink = 'inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-[#A8232E] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';
const solidLink = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[9px] bg-[#14213D] px-4 text-center text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';

export default async function OrderReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams?: Promise<{
    historyKind?: string;
    historyCaseId?: string;
    historyAt?: string;
    historyId?: string;
    cancellationAfter?: string;
    cancel?: string;
    parcel?: string;
    placed?: string;
    helpItem?: string;
  }>;
}) {
  const { orderNumber } = await params;
  const requestHeaders = await headers();
  const token = readCookieHeader(requestHeaders.get('cookie'), RECEIPT_COOKIE);
  const customer = await getCustomerUser();
  if (!token && !customer) notFound();
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const receiptTokenHash = token ? await hashOpaqueToken(token) : null;
  const receipt = await getOrderReceipt(
    database,
    orderNumber,
    receiptTokenHash,
    customer?.userId ?? null,
  );
  if (!receipt) notFound();
  const receiptOrder = await database
    .prepare('SELECT id,customer_id AS customerId FROM orders WHERE order_number=?')
    .bind(orderNumber)
    .first<{ id: string; customerId: string | null }>();
  const codReview = receiptOrder
    ? await getFirstCodReview(database, receiptOrder.id, receipt.paymentMode === 'cod' && await customerCodSchemaAvailable(database))
    : null;
  const codPending =
    codReview?.status === 'pending' && receipt.status !== 'cancelled';
  const query = await searchParams;
  const ownedOrder = customer && receiptOrder?.customerId === customer.userId ? receiptOrder : null;
  if (query?.placed === '1' && receiptOrder && ['placed', 'confirmed'].includes(receipt.status)) {
    return <CustomerOrderPlaced database={database} receipt={receipt} orderId={receiptOrder.id}
      customerId={ownedOrder ? customer?.userId ?? null : null} customerDisplayName={ownedOrder ? customer?.displayName ?? null : null}
      awaitingCodConfirmation={codPending} />;
  }
  const access = { orderNumber, receiptTokenHash, customerId: customer?.userId ?? null };
  const parcelsPromise = receiptOrder ? readCustomerOrderParcels(database, [receiptOrder.id], {withNcmProgress:true}).then(rows => rows.get(receiptOrder.id) ?? []) : Promise.resolve([]);
  const base = '/orders/' + encodeURIComponent(orderNumber);
  const scope = JSON.stringify([customer?.userId ?? null, ownedOrder ? 'account' : receiptTokenHash]);
  const canReviewCancellation = ['placed', 'confirmed', 'packing', 'ready_for_pickup', 'dispatched'].includes(receipt.status);
  if (query?.cancel === '1' && canReviewCancellation) {
    const [choices, parcels] = await Promise.all([cancellationChoices(database, access), parcelsPromise]);
    const parcelCash = Object.fromEntries(parcels.flatMap(parcel => parcel.codPaisa === null ? [] : [[parcel.sellerId, parcel.codPaisa]]));
    return (
      <div className="min-h-screen bg-[#F5EFE3] text-[#14213D]">
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-9">
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-2 text-sm text-[#465573]">
            {customer ? <Link href="/account/orders" className={textLink}>My orders</Link> : null}
            <Link href={base} className={textLink}>{receipt.orderNumber}</Link>
            <span aria-hidden="true">/</span><span aria-current="page">Cancel</span>
          </nav>
          <section className={panel}>
            <h1 className="font-heading text-4xl tracking-tight">Cancel a parcel</h1>
            <p className="text-sm text-[#465573]">Order {receipt.orderNumber}. Each seller’s parcel is cancelled as a whole. Parcels already with the courier need a staff review.</p>
            <CustomerOrderCancellation orderNumber={receipt.orderNumber} actorId={customer?.userId ?? null} viewerScope={scope}
              initialChoices={choices} initialSellerId={typeof query.parcel === 'string' ? query.parcel : undefined}
              previousTotal={receipt.grandTotalPaisa} paymentMode={receipt.paymentMode} parcelCash={parcelCash} />
          </section>
        </main>
        <SiteFooter />
      </div>
    );
  }
  const [returnCases, complaints, parcels, questions, aftercare, bank, shippingHistory] = await Promise.all([
    listReturnsForCustomerReceipt(database, orderNumber, receiptTokenHash, customer?.userId ?? null),
    listComplaintsForCustomerReceipt(database, orderNumber, receiptTokenHash, customer?.userId ?? null),
    parcelsPromise,
    customer && ownedOrder ? readCustomerDelayQuestions(database, { id: customer.userId, authSubject: customer.authSubject }, { orderId: ownedOrder.id, includeAnswered: true }) : [],
    readCustomerAftercareContext(database, access),
    receipt.paymentMode === 'prepaid' && ownedOrder ? database.prepare(`SELECT o.status,o.payment_mode AS paymentMode,w.paid_at AS paymentVerified,w.released_at AS paymentReleased,
        w.deadline_at AS paymentDeadline,w.cutoff_at AS paymentCutoff,w.closed_at AS paymentClosed,
        c.current_state AS claimStatus,${checkoutCommitClock(database)} AS now,
        CASE WHEN b.payable_paisa>b.received_paisa THEN b.payable_paisa-b.received_paisa ELSE NULL END AS remainingPaisa,
        CASE WHEN EXISTS(SELECT 1 FROM manual_payment_exceptions x WHERE x.order_id=w.order_id
          AND x.kind IN('receipt_reversal','cancelled_money','expired_money') AND x.state<>'resolved') THEN 1 ELSE 0 END AS paymentException
      FROM manual_payment_cutoffs w JOIN orders o ON o.id=w.order_id
      LEFT JOIN manual_payment_claims c ON c.order_id=w.order_id
      LEFT JOIN manual_payment_balances b ON b.order_id=w.order_id WHERE w.order_id=?`).bind(ownedOrder.id)
      .first<Parameters<typeof customerOrderPaymentAction>[0]>() : null,
    receiptOrder ? database.prepare(`SELECT e.id,j.seller_id AS sellerId,e.action,e.created_at AS at
      FROM parcel_operation_events e JOIN shipping_jobs j ON j.id=e.shipping_job_id
      WHERE j.order_id=? AND j.direction='outbound' AND e.action IN('fail','retry','return_to_origin','receive_return')
      ORDER BY e.created_at DESC,e.id DESC LIMIT 40`).bind(receiptOrder.id).all<ShippingEvent>() : null,
  ]);
  const historyKind = query?.historyKind ?? 'checkout';
  if (!['checkout', 'return', 'complaint'].includes(historyKind)) notFound();
  const historyAt = query?.historyAt ? Number(query.historyAt) : NaN;
  const historyAfter =
    Number.isSafeInteger(historyAt) &&
    historyAt >= 0 &&
    query?.historyId &&
    query.historyId.length <= 191
      ? { createdAt: historyAt, id: query.historyId }
      : undefined;
  let answerHistory: Awaited<
    ReturnType<typeof listFormAnswersForSubjectPage>
  > | null = null;
  let historySubjectId = ownedOrder?.id ?? null;
  let historyFormId = 'commerce.checkout';
  let historySubjectType = 'order';
  if (ownedOrder && historyKind !== 'checkout') {
    const caseId = query?.historyCaseId;
    if (!caseId || caseId.length > 191) notFound();
    const selected =
      historyKind === 'return'
        ? returnCases.find((item) => item.id === caseId)
        : complaints.find((item) => item.id === caseId);
    if (!selected) notFound();
    historySubjectId = caseId;
    historyFormId =
      historyKind === 'return'
        ? 'commerce.return-request'
        : 'commerce.complaint';
    historySubjectType =
      historyKind === 'return' ? 'return_request' : 'complaint';
  }
  if (historySubjectId && customer) {
    answerHistory = await listFormAnswersForSubjectPage(database, {
      subjectType: historySubjectType,
      subjectId: historySubjectId,
      formId: historyFormId,
      after: historyAfter,
    });
    const allowed = await Promise.all(
      answerHistory.answers.map((answer) =>
        authorizeFormAnswerRead(
          database,
          { id: customer.userId, role: 'customer' },
          answer,
        ),
      ),
    );
    if (allowed.some((value) => !value)) notFound();
  }
  let cancellationAnswers: Awaited<
    ReturnType<typeof listCustomerCancellationAnswers>
  > | null = null;
  if (ownedOrder && customer) {
    try {
      cancellationAnswers = await listCustomerCancellationAnswers(database, {
        customerId: customer.userId,
        orderId: ownedOrder.id,
        after: query?.cancellationAfter,
      });
    } catch {
      notFound();
    }
  }
  const { bankAction: bankDue, bankReview } = bank ? customerOrderPaymentAction(bank) : { bankAction: false, bankReview: false };
  const state = customerParcelState({ status: receipt.status, codPending, bankDue, bankReview,
    proposedDate: questions.some(question => !question.answered) });
  const paymentLabel = bankReview ? 'Checking your payment' : orderPresentation(receipt.status, receipt.paymentStatus, codPending, receipt.paymentMode).paymentLabel;
  const itemDetails = new Map(receipt.items.map(item => [item.id, item]));
  const refundAccess = Boolean(ownedOrder || (!customer && token && receiptOrder?.customerId === null));

  return (
    <div className="min-h-screen bg-[#F5EFE3] text-[#14213D]">
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className="mx-auto w-full max-w-[1264px] px-4 py-6 md:px-8 md:py-9 min-[1360px]:px-0">
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-8">
          <div className="min-w-0 space-y-5">
            <header>
              <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-[#465573]">
                {customer ? <><Link href="/account" className={textLink}>Your account</Link><span aria-hidden="true">/</span><Link href="/account/orders" className={textLink}>My orders</Link></> : <Link href="/shop" className={textLink}>Back to the collection</Link>}
                <span aria-hidden="true">/</span><span aria-current="page">{receipt.orderNumber}</span>
              </nav>
              <h1 className="font-heading text-4xl leading-tight tracking-tight sm:text-5xl">Order {receipt.orderNumber}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#465573]">
                <p>{receipt.placedAt ? `Placed ${customerDate(receipt.placedAt)} · ` : null}{receipt.paymentMode === 'prepaid' ? 'Bank transfer' : 'Cash on delivery'}
                  {parcels.length ? ` · ${parcels.length} ${parcels.length === 1 ? 'parcel' : 'parcels'}` : ''}
                </p>
                <CustomerActingChip actor={state.actor} yourTurn={state.actor === 'you'} />
              </div>
              {codPending ? <p className="mt-3 font-medium">{codReview?.holdSource === 'customer_flag' ? COD_CONFIRMATION_NOTICE :
                'We received your order. Staff will confirm it with you before your makers begin packing. You can still cancel eligible items.'}</p> : null}
              {receipt.status === 'cancelled' ? <p className="mt-2 text-sm">This order was cancelled and no payment is due.</p> : null}
              {bankDue && ownedOrder ? <Link href={`/account/payments/${encodeURIComponent(ownedOrder.id)}`} className={`${solidLink} mt-3`}>{bank?.claimStatus === 'needs_information' ? 'Update payment' : 'How to pay'}</Link> : null}
            </header>
            {customer ? questions.map(question => {
              const parcel = parcels.find(value => value.sellerId === question.sellerId);
              const item = parcel?.items.find(value => question.itemIds.includes(value.id));
              return <CustomerPreparationQuestion key={question.id} question={question} actorId={customer.userId} item={item} />;
            }) : null}
            {parcels.map((parcel, index) => {
              const question = questions.find(row => row.sellerId === parcel.sellerId && !row.answered);
              const parcelState = customerParcelState({ status: parcel.status, proposedDate: Boolean(question), bankDue, bankReview, codPending });
              const description = question ? 'The seller asked for a new ready date. See the question above.'
                : parcel.status === 'dispatched' ? 'This parcel has been handed to the courier.'
                : parcel.status === 'delivered' ? 'This parcel has arrived.'
                : !['cancelled', 'returned', 'delivery_failed', 'returning', 'return_to_origin'].includes(parcel.status) && parcel.estimatedMinDays !== null && parcel.estimatedMaxDays !== null
                  ? `Order delivery estimate at checkout: ${parcel.estimatedMinDays}–${parcel.estimatedMaxDays} days.` : undefined;
              return (
                <CustomerParcelCard key={parcel.sellerId} id={`parcel-${encodeURIComponent(parcel.sellerId)}`} title={`Parcel ${index + 1} · ${parcel.sellerName}`}
                  parcel={parcel} state={parcelState} detail={description}>
                  <ul className="divide-y divide-[#E3D6C3] border-t border-[#E3D6C3]">
                    {parcel.items.map(item => {
                      const saved = itemDetails.get(item.id);
                      return (
                        <li key={item.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3">
                          {item.mediaId ? <Image src={`/api/product-media/${encodeURIComponent(item.mediaId)}`} alt="" width={52} height={52} data-media-mode="cover" unoptimized className="size-12 shrink-0 rounded-[9px] border border-[#E3D6C3] object-cover sm:size-13" />
                            : <span className="grid size-12 shrink-0 place-items-center rounded-[9px] bg-[#F1E4C5]"><Package className="size-5" aria-hidden="true" /></span>}
                          <div className="min-w-0 flex-1 basis-36 wrap-anywhere">
                            <p className="font-bold">{item.name}</p>
                            <p className="text-sm text-[#655848]">Qty {item.quantity}{saved ? ` · ${formatPaisaExact(saved.lineTotalPaisa)}` : ''}{item.status === 'cancelled' ? ' · Cancelled' : ''}</p>
                            {saved ? <OrderOfferDetails offer={saved.offerSnapshot} /> : null}
                            {saved ? <p className="text-xs text-[#655848]">
                              {saved.makerName ? `Supplied by ${saved.makerName} · ${saved.legalSellerName
                                ? `Sold and invoiced by ${saved.legalSellerName}`
                                : `Recorded seller: ${saved.sellerName}. Invoice identity needs review.`}`
                                : `Sold by ${saved.sellerName} through Hastabazaar`}
                            </p> : null}
                          </div>
                          <Link href={`${base}?helpItem=${encodeURIComponent(item.id)}#order-help`} className={textLink}>{parcel.status === 'delivery_failed' ? 'Problem with delivery?' : 'Get help'}</Link>
                        </li>
                      );
                    })}
                  </ul>
                  {canReviewCancellation && ['placed', 'confirmed', 'packing', 'ready_for_pickup', 'pickup_requested', 'label_pending', 'label_ready', 'pickup_scheduled'].includes(parcel.status) ? (
                    <Link href={`${base}?cancel=1&parcel=${encodeURIComponent(parcel.sellerId)}`} className={textLink}>Cancel this parcel</Link>
                  ) : null}
                </CustomerParcelCard>
              );
            })}
            {!parcels.length ? (
              <section className={panel} aria-label="Saved items">
                <h2 className="text-lg font-bold">Items in this order</h2>
                {receipt.items.map(item => <p key={item.id}>{item.productName} · Qty {item.quantity} · {formatPaisaExact(item.lineTotalPaisa)}</p>)}
              </section>
            ) : null}
            <OrderHistory placedAt={receipt.placedAt} parcels={parcels} shipping={shippingHistory?.results ?? []} questions={questions} />
            <CancellationHistory db={database} orderNumber={orderNumber} />
            <div>
              <CustomerAftercare orderNumber={receipt.orderNumber} viewerScope={scope} actorId={customer?.userId ?? null}
                orderStatus={receipt.status} items={receipt.items} returns={returnCases} complaints={complaints}
                initialItemId={typeof query?.helpItem === 'string' && receipt.items.some(item => item.id === query.helpItem) ? query.helpItem : undefined}
                context={aftercare} />
            </div>
            {ownedOrder ? (
              <section
                className="mt-7 space-y-4 rounded-2xl border bg-card p-6"
                aria-label="Your order form answers"
              >
                <h2 className="font-heading text-2xl">
                  Your order form answers
                </h2>
                <nav
                  className="flex flex-wrap gap-3 text-sm"
                  aria-label="Order answer history"
                >
                  <Link
                    className={textLink}
                    href={`/orders/${encodeURIComponent(orderNumber)}`}
                  >
                    Checkout
                  </Link>
                  {returnCases.map((item) => (
                    <Link
                      key={item.id}
                      className={textLink}
                      href={`/orders/${encodeURIComponent(orderNumber)}?historyKind=return&historyCaseId=${encodeURIComponent(item.id)}`}
                    >
                      Return {item.referenceNumber}
                    </Link>
                  ))}
                  {complaints.map((item) => (
                    <Link
                      key={item.id}
                      className={textLink}
                      href={`/orders/${encodeURIComponent(orderNumber)}?historyKind=complaint&historyCaseId=${encodeURIComponent(item.id)}`}
                    >
                      Complaint {item.referenceNumber}
                    </Link>
                  ))}
                </nav>
                {answerHistory?.answers.length ? (
                  answerHistory.answers.map((answer) => (
                    <AnswerDetails key={answer.id} answer={answer} />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No saved answers for this action.
                  </p>
                )}
                {answerHistory?.nextCursor ? (
                  <Link
                    className={textLink}
                    href={
                      `/orders/${encodeURIComponent(orderNumber)}?historyKind=${historyKind}` +
                      (historyKind === 'checkout'
                        ? ''
                        : `&historyCaseId=${encodeURIComponent(historySubjectId!)}`) +
                      `&historyAt=${answerHistory.nextCursor.createdAt}&historyId=${encodeURIComponent(answerHistory.nextCursor.id)}`
                    }
                  >
                    Next 50 answers
                  </Link>
                ) : null}
              </section>
            ) : null}
            {cancellationAnswers ? (
              <section
                className="mt-7 space-y-4 rounded-2xl border bg-card p-6"
                aria-label="Your cancellation form answers"
              >
                <h2 className="font-heading text-2xl">
                  Your cancellation form answers
                </h2>
                {cancellationAnswers.items.length ? (
                  cancellationAnswers.items.map((answer) => (
                    <AnswerDetails key={answer.id} answer={answer} />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No saved cancellation answers on this page.
                  </p>
                )}
                {cancellationAnswers.nextCursor ? (
                  <Link
                    className={textLink}
                    href={
                      '/orders/' +
                      encodeURIComponent(orderNumber) +
                      '?cancellationAfter=' +
                      encodeURIComponent(cancellationAnswers.nextCursor)
                    }
                  >
                    Older cancellation answers
                  </Link>
                ) : null}
              </section>
            ) : null}

          </div>
          <aside className="min-w-0 space-y-4">
            <DeliveryAddress receipt={receipt} />
            <Payment receipt={receipt} paymentLabel={paymentLabel} bankHref={receipt.paymentMode === 'prepaid' && ownedOrder ? `/account/payments/${encodeURIComponent(ownedOrder.id)}` : undefined} />
            <section className={panel}>
              <h2 className="text-lg font-bold">Documents</h2>
              {receipt.documents.length ? (
                <ul className="space-y-1">
                  {receipt.documents.map(document => {
                    const invoice = document.kind === 'simulated_invoice' || document.kind === 'commercial_invoice';
                    const label = document.kind === 'payment_receipt' ? 'Payment receipt' : document.kind === 'commercial_invoice' ? 'Company commercial invoice'
                      : document.kind === 'simulated_invoice' ? 'Simulated issuer invoice' : 'Order receipt';
                    return <li key={document.id}><Link className={textLink} href={`${base}/${invoice ? 'managed-invoices' : 'documents'}/${encodeURIComponent(document.id)}`}>
                      <FileText className="size-4 shrink-0" aria-hidden="true" /><span className="wrap-anywhere">{label} · {document.documentNumber}</span>
                    </Link></li>;
                  })}
                </ul>
              ) : <p className="text-sm text-[#465573]">No downloadable document is available for this earlier order.</p>}
              {refundAccess ? <Link href={`${base}/refund-status`} className={textLink} prefetch={false}>View refund status</Link> : null}
              {ownedOrder ? <Link href="/account/notifications" className={textLink}>View financial notices in Notifications</Link> : null}
              <p className="text-xs text-[#655848]">Checkout terms version {receipt.policyVersion}
                {receipt.termsAcceptedAt ? ` accepted on ${customerDateTime(receipt.termsAcceptedAt)} Nepal time.` : ' predates the acceptance record.'}
              </p>
            </section>
            <section className="min-w-0 space-y-2 rounded-[15px] border border-[#E3D6C3] bg-[#EBE2D3] p-4 sm:p-5">
              <h2 className="text-lg font-bold">Something not right?</h2>
              <p className="text-sm text-[#344766]">Ask us about delivery, an item or this order.</p>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                <Link href="#order-help" className={solidLink}><CircleHelp className="size-4 shrink-0" aria-hidden="true" />Get help with this order</Link>
                {canReviewCancellation ? <Link href={`${base}?cancel=1`} className={textLink}>Cancel a parcel</Link> : null}
                <Link href={`/track?order=${encodeURIComponent(receipt.orderNumber)}`} className={textLink}>Track this order</Link>
              </div>
            </section>
          </aside>
        </div>
        <Link href="/shop" className={`${textLink} mt-5`}>Continue shopping</Link>
      </main>
      <SiteFooter />
      {canReviewCancellation ? <CustomerOrderRefresh /> : null}
    </div>
  );
}

function DeliveryAddress({ receipt }: { receipt: OrderReceipt }) {
  const address = receipt.address;
  return (
    <section className={panel}>
      <h2 className="text-lg font-bold">Delivering to</h2>
      <address className="space-y-1 wrap-anywhere text-sm not-italic leading-relaxed text-[#344766]">
        <p>{address.recipientName} · {address.phone}{receipt.deliveryFor === 'other' ? ' · Ordered for someone else' : ''}</p>
        {receipt.recipientEmail ? <p>{receipt.recipientEmail} (delivery messages only)</p> : null}
        <p>{address.ward ? `Ward ${address.ward}, ` : ''}{address.locality}, {address.municipality}, {address.district}, {address.province}</p>
        {address.landmark ? <p className="text-[#655848]">Near {address.landmark}</p> : null}
      </address>
    </section>
  );
}

function Payment({ receipt, paymentLabel, bankHref }: { receipt: OrderReceipt; paymentLabel: string; bankHref?: string }) {
  const deliveryTerms = receipt.deliveryPricing;
  const amounts = [
    ['Items', receipt.itemSubtotalPaisa, false], ['Delivery', receipt.deliveryChargePaisa, false],
    ['Promo savings', receipt.promoDiscountPaisa, true], ['Referral discount', receipt.referralDiscountPaisa, true],
    ['Shopping credit used', receipt.walletCreditPaisa, true],
    ['Customer service fee after cancellations', receipt.buyerPlatformFeePaisa, false],
  ] as const;
  return (
    <section className={panel}>
      <h2 className="text-lg font-bold">Payment</h2>
      <p className="text-sm text-[#465573]">{paymentLabel}</p>
      <dl className="space-y-2 text-sm">
        {amounts.map(([label, value, discount], index) => value > 0 || index < 2 ? (
          <div key={label} className="flex flex-wrap justify-between gap-x-2.5"><dt>{label}</dt><dd>{discount ? '−' : ''}{formatPaisaExact(value)}</dd></div>
        ) : null)}
        <div className="flex flex-wrap justify-between gap-2 border-t border-[#E3D6C3] pt-3 font-bold">
          <dt>{receipt.paymentMode === 'prepaid' ? 'Order total' : 'Cash on delivery total'}</dt><dd>{formatPaisaExact(receipt.grandTotalPaisa)}</dd>
        </div>
      </dl>
      {receipt.refundedPromoDiscountPaisa > 0 ? <p className="text-xs text-[#655848]">Promo savings removed by refunds: {formatPaisaExact(receipt.refundedPromoDiscountPaisa)}</p> : null}
      {hasCustomerServiceFee(receipt.customerServiceFee) ? (
        <CustomerServiceFeeBreakdown {...receipt.customerServiceFee} campaignName={receipt.customerServiceFee.campaign?.name ?? null}
          source={receipt.customerServiceFee.source === 'legacy_recorded' ? 'historical' : 'recorded'} />
      ) : null}
      {receipt.buyerPlatformFeePaisa > 0 ? <p className="text-xs text-[#655848]">Platform service fee is non-refundable, except where required by law.</p> : null}
      {receipt.refundedPlatformServiceFeePaisa > 0 ? <p className="text-xs text-[#655848]">Legally required platform service fee refund: {formatPaisaExact(receipt.refundedPlatformServiceFeePaisa)}.</p> : null}
      {deliveryTerms ? <p className="text-xs text-[#655848]">
        {deliveryTerms.currentStoreCount
          ? `Delivery uses the saved rates for ${deliveryTerms.currentStoreCount} ${deliveryTerms.currentStoreCount === 1 ? 'seller' : 'sellers'}. The base rate was ${formatPaisaExact(deliveryTerms.baseChargePaisa)}.`
          : 'Delivery follows the rates recorded at checkout.'}
      </p> : <p className="text-xs text-[#655848]">Delivery follows the rates recorded at checkout.</p>}
      {receipt.promo ? <p className="text-xs text-[#655848]">Promo: {receipt.promo.label} · revision {receipt.promo.revision}</p> : null}
      {receipt.paymentMode === 'cod' && receipt.status !== 'cancelled' ? <p className="text-xs text-[#655848]">Cash on delivery is paid per parcel.</p> : null}
      {bankHref ? <Link href={bankHref} className={textLink}>View bank instructions and payment</Link> : null}
    </section>
  );
}

type ShippingEvent = { id: string; sellerId: string; at: number; action: string };

function OrderHistory({ placedAt, parcels, shipping, questions }: {
  placedAt: number; parcels: readonly CustomerOrderParcel[]; shipping: ShippingEvent[];
  questions: Awaited<ReturnType<typeof readCustomerDelayQuestions>>;
}) {
  const parcelEvents = parcels.flatMap(parcel => [
    { at: parcel.stageTimes.preparing, description: `${parcel.sellerName} started preparing your parcel` },
    { at: parcel.stageTimes.packed, description: `${parcel.sellerName} packed your parcel` },
    { at: parcel.stageTimes['with-courier'], description: `Parcel from ${parcel.sellerName} picked up by the courier` },
    { at: parcel.stageTimes.delivered, description: `Parcel from ${parcel.sellerName} delivered` },
  ]);
  const bySeller = new Map(parcels.map(parcel => [parcel.sellerId, parcel.sellerName]));
  const shippingEvents = shipping.flatMap(event => {
    const name = bySeller.get(event.sellerId);
    if (!name) return [];
    const update = event.action === 'retry' ? 'sent out for delivery again'
      : event.action === 'fail' ? 'missed delivery'
      : event.action === 'receive_return' ? 'returned to the seller' : 'going back to the seller';
    return [{ at: event.at, description: `Parcel from ${name} · ${update}`, key: event.id }];
  });
  const dated = [...parcelEvents, { at: placedAt, description: 'Order placed' }].flatMap(event =>
    typeof event.at === 'number' && Number.isFinite(event.at)
      ? [{ at: event.at, description: event.description, key: `${event.at}:${event.description}` }] : []);
  const sellerQuestions = questions.map(question => ({ at: question.createdAt, key: question.id,
    description: `${question.sellerName} asked for a new ready date of ${customerDate(question.proposedReadyAt)}` }));
  const events = [...dated, ...shippingEvents, ...sellerQuestions].sort((a, b) => b.at - a.at);
  return (
    <section className={panel}>
      <h2 className="text-lg font-bold">Order history</h2>
      <ol className="space-y-3 text-sm">
        {events.map(event => (
          <li key={event.key} className="grid min-w-0 grid-cols-[minmax(72px,auto)_minmax(0,1fr)] items-start gap-3">
            <time className="text-[#655848]" dateTime={new Date(event.at).toISOString()}>{customerDateTime(event.at)}</time>
            <p className="border-l-2 border-[#D4C1A6] pl-3">{event.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
