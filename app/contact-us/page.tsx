import type { Metadata } from 'next';
import { CustomerContactForm } from '@/components/layout/customer-contact-form';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Contact HastaBazaar customer support.',
  alternates: { canonical: 'https://hastabazaar.com/contact-us' },
};

export default function ContactUsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main-content">
        <section className="border-b bg-secondary/30">
          <div className="shell py-12 sm:py-16">
            <p className="eyebrow">Customer support</p>
            <h1 className="mt-3 font-heading text-5xl tracking-tight sm:text-6xl">
              Contact us
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
              Send a product, order, delivery, return, or seller-support
              question to the HastaBazaar team.
            </p>
          </div>
        </section>
        <section className="shell max-w-4xl py-12 sm:py-16">
          <CustomerContactForm kind="contact" />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
