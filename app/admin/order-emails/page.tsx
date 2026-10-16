import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { ChevronRight, Mail, AlertCircle } from 'lucide-react';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  emailQueueSummary,
  listOrderEmailHistory,
  type OrderEmailHistoryRow,
} from '@/lib/operations/email-queue';
import { orderProgress } from '@/lib/orders/progress';
import { OrderEmailRetry } from '@/components/admin/order-email-retry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import {
  emailQueueStatuses,
  emailQueueStatusLabels,
  queuePageHref,
} from '@/lib/admin/queue-filters';
import {
  loadQueryPresentationConfig,
  queryFieldPresentation,
} from '@/lib/catalog/shop-query';
import {
  orderEmailExpiryHours,
  orderEmailReasonLabel,
} from '@/lib/email/order-update-policy';
import { maximumEmailAttempts } from '@/lib/email/retry-policy';

export const dynamic = 'force-dynamic';
const queueObservedAt = () => Date.now();
const emailTime = (value: number) =>
  new Date(value).toLocaleString('en-NP', {
    timeZone: 'Asia/Kathmandu',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
function nextAction(job: OrderEmailHistoryRow, now: number) {
  if (job.displayStatus === 'skipped')
    return job.status === 'cancelled'
      ? 'No send needed'
      : 'Will be skipped by the next queue run';
  if (job.status === 'sent')
    return job.sentAt ? 'Accepted ' + emailTime(job.sentAt) : 'No send needed';
  if (job.status === 'sending' && job.leaseUntil > now)
    return 'Wait until ' + emailTime(job.leaseUntil);
  if (job.attempts >= maximumEmailAttempts)
    return 'Review email settings or provider health';
  const next = Math.max(job.nextAttemptAt, job.leaseUntil);
  return next > now
    ? 'Eligible ' + emailTime(next)
    : 'Ready for the next sender run';
}
function statusLabel(job: OrderEmailHistoryRow, now: number) {
  if (job.displayStatus === 'skipped' && job.status !== 'cancelled')
    return 'Will be skipped';
  if (
    ['queued', 'retry', 'sending'].includes(job.displayStatus) &&
    job.attempts >= maximumEmailAttempts &&
    job.leaseUntil <= now
  )
    return 'Needs review';
  return emailQueueStatusLabels[job.displayStatus] ?? job.displayStatus;
}

export default async function OrderEmails({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireStaffPage('/admin/order-emails', 'order.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database }),
    now = queueObservedAt();
  const [history, summary, presentation] = await Promise.all([
    listOrderEmailHistory(db, (await searchParams) ?? {}, now),
    emailQueueSummary(db, now),
    loadQueryPresentationConfig(db, 'staff.order-email-filter'),
  ]);
  const search = queryFieldPresentation(
    'staff.order-email-filter',
    presentation.config,
    'q',
    { label: 'Order reference', placeholder: 'Search by order number' },
  );
  const status = queryFieldPresentation(
    'staff.order-email-filter',
    presentation.config,
    'status',
    { label: 'Email status' },
  );
  const metrics = [
    {
      label: 'Ready to send',
      value: summary.due ?? 0,
      detail: 'Eligible now',
      status: 'ready',
    },
    {
      label: 'Waiting to retry',
      value: summary.retryWaiting ?? 0,
      detail: 'Below the attempt limit',
      status: 'retry',
    },
    {
      label: 'Needs review',
      value: summary.exhausted ?? 0,
      detail: 'Attempt limit reached',
      status: 'needs_review',
    },
    {
      label: 'Oldest pending',
      value: summary.pending ? `${summary.oldestAgeMinutes} min` : '—',
      detail: summary.pending ? 'Time since queued' : 'No pending emails',
      status: '',
    },
    {
      label: 'Excluded from sending',
      value: summary.skipped ?? 0,
      detail: `${summary.expired ?? 0} expired · reasons below`,
      status: 'skipped',
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header>
        <p className="eyebrow">Customer communication</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">
          Order emails
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Check queued customer updates and their outcomes. Unsent updates
          expire after {orderEmailExpiryHours} hours; earlier order statuses are
          skipped.
        </p>
      </header>
      <section
        aria-label="Email queue summary"
        className="grid grid-cols-2 gap-3 lg:grid-cols-5"
      >
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="min-w-0 rounded-xl border bg-card p-4"
          >
            <p className="text-sm font-medium text-muted-foreground">
              {metric.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {metric.value}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {metric.detail}
            </p>
            {metric.status ? (
              <Link
                href={queuePageHref('/admin/order-emails', {
                  status: metric.status,
                })}
                className="mt-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                View emails
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </div>
        ))}
      </section>
      {(summary.exhausted ?? 0) > 0 ||
      ((summary.pending ?? 0) > 0 && summary.oldestAgeMinutes > 15) ||
      (summary.expiredLeases ?? 0) > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm leading-6">
          <AlertCircle
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 text-primary"
          />
          <p>
            Check messages waiting longer than 15 minutes and recurring
            failures.{' '}
            {summary.expiredLeases
              ? `${summary.expiredLeases} sending ${summary.expiredLeases === 1 ? 'lock has' : 'locks have'} expired. `
              : ''}
            If the queue is not moving, verify the scheduled sender and email
            settings. Exhausted attempts need staff review.
          </p>
        </div>
      ) : null}
      <OrderEmailRetry readyCount={summary.due ?? 0} />
      <section
        className="overflow-hidden rounded-xl border bg-card"
        aria-labelledby="email-history-title"
      >
        <div className="border-b p-4 sm:p-5">
          <h2 id="email-history-title" className="font-heading text-xl">
            Email history
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Search all recorded updates, including those on other pages. Times
            use Nepal time.
          </p>
          <form
            key={JSON.stringify(history.filters)}
            data-form-id="staff.order-email-filter"
            method="GET"
            action="/admin/order-emails"
            className="mt-4 flex flex-col gap-4"
          >
            <FieldGroup className="grid items-start gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)]">
              <Field className="min-w-0">
                <FieldLabel htmlFor="email-order-search">
                  {search.label}
                </FieldLabel>
                <Input
                  id="email-order-search"
                  type="search"
                  name="q"
                  maxLength={120}
                  defaultValue={history.filters.q}
                  placeholder={search.placeholder}
                  aria-describedby={
                    search.helpText ? 'email-order-search-help' : undefined
                  }
                />
                {search.helpText ? (
                  <FieldDescription id="email-order-search-help">
                    {search.helpText}
                  </FieldDescription>
                ) : null}
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor="email-status">{status.label}</FieldLabel>
                <NativeSelect
                  id="email-status"
                  name="status"
                  defaultValue={history.filters.status || 'all'}
                  aria-describedby={
                    status.helpText ? 'email-status-help' : undefined
                  }
                  className="w-full"
                >
                  <NativeSelectOption value="all">
                    All statuses
                  </NativeSelectOption>
                  {emailQueueStatuses.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {emailQueueStatusLabels[value]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {status.helpText ? (
                  <FieldDescription id="email-status-help">
                    {status.helpText}
                  </FieldDescription>
                ) : null}
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
              {history.filters.q || history.filters.status ? (
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  nativeButton={false}
                  render={<Link href="/admin/order-emails" />}
                >
                  Clear filters
                </Button>
              ) : null}
              <Button type="submit" className="flex-1 sm:flex-none">
                Apply filters
              </Button>
            </div>
          </form>
          {presentation.unavailable ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Filter labels could not load. Standard filters remain available.
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">
            {history.total} matching{' '}
            {history.total === 1 ? 'update' : 'updates'} · Page {history.page}{' '}
            of {history.pageCount}
          </p>
        </div>
        {history.jobs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="sr-only">
                Order email records and reasons for skipped messages
              </caption>
              <thead className="border-b bg-muted/30 text-muted-foreground">
                <tr>
                  {[
                    'Order',
                    'Update / queued time',
                    'Email status',
                    'Attempts',
                    'Outcome / reason',
                    'Next action (Nepal time)',
                  ].map((heading) => (
                    <th
                      scope="col"
                      className={
                        heading === 'Attempts' ? 'whitespace-nowrap p-4' : 'p-4'
                      }
                      key={heading}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="p-4 font-semibold">
                      <Link
                        className="inline-flex min-h-11 items-center underline underline-offset-4"
                        href={`/admin/orders/${encodeURIComponent(job.orderId)}`}
                      >
                        {job.orderNumber}
                      </Link>
                    </td>
                    <td className="p-4">
                      <p>{orderProgress(job.orderStatus).label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {emailTime(job.createdAt)}
                      </p>
                    </td>
                    <td className="p-4">
                      <Badge
                        variant="outline"
                        className={
                          job.displayStatus === 'sent'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : job.displayStatus === 'skipped'
                              ? 'bg-muted text-muted-foreground'
                              : job.attempts >= maximumEmailAttempts
                                ? 'border-amber-200 bg-amber-50 text-amber-900'
                                : 'border-primary/20 bg-primary/5 text-primary'
                        }
                      >
                        {statusLabel(job, now)}
                      </Badge>
                    </td>
                    <td className="p-4 tabular-nums">
                      {job.attempts} / {maximumEmailAttempts}
                    </td>
                    <td className="min-w-40 p-4">
                      <p>
                        {orderEmailReasonLabel(
                          job.skipReason ?? job.failureCode,
                        ) ??
                          (job.status === 'sent'
                            ? 'Accepted by mail server'
                            : '—')}
                      </p>
                      {job.skipReason === 'obsolete_order_state' ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Current order:{' '}
                          {orderProgress(job.currentStatus).label}
                        </p>
                      ) : null}
                    </td>
                    <td className="min-w-44 p-4 text-muted-foreground">
                      {nextAction(job, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Mail aria-hidden="true" className="size-7 text-muted-foreground" />
            <h3 className="font-semibold">
              {history.filters.q || history.filters.status
                ? 'No matching emails'
                : 'No order emails yet'}
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {history.filters.q || history.filters.status
                ? 'Try another order reference or status, or clear the filters.'
                : 'New order updates will appear here when orders progress.'}
            </p>
          </div>
        )}
        {history.pageCount > 1 ? (
          <nav
            aria-label="Email history pages"
            className="flex items-center justify-between gap-3 border-t p-4"
          >
            {history.page > 1 ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link
                    href={queuePageHref(
                      '/admin/order-emails',
                      history.filters,
                      history.page - 1,
                    )}
                  />
                }
              >
                Previous
              </Button>
            ) : (
              <span />
            )}
            {history.page < history.pageCount ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link
                    href={queuePageHref(
                      '/admin/order-emails',
                      history.filters,
                      history.page + 1,
                    )}
                  />
                }
              >
                Next
              </Button>
            ) : null}
          </nav>
        ) : null}
      </section>
      <p className="text-sm leading-6 text-muted-foreground">
        “Mail server accepted” does not confirm inbox delivery or that the
        customer read the message. “Will be skipped” records are already
        excluded from sending; the next queue run records the final reason.
      </p>
      <details className="group rounded-xl border bg-card p-4">
        <summary className="flex min-h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-md py-2 pr-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          Email statuses and troubleshooting
        </summary>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          {[
            ['Queued', 'Waiting for an eligible sender run.'],
            [
              'Sending',
              'An active sender has a 15-minute lock. Wait while it is active.',
            ],
            [
              'Waiting to retry',
              'A failed attempt waits 5, 10, 20 or 40 minutes before another attempt. Sending stops after five attempts.',
            ],
            [
              'Needs review',
              'The attempt limit is reached. Check email settings and provider health.',
            ],
            [
              'Skipped: order moved ahead',
              'The order is now in a different status, so the older update is not sent.',
            ],
            [
              'Skipped: update too old',
              `The update reached the ${orderEmailExpiryHours}-hour limit. Its record and reason are retained.`,
            ],
          ].map(([term, definition]) => (
            <div key={term} className="rounded-lg bg-muted/30 p-3">
              <dt className="font-semibold">{term}</dt>
              <dd className="mt-1 leading-6 text-muted-foreground">
                {definition}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
          A failed email does not undo an order. Expired sending locks may be
          picked up again. If the server accepted a message but success was not
          recorded, a retry can send it again; check the latest outcome before a
          manual attempt.
        </p>
      </details>
    </div>
  );
}
