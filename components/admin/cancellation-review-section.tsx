import { CancellationReviewControl } from './cancellation-review-control';
export async function CancellationReviewSection({
  db,
  orderId,
}: {
  db: D1Database;
  orderId: string;
}) {
  const rows = (
    await db
      .prepare(
        'SELECT id,status,note,review_note AS reviewNote FROM order_cancellation_reviews WHERE order_id=? ORDER BY created_at DESC',
      )
      .bind(orderId)
      .all<{
        id: string;
        status: string;
        note: string;
        reviewNote: string | null;
      }>()
  ).results;
  return rows.length ? (
    <section className="my-6 space-y-4 rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Cancellation production reviews</h2>
      {rows.map((r) => (
        <article className="rounded border p-3" key={r.id}>
          <h3 className="font-semibold">{r.status}</h3>
          <p>{r.note}</p>
          {r.reviewNote ? <p>Decision: {r.reviewNote}</p> : null}
          {r.status === 'pending' ? (
            <CancellationReviewControl reviewId={r.id} />
          ) : null}
        </article>
      ))}
    </section>
  ) : null;
}
