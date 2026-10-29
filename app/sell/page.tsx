import type { Metadata } from 'next';
import { getAuthenticatedUser } from '@/app/auth';
export const dynamic = 'force-dynamic';
import { ClipboardCheck, FileCheck2, Store } from 'lucide-react';
import Link from 'next/link';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { StartSellerRegistration } from '@/components/seller/start-seller-registration';
import { SellerRegistrationVideo } from '@/components/seller/seller-registration-video';
import { getSellerTermsViewer } from '@/lib/auth/seller-commercial-access';

export const metadata: Metadata = {
  title: 'Sell with us',
  description:
    'Apply to become a verified seller on Hastabazaar.',
};

const steps = [
  {
    icon: Store,
    title: 'Choose the applicable route',
    body: 'Choose Sell through Hastabazaar for reviewed company supply, or Registered business seller for your registered business, including a sole proprietorship.',
  },
  {
    icon: FileCheck2,
    title: 'Submit now, complete details later',
    body: 'Add the details you have and submit your application. Complete missing identity, tax and address information from your dashboard for review. Bank details can be added later before payouts.',
  },
  {
    icon: ClipboardCheck,
    title: 'Admin review',
    body: 'Approval is manual. Products will also be reviewed before they are published.',
  },
];

export default async function SellPage() {
  const [identity, viewer] = await Promise.all([getAuthenticatedUser(), getSellerTermsViewer()]);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main tabIndex={-1} id="main-content">
        <section className="border-b border-border/70 bg-secondary/35">
          <div className="shell py-12 lg:py-16">
            <p className="eyebrow">For makers and craft businesses in Nepal</p>
            <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-end">
              <div>
                <h1 className="max-w-3xl font-heading text-5xl leading-[1.02] tracking-tight sm:text-6xl">
                  Bring your work to Hastabazaar.
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                  Established businesses and individual makers share one maker-profile foundation. No listing goes live until the applicable program, maker, and product requirements are approved.
                </p>
              </div>
              <p className="rounded-2xl border border-border bg-background/80 p-5 text-sm leading-6 text-muted-foreground">
                <strong>Registered Seller terms are separate from Managed Maker selling agreements.</strong>{' '}
                Sign in and explicitly start seller registration to review the current terms for your route before applying. Application approval does not activate live selling.
              </p>
            </div>
          </div>
        </section>

        <section className="shell py-10 lg:py-14">
          <div className="mb-8 grid gap-5 md:grid-cols-2">
            <article className="rounded-2xl border bg-card p-6"><h2 className="font-heading text-2xl">Sell through Hastabazaar</h2><p className="mt-3 text-sm leading-6">For individual makers and suppliers without business PAN, subject to legal/accounting clearance. Hasta Bazaar Private Limited must genuinely be the seller and invoice issuer. Personal PAN and ID do not waive registration or tax duties, or permit use of the company PAN.</p><p className="mt-3 text-sm leading-6">Public example: Mithila Craft House · Supplied by Mithila Craft House · Sold and invoiced by Hasta Bazaar Private Limited.</p><p className="mt-3 text-sm font-semibold">Applications are Under review. Commercial activation remains blocked until required clearance is documented.</p></article>
            <article className="rounded-2xl border bg-card p-6"><h2 className="font-heading text-2xl">Registered business seller</h2><p className="mt-3 text-sm leading-6">For registered sole proprietors, firms, companies and organisations with business PAN. A limited company is not required. Provide applicable registration, business PAN, VAT details where applicable, authorised representative ID, bank and pickup/return details, and accept the seller agreement.</p><p className="mt-3 text-sm leading-6">Public example: Sold by Mithila Craft House · Through Hastabazaar. The business remains the legal seller and invoice issuer for its own sales.</p><p className="mt-3 text-sm font-semibold">Personal PAN alone does not qualify. Staff review and Super Admin approval are required.</p></article>
          </div>
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

        <section id="seller-application" aria-labelledby="seller-application-heading" className="shell scroll-mt-44 pb-20 lg:pb-28">
          <div className="mb-8 max-w-2xl">
            <p className="eyebrow">Seller application</p>
            <h2 id="seller-application-heading" className="mt-3 font-heading text-4xl tracking-tight">
              Start verification
            </h2>
          </div>
          <p className="mb-5 max-w-2xl text-muted-foreground">Registration fields are optional at submission. Your progress saves to your account, and you can complete missing details from your dashboard. Verify your account email before submitting; phone OTP is not required.</p>
          <div className="mb-6 max-w-2xl"><SellerRegistrationVideo /></div>
          {viewer ? <Link href="/sell/apply" className="inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">Continue seller registration</Link>
            : identity ? <StartSellerRegistration />
            : <Link href="/login?return_to=%2Fsell" className="inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">Sign in to start seller registration</Link>}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
