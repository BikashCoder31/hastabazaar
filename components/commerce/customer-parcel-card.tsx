import type { ReactNode } from 'react';
import { ArrowUpRight, Truck } from 'lucide-react';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
import { CustomerParcelCash } from '@/components/storefront/customer-parcel-cash';
import { CustomerParcelProgress, type CustomerParcelStage } from '@/components/storefront/customer-parcel-progress';
import { customerDate, customerDeliveryProblem, type CustomerParcelState } from '@/lib/orders/customer-parcel-state';
import { formatPaisaExact } from '@/lib/marketplace/money-display';

export type CustomerParcelCardData = {
  status: string;
  courierName: string | null;
  trackingReference: string | null;
  trackingUrl: string | null;
  failureReason?: string | null;
  codPaisa?: number | null;
  stageTimes?: Partial<Record<CustomerParcelStage, number>>;
};

export function CustomerParcelCard({ id, title, parcel, state, detail, children }: {
  id?: string;
  title: string;
  parcel: CustomerParcelCardData;
  state: CustomerParcelState;
  detail?: string;
  children?: ReactNode;
}) {
  const dates: Partial<Record<CustomerParcelStage, string>> = {};
  for (const [stage, value] of Object.entries(parcel.stageTimes ?? {}) as [CustomerParcelStage, number | undefined][]) {
    if (typeof value === 'number' && Number.isFinite(value)) dates[stage] = customerDate(value);
  }
  return (
    <article id={id} className="min-w-0 scroll-mt-48 space-y-4 rounded-[15px] border border-[#E3D6C3] bg-[#FDFAF5] p-4 text-[#14213D] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-[#655848]">{title}</p>
          <h2 className="mt-1 text-lg font-bold sm:text-xl">{state.label}</h2>
        </div>
        <CustomerActingChip actor={state.actor} yourTurn={state.actor === 'you'} />
      </div>
      {detail ? <p className="text-sm text-[#465573]">{detail}</p> : null}
      {parcel.status === 'delivery_failed' && parcel.failureReason !== undefined ? (
        <p className="rounded-xl bg-[#F8E9E9] p-3 text-sm font-medium text-[#872731]">{customerDeliveryProblem(parcel.failureReason)}</p>
      ) : null}
      {parcel.status !== 'cancelled' ? <CustomerParcelProgress stage={state.stage} condition={state.condition} dates={dates} /> : null}
      {parcel.courierName || parcel.trackingReference || parcel.trackingUrl ? (
        <div className="grid min-w-0 items-center gap-3 rounded-[14px] border border-[#E3D6C3] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[#E0E7F3] text-[#2A4E89]"><Truck className="size-4" aria-hidden="true" /></span>
            <p className="min-w-0 wrap-anywhere text-sm font-semibold">{parcel.courierName || 'Courier'}{parcel.trackingReference ? ` · Tracking ${parcel.trackingReference}` : ''}</p>
          </div>
          {parcel.trackingUrl ? <a href={parcel.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[9px] border border-[#D4C1A6] px-3 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]">Track on {parcel.courierName || 'courier site'} <ArrowUpRight className="size-4" aria-hidden="true" /></a> : null}
        </div>
      ) : null}
      {children}
      {parcel.codPaisa != null ? parcel.status === 'delivered' ? (
        <p className="flex flex-wrap justify-between gap-2 border-t border-[#E3D6C3] pt-3.5 text-sm"><span className="text-[#465573]">Cash for this parcel</span><strong>{formatPaisaExact(parcel.codPaisa)}</strong></p>
      ) : <CustomerParcelCash amountPaisa={parcel.codPaisa} /> : null}
    </article>
  );
}
