import type { customerParcel } from '@/lib/operations/parcels';
export function ParcelList({
  parcels,
}: {
  parcels: ReturnType<typeof customerParcel>[];
}) {
  return parcels.length ? (
    <section className="my-6 space-y-4 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Your seller parcels</h2>
      <p>
        Each seller’s parcel can arrive separately. The delivery amount shown in
        your order summary follows the pricing policy saved when you checked
        out.
      </p>
      {parcels.map((p) => (
        <article key={p.id} className="space-y-2 rounded border p-4">
          <h3 className="font-semibold">{p.sellerName}</h3>
          <p>
            {p.status.replaceAll('_', ' ')} ·{' '}
            {p.courierName ??
              (p.method ? 'Delivery service' : 'Assignment pending')}
          </p>
          <p>
            Cash allocated: Rs. {(p.codDuePaisa / 100).toFixed(2)} · Collection
            recorded: Rs. {(p.collectedPaisa / 100).toFixed(2)}
          </p>
          {p.trackingCode ? <p>Reference: {p.trackingCode}</p> : null}
          {p.trackingUrl ? (
            <a
              href={p.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Courier tracking website
            </a>
          ) : null}
          {['delivery_failed', 'returning', 'returned', 'cancelled'].includes(
            p.status,
          ) ? (
            <p>
              Please contact support using this order’s complaint form. An
              exception does not automatically confirm a refund.
            </p>
          ) : null}
        </article>
      ))}
    </section>
  ) : null;
}
