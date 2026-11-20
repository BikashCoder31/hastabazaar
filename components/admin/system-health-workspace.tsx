import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { AdminPageTitle } from '@/components/admin/page-help';
import { safeAdminReturnTo, withAdminReturnTo } from '@/lib/admin/return-context';
import type { SystemHealthOverview } from '@/lib/operations/system-health-workspace';
import type { BackupEvidence, ClosedIncident } from '@/app/admin/system-health/evidence';
import { healthTimestamp, systemHealthChecks } from '@/app/admin/system-health/check-model';
import { SystemHealthChecks } from '@/app/admin/system-health/checks-panel';

const card = 'min-w-0 space-y-2.5 rounded-[15px] border bg-card px-5 py-[18px]';
const link = 'inline-flex min-h-11 items-center font-semibold underline underline-offset-4';
const backupScopes: Record<string, string> = { d1: 'Database', r2: 'Files', full: 'Full backup' };
const evidenceLabels: Record<string, string> = {
  'application.availability': 'Application liveness',
  'database.readiness': 'Database and schema readiness',
  'email.sender': 'Automatic sender',
  'email.evaluator': 'Due-reminder checks',
  'files.public': 'Public file retrieval',
  'files.private': 'Authorized private file retrieval',
};
const evidenceStates: Record<string, string> = { healthy: 'Working', degraded: 'Needs attention', action_needed: 'Needs attention', unknown: 'Not checked yet' };
const threeDays = 3 * 24 * 60 * 60 * 1000;

function Backups({ evidence, observedAt, href }: { evidence: BackupEvidence; observedAt: number; href: string }) {
  const { available, completedAt, verification } = evidence;
  const unavailable = available ? 'Not recorded' : 'Evidence unavailable';
  const stale = completedAt == null || observedAt - completedAt > threeDays;
  return <section aria-labelledby="system-backups-heading" className={card}>
    <h2 id="system-backups-heading" className="font-bold">Backups</h2>
    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] gap-x-4 gap-y-2 text-sm">
      <dt className="text-[#46536f]">Last backup</dt>
      <dd className={stale ? 'text-[#80520a]' : ''}>{completedAt == null ? unavailable : <>
        <time dateTime={new Date(completedAt).toISOString()}>{healthTimestamp(completedAt)}</time>
        <span className="block text-xs text-[#46536f]">Preliminary data export</span>
      </>}</dd>
      <dt className="text-[#46536f]">Includes</dt>
      <dd>{completedAt == null ? unavailable : 'Database and photos'}</dd>
      <dt className="text-[#46536f]">Last restore test</dt>
      <dd className="text-[#80520a]">{unavailable}</dd>
    </dl>
    <div className="flex items-start gap-3 rounded-xl bg-[#f5e7c5] px-4 py-3.5 text-sm text-[#704808]">
      <TriangleAlert className="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
      <p>Backups older than 3 days and restores without a recorded test need attention. Test a restore on an isolated copy.</p>
    </div>
    {verification ? <p className="text-sm text-[#46536f]">
      Last verification · {backupScopes[verification.scope] ?? verification.scope} · {verification.status === 'verified' ? 'Verified' : 'Failed'} · {healthTimestamp(verification.verifiedAt)}
    </p> : null}
    <Link className={`${link} section-link text-sm`} href={href}>Open Backup &amp; transfer</Link>
  </section>;
}

function Incidents({ overview, lastClosed, canReport, sourceHref }: {
  overview: SystemHealthOverview;
  lastClosed?: ClosedIncident | null;
  canReport: boolean;
  sourceHref: (path: string) => string;
}) {
  const active = overview.incidents.length;
  const incidentPath = '/admin/system-health/incidents';
  return <section aria-labelledby="system-incidents-heading" className={card}>
    <h2 id="system-incidents-heading" className="font-bold">Incidents</h2>
    <p className="text-sm wrap-anywhere text-[#46536f]">
      {overview.environment === 'unknown' ? 'Current incident evidence is unavailable.' : active
        ? `${active === 100 ? '100+' : active} open ${active === 1 ? 'incident' : 'incidents'}.`
        : 'No open incidents.'}
      {lastClosed ? <> Last closed · {lastClosed.title} · {healthTimestamp(lastClosed.resolvedAt)}.</> : null}
    </p>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {canReport ? <Link className="admin-button" href={sourceHref(`${incidentPath}?report=1`)}>Report an incident</Link> : null}
      <Link className={link} href={sourceHref(incidentPath)}>View incidents</Link>
    </div>
  </section>;
}

