import Link from 'next/link';
import Image from 'next/image';
import { useId, type ReactNode } from 'react';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
import type { CustomerAftercareContext } from '@/lib/returns/customer-aftercare-context';
import { CustomerRequestReply } from './customer-request-reply';
import { AftercareFollowupSummary } from './aftercare-followup-summary';
import { ReturnPhysicalSummary } from './return-physical-summary';
import { OrderOfferDetails } from './order-offer-details';
import { aftercareBox, aftercareLink, aftercareMoney, customerRequestReason, customerRequestTimeline,
  longAftercareDate, requestProgressForRecord, shortAftercareDate, type CustomerRequestProgress, type CustomerRequestRecord } from './customer-request-presentation';

const progressLabels = ['Sent', 'Seller replies', 'Decision', 'Item collected', 'Refund or replacement'] as const;
const complaintLabels = ['Sent', 'Response', 'Decision', 'Action', 'Closed'] as const;

export function CustomerRequestSteps({ progress, complaint = false }: { progress: CustomerRequestProgress; complaint?: boolean }) {
  const labels = complaint ? complaintLabels : progressLabels;
  return <ol className="grid min-w-0 grid-cols-5 gap-1.5 sm:gap-2" aria-label="Request progress">
    {labels.map((label, index) => {
      const active = progress.step === index;
      return <li key={label} aria-current={active ? 'step' : undefined}
        className={`min-w-0 text-xs leading-tight ${active ? 'font-semibold text-[#14213D]' : 'text-[#65584A]'}`}>
        <span aria-hidden="true" className={`mb-2 block h-1.5 rounded-full ${index < progress.step || (active && progress.finished) ? 'bg-[#246346]'
          : active ? progress.actor === 'you' ? 'bg-[#A8232E]' : 'bg-[#14213D]' : 'bg-[#E2D5BE]'}`}/>
        <span className={active ? 'block break-words' : 'sr-only sm:not-sr-only sm:block sm:break-words'}>{label}</span>
      </li>;
    })}
  </ol>;
}

const avatarStyle = { shopper: 'bg-[#F1E4C5] text-[#704D15]', seller: 'bg-[#DDECE3] text-[#205D42]', staff: 'bg-[#14213D] text-white' };

