import type { ReactNode } from 'react';
import { incentiveMoney, incentiveDate } from '@/lib/incentives/presentation';
import {
  INCENTIVE_REPORT_PAGE_SIZE,
  type PromoAdminReport,
  type LoyaltyAdminReport,
  type ReportWindow,
  type IncentiveHistoryRow,
  type LoyaltyRecordedCycle,
} from '@/lib/incentives/reporting';

const field =
  'mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm';
const action =
  'inline-flex min-h-11 items-center justify-center rounded-xl border bg-card px-4 text-sm font-semibold hover:bg-secondary';
const number = (value: number) => value.toLocaleString('en-NP');
function reportHref(
  path: string,
  window: ReportWindow,
  patch: Record<string, string | number> = {},
  anchor = 'activity',
) {
  const params = new URLSearchParams();
  for (const key of [
    'query',
    'from',
    'to',
    'page',
    'historyPage',
    'customerPage',
  ] as const)
    if (window[key]) params.set(key, String(window[key]));
  for (const [key, value] of Object.entries(patch))
    params.set(key, String(value));
  return `${path}?${params}#${anchor}`;
}
function Metrics({
  items,
}: {
  items: { label: string; value: string; note: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article key={item.label} className="rounded-2xl border bg-card p-5">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {item.label}
          </h3>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {item.value}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {item.note}
          </p>
        </article>
      ))}
    </div>
  );
}
export function IncentivePageNav({ loyalty = false }: { loyalty?: boolean }) {
  return (
    <nav aria-label="Page sections" className="flex flex-wrap gap-2">
      {[
        ['#overview', 'Overview'],
        ['#manage', 'Manage rules'],
        ['#cost-preview', 'Cost preview'],
        ...(loyalty ? [['#customers', 'Customer balances']] : []),
        ['#activity', 'Activity'],
        ['#history', 'Change history'],
      ].map(([href, label]) => (
        <a key={href} href={href} className={action}>
          {label}
        </a>
      ))}
    </nav>
  );
}
export function PromoReportOverview({ report }: { report: PromoAdminReport }) {
  const t = report.totals;
  return (
    <section
      id="overview"
      className="scroll-mt-28 space-y-4"
      aria-label="Promo overview"
    >
      <div>
        <h2 className="text-xl font-semibold">Campaign overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          All campaigns · current published budgets ·{' '}
          {incentiveDate(report.observedAt)} Nepal time
        </p>
      </div>
      <Metrics
        items={[
          {
            label: 'Active campaigns',
            value: number(t.active),
            note: `${number(t.campaigns)} campaigns in total. Dates and remaining limits apply.`,
          },
          {
            label: 'Campaigns with drafts',
            value: number(t.drafts),
            note: 'Saved changes take effect after publication.',
          },
          {
            label: 'Recorded uses',
            value: number(t.usedCount),
            note: 'Consumed uses remain recorded after cancellation or refunds.',
          },
          {
            label: 'Consumed discount budget',
            value: incentiveMoney(t.spentPaisa),
            note: 'Original recorded discounts; this is not completed-order revenue.',
          },
          {
            label: 'Published budget',
            value: incentiveMoney(t.publishedBudgetPaisa),
            note: 'Current published lifetime limits across all campaigns.',
          },
          {
            label: 'Unspent published budget',
            value: incentiveMoney(t.remainingBudgetPaisa),
            note: 'Includes paused and expired campaigns; availability still depends on their rules.',
          },
        ]}
      />
    </section>
  );
}
export function LoyaltyReportOverview({
  report,
}: {
  report: LoyaltyAdminReport;
}) {
  const t = report.totals,
    terms = report.liveTerms;
  const status = !terms.enabled
    ? 'Earning is paused'
    : terms.paused
      ? 'Earning is paused'
      : terms.startsAt !== null && report.observedAt < terms.startsAt
        ? 'Scheduled'
        : terms.endsAt !== null && report.observedAt >= terms.endsAt
          ? 'Ended'
          : 'Active';
  return (
    <section
      id="overview"
      className="scroll-mt-28 space-y-4"
      aria-label="Loyalty overview"
    >
      <div>
        <h2 className="text-xl font-semibold">Rewards overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          All reward accounts · recorded totals ·{' '}
          {incentiveDate(report.observedAt)} Nepal time
        </p>
      </div>
      <Metrics
        items={[
          {
            label: 'Customers claiming today',
            value: number(t.claimedToday),
            note: 'Unique claimants in the current Nepal calendar day.',
          },
          {
            label: 'Reward accounts',
            value: number(t.customers),
            note: `${number(t.claims)} daily claims recorded in total.`,
          },
          {
            label: 'Points issued',
            value: number(t.issuedPoints),
            note: 'Cumulative points awarded from recorded claims.',
          },
          {
            label: 'Points redeemed',
            value: number(t.redeemedPoints),
            note: `${number(t.redemptions)} conversions into wallet credit.`,
          },
          {
            label: 'Outstanding points',
            value: number(t.outstandingPoints),
            note: 'Unredeemed points. Whole-block redemption rules apply.',
          },
          {
            label: 'Wallet credit issued',
            value: incentiveMoney(t.creditedPaisa),
            note: 'Cumulative credit converted from points; not an unused wallet balance.',
          },
        ]}
      />
      <div className="rounded-2xl border bg-card p-5 text-sm leading-6">
        <p className="font-semibold">{status}</p>
        <p>
          {terms.weeklyPoints
            ? 'Published seven-day rewards'
            : `Saved schedule: fixed daily rewards · ${number(terms.dailyPoints)} points per claim`}{' '}
          · {number(terms.pointsPerBlock)} points ={' '}
          {incentiveMoney(terms.creditPaisaPerBlock)}
        </p>
        {terms.weeklyPoints ? (
          <div className="mt-3 space-y-2">
            <ol
              className="grid gap-2 sm:grid-cols-4 xl:grid-cols-7"
              aria-label="Published seven-day rewards"
            >
              {terms.weeklyPoints.map((points, day) => (
                <li
                  key={day}
                  className="rounded-lg border bg-background p-2 text-center"
                >
                  Day {day + 1}: {number(points)} points
                </li>
              ))}
            </ol>
            <p className="text-muted-foreground">
              Day 7 completes the cycle; the next claim starts at Day 1.{' '}
              {terms.graceEnabled
                ? 'Grace enabled: one missed Nepal day per cycle. Missed days earn no points.'
                : 'Grace disabled: a missed Nepal day restarts the next claim at Day 1.'}
            </p>
          </div>
        ) : null}
        <p className="text-muted-foreground">
          Daily points limit:{' '}
          {terms.dailyBudgetPoints === null
            ? 'Not set'
            : number(terms.dailyBudgetPoints)}{' '}
          · Total points limit:{' '}
          {terms.lifetimeBudgetPoints === null
            ? 'Not set'
            : number(terms.lifetimeBudgetPoints)}
        </p>
        <p className="text-muted-foreground">
          {terms.startsAt === null
            ? 'Start date: not set'
            : `From ${incentiveDate(terms.startsAt)}`}{' '}
          ·{' '}
          {terms.endsAt === null
            ? 'End date: not set'
            : `Until ${incentiveDate(terms.endsAt)}`}{' '}
          · Nepal time
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {terms.revision === 0
            ? 'No reward rules have been published yet. These are the saved starting settings.'
            : 'These are the last published reward rules.'}{' '}
          To activate the weekly schedule or other changes, save a draft and
          publish it. Selecting a schedule in the editor only updates the
          preview.
        </p>
      </div>
    </section>
  );
}
function ReportFilters({
  path,
  window,
  loyalty = false,
}: {
  path: string;
  window: ReportWindow;
  loyalty?: boolean;
}) {
  const prefix = loyalty ? 'loyalty-report' : 'promo-report';
  return (
    <form
      data-form-id={
        loyalty ? 'staff.loyalty-report-filter' : 'staff.promo-report-filter'
      }
      action={path + '#activity'}
      className="grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <label htmlFor={prefix + '-query'} className="text-sm font-medium">
        {loyalty ? 'Customer search' : 'Code, order or customer'}
        <input
          id={prefix + '-query'}
          name="query"
          maxLength={100}
          defaultValue={window.query}
          className={field}
          placeholder={
            loyalty ? 'Name, email or customer ID' : 'Search recorded activity'
          }
        />
      </label>
      <label htmlFor={prefix + '-from'} className="text-sm font-medium">
        From (Nepal date)
        <input
          id={prefix + '-from'}
          name="from"
          type="date"
          defaultValue={window.from}
          className={field}
        />
      </label>
      <label htmlFor={prefix + '-to'} className="text-sm font-medium">
        Through (Nepal date)
        <input
          id={prefix + '-to'}
          name="to"
          type="date"
          defaultValue={window.to}
          className={field}
        />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <button
          className={action + ' bg-primary text-primary-foreground'}
          type="submit"
        >
          Apply filters
        </button>
        <a href={path + '#activity'} className={action}>
          Reset
        </a>
      </div>
    </form>
  );
}
function ReportPagination({
  path,
  window,
  count,
  kind = 'page',
  anchor = 'activity',
}: {
  path: string;
  window: ReportWindow;
  count: number;
  kind?: 'page' | 'historyPage' | 'customerPage';
  anchor?: string;
}) {
  const page = window[kind],
    start = count === 0 ? 0 : (page - 1) * INCENTIVE_REPORT_PAGE_SIZE + 1,
    end = Math.min(count, page * INCENTIVE_REPORT_PAGE_SIZE);
  return (
    <nav
      aria-label={`${anchor} pagination`}
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-muted-foreground">
        {count === 0
          ? '0 records'
          : start > count
            ? 'No records on this page'
            : `${number(start)}–${number(end)} of ${number(count)} records`}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <a
            className={action}
            href={reportHref(path, window, { [kind]: page - 1 }, anchor)}
          >
            Previous
          </a>
        ) : null}
        {page * INCENTIVE_REPORT_PAGE_SIZE < count ? (
          <a
            className={action}
            href={reportHref(path, window, { [kind]: page + 1 }, anchor)}
          >
            Next
          </a>
        ) : null}
      </div>
    </nav>
  );
}
function Table({
  label,
  headers,
  children,
}: {
  label: string;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to focus and scroll the overflowing table region.
      tabIndex={0}
      className="overflow-x-auto rounded-xl border focus-visible:outline-2 focus-visible:outline-primary"
    >
      <table className="w-full min-w-[850px] border-collapse text-left text-sm">
        <caption className="sr-only">{label}</caption>
        <thead className="bg-secondary/50">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="whitespace-nowrap px-4 py-3 font-semibold"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </section>
  );
}
const cell = 'px-4 py-4 align-top';
export function PromoActivityReport({ report }: { report: PromoAdminReport }) {
  const path = '/admin/promo-codes';
  return (
    <section
      id="activity"
      aria-label="Promo activity"
      className="scroll-mt-28 space-y-4 rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            Order-wise discount activity
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {number(report.activityCount)} matching uses ·{' '}
            {incentiveMoney(report.filteredDiscountPaisa)} original discounts
            recorded
          </p>
        </div>
        <a
          className={action}
          href={reportHref(
            '/api/admin/promo-codes/report',
            report.window,
            { format: 'csv' },
            '',
          )}
        >
          Export this page (CSV)
        </a>
      </div>
      <ReportFilters path={path} window={report.window} />
      <p className="text-xs leading-5 text-muted-foreground">
        Amounts use the original order and redemption snapshots. Snapshot
        commission is not proof of earned or settled income. Cancellations and
        refunds do not restore campaign usage or consumed budget.
      </p>
      <Table
        label="Promo order activity"
        headers={[
          'Order / campaign',
          'Customer',
          'Product subtotal',
          'Recorded discount',
          'Snapshot commission',
          'Order / payment',
          'Used (Nepal time)',
        ]}
      >
        {report.activity.map((row) => (
          <tr key={row.id}>
            <td className={cell}>
              <a
                className="font-semibold text-primary underline"
                href={'/admin/orders/' + encodeURIComponent(row.orderId)}
              >
                {row.orderNumber}
              </a>
              <p className="mt-1 font-medium">{row.code}</p>
              <p className="text-xs text-muted-foreground">
                {row.label} · revision {row.revision}
              </p>
            </td>
            <td className={cell}>
              <p>{row.customerName}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.customerEmail}
              </p>
            </td>
            <td className={cell + ' whitespace-nowrap tabular-nums'}>
              {incentiveMoney(row.subtotalPaisa)}
            </td>
            <td className={cell + ' whitespace-nowrap tabular-nums'}>
              {incentiveMoney(row.discountPaisa)}
            </td>
            <td className={cell + ' whitespace-nowrap tabular-nums'}>
              {incentiveMoney(row.commissionPaisa)}
            </td>
            <td className={cell}>
              <p className="font-medium">{row.orderStatus}</p>
              <p className="text-xs text-muted-foreground">
                {row.paymentStatus}
              </p>
            </td>
            <td className={cell + ' whitespace-nowrap'}>
              {incentiveDate(row.createdAt)}
            </td>
          </tr>
        ))}
        {!report.activity.length ? (
          <tr>
            <td colSpan={7} className="p-8 text-center text-muted-foreground">
              No promo uses match these filters.
            </td>
          </tr>
        ) : null}
      </Table>
      <ReportPagination
        path={path}
        window={report.window}
        count={report.activityCount}
      />
    </section>
  );
}
export function LoyaltyActivityReport({
  report,
}: {
  report: LoyaltyAdminReport;
}) {
  const path = '/admin/loyalty';
  return (
    <div className="space-y-6">
      <section
        id="activity"
        aria-label="Loyalty activity"
        className="scroll-mt-28 space-y-4 rounded-2xl border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Reward transactions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily claims and points converted into wallet credit.
            </p>
          </div>
          <a
            className={action}
            href={reportHref(
              '/api/admin/loyalty/report',
              report.window,
              { format: 'csv' },
              '',
            )}
          >
            Export this page (CSV)
          </a>
        </div>
        <ReportFilters path={path} window={report.window} loyalty />
        <Table
          label="Loyalty reward transactions"
          headers={[
            'Customer',
            'Activity',
            'Points',
            'Wallet credit issued',
            'Rule revision',
            'Recorded cycle',
            'Recorded (Nepal time)',
          ]}
        >
          {report.activity.map((row) => (
            <tr key={row.kind + row.id}>
              <td className={cell}>
                <a
                  className="font-semibold text-primary underline"
                  href={reportHref(
                    path,
                    report.window,
                    { query: row.customerId, page: 1, customerPage: 1 },
                    'customers',
                  )}
                >
                  {row.customerName}
                </a>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.customerEmail}
                </p>
              </td>
              <td className={cell}>
                {row.kind === 'daily_claim'
                  ? 'Daily claim'
                  : 'Points redemption'}
              </td>
              <td className={cell + ' tabular-nums'}>
                {row.points > 0 ? '+' : ''}
                {number(row.points)}
              </td>
              <td className={cell + ' whitespace-nowrap'}>
                {row.creditPaisa === 0 ? '—' : incentiveMoney(row.creditPaisa)}
              </td>
              <td className={cell}>{row.revision}</td>
              <td className={cell}>
                {row.cycle ? (
                  <RecordedCycle cycle={row.cycle} />
                ) : row.kind === 'daily_claim' ? (
                  'Fixed daily reward'
                ) : (
                  '—'
                )}
              </td>
              <td className={cell + ' whitespace-nowrap'}>
                {incentiveDate(row.createdAt)}
              </td>
            </tr>
          ))}
          {!report.activity.length ? (
            <tr>
              <td colSpan={7} className="p-8 text-center text-muted-foreground">
                No reward transactions match these filters.
              </td>
            </tr>
          ) : null}
        </Table>
        <ReportPagination
          path={path}
          window={report.window}
          count={report.activityCount}
        />
      </section>
      <section
        id="customers"
        aria-label="Loyalty customer balances"
        className="scroll-mt-28 space-y-4 rounded-2xl border bg-card p-5 sm:p-6"
      >
        <div>
          <h2 className="text-xl font-semibold">Customer balances</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Current balances matching customer search. Date filters apply to
            transactions and change history.
          </p>
        </div>
        <Table
          label="Current loyalty customer balances"
          headers={[
            'Customer',
            'Available points',
            'Daily claims',
            'Points redeemed',
            'Wallet balance (all sources)',
            'Latest reward activity',
            'Latest recorded cycle',
          ]}
        >
          {report.customers.map((row) => (
            <tr key={row.id}>
              <td className={cell}>
                <p className="font-semibold">{row.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.email}
                </p>
                <p className="text-xs text-muted-foreground">{row.id}</p>
              </td>
              <td className={cell + ' tabular-nums'}>
                {number(row.balancePoints)}
              </td>
              <td className={cell + ' tabular-nums'}>{number(row.claims)}</td>
              <td className={cell + ' tabular-nums'}>
                {number(row.redeemedPoints)}
              </td>
              <td className={cell + ' whitespace-nowrap'}>
                {incentiveMoney(row.walletBalancePaisa)}
              </td>
              <td className={cell + ' whitespace-nowrap'}>
                {row.lastActivityAt === null
                  ? 'No activity'
                  : incentiveDate(row.lastActivityAt)}
              </td>
              <td className={cell}>
                {row.recordedCycle ? (
                  <RecordedCycle cycle={row.recordedCycle} />
                ) : (
                  'No weekly cycle recorded'
                )}
              </td>
            </tr>
          ))}
          {!report.customers.length ? (
            <tr>
              <td colSpan={7} className="p-8 text-center text-muted-foreground">
                No reward accounts match this search.
              </td>
            </tr>
          ) : null}
        </Table>
        <p className="text-xs leading-5 text-muted-foreground">
          Wallet balances can include referrals and gift cards as well as
          loyalty conversions. They are separate from outstanding points. Cycle
          positions describe the latest recorded claim, not today&apos;s reward
          eligibility.
        </p>
        <ReportPagination
          path={path}
          window={report.window}
          count={report.customerCount}
          kind="customerPage"
          anchor="customers"
        />
      </section>
    </div>
  );
}
function RecordedCycle({ cycle }: { cycle: LoyaltyRecordedCycle }) {
  const reason =
    cycle.resetReason === 'first_claim'
      ? 'First weekly claim'
      : cycle.resetReason === 'missed_day'
        ? 'Reset after a missed day'
        : cycle.resetReason === 'cycle_complete'
          ? 'Previous cycle complete'
          : null;
  return (
    <div className="min-w-40 text-xs leading-5">
      <p className="font-semibold">
        Day {cycle.day} of 7 · cycle {number(cycle.number)}
      </p>
      <p className="text-muted-foreground">Claim date: {cycle.claimDate}</p>
      {reason ? <p>{reason}</p> : null}
      {cycle.graceApplied ? <p>Grace applied</p> : null}
      <p className="text-muted-foreground">
        {cycle.graceUsed
          ? 'Grace used in this cycle'
          : 'Grace unused in this cycle'}
      </p>
    </div>
  );
}
function actionLabel(value: string) {
  return (
    (
      { draft: 'Draft saved', publish: 'Published', pause: 'Paused' } as Record<
        string,
        string
      >
    )[value.split('.').pop()!] ?? value
  );
}
export function IncentiveHistoryReport({
  report,
  path,
}: {
  report: {
    history: IncentiveHistoryRow[];
    historyCount: number;
    window: ReportWindow;
  };
  path: string;
}) {
  return (
    <section
      id="history"
      aria-label="Incentive change history"
      className="scroll-mt-28 space-y-4 rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div>
        <h2 className="text-xl font-semibold">Change history</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          All rule changes in the selected dates, independent of activity
          search. Operator, reason and before/after snapshots are retained.
        </p>
      </div>
      <Table
        label="Rule change history"
        headers={[
          'When (Nepal time)',
          'Campaign / action',
          'Changed by',
          'Reason / changes',
        ]}
      >
        {report.history.map((row) => (
          <tr key={row.id}>
            <td className={cell + ' whitespace-nowrap'}>
              {incentiveDate(row.createdAt)}
            </td>
            <td className={cell}>
              <p className="font-semibold">{row.subjectLabel}</p>
              <p className="mt-1 text-muted-foreground">
                {actionLabel(row.action)}
              </p>
            </td>
            <td className={cell}>{row.actorName}</td>
            <td className={cell}>
              <p className="max-w-xl break-words">{row.reason}</p>
              <details className="mt-2">
                <summary className="min-h-9 cursor-pointer font-semibold text-primary">
                  View before and after
                </summary>
                <dl className="mt-2 space-y-3">
                  {row.changes.length ? (
                    row.changes.map((change, index) => (
                      <div
                        key={change.label + index}
                        className="rounded-lg border p-3"
                      >
                        <dt className="font-semibold">{change.label}</dt>
                        <dd className="mt-1 break-words text-xs leading-5">
                          <span className="font-semibold">Before:</span>{' '}
                          {change.before}
                          <br />
                          <span className="font-semibold">After:</span>{' '}
                          {change.after}
                        </dd>
                      </div>
                    ))
                  ) : (
                    <div>No financial term change recorded.</div>
                  )}
                </dl>
              </details>
            </td>
          </tr>
        ))}
        {!report.history.length ? (
          <tr>
            <td colSpan={4} className="p-8 text-center text-muted-foreground">
              No rule changes in this period. Saved and published changes will
              appear here.
            </td>
          </tr>
        ) : null}
      </Table>
      <ReportPagination
        path={path}
        window={report.window}
        count={report.historyCount}
        kind="historyPage"
        anchor="history"
      />
    </section>
  );
}
