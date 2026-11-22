'use client';

import { Copy, Download } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import {
  courierBookingDetailsText,
  courierCashLabel,
  courierPickupGroups,
  courierPickupLine,
  type CourierParcelDetails,
  type CourierParcelSelection,
} from '@/app/admin/orders/dispatch/courier-details';
import type { DispatchParcel } from '@/app/admin/orders/dispatch/read-dispatch';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { packedWeightLabel } from '@/lib/shipping/packed-weight';
import { dispatchChip, dispatchPanel } from './dispatch-parcel-list';

const detailsPath = '/admin/orders/dispatch/details';
const loadMessage = 'Could not load the courier details. Try again.';
type DetailsResult = { request: string; age: number; parcels: CourierParcelDetails[]; error?: string };

function selectionJson(parcels: readonly DispatchParcel[]) {
  return JSON.stringify(parcels.map(({ orderId, sellerId, jobId, version }): CourierParcelSelection =>
    ({ orderId, sellerId, jobId: version === null ? null : jobId, version })));
}

function courierRequest(mode: 'details' | 'sheet', selection: string, actorId: string, signal?: AbortSignal) {
  return fetch(detailsPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
    body: `{"mode":"${mode}","parcels":${selection}}`,
    signal,
  });
}

export function DispatchCourierDetails({ parcels, courierName, actorId, disabled }: {
  parcels: readonly DispatchParcel[];
  courierName: string;
  actorId: string;
  disabled: boolean;
}) {
  const title = useId();
  const selection = selectionJson(parcels);
  const [age, retry] = useState(0);
  const [result, setResult] = useState<DetailsResult>();
  const [feedback, setFeedback] = useState<{ request: string; message: string; error: boolean }>();
  const [downloading, setDownloading] = useState(false);
  const current = result?.request === selection && result.age === age ? result : undefined;
  const details = current?.parcels ?? [];

  useEffect(() => {
    const controller = new AbortController();
    void courierRequest('details', selection, actorId, controller.signal).then(async response => {
      const data = await response.json() as { parcels?: CourierParcelDetails[]; error?: string };
      if (controller.signal.aborted) return;
      setResult(response.ok && data.parcels
        ? { request: selection, age, parcels: data.parcels }
        : { request: selection, age, parcels: [], error: data.error ?? loadMessage });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ request: selection, age, parcels: [], error: loadMessage });
    });
    return () => controller.abort();
  }, [actorId, age, selection]);

  async function copy(rows: readonly CourierParcelDetails[]) {
    try {
      await navigator.clipboard.writeText(courierBookingDetailsText(rows));
      const message = rows.length === 1 ? `${rows[0].orderNumber} copied.` : 'Parcel details copied.';
      setFeedback({ request: selection, message, error: false });
    } catch {
      setFeedback({ request: selection, message: 'Could not copy the parcel details. Try again.', error: true });
    }
  }

  async function download() {
    setDownloading(true);
    try {
      const response = await courierRequest('sheet', selection, actorId);
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? 'Could not download the sheet. Try again.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'hastabazaar-courier-sheet.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ request: selection, message: 'Courier sheet downloaded.', error: false });
    } catch (error) {
      setFeedback({ request: selection, message: error instanceof Error ? error.message : 'Could not download the sheet.', error: true });
    } finally {
      setDownloading(false);
    }
  }

  const groups = [...courierPickupGroups(details)];
  return (
    <section aria-labelledby={title} className={`${dispatchPanel} space-y-3 p-4 text-sm md:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={title} className="min-w-0 wrap-anywhere font-semibold">Details to enter on {courierName || 'the courier’s website'}</h3>
        {details.length ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={dispatchChip} disabled={disabled} onClick={() => void copy(details)}>
              <Copy className="size-4" aria-hidden="true" /> Copy all
            </button>
            <button type="button" className={dispatchChip} disabled={disabled || downloading} onClick={() => void download()}>
              <Download className="size-4" aria-hidden="true" /> {downloading ? 'Preparing sheet…' : 'Sheet (.csv)'}
            </button>
          </div>
        ) : null}
      </div>
      {current?.error ? (
        <div className="space-y-2">
          <p role="alert" className="text-[#A8232E]">{current.error}</p>
          <button type="button" className={dispatchChip} onClick={() => retry(value => value + 1)}>Try loading again</button>
        </div>
      ) : !current ? <output className="block text-[#46536F]">Loading parcel details…</output> : null}
      {groups.map(rows => (
        <div className="space-y-2" key={rows[0].key}>
          <p className="wrap-anywhere text-[#46536F]"><strong className="text-[#14213D]">Pickup:</strong> {courierPickupLine(rows[0])}</p>
          {rows.map(parcel => (
            <article className="space-y-1 rounded-xl border border-[#E4DACA] px-3.5 py-2 wrap-anywhere" key={parcel.key}>
              <div className="flex items-center justify-between gap-2">
                <strong className="min-w-0 font-mono">{parcel.orderNumber}</strong>
                <button type="button" aria-label={`Copy ${parcel.orderNumber}`} className="min-h-11 shrink-0 rounded-lg px-3 font-semibold text-[#46536F] hover:bg-[#F7F3EC]" disabled={disabled} onClick={() => void copy([parcel])}>Copy</button>
              </div>
              <p><strong>{parcel.receiver || 'Receiver not recorded'}</strong> · {parcel.phone || 'Phone not recorded'}</p>
              <p>{parcel.address || 'Address not recorded'}</p>
              <p className="text-[#46536F]">{courierCashLabel(parcel)} · {packedWeightLabel(parcel.packedWeightGrams)} · {parcel.items.join(', ')}</p>
            </article>
          ))}
        </div>
      ))}
      {feedback?.request === selection ? (
        <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-[#A8232E]' : 'text-[#236548]'}>{feedback.message}</p>
      ) : null}
      <p className="text-[13px] text-[#675B4E]">Use the order number as the courier’s reference, so cash and tracking match up later.</p>
    </section>
  );
}
