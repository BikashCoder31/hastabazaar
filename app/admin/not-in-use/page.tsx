import { env } from 'cloudflare:workers';
import { ChevronDown, Eye, LockKeyhole, Smartphone, Truck } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPageTitle } from '@/components/admin/page-help';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getBusinessSettingForManagement } from '@/lib/db/repositories/business-settings';

export const dynamic = 'force-dynamic';

const recordsHref = '/admin/riders?view=records';
const staffHistoryHref = withAdminReturnTo('/admin/staff-form-history?kind=rider-control', '/admin/not-in-use');
const npr = new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const beforeTurningOn = [
  'Hire riders and have each one register a Hastabazaar account.',
  'Confirm the cash hand-in time and cash limit above.',
  'Test live tracking on real phones inside the valley.',
  'Add “Own rider” back as a delivery choice on orders, next to couriers.',
];

export default async function NotInUsePage() {
  const staff = await requireStaffPage('/admin/not-in-use', 'order.manage');
  if (staff.role !== 'super_admin') notFound();
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const now = new Date().getTime();
  const [handIn, finance] = await Promise.all([
    getBusinessSettingForManagement(db, 'rider_remittance_business_days', now).catch(() => null),
    getBusinessSettingForManagement(db, 'rider_finance_policy', now).catch(() => null),
  ]);
  const days = handIn?.value;
  const policy = finance?.value;
  const limit = policy && typeof policy === 'object' && 'cashExposureLimitPaisa' in policy
    ? policy.cashExposureLimitPaisa : null;
  const parked = [
    { title: 'Rider applications & reports', detail: 'Sign-ups, reports and code checks', href: recordsHref, source: '/admin/riders' },
    { title: 'Rider form history', detail: <>Past rider form answers · <Link href={staffHistoryHref} className="inline-flex min-h-11 items-center underline underline-offset-2">Staff review history</Link></>, href: '/admin/riders/form-history?kind=report', source: '/admin/riders/form-history' },
    { title: 'Rider app', detail: 'The page riders use on their phone', href: '/rider', source: '/rider' },
    { title: 'Live map tracking', detail: 'Rider location on a customer’s order', source: 'Delivery assignments' },
    { title: 'Rider cash hand-in', detail: typeof days === 'number'
      ? `${handIn?.source === 'persisted' ? 'Saved value' : 'Default'}: ${days} working ${days === 1 ? 'day' : 'days'}` : 'Setting unavailable', source: 'Business setting' },
    { title: 'Rider cash limit', detail: typeof limit === 'number'
      ? `${finance?.source === 'persisted' ? 'Saved value' : 'Default'}: ${npr.format(limit / 100)}`
      : finance ? 'No cash limit configured' : 'Setting unavailable', source: 'Business setting' },
  ];

  return <div className="max-w-[65rem] space-y-5 text-[#14213D]">
    <AdminPageTitle><h1 className="section-title">Not in use yet</h1></AdminPageTitle>
    <div className="flex gap-3 rounded-2xl bg-[#EDE4D3] p-4 text-sm leading-6">
      <LockKeyhole className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div><h2 className="font-bold">Built, but switched off for now</h2>
        <p className="text-[#2C3B5C]">These features are kept here while they’re out of use. Their saved values and records are kept for a future release.</p></div>
    </div>
    <details open className="group rounded-2xl border bg-card">
      <summary className="grid min-h-16 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl p-4 outline-primary focus-visible:outline-2 sm:flex sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EDE4D3] text-[#46536F]"><Truck className="size-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><span className="block font-bold">Own delivery riders</span>
          <span className="block text-sm text-[#46536F]">Hastabazaar’s own riders who pick up, deliver and collect cash.</span></span>
        <span className="col-span-2 flex shrink-0 items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDE4D3] px-3 py-1 text-xs font-semibold"><LockKeyhole className="size-3.5" aria-hidden="true" />Switched off</span>
          <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </span>
      </summary>
      <div className="space-y-4 px-4 pb-5 sm:px-5">
        <div className="flex gap-3 rounded-xl bg-[#E3E9F4] p-3 text-sm leading-6 text-[#1E3566]">
          <Truck className="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
          <p><strong>Meanwhile:</strong> courier companies such as Nepal Can Move pick up from sellers, deliver, and collect the cash on delivery. Super Admin tracks their payments under Money › Courier cash.</p>
        </div>
        <section aria-labelledby="parked-delivery-heading">
          <h2 id="parked-delivery-heading" className="text-sm font-semibold text-[#46536F]">What’s parked here</h2>
          <ul className="mt-1 divide-y">
            {parked.map(row => <li key={row.title} className="grid min-h-11 items-center gap-x-4 py-2 text-sm md:grid-cols-[1fr_1.2fr_1fr]">
              {row.href ? <Link href={row.href} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2">{row.title}</Link>
                : <span className="font-semibold">{row.title}</span>}
              <span className="text-[#46536F]">{row.detail}</span>
              <span className="break-all font-mono text-xs text-[#675B4E]">{row.source}</span>
            </li>)}
          </ul>
        </section>
        <section aria-labelledby="before-delivery-heading">
          <h2 id="before-delivery-heading" className="text-sm font-semibold text-[#46536F]">Before turning it on</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">{beforeTurningOn.map(step => <li key={step}>{step}</li>)}</ol>
        </section>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href={recordsHref} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold"><Eye className="size-4" aria-hidden="true" />View old records (read only)</Link>
          <p className="text-xs text-[#675B4E]">It goes live as a planned release.</p>
        </div>
      </div>
    </details>
    <section className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border bg-card p-4 sm:flex sm:p-5" aria-labelledby="parked-sms-heading">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EDE4D3] text-[#46536F]"><Smartphone className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><h2 id="parked-sms-heading" className="font-bold">SMS alerts</h2>
        <p className="text-sm text-[#46536F]">Text messages to customers and sellers about their orders.</p></div>
      <span className="col-span-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#EDE4D3] px-3 py-1 text-xs font-semibold"><LockKeyhole className="size-3.5" aria-hidden="true" />Not built yet</span>
    </section>
  </div>;
}
