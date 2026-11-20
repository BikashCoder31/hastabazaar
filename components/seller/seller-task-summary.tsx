import Link from 'next/link';
import type { SellerCapabilities } from '@/lib/workflows/contracts';
import type { SellerReviewTask } from '@/lib/workflows/review-tasks';
import { sellerDate } from '@/lib/seller/presentation';

export function SellerTaskSummary({ tasks, unavailable = false, capabilities }: {
  tasks: readonly SellerReviewTask[]; unavailable?: boolean; capabilities?: SellerCapabilities;
}) {
  return <section className="space-y-4" aria-labelledby="seller-review-tasks">
    <h2 id="seller-review-tasks" className="font-heading text-2xl">Requests and review progress</h2>
    {unavailable ? <output className="block">Review progress could not be loaded. Your saved records remain available from their sections. Refresh this page to retry.</output>
      : tasks.length ? <ul className="space-y-3">{tasks.map(task => <li key={task.id} className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold">{task.title}</h3><p>{task.status.replaceAll('_', ' ')} · {task.sourceStatus.replaceAll('_', ' ')}</p>
        <p className="text-sm">Next: {task.nextActor} · Submitted {sellerDate(task.startedAt)}
          {task.triagedAt?` · Review recorded ${sellerDate(task.triagedAt)}`:task.status === 'awaiting_review'&&task.dueAt!==null ? ` · First triage target ${sellerDate(task.dueAt)}` : ''}</p>
        <Link className="section-link" href={task.href}>Open record →</Link>
      </li>)}</ul> : <p>No recorded review tasks in this view. Your individual records show their current status.</p>}
    {capabilities?.blockers.length ? <ul className="space-y-2">{capabilities.blockers.map(blocker => <li key={`${blocker.capability}:${blocker.sourceId}`}>
      {blocker.reason} · Next: {blocker.nextActor}{blocker.href ? <> · <Link className="underline" href={blocker.href}>Open details</Link></> : null}
    </li>)}</ul> : null}
    <p className="text-sm text-muted-foreground">Reading a notification does not complete a request or verify a document.</p>
  </section>;
}
