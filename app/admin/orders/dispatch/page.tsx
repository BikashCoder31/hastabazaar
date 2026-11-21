import { env } from 'cloudflare:workers';
import { DispatchWorkspace } from '@/components/admin/dispatch-workspace';
import {
  AdminPageHelpProvider,
  AdminPageTitle,
} from '@/components/admin/page-help';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { can } from '@/lib/marketplace/permissions';
import { pickupOptions } from './pickup-window';
import { dispatchLanes, readDispatchParcels } from './read-dispatch';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Dispatch',
  robots: { index: false, follow: false },
};
const observedAt = () => Date.now();
const pathname = '/admin/orders/dispatch';

export default async function DispatchPage({ searchParams }: { searchParams?: Promise<{ lane?: string }> } = {}) {
  const staff = await requireStaffPage(pathname, 'order.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [parcels, query] = await Promise.all([readDispatchParcels(db), searchParams]);
  const initialLane = dispatchLanes.find(({ id }) => id === query?.lane)?.id;
  return (
    <div className="min-w-0 space-y-4">
      <AdminPageHelpProvider
        help={{
          pathname,
          title: 'How dispatch works',
          sentences: [
            'Sellers mark parcels “Ready for pickup”. Book a courier on their website or by phone, then record it here with the booking number.',
            'Confirm pickup when the courier collects the parcels. The cash they collect shows in Money › Courier cash.',
          ],
          procedureHref: can(staff, 'support.manage')
            ? '/admin/legal-policies/active'
            : undefined,
        }}
      >
        <AdminPageTitle>
          <h1 className="section-title">Orders</h1>
        </AdminPageTitle>
      </AdminPageHelpProvider>
      <DispatchWorkspace
        key={initialLane}
        initialLane={initialLane}
        parcels={parcels}
        actorId={staff.id}
        options={pickupOptions(observedAt())}
      />
    </div>
  );
}
