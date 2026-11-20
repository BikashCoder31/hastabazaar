import { withFirstCodPresentation } from '@/lib/orders/first-cod-review';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { PackageOpen } from 'lucide-react';
import { OrderStatusBadge } from '@/components/commerce/order-status-badge';
import { AdminQueueFields } from '@/components/admin/admin-queue-fields';
import { SharedReviewQueue } from '@/components/admin/shared-review-queue';
import { readAdminReviewTasks } from '@/components/admin/admin-review-data';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  listOrdersForOperations,
  countOrdersForOperations,
} from '@/lib/db/repositories/orders';
import {
  normalizeQueueFilters,
  orderQueueStatuses,
  queuePageHref,
} from '@/lib/admin/queue-filters';
import { loadQueryPresentationConfig } from '@/lib/catalog/shop-query';
import { adminNavigation } from '@/lib/admin/navigation';
export const dynamic = 'force-dynamic';
const pageSize = 50;
const money = (paisa: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    paisa / 100,
  );
const date = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kathmandu',
});
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; page?: string; workspace?: string }>;
}) {
  const staff = await requireStaffPage('/admin/orders', 'order.manage');
  const database = requireDatabase(env as unknown as { DB?: D1Database }),
    params = (await searchParams) ?? {};
  if (params.workspace === 'answers') {
    const tasks = await readAdminReviewTasks(database, staff.id);
    const riderHistory = adminNavigation(staff.role, staff.permissions).some(link => link.href === '/admin/riders');
    return (
      <div className="space-y-5">
        <h1 className="section-title">Seller &amp; rider answers</h1>
        {riderHistory ? <Link href="/admin/riders/form-history?kind=report" className="section-link">Rider form history</Link> : null}
        <SharedReviewQueue tasks={tasks?.filter(task => task.sourceType === 'order_response') ?? []}
          actorId={staff.id} unavailable={tasks === null} />
      </div>
    );
  }
  const filters = normalizeQueueFilters(params, orderQueueStatuses);
  const [total, presentation] = await Promise.all([
    countOrdersForOperations(database, filters),
    loadQueryPresentationConfig(database, 'staff.order-queue-filter'),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize)),
    requestedPage = Number(params.page ?? 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, pageCount)
      : 1;
  const orders = await listOrdersForOperations(
      database,
      pageSize,
      filters,
      page,
    ),
    displayed = await withFirstCodPresentation(database, orders);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">Order operations</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">Orders</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Find an order, check confirmation and seller readiness, then manage
          fulfillment from its details.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Find an order</CardTitle>
          <CardDescription>
            Search the complete order history, including orders on other pages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            data-form-id="staff.order-queue-filter"
            method="GET"
            action="/admin/orders"
            className="flex flex-col gap-4"
          >
            <AdminQueueFields
              id="order-queue"
              formId="staff.order-queue-filter"
              filters={filters}
              statuses={orderQueueStatuses}
              presentation={presentation.config}
              searchHelp="Order reference, buyer email or phone."
            />
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              {filters.q || filters.status ? (
                <Button
                  className="flex-1 sm:flex-none"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/admin/orders" />}
                >
                  Clear filters
                </Button>
              ) : null}
              <Button type="submit" className="flex-1 sm:flex-none">
                Apply filters
              </Button>
            </div>
          </form>
          {presentation.unavailable ? (
            <output className="block mt-3 text-sm text-muted-foreground">
              Filter labels could not load. Standard filters remain available.
            </output>
          ) : null}
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        {total} matching {total === 1 ? 'order' : 'orders'} · Page {page} of{' '}
        {pageCount}
      </p>
      {!orders.length ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageOpen />
                </EmptyMedia>
                <EmptyTitle>
                  {filters.q || filters.status
                    ? 'No matching orders'
                    : 'No orders yet'}
                </EmptyTitle>
                <EmptyDescription>
                  {filters.q || filters.status
                    ? 'Try a different reference or status, or clear the filters.'
                    : 'New orders will appear here after they are placed.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-4">Order</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Items</th>
                  <th className="p-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayed.map((order) => (
                  <tr key={order.id}>
                    <td className="p-4">
                      <Link
                        href={'/admin/orders/' + order.id}
                        className="inline-flex min-h-11 items-center font-semibold hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {date.format(new Date(order.placedAt))}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="block">{order.customerPhone}</span>
                      <span className="text-xs text-muted-foreground">
                        {order.customerEmail}
                      </span>
                    </td>
                    <td className="p-4">
                      <OrderStatusBadge
                        status={
                          order.firstCodPending
                            ? 'awaiting_cod_confirmation'
                            : order.status
                        }
                      />
                    </td>
                    <td className="p-4">{order.itemCount}</td>
                    <td className="p-4 text-right font-semibold">
                      {money(order.grandTotalPaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {pageCount > 1 ? (
        <nav
          aria-label="Order queue pages"
          className="flex items-center justify-between gap-4"
        >
          {page > 1 ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={queuePageHref('/admin/orders', filters, page - 1)}
                />
              }
            >
              Previous
            </Button>
          ) : (
            <span />
          )}
          {page < pageCount ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={queuePageHref('/admin/orders', filters, page + 1)}
                />
              }
            >
              Next
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
