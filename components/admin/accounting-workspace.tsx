import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  accountingSections,
  type AccountingQuery,
  type AccountingWorkspace,
} from '@/lib/accounting/types';
import { formatPaisa } from '@/lib/accounting/money';

const names = {
  overview: 'Overview',
  sellers: 'Independent sellers',
  makers: 'Managed makers',
  cash: 'Cash & refunds',
  incentives: 'Incentives & credits',
  issues: 'Issues',
};
const dateInput = (at: number) =>
  new Date(at + 20700000).toISOString().slice(0, 10);
const stamp = (at: number) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(at);
function href(
  q: AccountingQuery,
  changes: {
    section?: AccountingQuery['section'];
    period?: AccountingQuery['period'];
    cursor?: string;
  } = {},
) {
  const period = changes.period ?? q.period;
  const p = new URLSearchParams({
    section: changes.section ?? q.section,
    period,
    pageSize: String(q.pageSize),
  });
  if (period === 'custom') {
    p.set('from', dateInput(q.fromAt));
    p.set('to', dateInput(q.toExclusive - 1));
  }
  if (changes.cursor) p.set('cursor', changes.cursor);
  return '/admin/accounting?' + p.toString();
}
const linkClass =
  'inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
function visibleMetric(key: string, section: AccountingQuery['section']) {
  if (section === 'overview')
    return [
      'service_fee_standard',
      'service_fee_campaign_waived',
      'service_fee_charged',
      'service_fee_current',
      'service_fee_refunded',
      'seller_commission_earned',
      'seller_available',
      'maker_company_retention',
      'maker_balance',
      'maker_payable',
      'cod_collected',
      'cod_remitted',
      'refund_cash',
      'wallet_balance',
      'bank_balance',
      'operating_expenses',
      'tax_payable',
      'net_profit',
    ].includes(key);
  if (section === 'sellers') return key.startsWith('seller_');
  if (section === 'makers') return key.startsWith('maker_');
  if (section === 'cash')
    return (
      key.startsWith('cod_') ||
      key.startsWith('service_fee_') ||
      key.startsWith('refund_') ||
      key === 'bank_balance'
    );
  if (section === 'incentives')
    return /^(wallet|referral|promo|loyalty|gift)_/.test(key);
  return false;
}
const sourceViews = [
  ['/admin/commission', 'Commission records'],
  ['/admin/programs', 'Maker finance records'],
  ['/admin/payouts', 'Seller payout records'],
  ['/admin/referrals', 'Referral and credit records'],
] as const;

export function AccountingFilterError({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <h1 className="section-title">Accounting</h1>
      <p role="alert">{message}</p>
      <Link prefetch={false} className={linkClass} href="/admin/accounting">
        Start a new report
      </Link>
    </div>
  );
}

