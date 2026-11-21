import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { CommonFeePolicy } from '@/components/admin/common-fee-policy';
import { getCommonFeeState } from '@/lib/commission/coordinated-policy';
import { CommissionReport } from '@/components/admin/commission-report';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getCommissionRateState } from '@/lib/db/repositories/commission-rates';
import { getCommissionReport } from '@/lib/db/repositories/commission-reporting';
import {
  commissionDate,
  type CommissionFilters,
} from '@/lib/commission/reporting';

export const dynamic = 'force-dynamic';

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireStaffPage('/admin/commission', 'commercial_policy.manage');
  const params = await searchParams;
  const first = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : undefined;
  const filters: CommissionFilters = {
    from: first('from'),
    to: first('to'),
    query: first('query'),
    sellerId: first('sellerId'),
    status: first('status'),
    page: Number(first('page') ?? 1),
  };
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const rateState = getCommissionRateState(database);
  const [state, result] = await Promise.all([
    rateState,
    getCommissionReport(database, filters)
      .then((report) => ({ report, error: '' }))
      .catch(async (error) => {
        if (!(error instanceof RangeError)) throw error;
        return {
          report: await getCommissionReport(database, {}),
          error: error.message,
        };
      }),
  ]);
  const { report, error: filterError } = result;
  const now = state.asOf;
  const common = await getCommonFeeState(database, now);
  return (
    <div className="space-y-7">
      <div>
        <AdminPageTitle><h1 className="section-title">Commission</h1></AdminPageTitle>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Track your earnings, inspect each order, and manage commission rates
          in one place.
        </p>
        <nav
          aria-label="Commission sections"
          className="mt-4 flex flex-wrap gap-3 text-sm font-semibold text-primary"
        >
          {[
            ['#earnings', 'Earnings & orders'],
            ['#rate-management', 'Manage rate'],
            ['#rate-history', 'Rate history'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center rounded-full border bg-card px-4 hover:bg-secondary"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
      <CommonFeePolicy actorId={actor.id} state={common} editable={actor.role === 'super_admin'} />
      <Link href="/admin/commission/terms" className="section-link">Acceptance, outreach and current terms holds →</Link>
      <CommissionReport report={report} filters={filters} error={filterError} />
      <section
        id="rate-history"
        className="scroll-mt-28 rounded-2xl border bg-card p-5 sm:p-6"
      >
        <h2 className="font-heading text-2xl">Scheduled changes & history</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Published fee schedules, seller acceptance totals, and cancellation
          records. Dates use Nepal time.
        </p>
        <div className="mt-5 space-y-4">
          {state.history.map((change) => (
            <article key={change.id} className="rounded-xl border p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-heading text-2xl">
                  {change.basisPoints / 100}% commission
                </h3>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold capitalize">
                  {change.status === 'previous'
                    ? 'Previously published'
                    : change.status}
                </span>
              </div>
              <p className="mt-2 text-sm">
                Effective {commissionDate(change.effectiveAt)} ·{' '}
                {change.acceptedSellers} of {state.approvedSellers} approved
                sellers accepted
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Published {commissionDate(change.createdAt)} by{' '}
                {change.createdByName}
              </p>
              <p className="mt-3 text-sm leading-6">{change.reason}</p>
              {change.cancelledAt ? (
                <p className="mt-3 rounded-lg bg-secondary/50 p-3 text-sm leading-6">
                  Cancelled {commissionDate(change.cancelledAt)} by{' '}
                  {change.cancelledByName}: {change.cancellationReason}
                </p>
              ) : null}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-primary">
                  View published fee schedule
                </summary>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {change.termsText}
                </p>
                <p className="mt-3 break-all text-xs text-muted-foreground">
                  Fee schedule version: {change.id}
                </p>
              </details>

            </article>
          ))}
          <article className="rounded-xl border border-dashed p-4">
            <h3 className="font-semibold">Original recorded terms</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The current saved base and published supplements are shown above.
              Historical orders and agreements retain their original recorded
              commission terms.
            </p>
          </article>
        </div>
      </section>
      <details className="rounded-2xl border bg-card p-5 sm:p-6">
        <summary className="cursor-pointer font-semibold max-md:min-h-11 max-md:content-center">
          How commission is calculated
        </summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Commission is calculated on product selling value after seller-funded
          discounts. Separately stated product taxes and delivery are excluded.
          Hastabazaar-funded discounts do not reduce the agreed product value.
          Earnings and refund reversals use the original order and ledger
          snapshots. No joining fee.
        </p>
        <Link
          href="/seller-agreement"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
        >
          Read the Seller Marketplace Agreement
        </Link>
      </details>
    </div>
  );
}
