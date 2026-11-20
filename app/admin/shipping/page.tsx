import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';
import { ShippingConsole } from '@/components/shipping-console';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listShippingJobs } from '@/lib/db/repositories/operations';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import { readHistoryCursor } from '@/lib/forms/rider-history';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { renderParcelProblemQueue } from './parcel-problem-queue';
import { readProblemFilter } from './parcel-problems';

export const dynamic = 'force-dynamic';

type ShippingQuery = {
  kind?: string; problem?: string; page?: string; view?: string;
  historyEvent?: string; beforeAt?: string; beforeId?: string; afterAt?: string; afterId?: string;
};

export default async function AdminShippingPage({ searchParams }: {
  searchParams?: Promise<ShippingQuery>;
} = {}) {
  const staff = await requireStaffPage('/admin/shipping', 'order.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const query = await searchParams;
  const superAdmin = staff.role === 'super_admin';
  const showShippingRecords = query?.view === 'shipping-records';
  const showHistory = Boolean(query?.historyEvent || query?.beforeAt || query?.beforeId || query?.afterAt || query?.afterId);

  if (!showShippingRecords && !showHistory) {
    const [queue, history] = await Promise.all([
      renderParcelProblemQueue({ db, viewer: staff, superAdmin, kind: readProblemFilter(query?.kind), requestedPage: query?.page, selected: query?.problem }),
      renderShippingHistory({ db, staff, query }),
    ]);
    return <div className="space-y-4 text-[#14213D]">
      <AdminPageTitle><h1 className="section-title">Orders</h1></AdminPageTitle>
      {queue}
      <nav aria-label="Related parcel records" className="flex flex-wrap gap-x-4">
        <Link className="section-link inline-flex min-h-11 items-center" href="/admin/exceptions">Exception follow-up records</Link>
        <Link className="section-link inline-flex min-h-11 items-center" href="/admin/shipping?view=shipping-records">Shipping coordination and staff answers</Link>
      </nav>
      {history}
    </div>;
  }

  const [jobs, history] = await Promise.all([
    showShippingRecords ? listShippingJobs(db, undefined, superAdmin) : [],
    renderShippingHistory({ db, staff, query }),
  ]);
  return <div className="space-y-5">
    <Link className="section-link inline-flex min-h-11 items-center" href="/admin/shipping">Back to parcel problems</Link>
    <AdminPageTitle><h1 className="section-title">Shipping coordination</h1></AdminPageTitle>
    {showShippingRecords ? <ShippingConsole jobs={jobs} admin /> : null}
    {history}
  </div>;
}

async function renderShippingHistory({ db, staff, query }: {
  db: D1Database;
  staff: Awaited<ReturnType<typeof requireStaffPage>>;
  query?: ShippingQuery;
}) {
  let before;
  let after;
  try {
    before = readHistoryCursor(query?.beforeAt, query?.beforeId);
    after = readHistoryCursor(query?.afterAt, query?.afterId);
  } catch { notFound(); }
  let answers = null;
  if (query?.historyEvent) {
    if (query.historyEvent.length > 191) notFound();
    answers = await listFormAnswersForSubjectPage(db, {
      subjectType: 'shipping_job_event', subjectId: query.historyEvent,
      formId: 'shipping.console-action-staff', after,
    });
    if (!answers.answers.length && !after) notFound();
    if ((await Promise.all(answers.answers.map((answer) =>
      authorizeFormAnswerRead(db, { id: staff.id, role: staff.role }, answer))))
      .some((allowed) => !allowed)) notFound();
  }
  const rows = answers ? null : await db.prepare(`SELECT event.id,event.created_at AS createdAt
    FROM shipping_job_events event JOIN shipping_jobs job ON job.id=event.shipping_job_id
    WHERE event.actor_role IN ('admin','super_admin')
      AND EXISTS(SELECT 1 FROM form_answer_sets answer
        WHERE answer.form_id='shipping.console-action-staff'
          AND answer.subject_type='shipping_job_event' AND answer.subject_id=event.id)
      AND (? IS NULL OR event.created_at<? OR (event.created_at=? AND event.id<?))
    ORDER BY event.created_at DESC,event.id DESC LIMIT 51`)
    .bind(before?.createdAt ?? null, before?.createdAt ?? 0,
      before?.createdAt ?? 0, before?.id ?? '')
    .all<{ id: string; createdAt: number }>();
  const records = rows?.results.slice(0, 50) ?? [];
  const last = records.at(-1);
  return (
      <details className="rounded-2xl border border-[#E4DACA] bg-card" open={showHistoryDetails(query) || undefined}>
        <summary className="min-h-11 cursor-pointer px-5 py-3 font-semibold">Saved staff shipping answers</summary>
        <section className="space-y-3 p-5 pt-0" aria-label="Saved staff shipping answers">
        {answers ? <>
          <Link className="inline-flex min-h-11 items-center underline" href="/admin/shipping?view=shipping-records">All staff shipping actions</Link>
          <p className="break-all text-sm">Event {query?.historyEvent}</p>
          {answers.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
          {answers.nextCursor ? <Link className="inline-flex min-h-11 items-center underline" href={
            `/admin/shipping?historyEvent=${encodeURIComponent(query!.historyEvent!)}&afterAt=${answers.nextCursor.createdAt}&afterId=${encodeURIComponent(answers.nextCursor.id)}`
          }>Next 50 answers</Link> : null}
        </> : <>
          {records.length ? <ul className="space-y-2">{records.map((record) => <li key={record.id}>
            <Link className="inline-flex min-h-11 items-center break-all underline" href={`/admin/shipping?historyEvent=${encodeURIComponent(record.id)}`}>
              Event {record.id}
            </Link>
          </li>)}</ul> : <p>No saved staff shipping answers.</p>}
          {rows && rows.results.length > 50 && last ? <Link className="inline-flex min-h-11 items-center underline" href={
            `/admin/shipping?beforeAt=${last.createdAt}&beforeId=${encodeURIComponent(last.id)}`
          }>Next older records</Link> : null}
        </>}
        </section>
      </details>
  );
}

function showHistoryDetails(query: ShippingQuery | undefined) {
  return Boolean(query?.view === 'shipping-records' || query?.historyEvent || query?.beforeAt || query?.afterAt);
}
