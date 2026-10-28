import type { Metadata } from 'next';
import { CustomerContactForm } from '@/components/layout/customer-contact-form';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = {
  title: 'Share your feedback',
  description: 'Share feedback about your Hastabazaar experience.',
  alternates: { canonical: 'https://hastabazaar.com/feedback' },
};

export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main-content">
        <section className="border-b bg-secondary/30">
          <div className="shell py-12 sm:py-16">
            <p className="eyebrow">Help us improve</p>
            <h1 className="mt-3 font-heading text-5xl tracking-tight sm:text-6xl">
              Share your feedback
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
              Tell us what worked, what did not, or what you would like
              Hastabazaar to improve.
            </p>
          </div>
        </section>
        <section className="shell max-w-4xl py-12 sm:py-16">
          <CustomerContactForm kind="feedback" />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
