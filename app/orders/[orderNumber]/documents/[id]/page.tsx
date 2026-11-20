import {OrderOfferDetails} from '@/components/commerce/order-offer-details';
import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { PrintDocumentButton } from '@/components/commerce/print-document-button';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { getCustomerUser } from '@/lib/auth/customer';
import {
  RECEIPT_COOKIE,
  hashOpaqueToken,
  readCookieHeader,
} from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { getOrderDocument } from '@/lib/db/repositories/orders';
import { ApprovedBillingDocument } from '@/components/commerce/approved-billing-document';
import { APPROVED_BILLING_VERSION } from '@/lib/documents/billing';
import { mayApplyCompanyStamp } from '@/lib/documents/company-stamp';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Order document' };

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export default async function OrderDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string; id: string }>;
  searchParams?: Promise<{receipt?:string}>;
}) {
  const { orderNumber, id } = await params;
  const requestHeaders = await headers();
  const token = readCookieHeader(requestHeaders.get('cookie'), RECEIPT_COOKIE);
  const customer = await getCustomerUser();
  if (!token && !customer) notFound();
  const document = await getOrderDocument(
    requireDatabase(env as unknown as { DB?: D1Database }),
    orderNumber,
    id,
    token ? await hashOpaqueToken(token) : null,
    customer?.userId ?? null,
  );
  if (!document) notFound();
  const snapshot = document.snapshot;
  if(snapshot.billing?.version===APPROVED_BILLING_VERSION){
    const selected=(await searchParams)?.receipt;
    const groups=snapshot.billing.receiptGroups??[];
    const group=selected?groups.find(value=>value.key===selected):null;
    if(selected&&!group)notFound();
    const root=`/orders/${encodeURIComponent(orderNumber)}/documents/${encodeURIComponent(id)}`;
    return <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-100 px-3 py-7 print:bg-white print:p-0">
      <div className="mx-auto mb-6 max-w-4xl space-y-3 print:hidden"><Link className="underline" href={`/orders/${encodeURIComponent(orderNumber)}`}>Back to order</Link>
        <p>{groups.some(value=>value.canonicalInvoiceId)?'This operational document retains the recorded order values and references the original company commercial invoice.':'This local operational document retains the recorded order values. Official bill activation remains subject to legal and accounting clearance.'}</p>
        {groups.filter(value=>value.canonicalInvoiceId).map(value=><p key={value.key}><Link className="underline" href={`/orders/${encodeURIComponent(orderNumber)}/managed-invoices/${encodeURIComponent(value.canonicalInvoiceId!)}`}>Original commercial invoice {value.billNumber}</Link></p>)}
        {snapshot.billing.receiptReviewReason?<output className="block">{snapshot.billing.receiptReviewReason}</output>:null}
        {document.status!=='issued'?<output className="block">Document status: {document.status}</output>:null}
        {document.kind==='payment_receipt'?<nav className="flex flex-wrap gap-4" aria-label="Seller receipts">{groups.map(value=><Link key={value.key} className="underline" href={`${root}?receipt=${encodeURIComponent(value.key)}`}>{value.issuer.legalName}</Link>)}</nav>:null}
        <PrintDocumentButton/></div>
      {document.kind==='order_statement'?<ApprovedBillingDocument snapshot={snapshot} kind="order_statement" documentNumber={document.documentNumber}
        notice={document.status!=='issued'?`Document status: ${document.status}`:undefined}/>:
        !groups.length?<ApprovedBillingDocument snapshot={snapshot} kind="payment_receipt" documentNumber={document.documentNumber}
          notice={`Operational payment receipt. Official seller bills pending review.${document.status!=='issued'?` Document status: ${document.status}.`:''}`}/>:
        (group?[group]:groups).map(value=><ApprovedBillingDocument key={value.key} snapshot={snapshot} kind="payment_receipt" documentNumber={document.documentNumber} group={value}
          notice={document.status!=='issued'?`Document status: ${document.status}`:value.canonicalInvoiceId?'Payment receipt referencing the original company commercial invoice.':snapshot.billing?.receiptIssuance!=='simulation'?'Official bill pending legal and accounting clearance.':undefined}
          stampSource={document.status==='issued'&&snapshot.billing?.receiptIssuance==='simulation'&&mayApplyCompanyStamp(value)?`/orders/${encodeURIComponent(orderNumber)}/documents/${encodeURIComponent(id)}/stamp?receipt=${encodeURIComponent(value.key)}`:undefined}/>)}
    </main>;
  }

  return (
    <div className="min-h-screen bg-muted/25 print:bg-white">
      <div className="print:hidden">
        <SiteHeader />
      </div>
      <main tabIndex={-1} id="main-content" className="shell py-10 sm:py-14 print:max-w-none print:px-0 print:py-0">
        <div className="mx-auto max-w-4xl rounded-2xl border bg-white p-6 shadow-sm sm:p-10 print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-5 border-b pb-7">
            <div>
              <p className="eyebrow">Hastabazaar marketplace</p>
              <h1 className="mt-2 font-heading text-4xl">
                {snapshot.documentTitle}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {document.documentNumber}
              </p>
            </div>
            <div className="text-right text-sm leading-6">
              <p>
                <strong>Order:</strong> {snapshot.orderNumber}
              </p>
              <p>
                <strong>Issued:</strong>{' '}
                {new Date(snapshot.issuedAt).toLocaleString('en-NP')}
              </p>
              <p>
                <strong>Status:</strong> {document.status}
              </p>
            </div>
          </div>
          <div className="mt-7 overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-3 pr-4">Item</th>
                  <th className="py-3 pr-4">Seller</th>
                  <th className="py-3 pr-4">Qty</th>
                  <th className="py-3 pr-4 text-right">Unit price</th>
                  <th className="py-3 text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.items.map((item) => (
                  <tr
                    key={`${item.sku}-${item.sellerName}`}
                    className="border-b"
                  >
                    <td className="py-4 pr-4">
                      <strong>{item.productName}</strong><OrderOfferDetails offer={item.offerSnapshot} />
                      <span className="block text-xs text-muted-foreground">
                        SKU {item.sku}
                      </span>
                    </td>
                    <td className="py-4 pr-4">{item.makerName ? <><span className="block">Supplied by {item.makerName}</span><span className="block text-xs">{item.legalSellerName ? `Sold and invoiced by ${item.legalSellerName}` : `Recorded seller: ${item.sellerName} · Invoice identity requires review`}</span></> : <>Sold by {item.sellerName}<span className="block text-xs">Through Hastabazaar</span>{item.legalSellerName ? <span className="block text-xs">Legal seller and invoice issuer: {item.legalSellerName}</span> : null}</>}</td>
                    <td className="py-4 pr-4">{item.quantity}</td>
                    <td className="py-4 pr-4 text-right">
                      {money(item.unitPricePaisa)}
                    </td>
                    <td className="py-4 text-right font-semibold">
                      {money(item.lineTotalPaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-7 max-w-sm space-y-3 text-sm">
            {snapshot.promoDiscountPaisa ? (
              <div className="flex justify-between">
                <dt>Promo savings{snapshot.promo ? ` (${snapshot.promo.label}, revision ${snapshot.promo.revision})` : ''}</dt>
                <dd>−{money(snapshot.promoDiscountPaisa)}</dd>
              </div>
            ) : null}
            {snapshot.referralDiscountPaisa ? (
              <div className="flex justify-between">
                <dt>Referral discount</dt>
                <dd>−{money(snapshot.referralDiscountPaisa)}</dd>
              </div>
            ) : null}
            {snapshot.walletCreditPaisa ? (
              <div className="flex justify-between">
                <dt>Shopping credit</dt>
                <dd>−{money(snapshot.walletCreditPaisa)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt>Items</dt>
              <dd>{money(snapshot.itemSubtotalPaisa)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Delivery</dt>
              <dd>{money(snapshot.deliveryChargePaisa)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Platform service fee</dt>
              <dd>{money(snapshot.buyerPlatformFeePaisa)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax collected</dt>
              <dd>{money(snapshot.taxTotalPaisa)}</dd>
            </div>
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <dt>Cash total</dt>
              <dd>{money(snapshot.grandTotalPaisa)}</dd>
            </div>
          </dl>
          <div className="mt-8 rounded-xl bg-secondary/35 p-5 text-sm leading-7">
            <p>
              <strong>Payment:</strong> {snapshot.paymentMethod} ·{' '}
              {snapshot.paymentStatus}
            </p>
            <p className="mt-2 text-muted-foreground">
              This operational document preserves the order and payment
              snapshot. It is not a PAN/VAT tax invoice. Tax invoicing remains
              disabled until Hastabazaar’s approved legal identity and invoice
              format are configured.
            </p>
          </div>
          <div className="mt-7 flex flex-wrap gap-3 print:hidden">
            <PrintDocumentButton />
            <Link
              href={`/orders/${encodeURIComponent(orderNumber)}`}
              className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-semibold"
            >
              Back to order
            </Link>
          </div>
        </div>
      </main>
      <div className="print:hidden">
        <SiteFooter />
      </div>
    </div>
  );
}
