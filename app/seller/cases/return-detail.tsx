import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ImageIcon, Paperclip } from 'lucide-react';
import { notFound } from 'next/navigation';
import { AftercareFollowupSummary } from '@/components/commerce/aftercare-followup-summary';
import { OrderOfferDetails } from '@/components/commerce/order-offer-details';
import { ReturnPhysicalSummary } from '@/components/commerce/return-physical-summary';
import { AnswerDetails } from '@/components/forms/answer-details';
import { SellerCaseResponseForm } from '@/components/seller/case-response-form';
import { StepLine, type StepLineStep } from '@/components/ui/step-line';
import { WhoseTurn } from '@/components/ui/whose-turn';
import type { SellerUser } from '@/lib/auth/seller';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { getSellerReturnDetail, type ReturnCaseRow } from '@/lib/db/repositories/returns';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import { currentProductMediaOrder, currentProductMediaSql } from '@/lib/products/publication-media';
import { sellerDate } from '@/lib/seller/presentation';
import { sellerTaskTimestamp } from '@/lib/seller/task-presentation';

export function returnTurn(item: Pick<ReturnCaseRow, 'status' | 'sellerResponse'>, waitingFor?: string | null) {
  if (item.status === 'rejected' || item.status === 'resolved') return 'done';
  if (item.status === 'requested' && !item.sellerResponse || waitingFor === 'seller') return 'your-turn';
  return 'with-hastabazaar';
}

const recommendationLabels: Record<string, string> = {
  accept: 'Accept the return',
  contest: 'Disagree',
  request_information: 'Ask a question',
};

