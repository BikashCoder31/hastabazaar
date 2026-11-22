import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ChevronRight, LifeBuoy } from 'lucide-react';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getCustomerRefundWorkspace } from '@/lib/payments/refund-workspace';
import { listCustomerRequestIndex, readOwnedCustomerRequest } from '@/lib/returns/customer-aftercare-context';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
import { RefundDestinationForm } from '@/components/commerce/refund-destination-form';
import { CustomerRequestSteps, CustomerRequestView } from '@/components/commerce/customer-request-view';
import { aftercareBox, aftercareLink, aftercareMoney, customerCaseHref, customerRequestProgress,
  longAftercareDate, shortAftercareDate } from '@/components/commerce/customer-request-presentation';

export const dynamic = 'force-dynamic';

type RefundRow = Awaited<ReturnType<typeof getCustomerRefundWorkspace>>[number];

export default async function CustomerRefundsPage({ searchParams }: {
  searchParams?: Promise<{ case?: string; kind?: string }>;
} = {}) {
  const query = await searchParams;
  const caseId = typeof query?.case === 'string' && query.case.length <= 100 ? query.case : '';
  const kind = query?.kind === 'return' || query?.kind === 'complaint' ? query.kind : null;
  const actor = await requireCustomerPage(caseId && kind ? customerCaseHref(kind, caseId) : '/account/refunds');
  const db = requireDatabase(env as unknown as { DB?: D1Database });

  if (query?.case !== undefined) {
    const source = caseId && kind ? await readOwnedCustomerRequest(db, actor.userId, kind, caseId) : null;
    if (!source) return <section className={aftercareBox}>
      <h1 className="font-heading text-3xl font-semibold text-[#14213D]">Request unavailable</h1>
      <p className="mt-2 text-[#46536F]">Open a request from your Returns &amp; help list.</p>
      <Link className={aftercareLink} href="/account/refunds">Back to Returns &amp; help</Link>
    </section>;
    let relatedRefund: RefundRow | undefined;
    if (source.record.kind === 'return' && source.record.row.refundId) {
      const [rows, obligation] = await Promise.all([getCustomerRefundWorkspace(db, actor.userId),
        db.prepare("SELECT id FROM refund_obligations WHERE source_kind = 'return_refund' AND source_id = ? AND customer_id = ? LIMIT 1")
          .bind(source.record.row.refundId, actor.userId).first<{ id: string }>()]);
      relatedRefund = rows.find(row => row.id === obligation?.id);
    }
    return <section className="min-w-0 space-y-5">
      <nav aria-label="Request location" className="flex flex-wrap items-center gap-x-1.5 text-sm text-[#46536F]">
        <Link className="inline-flex min-h-11 items-center underline underline-offset-2" href="/account">Your account</Link>
        <ChevronRight className="size-4" aria-hidden="true"/>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-2" href="/account/refunds">Returns &amp; help</Link>
        <ChevronRight className="size-4" aria-hidden="true"/>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-2" href={`/orders/${encodeURIComponent(source.record.row.orderNumber)}`}>{source.record.row.orderNumber}</Link>
      </nav>
      <CustomerRequestView record={source.record} context={source.context} actorId={actor.userId}
        viewerScope={JSON.stringify([actor.userId, 'account'])} ownAccountView
        refundDestination={relatedRefund?.destination?.status === 'verified' ? relatedRefund.destination.label : undefined}
        refund={relatedRefund ? <RefundProgressCard row={relatedRefund} actorId={actor.userId}/> : undefined}/>
    </section>;
  }

  const [rows, requests] = await Promise.all([
    getCustomerRefundWorkspace(db, actor.userId),
    listCustomerRequestIndex(db, actor.userId),
  ]);
  const refundRows = new Map(rows.map(row => [row.id, row]));
  const requestCards = requests.map(request => {
    const refund = request.refundObligationId ? refundRows.get(request.refundObligationId) : undefined;
    const refundStatus = refund ? nativeRefundStatus(refund) : null;
    return { request, progress: customerRequestProgress({ ...request, refundStatus }), awaitingBank: refundStatus === 'payment_details_needed' };
  });
  const needReply = requestCards.filter(({ progress }) => progress.actor === 'you');
  const rest = requestCards.filter(({ progress }) => progress.actor !== 'you');
  const paired = new Set(needReply.flatMap(({ request }) => request.refundObligationId ? [request.refundObligationId] : []));
  const needRefundDetails = rows.filter(row => nativeRefundStatus(row) === 'payment_details_needed' && !paired.has(row.id));
  const unlisted = new Set(needRefundDetails.map(row => row.id));
  const otherRefunds = rows.filter(row => !unlisted.has(row.id));
  return <section className="min-w-0 space-y-7">
    <header className="space-y-2">
      <h1 className="font-heading text-4xl font-semibold text-[#14213D]">Returns &amp; help</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-[#46536F]">Follow the requests you’ve sent and the latest recorded refund updates.</p>
    </header>
    {needReply.length || needRefundDetails.length ? <section className="space-y-3" aria-label="Your turn">
      <h2 className="text-lg font-bold text-[#14213D]">Your turn</h2>
      {needReply.map(({ request, progress, awaitingBank }) => <RequestCard key={`${request.kind}:${request.id}`} request={request} progress={progress} awaitingBank={awaitingBank}/>)}
      {needRefundDetails.map(row => <RefundProgressCard key={row.id} row={row} actorId={actor.userId}/>)}
    </section> : null}
    <section className="space-y-3" aria-label="Your requests">
      <h2 className="text-lg font-bold text-[#14213D]">Your requests</h2>
      {rest.length ? rest.map(({ request, progress }) => <RequestCard key={`${request.kind}:${request.id}`} request={request} progress={progress}/>)
        : !needReply.length ? <div className={aftercareBox}>
          <p className="flex items-center gap-2 text-sm text-[#46536F]"><LifeBuoy className="size-5 shrink-0" aria-hidden="true"/>You have no requests yet. Open a recent order to get help with an item or delivery.</p>
          <Link className={aftercareLink} href="/account/orders">Go to My orders</Link>
        </div> : null}
    </section>
    {otherRefunds.length || !rows.length ? <section className="space-y-3" aria-label="Your refunds">
      <h2 className="text-lg font-bold text-[#14213D]">Your refunds</h2>
      {rows.length ? otherRefunds.map(row => <RefundProgressCard key={row.id} row={row} actorId={actor.userId}/>)
        : <p className={`${aftercareBox} text-sm text-[#46536F]`}>Finance has no approved refunds for your account yet. You can follow any open request above.</p>}
    </section> : null}
  </section>;
}

function RequestCard({ request, progress, awaitingBank = false }: {
  request: Awaited<ReturnType<typeof listCustomerRequestIndex>>[number];
  progress: ReturnType<typeof customerRequestProgress>;
  awaitingBank?: boolean;
}) {
  return <article className={`${aftercareBox} space-y-3`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h3 className="break-words font-semibold text-[#14213D]">{request.title}</h3>
        <p className="break-words text-sm text-[#46536F]">{request.orderNumber} · {request.referenceNumber} · Updated {shortAftercareDate(request.updatedAt)}</p></div>
      <CustomerActingChip actor={progress.actor} yourTurn/>
    </div>
    <p className="text-sm font-semibold text-[#14213D]">{progress.title}</p>
    <CustomerRequestSteps progress={progress} complaint={request.kind === 'complaint'}/>
    <Link className={aftercareLink} href={customerCaseHref(request.kind, request.id)}>{awaitingBank ? 'Add refund details' : progress.actor === 'you' ? 'Open and reply' : 'View request'}</Link>
  </article>;
}

function nativeRefundStatus(row: RefundRow) {
  return (row.currentProgress ?? row.paymentProgress)?.status ?? (row.state === 'completed' ? 'confirmed_settled' : row.state);
}

function RefundProgressCard({ row, actorId }: { row: RefundRow; actorId: string }) {
  const native = row.currentProgress ?? row.paymentProgress;
  const delay = row.paymentProgress?.delay;
  const canProvideDestination = row.cashPaisa > 0 && (row.state === 'open' || row.state === 'blocked');
  const display = customerRequestProgress({ kind: 'return', status: 'approved', refundStatus: nativeRefundStatus(row) });
  return <article id={`refund-${row.id}`} className={`${aftercareBox} scroll-mt-36 space-y-4`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="min-w-0 break-words text-base font-semibold text-[#14213D]">{row.orderNumber ?? 'Return of identified payer money'} · {native?.label ?? 'Refund update'}</h3>
      <CustomerActingChip actor={display.actor} yourTurn/>
    </div>
    {native ? <p className="text-sm leading-relaxed text-[#46536F]">{native.message}</p> : null}
    <CustomerRequestSteps progress={display}/>
    <dl className="grid gap-2 text-sm text-[#46536F]">
      <div className="flex flex-wrap justify-between gap-2"><dt>{row.currentProgress ? 'Original authorized cash' : 'Cash refund'}</dt><dd className="font-semibold text-[#14213D]">{aftercareMoney(row.cashPaisa)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt>Wallet credit in this refund</dt><dd className="font-semibold text-[#14213D]">{aftercareMoney(row.walletPaisa)}</dd></div>
      {row.alreadyRestoredWalletPaisa > 0 ? <div><dt className="sr-only">Restored wallet credit</dt><dd>Cancellation already restored {aftercareMoney(row.alreadyRestoredWalletPaisa)} in wallet credit.</dd></div> : null}
    </dl>
    {row.bankSatisfiedPaisa > 0 ? <p className="text-sm text-[#46536F]">Originally authorized cash: {aftercareMoney(row.originalCashPaisa)}. The bank already returned {aftercareMoney(row.bankSatisfiedPaisa)} directly to you. The cash refund above is the separate transfer handled by Finance.</p> : null}
    {row.state !== 'completed' && row.bindingDueAt !== null ? <p className="text-sm text-[#46536F]">Applicable original refund due date: {longAftercareDate(row.bindingDueAt)}</p> : null}
    {row.state !== 'completed' && row.initiationDueAt !== null ? <p className="text-sm text-[#46536F]">Original refund initiation target: {longAftercareDate(row.initiationDueAt)}</p> : null}
    {delay ? <p className="text-sm text-[#46536F]">{delay.reason} Next update by {longAftercareDate(delay.nextUpdateAt)}.</p> : null}
    {canProvideDestination ? <RefundDestinationForm row={row} actorId={actorId}/> : null}
    {row.events.length ? <section className="space-y-2 border-t border-[#E7DCCB] pt-3" aria-label="Payment updates">
      <h4 className="text-sm font-semibold text-[#14213D]">Payment updates</h4>
      <ol className="space-y-2 text-sm text-[#46536F]">{row.events.map(event => <li key={event.id} className="break-words">
        <time className="font-medium text-[#14213D]" dateTime={new Date(event.createdAt).toISOString()}>{longAftercareDate(event.createdAt)}</time> · {event.message}
      </li>)}</ol>
    </section> : null}
  </article>;
}
