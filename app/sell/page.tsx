import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import { ArrowRight, Building2, Check, ChevronDown, FileText, MapPin, TriangleAlert, UserRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getAuthenticatedUser, signInPath } from '@/app/auth';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { StartSellerRegistration } from '@/components/seller/start-seller-registration';
import { WhoseTurn } from '@/components/ui/whose-turn';
import { requireDatabase } from '@/lib/db/d1';
import { getEffectiveBusinessSetting, CommissionRateUnavailableError } from '@/lib/db/repositories/business-settings';
import { getCommissionSetting } from '@/lib/db/repositories/marketplace-settings';
import { getSellerCenterAccess } from '@/lib/db/repositories/seller-center-access';
import { mediaFrameClass, mediaObjectClass } from '@/lib/media/responsive-media';
import { maximumDocumentBytes } from '@/lib/sellers/application';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Sell with us',
  description: 'Apply to become a verified seller on Hastabazaar.',
};

const shell = 'mx-auto w-[calc(100%-2rem)] max-w-[1264px] md:w-[calc(100%-6rem)]';
const heading = 'font-heading text-[clamp(2.125rem,4vw,3rem)] font-medium leading-[1.05] tracking-tight';
const button = 'inline-flex min-h-11 max-w-full items-center justify-center gap-2.5 rounded-[10px] px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4';

const routes = [
  {
    audience: 'For makers and small workshops',
    name: 'Sell through Hastabazaar',
    description: 'You make and supply the products. Hastabazaar sells them and issues the customer’s invoice.',
    disclosure: 'Supplied by Mithila Craft House · Sold and invoiced by Hasta Bazaar Private Limited',
    requirements: [
      'Hastabazaar handles selling, invoicing and customer payments',
      'Managed Supplier/Maker Agreement',
      'Selling starts after a separate activation review',
    ],
  },
  {
    audience: 'For registered businesses',
    name: 'Registered business seller',
    description: 'Your registered business, including a sole proprietorship, is the seller and issues its own invoices.',
    disclosure: 'Sold by Mithila Craft House · Through Hastabazaar',
    requirements: ['Business registration and business PAN', 'Seller Marketplace Agreement'],
    caution: 'A personal PAN on its own doesn’t qualify',
  },
];

const needs = [
  { icon: FileText, title: 'Business registration and PAN', detail: 'Registered sellers only' },
  { icon: UserRound, title: 'Citizenship number', detail: 'Now or later' },
  { icon: MapPin, title: 'Pickup address', detail: 'Where couriers collect parcels' },
  { icon: Building2, title: 'Bank account', detail: 'Only before your first payout' },
];

const questions = [
  ['Do I need everything before I apply?', 'Submit with the details you have. You can add missing identity, tax and address details from your seller dashboard and Hastabazaar reviews them there.'],
  ['When do I add my bank account?', 'Add it before your first payout. Your application can be submitted and your products can be prepared before you add it.'],
  ['Can I sell made-to-order pieces?', 'Yes. Mark the product as made to order and enter how long it takes to prepare. Customers can see the expected dates before buying.'],
  ['Who delivers my parcels?', 'A courier collects from your pickup address after you mark the parcel ready. The courier collects cash on delivery from the customer.'],
  ['How do I know what happens next?', 'Your dashboard shows each step and whose turn it is. Updates also appear in Requests & help and your seller notifications.'],
] as const;

function ApplicationAction({ signedIn, started, sellerId, secondary = false }: {
  signedIn: boolean; started: boolean; sellerId?: string | null; secondary?: boolean;
}) {
  const style = button + (secondary
    ? ' bg-white text-[#14213D] hover:bg-[#F7F3EC] focus-visible:outline-white'
    : ' bg-[#A8232E] text-white hover:bg-[#881C27] focus-visible:outline-white');
  if (signedIn && !started) {
    return <StartSellerRegistration label="Start your application" className={style} />;
  }
  const href = sellerId ? '/seller' : started ? '/sell/apply' : signInPath('/sell');
  return <Link href={href} className={style}>
    {sellerId ? 'Open Seller Center' : 'Start your application'} <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
  </Link>;
}

