import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { AdminPageTitle } from '@/components/admin/page-help';
import { adminNavigation } from '@/lib/admin/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { AnalyticsDetails } from './analytics-details';
import { readBusinessReport } from './business-report-data';
import { businessReportRange } from './business-report-range';
import { BusinessReportOverview } from './business-report';

export const dynamic = 'force-dynamic';
const analyticsObservedAt = () => Date.now();

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage('/admin/analytics', 'audit_log.view');
  const params = await searchParams;
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const range = businessReportRange(params.period, analyticsObservedAt());
  const details = params.view === 'details';
  const destinations = new Set(adminNavigation(staff.role, staff.permissions).map(item => item.href));

  return (
    <div className="min-w-0 space-y-[18px]">
      <AdminPageTitle><h1 className="font-heading text-[28px] tracking-tight">Reports</h1></AdminPageTitle>
      {details ? (
        <>
          <Link href={`/admin/analytics?period=${range.period}`} className="admin-button w-fit">Back to business report</Link>
          <AnalyticsDetails database={database} now={range.now} />
        </>
      ) : (
        <BusinessReportOverview
          report={await readBusinessReport(database, range, staff)}
          range={range}
          canViewSellers={destinations.has('/admin/sellers')}
        />
      )}
      <nav className="flex flex-wrap gap-2" aria-label="Detailed reports">
        {!details ? <Link href={`/admin/analytics?view=details&period=${range.period}`} prefetch={false} className="admin-button">Commerce, customers & traffic</Link> : null}
        {[
          ['/admin/commission', 'Commission report'],
          ['/admin/promo-codes', 'Promo code reports'],
          ['/admin/loyalty', 'Loyalty reports'],
        ].filter(([href]) => destinations.has(href)).map(([href, label]) => (
          <Link key={href} href={href} className="admin-button" prefetch={false}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}
