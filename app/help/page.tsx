import { RegistrationGuide } from '@/components/seller/registration-guide';
import type { Metadata } from 'next';
import Link from 'next/link';
import { orderHelpTopics as topics } from '@/lib/content/help-topics';
import { SupportContactCard } from '@/components/support/support-contact-card';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = {
  alternates:{canonical:'https://hastabazaar.com/help'},
  title: 'Customer help',
  description: 'Shipping, tracking, returns, refunds, and complaint guidance for Hastabazaar orders.',
};

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main tabIndex={-1} id="main-content">
        <section className="border-b bg-secondary/30"><div className="shell py-12 sm:py-16"><p className="eyebrow">Customer care</p><h1 className="mt-3 font-heading text-5xl tracking-tight sm:text-6xl">Help with your order</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">Use your secure receipt for order-specific actions. The guidance below explains what to expect.</p></div></section>
        <section className="shell grid gap-5 py-12 sm:grid-cols-2 lg:py-16">
          {topics.map((topic, index) => (
            <article key={topic.id} id={topic.id} className="scroll-mt-28 rounded-3xl border bg-card p-6 sm:p-8">
              <p className="text-sm font-semibold text-primary">0{index + 1}</p>
              <h2 className="mt-3 font-heading text-3xl">{topic.title}</h2>
                <p className="mt-4 leading-7 text-muted-foreground">{topic.body}</p>
                {topic.id === 'tracking' ? <Link href="/track" className="mt-4 inline-block font-semibold underline underline-offset-4">Track an order</Link> : null}
                {topic.id === 'tracking' || topic.id === 'complaints' ? <Link href="/account/orders" className="mt-4 block font-semibold underline underline-offset-4">Open your signed-in order history →</Link> : null}
                {topic.id === 'returns' ? <p className="mt-4 text-sm leading-7">Use your secure receipt for guest aftercare. Signed-in customers can open <Link href="/account/refunds" className="font-semibold underline underline-offset-4">their own current refund updates</Link>.</p> : null}
                {topic.id === 'shipping' || topic.id === 'returns' ? <Link href={`/${topic.id}`} className="mt-4 inline-block font-semibold text-primary underline underline-offset-4">Read the full {topic.id === 'shipping' ? 'shipping' : 'return'} policy →</Link> : null}
            </article>
          ))}
        </section>
        <div className="shell pb-8"><RegistrationGuide /></div>
        <div className="shell pb-12"><SupportContactCard /><Link href="/contact-us" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Contact & support →</Link></div>
      </main>
      <SiteFooter compact />
    </div>
  );
}
