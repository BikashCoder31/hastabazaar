import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { can } from '@/lib/marketplace/permissions';
import {readIncidentPageEvidence} from '@/lib/operations/incident-page-evidence';
import { IncidentWorkspace } from '@/components/admin/incident-workspace';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic = 'force-dynamic';
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ incident?: string; legacy?: string; returnTo?:string }>;
}) {
  const actor = await requireStaffPage('/admin/system-health/incidents'),
    db = requireDatabase(env),
    query = await searchParams,
    returnTo=safeAdminReturnTo(query.returnTo,'/admin/system-health'),
    evidence=await readIncidentPageEvidence(db,actor,{...env,NODE_ENV:process.env.NODE_ENV},query.incident);
  if (!evidence.available)
    return (
      <main className="space-y-4">
        <Link className="text-sm underline" href={returnTo}>Back to results</Link>
        <h1 className="text-2xl font-semibold">Incidents</h1>
        <p>
          Current runtime scope is unavailable. Protected incident actions are
          paused.
        </p>
      </main>
    );
  const {rows,detail,legacy,responders,manage,canAct}=evidence;
  return (
    <main className="space-y-6">
      <div>
        <p><Link className="text-sm underline" href={returnTo}>Back to results</Link></p>
        {can(actor, 'system.health.view') && (
          <Link href={withAdminReturnTo('/admin/system-health',returnTo)} className="text-sm underline">
            System health &amp; records
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-semibold">Incidents</h1>
        <p className="text-sm text-muted-foreground">
          Environment: {evidence.environment}. Ownership, acknowledgment and
          recovery evidence are recorded separately.
        </p>
      </div>
      <IncidentWorkspace
        actorId={actor.id}
        rows={rows}
        detail={detail}
        legacy={legacy}
        responders={responders}
        manage={manage}
        canAct={canAct}
        superAdmin={actor.role === 'super_admin'}
        initialLegacyId={query.legacy}
        returnTo={returnTo}
      />
    </main>
  );
}
