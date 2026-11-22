import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { availableStaffHistoryKinds, listStaffFormHistory, readStaffFormHistoryAnswer } from '@/lib/forms/staff-history';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import {ReviewBackLink} from '@/components/admin/review-back-link';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => typeof value === 'string' ? value : undefined;
const historyHref = (kind: string, id?: string, cursor?: string, answer?: string,returnTo?:string) => {
  const params = new URLSearchParams({ kind });
  if (id) params.set('id', id);
  if (cursor) params.set('cursor', cursor);
  if (answer) params.set('answer', answer);
  const destination=`/admin/staff-form-history?${params.toString()}`;
  return returnTo?withAdminReturnTo(destination,returnTo):destination;
};
const valueText = (value: unknown) => Array.isArray(value) ? value.join(', ') :
  typeof value === 'boolean' ? (value ? 'Yes' : 'No') :
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export default async function StaffFormHistoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const staff = await requireStaffPage('/admin/staff-form-history');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const kinds = await availableStaffHistoryKinds(database, staff);
  const params = await searchParams;
  const returnTo=safeAdminReturnTo(one(params.returnTo),'/admin');
  const kind = one(params.kind);
  const id = one(params.id);
  const cursor = one(params.cursor);
  const answerId = one(params.answer);
  if ((params.kind !== undefined && !kind) || (params.id !== undefined && !id) ||
      (params.cursor !== undefined && !cursor) || (params.answer !== undefined && !answerId)) notFound();
  const selected = kind ? kinds.find((item) => item.kind === kind) : null;
  if (kind && !selected) notFound();
  if (answerId && (!kind || !id)) notFound();
  const archivedDelivery = selected?.kind.startsWith('rider-') ?? false;
  const visibleKinds = kinds.filter(item => item.kind.startsWith('rider-') === archivedDelivery);
  let history: Awaited<ReturnType<typeof listStaffFormHistory>> | null = null;
  let answer: Awaited<ReturnType<typeof readStaffFormHistoryAnswer>> = null;
  try {
    if (selected) history = await listStaffFormHistory(database, staff, selected.kind, { subjectId: id, cursor });
    if (selected && id && answerId)
      answer = await readStaffFormHistoryAnswer(database, staff, selected.kind, id, answerId);
  } catch { notFound(); }
  if (answerId && !answer) notFound();

  return <main className="min-w-0 space-y-6">
    <ReviewBackLink returnTo={returnTo} actorId={staff.id}/>
    <header>
      <AdminPageTitle><h1 className="section-title">{archivedDelivery ? 'Archived own-delivery form history' : 'Staff form history'}</h1></AdminPageTitle>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
        Context submitted with recorded staff actions. Current record access is checked again whenever an answer is opened.
      </p>
    </header>
    <nav aria-label="Staff history kinds" className="flex flex-wrap gap-2">
      {visibleKinds.map((item) => <Link key={item.kind} href={historyHref(item.kind,undefined,undefined,undefined,returnTo)}
        className="section-link underline">
        {item.label}
      </Link>)}
    </nav>
    {!visibleKinds.length ? <p className="rounded-xl border p-4 text-sm">No staff answer history is available in this view.</p> : null}
    {selected ? <section className="space-y-3 rounded-xl border p-4 sm:p-6">
      <h2 className="font-heading text-xl">{selected.label}</h2>
      {id ? <p className="break-all text-sm text-muted-foreground">Record: {id}</p> : null}
      <p className="text-xs text-muted-foreground">Up to 50 recorded entries per page. Open an entry to read its saved field labels and values.</p>
      {history?.items.length ? <ul className="divide-y">
        {history.items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <span className="min-w-0 break-all">{item.subjectType}: {item.subjectId}<span className="block text-xs text-muted-foreground">
            {new Date(item.createdAt).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' })} · Actor {item.actorId ?? 'Unknown'}
          </span></span>
          <Link className="section-link underline"
            href={historyHref(selected.kind, item.subjectId, cursor, item.id,returnTo)}>Open saved context</Link>
        </li>)}
      </ul> : <p className="text-sm text-muted-foreground">No authorized entries on this page.</p>}
      {history?.nextCursor ? <Link className="section-link underline"
        href={historyHref(selected.kind, id, history.nextCursor,undefined,returnTo)}>Older entries</Link> : null}
    </section> : <p className="text-sm text-muted-foreground">Choose a history kind to browse records you can currently read.</p>}
    {answer ? <section className="space-y-4 rounded-xl border p-4 sm:p-6" aria-label="Saved form answers">
      {selected?<Link className="section-link underline" href={historyHref(selected.kind,id,cursor,undefined,returnTo)}>Back to recorded entries</Link>:null}
      <h2 className="font-heading text-xl">Saved context</h2>
      <p className="break-all text-xs text-muted-foreground">Record {answer.subjectId} · Submission {answer.requestId}</p>
      {answer.answers.answers.length ? <dl className="space-y-3">
        {answer.answers.answers.map((entry) => <div key={entry.fieldId} className="border-t pt-3">
          <dt className="font-medium">{entry.label}{answer.historicalFieldIds.includes(entry.fieldId)
            ? <span className="ml-2 text-xs text-muted-foreground">Historical field</span> : null}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{valueText(entry.value)}</dd>
        </div>)}
      </dl> : <p className="text-sm text-muted-foreground">No additional context was entered for this action.</p>}
    </section> : null}
  </main>;
}
