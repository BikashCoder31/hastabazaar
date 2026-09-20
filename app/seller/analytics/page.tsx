import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { Banknote, Boxes, Package, RotateCcw } from 'lucide-react';
import { SellerHeading, SellerMetric } from '@/components/seller/workspace-ui';
import { StatusBadge } from '@/components/admin/status-badge';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerAnalytics } from '@/lib/db/repositories/operations';
import { sellerMoney } from '@/lib/seller/presentation';
export const dynamic = 'force-dynamic';

export default async function SellerAnalyticsPage() {
  const seller = await requireSellerPage('/seller/analytics');
  const data = await getSellerAnalytics(
    requireDatabase(env as unknown as { DB?: D1Database }),
    seller.sellerId,
  );
  const maximum = Math.max(1, ...data.monthly.map((row) => row.salesPaisa));
  return (
    <div className="space-y-7">
      <SellerHeading
        eyebrow="Shop performance"
        title="Sales & inventory"
        description="All-time figures for your items. Delivered sales are gross values, before commission, reserves, and refunds."
      />
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <SellerMetric
          label="Orders"
          value={data.summary.orderCount}
          detail="Orders containing your products"
          icon={Package}
        />
        <SellerMetric
          label="Delivered sales"
          value={sellerMoney(data.summary.deliveredSalesPaisa)}
          detail="Gross value, not payout balance"
          icon={Banknote}
        />
        <SellerMetric
          label="Units delivered"
          value={data.summary.unitsDelivered}
          detail="Completed item quantities"
          icon={Boxes}
        />
        <SellerMetric
          label="Return requests"
          value={data.summary.returnCount}
          detail="Includes resolved and rejected cases"
          icon={RotateCcw}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-heading text-2xl">Monthly delivered sales</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Up to 12 recent months with deliveries, grouped by UTC delivery
            date.
          </p>
          {data.monthly.length ? (
            <ul className="mt-5 space-y-5">
              {data.monthly.map((row) => (
                <li key={row.month}>
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span>{row.month}</span>
                    <strong>{sellerMoney(row.salesPaisa)}</strong>
                  </div>
                  <div
                    aria-hidden="true"
                    className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: (row.salesPaisa / maximum) * 100 + '%' }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl bg-secondary/40 p-5 text-base text-muted-foreground">
              No delivered sales yet.
            </p>
          )}
        </section>
        <section className="rounded-2xl border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-2xl">Inventory watch</h2>
            <Link href="/seller/products" className="section-link">
              Update stock →
            </Link>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Up to 50 listings, lowest stock first.
          </p>
          {data.inventory.length ? (
            <ul className="mt-4 divide-y">
              {data.inventory.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="break-words text-base font-semibold">
                      {row.nameEn}
                    </p>
                    <span className="mt-2 block">
                      <StatusBadge status={row.status} />
                    </span>
                  </div>
                  <span
                    className={
                      'shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ' +
                      (row.inventoryQuantity <= 5
                        ? 'bg-amber-50 text-amber-900'
                        : 'bg-secondary text-primary')
                    }
                  >
                    {row.inventoryQuantity} units
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-base text-muted-foreground">
              No products yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
