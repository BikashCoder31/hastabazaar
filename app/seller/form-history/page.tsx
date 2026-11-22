import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AnswerDetails } from '@/components/forms/answer-details';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import type { FormId } from '@/lib/forms/types';

export const dynamic = 'force-dynamic';

const historyKinds = {
  'shipping-request': { title: 'Shipping requests', formId: 'seller.shipping-request', subjectType: 'shipping_job',
    from: 'shipping_jobs record', sellerId: 'record.seller_id' },
  'console-request': { title: 'Shipping console requests', formId: 'shipping.console-request', subjectType: 'shipping_job',
    from: 'shipping_jobs record', sellerId: 'record.seller_id' },
  'shipping-action': { title: 'Shipping actions', formId: 'seller.shipping-action', subjectType: 'shipping_job_event',
    from: 'shipping_job_events record JOIN shipping_jobs job ON job.id=record.shipping_job_id', sellerId: 'job.seller_id' },
  'console-action': { title: 'Shipping console actions', formId: 'shipping.console-action-seller', subjectType: 'shipping_job_event',
    from: 'shipping_job_events record JOIN shipping_jobs job ON job.id=record.shipping_job_id', sellerId: 'job.seller_id' },
  'managed-supply': { title: 'Managed supply proposals', formId: 'seller.managed-supply-proposal', subjectType: 'managed_supply',
    from: 'managed_supply_records record', sellerId: 'record.seller_id' },
  'managed-transition': { title: 'Managed route requests', formId: 'seller.managed-transition-request', subjectType: 'seller_route_transition',
    from: 'seller_route_transition_applications record', sellerId: 'record.seller_id' },
  'payout-request': { title: 'Payout requests', formId: 'seller.payout-request', subjectType: 'payout_request',
    from: 'payout_requests record', sellerId: 'record.seller_id' },
  'review-reply': { title: 'Review replies', formId: 'seller.review-reply', subjectType: 'review_reply',
    from: `review_replies record JOIN product_reviews review ON review.id=record.review_id
      JOIN products product ON product.id=review.product_id`, sellerId: 'product.seller_id',
    extra: 'AND record.seller_id=product.seller_id' },
} as const satisfies Record<string, { title: string; formId: FormId; subjectType: string; from: string; sellerId: string; extra?: string }>;

type HistoryKind = keyof typeof historyKinds;
type Cursor = { createdAt: number; id: string };

function readCursor(at: string | undefined, id: string | undefined): Cursor | undefined {
  if (!at && !id) return undefined;
  const createdAt = Number(at);
  if (!at || !id || !/^\d+$/.test(at) || !Number.isSafeInteger(createdAt) || id.length > 191) notFound();
  return { createdAt, id };
}

export default async function SellerFormHistoryPage({ searchParams }: {
  searchParams?: Promise<{ kind?: string; id?: string; beforeAt?: string; beforeId?: string; afterAt?: string; afterId?: string }>;
} = {}) {
  const seller = await requireSellerPage('/seller/form-history');
  const query = await searchParams;
  const kind = query?.kind;
  if (!kind || !(kind in historyKinds)) notFound();
  const spec = historyKinds[kind as HistoryKind];
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const base = `/seller/form-history?kind=${kind}`;
  const from = `${spec.from} JOIN seller_profiles seller ON seller.id=${spec.sellerId}`;
  const extra = 'extra' in spec ? ` ${spec.extra}` : '';

  if (query?.id) {
    if (query.id.length > 191) notFound();
    const owned = await db.prepare(`SELECT 1 AS owned FROM ${from}
      WHERE record.id=? AND seller.id=? AND seller.user_id=? AND seller.status='approved' ${extra} LIMIT 1`)
      .bind(query.id, seller.sellerId, seller.userId).first<{ owned: number }>();
    if (!owned) notFound();
    const after = readCursor(query.afterAt, query.afterId);
    const { answers, nextCursor } = await listFormAnswersForSubjectPage(db, {
      subjectType: spec.subjectType, subjectId: query.id, formId: spec.formId, after,
    });
    if (!answers.length && !after) notFound();
    const allowed = await Promise.all(answers.map((answer) =>
      authorizeFormAnswerRead(db, { id: seller.userId, role: 'seller' }, answer)));
    if (allowed.some((value) => !value)) notFound();
    return <main className="space-y-5">
      <p><Link className="section-link text-[#A8232E] underline" href={base}>← {spec.title}</Link></p>
      <h1 className="section-title">{spec.title} answer history</h1>
      <p className="break-all text-sm text-muted-foreground">Record {query.id}</p>
      {answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
      {nextCursor ? <Link className="section-link text-[#A8232E] underline" href={
        `${base}&id=${encodeURIComponent(query.id)}&afterAt=${nextCursor.createdAt}&afterId=${encodeURIComponent(nextCursor.id)}`
      }>Next 50 answers</Link> : null}
    </main>;
  }

  const before = readCursor(query?.beforeAt, query?.beforeId);
  const rows = await db.prepare(`SELECT record.id, record.created_at AS createdAt FROM ${from}
    WHERE seller.id=? AND seller.user_id=? AND seller.status='approved' ${extra}
      AND EXISTS (SELECT 1 FROM form_answer_sets answer WHERE answer.subject_type=?
        AND answer.subject_id=record.id AND answer.form_id=?)
      AND (? IS NULL OR record.created_at<? OR (record.created_at=? AND record.id<?))
    ORDER BY record.created_at DESC,record.id DESC LIMIT 51`)
    .bind(seller.sellerId, seller.userId, spec.subjectType, spec.formId,
      before?.createdAt ?? null, before?.createdAt ?? 0, before?.createdAt ?? 0, before?.id ?? '')
    .all<{ id: string; createdAt: number }>();
  const records = rows.results.slice(0, 50);
  const last = records.at(-1);
  return <main className="space-y-5">
    <h1 className="section-title">{spec.title} answer history</h1>
    <p className="text-sm text-muted-foreground">Select a record to view the answers saved with that action.</p>
    {records.length ? <ul className="space-y-2">{records.map((record) => <li key={record.id}>
      <Link className="section-link text-[#A8232E] underline break-all" href={`${base}&id=${encodeURIComponent(record.id)}`}>{record.id}</Link>
    </li>)}</ul> : <p>No submitted answers yet.</p>}
    {rows.results.length > 50 && last ? <Link className="section-link text-[#A8232E] underline" href={
      `${base}&beforeAt=${last.createdAt}&beforeId=${encodeURIComponent(last.id)}`
    }>Next older records</Link> : null}
  </main>;
}
