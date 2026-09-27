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
export const dynamic = 'force-dynamic';
export default async function AdminShippingPage({ searchParams }: {
  searchParams?: Promise<{ historyEvent?: string; beforeAt?: string; beforeId?: string;
    afterAt?: string; afterId?: string }>;
} = {}) {
  const staff = await requireStaffPage('/admin/shipping', 'order.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const query = await searchParams;
  let before;
  let after;
  try {
    before = readHistoryCursor(query?.beforeAt, query?.beforeId);
    after = readHistoryCursor(query?.afterAt, query?.afterId);
  } catch { notFound(); }
  const jobs = await listShippingJobs(db);
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
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Saved staff shipping answers</h2>
        {answers ? <>
          <Link className="underline" href="/admin/shipping">← All staff shipping actions</Link>
          <p className="break-all text-sm">Event {query?.historyEvent}</p>
          {answers.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
          {answers.nextCursor ? <Link className="underline" href={
            `/admin/shipping?historyEvent=${encodeURIComponent(query!.historyEvent!)}&afterAt=${answers.nextCursor.createdAt}&afterId=${encodeURIComponent(answers.nextCursor.id)}`
          }>Next 50 answers</Link> : null}
        </> : <>
          {records.length ? <ul className="space-y-2">{records.map((record) => <li key={record.id}>
            <Link className="underline" href={`/admin/shipping?historyEvent=${encodeURIComponent(record.id)}`}>
              Event {record.id}
            </Link>
          </li>)}</ul> : <p>No saved staff shipping answers.</p>}
          {rows && rows.results.length > 50 && last ? <Link className="underline" href={
            `/admin/shipping?beforeAt=${last.createdAt}&beforeId=${encodeURIComponent(last.id)}`
          }>Next older records</Link> : null}
        </>}
      </section>
    </div>
  );
}
