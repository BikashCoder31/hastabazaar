import {StaffReviewAccessBoundary} from './staff-review-access-boundary';
import { StaffFormHistoryLinks } from './staff-form-history-links';
import { CancellationReviewControl } from './cancellation-review-control';
export async function CancellationReviewSection({
  db,
  orderId,
  actorId,
}: {
  db: D1Database;
  orderId: string;
  actorId:string;
}) {
  const rows = (
    await db
      .prepare(
        "SELECT r.id,r.status,r.note,r.review_note AS reviewNote,r.owner_id AS ownerId,r.backup_id AS backupId,r.created_at AS createdAt,r.first_due_at AS firstDueAt,r.first_action_at AS firstActionAt,(SELECT COUNT(*) FROM order_fulfillment_holds h WHERE h.source_type='cancellation_review' AND h.source_id=r.id AND h.ended_at IS NULL) AS activeHolds FROM order_cancellation_reviews r WHERE order_id=? ORDER BY created_at DESC",
      )
      .bind(orderId)
      .all<{
        id: string;ownerId:string|null;backupId:string|null;createdAt:number;firstDueAt:number|null;firstActionAt:number|null;activeHolds:number;
        status: string;
        note: string;
        reviewNote: string | null;
      }>()
  ).results;
  return rows.length ? (
    <StaffReviewAccessBoundary actorId={actorId} sourceId={orderId}><section className="my-6 space-y-4 rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Cancellation and delivery concerns</h2>
      {rows.map((r) => (
        <article className="rounded border p-3" key={r.id}>
          <h3 className="font-semibold">{r.id} · {r.status}</h3>
          <p>{r.activeHolds} item lines have this cancellation hold. Owner: {r.ownerId??'Unassigned — coverage required'}; backup: {r.backupId??'Not assigned'}.</p>
          <p>Original first-action target: {r.firstDueAt?new Date(r.firstDueAt).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'}):'Historical time requires reconciliation'}. Decision or specific blocker target: {new Date(r.createdAt+86400000).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'})}.</p>
          <p>{r.note}</p>
          {r.reviewNote ? <p>Decision: {r.reviewNote}</p> : null}
          <StaffFormHistoryLinks entries={[{kind:'cancellation-approved',subjectId:`review:${r.id}`,label:'Approval answers'},
            {kind:'cancellation-rejected',subjectId:r.id,label:'Rejection answers'}]} />
          <CancellationReviewControl reviewId={r.id} actorId={actorId} canDecide={r.status==='pending'}/>
        </article>
      ))}
    </section></StaffReviewAccessBoundary>
  ) : null;
}
