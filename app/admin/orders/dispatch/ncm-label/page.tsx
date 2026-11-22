import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPageHelpProvider, AdminPageTitle } from '@/components/admin/page-help';
import { PrintDocumentButton } from '@/components/commerce/print-document-button';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { NcmBookingError } from '@/lib/delivery/ncm-booking';
import { getNcmLabel, type NcmLabelView } from '@/lib/delivery/ncm-booked-actions';

const pathname = '/admin/orders/dispatch/ncm-label';
export const dynamic = 'force-dynamic';
export const metadata = {title:'NCM parcel label',robots:{index:false,follow:false}};

export default async function NcmLabelPage({searchParams}: {searchParams:Promise<{jobId?:string}>}) {
  const {jobId} = await searchParams;
  if (typeof jobId !== 'string' || !jobId || jobId.length > 191) notFound();
  await requireStaffPage(pathname + '?jobId=' + encodeURIComponent(jobId),'order.manage',{readOnly:true});
  let label: NcmLabelView | null = null;
  try {
    label = await getNcmLabel(requireDatabase(env as unknown as {DB?:D1Database}),env,jobId);
  } catch (error) {
    if (error instanceof NcmBookingError && error.status === 404) notFound();
  }
  const rows = label ? [
    ['From branch',label.from],['To branch',label.to],['Sender',label.sender.join(' · ')],['Receiver',label.receiver.join(' · ')],
    ['Package',label.description],['Handling',label.handling],['Delivery type',label.deliveryType],
  ] : [];
  return <section className="min-w-0 space-y-4 text-[#14213D] print:text-black">
    <AdminPageHelpProvider help={{pathname,title:'Printing the NCM label',sentences:['Print this label and attach it to the matching parcel. Check the NCM order number before handing over the parcel.']}}>
      <AdminPageTitle><h1 className="section-title">NCM parcel label</h1></AdminPageTitle>
    </AdminPageHelpProvider>
    <div className="flex flex-wrap items-center gap-3 print:hidden [&_button]:min-h-11">
      <Link className="inline-flex min-h-11 items-center font-semibold underline" href="/admin/orders/dispatch?lane=booked">Back to Dispatch</Link>
      {label ? <PrintDocumentButton /> : null}
    </div>
    {label ? <article className="min-w-0 max-w-xl rounded-xl border border-[#E2D6C2] bg-white p-5 print:rounded-none print:border-black">
      <p className="font-semibold">Nepal Can Move</p>
      <p className="wrap-anywhere text-xl font-bold">{label.tracking}</p>
      <p className="wrap-anywhere text-sm">Hastabazaar order {label.orderNumber} · Courier reference {label.vendorReference}</p>
      <dl className="mt-4 grid gap-2">
        {rows.filter(([,value]) => value).map(([label,value]) =>
          <div key={label} className="grid min-w-0 gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="font-semibold">{label}</dt><dd className="wrap-anywhere">{value}</dd>
          </div>)}
      </dl>
    </article> : <p className="rounded-xl border border-[#E2D6C2] bg-white p-4 text-sm">The NCM label could not be loaded. Check the connection and try opening it again.</p>}
  </section>;
}
