import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getMarketplaceAnalytics } from '@/lib/db/repositories/operations';
export const dynamic = 'force-dynamic';
const money = (paisa: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    paisa / 100,
  );
export default async function AdminAnalyticsPage() {
  await requireStaffPage('/admin/analytics', 'audit_log.view');
  const d = await getMarketplaceAnalytics(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  const cards = [
    ['Orders', d.commerce?.orders ?? 0],
    ['Gross order value', money(d.commerce?.grossOrderValuePaisa ?? 0)],
    ['Delivered value', money(d.commerce?.deliveredValuePaisa ?? 0)],
    [
      'Approved sellers',
      `${d.sellers?.approved ?? 0} / ${d.sellers?.total ?? 0}`,
    ],
    ['Returns', d.cases?.returns ?? 0],
    ['Open complaints', d.cases?.openComplaints ?? 0],
    ['Refunded', money(d.finance?.refundedPaisa ?? 0)],
    ['Paid out', money(d.finance?.paidOutPaisa ?? 0)],
  ];
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Marketplace reporting</p>
        <h1 className="section-title">Commerce & financial analytics</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Values use integer paisa and live operational records.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 font-heading text-3xl">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
