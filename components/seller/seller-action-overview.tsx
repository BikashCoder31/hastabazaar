import Link from 'next/link';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import type { SellerProductStats } from '@/lib/db/repositories/products';
import type { SellerWorkSummary } from '@/lib/db/repositories/seller-workspace';

export function SellerActionOverview({
  products,
  work,
  cases,
}: {
  products: SellerProductStats;
  work: SellerWorkSummary;
  cases: { returns: number; complaints: number };
}) {
  const tasks = [
    {
      label: 'Orders to pack',
      count: work.toPack,
      detail: 'Confirmed orders waiting for your shop.',
      action: 'Start packing',
      href: '/seller/orders',
    },
    {
      label: 'Packing in progress',
      count: work.packing,
      detail: 'Finish preparing your items for collection.',
      action: 'Continue packing',
      href: '/seller/orders',
    },
    {
      label: 'Ready for pickup',
      count: work.ready,
      detail: 'Check the collection arrangements.',
      action: 'View shipping',
      href: '/seller/shipping',
    },
    {
      label: 'Listing changes',
      count: products.needsChanges,
      detail: 'A reviewer has requested corrections.',
      action: 'Review changes',
      href: '/seller/products?status=needs_changes',
    },
    {
      label: 'Out of stock',
      count: products.outOfStock,
      detail: 'Published products with no stock available.',
      action: 'Update stock',
      href: '/seller/products?status=out_of_stock',
    },
    {
      label: 'Cases awaiting your response',
      count: cases.returns + cases.complaints,
      detail: 'Return requests or complaints you can answer.',
      action: 'Review cases',
      href: '/seller/cases',
    },
  ].filter((task) => task.count > 0);
  return (
    <section
      aria-labelledby="seller-actions-title"
      className="rounded-2xl border bg-card p-5 sm:p-6"
    >
      <h2
        id="seller-actions-title"
        className="flex items-center gap-2 font-heading text-2xl"
      >
        <ClipboardCheck
          aria-hidden="true"
          className="size-5 shrink-0 text-primary"
        />
        Needs your action
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Start with your orders, then review listings and customer cases.
      </p>
      {tasks.length ? (
        <ul className="mt-4 divide-y">
          {tasks.map((task) => (
            <li key={task.label}>
              <Link
                href={task.href}
                className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl px-1 py-4 hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block font-semibold">
                    {task.label}{' '}
                    <span className="ml-2 tabular-nums text-primary">
                      {task.count}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                    {task.detail}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  {task.action}
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-secondary/50 p-4 text-sm leading-6">
          No tasks need your action right now. You can check orders or keep your
          products up to date.
        </p>
      )}
      {work.awaitingConfirmation > 0 ? (
        <div className="mt-4 border-t pt-4">
          <h3 className="font-semibold">Waiting for staff confirmation</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {work.awaitingConfirmation} first-time COD order
            {work.awaitingConfirmation === 1 ? ' needs' : 's need'} staff
            confirmation before packing. You do not need to start packing yet.
          </p>
          <Link href="/seller/orders" className="section-link mt-2 min-h-11">
            View order status
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      ) : null}
      {products.pendingApproval ? (
        <div className="mt-4 border-t pt-4">
          <h3 className="font-semibold">Waiting for review</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {products.pendingApproval} listing
            {products.pendingApproval === 1 ? '' : 's'} awaiting review or
            publication. No correction is requested at this stage.
          </p>
          <Link
            href="/seller/products?status=pending"
            className="section-link mt-2 min-h-11"
          >
            View review status
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