export function SystemHealthWorkspace({ overview, actorId, backup, lastClosed, canReport = false, returnTo, showForms = false, showEmail = false }: {
  overview: SystemHealthOverview;
  actorId: string;
  backup?: BackupEvidence | null;
  lastClosed?: ClosedIncident | null;
  canReport?: boolean;
  returnTo?: string;
  showForms?: boolean;
  showEmail?: boolean;
}) {
  const returnHref = returnTo ? safeAdminReturnTo(returnTo) : undefined;
  const self = returnHref ? withAdminReturnTo('/admin/system-health', returnHref) : '/admin/system-health';
  const sourceHref = (href: string) => withAdminReturnTo(href, self);

  return <section aria-label="System health and backups" className="max-w-[69.75rem] min-w-0 space-y-[18px]">
    <header>
      {returnHref ? <Link className={`${link} text-sm`} href={returnHref}>Back to results</Link> : null}
      <AdminPageTitle><h1 className="font-heading text-[28px] tracking-tight">Settings</h1></AdminPageTitle>
    </header>
    <SystemHealthChecks key={`${actorId}:${overview.observedAt}`} actorId={actorId} initial={systemHealthChecks(overview.services)} side={
      <aside className="min-w-0 space-y-4">
        {backup ? <Backups evidence={backup} observedAt={overview.observedAt} href={sourceHref('/admin/backup-transfer')} /> : null}
        <Incidents overview={overview} lastClosed={lastClosed} canReport={canReport} sourceHref={sourceHref} />
      </aside>
    } />
    <details className="rounded-[15px] border bg-card px-[18px]">
      <summary className="min-h-11 cursor-pointer content-center font-semibold">Records and diagnostic scope</summary>
      <div className="space-y-4 pb-4 text-sm wrap-anywhere">
        <p className="text-[#46536f]">Environment · {overview.environment} · Release · {overview.releaseId ?? 'Not recorded'}</p>
        <p className="text-[#46536f]">Observed {healthTimestamp(overview.observedAt)} Nepal time.</p>
        <nav className="flex flex-wrap gap-x-4" aria-label="Related health records">
          <Link className={`${link} section-link`} href={sourceHref('/admin/system-health/records')}>Records &amp; audit</Link>
          {showForms ? <Link className={`${link} section-link`} href={sourceHref('/admin/forms')}>Form Management</Link> : null}
          {showEmail ? <Link className={`${link} section-link`} href={sourceHref('/admin/business-emails')}>Email delivery</Link> : null}
        </nav>
        {overview.incidents.length ? <ul className="space-y-2" aria-label="Open incident next actions">
          {overview.incidents.map(incident => <li key={incident.id}>
            <Link className={link} href={sourceHref('/admin/system-health/incidents?incident=' + encodeURIComponent(incident.id))}>
              {incident.severity} · {incident.state}
            </Link>
            <p>{incident.ownerId ? 'Assigned owner' : 'Coverage needed'} · {incident.nextAction ?? 'Review the current incident'} · Next update {incident.nextUpdateAt == null ? 'not recorded' : healthTimestamp(incident.nextUpdateAt)}</p>
          </li>)}
        </ul> : null}
        {overview.services.length ? <dl className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2" aria-label="Recorded service observations">
          {overview.services.map(service => <div key={service.serviceKey}>
            <dt className="font-semibold">{evidenceLabels[service.serviceKey] ?? service.serviceKey}</dt>
            <dd>{service.lastObservedAt == null ? 'No recorded observation' : `${evidenceStates[service.state] ?? 'Not checked yet'} · ${healthTimestamp(service.lastObservedAt)}`}</dd>
          </div>)}
        </dl> : null}
        {overview.forms.map(form => <article key={form.formId} className="rounded-lg border p-3">
          <h2 className="font-semibold">{form.formId} · {form.state.replaceAll('_', ' ')}</h2>
          <p>{form.lastLoad ? 'Definition check · ' + form.lastLoad.outcome + ' · ' + healthTimestamp(form.lastLoad.observedAt) : 'No definition observation'}</p>
          <p>{form.lastSave ? 'Durable submission recorded ' + healthTimestamp(form.lastSave.observedAt) : 'No durable submission evidence for this release and version.'}</p>
          <p>{form.meaning}</p>
          {form.lastLoad ? <p>Support reference · {form.lastLoad.supportReference}</p> : null}
        </article>)}
        {overview.unobserved.map(item => <p key={item}>{item} · No matching observation</p>)}
        <p>Routine technical diagnostic retention is {overview.retention.routineDays} days after verifying retention and incident holds. Automatic cleanup is disabled.</p>
      </div>
    </details>
  </section>;
}
