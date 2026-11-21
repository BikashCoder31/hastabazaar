import { env } from 'cloudflare:workers';
import { CircleHelp, CreditCard, Flag, Gift, Mail, MessageCircle, Package, Phone, Search, Truck, Undo2, UserRound, X } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { accountAction, accountSurface, touchTargets } from '@/components/account/account-sections';
import { HelpQuestionLinks } from '@/components/account/help-question-links';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { RegistrationGuide } from '@/components/seller/registration-guide';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
import { getCustomerReadContext } from '@/lib/auth/customer';
import { companyDetails, companyPublicContacts } from '@/lib/content/company-details';
import { requireDatabase } from '@/lib/db/d1';
import { phaseOneMarketplacePolicy } from '@/lib/marketplace/policy';
import { readCustomerOrderList } from '@/lib/orders/customer-order-list';
import { customerParcelState } from '@/lib/orders/customer-parcel-state';

export const metadata: Metadata = {
  alternates: { canonical: 'https://hastabazaar.com/help' },
  title: 'Help centre',
  description: 'Shipping, tracking, returns, refunds, and complaint guidance for Hastabazaar orders.',
};
export const dynamic = 'force-dynamic';

const topics = [
  { id: 'tracking', title: 'Delivery & tracking', description: 'Parcels, dates, tracking and missed deliveries', href: '#delivery', Icon: Truck },
  { id: 'paying', title: 'Paying', description: 'Cash on delivery, bank transfer, credit and promo codes', href: '#bank-transfer', Icon: CreditCard },
  { id: 'returns-topic', title: 'Returns & refunds', description: 'What’s covered, how long you have and where refunds go', href: '#returns', Icon: Undo2 },
  { id: 'cancellations', title: 'Cancelling', description: 'Cancel a seller’s parcel before it ships', href: '#cancelling', Icon: X },
  { id: 'account', title: 'Account & sign-in', description: 'Email codes, your mobile number and privacy', href: '#sign-in-help', Icon: UserRound },
  { id: 'rewards', title: 'Rewards, credit & gift cards', description: 'Points, referrals and shopping credit', href: '/account/wallet', Icon: Gift },
];

const returns = phaseOneMarketplacePolicy.value.returns;
const questions = [
  { id: 'returns', title: 'How long do I have to ask for a return?', answer: `For eligible items, ask within ${returns.generalRequestWindowDays} days of delivery, or ${returns.sealedGoodsWindowDays} days for goods supplied sealed if the seal is intact. The product page says whether change-of-mind returns apply. Damaged, faulty, wrong or not-as-described items are covered.`, href: '/returns', link: 'Read the return policy' },
  { id: 'delivery', title: 'Why did my order arrive in more than one parcel?', answer: 'Each seller sends their own parcel. Your order shows the delivery details and, for cash on delivery, how much to give the courier for each parcel.', href: '/track', link: 'Track an order' },
  { id: 'cancelling', title: 'Can I cancel an order?', answer: 'Open the order to see which seller parcels you can cancel before dispatch. For parcels that have already shipped, use Get help so we can review what is possible.', href: '/account/orders', link: 'Open My orders' },
  { id: 'missed-delivery', title: 'The courier missed me. What now?', answer: 'Check your parcel for the latest courier update. Use Get help with that parcel if you need to change the delivery address or ask about another attempt.', href: '/shipping', link: 'Read the delivery policy' },
  { id: 'bank-transfer', title: 'How do bank-transfer orders work?', answer: 'Open your order’s bank transfer page. It shows the verified payment instructions, reference and deadline for that order. Report your transfer there so we can check the payment before preparation begins.', href: '/account/orders', link: 'Open My orders' },
  { id: 'refunds', title: 'Where does my refund go?', answer: 'For approved cash refunds, we verify the bank details before sending money. Shopping credit used on an order goes back to your wallet when the refund is recorded. Check the request for your exact refund status.', href: '/account/refunds', link: 'View refund updates' },
  { id: 'sign-in-help', title: 'What if I can’t sign in?', answer: 'Use the email address on your account. You can use your password, ask for an email code or choose Google. If you need a new password, choose Forgot password. Sign-in codes are never sent by SMS.', href: '/login', link: 'Go to sign-in' },
  { id: 'complaints', title: 'How do I report an order problem?', answer: 'Open your order or secure receipt and choose Get help. For an unsafe item or an urgent concern, tell us what happened using the order help or contact form.', href: '/contact-us', link: 'Contact support' },
];

