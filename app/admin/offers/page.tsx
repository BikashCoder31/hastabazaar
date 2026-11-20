import { env } from 'cloudflare:workers';
import { Gift, Plus, Star, Tag, Users } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PromoCodeOfferPanel } from '@/components/admin/promo-code-offer-panel';
import { Button, buttonVariants } from '@/components/ui/button';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { CommissionRateUnavailableError } from '@/lib/db/repositories/business-settings';
import { getCommissionRateState } from '@/lib/db/repositories/commission-rates';
import { GiftCardOutcomeError } from '@/lib/gift-cards/command-outcomes';
import { incentiveMoney } from '@/lib/incentives/presentation';
import { IncentiveError } from '@/lib/incentives/types';
import {
  offerCategories,
  offersPerPage,
  readOffersOverview,
  type OfferCategory,
  type OfferRow,
} from './offer-data';

export const dynamic = 'force-dynamic';

const number = (value: number) => value.toLocaleString('en-NP');
const icons = { promo: Tag, referral: Users, loyalty: Star, gift: Gift };
const card = 'min-w-0 rounded-2xl border border-[#e4daca] bg-card';

function offerHref(kind: OfferCategory, page = 1) {
  const params = new URLSearchParams();
  if (kind !== 'all') params.set('type', kind);
  if (page > 1) params.set('page', String(page));
  return params.size ? `/admin/offers?${params}` : '/admin/offers';
}

