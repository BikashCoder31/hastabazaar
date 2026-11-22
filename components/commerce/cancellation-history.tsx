import { formatPaisaExact } from '@/lib/marketplace/money-display';
export async function CancellationHistory({
  db,
  orderNumber,
}: {
  db: D1Database;
  orderNumber: string;
}) {
  const rows = (
    await db
      .prepare(
        'SELECT e.version,e.wallet_restored_paisa AS wallet,e.next_json AS next,e.note FROM order_cancellation_events e JOIN orders o ON o.id=e.order_id WHERE o.order_number=? ORDER BY e.version',
      )
      .bind(orderNumber)
      .all<{ version: number; wallet: number; next: string; note: string }>()
  ).results;
  const reviews = (
    await db
      .prepare(
        "SELECT r.id,r.status,r.note,r.review_note AS reviewNote,r.next_update_at AS nextUpdateAt,(SELECT COUNT(*) FROM order_fulfillment_holds h WHERE h.source_type='cancellation_review' AND h.source_id=r.id AND h.ended_at IS NULL) AS activeHolds FROM order_cancellation_reviews r JOIN orders o ON o.id=r.order_id WHERE o.order_number=? ORDER BY r.created_at DESC",
      )
      .bind(orderNumber)
      .all<{id:string; status: string; note: string; reviewNote: string | null;nextUpdateAt:number|null;activeHolds:number }>()
  ).results;
  if (!rows.length && !reviews.length) return null;
  return (
    <section className="my-6 space-y-3 rounded-xl border p-4">
      <h2 className="text-xl font-semibold">
        Cancellation adjustments and reviews
      </h2>
      {rows.length ? (
        <p>
          Current totals include these adjustments. Your original order
          statement remains preserved.
        </p>
      ) : null}
      {rows.map((r) => {
        const next = JSON.parse(r.next) as { total: number; delivery: number };
        return (
          <div key={r.version}>
            <p>
              Adjustment {r.version}: order cash total{' '}
              {formatPaisaExact(next.total)}; delivery{' '}
              {formatPaisaExact(next.delivery)}; wallet credit restored{' '}
              {formatPaisaExact(r.wallet)}.
            </p>
            <p>{r.note}</p>
          </div>
        );
      })}
      {reviews.map((r, i) => (
        <div key={i}>
          <p>Cancellation / delivery concern {r.id}: {r.status}</p>
          {r.activeHolds>0?<p>Preparation and dispatch on hold for {r.activeHolds} affected item lines.</p>:r.status==='pending'?<p>No cancellation hold is active. Staff must confirm actual custody and the available delivery or return remedy.</p>:null}
          <p>
            {r.status === 'pending'
              ? 'Responsible team: operations. Next action: review actual custody, original terms and payment. A cash refund requires its separate verified outcome.'
              : r.reviewNote}
          </p>
          {r.status==='pending'?<p>{r.nextUpdateAt?`Next recorded update: ${new Date(r.nextUpdateAt).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'})}`:'A time for the next update has not yet been confirmed. Order support remains available.'}</p>:null}
        </div>
      ))}
    </section>
  );
}