export default async function HelpPage({ searchParams }: { searchParams?: Promise<{ q?: string }> } = {}) {
  const [{ customer }, params] = await Promise.all([getCustomerReadContext(), searchParams]);
  const query = typeof params?.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const terms = query.toLowerCase().split(/\W+/).filter(word => word && !['my', 'the', 'a', 'an', 'i', 'to'].includes(word));
  const db = customer ? requireDatabase(env as unknown as { DB?: D1Database }) : null;
  const recent = customer && db ? await readCustomerOrderList(db, { id: customer.userId, authSubject: customer.authSubject }, 3) : [];
  const visibleQuestions = questions.filter(item => terms.every(term => (item.title + ' ' + item.answer).toLowerCase().includes(term)));
  const firstName = customer?.displayName.trim().split(/\s+/)[0];

  return (
    <div className="min-h-screen bg-[#f4eee2] text-[#14213d]">
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className={touchTargets + " min-w-0"}>
        <HelpQuestionLinks />
        <section className="bg-[#14213d] text-white">
          <div className="shell py-8 sm:py-10 lg:py-12">
            <h1 className="break-words font-heading text-4xl leading-tight sm:text-5xl">How can we help{firstName ? ', ' + firstName : ''}?</h1>
            <p className="mt-2 text-sm text-white/80 sm:text-base">Most answers start from your order. Pick one below, or search.</p>
            <search aria-label="Search help">
              <form data-form-id="public.help-search" action="/help" method="get" className="mt-4 flex min-w-0 max-w-2xl items-center gap-2 rounded-xl bg-white p-1 text-[#14213d] sm:gap-3">
                <Search className="ml-2 hidden size-4 shrink-0 text-[#465573] sm:block" aria-hidden="true" />
                <label className="sr-only" htmlFor="help-query">Search help</label>
                <input id="help-query" name="q" defaultValue={query} maxLength={100} type="search" placeholder="e.g. change my address, return items" className="min-h-11 min-w-0 flex-1 rounded-lg px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#14213d]" />
                <button type="submit" className="min-h-11 rounded-lg bg-[#a8232e] px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213d] sm:px-5">Search</button>
              </form>
            </search>
          </div>
        </section>

        <div className="shell space-y-8 py-7 sm:py-9">
          <section aria-labelledby="help-orders">
            <h2 id="help-orders" className="mb-3 text-xl font-semibold">Get help with a recent order</h2>
            {recent.length ? <ul className="grid gap-3 lg:grid-cols-3">{recent.map(order => {
              const question = order.questions[0];
              const parcel = order.parcels.find(parcel => parcel.sellerId === question?.sellerId)
                ?? order.parcels.find(parcel => !['delivered', 'cancelled', 'returned'].includes(parcel.status)) ?? order.parcels[0];
              const photo = parcel?.items.find(item => item.mediaId)?.mediaId;
              const state = customerParcelState({ status: parcel?.status ?? order.status,
                proposedDate: Boolean(question), bankDue: order.bankAction, bankReview: order.bankReview, codPending: order.firstCodPending });
              return <li key={order.id} className={accountSurface + ' flex min-w-0 items-start gap-3 p-3'}>
                {photo ? <Image src={'/api/product-media/' + encodeURIComponent(photo)} alt="" width={48} height={48} unoptimized className="size-11 shrink-0 rounded-lg object-cover" /> :
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#ebe1d1]"><Package className="size-5" aria-hidden="true" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold">{order.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-[#465573]">{state.label}</p>
                  <div className="mt-1"><CustomerActingChip actor={state.actor} /></div>
                </div>
                <Link href={'/orders/' + encodeURIComponent(order.orderNumber) + '#order-help'} className={accountAction + ' shrink-0'} aria-label={`Help with order ${order.orderNumber}`}>Help</Link>
              </li>;
            })}</ul> : <div className={accountSurface + ' flex min-w-0 flex-wrap items-center gap-3 p-3 text-sm'}>
              <span>{customer ? 'Your recent orders will appear here.' : 'Sign in to see your recent orders, or find an order with your checkout email.'}</span>
              <Link href={customer ? '/account/orders' : '/login?return_to=%2Fhelp'} className={accountAction}>{customer ? 'My orders' : 'Sign in'}</Link>
              <Link href="/track" className={accountAction}>Track an order</Link>
            </div>}
          </section>

          <section aria-labelledby="help-topics">
            <h2 id="help-topics" className="mb-3 text-xl font-semibold">Browse by topic</h2>
            <div className="grid gap-3 lg:grid-cols-3">
              {topics.map(({ id, title, description, href, Icon }) => (
                <a key={id} id={id} href={href} className={accountSurface + ' flex min-h-11 min-w-0 scroll-mt-32 items-start gap-3 p-4 hover:border-[#a8232e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8232e]'}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#ebe1d1] text-[#14213d]"><Icon className="size-5" aria-hidden="true" /></span>
                  <span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="block text-sm text-[#465573]">{description}</span></span>
                </a>
              ))}
            </div>
          </section>

          <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section aria-labelledby="help-questions">
              <h2 id="help-questions" className="mb-2 text-xl font-semibold">{query ? 'Help search results' : 'Common questions'}</h2>
              {query ? <p className="mb-2 wrap-anywhere text-sm text-[#465573]">{visibleQuestions.length ? `Results for “${query}”` : `No answers found for “${query}”. Try a shorter search or contact us.`}</p> : null}
              <div className="divide-y divide-[#e3d8c7] border-y border-[#e3d8c7]">
                {visibleQuestions.map(({ id, title, answer, href, link }) => (
                  <details key={id} id={id} data-help-question className="group min-w-0 scroll-mt-36" open={query ? true : undefined}>
                    <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-1 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#a8232e]">
                      {title}<span aria-hidden="true" className="group-open:hidden">+</span><span aria-hidden="true" className="hidden group-open:inline">−</span>
                    </summary>
                    <div className="px-1 pb-3 text-sm leading-6 text-[#465573]"><p>{answer}</p>
                      <Link href={href} className="inline-flex min-h-11 items-center font-semibold text-[#a8232e] underline">{link}</Link>
                    </div>
                  </details>
                ))}
              </div>
              <Link href="/shipping" id="shipping" className="inline-flex min-h-11 scroll-mt-28 items-center text-sm font-semibold text-[#a8232e] underline">Shipping and delivery policy</Link>
            </section>

            <aside className={accountSurface + ' min-w-0 p-4 sm:p-5'} aria-labelledby="still-need-help">
              <h2 id="still-need-help" className="text-lg font-semibold">Still need us?</h2>
              <div className="mt-3 grid min-w-0 gap-2">
                <a href={companyPublicContacts.whatsappUrl} target="_blank" rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-2 rounded-lg bg-[#14213d] px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8232e]">
                  <MessageCircle className="size-4 shrink-0" aria-hidden="true" /><span className="break-words">WhatsApp · {companyPublicContacts.supportPhone}</span>
                </a>
                <a href={'mailto:' + companyDetails.supportEmail} className={accountAction + ' justify-start text-left'}><Mail className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-all">{companyDetails.supportEmail}</span></a>
                <a href={'tel:' + companyPublicContacts.supportPhoneE164} className={accountAction + ' justify-start text-left'}>
                  <Phone className="size-4 shrink-0" aria-hidden="true" /> Call support
                </a>
              </div>
              <p className="mt-2 text-sm text-[#465573]">Include your order number and keep passwords, codes and PINs private.</p>
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-[#f7e2e1] p-3 text-sm text-[#7d2028]">
                <Flag className="mt-1 size-4 shrink-0" aria-hidden="true" />
                <div><h3 className="font-semibold">Safety or urgent concern?</h3><p>Tell us about an unsafe item or someone pretending to be Hastabazaar.</p>
                  <Link href="/contact-us#contact-form-heading" className="inline-flex min-h-11 items-center font-semibold underline focus-visible:outline-2">Report it now</Link>
                </div>
              </div>
              <Link href="/contact-us" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#a8232e] underline"><CircleHelp className="size-4" aria-hidden="true" /> Contact & support</Link>
            </aside>
          </div>
          <RegistrationGuide />
        </div>
      </main>
      <SiteFooter compact />
    </div>
  );
}