function OfferListRow({ offer }: { offer: OfferRow }) {
  const Icon = icons[offer.kind];
  const budget = offer.budget;
  const remainingColor =
    offer.status === 'Ended' || offer.status === 'Budget used'
      ? 'bg-[#a8232e]'
      : 'bg-[#14213d]';
  const used = budget ? Math.min(100, 100 * (budget.used / budget.limit)) : 0;
  const budgetText = budget
    ? budget.unit === 'paisa'
      ? `${incentiveMoney(budget.used)} of ${incentiveMoney(budget.limit)} used`
      : `${number(budget.used)} of ${number(budget.limit)} points issued`
    : offer.budgetDescription;
  return (
    <li>
      <Link
        href={offer.href}
        className="grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-4 text-[#14213d] hover:bg-[#f7f3ec] focus-visible:outline-offset-[-3px] sm:gap-x-3.5 sm:px-[18px]"
      >
        <span
          className="grid size-9 place-items-center rounded-[10px] bg-[#eae1cf]"
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="min-w-0 wrap-anywhere text-sm font-bold">
              {offer.title}
            </h2>
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                offer.status === 'Live' || offer.status === 'Available'
                  ? 'bg-[#dcebe2] text-[#23654b]'
                  : 'bg-[#eae1cf] text-[#405173]'
              }`}
            >
              {offer.status}
            </span>
          </div>
          <p className="mt-1 min-w-0 wrap-anywhere text-[0.8125rem] leading-5 text-[#405173]">
            {offer.rule}
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span
              className="h-2 min-w-8 flex-[1_1_24%] basis-8 overflow-hidden rounded-full bg-[#eae1cf] sm:flex-[0_1_12rem]"
              aria-hidden="true"
            >
              {budget ? (
                <span
                  className={`block h-full rounded-full ${remainingColor}`}
                  style={{ width: `${used}%` }}
                />
              ) : null}
            </span>
            <span className="min-w-0 wrap-anywhere text-xs text-[#405173]">
              {budgetText}
            </span>
          </div>
        </div>
        <div className="max-w-[5.5rem] shrink-0 text-right wrap-anywhere">
          {offer.orders === null ? (
            <span className="sr-only">Order count unavailable</span>
          ) : null}
          <span
            className="block text-sm font-bold tabular-nums"
            aria-hidden={offer.orders === null ? true : undefined}
          >
            {offer.orders === null ? '—' : number(offer.orders)}
          </span>
          <span
            className="block text-xs text-[#405173]"
            aria-hidden={offer.orders === null ? true : undefined}
          >
            orders
          </span>
        </div>
      </Link>
    </li>
  );
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage(
    '/admin/offers',
    'commercial_policy.manage',
  );
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const params = (await searchParams) ?? {};
  const category =
    offerCategories.find(([id]) => id === params.type)?.[0] ?? 'all';
  const tracksPromos = category === 'all' || category === 'promo';
  const page =
    tracksPromos &&
    typeof params.page === 'string' &&
    /^\d{1,6}$/.test(params.page)
      ? Math.max(1, Number(params.page))
      : 1;
  const [data, commission] = await Promise.all([
    readOffersOverview(db, staff, category, page).catch((error: unknown) => {
      if (
        (error instanceof GiftCardOutcomeError && error.status === 403) ||
        (error instanceof IncentiveError && error.code === 'unauthorized')
      ) {
        redirect('/staff-access-denied');
      }
      throw error;
    }),
    getCommissionRateState(db).catch((error: unknown) => {
      if (error instanceof CommissionRateUnavailableError) return null;
      throw error;
    }),
  ]);
  const lastPage = Math.max(1, Math.ceil(data.counts.promo / offersPerPage));
  if (page > lastPage) redirect(offerHref(category, lastPage));

  return (
    <div className="grid min-w-0 gap-4">
      <nav
        aria-label="Filter offers"
        className="flex min-w-0 flex-wrap items-center gap-2"
      >
        {offerCategories.map(([id, label]) => (
          <Link
            key={id}
            href={offerHref(id)}
            aria-current={category === id ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${
              category === id
                ? 'border-[#14213d] bg-[#14213d] text-white'
                : 'border-[#d6c5ac] bg-card text-[#405173] hover:bg-[#efe9df]'
            }`}
          >
            {label}
            <span className="tabular-nums opacity-80">
              {number(data.counts[id])}
            </span>
          </Link>
        ))}
        <a
          href="#new-offer"
          className={`${buttonVariants({ variant: 'workspace-primary', size: 'workspace' })} ml-auto`}
        >
          <Plus className="size-4" aria-hidden="true" /> New offer
        </a>
      </nav>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className={`${card} overflow-hidden`}>
          {data.offers.length ? (
            <ul aria-label="Offers" className="divide-y divide-[#e4daca]">
              {data.offers.map((offer) => (
                <OfferListRow key={offer.kind + ':' + offer.id} offer={offer} />
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              No promo codes yet.
            </p>
          )}
          {tracksPromos && lastPage > 1 ? (
            <nav
              aria-label="Promo code pages"
              className="flex flex-wrap items-center gap-3 border-t px-4 py-2 text-sm"
            >
              {page > 1 ? (
                <Button
                  nativeButton={false}
                  render={<Link href={offerHref(category, page - 1)} />}
                  variant="workspace-outline"
                  size="workspace"
                >
                  Previous
                </Button>
              ) : null}
              <span>
                Promo codes · page {page} of {lastPage}
              </span>
              {page < lastPage ? (
                <Button
                  nativeButton={false}
                  render={<Link href={offerHref(category, page + 1)} />}
                  variant="workspace-outline"
                  size="workspace"
                >
                  Next
                </Button>
              ) : null}
            </nav>
          ) : null}
        </div>
        <div className="grid min-w-0 gap-3.5">
          <section
            id="new-offer"
            aria-labelledby="new-promo-code"
            tabIndex={-1}
            className={`${card} scroll-mt-24 p-5`}
          >
            <h2
              id="new-promo-code"
              className="mb-4 text-lg leading-tight font-bold"
            >
              New promo code
            </h2>
            <PromoCodeOfferPanel
              actorId={staff.id}
              role={staff.role}
              averageSubtotalPaisa={data.averageSubtotalPaisa}
              defaultCommissionBps={commission?.current.basisPoints}
            />
          </section>
          <section
            aria-labelledby="monthly-offer-cost"
            className={`${card} p-5`}
          >
            <h2 id="monthly-offer-cost" className="text-sm font-bold">
              Offer cost this month
            </h2>
            <dl className="mt-2 grid gap-y-1.5 text-sm [&>div]:grid [&>div]:grid-cols-[1fr_auto] [&>div]:gap-x-5 [&_dd]:max-w-[14rem] [&_dd]:text-right [&_dd]:wrap-anywhere [&_dd]:tabular-nums">
              <div>
                <dt className="text-[#405173]">Promo codes</dt>
                <dd>{incentiveMoney(data.monthly.promo)}</dd>
              </div>
              <div>
                <dt className="text-[#405173]">
                  Referral discounts &amp; credit
                </dt>
                <dd>{incentiveMoney(data.monthly.referral)}</dd>
              </div>
              <div>
                <dt className="text-[#405173]">Loyalty points used</dt>
                <dd>{incentiveMoney(data.monthly.loyalty)}</dd>
              </div>
              <div className="font-bold">
                <dt>Total</dt>
                <dd>{incentiveMoney(data.monthly.total)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs leading-5 text-[#655b4d]">
              Recorded discounts and shopping credit issued this month in Nepal
              time. Hastabazaar funds these offers.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
