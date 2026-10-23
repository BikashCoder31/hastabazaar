import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listPromoCampaigns } from '@/lib/db/repositories/promo-codes';
import { PromoCodeManager } from '@/components/admin/promo-code-manager';
import {
  IncentivePageNav,
  PromoReportOverview,
  PromoActivityReport,
  IncentiveHistoryReport,
} from '@/components/admin/incentive-reports';
import { getPromoAdminReport } from '@/lib/db/repositories/incentive-reporting';
import { getCommissionRateState } from '@/lib/db/repositories/commission-rates';
import { filtersFromParams } from '@/lib/incentives/reporting';
import { CommissionRateUnavailableError } from '@/lib/db/repositories/business-settings';

export const dynamic = 'force-dynamic';
export default async function PromoCodesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const staff = await requireStaffPage('/admin/promo-codes', 'admin.invite');
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const filters = filtersFromParams((await searchParams) ?? {});
  const [initialPage, result, commission] = await Promise.all([
    listPromoCampaigns(database, {
      actorId: staff.id,
      authSubject: staff.authSubject,
    }),
    getPromoAdminReport(
      database,
      { id: staff.id, authSubject: staff.authSubject },
      filters,
    )
      .then((report) => ({ report, error: '' }))
      .catch(async (error) => {
        if (!(error instanceof RangeError)) throw error;
        const report = await getPromoAdminReport(database, {
          id: staff.id,
          authSubject: staff.authSubject,
        });
        return { report, error: error.message };
      }),
    getCommissionRateState(database).catch(error => { if (error instanceof CommissionRateUnavailableError) return null; throw error; }),
  ]);
  const { report, error: filterError } = result;
  return (
    <div className="grid min-w-0 gap-6">
      <div>
        <p className="eyebrow">Super Admin · Controls</p>
        <h1 className="section-title">Promo codes</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Plan customer discounts, review their cost and inspect order-wise
          usage. Campaign controls, activity and change history stay here.
        </p>
      </div>
      <IncentivePageNav />
      <PromoReportOverview report={report} />
      <section id="manage" className="scroll-mt-28">
        <PromoCodeManager
          role={staff.role}
          initialPage={initialPage}
          defaultCommissionBps={commission?.current.basisPoints}
        />
      </section>
      {filterError ? (
        <p role="alert" className="text-sm text-destructive">
          {filterError} Showing unfiltered records.
        </p>
      ) : null}
      <PromoActivityReport report={report} />
      <IncentiveHistoryReport report={report} path="/admin/promo-codes" />
    </div>
  );
}
