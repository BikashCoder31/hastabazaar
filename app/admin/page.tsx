import { redirect } from 'next/navigation';
import { can } from '@/lib/marketplace/permissions';
import { adminNavigation } from '@/lib/admin/navigation';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import {
  ArrowRight,
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

export const dynamic = 'force-dynamic';
export default async function AdminDashboardPage() {
  const staff = await requireStaffPage('/admin');
  if (!can(staff, 'audit_log.view')) redirect(adminNavigation(staff.role, staff.permissions)[0]?.href ?? '/staff-access-denied');
  const stats = await getAdminWorkSummary(
    requireDatabase(env as unknown as { DB?: D1Database }),
    staff.role,
    staff.permissions,
  );
  const queues = [
    {
      label: 'Seller applications',
      value: stats.sellers,
      icon: Store,
      href: '/admin/sellers',
      description: 'New applications and reviews in progress',
    },
    {
      label: 'Product moderation',
      value: stats.products,
      icon: ClipboardCheck,
      href: '/admin/products',
      description: 'Submitted listings and reviews in progress',
    },
    {
      label: 'Ready for dispatch',
      value: stats.readyOrders,
      icon: PackageCheck,
      href: '/admin/orders',
      description: 'Orders with at least one ready seller allocation',
    },
    {
      label: 'Open returns',
      value: stats.returns,
      icon: Undo2,
      href: '/admin/cases',
      description: 'Requests awaiting a final outcome',
    },
    {
      label: 'Open complaints',
      value: stats.complaints,
      icon: LifeBuoy,
      href: '/admin/cases',
      description: 'Includes assigned and escalated cases',
    },
    {
      label: 'Payout requests',
      value: stats.payoutRequests,
      icon: Wallet,
      href: '/admin/payouts',
      description: 'Seller requests awaiting preparation or rejection',
    },
  ];
  const tasks = adminNavigation(staff.role, staff.permissions);
  const visibleQueues = queues.filter(queue => tasks.some(task => task.href === queue.href)).sort((a,b) => b.value-a.value);
  const hasPendingWork = visibleQueues.some(queue => queue.value > 0);
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="eyebrow">Operations overview</p>
            <h1 className="mt-3 font-heading text-3xl tracking-tight sm:text-4xl">
              Welcome back, {staff.displayName}.
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
              Keep the marketplace moving. Review your queues, follow up on
              customer cases, and leave a clear record of every decision.
            </p>
          </div>
          <ShieldCheck className="size-10 text-primary" aria-hidden="true" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {can(staff, 'order.manage') && <Link
            href="/admin/orders"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Manage orders <ArrowRight className="size-4" />
          </Link>}
          <Link
            href="/admin/analytics"
            className="inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold hover:bg-muted"
          >
            View reports
          </Link>
          {can(staff, 'support.manage') ? <Link
            href="/admin/feedback"
            className="inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold hover:bg-muted"
          >Contact and feedback</Link> : null}
        </div>
      </section>
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
              href={href === '/admin/sellers' && value > 0 ? '/admin/sellers?status=awaiting_review' : href}
              className="group rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon className="size-5" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3"><p className="font-heading text-3xl tabular-nums">{value}</p><Badge variant={value > 0 ? 'secondary' : 'outline'}>{value > 0 ? 'Needs review' : 'Nothing pending'}</Badge></div>
              <h3 className="mt-2 font-semibold">{label}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </Link>
          ))}
        </div>
      </section>
      {stats.approvals ? (
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
    </div>
  );
}
