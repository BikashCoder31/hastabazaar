import Link from 'next/link';
import {reviewCategory,reviewHasAssignment,reviewPriority,reviewTaskOpen,workSummaryCategories,type ReviewQueueTask} from '@/lib/admin/review-queue-view';

export function OverviewWorkSummaries({tasks,observedAt,unavailableCategories=[],partialCategories=[],returnTo='/admin'}:{tasks:readonly ReviewQueueTask[]|null;observedAt:number;unavailableCategories?:readonly string[];partialCategories?:readonly string[];returnTo?:string}){
 const link=(category:string,view:string)=>{const url=new URL(returnTo,'http://localhost');url.searchParams.set('reviewDepartment',category);url.searchParams.set('reviewView',view);url.searchParams.delete('reviewPage');url.hash='seller-review-queue';return url.pathname+url.search+url.hash;};
 return <section aria-labelledby="work-summary-heading" className="space-y-3">
  <h2 id="work-summary-heading" className="font-heading text-xl">Your work at a glance</h2>
  <p className="text-sm text-muted-foreground">Counts show permitted work items, not unique sellers. Waiting work is shown separately from staff action.</p>
  <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">{workSummaryCategories.map(([category,label])=>{
   const rows=(tasks??[]).filter(task=>reviewCategory(task)===category),actionable=rows.filter(task=>task.status==='awaiting_review'),waiting=rows.filter(task=>reviewTaskOpen(task)&&task.status!=='awaiting_review'),unknown=tasks===null||unavailableCategories.includes(category),partial=partialCategories.includes(category);
   return <article key={category} className="min-w-0 rounded-2xl border bg-card p-4">
    <Link href={link(category,'attention')} className="block rounded focus-visible:outline-2 focus-visible:outline-primary">
     <h3 className="text-sm font-semibold">{label}</h3><p className="mt-3 text-2xl font-semibold tabular-nums">{unknown?'Unavailable':partial?`${actionable.length} shown`:actionable.length}</p><p className="text-xs text-muted-foreground">{unknown?'A complete count could not be read':partial?'Partial view — more sources need review':'Need staff action'}</p>
    </Link>
    {!unknown?<><p className="mt-3 text-xs">{actionable.filter(task=>reviewHasAssignment(task)&&!task.ownerId).length} unassigned · {actionable.filter(task=>reviewPriority(task,observedAt).key==='overdue').length} overdue</p><Link className="mt-2 inline-flex min-h-11 items-center text-sm underline" href={link(category,'waiting')}>{waiting.length} waiting{partial?' shown':''}</Link></>:null}
   </article>;
  })}</div>
 </section>;
}
