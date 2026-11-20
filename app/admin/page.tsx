import { AdminPageTitle } from '@/components/admin/page-help';
import {SharedReviewQueue} from '@/components/admin/shared-review-queue';
import {OverviewOrdersByStage,OverviewWorkSummaries,TodayWorkSummaries} from '@/components/admin/overview-work-summaries';
import {TodayOverview} from '@/components/admin/overview-today';
import {readTodaySources,todayDecisionHistory} from '@/components/admin/overview-today-data';
import {OverviewHealth,OverviewHealthProvider} from '@/components/admin/overview-health';
import {overviewHealthChecks} from '@/components/admin/overview-health-model';
import {OverviewRecentDecisions} from '@/components/admin/overview-recent-decisions';
import {readAdminReviewTasks} from '@/components/admin/admin-review-data';
import {readRecentReviewDecisions} from '@/lib/admin/recent-review-decisions';
import {readFinanceWorkItems} from '@/lib/admin/finance-work-items';
import {financeQueueItem,reviewTaskLabels} from '@/lib/admin/review-queue-view';
import {resolveRuntimeEnvironment} from '@/lib/staging/environment';
import {formHealthRuntimeScope} from '@/lib/operations/form-health';
import {readSystemHealthWorkspace} from '@/lib/operations/system-health-workspace';
import {readEmailHealthRuntimeConfig} from '@/lib/operations/email-delivery-overview';
import {ReviewTaskConflict} from '@/lib/workflows/review-tasks';
import {staffMutationGuard} from '@/lib/db/repositories/staff-mutation-guard';
import { can } from '@/lib/marketplace/permissions';
import { adminNavigation } from '@/lib/admin/navigation';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronDown,
  ClipboardCheck,
  PackageCheck,
  Store,
  LifeBuoy,
  Undo2,
  Wallet,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getAdminWorkSummary } from '@/lib/db/repositories/admin-workspace';
import { getSuperAdminMarketplaceSummary } from '@/lib/db/repositories/admin-marketplace-summary';
import { marketplaceSummaryPeriods, marketplaceSummaryRange, parseMarketplaceSummaryPeriod } from '@/lib/admin/marketplace-period';

