import Link from 'next/link';
import type { RecentReviewDecision } from '@/lib/admin/recent-review-decisions';

const time = new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' });

export function OverviewRecentDecisions({ decisions, partial = false, actorId, auditHref }: {
  decisions: readonly RecentReviewDecision[] | null; partial?: boolean; actorId?: string; auditHref?: string;
}) {
  return <section aria-labelledby="recent-decisions-heading" className="today-panel today-side-panel">
    <h2 id="recent-decisions-heading">Recent decisions</h2>
    {decisions === null ? <output>Recent decisions are unavailable.</output> :
      decisions.length ? <ol className="today-decisions">
        {decisions.slice(0, 4).map(row => <li key={row.id}>
          <strong>{actorId && row.actorId === actorId ? 'You' : row.actorName ?? (row.actorId ? 'Staff' : 'System')}</strong>{' '}
          <Link href={row.href}>{row.outcome}</Link><span> · {time.format(row.createdAt)}</span>
        </li>)}
      </ol> : <p>No saved decisions to show yet.</p>}
    {partial ? <p>Open the original record for its full history.</p> : null}
    {auditHref ? <Link className="section-link" href={auditHref}>All staff actions</Link> : null}
  </section>;
}
