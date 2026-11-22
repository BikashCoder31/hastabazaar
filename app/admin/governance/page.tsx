import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import {can} from '@/lib/marketplace/permissions';
import { GovernanceConsole } from '@/components/admin/governance-console';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getGovernanceOverview } from '@/lib/db/repositories/operations';
export const dynamic = 'force-dynamic';
export default async function GovernancePage() {
  const staff = await requireStaffPage('/admin/governance', 'catalog.manage');
  const data = await getGovernanceOverview(
    requireDatabase(env as unknown as { DB?: D1Database }),
    staff.role,
  );
  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere] [&_[data-slot=tabs-list]]:h-auto [&_[data-slot=tabs-list]]:max-w-full [&_[data-slot=tabs-list]]:flex-wrap [&_[data-slot=tabs-list]]:justify-start [&_[data-slot=tabs-trigger]]:min-h-11 [&_[data-slot=tabs-trigger]]:flex-none">
      <div>
        <AdminPageTitle><h1 className="section-title">Marketplace controls</h1></AdminPageTitle>
      </div>
      <p className="max-w-3xl leading-7 text-muted-foreground">
        Manage listing rules and proposed placements. Sensitive account and
        resilience controls are reserved for Super Admins.
      </p>
      <GovernanceConsole
        data={data}
        superAdmin={staff.role === 'super_admin'}
        actorId={staff.id}
      />
      {(can(staff,'system.health.view')||can(staff,'system.incidents.manage'))&&<p><Link className="inline-flex min-h-11 items-center font-semibold underline" href="/admin/system-health/incidents">Open incidents, response plans and recovery evidence</Link></p>}
    </div>
  );
}
