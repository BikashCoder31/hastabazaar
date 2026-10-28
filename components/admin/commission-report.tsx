import Link from 'next/link';
import { ArrowLeft, ArrowRight, CircleAlert } from 'lucide-react';
import type {
  CommissionFilters,
  CommissionReport as Report,
} from '@/lib/commission/reporting';
import { commissionDate, commissionMoney } from '@/lib/commission/reporting';

const field =
  'mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm';

export function CommissionReport({
  report,
  filters,
  error,
}: {
  report: Report;
  filters: CommissionFilters;
  error?: string;
}) {
  function pageHref(page: number) {
    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'query', 'sellerId', 'status'] as const)
      if (filters[key]) params.set(key, filters[key]!);
    params.set('page', String(page));
    return `/admin/commission?${params}#order-breakdown`;
  }
  const metrics = [
    {
      label: 'Net earned',
      amount: report.totals.netPaisa,
      detail: 'Earned commission less refund reversals',
      highlight: true,
    },
    {
      label: 'Commission earned',
      amount: report.totals.earnedPaisa,
      detail: 'Recorded from completed, paid sales',
    },
    {
      label: 'Pending commission',
      amount: report.totals.pendingPaisa,
      detail: 'Order estimates awaiting earning',
    },
    {
      label: 'Refund reversals',
      amount: report.totals.reversedPaisa,
      detail: 'Returned to sellers after refunds',
    },
  ];
  return (
    <section id="earnings" className="scroll-mt-28 space-y-5">
      <form
        data-form-id="staff.commission-report-filter"
        method="get"
        action="/admin/commission"
        className="grid gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <label htmlFor="commission-search" className="text-sm font-medium">
          Order or seller
          <input
            id="commission-search"
            name="query"
            maxLength={100}
            defaultValue={filters.query}
            placeholder="Search order number or seller"
            className={field}
          />
        </label>
        <label htmlFor="commission-from" className="text-sm font-medium">
          Orders placed from
          <input
            id="commission-from"
            name="from"
            type="date"
            defaultValue={filters.from}
            className={field}
          />
        </label>
        <label htmlFor="commission-to" className="text-sm font-medium">
          Orders placed through
          <input
            id="commission-to"
            name="to"
            type="date"
            defaultValue={filters.to}
            className={field}
          />
        </label>
        <label htmlFor="commission-seller" className="text-sm font-medium">
          Seller
          <select
            id="commission-seller"
            name="sellerId"
            defaultValue={filters.sellerId ?? ''}
            className={field}
          >
            <option value="">All sellers</option>
            {report.sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="commission-status" className="text-sm font-medium">
          Commission status
          <select
            id="commission-status"
            name="status"
            defaultValue={filters.status ?? 'all'}
            className={field}
          >
            <option value="all">All statuses</option>
            <option value="earned">Earned</option>
            <option value="pending">Pending</option>
            <option value="cancelled">
              Cancelled / closed without earnings
            </option>
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Apply filters
          </button>
          <Link
            href="/admin/commission"
            className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-medium"
          >
            Reset
          </Link>
        </div>
      </form>
      <dl className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-3">
        <div><dt>Original standard marketplace fees</dt><dd>{commissionMoney(report.totals.originalStandardPaisa)}</dd></div>
        <div><dt>Original marketplace fees waived</dt><dd>{commissionMoney(report.totals.originalWaivedPaisa)}</dd></div>
        <div><dt>Original net marketplace fees</dt><dd>{commissionMoney(report.totals.originalStandardPaisa-report.totals.originalWaivedPaisa)}</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">Original order amounts include cancelled and refunded items. Earned fees and refund reversals below describe the ledger separately.</p>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error} Showing all orders.
        </p>
      ) : null}
      <p className="text-sm leading-6 text-muted-foreground">
        Current earnings for orders placed in the selected Nepal dates. Totals
        include all matching orders, across every results page. Pending
        commission is an estimate.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={`rounded-2xl border p-5 ${metric.highlight ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}
          >
            <h2 className="text-sm font-medium">{metric.label}</h2>
            <p className="mt-3 break-words font-heading text-3xl tabular-nums">
              {commissionMoney(metric.amount)}
            </p>
            <p
              className={`mt-2 text-xs leading-5 ${metric.highlight ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
            >
              {metric.detail}
            </p>
          </div>
        ))}
      </div>
      {report.totals.missingEntries > 0 ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {report.totals.missingEntries} delivered, paid item(s) are ready for
          ledger recording. Their commission is shown as pending until recorded.
        </p>
      ) : null}
      <section
        id="order-breakdown"
        className="scroll-mt-28 overflow-hidden rounded-2xl border bg-card"
      >
        <div className="p-5 sm:p-6">
          <h2 className="font-heading text-2xl">Order-wise breakdown</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {report.totalRows} matching order/seller{' '}
            {report.totalRows === 1 ? 'entry' : 'entries'}. Each seller in an
            order has its own row and stored rate.
          </p>
        </div>
        {report.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Order commission, eligible sale value, stored rate, earnings and
                refund reversals
              </caption>
              <thead className="border-y bg-secondary/40">
                <tr>
                  {[
                    'Order / seller',
                    'Eligible value',
                    'Stored rate',
                    'Earned',
                    'Reversed',
                    'Net earned',
                    'Pending',
                  ].map((title) => (
                    <th
                      key={title}
                      scope="col"
                      className="whitespace-nowrap px-4 py-3 font-semibold"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr
                    key={`${row.orderId}:${row.sellerId}`}
                    className="border-b last:border-b-0"
                  >
                    <th scope="row" className="min-w-52 px-4 py-4 font-normal">
                      <Link
                        href={`/admin/orders/${row.orderId}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {row.orderNumber}
                      </Link>
                      <p className="mt-1">{row.sellerName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {commissionDate(row.placedAt)} · {row.itemCount} item(s)
                      </p>
                      <p className="mt-1 text-xs capitalize text-muted-foreground">
                        {row.orderStatus.replaceAll('_', ' ')} ·{' '}
                        {row.paymentStatus.replaceAll('_', ' ')}
                      </p>
                    </th>
                    <td className="whitespace-nowrap px-4 py-4 tabular-nums">
                      {commissionMoney(row.eligibleBasePaisa)}
                    </td>
                    <td className="px-4 py-4">
                      <span className="whitespace-nowrap">
                        {row.minRateBps === row.maxRateBps
                          ? `${row.minRateBps / 100}%`
                          : `${row.minRateBps / 100}–${row.maxRateBps / 100}%`}
                      </span>
                      <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                        Standard: {commissionMoney(row.originalStandardPaisa)}
                      </p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {row.campaignNames?.length ? `Full fee waiver · ${row.campaignNames.join(', ')}` : 'No campaign waiver'}: {commissionMoney(row.originalWaivedPaisa)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Original net fee: {commissionMoney(row.originalCommissionPaisa)} at placement
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 tabular-nums">
                      {commissionMoney(row.earnedPaisa)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 tabular-nums">
                      {commissionMoney(row.reversedPaisa)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold tabular-nums">
                      {commissionMoney(row.netPaisa)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 tabular-nums">
                      {commissionMoney(row.pendingPaisa)}
                      {row.missingEntries ? (
                        <p className="mt-1 text-xs text-amber-700">
                          Ready to record
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border-t p-8 text-center">
            <h3 className="font-semibold">No orders match these filters</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a wider date range or reset the filters. Earnings will appear
              as orders are completed and paid.
            </p>
          </div>
        )}
        {report.totalRows > report.pageSize ? (
          <nav
            aria-label="Commission results pages"
            className="flex flex-wrap items-center justify-between gap-3 border-t p-4"
          >
            <span className="text-sm text-muted-foreground">
              Page {report.page} of{' '}
              {Math.ceil(report.totalRows / report.pageSize)}
            </span>
            <div className="flex gap-3">
              {report.page > 1 ? (
                <Link
                  href={pageHref(report.page - 1)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"
                >
                  <ArrowLeft className="size-4" />
                  Previous
                </Link>
              ) : null}
              {report.page * report.pageSize < report.totalRows ? (
                <Link
                  href={pageHref(report.page + 1)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"
                >
                  Next
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>
    </section>
  );
}
