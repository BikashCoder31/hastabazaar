'use client';

import Link from 'next/link';
import {reviewCategory,reviewHasAssignment,reviewPriority,reviewTaskOpen,workSummaryCategories,type ReviewQueueTask} from '@/lib/admin/review-queue-view';
import type { TodayOrders } from './overview-today-data';
import type { OverviewHealthChecks } from './overview-health-model';
import { useOverviewHealthChecks } from './overview-health';

const number = new Intl.NumberFormat('en-NP');
const npr = new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR', maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function TodayWorkSummaries({ orders, courierCash, cases, checks }: {
  orders: TodayOrders | null | undefined;
  courierCash: { paisa: number; parcels: number } | null | undefined;
  cases: number | null | undefined;
  checks: OverviewHealthChecks | null | undefined;
}) {
  const health = useOverviewHealthChecks(checks);
  const observed = health ?? [];
  const issues = observed.filter(row => row.tone === 'issue').length;
  const healthText = health === null ? 'Unavailable' : issues ? `${issues} need attention` :
    observed.some(row => row.text === 'Not checked yet') ? 'Not checked yet' :
    observed.some(row => row.tone === 'unknown') ? 'Status unknown' : number.format(observed.length) + ' checked';
  const metrics = [
    orders === undefined ? null : { label: 'Orders today', value: orders === null ? 'Unavailable' : number.format(orders.count), detail: 'Placed today, Nepal time' },
    courierCash === undefined ? null : { label: 'Courier cash due', value: courierCash === null ? 'Unavailable' : npr.format(courierCash.paisa / 100), detail: courierCash ? `From ${number.format(courierCash.parcels)} ${courierCash.parcels === 1 ? 'parcel' : 'parcels'}` : 'Pending remittances' },
    cases === undefined ? null : { label: 'Returns & complaints', value: cases === null ? 'Unavailable' : number.format(cases), detail: 'Open cases' },
    health === undefined ? null : { label: 'System checks', value: healthText, detail: 'Recorded observations', warning: health === null || observed.some(row => row.tone !== 'good') },
  ].filter(row => row !== null);
  if (!metrics.length) return null;
  return <dl className="today-panel today-metrics" aria-label="Work totals">
    {metrics.map(row => <div key={row.label}>
      <dt>{row.label}</dt><dd data-warning={row.warning}>{row.value}</dd><dd className="today-metric-note sr-only sm:not-sr-only">{row.detail}</dd>
    </div>)}
  </dl>;
}

export function OverviewOrdersByStage({ orders }: { orders: TodayOrders | null | undefined }) {
  if (orders === undefined) return null;
  const max = Math.max(1, ...(orders?.stages.map(stage => stage.count) ?? []));
  return <section className="today-panel today-side-panel" aria-labelledby="today-order-stages-heading">
    <div className="today-side-heading"><h2 id="today-order-stages-heading">Orders by stage</h2>
      <Link className="section-link inline-flex min-h-11 items-center" href="/admin/orders">All orders</Link>
    </div>
    {orders === null ? <output>Order counts are unavailable.</output> : <ul className="today-stages">
      {orders.stages.map((stage, index) => <li key={stage.label} className="max-lg:grid-cols-1!">
        <span>{stage.label}</span>
        <span className="today-stage-track" aria-hidden="true"><span data-stage={index} style={{ width: (stage.count / max) * 100 + '%' }} /></span>
        <strong>{number.format(stage.count)}</strong>
      </li>)}
    </ul>}
  </section>;
}

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
