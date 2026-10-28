import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Careers and opportunities at Hastabazaar.',
};

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main-content" className="shell py-16">
        <p className="eyebrow">About</p>
        <h1 className="mt-3 font-heading text-5xl">Careers at Hastabazaar</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
          There are no open roles listed right now. For future opportunities,
          contact the Hastabazaar team with a short introduction.
        </p>
        <Link href="/contact-us" className="section-link mt-6">
          Contact us →
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
