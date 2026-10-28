import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowUpRight,
  PackageSearch,
  Store,
  BookOpen,
  Mail,
} from 'lucide-react';
import { CustomerContactForm } from '@/components/layout/customer-contact-form';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { SupportContactCard } from '@/components/support/support-contact-card';
import { companyDetails } from '@/lib/content/company-details';

const supportRoutes = [
  {
    href: '/track',
    icon: PackageSearch,
    title: 'Track your order',
    description: 'Check progress with your order number and email.',
  },
  {
    href: '/help',
    icon: BookOpen,
    title: 'Browse the help guides',
    description: 'Delivery, payments, returns and more.',
  },
  {
    href: '/sell',
    icon: Store,
    title: 'Grow with Hastabazaar',
    description: 'Explore ways to sell your handmade work.',
  },
];

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Contact Hastabazaar customer support.',
  alternates: { canonical: 'https://hastabazaar.com/contact-us' },
};

export default function ContactUsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main-content">
        <section className="border-b bg-secondary/30">
          <div className="shell py-10 sm:py-12">
            <p className="eyebrow">Here for shoppers & makers</p>
            <h1 className="mt-3 font-heading text-5xl tracking-tight sm:text-6xl">
              Contact us
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
              A question about something handmade? An order that needs a little
              attention? Let’s find the right help for you.
            </p>
          </div>
        </section>
        <section className="shell grid items-start gap-10 py-10 sm:py-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)] lg:gap-12">
          <div className="min-w-0">
            <SupportContactCard />
            <nav aria-label="Find the right support" className="mt-7">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                A few useful shortcuts
              </h2>
              <div className="divide-y rounded-2xl border bg-card px-4">
                {supportRoutes.map(
                  ({ href, icon: Icon, title, description }) => (
                    <Link
                      key={href}
                      href={href}
                      className="group flex items-start gap-3 py-4"
                    >
                      <Icon
                        className="mt-0.5 size-5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold group-hover:underline">
                          {title}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {description}
                        </span>
                      </span>
                      <ArrowUpRight
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  ),
                )}
              </div>
            </nav>
            <a
              href={`mailto:${companyDetails.supportEmail}`}
              className="mt-5 inline-flex min-h-11 items-center gap-2 break-all text-sm text-primary underline underline-offset-4"
            >
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              {companyDetails.supportEmail}
            </a>
          </div>
          <section aria-labelledby="contact-form-heading" className="min-w-0">
            <h2 id="contact-form-heading" className="font-heading text-3xl">
              Send us a message
            </h2>
            <p className="mb-5 mt-2 text-sm leading-7 text-muted-foreground">
              Tell us what you need help with and leave an email for our reply.
              For an existing order, your secure receipt is the best place to
              share private details.
            </p>
            <CustomerContactForm kind="contact" />
          </section>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
