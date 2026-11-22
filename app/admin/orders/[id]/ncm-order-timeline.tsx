import { ncmProgressLabels, type NcmParcelTimeline } from '@/lib/delivery/ncm-health';
import { formatOrderTime, orderMoney } from '../order-queue-presentation';
import { NcmReviewAction } from './ncm-review-action';

export function NcmOrderTimeline({ parcels, sellerNames, reviewActorId }: {
  parcels: readonly NcmParcelTimeline[];
  sellerNames: ReadonlyMap<string, string>;
  reviewActorId: string | null;
}) {
  if (!parcels.length) return null;
  return (
    <section id="ncm-timeline" aria-labelledby="ncm-timeline-heading" className="min-w-0 scroll-mt-20 rounded-[14px] border border-[#E4DACA] bg-card p-5">
      <h2 id="ncm-timeline-heading" className="font-heading text-xl">Nepal Can Move timeline</h2>
      <div className="mt-3 space-y-4">
        {parcels.map(parcel => {
          const seller = sellerNames.get(parcel.sellerId);
          const amounts = [
            ['COD reported by NCM', parcel.codPaisa],
            ['NCM delivery charge', parcel.deliveryChargePaisa],
            ['NCM return charge', parcel.returnChargePaisa],
          ] as const;
          return (
            <article key={parcel.jobId} className="min-w-0 space-y-3 rounded-xl border border-[#E4DACA] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="min-w-0 wrap-anywhere font-semibold">{seller ? `${seller} · ` : ''}NCM {parcel.orderNumber}</h3>
                <p className="text-sm text-[#46536F]">{parcel.status ? ncmProgressLabels[parcel.status] : 'Booked'}</p>
              </div>
              {parcel.entries.length ? (
                <ol aria-label="Courier updates and notes" className="divide-y divide-[#E4DACA] border-y border-[#E4DACA]">
                  {parcel.entries.map(entry => (
                    <li key={`${entry.kind}:${entry.id}`} className="min-w-0 space-y-2 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="font-semibold text-sm">{entry.kind === 'status' ? entry.text : entry.kind === 'Action' ? 'Courier note · Action' : entry.kind === 'Info' ? 'Courier note · Info' : 'Super Admin review'}</p>
                        <time className="text-xs text-[#46536F]" dateTime={new Date(entry.createdAt).toISOString()}>{formatOrderTime(entry.createdAt)}</time>
                      </div>
                      {entry.kind !== 'status' ? <p className="wrap-anywhere whitespace-pre-wrap text-sm text-[#46536F]">{entry.text}</p> : null}
                      {entry.kind === 'review' && entry.relatedOrderNumber ? <p className="text-sm text-[#46536F]">Related NCM order {entry.relatedOrderNumber}</p> : null}
                      {entry.kind === 'review' && (entry.reviewed ? <p className="text-sm font-semibold">Reviewed</p>
                        : reviewActorId ? <NcmReviewAction actorId={reviewActorId} eventId={entry.id} /> : null)}
                    </li>
                  ))}
                </ol>
              ) : null}
              {amounts.some(([, amount]) => amount !== null) ? (
                <dl className="space-y-2 text-sm">
                  {amounts.map(([label, amount]) => amount === null ? null : (
                    <div key={label} className="flex flex-wrap justify-between gap-x-3">
                      <dt className="text-[#46536F]">{label}</dt>
                      <dd className="font-semibold tabular-nums">{orderMoney(amount)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
