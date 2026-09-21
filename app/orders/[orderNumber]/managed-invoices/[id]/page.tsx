import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { getCustomerUser } from '@/lib/auth/customer';
import { RECEIPT_COOKIE, hashOpaqueToken, readCookieHeader } from '@/lib/cart/session';
import { DocumentMachineCodes } from '@/components/commerce/document-machine-codes';
import { PrintDocumentButton } from '@/components/commerce/print-document-button';
import { requireDatabase } from '@/lib/db/d1';
import { getManagedInvoiceGroup } from '@/lib/db/repositories/managed-documents';

export const dynamic='force-dynamic';
const money=(paisa:number)=>new Intl.NumberFormat('en-NP',{style:'currency',currency:'NPR'}).format(paisa/100);

export default async function ManagedInvoicePage({params}:{params:Promise<{orderNumber:string;id:string}>}){
  const {orderNumber,id}=await params;const requestHeaders=await headers();
  const token=readCookieHeader(requestHeaders.get('cookie'),RECEIPT_COOKIE);const customer=await getCustomerUser();if(!token&&!customer)notFound();
  const invoice=await getManagedInvoiceGroup(requireDatabase(env as unknown as {DB?:D1Database}),{orderNumber,invoiceId:id,receiptTokenHash:token?await hashOpaqueToken(token):null,customerId:customer?.userId??null});if(!invoice)notFound();
  return <main className="shell py-10 print:max-w-none print:px-0 print:py-0" id="main-content" tabIndex={-1}><article className="mx-auto max-w-4xl rounded-2xl border border-amber-300 bg-white p-8 text-slate-950 print:border-0">
    <p className="font-bold text-amber-800">{invoice.simulationLabel}</p><h1 className="mt-2 font-heading text-4xl">Simulated issuer invoice</h1>
    <p className="mt-2">{invoice.invoiceNumber} · Order {invoice.snapshot.orderNumber}</p>
    <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm"><strong>Not a live tax document.</strong> Issuer identity and tax treatment remain pending production review. This record exists only for isolated workflow testing.</div>
    <dl className="mt-6 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs uppercase">Simulated issuer</dt><dd>{invoice.snapshot.issuerReference}</dd></div><div><dt className="text-xs uppercase">Simulated legal seller</dt><dd>{invoice.snapshot.legalSellerReference}</dd></div></dl>
    <table className="mt-7 w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Item</th><th>Qty</th><th className="text-right">Amount</th></tr></thead><tbody>{invoice.snapshot.items.map(item=><tr className="border-b" key={item.orderItemId}><td className="py-3">{item.productName}<span className="block text-xs">SKU {item.sku}</span></td><td>{item.quantity}</td><td className="text-right">{money(item.lineTotalPaisa)}</td></tr>)}</tbody></table>
    <p className="mt-5 text-right text-lg font-bold">Product total: {money(invoice.snapshot.productTotalPaisa)}</p>
    {invoice.adjustments.length?<section className="mt-7 rounded-xl border p-4"><h2 className="font-heading text-xl">Correction documents</h2><p className="mt-1 text-xs text-slate-600">These append-only simulated documents do not rewrite the original invoice or independently move money.</p><ul className="mt-3 space-y-3">{invoice.adjustments.map(adjustment=><li key={adjustment.id} className="flex flex-wrap justify-between gap-3 border-t pt-3 text-sm"><span><strong>{adjustment.adjustmentNumber}</strong><span className="block capitalize">{adjustment.kind.replace('_',' ')} · {adjustment.reasonCode.replaceAll('_',' ')}</span><span className="block text-xs text-slate-600">{adjustment.note}</span></span><strong>{adjustment.kind==='credit_note'?'−':'+'}{money(adjustment.amountPaisa)}</strong></li>)}</ul></section>:null}
    <DocumentMachineCodes invoiceNumber={invoice.invoiceNumber} qrPayload={invoice.qrPayload}/>
    <div className="mt-7 print:hidden"><PrintDocumentButton /></div>
  </article></main>;
}
