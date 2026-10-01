import { env } from 'cloudflare:workers';
import Link from 'next/link';
import {
  ArrowRight,
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  Clock3,
  FileText,
  HandCoins,
  Package,
  PackageCheck,
  Percent,
} from 'lucide-react';
import {
  SellerEmpty,
  SellerHeading,
  SellerMetric,
} from '@/components/seller/workspace-ui';
import { SellerOrderList } from '@/components/seller/seller-order-list';
import { SellerAgreementAcceptance } from '@/components/seller/seller-agreement-acceptance';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerProductStats } from '@/lib/db/repositories/products';
import { getCommissionSetting } from '@/lib/db/repositories/marketplace-settings';
import { listOrdersForSeller } from '@/lib/db/repositories/orders';
import { getSellerFinanceSummary } from '@/lib/db/repositories/payouts';
import { getSellerWorkSummary } from '@/lib/db/repositories/seller-workspace';
import { sellerMoney } from '@/lib/seller/presentation';
import { SELLER_AGREEMENT_VERSION } from '@/lib/content/legal-policies';

export const dynamic = 'force-dynamic';
export default async function SellerDashboardPage() {
  const seller = await requireSellerPage('/seller');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [products, work, finance, orders, commission] = await Promise.all([
    getSellerProductStats(db, seller.sellerId),
    getSellerWorkSummary(db, seller.sellerId),
    getSellerFinanceSummary(db, seller.sellerId),
    listOrdersForSeller(db, seller.sellerId, 4),
    getCommissionSetting(db),
  ]);
  return (
    <div className="space-y-7">
      <SellerHeading
        eyebrow="Shop overview"
        title={seller.tradingName}
        description="Prepare your orders, manage listings, and keep track of earnings."
      />
      {seller.sellerAgreementVersion !== SELLER_AGREEMENT_VERSION ? (
        <SellerAgreementAcceptance />
      ) : null}
      <section>
        <h2 className="font-heading text-2xl">Product overview</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Live totals update whenever a listing changes status.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SellerMetric
          label="Total products"
          value={products.total}
          detail="All current listings"
          icon={Package}
          href="/seller/products"
        />
        <SellerMetric
          label="Published / active"
          value={products.published}
          detail="Visible to customers"
          icon={PackageCheck}
          href="/seller/products?status=published"
        />
        <SellerMetric
          label="Pending approval"
          value={products.pendingApproval}
          detail="Submitted or awaiting publication"
          icon={Clock3}
          href="/seller/products?status=pending"
        />
        <SellerMetric
          label="Rejected"
          value={products.rejected}
          detail="Closed with a reviewer reason"
          icon={AlertTriangle}
          href="/seller/products?status=rejected"
        />
        <SellerMetric
          label="Drafts"
          value={products.drafts}
          detail="Not yet submitted"
          icon={FileText}
          href="/seller/products?status=draft"
        />
        <SellerMetric
          label="Out of stock"
          value={products.outOfStock}
          detail="Published listings with zero stock"
          icon={Boxes}
          href="/seller/products?status=out_of_stock"
        />
      </div>
      {products.rejected ||
      products.needsChanges ||
      products.outOfStock ||
      products.pendingApproval ? (
        <section className="space-y-2 rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="font-heading text-2xl">Product alerts</h2>
          {products.rejected ? (
            <Link
              className="flex items-center justify-between rounded-xl bg-destructive/5 p-4 text-sm font-semibold text-destructive"
              href="/seller/products?status=rejected"
            >
              <span>
                {products.rejected} product{products.rejected === 1 ? '' : 's'}{' '}
                rejected and requiring correction.
              </span>
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
          {products.needsChanges ? (
            <Link
              className="flex items-center justify-between rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900"
              href="/seller/products?status=needs_changes"
            >
              <span>
                {products.needsChanges} product
                {products.needsChanges === 1 ? '' : 's'} need changes.
              </span>
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
          {products.outOfStock ? (
            <Link
              className="flex items-center justify-between rounded-xl bg-secondary/60 p-4 text-sm font-semibold"
              href="/seller/products?status=out_of_stock"
            >
              <span>
                {products.outOfStock} published product
                {products.outOfStock === 1 ? ' is' : 's are'} out of stock.
              </span>
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
          {products.pendingApproval ? (
            <Link
              className="flex items-center justify-between rounded-xl bg-primary/5 p-4 text-sm font-semibold text-primary"
              href="/seller/products?status=pending"
            >
              <span>
                {products.pendingApproval} product
                {products.pendingApproval === 1 ? ' is' : 's are'} waiting for
                approval.
              </span>
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </section>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SellerMetric
          label="Orders to pack"
          value={work.toPack}
          detail="Confirmed items waiting for you"
          icon={Package}
          href="/seller/orders"
        />
        <SellerMetric
          label="Available balance"
          value={sellerMoney(finance.availablePaisa)}
          detail="After holds and allocated payouts"
          icon={HandCoins}
          href="/seller/finance"
        />
        <SellerMetric
          label="Marketplace commission"
          value={`${commission.percent}%`}
          detail="Current rate for new orders"
          icon={Percent}
          href="/seller/finance"
        />
      </div>
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-heading text-2xl">
          <ClipboardCheck className="size-5 text-primary" />
          Work in progress
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: 'Being packed',
              value: work.packing,
              href: '/seller/orders',
            },
            {
              label: 'Ready for pickup',
              value: work.ready,
              href: '/seller/shipping',
            },
            {
              label: 'Listing changes requested',
              value: work.needsChanges,
              href: '/seller/products',
            },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 p-4 hover:bg-secondary"
            >
              <span className="text-sm font-semibold">{item.label}</span>
              <span className="text-xl font-semibold tabular-nums">
                {item.value}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-2xl">Recent orders</h2>
          <Link href="/seller/orders" className="section-link">
            All orders
            <ArrowRight className="size-4" />
          </Link>
        </div>
        {orders.length ? (
          <SellerOrderList orders={orders} />
        ) : (
          <SellerEmpty
            icon={Package}
            title="Your first order will appear here"
            description="Submit a product for review to start building your shop."
            href="/seller/products/new"
            action="Add a product"
          />
        )}
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/seller/cases"
          className="rounded-2xl border bg-card p-6 hover:border-primary/50"
        >
          <h2 className="font-heading text-2xl">Returns & complaints</h2>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Respond to cases for your items. HastaBazaar reviews the final
            outcome.
          </p>
          <span className="section-link mt-3">
            Open cases
            <ArrowRight className="size-4" />
          </span>
        </Link>
        <Link
          href="/seller/profile"
          className="rounded-2xl border bg-card p-6 hover:border-primary/50"
        >
          <h2 className="font-heading text-2xl">Your maker profile</h2>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Keep your story, craft specialties, and support details up to date.
          </p>
          <span className="section-link mt-3">
            Edit shop profile
            <ArrowRight className="size-4" />
          </span>
        </Link>
      </div>
    </div>
  );
}
