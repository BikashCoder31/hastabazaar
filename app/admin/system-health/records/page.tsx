import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { AdminPageTitle } from '@/components/admin/page-help';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { formHealthRuntimeScope } from '@/lib/operations/form-health';
import { searchSystemRecords } from '@/lib/operations/system-records';
import { safeAdminReturnTo, withAdminReturnTo } from '@/lib/admin/return-context';
import { healthTimestamp } from '../check-model';

export const dynamic = 'force-dynamic';

const fields = [
  { name: 'reference', label: 'Reference' },
  { name: 'type', label: 'Record family' },
  { name: 'actor', label: 'Recorded actor ID' },
  { name: 'status', label: 'Status' },
  { name: 'action', label: 'Action' },
  { name: 'from', label: 'From', date: true },
  { name: 'to', label: 'To', date: true },
];
const link = 'inline-flex min-h-11 items-center font-semibold underline underline-offset-4';

export default async function RecordsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, params] = await Promise.all([requireStaffPage('/admin/system-health/records', 'system.health.view'), searchParams]);
  const scope = formHealthRuntimeScope(env as unknown as Record<string, string | undefined>);
  const filters = Object.fromEntries(fields.map(({ name }) => [name, typeof params[name] === 'string' ? params[name] : undefined]));
  const returnTo = safeAdminReturnTo(params.returnTo, '/admin/system-health');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined) query.set(key, value);
  const currentHref = withAdminReturnTo('/admin/system-health/records?' + query.toString(), returnTo);

  let result: Awaited<ReturnType<typeof searchSystemRecords>> | null = null;
  try {
    result = await searchSystemRecords(requireDatabase(env), actor.id, { ...filters, environment: scope.environment });
  } catch { /* The error view contains no protected record metadata. */ }

  return <section className="max-w-[69.75rem] min-w-0 space-y-5 wrap-anywhere">
    <header>
      <div className="flex flex-wrap gap-x-4 text-sm">
        <Link className={link} href={returnTo}>{returnTo === '/admin/system-health' ? 'System health & backups' : 'Back to results'}</Link>
        {returnTo !== '/admin/system-health' ? <Link className={link} href={withAdminReturnTo('/admin/system-health', returnTo)}>System health &amp; backups</Link> : null}
      </div>
      <AdminPageTitle><h1 className="font-heading text-[28px] tracking-tight">Records &amp; audit</h1></AdminPageTitle>
      <p className="mt-2 text-sm text-muted-foreground">Environment · {scope.environment} · Release · {scope.releaseId ?? 'Not recorded'}</p>
    </header>
    <form data-form-id="staff.system-records-filter" aria-label="Record filters" className="grid min-w-0 gap-4 rounded-[15px] border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3" method="get">
      <input type="hidden" name="returnTo" value={returnTo} />
      {fields.map(({ name, label, date }) => <label key={name} className="grid min-w-0 gap-1 text-sm font-semibold">
        {label}
        <input className="block min-h-11 w-full min-w-0 rounded-lg border px-3 py-2 font-normal" name={name} maxLength={200} defaultValue={filters[name]} type={date ? 'date' : 'text'} />
      </label>)}
      <p className="self-end text-sm text-muted-foreground sm:col-span-2">Families include form, file, incident, delivery, review and action. Delivery and full action history require separate access.</p>
      <button className="admin-button admin-primary w-fit" type="submit">Find scoped records</button>
    </form>
    {result ? <section className="rounded-[15px] border bg-card" aria-labelledby="scoped-records-heading">
      <h2 id="scoped-records-heading" className="px-[18px] py-3.5 font-bold">Scoped records</h2>
      {result.records.length ? <ol>{result.records.map(record => <li key={record.type + record.reference} className="space-y-1 border-t px-[18px] py-4 text-sm">
        <h3 className="font-semibold">{record.reference} · {record.record}</h3>
        <p>{record.action} · {record.status} · <time dateTime={new Date(record.createdAt).toISOString()}>{healthTimestamp(record.createdAt)}</time></p>
        {record.actorId ? <p>Recorded actor · {record.actorId}</p> : null}
        {record.changes?.map(change => <p key={change.field}>{change.field} · {change.before ?? 'Not recorded'} → {change.after ?? 'Not recorded'}</p>)}
        {record.href ? <Link className={`${link} section-link`} href={withAdminReturnTo(record.href, currentHref)}>Open authorized source</Link> : null}
      </li>)}</ol> : <p className="border-t px-[18px] py-4 text-sm">No authorized records appear in this source window.</p>}
      <details className="border-t px-[18px] text-sm">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">Search coverage and retention</summary>
        <div className="space-y-2 pb-4 text-muted-foreground"><p>{result.coverage}</p><p>{result.retention}</p></div>
      </details>
    </section> : <p role="alert" className="rounded-xl border bg-card p-4">These records could not be read. Review the filters and your current source access.</p>}
    <Link className={`${link} section-link text-sm`} href={withAdminReturnTo('/admin/activity', currentHref)}>Open protected business action history</Link>
  </section>;
}
