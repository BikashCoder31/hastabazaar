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
        <ul className="divide-y text-sm md:hidden">
          {audience.directory.map((account) => (
            <li key={account.id} className="space-y-2 py-3">
              <div className="wrap-anywhere">
                <p className="font-medium">{account.displayName}</p>
                <p className="text-muted-foreground">{account.email}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2">
                <div className="min-w-0 wrap-anywhere">
                  <dt className="font-medium text-muted-foreground">Roles</dt>
                  <dd>{account.roles?.split(',').sort().join(', ')}</dd>
                </div>
                <div className="min-w-0 wrap-anywhere">
                  <dt className="font-medium text-muted-foreground">Status</dt>
                  <dd className="capitalize">{account.status}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-medium text-muted-foreground">Registered</dt>
                  <dd>{formatDate(account.createdAt)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <table aria-label="Registered customers" className="hidden w-full table-fixed text-left text-sm md:table">
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="w-[38%] py-2 pr-3">Account</th>
              <th scope="col" className="w-[22%] py-2 pr-3">Roles</th>
              <th scope="col" className="w-[15%] py-2 pr-3">Status</th>
              <th scope="col" className="py-2">Registered</th>
            </tr>
          </thead>
          <tbody>
            {audience.directory.map((account) => (
              <tr key={account.id} className="border-t">
                <td className="wrap-anywhere py-3 pr-3">
                  <span className="block font-medium">{account.displayName}</span>
                  <span className="text-muted-foreground">{account.email}</span>
                </td>
                <td className="wrap-anywhere py-3 pr-3">
                  {account.roles?.split(',').sort().join(', ')}
                </td>
                <td className="wrap-anywhere py-3 pr-3 capitalize">{account.status}</td>
                <td className="py-3">{formatDate(account.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
        {audience.topPaths.length > 0 && <>
          <ul className="divide-y text-sm md:hidden">
            {audience.topPaths.map((row) => (
              <li key={row.path} className="space-y-2 py-3">
                <p className="wrap-anywhere font-mono text-xs">{row.path}</p>
                <dl className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="font-medium text-muted-foreground">Views</dt>
                    <dd>{row.views}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">Estimated sessions</dt>
                    <dd>{row.estimatedSessions}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <table aria-label="Storefront traffic estimates" className="hidden w-full table-fixed text-left text-sm md:table">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="w-1/2 py-2 pr-3">Query-free path</th>
                <th scope="col" className="w-1/5 py-2 pr-3">Views</th>
                <th scope="col" className="py-2">Estimated sessions</th>
              </tr>
            </thead>
            <tbody>
              {audience.topPaths.map((row) => (
                <tr key={row.path} className="border-t">
                  <td className="wrap-anywhere py-3 pr-3 font-mono text-xs">{row.path}</td>
                  <td className="py-3 pr-3">{row.views}</td>
                  <td className="py-3">{row.estimatedSessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}
      </section>
    </div>
  );
}
