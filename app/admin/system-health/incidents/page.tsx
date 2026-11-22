import { AdminPageTitle } from '@/components/admin/page-help';
import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { can } from '@/lib/marketplace/permissions';
import { readIncidentPageEvidence } from '@/lib/operations/incident-page-evidence';
import { IncidentWorkspace } from '@/components/admin/incident-workspace';
import { safeAdminReturnTo, withAdminReturnTo } from '@/lib/admin/return-context';

export const dynamic = 'force-dynamic';
const back = 'inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4';

export default async function IncidentsPage({ searchParams }: {
  searchParams: Promise<{ incident?: string; legacy?: string; report?: string; returnTo?: string }>;
}) {
  const [actor, query] = await Promise.all([requireStaffPage('/admin/system-health/incidents'), searchParams]);
  const db = requireDatabase(env);
  const returnTo = safeAdminReturnTo(query.returnTo, '/admin/system-health');
  const evidence = await readIncidentPageEvidence(db, actor, { ...env, NODE_ENV: process.env.NODE_ENV }, query.incident);
  const canViewHealth = can(actor, 'system.health.view');
  const backHref = canViewHealth || returnTo !== '/admin/system-health' ? returnTo : '/admin';

  return <section className="max-w-[69.75rem] min-w-0 space-y-5">
    <header>
      <div className="flex flex-wrap gap-x-4">
        <Link className={back} href={backHref}>{backHref === '/admin/system-health' ? 'System health & backups' : 'Back to results'}</Link>
        {canViewHealth && backHref !== '/admin/system-health' ? <Link className={back} href={withAdminReturnTo('/admin/system-health', backHref)}>System health &amp; backups</Link> : null}
      </div>
      <AdminPageTitle><h1 className="font-heading text-[28px] tracking-tight">Incidents</h1></AdminPageTitle>
      {evidence.available ? <p className="mt-2 text-sm text-muted-foreground">Environment · {evidence.environment}. Ownership, acknowledgment and recovery evidence are recorded separately.</p> : null}
    </header>
    {!evidence.available ? <p role="alert" className="rounded-xl border bg-card p-4">Current runtime scope is unavailable. Protected incident actions are paused.</p> : <IncidentWorkspace
      actorId={actor.id}
      rows={evidence.rows}
      detail={evidence.detail}
      legacy={evidence.legacy}
      responders={evidence.responders}
      manage={evidence.manage}
      canAct={evidence.canAct}
      superAdmin={actor.role === 'super_admin'}
      initialLegacyId={query.legacy}
      initialReport={evidence.manage && query.report === '1'}
      returnTo={backHref}
    />}
  </section>;
}