export function CustomerRequestView({ record, context, actorId, viewerScope, ownAccountView = false, refund, refundDestination }: {
  record: CustomerRequestRecord; context?: CustomerAftercareContext | null; actorId?: string | null;
  viewerScope?: string; ownAccountView?: boolean; refund?: ReactNode; refundDestination?: string;
}) {
  const titleId = useId();
  const { row, kind } = record;
  const returned = kind === 'return' ? record.row : null;
  const facts = context?.items.find(item => item.id === row.orderItemId);
  const conversation = context?.events.filter(event => event.caseId === row.id && event.kind === kind) ?? [];
  const photos = context?.photos.filter(photo => photo.caseId === row.id) ?? [];
  const progress = requestProgressForRecord(record);
  const latestClarification = conversation.find(event => event.toStatus === 'needs_customer_changes' || event.toStatus === 'waiting_customer');
  const canReply = returned ? row.status === 'needs_customer_changes' || row.followup?.waitingFor === 'customer' : row.status === 'waiting_customer';
  const title = kind === 'return' ? customerRequestReason(record.row.reason) : record.row.subject;
  const sent = kind === 'return' ? record.row.requestedAt : record.row.createdAt;
  const amount = returned?.refundAmountPaisa;
  const headerClass = ownAccountView ? 'font-heading text-3xl sm:text-4xl' : 'font-heading text-2xl sm:text-3xl';

  return <article id={`case-${row.id}`} className="min-w-0 scroll-mt-36 space-y-5" aria-labelledby={titleId}>
    <header className="flex min-w-0 items-center gap-4">
      {facts?.photoId ? <Image src={`/api/product-media/${encodeURIComponent(facts.photoId)}`} alt="" width={88} height={88}
        className="size-[72px] shrink-0 rounded-xl border border-[#E7DCCB] bg-white object-contain sm:size-[88px]" unoptimized/> : null}
      <div className="min-w-0 space-y-1">
        {ownAccountView ? <h1 id={titleId} className={`${headerClass} break-words font-semibold text-[#14213D]`}>{title}</h1> :
          <h3 id={titleId} className={`${headerClass} break-words font-semibold text-[#14213D]`}>{title}</h3>}
        <p className="break-words text-sm leading-relaxed text-[#46536F]">{[row.productName, row.sellerName, row.orderNumber, row.referenceNumber].filter(Boolean).join(' · ')}</p>
      </div>
    </header>
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        <section className={`${aftercareBox} space-y-4 ${progress.actor === 'you' ? 'border-[#14213D] ring-1 ring-[#14213D]' : ''}`} aria-label="Current request status">
          <CustomerActingChip actor={progress.actor} yourTurn/>
          <div><h4 className="break-words text-xl font-bold text-[#14213D]">{progress.title}</h4>
            <p className="mt-1 text-sm leading-relaxed text-[#46536F]">{progress.description}</p></div>
          <CustomerRequestSteps progress={progress} complaint={kind === 'complaint'}/>
          {canReply && progress.actor === 'you' ? <CustomerRequestReply kind={kind} actorId={actorId} viewerScope={viewerScope}
            prompt={latestClarification?.message}
            endpoint={`/orders/${encodeURIComponent(row.orderNumber)}/${kind === 'return' ? 'returns' : 'complaints'}/${encodeURIComponent(row.id)}/reply`}/> : null}
        </section>

        <section className={aftercareBox} aria-label="Conversation">
          <h4 className="font-semibold text-[#14213D]">Conversation</h4>
          <ol className="mt-2 divide-y divide-[#E7DCCB] border-t border-[#E7DCCB]">
            {customerRequestTimeline(record, conversation).map(line => <li key={line.id} className="flex min-w-0 gap-3.5 py-4 last:pb-0">
              <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${avatarStyle[line.style]}`}>
                {line.style === 'staff' ? 'HB' : line.author.slice(0,1).toUpperCase()}
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs"><strong className="break-words text-[#14213D]">{line.author}</strong><time className="text-[#65584A]" dateTime={new Date(line.createdAt).toISOString()}>{shortAftercareDate(line.createdAt)}</time></div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#344766]">{line.message}</p>
              </div>
            </li>)}
          </ol>
        </section>
        {returned?.physical ? <ReturnPhysicalSummary value={returned.physical} customer/> : null}
        {refund}
        {returned?.refundId && !refund ? <section className={`${aftercareBox} space-y-3`} aria-label="Refund status">
          <h4 className="font-semibold text-[#14213D]">Refund status</h4>
          <p className="text-sm text-[#46536F]">{returned.refundProgress?.label ?? returned.refundPaymentProgress?.label ?? progress.title}</p>
          {returned.refundProgress || returned.refundPaymentProgress ? <p className="text-sm leading-relaxed text-[#46536F]">{returned.refundProgress?.message ?? returned.refundPaymentProgress?.message}</p> : null}
          {returned.refundAmountPaisa != null ? <p className="text-sm text-[#46536F]">{returned.refundProgress ? 'Original cash refund' : 'Cash refund'}: <strong>{aftercareMoney(returned.refundCashPaisa ?? 0)}</strong>{returned.refundWalletPaisa ? ` · ${aftercareMoney(returned.refundWalletPaisa)} shopping credit` : ''}.</p> : null}
          {returned.refundPaymentProgress?.delay ? <p className="text-sm text-[#46536F]">{returned.refundPaymentProgress.delay.reason} Next update by {longAftercareDate(returned.refundPaymentProgress.delay.nextUpdateAt)}.</p> : null}
          {returned.refundPromoPaisa ? <p className="text-sm text-[#46536F]">Promo savings: {aftercareMoney(returned.refundPromoPaisa)} (not refundable).</p> : null}
          <Link className={aftercareLink} href={actorId ? '/account/refunds' : `/orders/${encodeURIComponent(row.orderNumber)}/refund-status`}>Private refund instructions and payment progress</Link>
        </section> : null}
      </div>
      <aside className="min-w-0 space-y-4">
        <section className={`${aftercareBox} space-y-3`} aria-label="Your request">
          <h4 className="font-semibold text-[#14213D]">Your request</h4>
          <dl className="space-y-2.5 text-sm">
            <Detail label="Sent" value={shortAftercareDate(sent)}/>
            <Detail label="Reason" value={customerRequestReason(kind === 'return' ? record.row.reason : record.row.category)}/>
            {returned ? <Detail label="You asked for" value={`${returned.requestedResolution === 'replacement' ? 'Replacement' : 'Refund'}${amount != null && amount > 0 ? ` · ${aftercareMoney(amount)}` : ''}`}/> : null}
            {refundDestination ? <Detail label="Verified refund account" value={refundDestination}/> : null}
          </dl>
          {returned ? <><OrderOfferDetails offer={returned.offerSnapshot}/><p className="text-sm leading-relaxed text-[#46536F]">{returned.eligibilityReasonEn}</p></> : null}
          {photos.length ? <ul className="flex flex-wrap gap-2" aria-label="Photos and evidence you sent">
            {photos.map(photo => <li key={photo.id} className="max-w-full">
              <a href={`/api/return-evidence/${encodeURIComponent(photo.id)}`} className="inline-flex min-h-11 max-w-full min-w-11 items-center rounded-xl border border-[#E7DCCB] bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]"
                target="_blank" rel="noreferrer" aria-label={`Open evidence ${photo.name}`}>
                {photo.mimeType.startsWith('image/') ? <Image alt="" width={64} height={64} unoptimized
                  src={`/api/return-evidence/${encodeURIComponent(photo.id)}`} className="size-16 rounded-xl object-cover"/> :
                  <span className="break-all px-2 text-sm underline">{photo.name}</span>}
              </a>
            </li>)}
          </ul> : null}
          <AftercareFollowupSummary value={row.followup} customerCard/>
        </section>
        <section className={`${aftercareBox} space-y-2`} aria-label="How decisions are made">
          <h4 className="font-semibold text-[#14213D]">How decisions are made</h4>
          <p className="text-sm leading-relaxed text-[#46536F]">{kind === 'return' ? 'The seller replies first. Hastabazaar reads both sides and reviews your photos before deciding.' : 'Hastabazaar reviews your complaint and keeps the recorded updates here.'}</p>
          <Link className={aftercareLink} href="/returns">Returns &amp; refunds help</Link>
        </section>
      </aside>
    </div>
  </article>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt className="text-[#46536F]">{label}</dt><dd className="break-words font-medium text-[#14213D]">{value}</dd></div>;
}
