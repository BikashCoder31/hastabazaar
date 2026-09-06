import type { Metadata } from 'next';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = {
  title: 'Customer help',
  description: 'Shipping, tracking, returns, refunds, and complaint guidance for Hathkriti orders.',
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
    body: 'Open the secure receipt link shown after checkout. It records each seller’s confirmation, packing, dispatch, and delivery history. Keep that private link safe because it provides guest access to the order.',
  },
  {
    id: 'returns',
    title: 'Returns & refunds',
    body: 'After delivery, open the secure receipt and choose the affected item. Eligibility is checked against the policy saved with that order. You can add a reason, preferred resolution, quantity, and supporting photos. Approved COD refunds are recorded and handled through the verified manual refund process.',
  },
  {
    id: 'complaints',
    title: 'Complaints',
    body: 'Open the secure order receipt to create an item-specific or order-level complaint. Hathkriti can assign, investigate, escalate, request more information, and record the resolution without exposing unnecessary customer details to a seller.',
  },
] as const;

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="border-b bg-secondary/30"><div className="shell py-12 sm:py-16"><p className="eyebrow">Customer care</p><h1 className="mt-3 font-heading text-5xl tracking-tight sm:text-6xl">Help with your order</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">Use your secure receipt for order-specific actions. The guidance below explains what to expect.</p></div></section>
        <section className="shell grid gap-5 py-12 sm:grid-cols-2 lg:py-16">
          {topics.map((topic, index) => (
            <article key={topic.id} id={topic.id} className="scroll-mt-28 rounded-3xl border bg-card p-6 sm:p-8">
              <p className="text-sm font-semibold text-primary">0{index + 1}</p>
              <h2 className="mt-3 font-heading text-3xl">{topic.title}</h2>
              <p className="mt-4 leading-7 text-muted-foreground">{topic.body}</p>
            </article>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
