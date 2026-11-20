import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';
import { redirect,notFound } from 'next/navigation';
import Link from 'next/link';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listPromoCampaigns,getPromoCampaign } from '@/lib/db/repositories/promo-codes';
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
  const staff = await requireStaffPage('/admin/promo-codes', 'commercial_policy.manage');
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const params=(await searchParams)??{},selector=params.campaign;
  if(selector!==undefined&&(typeof selector!=='string'||!selector.trim()||selector.length>191))notFound();
  const filters = filtersFromParams(params);
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
  const selected=typeof selector==='string'?await getPromoCampaign(database,{actorId:staff.id,authSubject:staff.authSubject,campaignId:selector}):null;
  const focusedPage=selected?{...initialPage,campaigns:[selected,...initialPage.campaigns.filter(c=>c.campaignId!==selected.campaignId)]}:initialPage;
  return (
    <div className="grid min-w-0 gap-6">
      <Link href={safeAdminReturnTo(params.returnTo,'/admin/fees?view=discounts')} className="section-link underline">Back to previous view</Link>
      <div>
        <AdminPageTitle><h1 className="section-title">Promo codes</h1></AdminPageTitle>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Plan customer discounts, review their cost and inspect order-wise
          usage. Campaign controls, activity and change history stay here.
        </p>
      </div>
      <IncentivePageNav />
      <PromoReportOverview report={report} />
      <section id="manage" className="scroll-mt-28">
        <PromoCodeManager
          actorId={staff.id}
          role={staff.role}
          initialPage={focusedPage}
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
