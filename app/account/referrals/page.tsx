import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { Gift } from 'lucide-react';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getWallet } from '@/lib/db/repositories/wallet';
import { ReferralShare } from '@/components/account/referral-share';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Refer & earn' };
const money = (value: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    value / 100,
  );
const date = (value: number) =>
  new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kathmandu',
  }).format(value);

export default async function ReferralsPage() {
  const customer = await requireCustomerPage('/account/referrals');
  const wallet = await getWallet(
    requireDatabase(env as unknown as { DB?: D1Database }),
    customer.userId,
  );
  const campaign = wallet.campaign;
  const pending = wallet.referrals
    .filter((r) => r.status === 'pending' || r.status === 'on_hold')
    .reduce((sum, r) => sum + r.rewardPaisa, 0);
  return (
    <div className="space-y-7">
      <section className="rounded-3xl bg-[#17345f] p-6 text-white sm:p-8">
        <Gift className="size-7 text-[#f4c46b]" aria-hidden="true" />
        <h1 className="mt-4 font-heading text-4xl">Refer & earn</h1>
        <p className="mt-3 text-xl">
          Give {money(campaign.friendDiscountPaisa)}. Earn{' '}
          {money(campaign.rewardPaisa)}.
        </p>
        <p className="mt-3 max-w-2xl leading-7 text-white/80">
          Your friend gets a discount on their first qualifying order of{' '}
          {money(campaign.minimumSubtotalPaisa)} or more in products. You earn
          shopping credit after delivery, cash collection and the{' '}
          {campaign.returnWindowDays}-day waiting period.
        </p>
      </section>
      <section className="rounded-3xl border bg-card p-6 sm:p-8">
        <h2 className="font-heading text-2xl">Invite your friends</h2>
        {campaign.enabled ? (
          <>
            <p className="mt-3 leading-7 text-muted-foreground">
              Share your link or code. Your friend signs in, adds their first
              order and checks the referral code at checkout.
            </p>
            <ReferralShare code={wallet.referralCode} />
          </>
        ) : (
          <output className="block mt-4 leading-7">
            New referral offers are currently paused. Existing recorded rewards
            keep their original terms and earned credit remains usable.
          </output>
        )}
        <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
          <li>Share your personal invitation with a friend who wants it.</li>
          <li>
            Your friend uses your code on their first qualifying signed-in
            order. Delivery charges do not count toward the minimum.
          </li>
          <li>
            After delivery and cash collection, wait at least{' '}
            {campaign.returnWindowDays} days. Returns or unresolved complaints
            hold the reward; cancelled or refunded orders do not qualify.
          </li>
          <li>
            Open Refer & earn, your wallet or checkout to release eligible
            rewards. Spend available credit on products at checkout; delivery
            stays payable in cash.
          </li>
        </ol>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          One offer per customer and phone number. No self-referrals or
          duplicate accounts. Rewards cannot be withdrawn or transferred.
          Existing referral amounts shown below are the amounts saved when those
          orders were placed.
        </p>
        <div className="mt-4 flex flex-wrap gap-5">
          <Link
            href="/referral-terms"
            className="inline-flex min-h-11 items-center font-semibold text-primary underline"
          >
            Full referral terms
          </Link>
          <Link
            href="/account/wallet"
            className="inline-flex min-h-11 items-center font-semibold text-primary underline"
          >
            View my wallet →
          </Link>
        </div>
      </section>
      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-2xl">Referral progress</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {money(pending)} pending or on hold among your latest 100 referrals.
          Friends’ personal and order details stay private.
        </p>
        {wallet.referrals.length ? (
          <ul className="mt-4 divide-y">
            {wallet.referrals.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap justify-between gap-2 py-4 text-sm"
              >
                <span>
                  Invitation order · {date(r.createdAt)}
                  <span className="block text-muted-foreground">
                    {r.status === 'pending' && r.eligibleAt
                      ? `Eligible after ${date(r.eligibleAt)}`
                      : r.status === 'pending'
                        ? 'Awaiting delivery and collection'
                        : r.status.replaceAll('_', ' ')}
                  </span>
                </span>
                <span className="font-semibold">
                  {money(r.rewardPaisa)} · {r.status.replaceAll('_', ' ')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 leading-7 text-muted-foreground">
            No referral orders yet. Share your invitation above; progress
            appears after a friend places a qualifying order, not just when they
            open your link.
          </p>
        )}
      </section>
    </div>
  );
}
