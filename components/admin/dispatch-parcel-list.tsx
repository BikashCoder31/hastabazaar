'use client';

import { Package } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { DispatchParcel } from '@/app/admin/orders/dispatch/read-dispatch';
import { pickupWindowLabel } from '@/app/admin/orders/dispatch/pickup-window';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { dispatchWeightTotal } from '@/app/admin/orders/dispatch/packing-summary';
import { packedWeightLabel } from '@/lib/shipping/packed-weight';

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  trailingZeroDisplay: 'stripIfInteger',
});
export const dispatchMoney = (paisa: number) =>
  'NPR ' + money.format(paisa / 100);
export const dispatchChip =
  'inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-full border border-[#D4C2A6] bg-white px-3 py-2 text-left text-sm font-semibold text-[#46536F] hover:border-[#14213D] disabled:opacity-50 aria-pressed:border-[#14213D] aria-pressed:bg-[#14213D] aria-pressed:text-white';
export const dispatchPanel =
  'min-w-0 rounded-2xl border border-[#E4DACA] bg-white';

function ParcelPhoto({ mediaId }: { mediaId: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#E4DACA] bg-white text-[#675B4E]">
      {mediaId && !failed ? (
        <Image data-media-mode="contain"
          src={'/api/product-media/' + encodeURIComponent(mediaId)}
          alt=""
          width={44}
          height={44}
          unoptimized
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package aria-hidden="true" className="size-5" />
      )}
    </span>
  );
}

function parcelStatus(parcel: DispatchParcel) {
  if (parcel.lane === 'ready') return 'Book courier';
  if (parcel.lane === 'problems') {
    const labels: Record<string, string> = {
      delivery_failed: 'Delivery failed',
      returning: 'Coming back',
      returned: 'Returned',
      return_to_origin: 'Coming back',
      claim_open: 'Courier claim open',
    };
    return labels[parcel.state ?? ''] ?? 'Review parcel';
  }
  const slot = pickupWindowLabel(parcel.pickupStart, parcel.pickupEnd);
  return (
    [
      parcel.courierName,
      parcel.lane === 'booked' ? slot : parcel.trackingNumber,
    ]
      .filter(Boolean)
      .join(' · ') ||
    (parcel.lane === 'booked' ? 'Waiting for courier' : 'With courier')
  );
}