export default async function SellPage() {
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const clock = await db.prepare("SELECT unixepoch('now') * 1000 AS now").first<{ now: number }>();
  const now = Number(clock?.now ?? 0);
  const [identity, commission, weekday] = await Promise.all([
    getAuthenticatedUser(),
    getCommissionSetting(db, now).catch(error => {
      if (error instanceof CommissionRateUnavailableError) return null;
      throw error;
    }),
    getEffectiveBusinessSetting(db, 'payout_processing_weekday', now).catch(error => {
      if (error instanceof CommissionRateUnavailableError) return null;
      throw error;
    }),
  ]);
  const owner = identity ? await getSellerCenterAccess(db, identity.userId) : null;
  const apply = { signedIn: Boolean(identity), started: Boolean(owner), sellerId: owner?.sellerId };
  const payoutDay = weekday ? weekday.value.slice(0, 1).toUpperCase() + weekday.value.slice(1) + 's' : null;
  const steps = [
    { title: 'Apply', detail: 'Fill in what you have. Your progress saves as you go.', person: 'You' },
    { title: 'Confirm your email', detail: 'Enter the code sent to the email you’ll use for seller updates.', person: 'You' },
    { title: 'Review', detail: 'Hastabazaar checks your details and documents, then approves.', person: 'Hastabazaar' },
    { title: 'Add products', detail: 'Draft them while you wait. Each one is reviewed before it goes live.', person: 'You' },
    { title: 'Orders arrive', detail: 'Prepare the parcel and mark it ready. A courier collects it.', person: 'You' },
    { title: 'Get paid', detail: payoutDay ? `After delivery and the applicable hold, payouts are scheduled for ${payoutDay}.` : 'Payouts are scheduled after delivery and the applicable hold.', person: 'Hastabazaar' },
  ];

  return (
    <div className="min-h-screen bg-[#F3EEE3] text-[#14213D]">
      <SiteHeader />
      <main tabIndex={-1} id="main-content">
        <section className="grid bg-[#14213D] text-white lg:grid-cols-2" aria-labelledby="sell-title">
          <div data-media-frame="cover" className={mediaFrameClass('cover', 'min-h-[18.75rem] bg-[#E8DDCB] lg:order-2 lg:min-h-[38rem]')}>
            <Image src="/homepage/maker-hands-hero.webp" alt="A maker shaping clay on a pottery wheel" fill priority
              sizes="(min-width: 1024px) 50vw, 100vw" data-media-mode="cover" className={mediaObjectClass('cover')} />
          </div>
          <div className="min-w-0 py-9 pr-4 pl-4 sm:py-12 md:pr-8 md:pl-6 lg:py-16 lg:pr-[clamp(2rem,4vw,3.5rem)] lg:pl-[max(3rem,calc((100vw-1264px)/2))]">
            <h1 id="sell-title" className="max-w-[13ch] font-heading text-[clamp(2.75rem,5.2vw,4.5rem)] font-medium leading-[1.02] tracking-tight">
              Bring your craft <em className="block text-[#E8BD6A] lg:inline">to all of Nepal.</em>
            </h1>
            <p className="mt-5 max-w-[33rem] text-base leading-relaxed text-[#D6DEED] md:text-lg">Apply with the details you have today. Hastabazaar reviews every seller and every product, couriers collect parcels from you, and cash on delivery is collected for you.</p>
            <div className="mt-6 flex flex-wrap items-start gap-3 max-[480px]:flex-col">
              <ApplicationAction {...apply} />
              <Link href="#how-it-works" className={button + ' border border-white/35 hover:border-white hover:bg-white/5'}>How it works</Link>
            </div>
            <dl className="mt-6 flex flex-wrap gap-x-5 gap-y-5 border-t border-white/20 pt-5 sm:gap-x-7">
              {commission ? <div><dt className="font-heading text-3xl">{commission.percent}%</dt><dd className="mt-1 text-sm text-[#D6DEED]">commission on registered<br className="sm:hidden" /> seller sales</dd></div> : null}
              {payoutDay ? <div><dt className="font-heading text-3xl">{payoutDay}</dt><dd className="mt-1 text-sm text-[#D6DEED]">payouts to your bank</dd></div> : null}
              <div><dt className="font-heading text-3xl">Pickup</dt><dd className="mt-1 text-sm text-[#D6DEED]">couriers collect from you</dd></div>
            </dl>
            <p className="mt-5 max-w-[28rem] text-sm leading-relaxed text-[#AABBDD]">Current commission and payout terms are shown in full before you accept them.</p>
          </div>
        </section>
        <section className={shell + ' py-12 md:py-[72px]'} aria-labelledby="ways-to-sell">
          <h2 id="ways-to-sell" className={heading}>Two ways <em className="text-[#A8232E]">to sell</em></h2>
          <p className="mt-2 max-w-2xl text-[#465573]">Choose the one that fits how your business is set up. If you’re unsure, pick the closest and Hastabazaar checks it with you during review.</p>
          <div className="mt-7 grid gap-5 lg:grid-cols-2">
            {routes.map((route, index) => <article key={route.name} className={`min-w-0 rounded-[22px] border border-[#E4DACA] p-6 md:p-7 ${index === 0 ? 'bg-white' : 'bg-[#FCF9F4]'}`}>
              <p className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${index === 0 ? 'bg-[#F1E3BC] text-[#765317]' : 'bg-[#E3E9F4] text-[#264880]'}`}>{route.audience}</p>
              <h3 className="mt-3 font-heading text-[clamp(1.75rem,3vw,2.25rem)] leading-tight">{route.name}</h3>
              <p className="mt-2 leading-relaxed text-[#465573]">{route.description}</p>
              <p className="mt-4 rounded-xl bg-[#F3EEE3] p-3.5 text-sm">On your listings <strong>{route.disclosure}</strong></p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {route.requirements.map(requirement => <li key={requirement} className="flex items-start gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-[#236548]" aria-hidden="true" />{requirement}</li>)}
                {route.caution ? <li className="flex items-start gap-2.5"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#875913]" aria-hidden="true" />{route.caution}</li> : null}
              </ul>
            </article>)}
          </div>
        </section>
        <section id="how-it-works" className="scroll-mt-44 bg-white py-12 md:py-[72px]" aria-labelledby="seller-steps">
          <div className={shell}>
            <h2 id="seller-steps" className={heading}>From application <em className="text-[#A8232E]">to first payout</em></h2>
            <p className="mt-2 text-[#465573]">Each step shows who acts next, so you always know whether it’s waiting on you.</p>
            <ol className="mt-7 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {steps.map((step, index) => <li key={step.title} className="flex min-w-0 flex-col items-start rounded-[18px] border border-[#E4DACA] bg-white p-4 md:p-5">
                <span className="font-heading text-3xl text-[#A8232E]" aria-hidden="true">{index + 1}</span>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mt-2 mb-4 flex-1 text-sm leading-relaxed text-[#465573]">{step.detail}</p>
                <WhoseTurn status={step.person === 'You' ? 'your-turn' : index === steps.length - 1 ? 'done' : 'with-hastabazaar'} label={step.person} />
              </li>)}
            </ol>
          </div>
        </section>
        <section className={shell + ' py-12 md:py-[72px]'} aria-label="Application requirements and questions">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className={heading}>What you&apos;ll <em className="text-[#A8232E]">need</em></h2>
              <p className="mt-2 text-[#465573]">You can submit without all of it and add the rest from your seller dashboard.</p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {needs.map(({ icon: Icon, title, detail }) => <li key={title} className="flex min-w-0 items-start gap-3 rounded-[14px] border border-[#E4DACA] bg-white p-4"><Icon className="mt-0.5 size-4 shrink-0 text-[#A8232E]" aria-hidden="true" /><div className="min-w-0"><strong className="block text-sm">{title}</strong><span className="mt-1 block text-sm text-[#665B4D]">{detail}</span></div></li>)}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-[#665B4D]">Documents stay private. PDF, JPG or PNG files can be up to {maximumDocumentBytes / (1024 * 1024)} MB each. Check the <Link href="/prohibited-products" className="inline-flex min-h-11 items-center font-semibold text-[#A8232E] underline underline-offset-2">prohibited &amp; restricted products policy</Link> first.</p>
            </div>
            <div>
              <h2 className={heading}>Questions</h2>
              <div className="mt-6 divide-y divide-[#E4DACA] border-y border-[#E4DACA]">
                {questions.map(([question, answer], index) => <details key={question} open={index === 0} className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3.5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">{question}<ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden="true" /></summary>
                  <p className="pb-5 text-sm leading-relaxed text-[#465573]">{answer}</p>
                </details>)}
              </div>
            </div>
          </div>
          <div id="seller-application" className="mt-12 flex scroll-mt-44 flex-wrap items-center justify-between gap-5 rounded-[24px] bg-[#A8232E] p-7 text-white md:p-10">
            <div>
              <h2 className="font-heading text-4xl leading-tight">Ready when you are.</h2>
              <p className="mt-1 text-[#F9E4E6]">Start now and finish later.</p>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-2.5">
              <ApplicationAction {...apply} secondary />
              {!owner?.sellerId ? <Link href="/seller" className={button + ' border border-white/55 hover:bg-white/10 focus-visible:outline-white'}>Already applied? Open Seller Center</Link> : null}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
