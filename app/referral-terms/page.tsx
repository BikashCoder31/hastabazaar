import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { requireDatabase } from '@/lib/db/d1';
import { getReferralCampaign } from '@/lib/db/repositories/wallet';

export const dynamic = 'force-dynamic';
export default async function ReferralTerms() {
  const c = await getReferralCampaign(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  return (
    <>
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className="shell max-w-3xl py-12">
        <p className="eyebrow">Good finds are better shared</p>
        <h1 className="mt-4 font-heading text-4xl">Welcome to HastaBazaar</h1>
        <p className="mt-5 text-lg leading-8">
          Your friend’s invitation gives you Rs. {c.friendDiscountPaisa / 100}{' '}
          off your first order of Rs. {c.minimumSubtotalPaisa / 100} or more in
          products.
        </p>
        <p className="mt-3 leading-7 text-muted-foreground">
          Sign in and check your referral code at checkout. Pay the remaining
          balance in cash when your order arrives.
        </p>
        {!c.enabled ? (
          <p className="mt-4 font-semibold">This offer is currently paused.</p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/shop"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-3 text-center font-semibold text-primary-foreground"
          >
            Explore the marketplace
          </Link>
          <Link
            href="/login?return_to=%2Fcheckout"
            className="inline-flex min-h-11 items-center justify-center rounded-full border px-6 py-3 text-center font-semibold"
          >
            Sign in
          </Link>
        </div>
        <h2 className="mt-10 font-heading text-2xl">A clear, simple offer</h2>
        <ul className="mt-5 list-disc space-y-3 pl-5 leading-7 text-muted-foreground">
          <li>
            One referral offer per customer and phone number, for their first
            non-cancelled order. You must sign in. Delivery charges do not count
            toward the minimum.
          </li>
          <li>
            No self-referrals, duplicate accounts, or artificial orders.
            Invitations must be shared with people who want them.
          </li>
          <li>
            Your friend earns Rs. {c.rewardPaisa / 100} in shopping credit after
            your order is delivered, cash is collected, and at least{' '}
            {c.returnWindowDays} days have passed. Pending returns and
            unresolved complaints hold release; cancelled or refunded orders do
            not qualify.
          </li>
          <li>
            Shopping credit applies to products only. Delivery and any remaining
            order balance are paid in cash. Shopping credit has no cash value,
            does not expire, and cannot be deposited, withdrawn, or transferred.
          </li>
          <li>
            Cancellations restore shopping credit used. Refunds restore the
            proportion of shopping credit used and refund only cash actually
            paid. Referral discounts are not cash and are not returned to the
            wallet. Cancelling does not reset a redeemed referral offer.
          </li>
          <li>
            Offer changes apply to future orders. The discount and reward on an
            accepted order are recorded at checkout. Rewards are released
            automatically when the referrer opens Refer & earn, their wallet or checkout after
            becoming eligible.
          </li>
        </ul>
        <p className="mt-6">
          <Link href="/rewards-terms" className="mr-5 inline-flex min-h-11 items-center font-semibold text-primary underline">Rewards & shopping credit terms</Link>
          <Link href="/account/referrals" className="mr-5 inline-flex min-h-11 items-center font-semibold text-primary underline">Get my referral link →</Link>
          Need help?{' '}
          <Link href="/help" className="text-primary underline">
            Contact HastaBazaar support
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
