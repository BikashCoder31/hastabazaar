import {AftercareFollowupSummary} from '@/components/commerce/aftercare-followup-summary';
import {ReturnPhysicalSummary} from '@/components/commerce/return-physical-summary';
import {OrderOfferDetails} from '@/components/commerce/order-offer-details';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { SellerCaseResponseForm } from '@/components/seller/case-response-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerReturnDetail } from '@/lib/db/repositories/returns';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';

export const dynamic = 'force-dynamic';
export default async function SellerReturnCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ historyAt?: string; historyId?: string }>;
}) {
  const { id } = await params;
  const seller = await requireSellerPage(`/seller/cases/returns/${id}`);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const item = await getSellerReturnDetail(
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
    subjectType: 'return_request', subjectId: item.id,
    formId: 'seller.case-return-response', after,
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
          <h1 className="mt-2 font-heading text-4xl">{item.productName}</h1><OrderOfferDetails offer={item.offerSnapshot}/><ReturnPhysicalSummary value={item.physical}/><AftercareFollowupSummary value={item.followup} audience="seller"/>
          <p className="mt-2 text-sm text-muted-foreground">
            Order {item.orderNumber} · {item.quantity} item(s)
          </p>
        </div>
        <Status value={item.status} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Customer request</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Reason">{item.reason.replaceAll('_', ' ')}</Detail>
              <Detail label="Requested resolution">
                {item.requestedResolution}
              </Detail>
              <Detail label="Eligibility">{item.eligibilityDecision}</Detail>
              <Detail label="Policy result">{item.eligibilityReasonEn}</Detail>
            </dl>
            <p className="mt-5 whitespace-pre-wrap rounded-xl bg-muted/35 p-4 text-sm leading-6">
              {item.detail}
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="flex items-center gap-2 font-heading text-2xl">
              <Paperclip className="size-5 text-primary" />
              Evidence
            </h2>
            {item.evidence.length ? (
              <ul className="mt-4 space-y-2">
                {item.evidence.map((file) => (
                  <li key={file.id}>
                    <a
                      className="text-sm font-semibold text-primary hover:underline"
                      href={`/api/return-evidence/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.originalName} · {Math.ceil(file.sizeBytes / 1024)}{' '}
                      KB
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No evidence file was supplied. This alone does not decide the
                claim.
              </p>
            )}
          </section>
        </div>
        <aside className="rounded-2xl border bg-card p-6">
          <h2 className="font-heading text-2xl">Your response</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Share only facts relevant to the item and fulfilment. Hastabazaar
            makes the final decision.
          </p>
          <div className="mt-5">
            {item.sellerResponse ? (
              <p className="mb-4 whitespace-pre-wrap rounded-xl bg-secondary/60 p-4 text-base leading-7">
                <strong className="block">Your recorded response</strong>
                {item.sellerResponse}
              </p>
            ) : null}
            <SellerCaseResponseForm
              kind="return"
              id={item.id}
              disabled={
                Boolean(item.sellerResponse) || item.status !== 'requested'
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
              `/seller/cases/returns/${encodeURIComponent(item.id)}?historyAt=${history.nextCursor.createdAt}&historyId=${encodeURIComponent(history.nextCursor.id)}`
            }>Next 50 answers</Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className="h-fit rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold capitalize">
      {value.replaceAll('_', ' ')}
    </span>
  );
}
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 capitalize">{children}</dd>
    </div>
  );
}
