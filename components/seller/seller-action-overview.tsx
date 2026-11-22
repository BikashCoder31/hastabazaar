import Link from 'next/link';
import { ArrowRight, ChevronRight, ClipboardCheck, Clock3, Package, RotateCcw, Truck, Wallet } from 'lucide-react';
import type { SellerWorkspaceTask } from '@/lib/seller/workspace-tasks';
import { sellerTaskTimestamp } from '@/lib/seller/task-presentation';
import { WhoseTurn } from '@/components/ui/whose-turn';

const taskIcons = {
  order: Package, return: RotateCcw, complaint: RotateCcw, cancellation: Package,
  payout: Wallet, recovery: Wallet, review: ClipboardCheck, product: ClipboardCheck,
};

const actionClass = 'inline-flex min-h-11 items-center justify-center rounded-lg border bg-card px-3 text-sm font-semibold text-[#14213D] hover:border-[#14213D]';

export type TodayTask = Pick<SellerWorkspaceTask, 'key' | 'family' | 'title' | 'severity' | 'dueAt' | 'href'> & {
  detail: string;
  action: string;
  readyDateHref?: string;
  courierPickup?: boolean;
};

export function SellerActionOverview({
  first, remaining, waiting, unavailable,
}: {
  first?: TodayTask;
  remaining: readonly TodayTask[];
  waiting: readonly TodayTask[];
  unavailable: boolean;
}) {
  return <div className="space-y-5">
    {first ? <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#14213D] p-5 text-white md:p-6" aria-label="Do this first">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#DCE4F4]">
          {first.severity === 'overdue' ? <WhoseTurn status="late" /> : null}
          {first.severity === 'urgent' ? <WhoseTurn status="late" label="Needs attention" /> : null}
          <span>Do this first</span>
        </div>
        <h2 className="break-words text-xl font-bold">{first.title}</h2>
        <p className="break-words text-sm leading-relaxed text-[#DCE4F4]">{first.detail}{first.dueAt ? ` · Due ${sellerTaskTimestamp(first.dueAt)}` : ''}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={first.href} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#A8232E] px-4 text-sm font-semibold text-white hover:bg-[#8F1D27]">{first.action}</Link>
        {first.readyDateHref ? <Link href={first.readyDateHref} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/40 px-4 text-sm font-semibold text-white hover:bg-white/10">Give a new ready date</Link> : null}
      </div>
    </section> : null}
    {unavailable ? <output className="block rounded-xl border bg-card p-3 text-sm text-muted-foreground">Some tasks could not be loaded. Refresh Today or open Requests &amp; help for the original records.</output> : null}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <section aria-labelledby="seller-today-your-turn" className="min-w-0 rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2"><WhoseTurn status="your-turn" /><h2 id="seller-today-your-turn" className="font-semibold">Do these next</h2></div>
          {remaining.some(task => task.dueAt) ? <p className="text-xs text-muted-foreground">Soonest deadline first</p> : null}
        </div>
        {remaining.length ? <ul className="divide-y border-t">
          {remaining.map(task => {
            const Icon = taskIcons[task.family];
            return <li key={task.key} className="flex min-w-0 items-start gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EEE5D5] text-[#74531E]"><Icon className="size-4" aria-hidden="true" /></span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1 basis-40">
                  <h3 className="break-words text-sm font-semibold">{task.title}</h3>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">{task.detail}</p>
                  {task.dueAt ? <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Clock3 className="size-3 shrink-0" aria-hidden="true" />Due {sellerTaskTimestamp(task.dueAt)}</p> : null}
                </div>
                <Link href={task.href} className={actionClass}>{task.action}</Link>
              </div>
            </li>;
          })}
        </ul> : <p className="border-t p-4 text-sm text-muted-foreground">{first ? 'No other tasks need you right now.' : 'No tasks need you right now.'}</p>}
      </section>
      <section aria-labelledby="seller-today-with-hastabazaar" className="min-w-0 rounded-2xl border bg-card">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2"><WhoseTurn status="with-hastabazaar" /><h2 id="seller-today-with-hastabazaar" className="font-semibold">Nothing to do</h2></div>
          <p className="mt-2 text-sm text-muted-foreground">{waiting.length ? 'We’re working on these. You’ll get a notification when each one moves.' : 'Items we’re working on will appear here.'}</p>
        </div>
        {waiting.length ? <ul className="divide-y border-t">
          {waiting.map(task => {
            const Icon = task.courierPickup ? Truck : taskIcons[task.family];
            return <li key={task.key}><Link href={task.href} className="flex min-h-11 min-w-0 items-center gap-3 px-4 py-3 hover:bg-muted/45">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#E3E9F4] text-[#264880]"><Icon className="size-4" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{task.title}</h3><p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{task.detail}</p></div>
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </Link></li>;
          })}
        </ul> : null}
      </section>
    </div>
    <div className="flex justify-end">
      <Link href="/seller/requests" className="section-link min-h-11">All requests <ArrowRight className="size-4" aria-hidden="true" /></Link>
    </div>
  </div>;
}
