'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  dispatchLanes,
  type DispatchLane,
  type DispatchParcel,
} from '@/app/admin/orders/dispatch/read-dispatch';
import type { PickupWindow } from '@/app/admin/orders/dispatch/pickup-window';
import { DispatchBookingForm } from './dispatch-booking-form';
import {
  DispatchParcelList,
  dispatchChip,
  dispatchPanel,
} from './dispatch-parcel-list';

export function DispatchWorkspace({
  parcels,
  actorId,
  options,
  initialLane = 'ready',
}: {
  parcels: DispatchParcel[];
  actorId: string;
  options: (PickupWindow & { label: string })[];
  initialLane?: DispatchLane;
}) {
  const router = useRouter();
  const [lane, setLane] = useState<DispatchLane>(initialLane);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [marked, setMarked] = useState<string | null>(null);
  const [notice, setNotice] = useState({ message: '', error: false });
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const grouped = Map.groupBy(parcels, (parcel) => parcel.lane);
  const visible = grouped.get(lane) ?? [];
  const chosen =
    lane === 'ready'
      ? visible.filter((parcel) => selected.has(parcel.key))
      : [];
  const pickup =
    lane === 'booked'
      ? visible.find(
          (parcel) => parcel.key === marked && parcel.canMarkPickedUp,
        )
      : undefined;

  function toggle(key: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function saved(keys: readonly string[]) {
    setSelected((previous) => {
      const next = new Set(previous);
      keys.forEach((key) => next.delete(key));
      return next;
    });
    if (marked && keys.includes(marked)) setMarked(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="min-w-0 space-y-4 text-[#14213D]">
      <fieldset className="min-w-0">
        <legend className="sr-only">Dispatch lanes</legend>
        <div className="flex flex-wrap gap-2.5">
          {dispatchLanes.map(({ id, label }) => (
            <button
              type="button"
              className={dispatchChip}
              key={id}
              aria-pressed={lane === id}
              disabled={busy || refreshing}
              onClick={() => setLane(id)}
            >
              {label}{' '}
              <span className="tabular-nums opacity-75">
                {grouped.get(id)?.length ?? 0}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      {notice.message ? (
        <p
          role={notice.error ? 'alert' : 'status'}
          className={`rounded-xl p-3 text-sm ${notice.error ? 'bg-[#F9E5E5] text-[#A8232E]' : 'bg-[#E4EEE3] text-[#236548]'}`}
        >
          {notice.message}
        </p>
      ) : null}
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(290px,40%)] xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <DispatchParcelList
          label={dispatchLanes.find(({ id }) => id === lane)!.label}
          parcels={visible}
          choice={selected}
          marked={marked}
          selectable={lane === 'ready'}
          disabled={busy || refreshing}
          onToggle={toggle}
          onToggleAll={() =>
            setSelected(
              chosen.length === visible.length
                ? new Set()
                : new Set(visible.map((parcel) => parcel.key)),
            )
          }
          onMark={(key) =>
            setMarked((previous) => (previous === key ? null : key))
          }
        />
        <aside aria-label="Book courier" className="min-w-0 space-y-3.5">
          {chosen.length || pickup ? (
            <DispatchBookingForm
              parcels={chosen}
              pickup={pickup}
              actorId={actorId}
              options={options}
              refreshing={refreshing}
              onBusy={setBusy}
              onSaved={saved}
              onNotice={(message, error) => setNotice({ message, error })}
            />
          ) : (
            <section className={`${dispatchPanel} space-y-3 p-5`}>
              <h2 className="text-lg font-semibold">Book a courier pickup</h2>
              <p className="text-sm text-[#46536F]">
                {lane === 'ready'
                  ? 'Tick the parcels one courier will collect. Parcels from the same seller go together.'
                  : 'Booking happens from “Ready for pickup”. Open an order to see its courier details.'}
              </p>
            </section>
          )}
          <section className={`${dispatchPanel} space-y-2 p-5 text-sm`}>
            <h2 className="font-semibold">No courier API yet</h2>
            <p className="text-[#46536F]">
              Booking is done on the courier’s own website or by phone. Here you
              record it, so the seller, customer and courier cash all stay in
              step.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
