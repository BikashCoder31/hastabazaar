import {formatPaisaExact} from '@/lib/marketplace/money-display';
import { GiftCardForm } from '@/components/commerce/gift-card-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { Wallet, ArrowUpRight } from 'lucide-react';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getWallet } from '@/lib/db/repositories/wallet';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';

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

export default async function WalletPage({ searchParams }: {
  searchParams?: Promise<{ giftId?: string; beforeAt?: string; beforeId?: string;
    historyAt?: string; historyId?: string }>;
} = {}) {
  const customer = await requireCustomerPage('/account/wallet');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const wallet = await getWallet(
    db,
    customer.userId,
  );
  const query = await searchParams;
  const beforeAt = query?.beforeAt ? Number(query.beforeAt) : NaN;
  const before = Number.isSafeInteger(beforeAt) && beforeAt >= 0 &&
    query?.beforeId && query.beforeId.length <= 191 ? { at: beforeAt, id: query.beforeId } : null;
  const giftRows = await db.prepare(`SELECT id,amount_paisa AS amountPaisa,redeemed_at AS redeemedAt
    FROM gift_cards WHERE redeemed_by=? AND
      (? IS NULL OR redeemed_at<? OR (redeemed_at=? AND id<?))
    ORDER BY redeemed_at DESC,id DESC LIMIT 51`)
    .bind(customer.userId, before?.at ?? null, before?.at ?? 0, before?.at ?? 0,
      before?.id ?? '').all<{ id: string; amountPaisa: number; redeemedAt: number }>();
  const gifts = giftRows.results.slice(0, 50);
  const nextGift = giftRows.results.length > 50 ? gifts.at(-1) : null;
  const selectedGift = query?.giftId && query.giftId.length <= 191
    ? gifts.find((gift) => gift.id === query.giftId) ?? await db.prepare(`SELECT id,
      amount_paisa AS amountPaisa,redeemed_at AS redeemedAt FROM gift_cards
      WHERE id=? AND redeemed_by=? LIMIT 1`)
      .bind(query.giftId, customer.userId).first<{ id: string; amountPaisa: number; redeemedAt: number }>()
    : null;
  const historyAt = query?.historyAt ? Number(query.historyAt) : NaN;
  const after = Number.isSafeInteger(historyAt) && historyAt >= 0 &&
    query?.historyId && query.historyId.length <= 191
    ? { createdAt: historyAt, id: query.historyId } : undefined;
  const history = selectedGift ? await listFormAnswersForSubjectPage(db, {
    subjectType: 'gift_card_redemption', subjectId: selectedGift.id,
    formId: 'commerce.gift-card-redeem', after,
  }) : null;
  if (history) {
    const allowed = await Promise.all(history.answers.map((answer) =>
      authorizeFormAnswerRead(db, { id: customer.userId, role: 'customer' }, answer)));
    if (allowed.some((value) => !value)) throw new Error('Gift card answer authority changed.');
  }
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
      <section className="space-y-4 rounded-3xl border bg-card p-6" aria-label="Your gift card answers">
        <h2 className="font-heading text-2xl">Gift card answer history</h2>
        {gifts.length ? <ul className="space-y-2">{gifts.map((gift) => <li key={gift.id}>
          <Link className="underline" href={`/account/wallet?giftId=${encodeURIComponent(gift.id)}`}>
            Redeemed {date(gift.redeemedAt)} · {money(gift.amountPaisa)}
          </Link>
        </li>)}</ul> : <p>No redeemed gift cards.</p>}
        {nextGift ? <Link className="underline" href={
          `/account/wallet?beforeAt=${nextGift.redeemedAt}&beforeId=${encodeURIComponent(nextGift.id)}`
        }>Next 50 redeemed cards</Link> : null}
        {selectedGift ? <div className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">Redeemed card answers</h3>
          {history?.answers.length ? history.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)
            : <p>No saved answers for this redemption.</p>}
          {history?.nextCursor ? <Link className="underline" href={
            `/account/wallet?giftId=${encodeURIComponent(selectedGift.id)}&historyAt=${history.nextCursor.createdAt}&historyId=${encodeURIComponent(history.nextCursor.id)}`
          }>Next 50 answers</Link> : null}
        </div> : null}
      </section>
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
