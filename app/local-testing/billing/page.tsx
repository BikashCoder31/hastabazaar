import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isLocalTestRequest, readLocalTestRole } from '@/lib/auth/local-test-access';
import { billingPreviewSnapshot } from '@/lib/staging/billing-preview';
import { ApprovedBillingDocument } from '@/components/commerce/approved-billing-document';
import { PrintDocumentButton } from '@/components/commerce/print-document-button';
import { mayApplyCompanyStamp } from '@/lib/documents/company-stamp';
import stamp from '@/lib/documents/company-stamp-data.json';

export const dynamic='force-dynamic';
export default async function BillingPreview({searchParams}:{searchParams:Promise<{kind?:string;document?:string;viewport?:string}>}) {
  const requestHeaders=await headers();
  if(!isLocalTestRequest(requestHeaders)||!readLocalTestRole(requestHeaders))notFound();
  const query=await searchParams;
  const kind=query.kind==='company'||query.kind==='registered'?query.kind:'mixed';
  const snapshot=billingPreviewSnapshot(kind);
  const receipts=query.document==='receipts';
  if(!receipts)snapshot.paymentStatus='pending';
  return <main className="min-h-screen bg-slate-100 px-3 py-6 print:bg-white print:p-0" id="main-content" tabIndex={-1}>
    <div className="mx-auto mb-5 max-w-4xl space-y-3 print:hidden"><p>Local render preview with fictional order details. No order, payment, bill number or account is created.</p>
      <nav className="flex flex-wrap gap-4">{(['company','registered','mixed'] as const).map(value=><Link key={value} className="underline" href={`/local-testing/billing?kind=${value}&document=${receipts?'receipts':'invoice'}`}>{value}</Link>)}
        <Link className="underline" href={`/local-testing/billing?kind=${kind}&document=${receipts?'invoice':'receipts'}`}>{receipts?'Order Invoice':'Receipts'}</Link>
        <Link className="underline" href={`/local-testing/billing?kind=${kind}&document=${receipts?'receipts':'invoice'}&viewport=${query.viewport==='mobile'?'desktop':'mobile'}`}>{query.viewport==='mobile'?'Desktop preview':'Mobile preview'}</Link></nav><PrintDocumentButton/></div>
    <div className="mx-auto max-w-full" style={{width:query.viewport==='mobile'?390:undefined,containerType:'inline-size'}}>
    {receipts?snapshot.billing!.receiptGroups!.map(group=><ApprovedBillingDocument key={group.key} snapshot={snapshot} kind="payment_receipt" documentNumber="preview-only" group={group}
      stampSource={mayApplyCompanyStamp(group)?`data:${stamp.mimeType};base64,${stamp.base64}`:undefined}/>):
      <ApprovedBillingDocument snapshot={snapshot} kind="order_statement" documentNumber="preview-only"/>}</div>
  </main>;
}
