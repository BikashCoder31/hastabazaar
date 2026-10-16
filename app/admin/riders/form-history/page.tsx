import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AnswerDetails } from '@/components/forms/answer-details';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import { historyKind, listRiderHistoryRecords, readHistoryCursor,
  riderHistoryKinds, riderHistoryOwner } from '@/lib/forms/rider-history';

export const dynamic = 'force-dynamic';

export default async function StaffRiderFormHistoryPage({ searchParams }: {
  searchParams?: Promise<{ kind?: string; id?: string; beforeAt?: string; beforeId?: string;
    afterAt?: string; afterId?: string }>;
} = {}) {
  const query = await searchParams;
  const kind = historyKind(query?.kind);
  if (!kind) notFound();
  const staff = await requireStaffPage('/admin/riders/form-history',
    kind === 'remittance' ? 'payout.prepare' : 'order.manage');
  if (staff.role !== 'super_admin') notFound();
  const spec = riderHistoryKinds[kind];
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const base = `/admin/riders/form-history?kind=${kind}`;
  let before;
  let after;
  try {
    before = readHistoryCursor(query?.beforeAt, query?.beforeId);
    after = readHistoryCursor(query?.afterAt, query?.afterId);
  } catch { notFound(); }

  if (query?.id) {
    if (!(await riderHistoryOwner(db, kind, query.id))) notFound();
    const { answers, nextCursor } = await listFormAnswersForSubjectPage(db, {
      subjectType: spec.subjectType, subjectId: query.id, formId: spec.formId, after,
    });
    if (!answers.length && !after) notFound();
    const allowed = await Promise.all(answers.map((answer) =>
      authorizeFormAnswerRead(db, { id: staff.id, role: staff.role }, answer)));
    if (allowed.some((value) => !value)) notFound();
    return <main className="space-y-5">
      <p><Link className="underline" href={base}>← {spec.title}</Link></p>
      <h1 className="text-2xl font-semibold">{spec.title} answer history</h1>
      <p className="break-all text-sm">Record {query.id}</p>
      {answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
      {nextCursor ? <Link className="underline" href={
        `${base}&id=${encodeURIComponent(query.id)}&afterAt=${nextCursor.createdAt}&afterId=${encodeURIComponent(nextCursor.id)}`
      }>Next 50 answers</Link> : null}
    </main>;
  }

  const { records, nextCursor } = await listRiderHistoryRecords(db, kind, null, before);
  return <main className="space-y-5">
    <p><Link className="underline" href="/admin/riders">← Rider operations</Link></p>
    <h1 className="text-2xl font-semibold">{spec.title} answer history</h1>
    {records.length ? <ul className="space-y-2">{records.map((record) => <li key={record.id}>
      <Link className="underline" href={`${base}&id=${encodeURIComponent(record.id)}`}>
        Record {record.id}
      </Link>
    </li>)}</ul> : <p>No saved answers for this kind.</p>}
    {nextCursor ? <Link className="underline" href={
      `${base}&beforeAt=${nextCursor.createdAt}&beforeId=${encodeURIComponent(nextCursor.id)}`
    }>Next older records</Link> : null}
  </main>;
}