export function AccountingWorkspaceView({
  workspace: w,
  currentRates,
}: {
  workspace: AccountingWorkspace;
  currentRates?: { sellerCommissionBps: number; managedRetentionBps: number; observedAt: number } | null;
}) {
  const q = w.query,
    incomplete = w.coverage.some((c) => !c.available);
  return (
    <div className="min-w-0 space-y-6">
      <header className="space-y-3">
        <p className="eyebrow">Super Admin · Financial records</p>
        <h1 className="section-title">Accounting</h1>
        <p className="max-w-3xl leading-7 text-muted-foreground">
          Read-only operational records. Company books and bank balances are not
          connected.
        </p>
        <p className="text-sm leading-6">
          Commission and maker amounts use each record’s saved rates and terms.
          Historical records keep their original amounts when rates change.
        </p>
        {currentRates ? (
          <section aria-label="Current commercial terms" className="space-y-2 rounded-xl border bg-card p-4 text-sm leading-6">
            <h2 className="font-semibold">Current terms for newly accepted sales</h2>
            <p>Independent sellers: <strong>{currentRates.sellerCommissionBps / 100}% company / {(10000 - currentRates.sellerCommissionBps) / 100}% seller</strong>.</p>
            <p>Sale-linked Managed Makers: <strong>{currentRates.managedRetentionBps / 100}% company / {(10000 - currentRates.managedRetentionBps) / 100}% maker</strong>.</p>
            <p className="text-muted-foreground">Current settings checked {stamp(currentRates.observedAt)} Nepal time. Seller acceptance and any accepted fee supplements still apply. These rates do not recalculate the historical amounts below or change fixed supplier prices.</p>
          </section>
        ) : currentRates === null ? (
          <output className="block rounded-xl border p-4 text-sm">Current commercial terms are unavailable. The historical report below still uses its original saved amounts.</output>
        ) : null}
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-muted p-3 text-sm">
          <span>{w.environment}</span>
          <span>Observed: {stamp(w.observedAt)}</span>
          <span>Asia/Kathmandu · UTC+05:45</span>
        </div>
      </header>
      <nav aria-label="Accounting sections" className="flex flex-wrap gap-2">
        {accountingSections.map((section) => (
          <Link
            prefetch={false}
            key={section}
            href={href(q, { section })}
            className={
              linkClass +
              (q.section === section
                ? ' bg-primary text-primary-foreground hover:bg-primary/90'
                : '')
            }
            aria-current={q.section === section ? 'page' : undefined}
          >
            {names[section]}
            {section === 'issues' && w.issues.length > 0
              ? ' (' + w.issues.length + ')'
              : ''}
          </Link>
        ))}
      </nav>
      <section
        aria-label="Reporting period"
        className="space-y-4 rounded-xl border p-4"
      >
        <h2 className="font-semibold">Reporting period in Nepal time</h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['today', 'Today'],
              ['7d', 'Last 7 days'],
              ['30d', 'Last 30 days'],
              ['all', 'All time'],
            ] as const
          ).map(([period, label]) => (
            <Link
              prefetch={false}
              key={period}
              href={href(q, { period })}
              className={linkClass + (q.period === period ? ' bg-muted' : '')}
              aria-current={q.period === period ? 'date' : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
        <form
          key={[q.section, q.period, q.fromAt, q.toExclusive, q.pageSize].join(':')}
          data-form-id="staff.accounting-report-filter"
          action="/admin/accounting"
          method="get"
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="section" value={q.section} />
          <input type="hidden" name="period" value="custom" />
          <input type="hidden" name="pageSize" value={q.pageSize} />
          <div className="min-w-0 space-y-2">
            <Label htmlFor="accounting-from">From date</Label>
            <Input
              id="accounting-from"
              type="date"
              name="from"
              defaultValue={dateInput(q.fromAt)}
              required
              className="w-full sm:w-44"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="accounting-to">To date (inclusive)</Label>
            <Input
              id="accounting-to"
              type="date"
              name="to"
              defaultValue={dateInput(q.toExclusive - 1)}
              required
              className="w-full sm:w-44"
            />
          </div>
          <Button type="submit" variant="outline">
            Apply custom dates
          </Button>
        </form>
        <p className="text-sm leading-6 text-muted-foreground">
          {q.period === 'all'
            ? 'All recorded time through the first page’s observation time'
            : dateInput(q.fromAt) + ' to ' + dateInput(q.toExclusive - 1)}
          . Period flows use the recorded event date. Current positions use the
          observation time and do not change to historical balances when you
          select an older period.
        </p>
      </section>
      {w.issues.length > 0 && (
        <aside
          className="space-y-2 rounded-xl border border-amber-500/50 p-4"
          aria-label="Accounting review needed"
        >
          <h2 className="font-semibold">
            {incomplete
              ? 'Some sources are unavailable'
              : 'Recorded amounts need review'}
          </h2>
          <p className="text-sm leading-6">
            Review {w.issues.length} source messages in Issues. No records have
            been repaired or recalculated.
          </p>
          <ul className="space-y-1 text-sm">
            {w.issues.slice(0, 3).map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
          <Link
            prefetch={false}
            className="text-sm underline underline-offset-4"
            href={href(q)}
          >
            Reload report
          </Link>
        </aside>
      )}
      <section aria-labelledby="accounting-section-title" className="space-y-4">
        <h2 id="accounting-section-title" className="font-heading text-2xl">
          {names[q.section]}
        </h2>
        {q.section !== 'issues' && (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {w.metrics
              .filter((m) => visibleMetric(m.key, q.section))
              .map((m) => (
                <Card key={m.key} className="min-w-0">
                  <CardHeader>
                    <CardTitle>{m.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="break-words text-2xl font-semibold tabular-nums">
                      {m.amountPaisa === null
                        ? 'Unavailable'
                        : formatPaisa(m.amountPaisa)}
                    </p>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {m.basis === 'current_position'
                        ? 'Current position'
                        : 'Period flow'}
                      {m.status === 'needs_review' ? ' · Needs review' : ''}
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {m.explanation}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      Source:{' '}
                      {m.sourceKinds.length
                        ? m.sourceKinds.join(', ')
                        : 'Not connected'}
                    </p>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
        {q.section === 'issues' && (
          <div className="space-y-3">
            {w.issues.length ? (
              w.issues.map((issue, i) => (
                <Card key={i}>
                  <CardContent className="space-y-2">
                    <p className="text-sm font-medium">
                      {issue.code.replaceAll('_', ' ')}
                    </p>
                    <p className="text-sm leading-6">{issue.message}</p>
                    {issue.sourceId && (
                      <p className="break-all text-xs text-muted-foreground">
                        {issue.sourceKind} · {issue.sourceId}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <p>
                No source issues were detected by these checks. This is not a
                full audit or bank reconciliation.
              </p>
            )}
          </div>
        )}
      </section>
      {q.section !== 'issues' && (
        <section
          aria-labelledby="accounting-rows-title"
          className="min-w-0 space-y-3"
        >
          <h2 id="accounting-rows-title" className="font-heading text-xl">
            Recorded source rows
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Amounts belong to different stages and must not be added together.
            Points are shown separately from money. Newest event first; up to{' '}
            {q.pageSize} rows per page. Totals include all matching records.
          </p>
          {w.rows.length ? (
            <section
              className="max-w-full overflow-x-auto rounded-lg border"
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll the wide records table.
              tabIndex={0}
              aria-label="Scrollable source records"
            >
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Source records for the selected period. No financial actions.
                </caption>
                <thead className="bg-muted">
                  <tr>
                    {[
                      'Recorded in Nepal',
                      'Source and reference',
                      'State / saved model',
                      'Amount or points',
                    ].map((x) => (
                      <th scope="col" className="p-3 font-medium" key={x}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {w.rows.map((r) => (
                    <tr
                      key={r.sourceKind + ':' + r.sourceId}
                      className="border-t align-top"
                    >
                      <td className="whitespace-nowrap p-3">
                        {stamp(r.recordedAt)}
                      </td>
                      <td className="min-w-48 max-w-80 break-all p-3">
                        <p>{r.sourceKind.replaceAll('_', ' ')}</p>
                        <p className="mt-1 font-medium">{r.reference}</p>
                        {r.reference !== r.sourceId && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {r.sourceId}
                          </p>
                        )}
                      </td>
                      <td className="min-w-44 max-w-72 break-words p-3">
                        <p>{r.state}</p>
                        {r.model && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {r.model}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3 tabular-nums">
                        {r.amountPaisa === null
                          ? 'No money amount'
                          : formatPaisa(r.amountPaisa)}
                        {r.points !== null && (
                          <p className="mt-1 text-xs">{r.points} points</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : (
            <p className="rounded-lg border p-4 text-sm">
              {incomplete
                ? 'Source rows are unavailable or incomplete. Review Issues; an empty result is not proof of zero.'
                : 'No recorded rows in this period. Current positions above may still contain older obligations.'}
            </p>
          )}
          <nav
            aria-label="Source record pages"
            className="flex flex-wrap gap-3"
          >
            {q.cursor && (
              <Link prefetch={false} href={href(q)} className={linkClass}>
                First page
              </Link>
            )}
            {w.nextCursor && (
              <Link
                prefetch={false}
                href={href(q, { cursor: w.nextCursor })}
                className={linkClass}
              >
                Next records
              </Link>
            )}
          </nav>
        </section>
      )}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-medium">
          Source coverage and limits
        </summary>
        <div className="mt-4 space-y-3 text-sm leading-6">
          <p>
            Coverage counts are all-time source rows, not transactions or money
            totals. Each overview includes available sources in one database
            read. Separate reloads can show later events.
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {w.coverage.map((c) => (
              <li key={c.source}>
                {c.source}:{' '}
                {c.available ? c.rowCount + ' recorded rows' : 'Unavailable'}
              </li>
            ))}
          </ul>
          <p>
            Loyalty credit here means stored redemptions only. This view does
            not save or publish a weekly schedule, enable grace, release
            rewards, or change the existing paused program.
          </p>
          <p>
            Bank statements, operating expenses, tax calculations and formal
            company books are not connected. These records cannot establish net
            profit, a bank balance, a trial balance or a tax return.
          </p>
          <p>
            Fixed-supplier obligations keep their original terms and are flagged
            for separate classification; they are not converted to the
            sale-linked maker model.
          </p>
        </div>
      </details>
      <footer className="space-y-3 border-t pt-4">
        <h2 className="text-sm font-semibold">Existing finance work areas</h2>
        <p className="text-sm text-muted-foreground">
          These links open existing staff pages. Any financial decision belongs
          to its original protected workflow.
        </p>
        <div className="flex flex-wrap gap-3">
          {sourceViews.map(([url, label]) => (
            <Link
              prefetch={false}
              key={url}
              href={url}
              className="text-sm underline underline-offset-4"
            >
              {label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
