import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = {
  alternates:{canonical:'https://hastabazaar.com/help'},
  title: 'Customer help',
  description: 'Shipping, tracking, returns, refunds, and complaint guidance for HastaBazaar orders.',
};

const topics = [
  {
    id: 'shipping',
    title: 'Shipping',
    body: 'Delivery availability and charges are confirmed during checkout from the Nepal address you provide. Orders may contain separate seller shipments, while your order total and receipt remain unified.',
  },
  {
    id: 'tracking',
    title: 'Track an order',
      body: 'Use Track an order with your order number and the email used at checkout. You can see preparation, dispatch, and delivery progress without signing in. Order emails also link to tracking. For cancellations, returns, or full details, use your secure receipt or sign in to My orders.',
  },
  {
    id: 'returns',
    title: 'Returns & refunds',
    body: 'After delivery, open the secure receipt and choose the affected item. Eligibility is checked against the policy saved with that order. You can add a reason, preferred resolution, quantity, and supporting photos. Approved COD refunds are recorded and handled through the verified manual refund process.',
  },
  {
    id: 'complaints',
    title: 'Complaints',
    body: 'Open the secure order receipt to create an item-specific or order-level complaint. HastaBazaar can assign, investigate, escalate, request more information, and record the resolution without exposing unnecessary customer details to a seller.',
  },
] as const;

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
                {topic.id === 'shipping' || topic.id === 'returns' ? <Link href={`/${topic.id}`} className="mt-4 inline-block font-semibold text-primary underline underline-offset-4">Read the full {topic.id === 'shipping' ? 'shipping' : 'return'} policy →</Link> : null}
            </article>
          ))}
        </section>
        <div className="shell pb-12"><Link href="/contact" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Contact & support →</Link></div>
      </main>
      <SiteFooter />
    </div>
  );
}
