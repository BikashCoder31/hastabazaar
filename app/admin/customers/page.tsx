import { env } from 'cloudflare:workers';
import { Search, Smartphone, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import {
  AdminPageHelpProvider,
  AdminPageTitle,
} from '@/components/admin/page-help';
import {
  customerFilters,
  customerRiskThreshold,
  customerWorkspaceHref,
  readCustomerWorkspace,
} from '@/lib/admin/customers';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { normalizeNepalMobile } from '@/lib/auth/nepal-phone';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { can } from '@/lib/marketplace/permissions';
import { OrderStageBadge } from '../orders/order-stage-badge';
import { orderMoney } from '../orders/order-queue-presentation';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Customers',
  robots: { index: false, follow: false },
};

const pathname = '/admin/customers';
const observedAt = () => Date.now();
const month = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kathmandu',
});
const number = new Intl.NumberFormat('en-NP');
const avatarColors = [
  'bg-[#2B4987]',
  'bg-[#815914]',
  'bg-[#286548]',
  'bg-[#46536F]',
];
const focusLink =
  'focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#14213D]';
const watchBadge =
  'w-fit shrink-0 rounded-full bg-[#F5E8C7] px-2.5 py-1 text-xs leading-tight font-bold text-[#714807]';
const outlineLink = `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-[#D3C5AD] bg-card px-3 text-sm font-semibold hover:bg-[#F7F3EC] ${focusLink}`;

type Query = Promise<Record<string, string | string[] | undefined>>;
type Workspace = Awaited<ReturnType<typeof readCustomerWorkspace>>;

