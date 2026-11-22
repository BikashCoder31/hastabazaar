import {formatPaisaExact} from '@/lib/marketplace/money-display';
import { GiftCardForm } from '@/components/commerce/gift-card-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { CustomerWallet, accountSurface } from '@/components/account/account-sections';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getWallet } from '@/lib/db/repositories/wallet';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import {readGiftCardViewScope,assertGiftCardViewScope} from '@/lib/gift-cards/view-scope';

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
  loyalty_redemption: 'Points exchanged',
};

export default async function WalletPage({ searchParams }: {
  searchParams?: Promise<{ giftId?: string; beforeAt?: string; beforeId?: string;
    historyAt?: string; historyId?: string }>;
} = {}) {
  const customer = await requireCustomerPage('/account/wallet');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const scope=await readGiftCardViewScope(db,customer.userId,'customer');
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
  await assertGiftCardViewScope(db,scope,selectedGift?{id:selectedGift.id,owner:'redeemed_by'}:undefined);
  return (
    <CustomerWallet active="credit">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-[#14213d] p-5 text-white sm:p-6" aria-label="Shopping credit balance">
          <h2 className="text-sm font-medium text-white/80">Shopping credit</h2>
          <p className="mt-2 break-words font-heading text-4xl tracking-tight sm:text-5xl">{money(wallet.balancePaisa)}</p>
          <p className="mt-3 text-sm leading-6 text-white/80">Switch on “Use shopping credit” at checkout to spend it on products.</p>
          <p className="mt-1 text-sm leading-6 text-white/80">Shopping credit covers products. Delivery is paid separately. Deposits and withdrawals are unavailable.</p>
          <Link href="/shop" className="mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-white underline underline-offset-4 focus-visible:outline-2">Shop with your credit</Link>
        </section>
        <GiftCardForm actorId={customer.userId} />
      </div>
      {query?.giftId&&!selectedGift?<output className="block">The requested original gift redemption is unavailable for this account.</output>:null}
      <section className={accountSurface + " p-5"}>
        <h2 id="credit-activity" className="text-lg font-semibold">Credit activity</h2>
        {wallet.entries.length ? (
          <ul className="mt-4 divide-y">
            {wallet.entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{labels[e.kind] || e.kind}</p>
                  <p className="mt-1 text-muted-foreground">
                    {date(e.createdAt)}
                    {e.orderNumber && e.kind !== 'referral_reward' ? ` · ${e.orderNumber}` : ''}
                  </p>
                </div>
                <span className={e.amountPaisa > 0 ? "font-semibold text-[#22664b]" : "font-semibold"}>
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
      <section className={accountSurface + " space-y-4 p-5"} aria-label="Your gift card answers">
        <h2 className="font-heading text-2xl">Gift card answer history</h2>
        {gifts.length ? <ul className="space-y-2">{gifts.map((gift) => <li key={gift.id}>
          <Link className="inline-flex min-h-11 items-center underline" href={`/account/wallet?giftId=${encodeURIComponent(gift.id)}`}>
            Redeemed {date(gift.redeemedAt)} · {money(gift.amountPaisa)}
          </Link>
        </li>)}</ul> : <p>No redeemed gift cards.</p>}
        {nextGift ? <Link className="inline-flex min-h-11 items-center underline" href={
          `/account/wallet?beforeAt=${nextGift.redeemedAt}&beforeId=${encodeURIComponent(nextGift.id)}`
        }>Next 50 redeemed cards</Link> : null}
        {selectedGift ? <div id={'gift-record-'+selectedGift.id} className="space-y-3 border-t pt-4">
          <p className="break-all">Original gift card redemption: {selectedGift.id} · {money(selectedGift.amountPaisa)}</p>
          <h3 className="font-semibold">Redeemed card answers</h3>
          {history?.answers.length ? history.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)
            : <p>No saved answers for this redemption.</p>}
          {history?.nextCursor ? <Link className="inline-flex min-h-11 items-center underline" href={
            `/account/wallet?giftId=${encodeURIComponent(selectedGift.id)}&historyAt=${history.nextCursor.createdAt}&historyId=${encodeURIComponent(history.nextCursor.id)}`
          }>Next 50 answers</Link> : null}
        </div> : null}
      </section>
      <p id="referrals" className="text-sm"><Link href="/account/referrals" className="inline-flex min-h-11 items-center font-semibold text-[#a8232e] underline">Invite friends and earn credit</Link></p>
    </CustomerWallet>
  );
}
