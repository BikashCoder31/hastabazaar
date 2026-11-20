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
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Marketplace governance</p>
        <h1 className="section-title">Marketplace controls</h1>
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
      {(can(staff,'system.health.view')||can(staff,'system.incidents.manage'))&&<p><Link className="font-semibold underline" href="/admin/system-health/incidents">Open incidents, response plans and recovery evidence</Link></p>}
    </div>
  );
}
