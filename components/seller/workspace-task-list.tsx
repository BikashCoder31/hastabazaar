import Link from 'next/link';
import type { SellerWorkspaceTasks } from '@/lib/seller/workspace-tasks';
import {sellerTaskTimestamp} from '@/lib/seller/task-presentation';
export function SellerWorkspaceTaskList({ model, compact = false, unavailable = false }: {
    model: SellerWorkspaceTasks | null;
    compact?: boolean;
    unavailable?: boolean;
}) {
    const groups = [['required', 'Needs your action'], ['waiting', 'Waiting on another party'], ['suggestion', 'Suggestions'], ['history', 'Recorded outcomes']] as const;
    return <section className="space-y-5" aria-labelledby="seller-current-work"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="seller-current-work" className="font-heading text-2xl">{compact ? 'Your next tasks' : 'Requests and help'}</h2>{compact ? <Link className="section-link min-h-11" href="/seller/requests">View all requests →</Link> : null}</div>
 {unavailable || !model ? <output className="block">Your work could not be loaded. Saved records remain in their original sections. Refresh to retry.</output> : <>
 {model.unavailableFamilies.length ? <output className="block rounded-xl border p-4">Some work could not be loaded: {model.unavailableFamilies.join(', ')}. This is not an empty queue. Open the original section or refresh to retry.</output> : null}
 {!model.tasks.length && !model.unavailableFamilies.length ? <p>No recorded work in this view. Your original records remain available in their sections.</p> : null}
 {groups.map(([group, title]) => { const rows = model.tasks.filter(task => task.group === group); return rows.length ? <section key={group} aria-label={title}><h3 className="mb-3 font-semibold">{title}</h3><ul className="space-y-3">{rows.map(task => <li key={task.key} id={'task-' + task.key.replaceAll(':','-')} className="scroll-mt-28 rounded-xl border bg-card p-4"><div className="flex flex-wrap justify-between gap-3"><h4 className="font-semibold">{task.title}</h4>{task.severity !== 'normal' ? <span className="font-semibold">{task.severity === 'urgent' ? 'Urgent' : task.sellerActionRequired ? 'Response needs attention' : 'Update needs attention'}</span> : null}</div><p className="mt-1 break-words text-sm">{task.family} · Reference {task.reference}</p><p className="mt-1">{task.status.replaceAll('_', ' ')} · {task.group === 'history' ? 'Recorded outcome — no current action' : task.sellerActionRequired ? 'Next: You' : task.nextActor === 'Hastabazaar' ? 'Waiting for Hastabazaar' : 'Next: ' + task.nextActor}</p><p className="mt-2 text-sm text-muted-foreground">Recorded {sellerTaskTimestamp(task.startedAt)}{task.updatedAt>task.startedAt?` · Updated ${sellerTaskTimestamp(task.updatedAt)}`:''}{task.dueAt !== null ? ` · Response target ${sellerTaskTimestamp(task.dueAt)}` : ''}{task.group !== 'history' && task.nextUpdateAt !== null ? ` · Next update ${sellerTaskTimestamp(task.nextUpdateAt)}` : ''}</p><Link className="section-link mt-2 min-h-11" href={task.href}>Open record →</Link></li>)}</ul></section> : null; })}
 {model.hasMore ? <Link className="section-link min-h-11" href={compact ? '/seller/requests' : '/seller/requests?view=' + model.view + '&cursor=' + encodeURIComponent(model.nextCursor!)}>More requests →</Link> : null}
 </>}
 <p className="text-sm text-muted-foreground">Reading a notification does not complete work, verify evidence or confirm a payment. Suggestions do not change prices or ordering availability.</p></section>;
}
