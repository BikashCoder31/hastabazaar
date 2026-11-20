import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  getReferralAdminReport,
  referralProgress,
  referralStatuses,
} from '@/lib/db/repositories/admin-referrals';
import { marketplaceSummaryPeriods } from '@/lib/admin/marketplace-period';
import {
  incentiveDate,
  incentiveMoney as money,
} from '@/lib/incentives/presentation';
import { ReferralSettings } from '@/components/admin/referral-settings';

export const dynamic = 'force-dynamic';
type Params = Record<string, string | string[] | undefined>;
const views = [
  { value: 'overview', label: 'Overview' },
  { value: 'settings', label: 'Offer settings' },
  { value: 'activity', label: 'Referral activity' },
  { value: 'history', label: 'History' },
] as const;
const href = (
  view: string,
  period: string,
  q = '',
  status = 'all',
  page = 1,
) => {
  const params = new URLSearchParams({ view, period });
  if (q) params.set('q', q);
  if (status !== 'all') params.set('status', status);
  if (page > 1) params.set('page', String(page));
  return `/admin/referrals?${params}`;
};
const linkClass =
  'inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary';

export default async function ReferralAdmin({
  searchParams,
}: { searchParams?: Promise<Params> } = {}) {
  const staff = await requireStaffPage('/admin/referrals', 'commercial_policy.manage');
  if (staff.role !== 'super_admin')
    return <p>Only the Super Admin can manage referral offers.</p>;
  const params = (await searchParams) ?? {};
  const view =
    views.find((option) => option.value === params.view)?.value ?? 'overview';
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const report = await getReferralAdminReport(db, staff, {
    period: params.period,
    query: params.q,
    status: params.status,
    page: params.page,
  });
  const { campaign, range, totals } = report;
  return (
    <div className="min-w-0 space-y-5">
      <header>
        <p className="eyebrow">Super Admin · Customer referrals</p>
        <h1 className="mt-2 font-heading text-3xl sm:text-4xl">
          Referrals & shopping credit
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Track referral discounts and shopping-credit rewards. Hastabazaar
          funds both; seller earnings are unchanged.
        </p>
      </header>
      <nav aria-label="Referral sections" className="flex flex-wrap gap-2">
        {views.map((option) => (
          <Link
            key={option.value}
            href={href(option.value, range.period, report.query, report.status)}
            aria-current={view === option.value ? 'page' : undefined}
            className={`${linkClass} ${view === option.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'}`}
          >
            {option.label}
          </Link>
        ))}
      </nav>
      <section
        aria-labelledby="saved-offer-title"
        className="rounded-2xl border bg-card p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="saved-offer-title" className="font-heading text-xl">
            Current saved offer
          </h2>
          <span
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${campaign.enabled ? 'border-primary/30 bg-primary/5 text-primary' : 'bg-muted text-foreground'}`}
          >
            {campaign.enabled
              ? 'Active · accepting new referrals'
              : 'Paused · no new referrals'}
          </span>
        </div>
        <p className="mt-3 text-sm leading-7">
          A new customer gets{' '}
          <strong>{money(campaign.friendDiscountPaisa)} off</strong> an eligible
          first order with at least{' '}
          <strong>{money(campaign.minimumSubtotalPaisa)} in products</strong>.
          Their referrer can earn{' '}
          <strong>{money(campaign.rewardPaisa)} shopping credit</strong> after
          delivery, confirmed payment and the saved{' '}
          <strong>{campaign.returnWindowDays}-day wait</strong>.
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Returns, unresolved complaints, inactive accounts or unsettled COD can
          block a reward. Pausing stops new referrals; accepted orders keep
          their saved offer. Shopping credit is for products, with no cash
          withdrawal or manual top-up.
        </p>
      </section>
      {view === 'overview' || view === 'activity' ? (
        <section aria-label="Referral date filter" className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {marketplaceSummaryPeriods.map((option) => (
              <Link
                key={option.value}
                href={href(view, option.value, report.query, report.status)}
                aria-current={
                  range.period === option.value ? 'true' : undefined
                }
                className={`${linkClass} ${range.period === option.value ? 'border-primary bg-primary/5 text-primary' : 'bg-card hover:bg-muted'}`}
              >
                {option.label}
              </Link>
            ))}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {range.description}
          </p>
        </section>
      ) : null}
      {view === 'overview' ? (
        <section aria-label="Referral summary" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                'Friend discounts applied',
                totals.discountPaisa,
                'Original checkout discounts on non-cancelled referral orders accepted in these dates. Before returns or partial cancellation adjustments.',
              ],
              [
                'Referrer rewards waiting',
                totals.waitingPaisa,
                'Unissued rewards for referrals accepted in these dates, including holds. Cancelled, ineligible and inactive-account rewards are excluded.',
              ],
              [
                'Referrer rewards issued',
                totals.issuedPaisa,
                'Actual referral credit posted in these dates, even when the referral order is older.',
              ],
              [
                'Current unused shopping credit',
                totals.balancePaisa,
                'Across all wallets and credit sources now. This balance does not change with the date filter.',
              ],
            ].map(([label, value, description]) => (
              <div
                key={label}
                className="rounded-2xl border bg-card p-4 sm:p-5"
              >
                <h2 className="text-sm font-medium text-muted-foreground">
                  {label}
                </h2>
                <p className="mt-3 break-words text-2xl font-semibold">
                  {money(value)}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
            <p>
              <strong>{totals.referralOrders}</strong> referral orders recorded
              in these dates, including cancelled orders.
            </p>
            <Link
              className="font-medium text-primary underline underline-offset-4"
              href={href('activity', range.period)}
            >
              View referral activity
            </Link>
          </div>
          <details className="rounded-xl border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">
              How rewards progress
            </summary>
            <p className="mt-3 leading-7 text-muted-foreground">
              Eligible first order → delivery → payment and COD settlement → the
              order’s saved waiting period → shopping credit issued. Returns and
              complaints can put earning on hold. Ready rewards are checked when
              the referrer opens their referrals, wallet or checkout; this page
              does not issue credit.
            </p>
          </details>
        </section>
      ) : null}
      {view === 'settings' ? (
        <section className="rounded-2xl border bg-card p-4 sm:p-6">
          <h2 className="font-heading text-2xl">Offer settings</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Review proposed values before saving. A saved change applies to new
            referrals; accepted orders keep their original offer.
          </p>
          <ReferralSettings
            actorId={staff.id}
            key={JSON.stringify(campaign)}
            campaign={campaign}
          />
        </section>
      ) : null}
      {view === 'activity' ? (
        <section
          aria-labelledby="activity-title"
          className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-6"
        >
          <h2 id="activity-title" className="font-heading text-2xl">
            Referral activity
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Orders accepted in the selected dates, with their current reward
            progress. Amounts and waiting periods are saved with each order.
            Search and status only filter this list.
          </p>
          <form
            data-form-id="staff.referral-report-filter"
            key={JSON.stringify([range.period, report.query, report.status])}
            action="/admin/referrals"
            method="get"
            className="flex flex-wrap items-end gap-3"
          >
            <input type="hidden" name="view" value="activity" />
            <input type="hidden" name="period" value={range.period} />
            <label className="min-w-0 basis-full text-sm md:flex-1 md:basis-0">
              Search referrals
              <input
                type="search"
                name="q"
                maxLength={100}
                defaultValue={report.query}
                placeholder="Order, customer, referrer or code"
                className="mt-1 block min-h-10 w-full rounded-lg border bg-background px-3 py-2"
              />
            </label>
            <label className="w-full max-w-full text-sm sm:w-auto">
              Reward status
              <select
                name="status"
                defaultValue={report.status}
                className="mt-1 block min-h-10 w-full rounded-lg border bg-background px-3 py-2"
              >
                {referralStatuses.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className={`${linkClass} bg-primary text-primary-foreground`}
            >
              Apply filters
            </button>
            <a
              className="py-2 text-sm text-primary underline"
              href={href('activity', range.period)}
            >
              Clear search
            </a>
          </form>
          {report.activity.length ? (
            <section
              className="max-w-full overflow-x-auto rounded-xl border"
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to focus and scroll the overflowing table region.
              tabIndex={0}
              aria-label="Referral orders table"
            >
              <table className="w-full min-w-[820px] text-left text-sm">
                <caption className="sr-only">
                  Referral orders and saved reward progress. All dates use Nepal
                  time.
                </caption>
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      'Order / accepted date',
                      'Customer / referrer',
                      'Saved offer',
                      'Reward progress',
                    ].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="px-4 py-3 font-medium"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.activity.map((row) => {
                    const progress = referralProgress[row.reason];
                    return (
                      <tr key={row.orderId} className="align-top">
                        <td className="px-4 py-4">
                          <Link
                            className="font-medium text-primary underline underline-offset-4"
                            href={`/admin/orders/${encodeURIComponent(row.orderId)}`}
                          >
                            {row.orderNumber}
                          </Link>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {incentiveDate(row.createdAt)} NPT
                          </p>
                        </td>
                        <td className="max-w-60 break-words px-4 py-4">
                          <p>{row.customerName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Referred by {row.referrerName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Code: {row.referralCode}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p>Friend: {money(row.discountPaisa)}</p>
                          <p className="mt-1">
                            Referrer: {money(row.rewardPaisa)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.waitDays}-day wait
                          </p>
                        </td>
                        <td className="max-w-80 px-4 py-4">
                          <span className="inline-block rounded-full border bg-muted/40 px-2 py-1 text-xs font-semibold">
                            {progress.label}
                          </span>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {progress.detail}
                          </p>
                          {row.eligibleAt !== null &&
                          row.reason === 'waiting_period' ? (
                            <p className="mt-1 text-xs">
                              Wait ends: {incentiveDate(row.eligibleAt)} NPT
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ) : (
            <output className="block rounded-xl bg-muted/40 p-6 text-sm text-muted-foreground">
              {report.query || report.status !== 'all'
                ? 'No referrals match these filters. Try another search or status.'
                : 'No referral orders recorded in this period. New accepted referrals will appear here.'}
            </output>
          )}
          <nav
            aria-label="Referral activity pages"
            className="flex flex-wrap items-center gap-3 text-sm"
          >
            <p>
              {report.activityCount} matching orders · Page {report.page} of{' '}
              {report.pages}
            </p>
            {report.page > 1 ? (
              <Link
                className={linkClass}
                href={href(
                  'activity',
                  range.period,
                  report.query,
                  report.status,
                  report.page - 1,
                )}
              >
                Previous page
              </Link>
            ) : null}
            {report.page < report.pages ? (
              <Link
                className={linkClass}
                href={href(
                  'activity',
                  range.period,
                  report.query,
                  report.status,
                  report.page + 1,
                )}
              >
                Next page
              </Link>
            ) : null}
          </nav>
        </section>
      ) : null}
      {view === 'history' ? (
        <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
          <h2 className="font-heading text-2xl">Offer history</h2>
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
            Use the existing records to see who changed the offer and the saved
            form context. Accepted orders retain their own reward and
            waiting-period snapshots.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              className={linkClass}
              href="/admin/staff-form-history?kind=referral-settings&id=default"
            >
              View referral form history
            </Link>
            <Link className={linkClass} href="/admin/activity">
              Open action audit
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
