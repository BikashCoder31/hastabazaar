import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getMarketplaceAnalytics } from '@/lib/db/repositories/operations';
import { getCommissionSetting } from '@/lib/db/repositories/marketplace-settings';
import { getCustomerAndTrafficAnalytics } from '@/lib/db/repositories/analytics';
export const dynamic = 'force-dynamic';
const money = (paisa: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    paisa / 100,
  );
const analyticsObservedAt = () => Date.now();
export default async function AdminAnalyticsPage() {
  await requireStaffPage('/admin/analytics', 'audit_log.view');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const now = analyticsObservedAt();
  const [d, commission, audience] = await Promise.all([
    getMarketplaceAnalytics(database),
    getCommissionSetting(database),
    getCustomerAndTrafficAnalytics(database, now),
  ]);
  const commerceCards = [
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
    ['Current commission', `${commission.percent}%`],
  ];
  const customerCards = [
    ['Registered customer accounts', audience.customers.registeredAccounts],
    ['Active customer accounts', audience.customers.activeAccounts],
    ['Registered in last 30 days', audience.customers.registeredLast30Days],
    ['Restricted customer accounts', audience.customers.restrictedAccounts],
  ];
  const trafficCards = [
    ['Estimated browser sessions', audience.traffic.estimatedBrowserSessions],
    ['Page views', audience.traffic.pageViews],
    ['Product views', audience.traffic.productViews],
    ['Add-to-cart events', audience.traffic.addToCarts],
    ['Checkout starts', audience.traffic.checkoutStarts],
    ['Completed-order events', audience.traffic.completedOrders],
  ];
  const formatDate = (value: number) =>
    new Intl.DateTimeFormat('en-NP', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kathmandu',
    }).format(value);
  return (
    <div className="space-y-7">
      <div>
        <AdminPageTitle><h1 className="section-title">Commerce & financial analytics</h1></AdminPageTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Values use integer paisa and live operational records.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {commerceCards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 font-heading text-3xl">{value}</p>
          </div>
        ))}
      </div>
      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <div>
          <p className="eyebrow">Account records</p>
          <h2 className="font-heading text-2xl">Registered customers</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Counts are distinct registered accounts with the customer role. A
            customer who also has another role is counted once; configured
            fictional/test email domains are excluded.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {customerCards.map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 font-heading text-3xl">{value}</p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Roles</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Registered</th>
              </tr>
            </thead>
            <tbody>
              {audience.directory.map((account) => (
                <tr key={account.id} className="border-t">
                  <td className="py-3 pr-3">
                    <span className="block font-medium">
                      {account.displayName}
                    </span>
                    <span className="text-muted-foreground">
                      {account.email}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    {account.roles?.split(',').sort().join(', ')}
                  </td>
                  <td className="py-3 pr-3 capitalize">{account.status}</td>
                  <td className="py-3">{formatDate(account.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Privacy-limited first-party reporting</p>
            <h2 className="font-heading text-2xl">
              Storefront traffic estimates
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              An estimated browser session is an anonymous first-party browser
              cookie, not a verified unique person. Query strings, IP addresses,
              user-agent strings, account identifiers, checkout details,
              cross-site identifiers, and replay data are not stored.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${audience.policy.enabled ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-950'}`}
          >
            Collection {audience.policy.enabled ? 'enabled' : 'disabled'} ·{' '}
            {audience.policy.retentionDays} days
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trafficCards.map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 font-heading text-3xl">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {audience.traffic.lastUpdatedAt
            ? `Last recorded event: ${formatDate(audience.traffic.lastUpdatedAt)}.`
            : 'No retained traffic events are available.'}
        </p>
        {audience.topPaths.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Query-free path</th>
                  <th className="py-2 pr-3">Views</th>
                  <th className="py-2">Estimated sessions</th>
                </tr>
              </thead>
              <tbody>
                {audience.topPaths.map((row) => (
                  <tr key={row.path} className="border-t">
                    <td className="py-3 pr-3 font-mono text-xs">{row.path}</td>
                    <td className="py-3 pr-3">{row.views}</td>
                    <td className="py-3">{row.estimatedSessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