export function DispatchParcelList({
  label,
  parcels,
  choice,
  marked,
  selectable,
  disabled,
  onToggle,
  onToggleAll,
  onMark,
  renderParcelActions,
}: {
  label: string;
  parcels: DispatchParcel[];
  choice: ReadonlySet<string>;
  marked: string | null;
  selectable: boolean;
  disabled: boolean;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  onMark: (key: string) => void;
  renderParcelActions?: (parcel: DispatchParcel) => ReactNode;
}) {
  const groups = Map.groupBy(parcels, (parcel) => parcel.pickupGroup);
  const allSelected =
    parcels.length > 0 && parcels.every((parcel) => choice.has(parcel.key));
  return (
    <section
      aria-labelledby="dispatch-parcels"
      className={`${dispatchPanel} overflow-hidden`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-[18px]">
        <h2 id="dispatch-parcels" className="text-[15px] font-semibold">
          {label} · grouped by seller pickup address
        </h2>
        {selectable && parcels.length ? (
          <button
            className={dispatchChip}
            type="button"
            disabled={disabled}
            onClick={onToggleAll}
          >
            {allSelected ? 'Clear selection' : 'Select all'}
          </button>
        ) : null}
      </div>
      {parcels.length ? (
        Array.from(groups, ([group, items]) => (
          <div key={group} className="border-t border-[#E4DACA]">
            <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 bg-[#F7F3EC] px-4 py-2.5 text-sm text-[#46536F] md:px-[18px]">
              <h3 className="min-w-0 break-words">
                <strong className="text-[#14213D]">
                  {items[0].sellerName}
                </strong>
                {items[0].pickupAddress
                  ? ` · pickup ${items[0].pickupAddress}`
                  : ' · Pickup address unavailable'}
              </h3>
              <span>{items.length} {items.length === 1 ? 'parcel' : 'parcels'}</span>
              {items.some(item => item.packedWeightGrams !== undefined) ? <span>{dispatchWeightTotal(items)}</span> : null}
            </div>
            <ul>
              {items.map((parcel) => (
                <li
                  key={parcel.key}
                  className="grid grid-cols-1 items-center gap-2 border-t border-[#E4DACA] px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,40%)] md:px-[18px] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,40%)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {selectable ? (
                      <label className="-ml-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-[#F7F3EC]">
                        <input
                          type="checkbox"
                          aria-label={`Select ${parcel.orderNumber}, ${parcel.itemName}`}
                          className="size-[22px] accent-[#14213D]"
                          checked={choice.has(parcel.key)}
                          disabled={disabled}
                          onChange={() => onToggle(parcel.key)}
                        />
                      </label>
                    ) : null}
                    <ParcelPhoto
                      key={parcel.mediaId}
                      mediaId={parcel.mediaId}
                    />
                    <div className="min-w-0 break-words text-sm">
                      <Link
                        className="inline-flex min-h-11 items-center font-mono font-semibold underline-offset-2 hover:underline"
                        href={withAdminReturnTo(
                          `/admin/orders/${encodeURIComponent(parcel.orderId)}?tab=parcel-cash#courier`,
                          '/admin/orders/dispatch',
                        )}
                      >
                        {parcel.orderNumber}
                      </Link>
                      <p>
                        {parcel.itemName}
                        {parcel.additionalItems > 0
                          ? ` + ${parcel.additionalItems} more`
                          : ''}
                      </p>
                      {parcel.destination ? (
                        <p className="mt-0.5 text-[#46536F]">
                          To {parcel.destination}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col items-start gap-1.5 text-sm md:items-end md:text-right lg:items-start lg:text-left xl:items-end xl:text-right">
                    <strong>
                      {parcel.codDuePaisa === null
                        ? 'Cash on delivery'
                        : parcel.codDuePaisa
                          ? `COD ${dispatchMoney(parcel.codDuePaisa)}`
                          : 'No cash to collect'}
                    </strong>
                    {parcel.packedWeightGrams !== undefined ? <p className="text-[#46536F]">{packedWeightLabel(parcel.packedWeightGrams)}</p> : null}
                    <span
                      className={
                        parcel.lane === 'problems'
                          ? 'max-w-full break-words rounded-2xl bg-[#F9E5E5] px-2.5 py-0.5 text-xs font-semibold text-[#A8232E]'
                          : 'max-w-full break-words rounded-2xl bg-[#14213D] px-2.5 py-0.5 text-xs font-semibold text-white'
                      }
                    >
                      {parcelStatus(parcel)}
                    </span>
                    {parcel.canMarkPickedUp ? (
                      <button
                        type="button"
                        className={dispatchChip}
                        disabled={disabled}
                        aria-pressed={marked === parcel.key}
                        onClick={() => onMark(parcel.key)}
                      >
                        Mark picked up
                      </button>
                    ) : null}
                    {parcel.canRecordFailure && parcel.jobId ? (
                      <Link className={dispatchChip} href={`/admin/shipping?recordFailure=${encodeURIComponent(parcel.jobId)}`}>
                        Record failed delivery
                      </Link>
                    ) : null}
                  </div>
                  {renderParcelActions ? (
                    <div className="col-span-full min-w-0 empty:hidden">
                      {renderParcelActions(parcel)}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <div className="border-t border-[#E4DACA] p-8 text-center text-sm text-[#46536F]">
          <strong className="block text-[#14213D]">Nothing here</strong>
          Parcels show up when they reach this step.
        </div>
      )}
    </section>
  );
}
