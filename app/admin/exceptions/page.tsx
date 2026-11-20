import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { AdminPageTitle } from '@/components/admin/page-help';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listExceptionWork, listUnrecordedParcelExceptions } from '@/lib/operations/exception-work';

export const dynamic = 'force-dynamic';

const subjects: Record<string, string> = {
  delivery_failed: 'Delivery failed', failed_delivery: 'Delivery failed', customer_unavailable: 'Customer unavailable',
  cancelled: 'Parcel cancelled', cancelled_parcel: 'Parcel cancelled', incorrect_cash: 'Posted cash discrepancy',
};
const row = 'block min-h-11 rounded-xl border border-[#E4DACA] bg-white px-4 py-3 hover:border-[#14213D]';
const href = (orderId: string) => withAdminReturnTo(`/admin/orders/${encodeURIComponent(orderId)}?tab=parcel-cash#exceptions`, '/admin/exceptions');

export default async function ExceptionsPage() {
  const staff = await requireStaffPage('/admin/exceptions', 'order.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [items, sources] = await Promise.all([listExceptionWork(db, staff.id), listUnrecordedParcelExceptions(db, staff.id)]);

  return <div className="space-y-5 text-[#14213D]">
    <AdminPageTitle><h1 className="section-title">Exception follow-up</h1></AdminPageTitle>
    <Link href="/admin/shipping" className="section-link inline-flex min-h-11 items-center">Open parcel problems</Link>
    <section aria-labelledby="exception-unrecorded" className="space-y-3">
      <h2 id="exception-unrecorded" className="font-heading text-xl font-semibold">Parcel exceptions awaiting follow-up</h2>
      {sources.map(source => <Link key={source.id} href={href(source.orderId)} className={row}>
        <strong>{source.orderNumber} · {subjects[source.status] ?? source.status}</strong>
        <span className="block text-sm text-[#46536F]">Unassigned operations queue</span>
        <span className="block text-sm underline underline-offset-4">Review source and record next action</span>
      </Link>)}
      {!sources.length ? <p className="text-sm text-[#46536F]">No parcel exceptions are awaiting a follow-up record.</p> : null}
    </section>
    <section aria-labelledby="exception-recorded" className="space-y-3">
      <h2 id="exception-recorded" className="font-heading text-xl font-semibold">Recorded follow-ups</h2>
      {items.map(item => <Link key={item.id} href={href(item.orderId)} className={row}>
        <strong>{subjects[item.kind] ?? item.kind.replaceAll('_', ' ')} · <span className="capitalize">{item.status}</span></strong>
        <span className="block text-sm text-[#46536F]">{item.ownerName ?? 'Unassigned operations queue'}</span>
        <span className="block text-sm break-words">Next action: {item.nextAction}</span>
        <span className="block text-sm underline underline-offset-4">Open order and recorded history</span>
      </Link>)}
      {!items.length ? <p className="text-sm text-[#46536F]">No exception follow-ups are recorded.</p> : null}
    </section>
  </div>;
}
