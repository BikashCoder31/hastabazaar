import { env } from 'cloudflare:workers';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerAnalytics } from '@/lib/db/repositories/operations';
export const dynamic = 'force-dynamic';
const money = (paisa: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    paisa / 100,
  );
export default async function SellerAnalyticsPage() {
  const seller = await requireSellerPage('/seller/analytics');
  const data = await getSellerAnalytics(
    requireDatabase(env as unknown as { DB?: D1Database }),
    seller.sellerId,
  );
  const cards = [
    ['Orders', data.summary.orderCount],
    ['Delivered sales', money(data.summary.deliveredSalesPaisa)],
    ['Units delivered', data.summary.unitsDelivered],
    ['Return requests', data.summary.returnCount],
  ];
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Seller intelligence</p>
        <h1 className="section-title">Sales & inventory analytics</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 font-heading text-3xl">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-heading text-2xl">Monthly delivered sales</h2>
          {data.monthly.length ? (
            <div className="mt-4 space-y-2">
              {data.monthly.map((row) => (
                <div
                  key={row.month}
                  className="flex justify-between border-b py-2 text-sm"
                >
                  <span>{row.month}</span>
                  <strong>{money(row.salesPaisa)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No delivered sales yet.
            </p>
          )}
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-heading text-2xl">Inventory watch</h2>
          {data.inventory.length ? (
            <div className="mt-4 space-y-2">
              {data.inventory.map((row) => (
                <div
                  key={row.id}
                  className="flex justify-between border-b py-2 text-sm"
                >
                  <span>
                    {row.nameEn}
                    <small className="ml-2 text-muted-foreground">
                      {row.status}
                    </small>
                  </span>
                  <strong>{row.inventoryQuantity}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No products yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