export const dynamic = 'force-dynamic';
const count = new Intl.NumberFormat('en-NP');
const money = new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' });
const summaryObservedAt = () => Date.now();
export default async function AdminDashboardPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  let staff = await requireStaffPage('/admin','account.self.manage');
  const params = await searchParams;
  const contextParams=new URLSearchParams();for(const [key,value] of Object.entries(params??{}))if(typeof value==='string')contextParams.set(key,value);
  const returnTo='/admin'+(contextParams.size?'?'+contextParams.toString():'');
  const period = parseMarketplaceSummaryPeriod(params?.period);
  const now = summaryObservedAt();
  const range = marketplaceSummaryRange(period, now);
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const reader=await staffMutationGuard(database,staff.id,'account.self.manage',ReviewTaskConflict,staff.role);
  staff={...staff,role:reader.role,permissions:reader.permissions};
  const bindings=env as unknown as Record<string,string|undefined>,scope={...formHealthRuntimeScope(bindings),now},email=readEmailHealthRuntimeConfig(bindings,now),rawExpected=bindings.SYSTEM_HEALTH_EXPECTED_SINCE,expected=rawExpected&&/^\d+$/.test(rawExpected)?Number(rawExpected):NaN;
  const financeAllowed=can(staff,'payout.prepare')||can(staff,'refund.approve.standard');
  const [stats, marketplace] = await Promise.all([
    getAdminWorkSummary(database, staff.role, staff.permissions).catch(()=>null),
    staff.role === 'super_admin' ? getSuperAdminMarketplaceSummary(database, staff.role, now, period).catch(()=>null) : null,
  ]);
  // These source readers execute guard transactions; serialize them on the shared database connection.
  const reviewTasks=await readAdminReviewTasks(database,staff.id);
  const health=can(staff,'system.health.view')?await readSystemHealthWorkspace(database,staff.id,{...scope,expectedSince:email.expectedSince,systemExpectedSince:Number.isSafeInteger(expected)&&expected>0&&expected<=now?expected:null}).catch(()=>null):undefined;
  const finance=financeAllowed?await(async()=>readFinanceWorkItems(database,staff.id,resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN}),{returnTo,limit:100}))().catch(()=>null):undefined;
  const reviewDecisions=reviewTasks===null?null:await readRecentReviewDecisions(database,staff.id,reviewTasks,returnTo).catch(()=>null);
  const workItems=[...(reviewTasks??[]),...(finance?.items??[]).map(financeQueueItem)];
  const incompleteFinance=finance?.coverage.filter(row=>can(staff,row.family.startsWith('payout_')?'payout.prepare':'refund.approve.standard')&&row.state!=='available')??[];
  const partialSources=[...(reviewTasks===null?['Shared review records unavailable']:[]),...(finance===null?['Finance records unavailable']:incompleteFinance.map(row=>`${reviewTaskLabels[row.family]} ${row.state}`))];
  const recentDecisions=todayDecisionHistory(reviewDecisions,finance?.recentDecisions??[]);
  const legacyReview = ['reviewView','reviewQ','reviewDepartment','reviewType','reviewOwner','reviewPriority','reviewFrom','reviewTo','reviewPage']
    .some(key => contextParams.has(key));
  const today = params?.workspace === 'reviews' || legacyReview ? null : await readTodaySources({
    db: database, actor: staff, now, returnTo, tasks: workItems, financeDecisions: finance?.recentDecisions ?? [],
  });
  const queues = [
    {
      label: 'Seller applications',
      value: stats?.sellers??null,
      icon: Store,
      href: '/admin/sellers',
      description: 'New applications and reviews in progress',
    },
    {
      label: 'Product moderation',
      value: stats?.products??null,
      icon: ClipboardCheck,
      href: '/admin/products',
      description: 'Submitted listings and reviews in progress',
    },
    {
      label: 'Ready for dispatch',
      value: stats?.readyOrders??null,
      icon: PackageCheck,
      href: '/admin/orders',
      description: 'Orders with at least one ready seller allocation',
    },
    {
      label: 'Open returns',
      value: stats?.returns??null,
      icon: Undo2,
      href: '/admin/cases',
      description: 'Requests awaiting a final outcome',
    },
    {
      label: 'Open complaints',
      value: stats?.complaints??null,
      icon: LifeBuoy,
      href: '/admin/cases',
      description: 'Includes assigned and escalated cases',
    },
    {
      label: 'Payout requests',
      value: stats?.payoutRequests??null,
      icon: Wallet,
      href: '/admin/payouts',
      description: 'Seller requests awaiting preparation or rejection',
    },
  ];
  const tasks = adminNavigation(staff.role, staff.permissions);
  const visibleQueues = queues.filter(queue => tasks.some(task => task.href === queue.href)).sort((a,b) => (b.value??-1)-(a.value??-1));
  const hasPendingWork = visibleQueues.some(queue => (queue.value??0) > 0);
  // A partial source failure may show Unknown; loss of the page's original reader scope may not return old private summaries.
  await database.batch(reader.statements);
  const reviewQueue = <SharedReviewQueue tasks={workItems} actorId={staff.id} unavailable={reviewTasks===null&&!workItems.length} observedAt={now} partialSources={partialSources} sellerDirectoryAvailable={can(staff,'seller.application.review')}/>;
  if (params?.workspace === 'reviews') {
    return <div className="space-y-5"><AdminPageTitle><h1 className="section-title">Review tasks</h1></AdminPageTitle>{reviewQueue}</div>;
  }
  const reports = (
      <details data-operational-summary="true" open={params?.period === period} className="space-y-5 rounded-2xl border bg-card p-5">
      <summary className="min-h-11 cursor-pointer font-heading text-xl focus-visible:outline-2 focus-visible:outline-primary">Operational summaries and workspace links</summary>
      {staff.role==='super_admin'&&marketplace===null?<output className="block">Marketplace reporting is unavailable. Refresh the source before drawing a reporting conclusion.</output>:null}
      {staff.role === 'super_admin' && marketplace ? (
        <section className="space-y-5" aria-labelledby="marketplace-summary-heading">
          <div>
            <h2 id="marketplace-summary-heading" className="scroll-mt-28 font-heading text-2xl">Marketplace summary</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Each account is counted once, including accounts created through seller applications.
              Deleted accounts and configured test email domains are excluded.
            </p>
          </div>
          <details className="group w-fit max-w-full" key={period}>
            <summary className="admin-button cursor-pointer">
              Date period · {range.label}<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
            </summary>
            <nav aria-label="Marketplace summary period" aria-describedby="marketplace-period-description"
              className="mt-1 grid min-w-40 rounded-lg border bg-card p-1 text-sm">
              {marketplaceSummaryPeriods.map(option => {
                const query = new URLSearchParams(contextParams);
                query.set('period', option.value);
                return <Link key={option.value} href={'/admin?' + query.toString()}
                  aria-current={period === option.value ? 'page' : undefined} scroll={false} prefetch={false}
                  className="flex min-h-11 items-center rounded px-3 hover:bg-muted aria-[current=page]:bg-secondary aria-[current=page]:font-semibold">{option.label}</Link>;
              })}
            </nav>
          </details>
          <div className="space-y-1 text-sm leading-6 text-muted-foreground">
            <p id="marketplace-period-description">{range.description}</p>
            <p>Approval and review counts show the current status of sellers who signed up in this period.</p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Users registered', value: marketplace.users.total, detail: 'Accounts signed up in this period' },
              { label: 'Seller sign-ups', value: marketplace.sellers.total, detail: 'All stages, including Managed Makers' },
              { label: 'Approved sellers', value: marketplace.sellers.approved, detail: 'Profiles with approved status' },
              { label: 'Awaiting review', value: marketplace.sellers.pendingReview, detail: 'Submitted or under review' },
            ].map(item => (
              <div key={item.label} className="min-w-0 rounded-2xl border bg-card p-5">
                <dt className="text-sm font-medium text-muted-foreground">{item.label}</dt>
                <dd className="mt-2 break-words font-heading text-3xl tabular-nums">{count.format(item.value)}</dd>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </dl>
          <div className="min-w-0 rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading text-xl">Top 5 sellers</h3>
              <Badge variant="outline">{range.label}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Ranked by delivered product value, including orders awaiting payment. Refunds and commission are not deducted.
              Delivery and platform fees are excluded.
              {period !== 'all' ? ' Sales without a recorded delivery date appear under All time only.' : ''}
            </p>
            {marketplace.topSellers.length ? (
              <ol className="mt-4 divide-y" aria-label="Top sellers by delivered product sales">
                {marketplace.topSellers.map((seller, index) => (
                  <li key={seller.sellerId} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold tabular-nums" aria-label={`Rank ${index + 1}`}>{index + 1}</span>
                      <span className="min-w-0 pt-1 font-semibold [overflow-wrap:anywhere]">{seller.sellerName}</span>
                    </div>
                    <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 text-sm sm:min-w-80">
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">Delivered sales</dt><dd className="mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]">{money.format(seller.salesPaisa / 100)}</dd></div>
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">Orders</dt><dd className="mt-1 tabular-nums [overflow-wrap:anywhere]">{count.format(seller.orderCount)}</dd></div>
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">Items</dt><dd className="mt-1 tabular-nums [overflow-wrap:anywhere]">{count.format(seller.unitsDelivered)}</dd></div>
                    </dl>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-5 rounded-xl bg-muted/50 p-5 text-sm text-muted-foreground">{period === 'all' ? 'No delivered sales yet' : 'No delivered sales in this period'}</p>
            )}
          </div>
        </section>
      ) : null}
      <OverviewWorkSummaries tasks={workItems} observedAt={now} returnTo={returnTo} unavailableCategories={reviewTasks===null?['sellers','products','orders','system']:[]} partialCategories={reviewTasks===null||finance===null||incompleteFinance.length?['finance']:[]}/>
      {stats===null?<output className="block">Operational queue counts are unavailable. The independent review sources above retain their own availability.</output>:null}
      <section aria-labelledby="queue-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 id="queue-heading" className="font-heading text-2xl">
            {hasPendingWork ? 'Work needing attention' : 'Your work queues'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Current totals · open a queue to review
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {visibleQueues.map(({ label, value, icon: Icon, href, description }) => (
            <Link
              key={label}
              href={href === '/admin/sellers' && (value??0) > 0 ? '/admin/sellers?status=awaiting_review' : href}
              className="group rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon className="size-5" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3"><p className="font-heading text-3xl tabular-nums">{value??'Unavailable'}</p><Badge variant={(value??0) > 0 ? 'secondary' : 'outline'}>{value===null?'Not checked':value > 0 ? 'Needs review' : 'Nothing pending'}</Badge></div>
              <h3 className="mt-2 font-semibold">{label}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </Link>
          ))}
        </div>
      </section>
      {stats?.approvals ? (
        <section
          className="rounded-3xl border border-primary/20 bg-secondary/60 p-6"
          aria-labelledby="approval-heading"
        >
          <h2
            id="approval-heading"
            className="flex items-center gap-2 font-heading text-2xl"
          >
            <ShieldCheck className="size-5" />
            Pending confirmations
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Review Admin requests and existing pending records. Your Super Admin
            decisions apply directly, subject to validation and effective dates.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              {
                label: 'Payout approvals',
                value: stats.approvals.payouts,
                href: '/admin/payouts',
              },
              {
                label: 'High-value refunds',
                value: stats.approvals.highValueRefunds,
                href: '/admin/cases',
              },
              {
                label: 'Promotion approvals',
                value: stats.approvals.promotions,
                href: '/admin/governance',
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4 text-sm font-semibold hover:border-primary/40"
              >
                <span>{item.label}</span>
                <span className="text-xl tabular-nums">{item.value}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border bg-card p-5 text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground">Your Admin access:</strong> your available queues reflect the effective permissions assigned to you.
          High-value refund decisions, payout approvals, and staff access remain
          with Super Admins.
        </p>
      )}
      <details className="rounded-2xl border bg-card p-5">
        <summary className="min-h-7 cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-primary">All workspace tasks</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tasks.map(task => <Link key={task.href} href={task.href} className="flex min-h-11 flex-col gap-1 rounded-xl border p-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"><span className="font-semibold">{task.label}</span><span className="text-xs leading-5 text-muted-foreground">{task.description}</span></Link>)}</div>
      </details>
      <Card>
        <CardHeader>
          <CardTitle>Before you decide</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 text-sm leading-6 text-muted-foreground lg:grid-cols-3">
          <p>
            <strong className="text-foreground">Check the evidence.</strong>{' '}
            Review the relevant documents, item allocation, and policy snapshot.
          </p>
          <p>
            <strong className="text-foreground">Explain the outcome.</strong>{' '}
            Add useful notes for the next operator and the retained audit
            history.
          </p>
          <p>
            <strong className="text-foreground">
              {staff.role === 'super_admin' ? 'Record the final decision.' : 'Request confirmation.'}
            </strong>{' '}
            {staff.role === 'super_admin'
              ? 'Your Super Admin decisions apply directly. Payment processing remains a separate step.'
              : 'Submit requests for Super Admin confirmation when required.'}
          </p>
        </CardContent>
      </Card>
      </details>
  );
  if (!today) {
    return <div className="space-y-5"><AdminPageTitle><h1 className="section-title">Review tasks</h1></AdminPageTitle>{reviewQueue}{reports}</div>;
  }
  const cases = can(staff,'support.manage') ? stats ? stats.returns + stats.complaints : null : undefined;
  const auditHref = tasks.find(task => task.href === '/admin/activity')?.href;
  const checks = health ? overviewHealthChecks(health) : health;
  return <div className="space-y-8">
    <OverviewHealthProvider key={staff.id} actorId={staff.id} initial={checks}>
      <TodayOverview actorId={staff.id} firstName={staff.displayName.trim().split(/\s+/)[0]} observedAt={now}
        returnTo={returnTo} tasks={today.rows} partialSources={[...partialSources, ...today.partial]}
        metrics={<TodayWorkSummaries orders={today.orders} courierCash={today.courierCash} cases={cases} checks={checks}/>}
        sidebar={<aside className="today-sidebar" aria-label="Operations updates">
          <OverviewOrdersByStage orders={today.orders}/>
          <OverviewHealth checks={checks} returnTo={returnTo}/>
          <OverviewRecentDecisions decisions={recentDecisions} partial={reviewDecisions===null||financeAllowed} actorId={staff.id} auditHref={auditHref}/>
        </aside>}/>
    </OverviewHealthProvider>
    {reports}
  </div>;
}
