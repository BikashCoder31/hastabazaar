import type {LiveManagedInvoiceDocument} from '@/lib/db/repositories/live-managed-documents';
import {ApprovedBillingDocument} from './approved-billing-document';
import {PrintDocumentButton} from './print-document-button';
import {documentMoney,documentDate} from '@/lib/documents/billing';
export function LiveManagedInvoiceDocumentView({document}:{document:LiveManagedInvoiceDocument}){
 return <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-100 px-3 py-7 print:bg-white print:p-0"><div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center gap-4 print:hidden"><a className="underline" href={`/orders/${encodeURIComponent(document.snapshot.orderNumber)}`}>Back to order</a><PrintDocumentButton/></div>
  <ApprovedBillingDocument snapshot={document.snapshot} kind="commercial_invoice" documentNumber={document.invoiceNumber} group={document.group} notice={`Commercial invoice; not a tax invoice. Amounts and payment status are retained as recorded at issue.${document.status!=='issued'?` Document status: ${document.status}.`:''}`}/>
  {document.adjustments.length?<section className="mx-auto mt-6 max-w-4xl bg-white p-6"><h2 className="text-xl font-semibold">Correction documents</h2><p>The original invoice remains unchanged. These records show its linked corrections.</p><ul className="mt-3 space-y-3">{document.adjustments.map(adjustment=><li id={'adjustment-'+adjustment.id} key={adjustment.id}><strong>{adjustment.adjustmentNumber}</strong> · {adjustment.kind==='credit_note'?'Credit note':'Debit note'} · {documentDate(adjustment.issuedAt)} · NPR {documentMoney(adjustment.amountPaisa)}</li>)}</ul></section>:null}
 </main>;
}
