import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { getCustomerUser } from '@/lib/auth/customer';
import { RECEIPT_COOKIE, hashOpaqueToken, readCookieHeader } from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { getManagedInvoiceGroup } from '@/lib/db/repositories/managed-documents';

export const dynamic='force-dynamic';
const money=(paisa:number)=>new Intl.NumberFormat('en-NP',{style:'currency',currency:'NPR'}).format(paisa/100);

export default async function ManagedInvoicePage({params}:{params:Promise<{orderNumber:string;id:string}>}){
  const {orderNumber,id}=await params;const requestHeaders=await headers();
  const token=readCookieHeader(requestHeaders.get('cookie'),RECEIPT_COOKIE);const customer=await getCustomerUser();if(!token&&!customer)notFound();
  const invoice=await getManagedInvoiceGroup(requireDatabase(env as unknown as {DB?:D1Database}),{orderNumber,invoiceId:id,receiptTokenHash:token?await hashOpaqueToken(token):null,customerId:customer?.userId??null});if(!invoice)notFound();
  return <main className="shell py-10" id="main-content" tabIndex={-1}><article className="mx-auto max-w-4xl rounded-2xl border border-amber-300 bg-white p-8 text-slate-950">
    <p className="font-bold text-amber-800">{invoice.simulationLabel}</p><h1 className="mt-2 font-heading text-4xl">Simulated issuer invoice</h1>
    <p className="mt-2">{invoice.invoiceNumber} · Order {invoice.snapshot.orderNumber}</p>
    <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm"><strong>Not a live tax document.</strong> Issuer identity and tax treatment remain pending production review. This record exists only for isolated workflow testing.</div>
    <dl className="mt-6 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs uppercase">Simulated issuer</dt><dd>{invoice.snapshot.issuerReference}</dd></div><div><dt className="text-xs uppercase">Simulated legal seller</dt><dd>{invoice.snapshot.legalSellerReference}</dd></div></dl>
    <table className="mt-7 w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Item</th><th>Qty</th><th className="text-right">Amount</th></tr></thead><tbody>{invoice.snapshot.items.map(item=><tr className="border-b" key={item.orderItemId}><td className="py-3">{item.productName}<span className="block text-xs">SKU {item.sku}</span></td><td>{item.quantity}</td><td className="text-right">{money(item.lineTotalPaisa)}</td></tr>)}</tbody></table>
    <p className="mt-5 text-right text-lg font-bold">Product total: {money(invoice.snapshot.productTotalPaisa)}</p>
    <div className="mt-7 grid gap-4 text-xs sm:grid-cols-2"><div className="break-all rounded border p-3"><strong>Barcode payload (rendering in R05)</strong><br/>{invoice.barcodePayload}</div><div className="break-all rounded border p-3"><strong>QR payload (rendering in R05)</strong><br/>{invoice.qrPayload}</div></div>
  </article></main>;
}
