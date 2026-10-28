import Link from 'next/link';
import { CompanyDisclosure } from '@/components/layout/company-disclosure';
import { companyDetails } from '@/lib/content/company-details';
import { ArrowRight, FileText } from 'lucide-react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { LEGAL_POLICY_DATE_LABEL, publicLegalPolicyNavigation } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/legal' },
  title: 'Legal & Policies',
  description:
    'Find policies about shopping, selling, delivery and personal information on Hastabazaar.',
};

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main-content">
        <section className="border-b bg-secondary/30">
          <div className="shell py-12 sm:py-16">
            <h1 className="mt-3 max-w-4xl font-heading text-5xl tracking-tight sm:text-6xl">
              Legal & Policies
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
              Find the policies that explain shopping, selling, delivery and
              personal information on Hastabazaar.
            </p>
          <p className="mt-4 text-sm text-muted-foreground">Updated {LEGAL_POLICY_DATE_LABEL} · Nepal time</p>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            Questions about our policies? Contact{' '}
            <a
              href={`mailto:${companyDetails.supportEmail}`}
              className="font-semibold text-primary underline underline-offset-4"
            >
              {companyDetails.supportEmail}
            </a>
            .
          </p>
          </div>
        </section>
        <section className="shell py-10 sm:py-14">
          <div className="mb-8"><CompanyDisclosure /></div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {publicLegalPolicyNavigation.map((policy) => (
              <Link
                key={policy.key}
                href={policy.href}
                className="group flex flex-col rounded-3xl border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <FileText className="size-6 text-primary" aria-hidden="true" />
                <h2 className="mt-5 font-heading text-2xl">{policy.title}</h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  {policy.description}
                </p>
                <span className="mt-auto inline-flex items-center gap-2 pt-6 font-semibold text-primary">
                  Read full document{' '}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-5 text-sm">
            <Link href="/referral-terms" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Referral terms</Link>
            <Link href="/seller-agreement" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Seller agreement · sign-in required</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