function CustomerAvatar({
  customer,
  large = false,
}: {
  customer: Workspace['customers'][number];
  large?: boolean;
}) {
  const initials = customer.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((name) => Array.from(name)[0])
    .join('')
    .toLocaleUpperCase();
  const color =
    customer.codRefusalCount >= customerRiskThreshold
      ? 'bg-[#A8232E]'
      : avatarColors[(customer.id.codePointAt(0) ?? 0) % avatarColors.length];

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${color} ${large ? 'size-[3.25rem] text-base' : 'size-9 text-sm'}`}
    >
      {initials}
    </span>
  );
}

function CustomerRecord({
  customer,
  orders,
  canOpenOrder,
  returnTo,
}: {
  customer: NonNullable<Workspace['customer']>;
  orders: Workspace['recentOrders'];
  canOpenOrder: boolean;
  returnTo: string;
}) {
  const risk = customer.codRefusalCount >= customerRiskThreshold;
  const phone = normalizeNepalMobile(customer.phone);
  const maskedPhone = phone
    ? phone.slice(4, 6) + '••••••' + phone.slice(-2)
    : null;
  const metrics = [
    { label: 'Orders', value: number.format(customer.orderCount) },
    { label: 'Delivered', value: number.format(customer.deliveredCount) },
    {
      label: 'Refused or not reached',
      value: number.format(customer.unsuccessfulCount),
      warning: customer.unsuccessfulCount > 0,
    },
    { label: 'Wallet', value: orderMoney(customer.walletPaisa) },
  ];
  return (
    <section
      id="customer-record"
      aria-labelledby="customer-name"
      tabIndex={-1}
      className="min-w-0 scroll-mt-20 space-y-4 rounded-[15px] border border-[#E4DACA] bg-card p-5 sm:p-[22px]"
    >
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <CustomerAvatar customer={customer} large />
        <div className="min-w-0">
          <h2
            id="customer-name"
            className="wrap-anywhere font-heading text-[1.625rem] leading-tight font-semibold"
          >
            {customer.name}
          </h2>
          <p className="wrap-anywhere text-sm leading-snug text-[#46536F]">
            {[
              customer.email,
              maskedPhone,
              `customer since ${month.format(customer.createdAt)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {risk ? (
          <span className={`col-span-2 md:col-span-1 ${watchBadge}`}>
            Watch
          </span>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {metrics.map(({ label, value, warning }) => (
          <div
            key={label}
            className={`min-w-0 rounded-[15px] border px-3.5 py-3 ${warning ? 'border-[#C78723]' : 'border-[#E4DACA]'}`}
          >
            <dt className="text-[13.5px] leading-5 text-[#46536F]">{label}</dt>
            <dd
              className={`mt-1.5 wrap-anywhere font-heading text-[1.375rem] leading-snug font-semibold tabular-nums ${warning ? 'text-[#A8232E]' : ''}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {risk ? (
        <p className="flex items-start gap-3 rounded-xl bg-[#F7E9C9] px-4 py-3.5 text-sm leading-relaxed text-[#6B4508]">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            <strong>Cash-on-delivery risk.</strong>{' '}
            {number.format(customer.unsuccessfulCodCount)} of{' '}
            {number.format(customer.codOrderCount)} cash orders had a recorded
            refusal or the courier couldn’t reach the customer.
          </span>
        </p>
      ) : null}

      <div>
        <h3 className="text-sm font-bold text-[#46536F]">Recent orders</h3>
        {orders.length ? (
          <ul className="mt-0.5">
            {orders.map((order) => {
              const title = (
                <>
                  <strong className="font-mono text-[13px]">
                    {order.orderNumber}
                  </strong>
                  {order.productName ? <> · {order.productName}</> : null}
                </>
              );
              return (
                <li
                  key={order.id}
                  className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-[#E4DACA] text-sm"
                >
                  {canOpenOrder ? (
                    <Link
                      href={withAdminReturnTo(
                        `/admin/orders/${encodeURIComponent(order.id)}`,
                        returnTo,
                      )}
                      prefetch={false}
                      className={`flex min-h-11 min-w-0 items-center py-2 hover:underline ${focusLink}`}
                    >
                      <span className="wrap-anywhere">{title}</span>
                    </Link>
                  ) : (
                    <span className="wrap-anywhere py-2">{title}</span>
                  )}
                  {order.outcome ? (
                    <span className="rounded-full bg-[#A8232E] px-2.5 py-1 text-xs leading-tight font-bold text-white">
                      {order.outcome === 'refused' ? 'Refused' : 'Not reached'}
                    </span>
                  ) : (
                    <OrderStageBadge status={order.status} />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[#46536F]">No orders recorded.</p>
        )}
      </div>

      {phone ? (
        <a href={`tel:${phone}`} className={outlineLink}>
          <Smartphone aria-hidden="true" className="size-4" />
          Call
        </a>
      ) : null}
      <p className="text-[13px] leading-relaxed text-[#675B4E]">
        Private to staff. Customers only see their own orders and wallet.
        Refusals count only when the courier recorded them.
      </p>
    </section>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Query;
}) {
  const staff = await requireStaffPage(pathname, 'audit_log.view');
  const query = await searchParams;
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const value = (key: string) =>
    typeof query[key] === 'string' ? query[key] : undefined;
  const {
    q,
    view,
    page,
    pageCount,
    customers,
    customer,
    recentOrders,
    counts,
  } = await readCustomerWorkspace(
    db,
    {
      q: value('q'),
      view: value('view'),
      page: value('page'),
      customer: value('customer'),
    },
    observedAt(),
  );
  const returnTo = customerWorkspaceHref({
    q,
    view,
    page,
    customer: customer?.id,
  });
  const empty = q
    ? `No customer matches “${q}”.`
    : view === 'risk'
      ? 'No customers with two recorded cash-order refusals.'
      : view === 'new'
        ? 'No customers registered this month.'
        : 'No customers found.';

  return (
    <>
      <div className="mb-3">
        <AdminPageHelpProvider
          help={{
            pathname,
            title: 'How to use Customers',
            sentences: [
              'Find a customer by name, phone, email or order number to see their orders, delivery outcomes and wallet.',
              'Two courier-recorded refusals on cash orders mark a customer as Watch.',
            ],
            procedureHref: can(staff, 'support.manage')
              ? '/admin/legal-policies/active'
              : undefined,
          }}
        >
          <AdminPageTitle>
            <h1 className="font-heading text-[1.75rem]">
              Care<span className="sr-only"> · Customers</span>
            </h1>
          </AdminPageTitle>
        </AdminPageHelpProvider>
      </div>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <section
          aria-label="Customer directory"
          className="min-w-0 rounded-[15px] border border-[#E4DACA] bg-card"
        >
          <div className="space-y-2.5 p-3.5 sm:px-4">
            <search aria-label="Customer search">
              <form
                method="get"
                action={pathname}
                className="flex min-w-0 items-center rounded-[10px] border border-[#D3C5AD] focus-within:ring-2 focus-within:ring-[#46536F]"
              >
                {view !== 'all' ? (
                  <input type="hidden" name="view" value={view} />
                ) : null}
                <button
                  type="submit"
                  aria-label="Search customers"
                  className={`inline-flex size-11 shrink-0 items-center justify-center rounded-l-[10px] text-[#675B4E] hover:bg-[#F7F3EC] ${focusLink}`}
                >
                  <Search aria-hidden="true" className="size-4" />
                </button>
                <input
                  key={q}
                  id="customer-search"
                  aria-label="Name, phone, email or order number"
                  autoComplete="off"
                  type="search"
                  name="q"
                  maxLength={160}
                  defaultValue={q}
                  placeholder="Name, phone, email or order number"
                  className="min-h-11 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none placeholder:text-[#675B4E]"
                />
              </form>
            </search>
            <nav aria-label="Customer filters" className="flex flex-wrap gap-2">
              {customerFilters.map(([id, label]) => (
                <Link
                  key={id}
                  href={customerWorkspaceHref({ q, view: id })}
                  aria-current={view === id ? 'page' : undefined}
                  prefetch={false}
                  className={`inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-semibold sm:px-3 ${focusLink} ${view === id ? 'border-[#14213D] bg-[#14213D] text-white' : 'border-[#D3C5AD] text-[#46536F] hover:bg-[#F7F3EC]'}`}
                >
                  {label}{' '}
                  <span className="tabular-nums">
                    {number.format(counts[id])}
                  </span>
                </Link>
              ))}
            </nav>
          </div>

          {customers.length ? (
            <ul className="overflow-hidden rounded-b-[15px]">
              {customers.map((row) => {
                const isSelected = row.id === customer?.id;
                return (
                  <li key={row.id} className="border-t border-[#E4DACA]">
                    <Link
                      href={
                        customerWorkspaceHref({
                          q,
                          view,
                          page,
                          customer: row.id,
                        }) + '#customer-record'
                      }
                      aria-current={isSelected ? 'true' : undefined}
                      prefetch={false}
                      className={`relative flex min-h-[4.5rem] min-w-0 items-center gap-3 px-4 py-3 text-left hover:bg-[#F7F3EC] sm:gap-3.5 sm:px-[18px] ${focusLink} ${isSelected ? 'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[#A8232E]' : ''}`}
                    >
                      <CustomerAvatar customer={row} />
                      <span className="min-w-0 grow">
                        <strong className="block wrap-anywhere text-sm">
                          {row.name}
                        </strong>
                        <span className="mt-0.5 block wrap-anywhere text-[13px] leading-snug text-[#46536F]">
                          {[
                            row.location,
                            `${number.format(row.orderCount)} ${row.orderCount === 1 ? 'order' : 'orders'}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {row.codRefusalCount >= customerRiskThreshold ? (
                        <span className={watchBadge}>
                          {number.format(row.codRefusalCount)} refused
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="wrap-anywhere border-t border-[#E4DACA] p-5 text-center text-sm text-[#46536F]">
              {empty}
            </p>
          )}

          {pageCount > 1 ? (
            <nav
              aria-label="Customer pages"
              className="flex flex-wrap items-center justify-center gap-2 border-t border-[#E4DACA] p-3 text-sm text-[#46536F]"
            >
              {page > 1 ? (
                <Link
                  href={customerWorkspaceHref({ q, view, page: page - 1 })}
                  rel="prev"
                  className={outlineLink}
                  prefetch={false}
                >
                  Previous
                </Link>
              ) : null}
              <span>
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link
                  href={customerWorkspaceHref({ q, view, page: page + 1 })}
                  rel="next"
                  className={outlineLink}
                  prefetch={false}
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>

        {customer ? (
          <CustomerRecord
            customer={customer}
            orders={recentOrders}
            canOpenOrder={can(staff, 'order.manage')}
            returnTo={returnTo}
          />
        ) : null}
      </div>
    </>
  );
}
