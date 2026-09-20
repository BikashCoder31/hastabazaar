import {CancellationHistory} from '@/components/commerce/cancellation-history';
import {CustomerRiderCode} from '@/components/rider/rider-code';
import {customerRiderCodeJobs} from '@/lib/riders/customer-code';
import {CustomerDelivery} from '@/components/delivery/customer-delivery';
import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  MapPin,
  Truck,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CustomerOrderCancellation } from '@/components/commerce/customer-order-cancellation';
import { CustomerAftercare } from '@/components/commerce/customer-aftercare';
import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import {
  RECEIPT_COOKIE,
  hashOpaqueToken,
  readCookieHeader,
} from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { getOrderReceipt } from '@/lib/db/repositories/orders';
import { listReturnsForCustomerReceipt } from '@/lib/db/repositories/returns';
import { listComplaintsForCustomerReceipt } from '@/lib/db/repositories/complaints';
import { getCustomerUser } from '@/lib/auth/customer';
import { orderPresentation } from '@/lib/commerce/order-presentation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your order' };

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export default async function OrderReceiptPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
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
  const [returnCases, complaints] = await Promise.all([
    listReturnsForCustomerReceipt(
      database,
      orderNumber,
      receiptTokenHash,
      customer?.userId ?? null,
    ),
    listComplaintsForCustomerReceipt(
      database,
      orderNumber,
      receiptTokenHash,
      customer?.userId ?? null,
    ),
  ]);
  const codeJobs=await customerRiderCodeJobs(database,{orderNumber,customerId:customer?.userId??null,receiptTokenHash});
  const address = receipt.address;
  const presentation = orderPresentation(receipt.status, receipt.paymentStatus);
  return (
    <div className="min-h-screen bg-muted/25">
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className="shell py-8 sm:py-12">
        <CustomerDelivery orderNumber={orderNumber}/>
        <CustomerRiderCode orderNumber={orderNumber} jobs={codeJobs}/>
        <div className="mx-auto max-w-5xl">
          <Link
            href={customer ? '/account/orders' : '/shop'}
            className="section-link mb-5"
          >
            <ArrowLeft className="size-4" />
            {customer ? 'Back to my orders' : 'Back to the collection'}
          </Link>
          <div className="rounded-3xl border bg-card p-6 sm:p-10">
            {receipt.status === 'cancelled' ? (
              <XCircle className="size-12 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="size-12 text-primary" />
            )}
            <p className="mt-6 eyebrow">Your order, at a glance</p>
            <h1 className="mt-2 font-heading text-4xl tracking-tight sm:text-5xl">
              {presentation.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-lg leading-8 text-muted-foreground">
                Order{' '}
                <strong className="text-foreground">
                  {receipt.orderNumber}
                </strong>
              </p>
                <OrderStatusBadge status={receipt.status} />
                <Link href={`/track?order=${encodeURIComponent(receipt.orderNumber)}`} className="text-sm font-semibold underline underline-offset-4">Track this order</Link>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Info
                icon={<Banknote />}
                title="Payment"
                detail={presentation.paymentLabel}
              />
              <Info
                icon={<Truck />}
                title="Delivery"
                detail={
                  receipt.status === 'cancelled'
                    ? 'Delivery cancelled'
                    : receipt.deliveredAt
                      ? `Delivered ${new Date(receipt.deliveredAt).toLocaleDateString('en-NP')}`
                      : receipt.trackingCode
                        ? `Tracking: ${receipt.trackingCode}`
                        : `Estimate at checkout: ${receipt.estimatedMinDays}–${receipt.estimatedMaxDays} days`
                }
              />
              <Info
                icon={<MapPin />}
                title="Deliver to"
                detail={`${address.locality}, ${address.district}`}
              />
            </div>
            <div className="mt-9 grid gap-8 border-t pt-8 md:grid-cols-[1fr_18rem]">
              <section>
                <h2 className="font-heading text-2xl">Items</h2>
                <ul className="mt-4 divide-y">
                  {receipt.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex justify-between gap-5 py-4 text-sm"
                    >
                      <span>
                        <strong className="block text-base">
                          {item.productName} × {item.quantity}
                        </strong>
                        <span className="text-muted-foreground">
                          Sold by {item.sellerName}
                        </span>
                        <span className="mt-2 block">
                          <OrderStatusBadge status={item.fulfillmentStatus} />
                        </span>
                      </span>
                      <strong>{money(item.lineTotalPaisa)}</strong>
                    </li>
                  ))}
                </ul>
              </section>
              <aside>
                <h2 className="font-heading text-2xl">Summary</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  {receipt.referralDiscountPaisa>0?<div className="flex justify-between"><dt>Referral discount</dt><dd>−{money(receipt.referralDiscountPaisa)}</dd></div>:null}
                  {receipt.walletCreditPaisa>0?<div className="flex justify-between"><dt>Shopping credit used</dt><dd>−{money(receipt.walletCreditPaisa)}</dd></div>:null}
                  <div className="flex justify-between">
                    <dt>Items</dt>
                    <dd>{money(receipt.itemSubtotalPaisa)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Delivery</dt>
                    <dd>{money(receipt.deliveryChargePaisa)}</dd>
                  </div>
                  <div className="flex justify-between border-t pt-3 text-base font-semibold">
                    <dt>Order total</dt>
                    <dd>{money(receipt.grandTotalPaisa)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {receipt.deliveryPricing
                    ? `Calculated for ${receipt.deliveryPricing.currentStoreCount} ${receipt.deliveryPricing.currentStoreCount===1?'remaining store':'remaining stores'}: ${money(receipt.deliveryPricing.baseChargePaisa)} for the first store, plus 50% of that base for each additional store.`
                    : 'This order retains the delivery policy and amount recorded when it was placed.'}
                </p>
              </aside>
            </div>
            <div className="mt-8 rounded-xl bg-secondary/40 p-5 text-sm leading-7">
              <strong className="block text-foreground">
                Delivery address
              </strong>
              <span className="text-muted-foreground">
                {address.recipientName} · {address.phone}
                <br />
                {address.locality}
                {address.landmark ? `, near ${address.landmark}` : ''}
                <br />
                Ward {address.ward || '—'}, {address.municipality},{' '}
                {address.district}, {address.province}, Nepal
              </span>
            </div>
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              A HastaBazaar operations member or delivery representative may
              call to confirm the address.{' '}
              {receipt.paymentStatus === 'paid'
                ? 'COD payment is recorded as collected.'
                : receipt.status === 'cancelled'
                  ? 'This order was cancelled and no payment is due.'
                  : 'No online payment has been taken.'}
            </p>
            <section className="mt-8 border-t pt-7">
              <h2 className="font-heading text-2xl">
                Documents and accepted terms
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Checkout terms version {receipt.policyVersion}
                {receipt.termsAcceptedAt
                  ? ` was accepted on ${new Date(receipt.termsAcceptedAt).toLocaleString('en-NP')}.`
                  : ' predates the acceptance record.'}
              </p>
              {receipt.documents.length ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  {receipt.documents.map((document) => (
                    <Button
                      key={document.id}
                      className="h-auto max-w-full whitespace-normal break-all py-2 text-left"
                      variant="outline"
                      render={
                        <Link
                          href={document.kind === 'simulated_invoice'
                            ? `/orders/${encodeURIComponent(receipt.orderNumber)}/managed-invoices/${document.id}`
                            : `/orders/${encodeURIComponent(receipt.orderNumber)}/documents/${document.id}`}
                        />
                      }
                    >
                      {document.kind === 'payment_receipt'
                        ? 'Payment receipt'
                        : document.kind === 'simulated_invoice'
                          ? 'Simulated issuer invoice'
                          : 'Order statement'}{' '}
                      · {document.documentNumber}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No downloadable document is available for this earlier order.
                </p>
              )}
            </section>
            <CancellationHistory db={database} orderNumber={orderNumber}/>
            <CustomerAftercare
              orderNumber={receipt.orderNumber}
              orderStatus={receipt.status}
              items={receipt.items}
              returns={returnCases}
              complaints={complaints}
            />
            <div className="mt-7 flex flex-wrap gap-3">
              <Button render={<Link href="/shop" />} className="rounded-full">
                Continue shopping
              </Button>
              {['confirmed','packing','ready_for_pickup','dispatched'].includes(receipt.status) ? (
                <CustomerOrderCancellation orderNumber={receipt.orderNumber} />
              ) : null}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Info({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl bg-secondary/35 p-4 text-sm">
      <span className="text-primary [&>svg]:size-5">{icon}</span>
      <strong className="mt-3 block">{title}</strong>
      <span className="mt-1 block text-muted-foreground">{detail}</span>
    </div>
  );
}
