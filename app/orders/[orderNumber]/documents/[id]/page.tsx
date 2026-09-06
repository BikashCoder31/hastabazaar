import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { PrintDocumentButton } from '@/components/commerce/print-document-button';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { getCustomerUser } from '@/lib/auth/customer';
import { RECEIPT_COOKIE, hashOpaqueToken, readCookieHeader } from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { getOrderDocument } from '@/lib/db/repositories/orders';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Order document' };

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100);
}

export default async function OrderDocumentPage({
  params,
}: {
  params: Promise<{ orderNumber: string; id: string }>;
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

  return (
    <div className="min-h-screen bg-muted/25 print:bg-white">
      <div className="print:hidden"><SiteHeader /></div>
      <main className="shell py-10 sm:py-14 print:max-w-none print:px-0 print:py-0">
        <div className="mx-auto max-w-4xl rounded-2xl border bg-white p-6 shadow-sm sm:p-10 print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-5 border-b pb-7">
            <div>
              <p className="eyebrow">Hathkriti marketplace</p>
              <h1 className="mt-2 font-heading text-4xl">{snapshot.documentTitle}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{document.documentNumber}</p>
            </div>
            <div className="text-right text-sm leading-6">
              <p><strong>Order:</strong> {snapshot.orderNumber}</p>
              <p><strong>Issued:</strong> {new Date(snapshot.issuedAt).toLocaleString('en-NP')}</p>
              <p><strong>Status:</strong> {document.status}</p>
            </div>
          </div>
          <div className="mt-7 overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead><tr className="border-b"><th className="py-3 pr-4">Item</th><th className="py-3 pr-4">Seller</th><th className="py-3 pr-4">Qty</th><th className="py-3 pr-4 text-right">Unit price</th><th className="py-3 text-right">Line total</th></tr></thead>
              <tbody>{snapshot.items.map((item) => <tr key={`${item.sku}-${item.sellerName}`} className="border-b"><td className="py-4 pr-4"><strong>{item.productName}</strong><span className="block text-xs text-muted-foreground">SKU {item.sku}</span></td><td className="py-4 pr-4">{item.sellerName}</td><td className="py-4 pr-4">{item.quantity}</td><td className="py-4 pr-4 text-right">{money(item.unitPricePaisa)}</td><td className="py-4 text-right font-semibold">{money(item.lineTotalPaisa)}</td></tr>)}</tbody>
            </table>
          </div>
          <dl className="ml-auto mt-7 max-w-sm space-y-3 text-sm"><div className="flex justify-between"><dt>Items</dt><dd>{money(snapshot.itemSubtotalPaisa)}</dd></div><div className="flex justify-between"><dt>Delivery</dt><dd>{money(snapshot.deliveryChargePaisa)}</dd></div><div className="flex justify-between"><dt>Platform fee</dt><dd>{money(snapshot.buyerPlatformFeePaisa)}</dd></div><div className="flex justify-between"><dt>Tax collected</dt><dd>{money(snapshot.taxTotalPaisa)}</dd></div><div className="flex justify-between border-t pt-3 text-base font-semibold"><dt>Total</dt><dd>{money(snapshot.grandTotalPaisa)}</dd></div></dl>
          <div className="mt-8 rounded-xl bg-secondary/35 p-5 text-sm leading-7"><p><strong>Payment:</strong> {snapshot.paymentMethod} · {snapshot.paymentStatus}</p><p className="mt-2 text-muted-foreground">This operational document preserves the order and payment snapshot. It is not a PAN/VAT tax invoice. Tax invoicing remains disabled until Hathkriti’s approved legal identity and invoice format are configured.</p></div>
          <div className="mt-7 flex flex-wrap gap-3 print:hidden"><PrintDocumentButton /><Link href={`/orders/${encodeURIComponent(orderNumber)}`} className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-semibold">Back to order</Link></div>
        </div>
      </main>
      <div className="print:hidden"><SiteFooter /></div>
    </div>
  );
}
