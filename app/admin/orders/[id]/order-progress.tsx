import type { FulfillmentOrderDetail } from '@/lib/db/repositories/fulfillment';
import type { Parcel } from '@/lib/operations/parcels';
import { formatOrderTime } from '../order-queue-presentation';

export type ProgressFacts = {
  confirmedAt?: number | null;
  pickupAt?: number | null;
  dispatchedAt?: number | null;
  paidAt?: number | null;
  late?: string | null;
};

export function OrderProgress({
  order,
  parcels,
  facts,
  codPending,
}: {
  order: FulfillmentOrderDetail;
  parcels: Parcel[];
  facts: ProgressFacts;
  codPending: boolean;
}) {
  const orderEvent = (status: string) =>
    order.history.findLast((event) => event.toStatus === status)?.createdAt;
  const shipmentEvent = (...statuses: string[]) =>
    order.shipmentHistory.findLast((event) => statuses.includes(event.status))
      ?.occurredAt;
  const cancelled = order.status === 'cancelled';
  const confirmedAt = facts.confirmedAt ?? orderEvent('confirmed');
  const packingAt = orderEvent('packing');
  const pickedUpAt = shipmentEvent('picked_up') ?? facts.dispatchedAt;
  const courierAt =
    shipmentEvent('in_transit', 'dispatched') ??
    orderEvent('dispatched') ??
    facts.dispatchedAt;
  const pastConfirm = [
    'confirmed',
    'packing',
    'ready_for_pickup',
    'dispatched',
    'delivered',
    'return_requested',
    'return_in_transit',
    'returned',
    'refund_processing',
    'refunded',
  ].includes(order.status);
  const withCourier = Boolean(
    courierAt ||
    parcels.some((parcel) =>
      ['dispatched', 'in_transit', 'delivered'].includes(parcel.status),
    ),
  );
  const pastPickup = Boolean(
    withCourier ||
    pickedUpAt ||
    parcels.some((parcel) => parcel.status === 'picked_up'),
  );
  const deliveredAt = order.deliveredAt ?? shipmentEvent('delivered');
  const complete = [
    true,
    !codPending && (pastConfirm || Boolean(confirmedAt)),
    !codPending &&
      (pastPickup ||
        order.status === 'ready_for_pickup' ||
        Boolean(deliveredAt)),
    pastPickup || Boolean(deliveredAt),
    withCourier || Boolean(deliveredAt),
    Boolean(deliveredAt) || order.status === 'delivered',
    Boolean(facts.paidAt),
  ];
  const steps = [
    ['Placed', formatOrderTime(order.placedAt)],
    [
      'Confirmed',
      confirmedAt && !codPending ? formatOrderTime(confirmedAt) : null,
    ],
    ['Packing', facts.late ?? (packingAt ? formatOrderTime(packingAt) : null)],
    [
      'Picked up',
      pickedUpAt
        ? formatOrderTime(pickedUpAt)
        : facts.pickupAt
          ? 'Expected ' + formatOrderTime(facts.pickupAt)
          : null,
    ],
    ['With courier', courierAt ? formatOrderTime(courierAt) : null],
    ['Delivered', deliveredAt ? formatOrderTime(deliveredAt) : null],
    ['Seller paid', facts.paidAt ? formatOrderTime(facts.paidAt) : null],
  ];
  const firstIncomplete = complete.indexOf(false);

  return (
    <ol
      aria-label="Order progress"
      className="grid gap-0 rounded-[14px] border border-[#E4DACA] bg-card p-5 lg:grid-cols-7"
    >
      {steps.map(([label, detail], index) => {
        const current = !cancelled && firstIncomplete === index;
        const line = complete[index] ? 'bg-[#296648]' : 'bg-[#E4DACA]';
        return (
          <li
            key={label}
            aria-current={current ? 'step' : undefined}
            className="relative flex min-w-0 items-start gap-3 pb-4 last:pb-0 lg:block lg:pb-0 lg:pr-2"
          >
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={
                  'absolute left-[6px] top-2 h-full w-0.5 lg:left-2 lg:h-0.5 lg:w-full ' +
                  line
                }
              />
            ) : null}
            <span
              aria-hidden="true"
              className={
                'relative z-10 mt-0.5 block size-3.5 shrink-0 rounded-full border-[3px] lg:mt-0 lg:mb-2 ' +
                (current
                  ? 'border-[#A8232E] bg-white ring-4 ring-[#F7E0DE]'
                  : complete[index]
                    ? 'border-[#296648] bg-[#296648]'
                    : 'border-[#E4DACA] bg-white')
              }
            />
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm lg:block">
              <strong>{label}</strong>
              <span
                className={
                  'text-xs lg:mt-1 lg:block ' +
                  (label === 'Packing' && facts.late
                    ? 'font-semibold text-[#A8232E]'
                    : 'text-[#675B4E]')
                }
              >
                {detail ?? '—'}
              </span>
            </span>
            <span className="sr-only">
              {current
                ? 'Current step'
                : complete[index]
                  ? 'Complete'
                  : 'Upcoming'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
