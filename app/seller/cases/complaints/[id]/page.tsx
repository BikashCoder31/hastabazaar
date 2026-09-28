import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SellerCaseResponseForm } from '@/components/seller/case-response-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerComplaintDetail } from '@/lib/db/repositories/complaints';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';

export const dynamic = 'force-dynamic';
export default async function SellerComplaintCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ historyAt?: string; historyId?: string }>;
}) {
  const { id } = await params;
  const seller = await requireSellerPage(`/seller/cases/complaints/${id}`);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const item = await getSellerComplaintDetail(
    db,
    id,
    seller.sellerId,
  );
  if (!item) notFound();
  const query = await searchParams;
  let after: { createdAt: number; id: string } | undefined;
  if (query?.historyAt !== undefined || query?.historyId !== undefined) {
    const at = typeof query?.historyAt === 'string' && /^\d{1,16}$/.test(query.historyAt)
      ? Number(query.historyAt) : NaN;
    if (!Number.isSafeInteger(at) || typeof query?.historyId !== 'string' ||
        !query.historyId.trim() || query.historyId.length > 191) notFound();
    after = { createdAt: at, id: query.historyId };
  }
  const history = await listFormAnswersForSubjectPage(db, {
    subjectType: 'complaint', subjectId: item.id,
    formId: 'seller.case-complaint-response', after,
  });
  const allowed = await Promise.all(history.answers.map((answer) =>
    authorizeFormAnswerRead(db, { id: seller.userId, role: 'seller' }, answer)));
  const answers = history.answers.filter((_, index) => allowed[index]);
  return (
    <div>
      <Link
        href="/seller/cases"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to cases
      </Link>
      <div className="mt-6 flex flex-wrap justify-between gap-4">
        <div>
          <p className="eyebrow">{item.referenceNumber}</p>
          <h1 className="mt-2 font-heading text-4xl">{item.subject}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {item.productName || 'Shop-related case'} · {item.category}
          </p>
        </div>
        <span className="h-fit rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold capitalize">
          {item.status.replaceAll('_', ' ')}
        </span>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-heading text-2xl">Complaint details</h2>
          <p className="mt-4 whitespace-pre-wrap text-base leading-7">
            {item.detail}
          </p>
          <p className="mt-5 text-sm text-muted-foreground">
            Customer contact details and exact address are hidden from this
            view.
          </p>
        </section>
        <aside className="rounded-2xl border bg-card p-6">
          <h2 className="font-heading text-2xl">Your response</h2>
          <div className="mt-5">
            {item.sellerResponse ? (
              <p className="mb-4 whitespace-pre-wrap rounded-xl bg-secondary/60 p-4 text-base leading-7">
                <strong className="block">Your recorded response</strong>
                {item.sellerResponse}
              </p>
            ) : null}
            <SellerCaseResponseForm
              kind="complaint"
              id={item.id}
              disabled={
                Boolean(item.sellerResponse) ||
                ['resolved', 'closed'].includes(item.status)
              }
            />
          </div>
        </aside>
      </div>
      {answers.length || history.nextCursor ? (
        <section className="mt-8 space-y-4" aria-label="Your response answer history">
          <h2 className="font-heading text-2xl">Previous response answers</h2>
          {answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
          {!answers.length ? <p className="text-sm text-muted-foreground">No authorized answers on this page.</p> : null}
          {history.nextCursor ? (
            <Link className="section-link" href={
              `/seller/cases/complaints/${encodeURIComponent(item.id)}?historyAt=${history.nextCursor.createdAt}&historyId=${encodeURIComponent(history.nextCursor.id)}`
            }>Next 50 answers</Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
