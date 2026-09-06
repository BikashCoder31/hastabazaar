import { env } from 'cloudflare:workers';
import { ShippingConsole } from '@/components/shipping-console';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listShippingJobs } from '@/lib/db/repositories/operations';
export const dynamic = 'force-dynamic';
export default async function AdminShippingPage() {
  await requireStaffPage('/admin/shipping', 'order.manage');
  const jobs = await listShippingJobs(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Carrier operations</p>
        <h1 className="section-title">
          Labels, pickups, claims & reconciliation
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Each record is isolated by order and seller. References are recorded
          manually; no carrier API behavior is assumed.
        </p>
      </div>
      <ShippingConsole jobs={jobs} admin />
    </div>
  );
}
