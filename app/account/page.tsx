import { withFirstCodPresentation } from '@/lib/orders/first-cod-review';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import {
  ArrowRight,
  Heart,
  LifeBuoy,
  MapPin,
  Package,
  UserRound,
  Wallet,
  Gift,
} from 'lucide-react';
import { AccountEmpty } from '@/components/account/account-ui';
import { CustomerOrderList } from '@/components/account/order-list';
import { requireCustomerPage, type CustomerUser } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getRewards } from '@/lib/db/repositories/loyalty';
import {
  listCustomerAddresses,
  listCustomerOrders,
  listWishlist,
} from '@/lib/db/repositories/customers';

function readRewardsSummary(database: D1Database, customer: CustomerUser) {
  return getRewards(
    database,
    customer.userId,
    Date.now(),
    undefined,
    1,
    customer.authSubject,
  );
}

export default async function AccountPage() {
  const customer = await requireCustomerPage('/account');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [orders, addresses, wishlist, rewards] = await Promise.all([
    listCustomerOrders(database, customer.userId, 3),
    listCustomerAddresses(database, customer.userId),
    listWishlist(database, customer.userId),
    readRewardsSummary(database, customer),
  ]);
  const displayedOrders = await withFirstCodPresentation(database, orders);
  const defaultAddress = addresses.find((address) => address.isDefault);
  return (
    <div className="space-y-7">
      <section className="rounded-3xl bg-[#17345f] p-6 text-white sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#f4c46b]">
          Your little corner of Hastabazaar
        </p>
        <h1 className="mt-4 break-words font-heading text-4xl tracking-tight sm:text-5xl">
          Hello, {customer.displayName.split(' ')[0]}.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-white/75">
          Your thoughtful finds, favourite makers, and next little discovery—all
          in one place.
        </p>
        <Link
          href="/shop"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f4c46b] px-5 py-3 text-sm font-semibold text-[#332608] hover:bg-[#ffda97]"
        >
          Find something special
          <ArrowRight className="size-4" />
        </Link>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Refer & earn',
            detail: 'Get your code, invite friends and track rewards',
            href: '/account/referrals',
            icon: Gift,
          },
          {
            label: 'My Rewards',
            detail:
              rewards.balancePoints +
              ' points available · Claim daily points and exchange for shopping credit',
            href: '/account/rewards',
            icon: Gift,
          },
          {
            label: 'My wallet',
            detail: 'View shopping credit and activity',
            href: '/account/wallet',
            icon: Wallet,
          },
          {
            label: 'My orders',
            detail: 'Track & manage purchases',
            href: '/account/orders',
            icon: Package,
          },
          {
            label: 'My wishlist',
            detail:
              wishlist.length +
              ' saved ' +
              (wishlist.length === 1 ? 'find' : 'finds'),
            href: '/account/wishlist',
            icon: Heart,
          },
          {
            label: 'Delivery addresses',
            detail:
              addresses.length +
              ' saved ' +
              (addresses.length === 1 ? 'address' : 'addresses'),
            href: '/account/addresses',
            icon: MapPin,
          },
          {
            label: 'Sign-in form history',
            detail:
              'Review saved answers from your account and sign-in actions',
            href: '/form-submissions',
            icon: UserRound,
          },
        ].map(({ label, detail, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50"
          >
            <div className="flex items-center justify-between">
              <Icon className="size-6 text-primary" />
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
            <h2 className="mt-4 font-semibold">{label}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {detail}
            </p>
          </Link>
        ))}
      </div>
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-2xl">Your recent orders</h2>
          <Link href="/account/orders" className="section-link">
            All orders
            <ArrowRight className="size-4" />
          </Link>
        </div>
        {orders.length ? (
          <CustomerOrderList orders={displayedOrders} />
        ) : (
          <AccountEmpty
            icon={Package}
            title="Your first find is waiting."
            description="Orders you place while signed in will appear here, with delivery updates and support close at hand."
            href="/shop"
            action="Explore the collection"
          />
        )}
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" />
            <h2 className="font-heading text-2xl">Your go-to address</h2>
          </div>
          {defaultAddress ? (
            <div className="mt-4 text-base leading-7">
              <p className="font-semibold">{defaultAddress.recipientName}</p>
              <p className="text-muted-foreground">
                {defaultAddress.locality}, {defaultAddress.municipality}
                <br />
                {defaultAddress.district}, {defaultAddress.province}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Save a default delivery address to make your next checkout easier.
            </p>
          )}
          <Link href="/account/addresses" className="section-link mt-3">
            Manage addresses
            <ArrowRight className="size-4" />
          </Link>
        </section>
        <section className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-5 text-primary" />
            <h2 className="font-heading text-2xl">A little help?</h2>
          </div>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Open an order for returns, refunds, or a complaint. For a guest
            purchase, use your secure receipt link.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5">
            <Link href="/help" className="section-link">
              Visit help centre
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/account/profile" className="section-link">
              <UserRound className="size-4" />
              Edit profile
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
