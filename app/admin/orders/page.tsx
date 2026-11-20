import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ArrowRight, ListFilter, PackageOpen, Search, X } from 'lucide-react';
import { SharedReviewQueue } from '@/components/admin/shared-review-queue';
import { readAdminReviewTasks } from '@/components/admin/admin-review-data';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { can } from '@/lib/marketplace/permissions';
import { orderQueueStatuses } from '@/lib/admin/queue-filters';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { getOperationsOrderDetail } from '@/lib/db/repositories/fulfillment';
import {
  loadQueryPresentationConfig,
  queryFieldPresentation,
} from '@/lib/catalog/shop-query';
import { OrderQueueLink, OrderQueueNavigation } from './order-queue-navigation';
import {
  orderContact,
  queueCash,
  readOrderQueue,
  type OrderQueueParams,
} from './read-order-queue';
import {
  formatOrderTime,
  orderDeadline,
  orderMoney,
  orderPaymentMode,
  orderQueueHref,
  orderStage,
  orderViews,
} from './order-queue-presentation';
import { OrderStageBadge } from './order-stage-badge';

export const dynamic = 'force-dynamic';
const filterFormId = 'staff.order-queue-filter';
const requestTime = () => Date.now();
const fieldClass =
  'min-h-11 w-full min-w-0 rounded-lg border border-[#D4C2A6] bg-card px-3 text-sm';
const buttonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#D4C2A6] px-3 text-sm font-semibold hover:bg-[#EEE5D5]';

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<OrderQueueParams>;
}) {
  const staff = await requireStaffPage('/admin/orders', 'order.manage');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const params = (await searchParams) ?? {};
  if (params.workspace === 'answers') {
    const tasks = await readAdminReviewTasks(database, staff.id);
    return (
      <div className="space-y-5">
        <AdminPageTitle>
          <h1 className="section-title">Seller answers</h1>
        </AdminPageTitle>
        <SharedReviewQueue
          tasks={
            tasks?.filter((task) => task.sourceType === 'order_response') ?? []
          }
          actorId={staff.id}
          unavailable={tasks === null}
        />
      </div>
    );
  }
  const now = requestTime();
  const [
    { filters, orders, total, page, pageCount, offset, viewCounts },
    presentation,
  ] = await Promise.all([
    readOrderQueue(database, params, {
      now,
      isSuperAdmin: staff.role === 'super_admin',
      canViewFinanceFollowups: can(staff, 'payout.prepare'),
    }),
    loadQueryPresentationConfig(database, filterFormId),
  ]);
  const searched = queryFieldPresentation(
    filterFormId,
    presentation.config,
    'q',
    {
      label: 'Find an order',
      placeholder: 'Order, customer, seller or phone',
      helpText: 'Search by order number, customer, seller, email or phone.',
    },
  );
  const statusField = queryFieldPresentation(
    filterFormId,
    presentation.config,
    'status',
    { label: 'Stage' },
  );
  const selection =
    orders.find((order) => order.id === params.order) ?? orders[0];
  const selected = selection
    ? await getOperationsOrderDetail(database, selection.id)
    : null;
  const recentHistory = selected
    ? [
        ...selected.history.map((event) => ({
          id: event.id,
          status: event.toStatus,
          time: event.createdAt,
        })),
        ...(selected.deliveredAt &&
        !selected.history.some((event) => event.toStatus === 'delivered')
          ? [
              {
                id: 'recorded-delivery',
                status: 'delivered',
                time: selected.deliveredAt,
              },
            ]
          : []),
      ]
        .sort((left, right) => right.time - left.time)
        .slice(0, 3)
        .reverse()
    : [];
  const selectedSellers = selected
    ? [...new Set(selected.items.map((item) => item.sellerName))]
    : [];
  const returnTo = orderQueueHref(filters, page, selection?.id);
  const detailHref = selected
    ? withAdminReturnTo(
        '/admin/orders/' + encodeURIComponent(selected.id),
        returnTo,
      )
    : '';
  const records = orders.map((order) => {
    const contact = orderContact(order.addressJson);
    const status = order.parcelProblem ? 'delivery_failed' : order.status;
    const deadline = order.dueAt ?? order.pickupAt;
    return {
      ...order,
      status,
      contact,
      customer:
        contact?.recipientName || order.customerPhone || order.customerEmail,
      location: [contact?.locality, contact?.municipality || contact?.district]
        .filter(Boolean)
        .join(', '),
      seller:
        order.sellerCount > 1
          ? order.sellerName + ' +' + (order.sellerCount - 1)
          : order.sellerName,
      cash: queueCash(order),
      due: order.customerUnavailable
        ? 'Couldn’t reach customer'
        : order.parcelProblem
          ? 'Parcel problems'
          : (orderDeadline(deadline, now) ??
            (order.status === 'delivered' ? 'Done' : '—')),
      urgent: Boolean(
        order.parcelProblem || (deadline !== null && deadline <= now),
      ),
      href: orderQueueHref(filters, page, order.id) + '#order-preview',
    };
  });
  const activeFilters = [
    { key: 'q' as const, label: 'Search', value: filters.q },
    {
      key: 'status' as const,
      label: 'Stage',
      value: filters.status ? orderStage(filters.status) : '',
    },
    { key: 'seller' as const, label: 'Seller', value: filters.seller },
  ].filter((filter) => filter.value);

  return (
    <div className="min-w-0 space-y-4">
      <AdminPageTitle>
        <h1 className="font-heading text-3xl tracking-tight">Orders</h1>
      </AdminPageTitle>
      <div
        className={
          selected
            ? 'grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_17rem] 2xl:grid-cols-[minmax(0,1fr)_19rem]'
            : 'min-w-0'
        }
      >
        <OrderQueueNavigation
          formId={filterFormId}
          updatedAt={now}
          exportRows={[
            [
              'Order',
              'Placed (Nepal time)',
              'Customer',
              'Seller',
              'Stage',
              'Cash',
              'Total (NPR)',
              'Due',
            ],
            ...records.map((row) => [
              row.orderNumber,
              formatOrderTime(row.placedAt),
              row.customer,
              row.seller,
              orderStage(row.status),
              row.cash,
              row.grandTotalPaisa / 100,
              row.due,
            ]),
          ]}
          toolbar={
            <form
              key={orderQueueHref(filters)}
              data-form-id="staff.order-queue-filter"
              method="GET"
              action="/admin/orders"
              className="contents sm:grid sm:min-w-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-2"
            >
              {filters.view && filters.view !== 'all' ? (
                <input type="hidden" name="view" value={filters.view} />
              ) : null}
              <div className="relative col-span-3 min-w-0 sm:col-span-1">
                <label htmlFor="order-search" className="sr-only">
                  {searched.label}
                </label>
                <input
                  id="order-search"
                  name="q"
                  type="search"
                  maxLength={120}
                  defaultValue={filters.q}
                  placeholder={searched.placeholder}
                  className={fieldClass + ' pl-11'}
                  aria-describedby={
                    searched.helpText ? 'order-search-help' : undefined
                  }
                />
                {searched.helpText ? (
                  <p id="order-search-help" className="sr-only">
                    {searched.helpText}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="absolute left-0 top-0 grid size-11 place-items-center rounded-l-lg text-muted-foreground"
                  aria-label="Search orders"
                >
                  <Search className="size-4" aria-hidden="true" />
                </button>
              </div>
              <details className="relative sm:static">
                <summary
                  className={
                    buttonClass +
                    ' cursor-pointer list-none [&::-webkit-details-marker]:hidden'
                  }
                >
                  <ListFilter className="size-4" aria-hidden="true" /> Filters
                </summary>
                <div className="absolute left-0 top-full z-20 mt-2 w-[min(19rem,calc(100vw-2rem))] space-y-3 rounded-xl border bg-card p-4 shadow-lg sm:left-auto sm:right-0 sm:w-80">
                  <label className="block space-y-1 text-sm font-semibold">
                    {statusField.label}
                    <select
                      name="status"
                      defaultValue={filters.status || ''}
                      className={fieldClass}
                    >
                      <option value="">All stages</option>
                      {orderQueueStatuses.map((status) => (
                        <option value={status} key={status}>
                          {orderStage(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {statusField.helpText ? (
                    <p className="text-sm text-muted-foreground">
                      {statusField.helpText}
                    </p>
                  ) : null}
                  <label className="block space-y-1 text-sm font-semibold">
                    Seller
                    <input
                      name="seller"
                      maxLength={160}
                      defaultValue={filters.seller}
                      placeholder="Seller name"
                      className={fieldClass}
                    />
                  </label>
                  <button
                    className={
                      buttonClass +
                      ' w-full bg-[#14213D] text-white hover:bg-[#26324C]'
                    }
                    type="submit"
                  >
                    Apply filters
                  </button>
                </div>
              </details>
            </form>
          }
        >
          <nav
            aria-label="Order views and filters"
            className="flex min-w-0 flex-wrap items-center gap-1.5"
          >
            {orderViews.map(([value, label]) => (
              <OrderQueueLink
                key={value}
                href={orderQueueHref({ ...filters, view: value })}
                className={
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap ' +
                  (filters.view === value
                    ? 'border-[#14213D] bg-[#14213D] text-white'
                    : 'border-[#D4C2A6] bg-card hover:bg-[#EEE5D5]')
                }
                aria-current={filters.view === value ? 'page' : undefined}
              >
                {label} <span className="opacity-80">{viewCounts[value]}</span>
              </OrderQueueLink>
            ))}
            {activeFilters.map(({ key, label, value }) => (
              <OrderQueueLink
                key={key}
                href={orderQueueHref({ ...filters, [key]: '' })}
                className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-full bg-[#EEE5D5] px-3 text-sm font-semibold"
                aria-label={
                  'Remove ' + label.toLowerCase() + ' filter ' + value
                }
              >
                <span className="break-all">
                  {label} · {value}
                </span>
                <X className="size-4 shrink-0" aria-hidden="true" />
              </OrderQueueLink>
            ))}
            {activeFilters.length || filters.view !== 'all' ? (
              <OrderQueueLink
                href="/admin/orders"
                className="inline-flex min-h-11 items-center px-2 text-sm text-[#46536F] underline underline-offset-4"
              >
                Clear all
              </OrderQueueLink>
            ) : null}
          </nav>
          {presentation.unavailable ? (
            <p className="text-sm text-muted-foreground">
              Filter labels could not load. Standard filters are available.
            </p>
          ) : null}
          {!records.length ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <PackageOpen
                className="mx-auto mb-2 size-6 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="font-semibold">
                {activeFilters.length || filters.view !== 'all'
                  ? 'No matching orders'
                  : 'No orders yet'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeFilters.length || filters.view !== 'all'
                  ? 'Try another search or clear the filters.'
                  : 'New orders will appear here after they are placed.'}
              </p>
            </div>
          ) : (
            <>
              <ul className="grid gap-2 md:hidden" aria-label="Orders">
                {records.map((row) => (
                  <li key={row.id}>
                    <OrderQueueLink
                      href={row.href}
                      selection
                      aria-current={
                        selection?.id === row.id ? 'true' : undefined
                      }
                      className={
                        'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 rounded-xl border p-3.5 hover:bg-[#F3E6C9] ' +
                        (selection?.id === row.id ? 'bg-[#F3E6C9]' : 'bg-card')
                      }
                    >
                      <span className="min-w-0 break-words">
                        <strong>{row.orderNumber}</strong>
                        <span className="block text-xs text-muted-foreground">
                          {formatOrderTime(row.placedAt)}
                        </span>
                      </span>
                      <OrderStageBadge status={row.status} />
                      <span className="min-w-0 break-words text-sm">
                        {row.customer}
                        <span className="block text-xs text-muted-foreground">
                          {row.seller}
                        </span>
                      </span>
                      <strong className="text-right text-sm">
                        {orderMoney(row.grandTotalPaisa)}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {row.cash}
                      </span>
                      <span
                        className={
                          'text-right text-xs font-semibold ' +
                          (row.urgent ? 'text-[#A8232E]' : 'text-[#46536F]')
                        }
                      >
                        {row.due}
                      </span>
                    </OrderQueueLink>
                  </li>
                ))}
              </ul>
              <div className="hidden min-w-0 overflow-hidden rounded-xl border bg-card md:block">
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <thead className="border-b bg-[#F9F6EF] text-[#675B4E]">
                    <tr>
                      {[
                        ['Order', 'w-[17%]'],
                        ['Customer', 'w-[17%]'],
                        ['Seller', 'w-[13%]'],
                        ['Stage', 'w-[17%]'],
                        ['Cash', 'w-[12%]'],
                        ['Total', 'w-[13%] text-right'],
                        ['Due', 'w-[11%]'],
                      ].map(([label, style]) => (
                        <th
                          key={label}
                          scope="col"
                          className={'px-2 py-3 font-semibold ' + style}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {records.map((row) => (
                      <tr
                        key={row.id}
                        className={
                          selection?.id === row.id
                            ? 'bg-[#F3E6C9]'
                            : 'hover:bg-[#FAF7F0]'
                        }
                      >
                        <td className="px-2 py-2">
                          <OrderQueueLink
                            href={row.href}
                            selection
                            aria-current={
                              selection?.id === row.id ? 'true' : undefined
                            }
                            className="inline-flex min-h-11 min-w-0 max-w-full flex-col justify-center break-words font-semibold hover:underline"
                          >
                            {row.orderNumber}
                            <span className="block text-xs font-normal text-muted-foreground">
                              {formatOrderTime(row.placedAt)}
                            </span>
                          </OrderQueueLink>
                        </td>
                        <td className="wrap-anywhere px-2 py-2">
                          {row.customer}
                          <span className="block text-xs text-muted-foreground">
                            {row.location}
                          </span>
                        </td>
                        <td className="wrap-anywhere px-2 py-2">
                          {row.seller}
                        </td>
                        <td className="px-2 py-2">
                          <OrderStageBadge status={row.status} />
                        </td>
                        <td className="px-2 py-2 text-xs text-[#46536F]">
                          {row.cash}
                        </td>
                        <td className="wrap-anywhere px-2 py-2 text-right text-[0.8125rem] font-semibold tabular-nums">
                          {orderMoney(row.grandTotalPaisa)}
                        </td>
                        <td
                          className={
                            'px-2 py-2 text-xs font-semibold ' +
                            (row.urgent ? 'text-[#A8232E]' : 'text-[#46536F]')
                          }
                        >
                          {row.due}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <nav
            aria-label="Order queue pages"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <p className="text-sm text-[#46536F]">
              {records.length
                ? `Showing ${offset + 1}–${offset + records.length} of ${total}`
                : 'Showing 0 orders'}
            </p>
            {pageCount > 1 ? (
              <div className="flex gap-2">
                {page > 1 ? (
                  <OrderQueueLink
                    className={buttonClass}
                    href={orderQueueHref(filters, page - 1)}
                  >
                    Previous
                  </OrderQueueLink>
                ) : null}
                {page < pageCount ? (
                  <OrderQueueLink
                    className={buttonClass}
                    href={orderQueueHref(filters, page + 1)}
                  >
                    Next
                  </OrderQueueLink>
                ) : null}
              </div>
            ) : null}
          </nav>
        </OrderQueueNavigation>
        {selected && selection ? (
          <aside
            id="order-preview"
            aria-labelledby="order-preview-title"
            className="flex min-w-0 scroll-mt-20 flex-col gap-4 rounded-xl border bg-[#FCF9F4] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2
                  id="order-preview-title"
                  className="break-words font-semibold"
                >
                  {selected.orderNumber}
                </h2>
                <p className="text-sm text-[#46536F]">
                  Placed {formatOrderTime(selected.placedAt)} ·{' '}
                  {orderPaymentMode(selected.paymentMode)}
                </p>
              </div>
              <OrderStageBadge
                status={
                  records.find((row) => row.id === selected.id)?.status ??
                  selection.status
                }
              />
            </div>
            <div className="grid gap-2 xl:grid-cols-2">
              <div className="min-w-0 rounded-xl border bg-card p-3">
                <p className="text-xs text-[#675B4E]">Customer</p>
                <p className="wrap-anywhere text-sm font-semibold">
                  {selected.address.recipientName || selected.customerPhone}
                </p>
                <p className="wrap-anywhere text-xs text-[#46536F]">
                  {[selected.address.locality, selected.address.municipality]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
              <div className="min-w-0 rounded-xl border bg-card p-3">
                <p className="text-xs text-[#675B4E]">
                  {selectedSellers.length === 1 ? 'Seller' : 'Sellers'}
                </p>
                <p className="wrap-anywhere text-sm font-semibold">
                  {selectedSellers.join(', ')}
                </p>
              </div>
            </div>
            <section>
              <h3 className="text-sm font-semibold">Timeline</h3>
              <ol className="mt-2 space-y-2 text-sm">
                <li className="flex gap-2">
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-[#296648]"
                    aria-hidden="true"
                  />
                  <span>
                    <strong>Placed</strong> ·{' '}
                    {formatOrderTime(selected.placedAt)}
                  </span>
                </li>
                {recentHistory.map((event) => (
                  <li key={event.id} className="flex gap-2">
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-[#296648]"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 break-words">
                      <strong>{orderStage(event.status)}</strong> ·{' '}
                      {formatOrderTime(event.time)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <div className="mt-auto grid gap-2">
              <Link
                href={detailHref}
                className={
                  buttonClass +
                  ' border-[#14213D] bg-[#14213D] text-white hover:bg-[#26324C]'
                }
              >
                Open full order{' '}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href={detailHref + '#seller'} className={buttonClass}>
                Contact seller
              </Link>
              <Link href={detailHref + '#parcel-cash'} className={buttonClass}>
                Parcel &amp; cash
              </Link>
              <Link href={detailHref + '#money'} className={buttonClass}>
                Order statement
              </Link>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