function Photo({ label, url, alt }: { label: string; url?: string; alt: string }) {
  return <figure className="relative flex min-h-36 min-w-0 items-center justify-center rounded-xl border bg-card p-3 pt-10 md:min-h-48">
    <figcaption className="absolute top-2 left-2 rounded-full bg-[#14213D] px-2 py-1 text-xs font-semibold leading-tight text-white">{label}</figcaption>
    {url ? <a href={url} target="_blank" rel="noreferrer" className="flex min-h-11 min-w-11 items-center justify-center">
      <Image data-media-mode="contain" src={url} alt={alt} width={240} height={150} unoptimized className="max-h-40 w-full object-contain" />
    </a> : <p className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground"><ImageIcon className="size-5" aria-hidden="true" />No photo available</p>}
  </figure>;
}

type HistoryQuery = { historyAt?: string; historyId?: string };

export async function SellerReturnDetail({ db, seller, id, query, embedded = false }: {
  db: D1Database;
  seller: SellerUser;
  id: string;
  query?: HistoryQuery;
  embedded?: boolean;
}) {
  const item = await getSellerReturnDetail(db, id, seller.sellerId);
  if (!item) notFound();

  let after: { createdAt: number; id: string } | undefined;
  if (query?.historyAt !== undefined || query?.historyId !== undefined) {
    const at = typeof query?.historyAt === 'string' && /^\d{1,16}$/.test(query.historyAt) ? Number(query.historyAt) : NaN;
    if (!Number.isSafeInteger(at) || typeof query?.historyId !== 'string' ||
        !query.historyId.trim() || query.historyId.length > 191) notFound();
    after = { createdAt: at, id: query.historyId };
  }
  const [history, listing] = await Promise.all([
    listFormAnswersForSubjectPage(db, { subjectType: 'return_request', subjectId: id, formId: 'seller.case-return-response', after }),
    db.prepare(`SELECT r.delivered_at_snapshot AS deliveredAt,
      h.clarification_due_at AS replyBy,
      (SELECT m.id FROM product_media m JOIN products p ON p.id=m.product_id WHERE p.id=i.product_id AND p.seller_id=i.seller_id
        AND m.mime_type LIKE 'image/%' AND ${currentProductMediaSql('m')}
        ORDER BY ${currentProductMediaOrder('m')},m.id LIMIT 1) AS mediaId
      FROM return_requests r JOIN order_items i ON i.id=r.order_item_id LEFT JOIN return_handling h ON h.case_id=r.id
      WHERE r.id=? AND i.seller_id=?`)
      .bind(id, seller.sellerId).first<{ deliveredAt: number | null; replyBy: number | null; mediaId: string | null }>(),
  ]);
  const allowed = await Promise.all(history.answers.map(answer =>
    authorizeFormAnswerRead(db, { id: seller.userId, role: 'seller' }, answer)));
  const answers = history.answers.filter((_, index) => allowed[index]);

  const turn = returnTurn(item, item.followup?.waitingFor);
  const canReply = !item.sellerResponse && item.status === 'requested';
  const done = turn === 'done';
  const listingMediaId = item.offerSnapshot?.mediaId ?? listing?.mediaId;
  const images = item.evidence.filter(file => file.uploadedByType === 'customer' && ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType));
  const steps: StepLineStep[] = [
    { id: 'request', label: 'Customer asked', state: 'complete', detail: sellerDate(item.requestedAt) },
    { id: 'reply', label: 'You reply', state: turn === 'your-turn' ? 'current' : item.sellerResponse || done ? 'complete' : 'upcoming', detail: turn === 'your-turn' && listing?.replyBy ? sellerTaskTimestamp(listing.replyBy) : undefined },
    { id: 'decision', label: 'Hastabazaar decides', state: done ? 'complete' : turn === 'with-hastabazaar' ? 'current' : 'upcoming' },
    { id: 'result', label: 'Result', state: done ? 'current' : 'upcoming', detail: done ? item.status.replaceAll('_', ' ') : 'You’re notified' },
  ];

  return <article id="return-details" tabIndex={-1} aria-labelledby="seller-return-title" className="min-w-0 scroll-mt-28 space-y-5 text-[#14213D]">
    {embedded ? null : <Link href="/seller/cases" className="section-link min-h-11"><ArrowLeft className="size-4" />Back to cases</Link>}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="break-words font-mono text-xs text-muted-foreground">{item.referenceNumber} · {item.productName}</p>
        <h2 id="seller-return-title" className="mt-1 break-words font-heading text-2xl capitalize md:text-3xl">{item.reason.replaceAll('_', ' ')}</h2>
        <p className="mt-1 break-words text-sm text-muted-foreground">Order {item.orderNumber} · {item.quantity} {item.quantity === 1 ? 'item' : 'items'}
          {listing?.deliveredAt ? ` · Delivered ${sellerDate(listing.deliveredAt)}` : ''} · Asked {sellerDate(item.requestedAt)}
        </p>
      </div>
      <WhoseTurn status={turn} label={done ? 'Closed' : undefined} />
    </div>
    <StepLine steps={steps} label="Return progress" className="grid-cols-2 lg:grid-cols-4" />
    <div className="grid grid-cols-2 items-stretch gap-2 md:gap-3">
      <Photo label={item.offerSnapshot?.mediaId ? 'Your listing photo' : 'Current listing photo'}
        url={listingMediaId ? `/api/product-media/${encodeURIComponent(listingMediaId)}` : undefined}
        alt={`Listing photo of ${item.productName}`} />
      <Photo label="Customer’s photo" url={images[0] ? `/api/return-evidence/${encodeURIComponent(images[0].id)}` : undefined}
        alt={`Customer’s return photo of ${item.productName}`} />
    </div>
    <section className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground">The customer wrote</h3>
      <blockquote className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">“{item.detail}”</blockquote>
    </section>
    <section className="space-y-4 rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-xl">{item.sellerResponse ? 'What you sent' : 'Your reply'}</h3>
        {turn === 'your-turn' && listing?.replyBy ? <WhoseTurn status="your-turn" label={`Reply by ${sellerTaskTimestamp(listing.replyBy)}`} /> : null}
      </div>
      {item.sellerResponse ? <div className="rounded-xl bg-[#F1EEE8] p-4 text-sm">
        {item.sellerRecommendation ? <p className="mb-1 font-semibold">{recommendationLabels[item.sellerRecommendation] ?? item.sellerRecommendation}</p> : null}
        <p className="whitespace-pre-wrap break-words">{item.sellerResponse}</p>
      </div> : null}
      {canReply ? <SellerCaseResponseForm key={id} kind="return" id={id} disabled={false} /> : null}
      {!done && !canReply && turn === 'with-hastabazaar' ? <p className="rounded-xl bg-[#E3E9F4] p-4 text-sm">
        <strong>With Hastabazaar now.</strong> {item.currentPublicMessage ?? 'We’ll notify you when there’s a decision.'}
      </p> : null}
      {turn === 'your-turn' && !canReply ? <p className="text-sm">Hastabazaar asked for more information. <Link href="/seller/requests" className="section-link min-h-11">Open Requests &amp; help</Link></p> : null}
      {done ? <div className="rounded-xl bg-[#DFECE4] p-4 text-sm"><p>No further response is requested.</p>{item.resolutionOutcome || item.currentPublicMessage ? <p>{item.currentPublicMessage ?? item.resolutionOutcome}</p> : null}</div> : null}
    </section>
    <details className="rounded-xl border bg-card px-4">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Case details and evidence</summary>
      <div className="space-y-3 pb-4 text-sm">
        <OrderOfferDetails offer={item.offerSnapshot} />
        <dl className="space-y-2"><div><dt className="font-semibold">Requested resolution</dt><dd>{item.requestedResolution}</dd></div>
          <div><dt className="font-semibold">Eligibility</dt><dd className="capitalize">{item.eligibilityDecision.replaceAll('_', ' ')}</dd><dd>{item.eligibilityReasonEn}</dd></div>
        </dl>
        <ReturnPhysicalSummary value={item.physical} />
        <AftercareFollowupSummary value={item.followup} audience="seller" />
        {item.evidence.length ? <ul className="divide-y">{item.evidence.map(file => <li key={file.id}>
          <a className="section-link min-h-11 break-all" href={`/api/return-evidence/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">
            <Paperclip className="size-4 shrink-0" aria-hidden="true" />{file.originalName}
          </a>
        </li>)}</ul> : <p className="text-muted-foreground">No evidence file was supplied.</p>}
      </div>
    </details>
    {answers.length || history.nextCursor ? <section className="space-y-3" aria-label="Your response answer history">
      <h3 className="font-heading text-xl">Previous response answers</h3>
      {answers.map(answer => <AnswerDetails key={answer.id} answer={answer} />)}
      {!answers.length ? <p className="text-sm text-muted-foreground">No authorized answers on this page.</p> : null}
      {history.nextCursor ? <Link className="section-link min-h-11"
        href={`/seller/cases/returns/${encodeURIComponent(item.id)}?historyAt=${history.nextCursor.createdAt}&historyId=${encodeURIComponent(history.nextCursor.id)}`}>
        Next 50 answers
      </Link> : null}
    </section> : null}
  </article>;
}
