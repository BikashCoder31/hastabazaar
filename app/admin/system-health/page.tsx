import { AdminPageHelpProvider } from '@/components/admin/page-help';
import { SystemHealthWorkspace } from '@/components/admin/system-health-workspace';
import { safeAdminReturnTo } from '@/lib/admin/return-context';
import { requireStaffPage } from '@/lib/auth/staff';
import { can } from '@/lib/marketplace/permissions';
import { readHealthPageEvidence } from './evidence';

export const dynamic = 'force-dynamic';

export default async function SystemHealthPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const path = '/admin/system-health';
  const [actor, query] = await Promise.all([requireStaffPage(path, 'system.health.view'), searchParams]);
  const superAdmin = actor.role === 'super_admin';
  const evidence = await readHealthPageEvidence(actor.id, superAdmin && can(actor, 'audit_log.view'));
  const help = {
    pathname: path,
    title: 'System health and backups',
    sentences: [
      'Check the website, database, email and photo storage. Review any open incidents and the work needed next.',
      'Run all checks to try the current read-only probes and refresh recorded evidence. A check needs current evidence to show Working.',
    ],
    procedureHref: can(actor, 'support.manage') ? '/admin/legal-policies/active' : undefined,
  };
  return <AdminPageHelpProvider help={help}>
    <SystemHealthWorkspace
      {...evidence}
      actorId={actor.id}
      returnTo={query?.returnTo === undefined ? undefined : safeAdminReturnTo(query.returnTo)}
      canReport={can(actor, 'system.incidents.manage')}
      showForms={superAdmin && can(actor, 'business_settings.manage')}
      showEmail={can(actor, 'email.delivery.manage')}
    />
  </AdminPageHelpProvider>;
}
