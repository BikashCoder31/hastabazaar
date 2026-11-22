import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DeliveryPartners } from '@/components/admin/delivery-partners';
import { AdminPageHelpProvider, AdminPageTitle } from '@/components/admin/page-help';
import { requireStaffPage } from '@/lib/auth/staff';
import { nepalDayIso } from '@/lib/dates/nepal-calendar';
import { requireDatabase } from '@/lib/db/d1';
import { listDeliveryPartners } from '@/lib/delivery/partners';
import { ncmPartnerName, ncmSettingsView } from '@/lib/delivery/ncm-settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Delivery partners', robots: { index: false, follow: false } };
const path = '/admin/orders/delivery-partners';
const observedAt = () => Date.now();

export default async function DeliveryPartnersPage() {
  const staff = await requireStaffPage(path, 'order.manage');
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const monthStart = Date.parse(nepalDayIso(observedAt()).slice(0, 7) + '-01T00:00:00+05:45');
  const partners = await listDeliveryPartners(db, { monthStart });
  const ncmPartner = partners?.find(partner => ncmPartnerName(partner.name));
  const ncm = ncmPartner ? await ncmSettingsView(db, ncmPartner.id, env, observedAt()) : null;

  return <div className="min-w-0 space-y-4 text-[#14213D]">
    <AdminPageHelpProvider help={{
      pathname: path, title: 'How delivery partners work',
      sentences: ['Choose which couriers appear in Dispatch and which one is selected first. Enter a tracking link pattern if the courier gives you one.'],
      procedureHref: '/admin/legal-policies/active',
    }}>
      <AdminPageTitle><h1 className="section-title">Orders<span className="sr-only"> · Delivery partners</span></h1></AdminPageTitle>
    </AdminPageHelpProvider>
    <p className="max-w-3xl text-sm leading-relaxed text-[#46536F]">
      The couriers you book parcels with. What customers pay for delivery comes from{' '}
      <Link href="/admin/delivery-rates" className="section-link min-h-11 font-semibold underline underline-offset-4">Delivery rates</Link>.
      Bookings are by hand until a courier’s API is connected and tested.
    </p>
    {partners === null
      ? <p className="rounded-xl border border-[#E2D6C2] bg-white p-4 text-sm">Delivery partners will appear after the database update. You can keep booking couriers in Dispatch.</p>
      : <DeliveryPartners key={staff.id} actorId={staff.id} partners={partners} ncm={ncm} />}
  </div>;
}
