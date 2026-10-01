import {formatPaisaExact} from '@/lib/marketplace/money-display';
import { GiftCardForm } from '@/components/commerce/gift-card-form';
import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { Wallet, ArrowUpRight } from 'lucide-react';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getWallet } from '@/lib/db/repositories/wallet';

export const dynamic = 'force-dynamic';
const money = formatPaisaExact;
const date = (value: number) =>
  new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kathmandu',
  }).format(value);
const labels: Record<string, string> = {
  order_spend: 'Used at checkout',
  referral_reward: 'Referral reward',
  gift_card: 'Gift card credit',
  cancellation: 'Cancelled order credit restored',
  refund: 'Return credit restored',
};

export default async function WalletPage() {
  const customer = await requireCustomerPage('/account/wallet');
  const wallet = await getWallet(
    requireDatabase(env as unknown as { DB?: D1Database }),
    customer.userId,
  );
  return (
    <div className="space-y-7">
      <section className="rounded-3xl bg-[#17345f] p-6 text-white sm:p-8">
        <Wallet className="size-7 text-[#f4c46b]" />
        <h1 className="mt-4 font-heading text-4xl">Your HastaBazaar wallet</h1>
        <p className="mt-3 text-white/75">
          A little thank-you for bringing good people to good finds.
        </p>
        <p className="mt-7 text-sm text-white/75">Available shopping credit</p>
        <p className="mt-2 text-4xl font-semibold">
          {money(wallet.balancePaisa)}
        </p>
        <Link
          href="/shop"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#f4c46b] px-5 py-3 font-semibold text-[#332608]"
        >
          Use your credit <ArrowUpRight className="size-4" />
        </Link>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/75">
          Apply credit to products at checkout and pay the remaining amount in
          cash on delivery. Delivery is paid in cash. Deposits and withdrawals
          are unavailable.
        </p>
      </section>
      <GiftCardForm />
      <section id="referrals" className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-2xl">
          Invite friends and earn credit
        </h2>
        <p className="mt-3 text-muted-foreground">
          Your personal code, sharing tools and referral progress now have their
          own page.
        </p>
        <Link
          href="/account/referrals"
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline"
        >
          Go to Refer & earn →
        </Link>
      </section>
      <section className="rounded-3xl border bg-card p-6">
        {' '}
        <h2 id="credit-activity" className="font-heading text-2xl">Credit activity</h2>
        {wallet.entries.length ? (
          <ul className="mt-4 divide-y">
            {wallet.entries.map((e) => (
              <li
                key={e.id}
                className="flex justify-between gap-4 py-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{labels[e.kind] || e.kind}</p>
                  <p className="mt-1 text-muted-foreground">
                    {date(e.createdAt)}
                    {e.orderNumber && e.kind !== 'referral_reward' ? ` · ${e.orderNumber}` : ''}
                  </p>
                </div>
                <span className="shrink-0 font-semibold">
                  {e.amountPaisa > 0 ? '+' : ''}
                  {money(e.amountPaisa)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-muted-foreground">
            No credit activity yet. Invite a friend to get started.
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Showing the latest 100 entries. Your balance includes all activity.
        </p>
      </section>
    </div>
  );
}
