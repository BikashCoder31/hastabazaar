import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getLoyaltyState } from '@/lib/db/repositories/loyalty';
import { LoyaltyManager } from '@/components/admin/loyalty-manager';
import {
  IncentivePageNav,
  LoyaltyReportOverview,
  LoyaltyActivityReport,
  IncentiveHistoryReport,
} from '@/components/admin/incentive-reports';
import { getLoyaltyAdminReport } from '@/lib/db/repositories/incentive-reporting';
import { filtersFromParams } from '@/lib/incentives/reporting';

export const dynamic = 'force-dynamic';
const loyaltyObservedAt = () => Date.now();
export default async function LoyaltyPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const actor = await requireStaffPage('/admin/loyalty', 'commercial_policy.manage');
  if (actor.role !== 'super_admin') redirect('/staff-access-denied');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const filters = filtersFromParams((await searchParams) ?? {});
  const now = loyaltyObservedAt();
  const [initialState, result] = await Promise.all([
    getLoyaltyState(database, actor.id, now, actor.authSubject),
    getLoyaltyAdminReport(
      database,
      { id: actor.id, authSubject: actor.authSubject },
      filters,
      now,
    )
      .then((report) => ({ report, error: '' }))
      .catch(async (error) => {
        if (!(error instanceof RangeError)) throw error;
        const report = await getLoyaltyAdminReport(
          database,
          { id: actor.id, authSubject: actor.authSubject },
          {},
          now,
        );
        return { report, error: error.message };
      }),
  ]);
  const { report, error: filterError } = result;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <div>
        <p className="eyebrow">Super Admin · Controls</p>
        <h1 className="section-title">Daily loyalty points</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Review daily earning, customer balances and reward costs. Manage
          rules, inspect transactions and follow changes from this page.
        </p>
      </div>
      <IncentivePageNav loyalty />
      <LoyaltyReportOverview report={report} />
      <section id="manage" className="scroll-mt-28">
        <LoyaltyManager
          role={actor.role}
          ownerId={actor.id}
          initialState={initialState}
        />
      </section>
      {filterError ? (
        <p role="alert" className="text-sm text-destructive">
          {filterError} Showing unfiltered records.
        </p>
      ) : null}
      <LoyaltyActivityReport report={report} />
      <IncentiveHistoryReport report={report} path="/admin/loyalty" />
    </div>
  );
}
