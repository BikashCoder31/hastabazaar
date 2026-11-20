import Link from 'next/link';
import type {RecentReviewDecision} from '@/lib/admin/recent-review-decisions';
const time=new Intl.DateTimeFormat('en-NP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kathmandu'});
export function OverviewRecentDecisions({decisions,partial=false}:{decisions:readonly RecentReviewDecision[]|null;partial?:boolean}){
 return <section aria-labelledby="recent-decisions-heading" className="min-w-0 space-y-3 rounded-2xl border bg-card p-5">
  <h2 id="recent-decisions-heading" className="font-heading text-xl">Recent decisions</h2>
  <p className="text-sm text-muted-foreground">Saved review outcomes in your permitted records and your Finance outcomes. These are historical steps; open the original record for its current status and full history.</p>
  {partial?<output className="block text-sm">This short view has incomplete history coverage. Use the original record for remaining decisions.</output>:null}
  {decisions===null?<output className="block">Recent decisions are unavailable. Refresh or open the original record.</output>:decisions.length?<ol className="space-y-3">{decisions.map(row=><li key={row.id} className="min-w-0 rounded-xl border p-3 [overflow-wrap:anywhere]"><Link className="inline-flex min-h-11 items-center font-medium underline" href={row.href}>{row.outcome}</Link><p className="text-sm">{row.actorName??row.actorId??'System'} · {time.format(row.createdAt)} Nepal time</p><p className="text-xs text-muted-foreground">Original record {row.sourceId} · Decision {row.id}</p></li>)}</ol>:<p>No matching saved review decisions in these permitted records.</p>}
 </section>;
}

