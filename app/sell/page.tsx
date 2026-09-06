import type { Metadata } from 'next';
import { ClipboardCheck, FileCheck2, Store } from 'lucide-react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { SellerApplicationForm } from '@/components/seller/seller-application-form';

export const metadata: Metadata = {
  title: 'Sell with us',
  description:
    'Apply to become a verified seller on Hastabazaar, Nepal’s handmade marketplace.',
};

const steps = [
  {
    icon: Store,
    title: 'Tell us about your business',
    body: 'Share your registered identity, location, and the products you make or curate.',
  },
  {
    icon: FileCheck2,
    title: 'Provide verification',
    body: 'Upload registration, tax, and representative documents for private review.',
  },
  {
    icon: ClipboardCheck,
    title: 'Admin review',
    body: 'Approval is manual. Products will also be reviewed before they are published.',
  },
];

export default function SellPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="border-b border-border/70 bg-secondary/35">
          <div className="shell py-12 lg:py-16">
            <p className="eyebrow">For makers and craft businesses in Nepal</p>
            <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-end">
              <div>
                <h1 className="max-w-3xl font-heading text-5xl leading-[1.02] tracking-tight sm:text-6xl">
                  Bring your work to Hastabazaar.
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                  Apply once with your registered business details. No listing
                  goes live until the seller and products have been reviewed.
                </p>
              </div>
              <p className="rounded-2xl border border-border bg-background/80 p-5 text-sm leading-6 text-muted-foreground">
                Hastabazaar charges a 12% commission on the item subtotal after
                seller-funded discounts. There is no joining fee or buyer
                platform fee at launch.
              </p>
            </div>
          </div>
        </section>

        <section className="shell py-10 lg:py-14">
          <ol className="grid gap-px overflow-hidden rounded-3xl border border-border bg-border md:grid-cols-3">
            {steps.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="bg-card p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <Icon className="size-6 text-primary" aria-hidden="true" />
                  <span className="font-mono text-sm text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h2 className="mt-6 text-lg font-bold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="shell pb-20 lg:pb-28">
          <div className="mb-8 max-w-2xl">
            <p className="eyebrow">Seller application</p>
            <h2 className="mt-3 font-heading text-4xl tracking-tight">
              Start verification
            </h2>
          </div>
          <SellerApplicationForm />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
